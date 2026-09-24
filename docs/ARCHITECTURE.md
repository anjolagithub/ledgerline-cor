# Architecture

This describes the contracts as they exist in `contracts/src/` and
`stylus/` today, and how they're actually wired in the live Robinhood
Chain testnet deployment (`contracts/script/DeployTestnetRealV2.s.sol`).
Nothing here describes planned-but-unbuilt behavior.

## Contract graph

```
                     ┌─────────────────────────┐
                     │   LedgerLineRegistry     │   state of record
                     │  AssetState per assetId  │
                     │  Position per (assetId,  │
                     │              positionId) │
                     └───────────▲──────────────┘
                                 │ getAssetState / getPosition (view)
                                 │ setPosition (onlyPositionWriter)
                     ┌───────────┴──────────────┐
                     │    LedgerLinePolicy       │   decision layer
                     │  canExecute(assetId,      │   (stateless per call;
                     │    positionId, action,    │    holds only immutable-
                     │    amount) -> Response    │    ish refs to the three
                     └───────────┬──────────────┘    contracts above/below)
                     staticcall  │  staticcall
              ┌──────────────────┴──────────────────┐
              ▼                                      ▼
   ┌────────────────────┐               ┌─────────────────────────┐
   │  PositionEngine     │               │      RiskEngine          │
   │  (Stylus / Rust)    │               │      (Stylus / Rust)     │
   │  computePositionValue│              │  computeBorrowingCapacity│
   └────────────────────┘               └─────────────────────────┘

        called by, independently:

┌───────────────────────────┐         ┌───────────────────────────┐
│ LedgerLineLendingAdapter   │◄────────│  LedgerLineVaultAdapter    │
│ - real collateral custody  │ release │  - no token custody        │
│ - debt accounting          │Collateral│  - calls Policy itself     │
│ - Action.BORROW            │         │  - Action.WITHDRAW         │
│                            │         │  - own debt-safety check   │
└───────────────────────────┘         └───────────────────────────┘
             ▲
             │ transferPosition
             │ (no tokens move)
┌───────────────────────────┐
│ LedgerLineTransferAdapter  │
│  - no token custody        │
│  - calls Policy itself     │
│  - Action.TRANSFER         │
│  - own, stricter debt check│
└───────────────────────────┘

┌───────────────────────────┐   (deployed, NOT wired into the
│ RobinhoodStockTokenAdapter │    live Registry-read path —
│ implements IAssetStateAdapter│  see docs/INTEGRATIONS.md)
└───────────────────────────┘
```

## The Solidity / Stylus boundary

`LedgerLinePolicy` is Solidity. `PositionEngine` and `RiskEngine` are
Arbitrum Stylus contracts — Rust compiled to WASM, deployed as regular
onchain contracts that Solidity calls through a plain interface
(`IPositionEngine`, `IRiskEngine`) exactly as it would call another
Solidity contract. Both engines are `view`/stateless: no persistent
storage, pure fixed-point arithmetic over `U256`, `checked_mul`
throughout (no unchecked math anywhere in either engine), returning
`Result::Err` rather than panicking on overflow
(`stylus/position-engine/src/lib.rs`, `stylus/risk-engine/src/lib.rs`).

Because Foundry's EVM test environment cannot execute Stylus/WASM
contracts directly, the Solidity test suite (`LedgerLineDemo.t.sol`,
`LedgerLineFuzz.t.sol`, `LedgerLineVaultAdapter.t.sol`,
`LedgerLineDecimalScaling.t.sol`) exercises `StubPositionEngine` /
`StubRiskEngine` — small Solidity contracts implementing the identical
`IPositionEngine`/`IRiskEngine` interfaces with the identical
formulas. This tests everything built on top of the engines
end-to-end; the engines' own math is separately unit- and
property-tested in Rust (`#[cfg(test)]` and `proptest!` blocks in each
`lib.rs`).

## Contracts

### `LedgerLineRegistry`
The single state store. Holds two mappings: `AssetState` per `assetId`
(`price`, `multiplier`, `lifecycle`, `collateralFactorBps`,
`riskAdjustmentBps`) and `Position` (`rawBalance`) per
`(assetId, positionId)`. `positionId` is an opaque `uint256` chosen by
the calling consumer (in practice `uint256(uint160(userAddress))`) —
Registry has no concept of "users" or debt, which is what keeps it
consumer-agnostic. Asset-state writes (`initializeAsset`,
`updateAssetParameters`, `transitionLifecycle`) are `onlyOwner`.
Position writes (`setPosition`) are gated to a single configured
`positionWriter` address, itself settable only by the owner — in the
live deployment this is `LedgerLineLendingAdapter`. Lifecycle
transitions are checked against a fixed, hardcoded graph
(`_isValidTransition`) rather than being freely settable.

### `LedgerLinePolicy`
Holds references to `registry`, `positionEngine`, `riskEngine` (set
once in the constructor; no setter exists). `canExecute()` reads
`AssetState` and `Position` from Registry, short-circuits to `BLOCK`
if lifecycle isn't `ACTIVE`, branches on `Action.WITHDRAW` and
`Action.TRANSFER` (both lifecycle only, structurally identical, see
`docs/POLICY.md`), and otherwise (BORROW) calls `PositionEngine` then
`RiskEngine` to derive a capacity and compare it against the requested
`amount`. Policy never writes state anywhere, never moves funds, and
never reads debt for any action — each consumer that needs debt
awareness (`LendingAdapter` for BORROW, `VaultAdapter` for WITHDRAW,
`TransferAdapter` for TRANSFER) enforces that itself.

### `LedgerLineLendingAdapter`
The first reference consumer. Holds real ERC-20 custody: `deposit()`
pulls `collateralToken` via `safeTransferFrom` and records the raw
balance in Registry (as the configured `positionWriter`); `borrow()`
calls `Policy.canExecute`, additionally checks the caller's *own*
`debt` mapping against `permittedAmount` (Policy alone only sees the
newly requested amount, not existing debt — see `docs/POLICY.md`), and
transfers `borrowToken` scaled to its real onchain decimals. Also
exposes `releaseCollateral()` and `transferPosition()`, both callable
only by addresses on its own `isAuthorizedReleaser` allowlist (set by
the owner, reused across both — the trust boundary is identical even
though `transferPosition()` moves no tokens) — this is how a second
and third consumer can mutate already-custodied collateral/positions
without duplicating custody logic.

### `LedgerLineVaultAdapter`
The second reference consumer. Holds no tokens itself. `withdraw()`
checks the position exists and the request doesn't exceed the caller's
raw balance, calls `Policy.canExecute` with `Action.WITHDRAW`, and —
only on a non-`BLOCK` decision — reads `LendingAdapter.debt(msg.sender)`
directly and, if any debt exists, reverts with
`WouldUnderCollateralizeDebt` unless the position's *remaining*
borrowing capacity after the withdrawal would still cover it. Only
then does it call `LendingAdapter.releaseCollateral()` to actually
move funds. It has no owner and no access-control modifiers of its
own; its only privileged relationship is being on `LendingAdapter`'s
releaser allowlist.

### `LedgerLineTransferAdapter`
The third reference consumer, and the first with a custody mechanic
genuinely different from the other two: it moves no tokens at all.
`transfer(to, amount)` checks the position exists and the request
doesn't exceed the caller's raw balance, calls `Policy.canExecute`
with `Action.TRANSFER`, and — only on a non-`BLOCK` decision — reads
`LendingAdapter.debt(msg.sender)` directly and reverts with
`OutstandingDebtBlocksTransfer` if that debt is anything above zero at
all (stricter than `VaultAdapter`'s remaining-capacity check, since
collateral changing owners invalidates whatever LTV math applied to
the original owner's debt — there is nothing to recompute). Only then
does it call `LendingAdapter.transferPosition()`, which reassigns
`rawBalance` from the caller's `positionId` to `to`'s in `Registry` —
the collateral itself never leaves `LendingAdapter`'s custody. Like
`VaultAdapter`, it has no owner and no access-control modifiers of its
own; its only privileged relationship is being on `LendingAdapter`'s
releaser allowlist.

### `RobinhoodStockTokenAdapter`
Implements `IAssetStateAdapter` (`getAssetState(assetId) -> AssetState`)
against the real Robinhood Stock Token (`uiMultiplier()`,
`oraclePaused()`) and a Chainlink-style `AggregatorV3Interface` price
feed plus an optional L2 sequencer-uptime feed. It is deployed on the
live testnet, but **nothing in the live path calls it** — see
`docs/INTEGRATIONS.md` for why, and for a real limitation in how it's
currently configured.

## Data flow, end to end (BORROW)

1. User calls `LendingAdapter.deposit(amount)` → `safeTransferFrom` →
   `Registry.setPosition` (raw balance recorded).
2. User calls `LendingAdapter.borrow(amount)`.
3. Adapter calls `Policy.canExecute(assetId, positionId, BORROW, amount)`.
4. Policy calls `Registry.getAssetState` + `getPosition`, then
   `PositionEngine.computePositionValue` and
   `RiskEngine.computeBorrowingCapacity`, and returns a decision.
5. Adapter reverts on `BLOCK`, or on `debt + amount > permittedAmount`;
   otherwise updates `debt` and transfers `borrowToken` (decimal-scaled).

## Data flow, end to end (WITHDRAW)

1. User calls `VaultAdapter.withdraw(amount)`.
2. VaultAdapter reads the position directly from `Registry` and calls
   `Policy.canExecute(assetId, positionId, WITHDRAW, amount)`.
3. Policy returns `ALLOW` (full position) if lifecycle is `ACTIVE`, or
   `BLOCK` otherwise — capacity is never computed for this action.
4. On non-`BLOCK`, VaultAdapter reads `LendingAdapter.debt(msg.sender)`
   directly. If debt is `0`, it proceeds immediately. If debt is
   nonzero, it recomputes the position's remaining value/capacity as
   of *after* this withdrawal (via `PositionEngine`/`RiskEngine`
   again) and reverts with `WouldUnderCollateralizeDebt` unless that
   remaining capacity still covers the existing debt.
5. Only then does VaultAdapter call `LendingAdapter.releaseCollateral`,
   which updates the shared `Registry` position and transfers
   `collateralToken` back to the user.

## Data flow, end to end (TRANSFER)

1. User calls `TransferAdapter.transfer(to, amount)`.
2. TransferAdapter reads the position directly from `Registry` and
   calls `Policy.canExecute(assetId, positionId, TRANSFER, amount)`.
3. Policy returns `ALLOW` (full position) if lifecycle is `ACTIVE`, or
   `BLOCK` otherwise — capacity is never computed for this action
   either.
4. On non-`BLOCK`, TransferAdapter reads `LendingAdapter.debt(msg.sender)`
   directly and reverts with `OutstandingDebtBlocksTransfer` if that
   debt is anything above zero — no recomputation, unlike WITHDRAW's
   check above.
5. Only then does TransferAdapter call `LendingAdapter.transferPosition`,
   which decreases the caller's `rawBalance` and increases `to`'s by
   the same amount in `Registry` — no token transfer occurs anywhere
   in this flow.

## State ownership

| State | Owner contract | Written by |
|---|---|---|
| `AssetState` (price, multiplier, lifecycle, bps) | `LedgerLineRegistry` | contract owner only |
| `Position.rawBalance` | `LedgerLineRegistry` | the configured `positionWriter` only (`LedgerLineLendingAdapter`) |
| `debt[user]` | `LedgerLineLendingAdapter` | the adapter itself, in `borrow()` |
| `isAuthorizedReleaser[addr]` | `LedgerLineLendingAdapter` | contract owner only |
| Nothing | `LedgerLineVaultAdapter` | — it is stateless besides its immutable contract references |
| Nothing | `LedgerLineTransferAdapter` | — it is stateless besides its immutable contract references |
| Nothing | `LedgerLinePolicy` | — stateless besides its immutable-in-practice contract references |

## Dependency graph (imports)

- `LedgerLinePolicy` → `ILedgerLineRegistry`, `IPositionEngine`, `IRiskEngine`
- `LedgerLineLendingAdapter` → `ILedgerLineRegistry`, `ILedgerLinePolicy`, OpenZeppelin `IERC20`/`IERC20Metadata`/`SafeERC20`/`Ownable`
- `LedgerLineVaultAdapter` → `ILedgerLineRegistry`, `ILedgerLinePolicy`, `LedgerLineLendingAdapter` (concrete, for `releaseCollateral`)
- `LedgerLineTransferAdapter` → `ILedgerLineRegistry`, `ILedgerLinePolicy`, `LedgerLineLendingAdapter` (concrete, for `transferPosition`)
- `RobinhoodStockTokenAdapter` → `IAssetStateAdapter`, `IRobinhoodStockToken`, `AggregatorV3Interface` (Chainlink-shaped), OpenZeppelin `Ownable`
- All shared types/enums/errors live in `contracts/src/interfaces/LedgerLineTypes.sol`

## Agent-facing intent layer

CortexRails Protocol's public framing is "policy infrastructure for
autonomous finance" -- an autonomous agent or protocol should be able to
propose an action and get the same deterministic decision a human-driven
frontend gets, through the same policy core:

```
Autonomous Agent
      ↓
   Intent
      ↓
CortexRails Policy (LedgerLinePolicy.canExecute -- unmodified)
      ↓
ALLOW / LIMIT / REVIEW / BLOCK
      ↓
Financial Adapter (LendingAdapter / VaultAdapter / TransferAdapter)
      ↓
Onchain execution
```

**The agent proposes the action. CortexRails determines whether the
action is permitted.** Two thin, non-authoritative wrappers exist purely
to translate a structured intent into that same real `canExecute()` call
-- neither one computes risk, capacity, or any economic result itself:

- `sdk/src/agent.ts` (`evaluateAgentIntent`, `suggestRetryIntent`) --
  resolves a human-readable intent (asset symbol, position, action,
  amount) into the real onchain `canExecute` call via `LedgerLineClient`,
  and decodes the response back to human units. The `reason` returned is
  the real, unmodified `bytes32` constant the contract defines (e.g.
  `EXCEEDS_CAPACITY`) -- never a second, invented reason vocabulary.
- `frontend/lib/agentIntent.ts` -- the same translation, called directly
  via wagmi against the live `LedgerLinePolicy` contract, powering the
  Policy Console's "Agent Intent → Policy → Execution" demo section
  (`frontend/components/AgentDemo.tsx`).

Both wrappers are read-only translation only; the actual state-changing
execution step goes through the exact same wallet-connected write flow
(`useTransactionFlow` / `LendingAdapter.borrow()`) every other action on
this frontend already uses -- no new signer, no new custody path.

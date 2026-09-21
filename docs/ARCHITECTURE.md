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
└───────────────────────────┘         └───────────────────────────┘

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
if lifecycle isn't `ACTIVE`, branches on `Action.WITHDRAW` (lifecycle
only, see `docs/POLICY.md`), and otherwise calls `PositionEngine` then
`RiskEngine` to derive a capacity and compare it against the requested
`amount`. Policy never writes state anywhere and never moves funds.

### `LedgerLineLendingAdapter`
The first reference consumer. Holds real ERC-20 custody: `deposit()`
pulls `collateralToken` via `safeTransferFrom` and records the raw
balance in Registry (as the configured `positionWriter`); `borrow()`
calls `Policy.canExecute`, additionally checks the caller's *own*
`debt` mapping against `permittedAmount` (Policy alone only sees the
newly requested amount, not existing debt — see `docs/POLICY.md`), and
transfers `borrowToken` scaled to its real onchain decimals. Also
exposes `releaseCollateral()`, callable only by addresses on its own
`isAuthorizedReleaser` allowlist (set by the owner) — this is how a
second consumer can move already-custodied collateral without
duplicating custody logic.

### `LedgerLineVaultAdapter`
The second reference consumer. Holds no tokens itself. `withdraw()`
checks the position exists and the request doesn't exceed the caller's
raw balance, calls `Policy.canExecute` with `Action.WITHDRAW`, and —
only on a non-`BLOCK` decision — calls
`LendingAdapter.releaseCollateral()` to actually move funds. It has no
owner and no access-control modifiers of its own; its only privileged
relationship is being on `LendingAdapter`'s releaser allowlist.

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
4. On non-`BLOCK`, VaultAdapter calls `LendingAdapter.releaseCollateral`,
   which updates the shared `Registry` position and transfers
   `collateralToken` back to the user.

## State ownership

| State | Owner contract | Written by |
|---|---|---|
| `AssetState` (price, multiplier, lifecycle, bps) | `LedgerLineRegistry` | contract owner only |
| `Position.rawBalance` | `LedgerLineRegistry` | the configured `positionWriter` only (`LedgerLineLendingAdapter`) |
| `debt[user]` | `LedgerLineLendingAdapter` | the adapter itself, in `borrow()` |
| `isAuthorizedReleaser[addr]` | `LedgerLineLendingAdapter` | contract owner only |
| Nothing | `LedgerLineVaultAdapter` | — it is stateless besides its immutable contract references |
| Nothing | `LedgerLinePolicy` | — stateless besides its immutable-in-practice contract references |

## Dependency graph (imports)

- `LedgerLinePolicy` → `ILedgerLineRegistry`, `IPositionEngine`, `IRiskEngine`
- `LedgerLineLendingAdapter` → `ILedgerLineRegistry`, `ILedgerLinePolicy`, OpenZeppelin `IERC20`/`IERC20Metadata`/`SafeERC20`/`Ownable`
- `LedgerLineVaultAdapter` → `ILedgerLineRegistry`, `ILedgerLinePolicy`, `LedgerLineLendingAdapter` (concrete, for `releaseCollateral`)
- `RobinhoodStockTokenAdapter` → `IAssetStateAdapter`, `IRobinhoodStockToken`, `AggregatorV3Interface` (Chainlink-shaped), OpenZeppelin `Ownable`
- All shared types/enums/errors live in `contracts/src/interfaces/LedgerLineTypes.sol`

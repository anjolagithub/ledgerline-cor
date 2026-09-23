# LedgerLine Core

A reusable onchain policy primitive for tokenized real-world assets:
one function, `canExecute()`, that any lending market, vault, or other
money-moving contract calls before it acts, and that returns a
deterministic ALLOW / LIMIT / REVIEW / BLOCK decision.

Built for the Arbitrum Open House Singapore online buildathon.
First deep integration and proving ground: Robinhood Chain Stock Tokens.

## The problem

Every protocol that lets users borrow, withdraw, or otherwise act
against a tokenized real-world asset position ends up writing its own
risk logic, inline, inside the contract that also custodies funds.
That logic is hard to audit in isolation, impossible to reuse across a
second product without copy-pasting it, and easy to get subtly wrong
per integration — especially once the underlying asset has a
lifecycle (corporate actions, suspensions, redemptions) that a plain
ERC-20 balance can't express.

LedgerLine separates **"is this action allowed right now"** from
**"how do we actually move the money."** The decision lives in one
place; consuming contracts enforce it and hold the funds.

## The core primitive

```solidity
function canExecute(
    uint256 assetId,
    uint256 positionId,
    Action action,
    uint256 amount
) external view returns (PolicyResponse memory);
// PolicyResponse { Decision decision; uint256 permittedAmount; bytes32 reason; }
```

`LedgerLinePolicy.canExecute` reads asset and position state from
`LedgerLineRegistry` (the single state store), computes economic
position value and borrowing capacity via two stateless Arbitrum
Stylus (Rust/WASM) contracts — `PositionEngine` and `RiskEngine` — and
returns a decision. It never moves funds and never enforces anything
itself; that's the calling contract's job. See
[`docs/POLICY.md`](docs/POLICY.md) for the exact decision rules per
action.

## The three-consumer proof

The core claim of this project is that the *same*, unmodified
Policy/Registry/engines stack can back more than one real, independent
consumer contract:

- **`LedgerLineLendingAdapter`** — real collateral custody (deposit)
  and borrowing (borrow), gated by `Action.BORROW`: capacity-based,
  checked against the caller's existing debt.
- **`LedgerLineVaultAdapter`** — LedgerLine's second reference
  consumer, deliberately *not* a second lending market. It calls the
  same `canExecute()` with `Action.WITHDRAW`, gets an independent
  ALLOW/BLOCK decision evaluated purely on asset lifecycle (not
  borrowing capacity), and only then asks `LendingAdapter` to release
  the already-custodied collateral it doesn't itself hold.
- **`LedgerLineTransferAdapter`** — the third reference consumer, and
  the first with a mechanic genuinely different from the other two:
  it moves no tokens at all. It calls the same `canExecute()` with
  `Action.TRANSFER` (lifecycle-gated only, same rule as WITHDRAW), and
  on ALLOW reassigns which `positionId` in `Registry` owns a given
  `rawBalance` — the underlying collateral never leaves
  `LendingAdapter`'s custody. Its own debt-safety rule is stricter
  than `VaultAdapter`'s: any outstanding debt at all blocks the
  transfer outright (not a recomputed remaining-capacity check),
  because collateral changing owners invalidates whatever LTV math
  applied to the original owner's debt.

Adding the second and third consumers required **zero changes** to
`LedgerLineRegistry` or either Stylus engine, and exactly one addition
to `LedgerLinePolicy` each time: a real per-action branch for
`Action.WITHDRAW`, then the same pattern again for `Action.TRANSFER`
(both previously reserved but unimplemented). `docs/POLICY.md` and the
test suites (`LedgerLineVaultAdapter.t.sol`,
`LedgerLineTransferAdapter.t.sol`) show all three consumers exercising
the same policy core side by side, with the earlier consumers'
behavior unchanged and re-tested each time a new one was added.

A fourth proof point exists in `sdk/` — `@ledgerline/core`, a typed
TypeScript client (`LedgerLineClient`) that talks to all five deployed
contracts (Registry, Policy, LendingAdapter, VaultAdapter,
TransferAdapter) through the same interfaces the Solidity consumers
use, so an entirely different kind of consumer (an offchain script, a
bot, another frontend) doesn't need to reimplement any of this.

## Live on Robinhood Chain testnet

Chain ID **46630**. Real deployment, not a simulation:

| Contract | Address |
|---|---|
| `LedgerLineRegistry` | `0x88508A6d9266fbc928cC11DEE92f4EB1801B907c` |
| `LedgerLinePolicy` | `0x22fA5c1C36Cc1F7557B932dE7aCDa354ee4F6F52` |
| `LedgerLineLendingAdapter` | `0x39E0d1F2877c69F1a617a86d4Bd4F8B3f2493C97` |
| `LedgerLineVaultAdapter` | `0x0F705a7473461C1eF4148bC3D813E1ab15EC93ac` |
| `LedgerLineTransferAdapter` | `0xc5Af6A4a36b6e1b2B22D03b18bBA9FEA6D456943` |

Full address list, block numbers, and the abandoned V1 deployment's
history are in [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md).

**Real collateral, real borrow asset:** the deployment uses
Robinhood's real, live TSLA Stock Token as collateral
(`0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`, 18 decimals) and real
USDG (`0x7E955252E15c84f5768B83c41a71F9eba181802F`, 6 decimals) as the
borrowable asset — not mock tokens. Every internal amount (debt,
`canExecute`'s `amount`/`permittedAmount`) is a fixed 18-decimal unit
regardless of a token's real decimals; `LedgerLineLendingAdapter`
scales to USDG's real 6 decimals only at the final transfer. Getting
this scaling wrong was a real bug found and fixed during integration —
see below.

## Real integration issues found during deployment

These aren't hypothetical edge cases — each was hit while wiring this
project to real chains and real tokens, and each is now
regression-tested:

- **USDG's real decimals (6) don't match the internal 18-decimal
  convention.** An earlier version transferred the raw 18-decimal
  figure as if it were already in USDG's native units. Fixed by
  reading `IERC20Metadata.decimals()` once at construction and scaling
  only at the point of transfer (`LedgerLineDecimalScaling.t.sol`).
- **The real Stock Token contract doesn't implement `oraclePaused()`**
  the way Robinhood's own docs assume — the call reverts outright on
  the live testnet TSLA contract. `RobinhoodStockTokenAdapter` now
  calls it via `try/catch` and falls through to its mandatory
  staleness check on any failure, matching Robinhood's own
  documented caveat that the flag is advisory (`RobinhoodStockTokenAdapter.t.sol`).
- **No live Chainlink price feed exists for Robinhood Chain testnet at
  all** (Chainlink's tokenized-equity feeds are mainnet-only today),
  and no Chainlink L2 Sequencer Uptime Feed exists for this chain on
  any network. See [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) for
  exactly what that means for the current price path.
- **The original `LedgerLineLendingAdapter` had no way to authorize a
  second consumer** to release custodied collateral. Retrofitting it
  wasn't possible without a storage layout change, so the V2 testnet
  deployment redeploys the whole stack atomically instead; the old V1
  adapter is now permanently abandoned with 1 TSLA stranded in it
  (disclosed in `docs/DEPLOYMENTS.md`).
- **`LedgerLineRegistry` didn't originally bound `collateralFactorBps`
  / `riskAdjustmentBps` to ≤ 100%**, which could let computed borrowing
  capacity exceed real position value. Fixed with an explicit revert
  and covered by fuzz testing.

## What's live vs. what's a deliberate scope boundary

**Live today:** real onchain custody and transfers of real TSLA/USDG;
every `canExecute` call is computed live against current Registry
state through the real Stylus engines; lifecycle enforcement; two
independent, real consumer contracts sharing that same core.

**Deliberate scope boundaries, not oversights:** asset price,
lifecycle state, and risk parameters on the live deployment are set by
the contract owner directly (`Registry.updateAssetParameters` /
`transitionLifecycle`) — there is no automatic oracle push into
Registry today, even though a real, working `RobinhoodStockTokenAdapter`
is deployed and capable of reading live TSLA price data. See
`docs/INTEGRATIONS.md` for the exact reasoning and
`docs/SECURITY.md` for the trust assumptions this implies. Nothing in
this codebase claims performance/gas benchmarks, third-party audit
coverage, or production readiness.

## Repo layout

- `contracts/` — Foundry project (Solidity). Registry, Policy,
  LendingAdapter, VaultAdapter, TransferAdapter, the Robinhood Stock
  Token adapter, interfaces, mocks, tests, and deployment scripts.
- `stylus/` — Rust/Arbitrum Stylus workspace (`position-engine`,
  `risk-engine`) — the two stateless computation contracts Policy calls.
- `sdk/` — TypeScript SDK (`@ledgerline/core`), a typed viem client
  over the five deployed contracts.
- `frontend/` — Next.js judge-facing demo app (Policy Console +
  Activity log) against the live V2 testnet deployment.
- `docs/` — architecture, policy, integration, security, deployment,
  and demo documentation (see below).

## Roadmap

**Naming disclosure:** LedgerLine is a working name for this
buildathon submission, not an established or trademarked product
name — treat it as provisional.

**Natural next additions, given the current, disclosed scope
boundaries:**

- A `repay()` function on `LedgerLineLendingAdapter`. Per
  `docs/SECURITY.md`'s known limitations, debt is currently permanent
  once borrowed — there is no way to reduce it. Adding repayment is
  the most natural next addition given that gap.
- A fourth consumer action beyond BORROW, WITHDRAW, and the
  now-proven TRANSFER (`LedgerLineTransferAdapter`) — for example
  `Action.LIQUIDATE`, already reserved in the `Action` enum
  (`contracts/src/interfaces/LedgerLineTypes.sol`) but with no
  consumer or `Policy` branch implemented yet. TRANSFER's addition
  required zero changes to `Registry` or either Stylus engine and
  exactly one new branch in `LedgerLinePolicy` — the same pattern a
  LIQUIDATE consumer would be expected to follow.

## Further reading

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — contract graph, the
  Solidity/Stylus boundary, and state ownership.
- [`docs/POLICY.md`](docs/POLICY.md) — exactly how `canExecute()`
  decides BORROW vs. WITHDRAW, and why they differ.
- [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) — the real Robinhood
  Chain, TSLA, and USDG integration details, and what's live vs.
  owner-configured.
- [`docs/SECURITY.md`](docs/SECURITY.md) — trust assumptions, access
  control, and known limitations.
- [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md) — every deployed
  address on Robinhood Chain testnet, sourced from the actual
  broadcast files.
- [`docs/DEMO.md`](docs/DEMO.md) — a judge-facing walkthrough of the
  four core flows.

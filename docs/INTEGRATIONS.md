# Integrations

What LedgerLine actually talks to on Robinhood Chain testnet, sourced
from `contracts/src/RobinhoodStockTokenAdapter.sol`,
`contracts/script/DeployTestnetReal.s.sol` /
`DeployTestnetRealV2.s.sol`, and their tests. This document is careful
to separate **live** behavior from **owner-configured** and
**deployed-but-unwired** behavior — see the summary table at the end.

## Robinhood Chain

Chain ID **46630** ("Robinhood Chain Testnet"), verified against
official docs during earlier phases and unchanged since. No RPC URL is
hardcoded anywhere in this repo — `frontend/lib/chains.ts` and
`sdk/src/chain.ts` both require it via environment/config, and
`Stylus.toml` has a `TODO` left in place rather than a guessed
endpoint for this chain.

## TSLA Stock Token integration

Real, live contract: `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` — 18
decimals, `uiMultiplier()` returns `1e18`, verified against a real
deployer wallet balance during integration (not assumed from docs
alone; see `DeployTestnetReal.s.sol`'s header comment).

`RobinhoodStockTokenAdapter` reads two extra fields beyond standard
ERC-20: `uiMultiplier()` (standardized by ERC-8056, the Scaled UI
Amount Extension) and `oraclePaused()` (Robinhood-Chain-specific,
"true while a corporate action is being processed," explicitly
documented by Robinhood as *advisory, not enforced onchain*).

**Real gap found during integration:** calling `oraclePaused()`
against the real, live TSLA contract on this testnet reverts outright
— the function isn't implemented on that deployment, even though
`uiMultiplier()` and standard ERC-20 reads work fine. The adapter
therefore calls it via `try/catch`:

```solidity
try stockToken.oraclePaused() returns (bool paused) {
    if (paused) revert OracleReportsPaused();
} catch {
    // Advisory flag unavailable -- staleness check is the
    // primary guard and still applies unconditionally.
}
```

Any failure (not implemented, reverts, anything) falls through to the
mandatory staleness check rather than reverting the whole read — this
matches Robinhood's own documented "advisory" framing and is tested in
`RobinhoodStockTokenAdapter.t.sol::test_gracefullyDegradesWhenOraclePausedNotImplemented`.

Because the Chainlink-style feed price for a Stock Token already has
any corporate-action adjustment baked in, the adapter always reports
`multiplier = 1e18` (neutral) and lets `price` carry the full value —
this is a deliberate design decision, not a placeholder.

## USDG integration

Real, live contract: `0x7E955252E15c84f5768B83c41a71F9eba181802F`,
6 decimals, name "Global Dollar" — verified live during integration.
`DeployTestnetReal.s.sol`'s own deploy log explicitly notes the
deployer's USDG balance was `0` as of last check and instructs pulling
testnet USDG from the Paxos faucet before `borrow()` can actually pay
out: the `LendingAdapter` contract itself needs a real USDG balance to
lend from — there is no minting path for a real token.

## Decimal handling

Every internal accounting figure in this system — `debt`, and every
`amount`/`permittedAmount` compared inside `canExecute` — is a fixed
18-decimal unit, regardless of what decimals a real token actually
uses. `LedgerLineLendingAdapter` reads `borrowTokenDecimals` once at
construction via `IERC20Metadata.decimals()` and uses it **only** to
scale the literal amount at the final `safeTransfer` call
(`_toTokenAmount`) — nowhere else, and nothing in `Policy`, `Registry`,
or either Stylus engine is decimals-aware at all. TSLA (the collateral
token) happens to already be 18-decimal, so `deposit`/`withdraw`
amounts map directly to literal token units with no scaling needed;
USDG's real 6 decimals only matter at the one `borrow()` transfer.

This exact scaling was a real bug once (an earlier version transferred
the raw 18-decimal figure as if it were already USDG's native unit) —
fixed directly in the contract and covered by a dedicated regression
test using a 6-decimal mock (`MockUSDGLike`) in
`LedgerLineDecimalScaling.t.sol`.

## `oraclePaused()` behavior — summary

Advisory per Robinhood's own documentation, not enforced onchain by
the Stock Token contract itself. LedgerLine's adapter treats it as: if
the call succeeds and reports `true`, block; if the call fails for any
reason (including "not implemented," which is the real, observed case
on this testnet's TSLA contract), don't revert the whole read — the
staleness check below remains the actual guard.

## Sequencer-feed handling

`RobinhoodStockTokenAdapter` supports an optional Chainlink L2
Sequencer Uptime Feed check (`_checkSequencerUp`: sequencer must
report up, and the configured grace period since it last came up must
have elapsed) — this exists in the code and is unconditionally called
by `getAssetState()`.

**No such feed currently exists for Robinhood Chain, on any network**
(`DeployTestnetReal.s.sol`'s own comment: "No Chainlink L2 Sequencer
Uptime Feed exists for Robinhood Chain on any network"). Both real
deployments (`DeployTestnetReal.s.sol` and `DeployTestnetRealV2.s.sol`)
pass `address(0)` as the sequencer feed address.

**This means `RobinhoodStockTokenAdapter.getAssetState()` currently
reverts unconditionally if called against the real deployment** —
calling `latestRoundData()` on the zero address fails Solidity's
implicit contract-existence check for an external call with a return
value. This is verified directly (not assumed): a Foundry test
constructing the adapter with the real deployment's exact constructor
arguments and calling `getAssetState()` reverts every time. It is
currently inconsequential only because nothing in the live path
actually calls this function (see below) — but it means the adapter,
as deployed, cannot be used to read a live price today without either
deploying a real sequencer feed or changing the code to make that
check conditional. This is disclosed again in `docs/SECURITY.md` as a
known limitation.

## Testnet price-feed limitation

**No live Chainlink tokenized-equity price feed exists for Robinhood
Chain testnet at all** — Chainlink's own address tables list these
feeds as mainnet-only today (`DeployTestnetReal.s.sol`'s header
comment). Both real deployments substitute a `MockChainlinkFeed`
seeded with a real reference price captured at deploy-script write
time ($364.27, an 8-decimal Chainlink-style answer) as
`RobinhoodStockTokenAdapter`'s `priceFeed`. This is disclosed in the
deploy script as "operator-fed reference price... NOT live," refreshed
only by manually calling `setAnswer()`, or by redeploying.

## What's actually live vs. owner-configured vs. deployed-but-unwired

| Path | Status |
|---|---|
| TSLA/USDG token contracts, balances, transfers | **Live.** Real tokens, real onchain custody and transfers on every `deposit`/`borrow`/`withdraw`. |
| `Policy.canExecute` computation (lifecycle check, `PositionEngine`/`RiskEngine` calls) | **Live.** Computed fresh from current Registry state on every call — no caching. |
| `AssetState.price` / `multiplier` / `lifecycle` / bps on the live Registry | **Owner-configured.** Set directly via `Registry.initializeAsset` / `updateAssetParameters` / `transitionLifecycle`. No oracle or adapter pushes into Registry automatically today. |
| `RobinhoodStockTokenAdapter` + its `MockChainlinkFeed` reference price | **Deployed but unwired**, and currently non-functional if called (see sequencer-feed finding above). Used only once, at deploy-script time, to compute the initial seed value passed into `Registry.initializeAsset` — never read live by Registry, Policy, or any consumer contract afterward. |
| Chainlink sequencer-uptime protection | **Does not exist for this chain.** The code path exists; the underlying feed does not. |

# Security

This documents trust assumptions, access control, and known
limitations as they actually exist in `contracts/src/` today, based on
reading the contracts and their tests. **This is not an audit, does
not claim audit coverage, and does not claim any guarantee the code
doesn't actually enforce.** It extends and updates the Phase 6 review
(`../SECURITY.md`, still present at the repo root) through Phase 10
(`LedgerLineVaultAdapter`) and the real Robinhood Chain / TSLA / USDG
integration.

## Access control

| Contract | Privileged function | Gate |
|---|---|---|
| `LedgerLineRegistry` | `initializeAsset`, `updateAssetParameters`, `transitionLifecycle`, `setPositionWriter` | `onlyOwner` |
| `LedgerLineRegistry` | `setPosition` | `onlyPositionWriter` (a single address, itself only changeable by the owner) |
| `LedgerLineLendingAdapter` | `setAuthorizedReleaser` | `onlyOwner` |
| `LedgerLineLendingAdapter` | `releaseCollateral` | caller must be on `isAuthorizedReleaser` |
| `LedgerLinePolicy` | none — `registry`/`positionEngine`/`riskEngine` are set once in the constructor with no setter | n/a |
| `LedgerLineVaultAdapter` | none — no owner, no privileged functions at all | n/a |

No unauthorized state-mutation path was found in any of the four
Solidity contracts.

## Oracle / pricing assumptions

Price, multiplier, lifecycle, and risk parameters on the live Registry
are **entirely owner-controlled** — there is no live oracle push path
today (see `docs/INTEGRATIONS.md` for the full picture). This is the
single largest trust assumption in the system: whoever holds the
Registry owner key can set arbitrary prices, multipliers, and
lifecycle states, which flow directly into every `canExecute`
decision. This is disclosed, not hidden — `RobinhoodStockTokenAdapter`
exists specifically as the intended eventual replacement for
owner-set prices, but it is not wired into Registry today, and (see
below) is not currently even callable as deployed.

## Lifecycle enforcement

Transitions are validated against a fixed, hardcoded graph
(`LedgerLineRegistry._isValidTransition`) and gated `onlyOwner`.
Fuzz-tested against all 49 `(from, to)` pairs
(`testFuzz_lifecycleTransitionTableMatchesApprovedGraph`); only the 10
approved edges succeed. Every action is blocked unconditionally
whenever lifecycle isn't `ACTIVE`, checked first in `canExecute`
before any capacity computation
(`testFuzz_nonActiveAlwaysBlocks`).

## Price validation

`RobinhoodStockTokenAdapter.getAssetState` validates its price feed
input: rejects `answer <= 0`, rejects `updatedAt == 0`, and reverts on
staleness beyond a configured threshold (`InvalidPrice`, `StalePrice`;
tested in `RobinhoodStockTokenAdapter.t.sol`). **None of this
validation currently protects the live price path**, because Registry
never reads from this adapter (`docs/INTEGRATIONS.md`).
`Registry.updateAssetParameters`/`initializeAsset` themselves perform
no price validation at all beyond bounding the two bps fields — the
owner can set `price` to `0` or to any value. A `0` price safely
yields `0` position value and therefore `0` capacity
(`testFuzz_zeroPriceNeverAllowsCapacity` reverts any borrow attempt in
that state), but this is a consequence of the arithmetic, not an
explicit input check.

## Decimal handling

Internal accounting is always 18-decimal fixed-point; a real token's
actual decimals only matter at the literal transfer boundary in
`LedgerLineLendingAdapter`. A decimal-scaling bug here was real, found
during USDG integration, and fixed directly in the contract — see
`docs/INTEGRATIONS.md` and `LedgerLineDecimalScaling.t.sol`.

## Token-transfer assumptions

All transfers use OpenZeppelin's `SafeERC20`. `LendingAdapter.deposit()`
performs `safeTransferFrom` *before* updating Registry state — the one
deviation from strict checks-effects-interactions in this codebase.
This is only safe because the collateral token in the current
deployment (real TSLA) is a known, non-malicious, standard ERC-20; a
future integration with an arbitrary or untrusted token would need
this ordering revisited before being safe against reentrancy.
`borrow()` follows checks-effects-interactions correctly: `debt` is
updated before the external `safeTransfer` call.

## Known limitations (Phase 10, disclosed)

1. **`VaultAdapter.withdraw()` does not check outstanding debt at
   all.** A user who has borrowed against their position can withdraw
   the underlying collateral out from under that debt, because neither
   `Policy` nor `VaultAdapter` ever reads `LendingAdapter.debt`. This
   is by design (`docs/POLICY.md` explains why WITHDRAW is a pure
   lifecycle question in this codebase) and is directly tested
   (`test_withdrawIgnoresCapacityEntirely`), but it means the two
   consumers do not compose into a solvency-safe system together — that
   was never the two-consumer proof's goal, and isn't claimed here.
2. **`Policy.canExecute` for BORROW only sees the newly-requested
   amount, not cumulative debt.** The debt-aware check
   (`debt[msg.sender] + amount > permittedAmount`) lives only inside
   `LedgerLineLendingAdapter`. Any future capacity-gated consumer of
   `Policy` that doesn't replicate this check itself would under-protect
   its own callers — Policy will not do it for them (`docs/POLICY.md`).
3. **`RobinhoodStockTokenAdapter` is deployed with `sequencerUptimeFeed
   = address(0)`**, because no real sequencer-uptime feed exists for
   this chain. Its `getAssetState()` therefore reverts unconditionally
   if ever called — verified directly against the real deployment's
   constructor arguments. Currently inconsequential only because
   nothing in the live path calls it (`docs/INTEGRATIONS.md`).
4. **No live oracle.** Registry's price/lifecycle/risk parameters are
   entirely owner-set; a compromised or malicious owner key can set
   arbitrary values that flow straight into every policy decision.
5. **`Registry` bounds `collateralFactorBps`/`riskAdjustmentBps` to
   ≤ 10,000 (fixed and fuzz-tested this phase) but does not bound
   `price`** beyond the arithmetic consequence of a zero price yielding
   zero capacity — there is no sanity or deviation check on price
   updates.
6. **The V1 `LedgerLineLendingAdapter`
   (`0x598e3884657c8eF4870381E4c1Cc4e8e2D0dbcB7`) is permanently
   abandoned** with 1 real TSLA stranded in it — it predates
   authorized-releaser support and cannot be retrofitted without a
   storage-layout change, and none of these contracts are upgradeable
   by design (see `docs/DEPLOYMENTS.md`).
7. **No upgradeability anywhere in the stack** (matches the project's
   own "avoid unnecessary upgradeability" rule) — there is no proxy
   pattern and no post-deployment swap path for any immutable contract
   reference, which is also why point 6 has no remediation short of a
   full redeploy.
8. **No professional audit has been performed on any part of this
   codebase.**

## Not claimed

This document does not constitute a professional audit. No
performance or gas benchmarks are claimed anywhere in this codebase.
No claim is made that the two reference consumers, together, form a
solvency-safe combined system (see limitation 1) — each is
independently correct against its own documented policy, which is the
narrower claim this project actually makes and tests for.

# CortexRails Protocol — Security Review (Phase 6, LedgerLine Core contracts)

Status: MVP hackathon submission. This document records the security
review performed in Phase 6 against the checklist in the master build
spec (Section 14), and the trust assumptions the current design accepts.
It is not a claim of production-readiness or audit coverage.

## Reviewed areas

**Reentrancy.** LedgerLineLendingAdapter's `deposit()` and `borrow()`
follow checks-effects-interactions: `borrow()` validates policy and
updates `debt` *before* the external `safeTransfer` call. `deposit()`
performs `safeTransferFrom` before updating Registry state, which is the
one deviation worth noting -- ERC20 `transferFrom` cannot reenter into
`deposit()` in a way that corrupts state (the token contracts used are
non-malicious mocks), but if `MockStockToken` were ever replaced with an
arbitrary/untrusted ERC20, this ordering should be revisited. Linter also
flagged that `Deposited` is emitted after the external call; low risk
given the same reasoning, worth tightening if the token becomes
untrusted.

**Access control.** All privileged writes (`initializeAsset`,
`updateAssetParameters`, `transitionLifecycle`, `setPositionWriter`) are
`onlyOwner`. `setPosition` is restricted to a single configured
`positionWriter` address, itself only changeable by the owner. No
unauthorized state-mutation path was found.

**Oracle/pricing assumptions.** Price and lifecycle data are entirely
admin-controlled in this MVP -- there is no oracle, no Robinhood Chain
integration yet (Phase 7), and `RobinhoodStockTokenAdapter` is an
explicitly-labeled placeholder. This is a deliberate, disclosed trust
assumption, not an oversight: whoever controls the Registry owner key can
set arbitrary prices and lifecycle states. Production deployment would
require this to be replaced by verified external state.

**Stale pricing.** Not applicable in the current design -- there is no
caching or staleness window; every `canExecute` call reads the latest
Registry state directly. This becomes relevant once a real oracle with
update latency exists (Phase 7).

**State-transition authorization.** Lifecycle transitions are validated
against a fixed, locked graph (`_isValidTransition`) and gated
`onlyOwner`. Fuzz-tested against all 49 (from, to) pairs; only the 10
approved edges succeed (see `testFuzz_lifecycleTransitionTableMatchesApprovedGraph`).

**Policy bypass.** `canExecute` is the sole decision path; the lending
adapter has no alternate route to move funds without calling it first.
Fuzz-tested that non-ACTIVE lifecycle states block regardless of amount
(`testFuzz_nonActiveAlwaysBlocks`) and that BLOCK decisions never result
in a successful transfer.

**Parameter manipulation / rounding / precision.** FINDING (fixed this
phase): `LedgerLineRegistry.initializeAsset` and `updateAssetParameters`
did not previously bound `collateralFactorBps` / `riskAdjustmentBps` to
<= 10,000 (100%). An admin setting either above 10,000 would let
`computeBorrowingCapacity` return a value exceeding the underlying
position value -- capacity materializing value from nothing, violating
the spirit of invariant 6 (corporate-action transformations must
preserve intended economic representation) even though it's a parameter
issue rather than a corporate-action one specifically. Fixed by adding
`InvalidBps` reverts on both setters; regression-covered by
`testFuzz_registryRejectsOutOfRangeBps`. All arithmetic elsewhere uses
Solidity 0.8's built-in checked arithmetic (reverts on overflow/underflow
by default) and Rust's explicit `checked_mul` in both Stylus engines
(Phase 2) -- no unchecked math exists anywhere in the stack.

**Denial of service.** No unbounded loops, no external calls in a loop,
no user-controlled array growth. Not a concern at current scope.

**Incorrect lifecycle transitions.** Covered above; fuzz-tested.

**Unauthorized adapter replacement.** `LedgerLineLendingAdapter`'s
references to Registry/Policy/tokens are `immutable`, set once at
construction -- there is no post-deployment swap path, so this class of
risk doesn't apply to the current adapter. `positionWriter` on Registry
*is* mutable (`onlyOwner`) by design, since it's meant to eventually
point at whichever lending adapter is live; this is the same disclosed
admin-trust assumption as everything else in this list.

**Upgrade risks.** No proxy pattern, no upgradeability anywhere in the
stack (matches the spec's "avoid unnecessary upgradeability" rule).
Nothing to review here by construction.

## Trust assumptions (explicit)

1. The Registry owner is trusted to set honest prices, multipliers, risk
   parameters, and lifecycle transitions. This is the single largest
   trust assumption in the system and is expected to be replaced by
   verified external state/oracle infrastructure (Phase 7 and beyond),
   not resolved in this MVP.
2. `positionWriter` is trusted to report honest raw balances -- currently
   only `LedgerLineLendingAdapter`, which itself only records balances
   backed by real, verified ERC20 transfers into its own custody.
3. Mock tokens (`MockStockToken`, `MockBorrowToken`) are non-malicious by
   construction (owner-mintable, standard OpenZeppelin ERC20). A
   production deployment integrating a real, arbitrary token would need
   the reentrancy consideration above revisited.

## Not claimed

This review does not constitute a professional audit. No performance or
gas benchmarks are claimed anywhere in this codebase (per explicit
project constraint) -- any future claim of that kind would need to be
separately measured, not asserted.

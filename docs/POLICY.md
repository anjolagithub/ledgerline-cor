# Policy

`LedgerLinePolicy.canExecute` is LedgerLine's entire reusable policy
surface. This document describes exactly what it does today, from
`contracts/src/LedgerLinePolicy.sol`, and nothing it doesn't yet do.

```solidity
function canExecute(
    uint256 assetId,
    uint256 positionId,
    Action action,
    uint256 amount
) external view returns (PolicyResponse memory response);
```

## Parameters

- **`assetId`** — which asset (and therefore which `AssetState` row in
  Registry) this call concerns. The live deployment configures exactly
  one asset, `assetId = 1` (TSLA).
- **`positionId`** — an opaque `uint256` identifying the position being
  evaluated. Registry itself has no notion of "users"; every current
  consumer derives it the same way, `uint256(uint160(userAddress))`
  (`LedgerLineClient.positionIdFromAddress` in the SDK does this too),
  but Policy and Registry don't enforce that convention — a consumer
  could use any scheme.
- **`action`** — one of `BORROW`, `WITHDRAW`, `TRANSFER`,
  `INCREASE_LEVERAGE`, `LIQUIDATE` (`Action` enum,
  `LedgerLineTypes.sol`). Only `BORROW` and `WITHDRAW` have real
  behavior today; the other three values exist in the enum but have no
  wired logic anywhere in the contracts.
- **`amount`** — the amount the caller wants to execute, as an
  18-decimal fixed-point internal unit, regardless of any real token's
  actual decimals. This convention is enforced by callers, not by
  Policy itself.

## Return value

```solidity
struct PolicyResponse {
    Decision decision;      // ALLOW | LIMIT | REVIEW | BLOCK
    uint256 permittedAmount;
    bytes32 reason;
}
```

- **`ALLOW`** — the request, on its own, does not exceed what
  LedgerLine permits.
- **`LIMIT`** — the request exceeds `permittedAmount`. This is a
  reject-and-resubmit signal, not a clamp: LedgerLine never silently
  reduces a request to fit. A calling contract that receives `LIMIT`
  and proceeds anyway is going out of its way to ignore the decision.
- **`REVIEW`** — reserved for a future manual-review path. No code
  path in `canExecute` returns it today; it exists in the enum (and in
  the frontend's decision-color mapping) purely so a future trigger
  doesn't need new UI/consumer branching to render correctly.
- **`BLOCK`** — the action is not permitted at all right now;
  `permittedAmount` is always `0`.
- **`permittedAmount`** is a ceiling, never a reduced version of the
  caller's request. **Callers must check `requestedAmount <=
  permittedAmount` themselves** and must account for their own
  existing state (e.g. debt) themselves — Policy does not know about
  either. This is stated explicitly in `ILedgerLinePolicy`'s NatSpec
  and is not incidental.
- **`reason`** is a machine-readable `bytes32` constant (`REASON_OK`,
  `REASON_EXCEEDS_CAPACITY`, `REASON_NO_CAPACITY`, `REASON_RESTRICTED`,
  `REASON_CORPORATE_ACTION`, `REASON_SUSPENDED`, `REASON_MATURING`,
  `REASON_REDEEMABLE`, `REASON_REDEEMED`), not a display string.

## Lifecycle short-circuit (applies to every action)

```solidity
if (asset.lifecycle != LifecycleState.ACTIVE) {
    return PolicyResponse({decision: BLOCK, permittedAmount: 0, reason: _lifecycleReason(asset.lifecycle)});
}
```

Any lifecycle state other than `ACTIVE` blocks *every* action
unconditionally, before capacity or position data is even read. This
is fuzz-tested across all 49 `(from, to)` lifecycle pairs and all
non-`ACTIVE` states × arbitrary amounts
(`testFuzz_nonActiveAlwaysBlocks`, `LedgerLineFuzz.t.sol`).

## BORROW behavior

If lifecycle is `ACTIVE`:

```
positionValue = PositionEngine.computePositionValue(rawBalance, price, multiplier)
capacity      = RiskEngine.computeBorrowingCapacity(positionValue, collateralFactorBps, riskAdjustmentBps)

capacity == 0        -> BLOCK,  permittedAmount = 0,        reason = NO_CAPACITY
amount <= capacity    -> ALLOW,  permittedAmount = capacity, reason = OK
amount >  capacity    -> LIMIT,  permittedAmount = capacity, reason = EXCEEDS_CAPACITY
```

**Important nuance:** the `amount` Policy compares against `capacity`
is only the newly-requested increment passed into this call — Policy
has no idea what the caller's existing debt is, because Registry
doesn't track debt at all (see `docs/ARCHITECTURE.md`'s state
ownership table). The consumer is responsible for combining Policy's
answer with its own state. `LedgerLineLendingAdapter.borrow()` does
exactly this:

```solidity
PolicyResponse memory response = policy.canExecute(assetId, positionId, Action.BORROW, amount);
if (response.decision == Decision.BLOCK) revert PolicyBlocked(response.reason);

uint256 wouldOweTotal = debt[msg.sender] + amount;
if (wouldOweTotal > response.permittedAmount) revert ExceedsPermittedAmount(wouldOweTotal, response.permittedAmount);
```

So a `LIMIT` decision from Policy alone doesn't necessarily mean the
adapter reverts, and an `ALLOW` from Policy alone doesn't guarantee the
adapter proceeds — the adapter's own debt-aware check is what actually
enforces "never exceed capacity across multiple borrows," and it is
covered by `testFuzz_successfulBorrowNeverExceedsCapacity` and the
full incremental-debt scenario in `LedgerLineDemo.t.sol::test_fullDemoFlow`
(borrow to the boundary, have capacity drop under existing debt, get
rejected, have it restored, borrow exactly up to the new boundary).
Any future consumer of Policy for a capacity-gated action must
replicate this debt-aware check itself; Policy will not do it for them.

## WITHDRAW behavior

```solidity
if (action == Action.WITHDRAW) {
    return PolicyResponse({decision: ALLOW, permittedAmount: position.rawBalance, reason: REASON_OK});
}
```

Once lifecycle is confirmed `ACTIVE`, a withdraw request is **always**
`ALLOW`ed up to the caller's full recorded position — capacity,
collateral factor, and risk adjustment are never consulted for this
action. This is deliberate, not a missing check: redeeming
already-deposited collateral has no natural relationship to borrowing
capacity, and `LedgerLineVaultAdapter.withdraw()`'s own comment states
this outright. It is directly tested:
`LedgerLineVaultAdapter.t.sol::test_withdrawIgnoresCapacityEntirely`
withdraws an amount that would be "over capacity" if the action were
borrow-gated, and confirms it still succeeds.

One consequence worth stating plainly (see also `docs/SECURITY.md`):
**WITHDRAW does not check outstanding debt.** A user who has borrowed
against their position can still withdraw the underlying collateral,
because neither `Policy` nor `VaultAdapter` ever reads
`LendingAdapter.debt`. This is the real, current, bounded scope of the
two-consumer proof — it demonstrates genuine per-action policy
differentiation through the same `canExecute()` call, not a
cross-consumer solvency system.

## Why BORROW and WITHDRAW are different policies

They're different economic questions answered by the same function:
BORROW asks "how much *new* value can this position responsibly
support," which depends on price, collateral factor, and risk
adjustment; WITHDRAW asks "is this asset in a state where redeeming
your own already-recorded balance is currently permitted," which is a
pure lifecycle question. Proving `canExecute()` genuinely branches
between them — rather than every consumer independently reimplementing
"is this allowed" — is precisely what Phase 10 (`LedgerLineVaultAdapter`)
was built to demonstrate.

## Tests proving both consumers share the same policy core

- `LedgerLineVaultAdapter.t.sol::test_borrowBehaviorCompletelyUnchanged`
  — adding the WITHDRAW branch didn't alter BORROW's behavior at all.
- `LedgerLineVaultAdapter.t.sol::test_withdrawIgnoresCapacityEntirely`
  — WITHDRAW is genuinely not capacity-gated.
- `LedgerLineVaultAdapter.t.sol::test_withdrawBlockedWhenNonActive` —
  the same lifecycle short-circuit applies to both actions through the
  same `canExecute` code path.
- `LedgerLineDemo.t.sol::test_fullDemoFlow` — full BORROW lifecycle
  (ALLOW → LIMIT as risk parameters tighten → BLOCK on lifecycle change
  → ALLOW again), against the real `LedgerLineRegistry`/`LedgerLinePolicy`.
- `LedgerLineFuzz.t.sol` — the lifecycle transition table, non-ACTIVE
  always-blocks, zero-price-never-allows-capacity, and
  never-exceeds-capacity properties, all against the real contracts.

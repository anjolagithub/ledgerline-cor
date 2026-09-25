import { LifecycleState } from "../../src/types";

/// Pure decision logic for the oracle-sync script. No I/O, no chain
/// access, no viem client -- given prices and flags, it only DECIDES
/// what lifecycle change (if any) would be proposed. Sending anything
/// onchain lives in ../oracle-sync.ts and is off by default.
///
/// Scope: this only ever proposes moving an asset INTO a protective
/// state (SUSPENDED / RESTRICTED). It never proposes returning to
/// ACTIVE -- recovering from a suspension is a human decision -- and it
/// never proposes a price update (updateAssetParameters is out of scope).

/// 10% expressed in basis points.
export const DEFAULT_MAX_DEVIATION_BPS = 1000n;
/// A feed older than this is treated as unusable, not as a signal.
export const DEFAULT_MAX_STALENESS_SEC = 3600;
/// Tolerated clock skew for a feed timestamp slightly in the future.
export const MAX_FUTURE_SKEW_SEC = 60;

export type OracleInputs = {
  /// Current Registry price (18-decimal fixed point).
  referencePrice: bigint;
  /// Feed price (18-decimal fixed point).
  feedPrice: bigint;
  /// Feed's last update, unix seconds.
  feedUpdatedAt: number;
  /// Current time, unix seconds (injected so tests are deterministic).
  now: number;
  complianceFlag: boolean;
  currentLifecycle: LifecycleState;
  maxDeviationBps?: bigint;
  maxStalenessSec?: number;
};

export type OracleDecision =
  | { action: "NONE"; why: string }
  | { action: "TRANSITION"; to: LifecycleState; reasons: string[] }
  | { action: "SKIP"; why: string };

/// Exact mirror of LedgerLineRegistry._isValidTransition
/// (contracts/src/LedgerLineRegistry.sol). The CLI also re-checks this
/// onchain via Registry.isValidTransition before any send.
export function isValidTransition(from: LifecycleState, to: LifecycleState): boolean {
  switch (from) {
    case LifecycleState.ACTIVE:
      return (
        to === LifecycleState.RESTRICTED ||
        to === LifecycleState.CORPORATE_ACTION ||
        to === LifecycleState.SUSPENDED ||
        to === LifecycleState.MATURING
      );
    case LifecycleState.RESTRICTED:
      return to === LifecycleState.ACTIVE || to === LifecycleState.SUSPENDED;
    case LifecycleState.CORPORATE_ACTION:
      return to === LifecycleState.ACTIVE || to === LifecycleState.RESTRICTED;
    case LifecycleState.SUSPENDED:
      return to === LifecycleState.ACTIVE || to === LifecycleState.RESTRICTED;
    case LifecycleState.MATURING:
      return to === LifecycleState.REDEEMABLE;
    case LifecycleState.REDEEMABLE:
      return to === LifecycleState.REDEEMED;
    default:
      return false;
  }
}

/// True iff |feed - reference| / reference is STRICTLY greater than
/// maxDeviationBps. Integer-only (no floating point): compares
/// |feed - ref| * 10000 > maxDeviationBps * ref. Exactly 10% is not a
/// breach.
export function exceedsDeviation(referencePrice: bigint, feedPrice: bigint, maxDeviationBps: bigint): boolean {
  const diff = feedPrice > referencePrice ? feedPrice - referencePrice : referencePrice - feedPrice;
  return diff * 10_000n > maxDeviationBps * referencePrice;
}

export function decideLifecycleAction(input: OracleInputs): OracleDecision {
  const maxDeviationBps = input.maxDeviationBps ?? DEFAULT_MAX_DEVIATION_BPS;
  const maxStalenessSec = input.maxStalenessSec ?? DEFAULT_MAX_STALENESS_SEC;

  // Never act on bad or stale data. A stale feed's compliance flag is
  // just as stale as its price, so staleness skips everything.
  if (input.referencePrice <= 0n) return { action: "SKIP", why: "Registry reference price is not positive" };
  if (input.feedPrice <= 0n) return { action: "SKIP", why: "feed price is not positive" };
  if (input.feedUpdatedAt > input.now + MAX_FUTURE_SKEW_SEC) {
    return { action: "SKIP", why: "feed timestamp is in the future" };
  }
  const age = input.now - input.feedUpdatedAt;
  if (age > maxStalenessSec) {
    return { action: "SKIP", why: `feed is stale (${age}s old, max ${maxStalenessSec}s)` };
  }

  const reasons: string[] = [];
  if (input.complianceFlag) reasons.push("compliance flag set");
  const deviated = exceedsDeviation(input.referencePrice, input.feedPrice, maxDeviationBps);
  if (deviated) reasons.push(`price deviation above ${Number(maxDeviationBps) / 100}%`);

  if (reasons.length === 0) return { action: "NONE", why: "within deviation band, no compliance flag" };

  // Compliance takes precedence: RESTRICTED is the legal/compliance
  // state; SUSPENDED is the market-data state.
  const target = input.complianceFlag ? LifecycleState.RESTRICTED : LifecycleState.SUSPENDED;

  if (input.currentLifecycle === target) {
    return { action: "NONE", why: `already ${LifecycleState[target]} (${reasons.join("; ")})` };
  }
  if (!isValidTransition(input.currentLifecycle, target)) {
    return {
      action: "SKIP",
      why: `${LifecycleState[input.currentLifecycle]} -> ${LifecycleState[target]} is not a valid Registry transition (${reasons.join("; ")})`,
    };
  }
  return { action: "TRANSITION", to: target, reasons };
}

export type ExecutionContext = {
  executeFlag: boolean;
  hasPrivateKey: boolean;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
};

/// Every reason the CLI must refuse to send a transaction. Empty means
/// all guards pass (the CLI still requires a typed confirmation and an
/// onchain owner + transition re-check after this).
export function executionBlockers(ctx: ExecutionContext): string[] {
  const blockers: string[] = [];
  if (!ctx.executeFlag) blockers.push("dry-run (no --execute flag)");
  if (!ctx.hasPrivateKey) blockers.push("ORACLE_SYNC_PRIVATE_KEY is not set");
  if (!ctx.stdinIsTTY || !ctx.stdoutIsTTY) {
    blockers.push("not an interactive terminal -- refusing to run unattended");
  }
  return blockers;
}

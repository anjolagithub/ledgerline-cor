import { type Address, bytesToString, formatUnits, hexToBytes, parseUnits } from "viem";
import { LedgerLineClient } from "./client";
import { Action, type PolicyResponse } from "./types";

/// Agent-facing intent layer -- a thin, deterministic wrapper around the
/// SAME real `Policy.canExecute()` this SDK already calls everywhere else.
/// This module does not compute risk, capacity, or any economic result
/// itself: every number in an `AgentPolicyResult` other than unit
/// conversions (human string <-> 18-decimal wei, bytes32 <-> utf8) comes
/// directly from the onchain `PolicyResponse`. There is no second policy
/// engine here, by design -- an agent using this module gets exactly the
/// same answer a direct `LedgerLineClient.canExecute()` call would give it.

/// Only the actions with a real, deployed consumer adapter in this stack.
/// `Action.INCREASE_LEVERAGE`/`Action.LIQUIDATE` exist in the onchain enum
/// and `canExecute()` will answer for them, but no adapter exists to
/// execute either one in this deployment -- deliberately excluded from
/// the agent-facing surface rather than invented.
export type AgentAction = "BORROW" | "WITHDRAW" | "TRANSFER";

const ACTION_MAP: Record<AgentAction, Action> = {
  BORROW: Action.BORROW,
  WITHDRAW: Action.WITHDRAW,
  TRANSFER: Action.TRANSFER,
};

const DECISION_LABELS = ["ALLOW", "LIMIT", "REVIEW", "BLOCK"] as const;
export type AgentDecision = (typeof DECISION_LABELS)[number];

/// A local, offchain DISPLAY lookup only -- `LedgerLineRegistry` has no
/// symbol->assetId read of its own, and this is not risk math. Seeded
/// with exactly the one asset THIS deployment currently has configured
/// (assetId 1, TSLA) -- not because the underlying contracts are
/// single-asset. `Policy.canExecute`, `LedgerLineRegistry.getAssetState`/
/// `getPosition`, and every adapter's write path already take `assetId`
/// as a real parameter throughout (see LedgerLineRegistry.sol,
/// LedgerLinePolicy.sol) -- the primitive itself is multi-asset. What
/// this map can't do is configure a NEW asset onchain: that is an
/// `onlyOwner` call on the deployed Registry (see
/// LedgerLineRegistry.sol's `configureAsset`-style admin functions),
/// which needs the Registry owner's key -- something no SDK call can
/// or should do on a caller's behalf. Use `registerAgentAsset` below
/// once a second asset is actually configured onchain, rather than
/// editing this object directly (keeps the mutation in one auditable
/// place with the same validation every time).
export const KNOWN_AGENT_ASSETS: Record<string, bigint> = {
  TSLA: 1n,
};

/// Registers an additional symbol -> assetId mapping for
/// `evaluateAgentIntent`/`suggestRetryIntent` to resolve, once that
/// assetId is actually configured on the deployed Registry (this
/// function does not configure it -- it only teaches this SDK's local,
/// offchain display lookup about an assetId that already exists
/// onchain). Rejects redefining an existing symbol to a different
/// assetId outright, rather than silently overwriting it.
export function registerAgentAsset(symbol: string, assetId: bigint): void {
  const existing = KNOWN_AGENT_ASSETS[symbol];
  if (existing !== undefined && existing !== assetId) {
    throw new Error(
      `registerAgentAsset: "${symbol}" is already registered as assetId ${existing} -- refusing to silently ` +
        `redefine it to ${assetId}. Use a different symbol, or confirm this is intentional and remove the ` +
        `existing entry first.`
    );
  }
  KNOWN_AGENT_ASSETS[symbol] = assetId;
}

export class UnknownAgentAssetError extends Error {
  constructor(asset: string) {
    super(`Unknown agent asset "${asset}" -- known assets: ${Object.keys(KNOWN_AGENT_ASSETS).join(", ")}`);
    this.name = "UnknownAgentAssetError";
  }
}

/// Structured intent an autonomous agent submits. `amount` is always a
/// HUMAN-readable decimal string (e.g. "120000") -- never pre-scaled by
/// the caller; this module scales it to the real 18-decimal internal unit
/// via viem's `parseUnits`, matching every other write method on
/// `LedgerLineClient`.
export type AgentIntent = {
  asset: string;
  /// A raw positionId, or a wallet address to derive one from via
  /// `LedgerLineClient.positionIdFromAddress` -- accepting either shape
  /// covers both a literal example intent and a real connected wallet.
  positionId: bigint | Address;
  action: AgentAction;
  amount: string;
  /// Display-only. No contract in this deployment takes an "assetOut"
  /// parameter -- it is never passed onchain anywhere, only echoed back.
  assetOut?: string;
};

export type AgentPolicyResult = {
  decision: AgentDecision;
  requestedAmount: string;
  permittedAmount: string;
  /// The REAL bytes32 reason constant, decoded to utf8 (e.g.
  /// "EXCEEDS_CAPACITY", "OK", "RESTRICTED") -- kept exactly as the
  /// contract defines it, never remapped to an invented vocabulary.
  reason: string;
  assetId: bigint;
  positionId: bigint;
  action: AgentAction;
  /// The untouched onchain struct, for any caller that wants the exact
  /// numeric Decision enum, bigint amounts, or raw bytes32 reason hex.
  raw: PolicyResponse;
};

function decodeReason(reasonHex: `0x${string}`): string {
  const bytes = hexToBytes(reasonHex);
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return bytesToString(bytes.slice(0, end));
}

/// A real `LedgerLineClient` satisfies this structurally -- narrowed to
/// just `canExecute` so tests can pass a lightweight stub object instead
/// of constructing a full client (no live RPC needed to unit-test the
/// intent-translation logic itself).
export type AgentPolicyClient = Pick<LedgerLineClient, "canExecute">;

/// Resolves a structured `AgentIntent` into a real `canExecute()` call
/// against the given client and returns a typed, human-unit result. The
/// only logic here is unit/enum conversion -- resolving `asset` to
/// `assetId`, `positionId` to a bigint, `action` to the `Action` enum,
/// and `amount` to/from 18-decimal wei. The decision, permitted amount,
/// and reason are the real onchain answer, unmodified.
export async function evaluateAgentIntent(
  client: AgentPolicyClient,
  intent: AgentIntent
): Promise<AgentPolicyResult> {
  const assetId = KNOWN_AGENT_ASSETS[intent.asset];
  if (assetId === undefined) {
    throw new UnknownAgentAssetError(intent.asset);
  }

  const positionId =
    typeof intent.positionId === "bigint"
      ? intent.positionId
      : LedgerLineClient.positionIdFromAddress(intent.positionId);

  const action = ACTION_MAP[intent.action];
  const amountWei = parseUnits(intent.amount, 18);

  const raw = await client.canExecute(positionId, action, amountWei, assetId);

  return {
    decision: DECISION_LABELS[raw.decision],
    requestedAmount: intent.amount,
    permittedAmount: formatUnits(raw.permittedAmount, 18),
    reason: decodeReason(raw.reason),
    assetId,
    positionId,
    action: intent.action,
    raw,
  };
}

/// Returns an adjusted-amount intent set to the real `permittedAmount`
/// when (and only when) the evaluation came back `LIMIT` -- `undefined`
/// otherwise. Gives an agent "enough information to decide whether to
/// modify and retry" (the explicit requirement) without this module
/// making that retry decision on the agent's behalf.
export function suggestRetryIntent(intent: AgentIntent, result: AgentPolicyResult): AgentIntent | undefined {
  if (result.decision !== "LIMIT") return undefined;
  return { ...intent, amount: result.permittedAmount };
}

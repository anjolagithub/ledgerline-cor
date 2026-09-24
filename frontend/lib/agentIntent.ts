import { bytesToString, formatUnits, hexToBytes, parseUnits, type Address } from "viem";
import { readContract } from "wagmi/actions";
import { config } from "./wagmi";
import { POLICY, ASSET_ID, DECISION_LABELS } from "./contracts";

/// Frontend's own thin agent-intent wrapper -- deliberately NOT importing
/// sdk/src/agent.ts as a package dependency (see the plan: a cross-package
/// file: dependency between two independently-deployed apps risks silently
/// breaking the Vercel build). This calls the exact same real, deployed
/// `LedgerLinePolicy.canExecute()` directly via wagmi's imperative
/// `readContract` action -- the same contract, same read, as every other
/// form on this page already uses via `useReadContract`. No risk math
/// lives here: only unit/enum conversion, identical in spirit (and, for
/// the reason-decoding logic, byte-for-byte) to sdk/src/agent.ts.

export type AgentAction = "BORROW" | "WITHDRAW" | "TRANSFER";

const ACTION_INDEX: Record<AgentAction, number> = {
  BORROW: 0,
  WITHDRAW: 1,
  TRANSFER: 2,
};

/// Local, offchain DISPLAY lookup only -- Registry has no symbol->assetId
/// read, and this deployment configures exactly one asset (TSLA). Not
/// risk math; throws for anything unrecognized rather than guessing.
export const KNOWN_AGENT_ASSETS: Record<string, bigint> = {
  TSLA: ASSET_ID,
};

export class UnknownAgentAssetError extends Error {
  constructor(asset: string) {
    super(`Unknown agent asset "${asset}" -- known assets: ${Object.keys(KNOWN_AGENT_ASSETS).join(", ")}`);
    this.name = "UnknownAgentAssetError";
  }
}

export type AgentIntent = {
  asset: string;
  positionId: bigint | Address;
  action: AgentAction;
  amount: string;
  assetOut?: string;
};

export type AgentPolicyResult = {
  decision: (typeof DECISION_LABELS)[number];
  requestedAmount: string;
  permittedAmount: string;
  reason: string;
  assetId: bigint;
  positionId: bigint;
  action: AgentAction;
  raw: { decision: number; permittedAmount: bigint; reason: `0x${string}` };
};

function decodeReason(reasonHex: `0x${string}`): string {
  const bytes = hexToBytes(reasonHex);
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return bytesToString(bytes.slice(0, end));
}

/// Resolves the intent and calls the real, live `canExecute()` via
/// wagmi's readContract against POLICY (this file's only environment-
/// sourced contract reference -- never a hardcoded default). Same
/// contract, same call shape (`assetId, positionId, action, amount`) as
/// BorrowForm.tsx's existing `useReadContract` call.
export async function evaluateAgentIntent(intent: AgentIntent): Promise<AgentPolicyResult> {
  const assetId = KNOWN_AGENT_ASSETS[intent.asset];
  if (assetId === undefined) {
    throw new UnknownAgentAssetError(intent.asset);
  }

  const positionId = typeof intent.positionId === "bigint" ? intent.positionId : BigInt(intent.positionId);
  const action = ACTION_INDEX[intent.action];
  const amountWei = parseUnits(intent.amount, 18);

  const raw = (await readContract(config, {
    address: POLICY.address,
    abi: POLICY.abi,
    functionName: "canExecute",
    args: [assetId, positionId, action, amountWei],
  })) as { decision: number; permittedAmount: bigint; reason: `0x${string}` };

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

export function suggestRetryIntent(intent: AgentIntent, result: AgentPolicyResult): AgentIntent | undefined {
  if (result.decision !== "LIMIT") return undefined;
  return { ...intent, amount: result.permittedAmount };
}

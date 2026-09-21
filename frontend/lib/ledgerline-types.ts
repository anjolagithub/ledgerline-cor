import type { Address } from "viem";

export type LifecycleState = "ACTIVE" | "RESTRICTED" | "CORPORATE_ACTION" | "SUSPENDED" | "MATURING" | "REDEEMABLE" | "REDEEMED";
export type Decision = "ALLOW" | "LIMIT" | "REVIEW" | "BLOCK";
export type TransactionState = "idle" | "preparing" | "wallet-confirmation" | "submitted" | "pending" | "confirmed" | "failed" | "user-rejected" | "wrong-network" | "insufficient-balance";

export type Asset = { id: bigint; symbol: string; tokenAddress: Address; lifecycle: LifecycleState; price: bigint; oracleHealthy: boolean };
export type Position = { assetId: bigint; owner?: Address; balance: bigint; value: bigint };
export type PolicyEvaluation = { decision: Decision; permittedAmount: bigint; reason: string };
export type ActivityEvent = { id: string; timestamp: string; action: string; amount?: string; result: Decision | "CONFIRMED"; hash?: string };

export const MOCK_ACTIVITY: ActivityEvent[] = [];
export const DECISION_REASON: Record<Decision, string> = {
  ALLOW: "Within effective borrowing capacity",
  LIMIT: "Requested amount exceeds effective borrowing capacity",
  REVIEW: "Policy requires operator review",
  BLOCK: "Asset is suspended or unavailable",
};

"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { POLICY, LENDING_ADAPTER, ASSET_ID, ONE } from "@/lib/contracts";
import { useTransactionFlow } from "@/lib/useTransactionFlow";
import { PolicyEquation } from "./PolicyEquation";
import { PolicyVerdict } from "./PolicyVerdict";
import { TransactionStatus } from "./TransactionStatus";

export function BorrowForm({
  positionValue,
  collateralFactorBps,
  riskAdjustmentBps,
  effectiveCapacity,
  lifecycle,
}: {
  positionValue: bigint | undefined;
  collateralFactorBps: bigint | undefined;
  riskAdjustmentBps: bigint | undefined;
  effectiveCapacity: bigint | undefined;
  lifecycle: number | undefined;
}) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const parsedAmount = amount ? BigInt(Math.floor(Number(amount))) * ONE : 0n;
  const positionId = address ? BigInt(address) : 0n;

  // Existing data source, unchanged -- same canExecute call that
  // previously lived directly in this component.
  const { data: response } = useReadContract({
    address: POLICY.address,
    abi: POLICY.abi,
    functionName: "canExecute",
    args: [ASSET_ID, positionId, 0, parsedAmount], // Action.BORROW = 0
    query: { enabled: !!address && parsedAmount > 0n },
  }) as { data: { decision: number; permittedAmount: bigint; reason: string } | undefined };

  const tx = useTransactionFlow();
  const decisionLabel = response ? ["ALLOW", "LIMIT", "REVIEW", "BLOCK"][response.decision] : undefined;
  const canSubmit = decisionLabel === "ALLOW";
  const submitting = tx.status === "wallet-confirmation" || tx.status === "pending";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-terminal-border bg-terminal-surface p-6">
        <div className="text-xs uppercase tracking-wide text-terminal-muted mb-4 font-medium">Policy Evaluation</div>

        <PolicyEquation
          positionValue={positionValue}
          collateralFactorBps={collateralFactorBps}
          riskAdjustmentBps={riskAdjustmentBps}
          effectiveCapacity={effectiveCapacity}
        />

        <div className="mt-4">
          <PolicyVerdict requestedAmount={parsedAmount} lifecycle={lifecycle} response={response} />
        </div>
      </div>

      <div className="rounded border border-terminal-border bg-terminal-surface p-4">
        <label
          htmlFor="borrow-amount"
          className="block text-xs uppercase tracking-wide text-terminal-muted mb-2"
        >
          Borrow Amount (USD)
        </label>
        <input
          id="borrow-amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-terminal-accent"
        />
        {tx.status === "wrong-network" ? (
          <button
            onClick={tx.switchToCorrectNetwork}
            className="w-full rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-terminal-accent-fg font-medium hover:opacity-90"
          >
            Switch Network
          </button>
        ) : (
          <button
            disabled={!address || !canSubmit || submitting}
            onClick={() =>
              tx.execute({
                address: LENDING_ADAPTER.address,
                abi: LENDING_ADAPTER.abi,
                functionName: "borrow",
                args: [parsedAmount],
              })
            }
            className="w-full rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-terminal-accent-fg font-medium hover:opacity-90 disabled:opacity-40"
          >
            {canSubmit ? "Borrow" : "Preview only -- adjust amount"}
          </button>
        )}
        <TransactionStatus status={tx.status} hash={tx.hash} message={tx.message} />
      </div>
    </div>
  );
}

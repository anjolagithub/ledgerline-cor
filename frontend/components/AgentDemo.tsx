"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { ASSET_ID, ONE, REGISTRY, LENDING_ADAPTER } from "@/lib/contracts";
import { evaluateAgentIntent, suggestRetryIntent, type AgentIntent, type AgentPolicyResult } from "@/lib/agentIntent";
import { useTransactionFlow } from "@/lib/useTransactionFlow";
import { PolicyEquation } from "./PolicyEquation";
import { PolicyVerdict } from "./PolicyVerdict";
import { TransactionStatus } from "./TransactionStatus";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/// Demonstrates the pipeline AGENT INTENT -> POLICY EVALUATION -> ONCHAIN
/// DECISION -> EXECUTION. Fixed to Action.BORROW (matching the required
/// demo flow exactly: request past capacity -> LIMIT -> retry at the
/// permitted amount -> ALLOW -> real execution) -- WITHDRAW/TRANSFER are
/// equally supported by evaluateAgentIntent/the SDK, just not exercised
/// by this specific demo. Reuses PolicyEquation/PolicyVerdict/
/// TransactionStatus/useTransactionFlow unmodified; the only new UI here
/// is the intent panel and the stage captions distinguishing offchain
/// intent from a real onchain read from a real onchain execution.
export function AgentDemo() {
  const { address } = useAccount();
  const [amount, setAmount] = useState("100000");
  const [result, setResult] = useState<AgentPolicyResult | undefined>();
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | undefined>();

  const positionId = address ? BigInt(address) : 0n;
  const { data: state } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "getAssetState",
    args: [ASSET_ID],
  }) as { data: { price: bigint; lifecycle: number; collateralFactorBps: bigint; riskAdjustmentBps: bigint } | undefined };
  const { data: position } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "getPosition",
    args: [ASSET_ID, positionId],
    query: { enabled: !!address },
  }) as { data: { rawBalance: bigint } | undefined };

  const positionValue = position && state ? (position.rawBalance * state.price) / ONE : undefined;
  const capacity =
    state && positionValue !== undefined
      ? (positionValue * state.collateralFactorBps * state.riskAdjustmentBps) / 100_000_000n
      : undefined;

  const intent: AgentIntent = {
    asset: "TSLA",
    positionId: address ?? ZERO_ADDRESS,
    action: "BORROW",
    amount,
    assetOut: "USDG",
  };

  const tx = useTransactionFlow();
  const submitting = tx.status === "wallet-confirmation" || tx.status === "pending";

  async function handleEvaluate(nextAmount: string) {
    setEvaluating(true);
    setEvalError(undefined);
    try {
      const evaluated = await evaluateAgentIntent({ ...intent, amount: nextAmount });
      setResult(evaluated);
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "Evaluation failed");
      setResult(undefined);
    } finally {
      setEvaluating(false);
    }
  }

  const retryIntent = result ? suggestRetryIntent(intent, result) : undefined;
  // Gate execution on a decision evaluated for the amount currently shown
  // -- editing the amount clears `result`, so this can never be true for
  // a stale (already-superseded) evaluation.
  const canExecute = !!address && result?.decision === "ALLOW" && result.requestedAmount === amount;

  return (
    <section
      id="agent-demo"
      className="console-shell scroll-mt-24 border border-terminal-border bg-terminal-surface p-5 md:p-7"
      aria-labelledby="agent-demo-title"
    >
      <div className="mb-7 border-b border-terminal-border pb-5">
        <p className="eyebrow">Agent-facing intent layer</p>
        <h2 id="agent-demo-title" className="mt-2 text-2xl font-semibold tracking-tight">
          Agent Intent → Policy → Execution
        </h2>
        <p className="mt-2 max-w-xl text-sm text-terminal-muted">
          The agent proposes the action. CortexRails determines whether it&apos;s permitted -- through the exact
          same onchain <code className="font-mono text-terminal-text">canExecute()</code> read the Policy Console
          above uses, not a separate simulation.
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded border border-dashed border-terminal-border bg-terminal-bg p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-terminal-muted">Offchain agent intent</span>
            <span className="font-mono text-[10px] text-terminal-muted">not yet read from chain</span>
          </div>
          <pre className="overflow-x-auto font-mono text-xs leading-6 text-terminal-text">
            {JSON.stringify(
              {
                asset: intent.asset,
                positionId: address ?? "-- connect a wallet --",
                action: intent.action,
                amount: intent.amount,
                assetOut: intent.assetOut,
              },
              null,
              2
            )}
          </pre>
          <label htmlFor="agent-amount" className="mt-3 block text-xs uppercase tracking-wide text-terminal-muted">
            Amount (USDG)
          </label>
          <input
            id="agent-amount"
            type="number"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setResult(undefined);
            }}
            className="mt-2 w-full rounded border border-terminal-border bg-terminal-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terminal-accent"
          />
          <button
            type="button"
            disabled={!address || !amount || evaluating}
            onClick={() => handleEvaluate(amount)}
            className="mt-3 w-full rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-terminal-accent-fg font-medium hover:opacity-90 disabled:opacity-40"
          >
            {evaluating ? "Evaluating…" : "Submit Intent"}
          </button>
          {!address && <p className="mt-2 text-xs text-terminal-muted">Connect a wallet to submit an intent.</p>}
        </div>

        {evalError && (
          <div className="border border-terminal-border bg-terminal-bg px-4 py-4 text-sm text-decision-block">{evalError}</div>
        )}

        {result && result.requestedAmount === amount && (
          <div className="rounded-lg border-2 border-terminal-border bg-terminal-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-terminal-muted font-medium">
                Live onchain policy result
              </span>
              <span className="font-mono text-[10px] text-terminal-muted">canExecute()</span>
            </div>
            <PolicyEquation
              positionValue={positionValue}
              collateralFactorBps={state?.collateralFactorBps}
              riskAdjustmentBps={state?.riskAdjustmentBps}
              effectiveCapacity={capacity}
            />
            <div className="mt-4">
              <PolicyVerdict requestedAmount={parseUnits(amount, 18)} lifecycle={state?.lifecycle} response={result.raw} />
            </div>
            {retryIntent && (
              <button
                type="button"
                onClick={() => {
                  setAmount(retryIntent.amount);
                  handleEvaluate(retryIntent.amount);
                }}
                className="mt-4 w-full rounded border border-terminal-border px-3 py-2 text-xs uppercase tracking-wide hover:bg-terminal-bg"
              >
                Retry with permitted amount (${retryIntent.amount})
              </button>
            )}
          </div>
        )}

        {canExecute && (
          <div className="rounded border border-terminal-border bg-terminal-bg p-4">
            <div className="mb-3 text-xs uppercase tracking-wide text-terminal-muted">Live onchain execution</div>
            {tx.status === "wrong-network" ? (
              <button
                onClick={tx.switchToCorrectNetwork}
                className="w-full rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-terminal-accent-fg font-medium hover:opacity-90"
              >
                Switch Network
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  tx.execute({
                    address: LENDING_ADAPTER.address,
                    abi: LENDING_ADAPTER.abi,
                    functionName: "borrow",
                    args: [parseUnits(amount, 18)],
                  })
                }
                className="w-full rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-terminal-accent-fg font-medium hover:opacity-90 disabled:opacity-40"
              >
                Execute Borrow
              </button>
            )}
            <TransactionStatus status={tx.status} hash={tx.hash} message={tx.message} />
          </div>
        )}
      </div>
    </section>
  );
}

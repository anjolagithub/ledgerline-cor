"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ASSET_ID, DECISION_LABELS, ONE, POLICY, REGISTRY, formatUnits18, bpsToPercent, LIFECYCLE_LABELS } from "@/lib/contracts";
import { DECISION_REASON, type Decision } from "@/lib/ledgerline-types";
import { ConnectButton } from "./ConnectButton";
import { BorrowForm } from "./BorrowForm";

export function PolicyConsole() {
  const { address } = useAccount();
  const [amount, setAmount] = useState("100000");
  const [operatorMode, setOperatorMode] = useState(false);
  const [demoLifecycle, setDemoLifecycle] = useState<number | undefined>();
  const parsedAmount = amount && Number.isFinite(Number(amount)) ? BigInt(Math.max(0, Math.floor(Number(amount)))) * ONE : 0n;
  const positionId = address ? BigInt(address) : 0n;
  const { data: state } = useReadContract({ address: REGISTRY.address, abi: REGISTRY.abi, functionName: "getAssetState", args: [ASSET_ID] }) as { data: { price: bigint; lifecycle: number; collateralFactorBps: bigint; riskAdjustmentBps: bigint } | undefined };
  const { data: position } = useReadContract({ address: REGISTRY.address, abi: REGISTRY.abi, functionName: "getPosition", args: [ASSET_ID, positionId], query: { enabled: !!address } }) as { data: { rawBalance: bigint } | undefined };
  const lifecycle = demoLifecycle ?? state?.lifecycle;
  const positionValue = position && state ? (position.rawBalance * state.price) / ONE : 200000n * ONE;
  const capacity = state ? (positionValue * state.collateralFactorBps * state.riskAdjustmentBps) / 100000000n : 112000n * ONE;
  const localDecision: Decision = lifecycle === 3 ? "BLOCK" : parsedAmount <= capacity ? "ALLOW" : "LIMIT";
  const reason = DECISION_REASON[localDecision];
  const decisionClass = localDecision === "ALLOW" ? "text-decision-allow" : localDecision === "LIMIT" ? "text-decision-limit" : localDecision === "BLOCK" ? "text-decision-block" : "text-decision-review";
  const displayLifecycle = lifecycle === undefined ? "--" : LIFECYCLE_LABELS[lifecycle];

  return <section id="policy-console" className="console-shell scroll-mt-24 border border-terminal-border bg-terminal-surface p-5 md:p-7" aria-labelledby="policy-console-title">
    <div className="mb-7 flex flex-col gap-4 border-b border-terminal-border pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow">Policy evaluation</p><h2 id="policy-console-title" className="mt-2 text-2xl font-semibold tracking-tight">Policy Console</h2><p className="mt-2 max-w-xl text-sm text-terminal-muted">Derived from LedgerLine contracts before any financial action executes.</p></div><ConnectButton /></div>
    <div className="grid gap-7 xl:grid-cols-[1.05fr_.95fr]">
      <div className="space-y-6">
        <div className="console-data-grid"><div><span>Asset</span><strong>AAPL</strong><small>Robinhood Stock Token</small></div><div><span>Lifecycle</span><strong className="text-decision-allow">● {displayLifecycle}</strong><small>Oracle ● HEALTHY</small></div><div><span>Price</span><strong>$200.00</strong><small>Position {position ? formatUnits18(position.rawBalance) : "1,000"} AAPL</small></div><div><span>Position value</span><strong>${formatUnits18(positionValue)}</strong><small>Collateral factor {bpsToPercent(state?.collateralFactorBps ?? 7000n)}</small></div></div>
        <div className="border border-terminal-border bg-terminal-bg p-4"><div className="mb-3 flex items-center justify-between"><label htmlFor="console-borrow-amount" className="eyebrow">Borrow asset · USDG</label><span className="font-mono text-[10px] text-terminal-muted">REQUEST</span></div><div className="flex items-center border border-terminal-border bg-terminal-surface"><span className="pl-3 text-terminal-muted">$</span><input id="console-borrow-amount" type="number" min="0" step="1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-transparent px-2 py-3 font-mono text-lg focus:outline-none" aria-describedby="capacity-note" /></div><p id="capacity-note" className="mt-3 font-mono text-xs text-terminal-muted">Effective borrowing capacity <strong className="text-terminal-text">${formatUnits18(capacity)}</strong></p></div>
        <div className="flex items-center justify-between border-t border-terminal-border pt-4"><button type="button" className="font-mono text-[10px] uppercase tracking-[.12em] text-terminal-muted underline-offset-4 hover:text-terminal-text hover:underline" onClick={() => setOperatorMode((value) => !value)} aria-expanded={operatorMode}>Operator mode {operatorMode ? "−" : "+"}</button>{operatorMode && <select aria-label="Change demo lifecycle" value={demoLifecycle ?? lifecycle ?? 0} onChange={(e) => setDemoLifecycle(Number(e.target.value))} className="border border-terminal-border bg-terminal-bg px-2 py-2 font-mono text-[10px] text-terminal-text"><option value="0">ACTIVE</option><option value="1">RESTRICTED</option><option value="2">CORPORATE ACTION</option><option value="3">SUSPENDED</option><option value="4">MATURING</option></select>}</div>
      </div>
      <div className="decision-panel border border-terminal-border bg-terminal-bg p-5" aria-live="polite"><div className="mb-7 flex items-center justify-between"><span className="eyebrow">Policy decision</span><span className="font-mono text-[10px] text-terminal-muted">canExecute()</span></div><div className={`decision-word ${decisionClass}`}>{localDecision}</div><div className="mt-5 space-y-3 border-t border-terminal-border pt-5 font-mono text-xs"><div className="flex justify-between"><span className="text-terminal-muted">Maximum permitted</span><strong>${formatUnits18(localDecision === "BLOCK" ? 0n : capacity)}</strong></div><div><span className="text-terminal-muted">Reason</span><p className="mt-1 text-terminal-text">{reason}</p></div></div><div className="mt-7"><BorrowForm positionValue={positionValue} collateralFactorBps={state?.collateralFactorBps ?? 7000n} riskAdjustmentBps={state?.riskAdjustmentBps ?? 8000n} effectiveCapacity={capacity} lifecycle={lifecycle} /></div></div>
    </div>
    <div className="mt-7 border-t border-terminal-border pt-5"><div className="flex items-center justify-between"><h3 className="eyebrow">Recent activity</h3><span className="font-mono text-[10px] text-terminal-muted">ONCHAIN EVENTS</span></div><p className="mt-3 text-sm text-terminal-muted">No activity recorded yet. Policy evaluations and confirmed transactions will appear here.</p></div>
  </section>;
}

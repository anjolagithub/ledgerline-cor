"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ASSET_ID, ONE, REGISTRY, STOCK_TOKEN, formatUnits18, bpsToPercent, LIFECYCLE_LABELS } from "@/lib/contracts";
import { ConnectButton } from "./ConnectButton";
import { DepositForm } from "./DepositForm";
import { BorrowForm } from "./BorrowForm";
import { WithdrawForm } from "./WithdrawForm";

export function PolicyConsole() {
  const { address } = useAccount();
  const [operatorMode, setOperatorMode] = useState(false);
  const [demoLifecycle, setDemoLifecycle] = useState<number | undefined>();
  const positionId = address ? BigInt(address) : 0n;
  const { data: state } = useReadContract({ address: REGISTRY.address, abi: REGISTRY.abi, functionName: "getAssetState", args: [ASSET_ID] }) as { data: { price: bigint; lifecycle: number; collateralFactorBps: bigint; riskAdjustmentBps: bigint } | undefined };
  const { data: position } = useReadContract({ address: REGISTRY.address, abi: REGISTRY.abi, functionName: "getPosition", args: [ASSET_ID, positionId], query: { enabled: !!address } }) as { data: { rawBalance: bigint } | undefined };
  const { data: symbol } = useReadContract({ address: STOCK_TOKEN.address, abi: STOCK_TOKEN.abi, functionName: "symbol" }) as { data: string | undefined };
  const lifecycle = demoLifecycle ?? state?.lifecycle;
  const positionValue = position && state ? (position.rawBalance * state.price) / ONE : undefined;
  const capacity = state && positionValue !== undefined ? (positionValue * state.collateralFactorBps * state.riskAdjustmentBps) / 100000000n : undefined;
  const displayLifecycle = lifecycle === undefined ? "--" : LIFECYCLE_LABELS[lifecycle];

  return <section id="policy-console" className="console-shell scroll-mt-24 border border-terminal-border bg-terminal-surface p-5 md:p-7" aria-labelledby="policy-console-title">
    <div className="mb-7 flex flex-col gap-4 border-b border-terminal-border pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow">Policy evaluation</p><h2 id="policy-console-title" className="mt-2 text-2xl font-semibold tracking-tight">Policy Console</h2><p className="mt-2 max-w-xl text-sm text-terminal-muted">Derived from LedgerLine contracts before any financial action executes.</p></div><ConnectButton /></div>
    <div className="space-y-6">
      <div className="console-data-grid"><div><span>Asset</span><strong>{symbol ?? "--"}</strong><small>Robinhood Stock Token</small></div><div><span>Lifecycle</span><strong className="text-decision-allow">● {displayLifecycle}</strong><small>Oracle ● HEALTHY</small></div><div><span>Price</span><strong>${formatUnits18(state?.price)}</strong><small>Position {formatUnits18(position?.rawBalance)} {symbol ?? ""}</small></div><div><span>Position value</span><strong>${formatUnits18(positionValue)}</strong><small>Collateral factor {bpsToPercent(state?.collateralFactorBps)}</small></div></div>
      <DepositForm />
      <div className="flex items-center justify-between border-t border-terminal-border pt-4"><button type="button" className="font-mono text-[10px] uppercase tracking-[.12em] text-terminal-muted underline-offset-4 hover:text-terminal-text hover:underline" onClick={() => setOperatorMode((value) => !value)} aria-expanded={operatorMode}>Operator mode {operatorMode ? "−" : "+"}</button>{operatorMode && <select aria-label="Change demo lifecycle" value={demoLifecycle ?? lifecycle ?? 0} onChange={(e) => setDemoLifecycle(Number(e.target.value))} className="border border-terminal-border bg-terminal-bg px-2 py-2 font-mono text-[10px] text-terminal-text"><option value="0">ACTIVE</option><option value="1">RESTRICTED</option><option value="2">CORPORATE ACTION</option><option value="3">SUSPENDED</option><option value="4">MATURING</option></select>}</div>
      <div className="grid gap-7 xl:grid-cols-2">
        <div className="decision-panel border border-terminal-border bg-terminal-bg p-5" aria-live="polite"><div className="mb-7 flex items-center justify-between"><span className="eyebrow">Policy decision · Borrow</span><span className="font-mono text-[10px] text-terminal-muted">canExecute()</span></div><BorrowForm positionValue={positionValue} collateralFactorBps={state?.collateralFactorBps} riskAdjustmentBps={state?.riskAdjustmentBps} effectiveCapacity={capacity} lifecycle={lifecycle} /></div>
        <div className="decision-panel border border-terminal-border bg-terminal-bg p-5" aria-live="polite"><div className="mb-7 flex items-center justify-between"><span className="eyebrow">Policy decision · Withdraw</span><span className="font-mono text-[10px] text-terminal-muted">withdraw()</span></div><WithdrawForm positionRawBalance={position?.rawBalance} symbol={symbol} lifecycle={lifecycle} /></div>
      </div>
    </div>
    <div className="mt-7 border-t border-terminal-border pt-5"><div className="flex items-center justify-between"><h3 className="eyebrow">Recent activity</h3><span className="font-mono text-[10px] text-terminal-muted">ONCHAIN EVENTS</span></div><p className="mt-3 text-sm text-terminal-muted">No activity recorded yet. Policy evaluations and confirmed transactions will appear here.</p></div>
  </section>;
}

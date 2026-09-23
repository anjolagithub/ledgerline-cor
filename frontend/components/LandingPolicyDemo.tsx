"use client";

import { useMemo, useState } from "react";

const STATES = {
  ACTIVE: { label: "TSLA Stock Token", risk: 80, state: "ACTIVE" },
  RESTRICTED: { label: "TSLA Split", risk: 0, state: "RESTRICTED" },
  RISK_DELTA: { label: "Volatility Spike", risk: 50, state: "RISK_DELTA" },
} as const;

type AssetState = keyof typeof STATES;

export function LandingPolicyDemo() {
  const [assetState, setAssetState] = useState<AssetState>("ACTIVE");
  const [amount, setAmount] = useState("100000");
  const requested = Number(amount) || 0;
  const config = STATES[assetState];
  const capacity = Math.floor((200_000 * 0.7 * config.risk) / 100);
  const decision = assetState === "RESTRICTED" ? "BLOCK" : requested <= capacity ? "ALLOW" : "LIMIT";
  const tone = decision === "ALLOW" ? "allow" : decision === "LIMIT" ? "limit" : "block";
  const toneClass = decision === "ALLOW" ? "text-decision-allow" : decision === "LIMIT" ? "text-decision-limit" : "text-decision-block";
  const reason = decision === "ALLOW" ? "0x00_SUCCESS" : decision === "LIMIT" ? `0x4C_EXCEEDS_CAPACITY_MAX_${capacity}` : "0x43_ASSET_STATE_RESTRICTED";
  const timestamp = useMemo(() => "13:41:38", [assetState, amount]);

  return (
    <div className="policy-demo border border-terminal-border bg-terminal-surface p-5 md:p-7">
      <div className="mb-6 flex items-center justify-between border-b border-terminal-border pb-4">
        <div className="flex items-center gap-3"><span className="size-2 rounded-full bg-decision-allow" /><span className="font-mono text-[10px] uppercase tracking-[.14em] text-terminal-muted">Policy evaluation</span></div>
        <span className="font-mono text-[10px] text-terminal-muted">LIVE / SIMULATION</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
        <section className="flex flex-col gap-5" aria-label="Policy evaluation configuration">
          <div><label htmlFor="asset-state" className="eyebrow">Asset state</label><select id="asset-state" value={assetState} onChange={(event) => setAssetState(event.target.value as AssetState)} className="mt-2 w-full border border-terminal-border bg-terminal-bg px-3 py-3 font-mono text-xs text-terminal-text focus:outline-none"><option value="ACTIVE">TSLA Stock Token (ACTIVE)</option><option value="RESTRICTED">TSLA Split (RESTRICTED)</option><option value="RISK_DELTA">Volatility Spike (RISK_DELTA)</option></select></div>
          <div className="border border-terminal-border bg-terminal-bg p-4"><div className="mb-4 flex items-center justify-between"><span className="eyebrow">Capacity model</span><span className="font-mono text-[10px] text-terminal-muted">USDG</span></div><div className="grid gap-3 font-mono text-xs"><div className="flex justify-between"><span className="text-terminal-muted">Position value</span><span>$200,000</span></div><div className="flex justify-between"><span className="text-terminal-muted">Collateral factor</span><span>70%</span></div><div className="flex justify-between"><span className="text-terminal-muted">Risk adjustment</span><span>{config.risk}%</span></div><div className="mt-2 flex justify-between border-t border-terminal-border pt-3"><span className="text-terminal-muted">Effective capacity</span><strong className={assetState === "RESTRICTED" ? "text-terminal-muted" : "text-terminal-accent"}>{assetState === "RESTRICTED" ? "—" : `$${capacity.toLocaleString()}`}</strong></div></div></div>
          <div><label htmlFor="landing-demo-amount" className="eyebrow">Requested borrow amount</label><div className="mt-2 flex items-center border border-terminal-border bg-terminal-bg"><span className="pl-3 text-terminal-muted">$</span><input id="landing-demo-amount" type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full bg-transparent px-2 py-3 font-mono text-sm focus:outline-none" /></div></div>
        </section>
        <section className={`terminal-panel border border-terminal-border bg-[#080b10] ${tone}`} aria-label="LedgerLine node terminal"><div className="flex items-center gap-1.5 border-b border-terminal-border px-4 py-3"><span className="size-2 rounded-full bg-decision-block/60" /><span className="size-2 rounded-full bg-decision-limit/60" /><span className="size-2 rounded-full bg-decision-allow/60" /><span className="ml-2 font-mono text-[10px] text-terminal-muted">ledgerline-node-v1.0.sh</span></div><div className="flex min-h-[252px] flex-col justify-between gap-6 p-4 font-mono text-[10px] leading-6"><div className="text-terminal-muted"><div><span className="text-terminal-accent">{timestamp}</span> canExecute()</div><div>assetState: <span className="text-terminal-text">{config.state}</span></div><div>requested: <span className="text-terminal-text">${requested.toLocaleString()} USDG</span></div></div><div className="border-l-2 border-terminal-border pl-4"><div className={`mb-2 text-2xl font-bold ${toneClass}`}>{decision}</div><div className="text-terminal-muted">{"{"}</div><div className="pl-3 text-terminal-muted">decision: <span className={toneClass}>{decision}</span>,</div><div className="pl-3 text-terminal-muted">permittedAmount: <span className="text-terminal-text">{decision === "BLOCK" ? 0 : decision === "LIMIT" ? capacity : requested}</span>,</div><div className="pl-3 text-terminal-muted">reasonCode: <span className="text-terminal-text">{reason}</span></div><div className="text-terminal-muted">{"}"}</div></div></div></section>
      </div>
      <p className="mt-5 border-t border-terminal-border pt-4 text-[10px] leading-5 text-terminal-muted">A deterministic policy result before a financial action executes. No live transaction is being sent.</p>
    </div>
  );
}

"use client";

import { useState } from "react";

const POSITION_VALUE = 200_000;
const COLLATERAL_BPS = 7000;
const RISK_BPS = 8000;
const EFFECTIVE_CAPACITY = Math.floor((POSITION_VALUE * COLLATERAL_BPS) / 10000 * RISK_BPS / 10000);

export function LandingPolicyDemo() {
  const [amount, setAmount] = useState("100000");
  const requested = Number(amount) || 0;
  const decision = requested === 0 ? undefined : requested <= EFFECTIVE_CAPACITY ? "ALLOW" : "LIMIT";

  return (
    <div className="policy-demo border border-terminal-border bg-terminal-surface p-5 shadow-[0_24px_80px_rgba(0,0,0,.22)] md:p-8">
      <div className="mb-6 flex items-center justify-between border-b border-terminal-border pb-4"><div className="flex items-center gap-3"><span className="size-2 bg-terminal-accent" /><span className="font-mono text-[10px] uppercase tracking-[.14em] text-terminal-muted">Policy evaluation</span></div><span className="font-mono text-[10px] text-terminal-muted">ILLUSTRATIVE</span></div>
      <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-center"><div><span className="eyebrow">Position value</span><div className="mt-2 font-mono text-3xl font-semibold tabular-nums">$200,000</div></div><div className="font-mono text-xl text-terminal-accent">×</div><div><span className="eyebrow">Collateral factor</span><div className="mt-2 font-mono text-3xl font-semibold tabular-nums">70%</div></div></div>
      <div className="mt-6 grid gap-5 border-t border-terminal-border pt-6 md:grid-cols-[1fr_auto_1fr] md:items-center"><div><span className="eyebrow">Risk adjustment</span><div className="mt-2 font-mono text-3xl font-semibold tabular-nums">80%</div></div><div className="hidden font-mono text-xl text-terminal-accent md:block">=</div><div className="md:text-right"><span className="eyebrow">Effective capacity</span><div className="mt-2 font-mono text-4xl font-semibold tabular-nums text-terminal-accent">$112,000</div></div></div>
      <div className="mt-8 border-t border-terminal-border pt-6"><label htmlFor="landing-demo-amount" className="mb-2 block font-mono text-[10px] uppercase tracking-[.14em] text-terminal-muted">Requested borrow amount</label><div className="flex items-center border border-terminal-border bg-terminal-bg"><span className="pl-3 text-terminal-muted">$</span><input id="landing-demo-amount" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-transparent px-2 py-3 font-mono text-sm focus:outline-none" /></div></div>
      {decision && <div className="mt-6 flex items-end justify-between border-t border-terminal-border pt-5"><div><span className="font-mono text-[10px] uppercase tracking-[.14em] text-terminal-muted">Decision returned</span><div className="mt-2 text-sm text-terminal-muted">{decision === "ALLOW" ? "Within permitted capacity" : "Exceeds permitted capacity"}</div></div><div className="text-right"><div className={`font-mono text-3xl font-bold ${decision === "ALLOW" ? "text-decision-allow" : "text-decision-limit"}`}>{decision}</div>{decision === "LIMIT" && <div className="mt-1 font-mono text-[10px] text-terminal-muted">MAX $112,000</div>}</div></div>}
      <p className="mt-6 text-[10px] leading-5 text-terminal-muted">A clear policy result before a financial action executes. No live transaction is being sent.</p>
    </div>
  );
}

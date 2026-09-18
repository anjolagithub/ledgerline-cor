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
    <div className="border border-terminal-border bg-terminal-surface p-5 md:p-6">
      <div className="mb-5 flex items-center justify-between border-b border-terminal-border pb-4"><div className="flex items-center gap-2"><span className="size-2 bg-decision-allow" /><span className="font-mono text-[10px] uppercase tracking-[.14em] text-terminal-muted">Policy simulator</span></div><span className="font-mono text-[10px] text-terminal-muted">LIVE EXAMPLE</span></div>
      <div className="bg-terminal-surface2 p-5"><div className="flex items-baseline justify-between"><span className="text-xs uppercase tracking-wide text-terminal-muted">Position value</span><span className="font-mono text-2xl font-semibold">${POSITION_VALUE.toLocaleString()}</span></div><div className="mt-5 space-y-3 pl-4 text-sm text-terminal-muted"><div className="flex justify-between"><span>× Collateral factor</span><span className="font-mono">{COLLATERAL_BPS / 100}%</span></div><div className="flex justify-between"><span>× Risk adjustment</span><span className="font-mono">{RISK_BPS / 100}%</span></div></div><div className="mt-5 flex items-baseline justify-between border-t border-terminal-border pt-4"><span className="text-xs uppercase tracking-wide text-terminal-muted">Effective capacity</span><span className="font-mono text-3xl font-semibold text-terminal-accent">${EFFECTIVE_CAPACITY.toLocaleString()}</span></div></div>
      <div className="mt-5"><label htmlFor="landing-demo-amount" className="mb-2 block font-mono text-[10px] uppercase tracking-[.14em] text-terminal-muted">Borrow amount (USD)</label><div className="flex items-center border border-terminal-border bg-terminal-bg"><span className="pl-3 text-terminal-muted">$</span><input id="landing-demo-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-transparent px-2 py-3 font-mono text-sm focus:outline-none" /></div></div>
      {decision && <div className="mt-5 flex items-center justify-between border-t border-terminal-border pt-5"><span className="font-mono text-[10px] uppercase tracking-[.14em] text-terminal-muted">Decision returned</span><div className="text-right"><div className={`font-mono text-2xl font-bold ${decision === "ALLOW" ? "text-decision-allow" : "text-decision-limit"}`}>{decision}</div>{decision === "LIMIT" && <div className="mt-1 text-[10px] text-terminal-muted">Max ${EFFECTIVE_CAPACITY.toLocaleString()}</div>}</div></div>}
      <p className="mt-5 text-[10px] leading-5 text-terminal-muted">Illustrative numbers from the LedgerLine policy model. Not a live transaction.</p>
    </div>
  );
}

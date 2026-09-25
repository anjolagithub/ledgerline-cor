"use client";

import { useState } from "react";

/// Local, in-browser mirror of LedgerLinePolicy.canExecute()'s BORROW
/// branch — no chain call. Rules and reason strings are copied from
/// contracts/src/LedgerLinePolicy.sol / LedgerLineTypes.sol:
///   lifecycle != ACTIVE      -> BLOCK, permittedAmount 0, reason = state
///   capacity == 0            -> BLOCK, permittedAmount 0, "NO_CAPACITY"
///   amount <= capacity       -> ALLOW, permittedAmount = capacity, "OK"
///   otherwise                -> LIMIT, permittedAmount = capacity, "EXCEEDS_CAPACITY"
/// permittedAmount is always the maximum, never the request echoed back.
const LIFECYCLES = ["ACTIVE", "RESTRICTED", "CORPORATE_ACTION", "SUSPENDED", "MATURING", "REDEEMABLE", "REDEEMED"] as const;
type Lifecycle = (typeof LIFECYCLES)[number];

// Illustrative position; 70% / 80% match the live testnet Registry config.
const POSITION_VALUE = 200_000;
const COLLATERAL_FACTOR_BPS = 7_000;
const RISK_OPTIONS = [
  { bps: 8_000, label: "80% (testnet config)" },
  { bps: 5_000, label: "50% (operator update)" },
  { bps: 0, label: "0% (operator update)" },
];

const TONE = {
  ALLOW: "text-decision-allow",
  LIMIT: "text-decision-limit",
  BLOCK: "text-decision-block",
} as const;

export function LandingPolicyDemo() {
  const [lifecycle, setLifecycle] = useState<Lifecycle>("ACTIVE");
  const [riskBps, setRiskBps] = useState(8_000);
  const [amount, setAmount] = useState("120000");
  const requested = Number(amount) || 0;
  const capacity = Math.floor((POSITION_VALUE * COLLATERAL_FACTOR_BPS * riskBps) / 100_000_000);

  let decision: keyof typeof TONE;
  let permitted: number;
  let reason: string;
  if (lifecycle !== "ACTIVE") {
    [decision, permitted, reason] = ["BLOCK", 0, lifecycle];
  } else if (capacity === 0) {
    [decision, permitted, reason] = ["BLOCK", 0, "NO_CAPACITY"];
  } else if (requested <= capacity) {
    [decision, permitted, reason] = ["ALLOW", capacity, "OK"];
  } else {
    [decision, permitted, reason] = ["LIMIT", capacity, "EXCEEDS_CAPACITY"];
  }
  const toneClass = TONE[decision];

  return (
    <div className="code-card p-5 md:p-7">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-terminal-border pb-4">
        <span className="font-mono text-[10px] uppercase tracking-[.14em] text-terminal-muted">Policy simulation · Action.BORROW</span>
        <span className="font-mono text-[10px] text-terminal-muted">Runs in your browser · no chain call</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
        <section className="flex flex-col gap-5" aria-label="Policy simulation inputs">
          <div>
            <label htmlFor="sim-lifecycle" className="eyebrow">Asset lifecycle</label>
            <select id="sim-lifecycle" value={lifecycle} onChange={(e) => setLifecycle(e.target.value as Lifecycle)} className="select-field mt-2">
              {LIFECYCLES.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sim-risk" className="eyebrow">Risk adjustment</label>
            <select id="sim-risk" value={riskBps} onChange={(e) => setRiskBps(Number(e.target.value))} className="select-field mt-2">
              {RISK_OPTIONS.map((option) => <option key={option.bps} value={option.bps}>{option.label}</option>)}
            </select>
          </div>
          <div className="rounded-[.75rem] border border-terminal-border bg-terminal-bg p-4">
            <div className="grid gap-3 font-mono text-xs">
              <div className="flex justify-between"><span className="text-terminal-muted">Position value</span><span>${POSITION_VALUE.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-terminal-muted">× Collateral factor</span><span>70%</span></div>
              <div className="flex justify-between"><span className="text-terminal-muted">× Risk adjustment</span><span>{riskBps / 100}%</span></div>
              <div className="mt-1 flex justify-between border-t border-terminal-border pt-3"><span className="text-terminal-muted">Borrowing capacity</span><strong className="text-terminal-accent">${capacity.toLocaleString()}</strong></div>
            </div>
          </div>
          <div>
            <label htmlFor="landing-demo-amount" className="eyebrow">Requested borrow (USDG)</label>
            <div className="field-prefix-group mt-2"><input id="landing-demo-amount" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="field-input font-mono text-sm" /></div>
          </div>
        </section>
        <section className="flex flex-col justify-between gap-6 rounded-[.75rem] border border-terminal-border bg-terminal-bg p-5 font-mono text-xs leading-6" aria-label="Simulated PolicyResponse" aria-live="polite">
          <div className="text-terminal-muted">
            <div>canExecute(1, positionId, BORROW, {requested.toLocaleString()})</div>
            <div>lifecycle: <span className="text-terminal-text">{lifecycle}</span></div>
          </div>
          <div className="border-l-2 border-terminal-border pl-4">
            <div className={`mb-3 text-3xl font-bold tracking-tight ${toneClass}`}>{decision}</div>
            <div className="text-terminal-muted">PolicyResponse {"{"}</div>
            <div className="pl-3 text-terminal-muted">decision: <span className={toneClass}>{decision}</span></div>
            <div className="pl-3 text-terminal-muted">permittedAmount: <span className="text-terminal-text">{permitted.toLocaleString()}</span></div>
            <div className="pl-3 text-terminal-muted">reason: <span className="text-terminal-text">&quot;{reason}&quot;</span></div>
            <div className="text-terminal-muted">{"}"}</div>
          </div>
        </section>
      </div>
      <p className="mt-5 border-t border-terminal-border pt-4 text-[11px] leading-5 text-terminal-muted">
        Same rules and reason codes as <code className="font-mono text-terminal-text">LedgerLinePolicy.canExecute()</code> for BORROW, applied to an illustrative $200,000 position. The policy engine at <code className="font-mono text-terminal-text">/app</code> reads the deployed contract live.
      </p>
    </div>
  );
}

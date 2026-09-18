"use client";

import { useState } from "react";

// Illustrative example using the spec's own worked numbers (Section
// 5.1/5.4). Uses the exact same formula as LedgerLinePolicy.sol and the
// real Stylus engines -- position x collateral x risk -- but computed
// client-side with fixed inputs, not read from a live contract. Labeled
// as such rather than implying it's a live call.
const POSITION_VALUE = 200_000;
const COLLATERAL_BPS = 7000;
const RISK_BPS = 8000;
const EFFECTIVE_CAPACITY = Math.floor((POSITION_VALUE * COLLATERAL_BPS) / 10000 * RISK_BPS / 10000);

export function LandingPolicyDemo() {
  const [amount, setAmount] = useState("100000");
  const requested = Number(amount) || 0;
  const decision = requested === 0 ? undefined : requested <= EFFECTIVE_CAPACITY ? "ALLOW" : "LIMIT";

  return (
    <div className="rounded-lg border-2 border-terminal-border bg-terminal-surface p-6 space-y-4">
      <div className="text-xs uppercase tracking-wide text-terminal-muted">
        Interactive example -- illustrative numbers, not a live transaction
      </div>

      <div className="rounded border border-terminal-border bg-terminal-surface2 p-4 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-terminal-muted">Position Value</span>
          <span className="font-mono tabular-nums text-2xl font-semibold">
            ${POSITION_VALUE.toLocaleString()}
          </span>
        </div>
        <div className="flex items-baseline justify-between text-terminal-muted pl-4 text-sm">
          <span>&times; Collateral Factor</span>
          <span className="font-mono tabular-nums">{COLLATERAL_BPS / 100}%</span>
        </div>
        <div className="flex items-baseline justify-between text-terminal-muted pl-4 text-sm">
          <span>&times; Risk Adjustment</span>
          <span className="font-mono tabular-nums">{RISK_BPS / 100}%</span>
        </div>
        <div className="border-t border-terminal-border pt-2 flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-terminal-muted">Effective Capacity</span>
          <span className="font-mono tabular-nums text-3xl font-semibold">
            ${EFFECTIVE_CAPACITY.toLocaleString()}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor="landing-demo-amount" className="block text-xs uppercase tracking-wide text-terminal-muted mb-2">
          Borrow Amount (USD)
        </label>
        <input
          id="landing-demo-amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terminal-accent"
        />
      </div>

      {decision && (
        <div className="border-t border-terminal-border pt-4 text-center">
          <div
            className={`text-4xl font-bold ${
              decision === "ALLOW" ? "text-decision-allow" : "text-decision-limit"
            }`}
          >
            {decision}
          </div>
          {decision === "LIMIT" && (
            <div className="mt-1 text-xs text-terminal-muted">
              Maximum permitted ${EFFECTIVE_CAPACITY.toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

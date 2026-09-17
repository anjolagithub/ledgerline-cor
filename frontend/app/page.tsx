import Link from "next/link";

export default function Landing() {
  return (
    <main className="mx-auto max-w-3xl px-3 md:px-6 py-16 md:py-24 space-y-16">
      <div className="space-y-6">
        <div className="text-xs uppercase tracking-wide text-terminal-muted">LedgerLine Core</div>
        <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
          LedgerLine Core lets DeFi protocols safely use tokenized real-world
          assets by turning asset lifecycle and position risk into
          executable onchain policy.
        </h1>
        <p className="text-sm text-terminal-muted max-w-xl">
          Robinhood Chain Stock Tokens are the first deep integration and
          proving ground -- not the entirety of LedgerLine. The core
          position, risk, and policy interfaces remain chain-agnostic and
          RWA-agnostic by design.
        </p>
        <Link
          href="/app"
          className="inline-block rounded bg-terminal-accent px-5 py-2.5 text-xs uppercase tracking-wide text-white hover:opacity-90"
        >
          Launch App
        </Link>
      </div>

      <div className="rounded border border-terminal-border bg-terminal-surface2 p-6">
        <div className="text-xs uppercase tracking-wide text-terminal-muted mb-4">
          The Core Abstraction
        </div>
        <div className="font-mono text-sm md:text-base leading-relaxed">
          <div className="text-terminal-text">
            Asset State + Position + Risk + Action + Amount
          </div>
          <div className="text-terminal-muted my-1">&darr;</div>
          <div className="flex flex-wrap gap-3">
            <span className="text-decision-allow">ALLOW</span>
            <span className="text-terminal-muted">/</span>
            <span className="text-decision-limit">LIMIT</span>
            <span className="text-terminal-muted">/</span>
            <span className="text-decision-review">REVIEW</span>
            <span className="text-terminal-muted">/</span>
            <span className="text-decision-block">BLOCK</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <div className="text-sm font-semibold mb-1">Position &amp; Risk</div>
          <p className="text-xs text-terminal-muted leading-relaxed">
            A stateless Stylus engine computes economic position value and
            effective borrowing capacity from raw balance, price, and risk
            parameters -- no gas claims, just computation-heavy work suited
            to WASM.
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold mb-1">Lifecycle</div>
          <p className="text-xs text-terminal-muted leading-relaxed">
            A locked, validated state machine governs corporate actions and
            restrictions. Invalid transitions revert; non-ACTIVE states
            block every action.
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold mb-1">Policy</div>
          <p className="text-xs text-terminal-muted leading-relaxed">
            One deterministic decision -- ALLOW, LIMIT, or BLOCK -- enforced
            onchain by the consuming protocol, not by a frontend.
          </p>
        </div>
      </div>

      <div className="text-xs text-terminal-muted border-t border-terminal-border pt-6">
        Built for the Arbitrum Open House Singapore online buildathon.
      </div>
    </main>
  );
}

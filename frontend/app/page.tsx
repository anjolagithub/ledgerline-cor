import Link from "next/link";
import { LandingPolicyDemo } from "@/components/LandingPolicyDemo";
import { DisabledGitHubLink } from "@/components/DisabledGitHubLink";

export default function Landing() {
  return (
    <main className="mx-auto max-w-3xl px-4 md:px-8 py-16 md:py-24 space-y-24">
      {/* HERO */}
      <section className="space-y-6">
        <div className="text-xs uppercase tracking-wide text-terminal-muted">LedgerLine Core</div>
        <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
          Financial policy infrastructure
          <br />
          for tokenized assets.
        </h1>
        <p className="text-sm text-terminal-muted max-w-xl">
          Turn asset state, position risk, and lifecycle conditions into
          enforceable onchain financial decisions.
        </p>
        <div className="flex gap-3">
          <Link
            href="/app"
            className="inline-block rounded bg-terminal-accent px-5 py-2.5 text-xs uppercase tracking-wide text-terminal-accent-fg font-medium hover:opacity-90"
          >
            Explore Core
          </Link>
          <a
            href="#architecture"
            className="inline-block rounded border border-terminal-border px-5 py-2.5 text-xs uppercase tracking-wide hover:bg-terminal-surface"
          >
            View Architecture
          </a>
        </div>
      </section>

      {/* LIVE POLICY (moved up, per spec 5.4, strongest section) */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Make financial policy executable.</h2>
        <LandingPolicyDemo />
      </section>

      {/* PROBLEM */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Tokenized assets introduce state.</h2>
        <p className="text-sm text-terminal-muted max-w-xl leading-relaxed">
          A token balance and price are not always sufficient for a financial
          protocol. Lifecycle changes, corporate actions, restrictions, price
          validity, and position risk can change the conditions under which a
          financial action should execute.
        </p>
        <div className="font-mono text-sm text-terminal-muted space-y-1">
          <div>Balance</div>
          <div>&darr;</div>
          <div>State</div>
          <div>&darr;</div>
          <div>Risk</div>
          <div>&darr;</div>
          <div>Policy</div>
          <div>&darr;</div>
          <div className="text-terminal-text">Action</div>
        </div>
      </section>

      {/* PRIMITIVE / ARCHITECTURE */}
      <section id="architecture" className="space-y-4 scroll-mt-8">
        <h2 className="text-lg font-semibold">
          Separate asset state from financial application logic.
        </h2>
        <div className="font-mono text-sm space-y-2">
          <div className="text-terminal-muted">Tokenized Asset</div>
          <div className="text-terminal-muted">&darr;</div>
          <div className="text-terminal-muted">Asset Adapter</div>
          <div className="text-terminal-muted">&darr;</div>
          <div className="rounded border-2 border-terminal-border bg-terminal-surface2 px-4 py-3 inline-block">
            <div className="text-terminal-text font-semibold mb-1">LedgerLine Core</div>
            <div className="text-terminal-muted text-xs space-y-0.5">
              <div>Position</div>
              <div>Lifecycle</div>
              <div>Risk</div>
              <div>Policy</div>
            </div>
          </div>
          <div className="text-terminal-muted">&darr;</div>
          <div>
            <span className="text-decision-allow">ALLOW</span>{" "}
            <span className="text-terminal-muted">/</span>{" "}
            <span className="text-decision-limit">LIMIT</span>{" "}
            <span className="text-terminal-muted">/</span>{" "}
            <span className="text-decision-review">REVIEW</span>{" "}
            <span className="text-terminal-muted">/</span>{" "}
            <span className="text-decision-block">BLOCK</span>
          </div>
          <div className="text-terminal-muted">&darr;</div>
          <div className="text-terminal-muted">Financial Protocol</div>
        </div>
        <p className="text-xs text-terminal-muted max-w-xl">
          Currently implemented: a reference lending protocol
          (LedgerLineLendingAdapter). Vaults and agent-driven consumers are
          possible future integrations, not currently built.
        </p>
      </section>

      {/* LIFECYCLE */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Lifecycle as a state system.</h2>
        <div className="font-mono text-xs text-terminal-muted leading-relaxed">
          <div className="text-terminal-text">ACTIVE</div>
          <div>├&rarr; RESTRICTED</div>
          <div>├&rarr; CORPORATE_ACTION</div>
          <div>├&rarr; SUSPENDED</div>
          <div>└&rarr; MATURING &rarr; REDEEMABLE &rarr; REDEEMED</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded border border-terminal-border p-3">
            <div className="text-decision-allow font-medium mb-1">ACTIVE</div>
            <div className="text-xs text-terminal-muted">Action evaluated normally.</div>
          </div>
          <div className="rounded border border-terminal-border p-3">
            <div className="text-decision-block font-medium mb-1">NON-ACTIVE</div>
            <div className="text-xs text-terminal-muted">MVP policy blocks all actions.</div>
          </div>
        </div>
      </section>

      {/* CHAIN-AGNOSTIC */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">One policy layer. Multiple asset environments.</h2>
        <div className="font-mono text-sm space-y-2">
          <div className="flex gap-3 flex-wrap">
            <span className="text-terminal-text border border-terminal-border rounded px-2 py-0.5 text-xs">
              Robinhood Chain
            </span>
            <span className="text-terminal-muted border border-dashed border-terminal-border rounded px-2 py-0.5 text-xs">
              Ethereum (not yet integrated)
            </span>
            <span className="text-terminal-muted border border-dashed border-terminal-border rounded px-2 py-0.5 text-xs">
              Arbitrum (not yet integrated)
            </span>
          </div>
          <div className="text-terminal-muted">&darr;</div>
          <div className="text-terminal-muted">Asset Adapters</div>
          <div className="text-terminal-muted">&darr;</div>
          <div className="text-terminal-text">LedgerLine Core</div>
          <div className="text-terminal-muted">&darr;</div>
          <div className="text-terminal-muted">Financial Protocols</div>
        </div>
        <p className="text-xs text-terminal-muted max-w-xl">
          Robinhood Chain is LedgerLine&apos;s initial proving ground, not its
          boundary.
        </p>
      </section>

      {/* DEVELOPER */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Built for protocols to consume directly.</h2>
        <pre className="rounded border border-terminal-border bg-terminal-surface2 p-4 text-xs font-mono overflow-x-auto">
{`canExecute(
    assetId,
    positionId,
    action,
    amount
)`}
        </pre>
        <div className="text-xs text-terminal-muted space-y-1">
          <div>
            <span className="text-decision-allow">ALLOW</span> &rarr; execute
          </div>
          <div>
            <span className="text-decision-limit">LIMIT</span> &rarr; reject / resubmit within permitted amount
          </div>
          <div>
            <span className="text-decision-block">BLOCK</span> &rarr; reject
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="space-y-4 border-t border-terminal-border pt-12">
        <h2 className="text-xl font-semibold max-w-md">
          Build financial protocols that understand the assets they hold.
        </h2>
        <div className="flex gap-3">
          <Link
            href="/app"
            className="inline-block rounded bg-terminal-accent px-5 py-2.5 text-xs uppercase tracking-wide text-terminal-accent-fg font-medium hover:opacity-90"
          >
            Explore LedgerLine Core
          </Link>
          <DisabledGitHubLink />
        </div>
      </section>
    </main>
  );
}

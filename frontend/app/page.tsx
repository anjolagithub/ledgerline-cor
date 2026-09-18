import Link from "next/link";
import { LandingPolicyDemo } from "@/components/LandingPolicyDemo";
import { DisabledGitHubLink } from "@/components/DisabledGitHubLink";

const code = `(Decision decision, uint256 permittedAmount, bytes32 reason) =\n    ledgerLine.canExecute(assetId, positionId, Action.BORROW, amount);`;

export default function Landing() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-24 px-5 py-6 md:px-10 md:py-8">
      <nav className="flex items-center justify-between border-b border-terminal-border pb-5" aria-label="Primary navigation">
        <Link href="/" className="font-semibold tracking-tight">LedgerLine <span className="text-terminal-muted">/ Core</span></Link>
        <div className="flex items-center gap-6 text-xs text-terminal-muted">
          <a href="#architecture" className="hidden hover:text-terminal-text md:inline">Architecture</a>
          <Link href="/app" className="border border-terminal-border px-3 py-2 text-terminal-text hover:bg-terminal-surface">Open console <span aria-hidden="true">↗</span></Link>
        </div>
      </nav>

      <section className="grid items-end gap-12 border-b border-terminal-border pb-20 md:grid-cols-[1.05fr_.95fr] md:gap-20">
        <div className="flex flex-col gap-7">
          <p className="eyebrow">Policy infrastructure / 01</p>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.03] tracking-[-0.045em] md:text-7xl">Financial policy infrastructure for tokenized assets.</h1>
          <p className="max-w-lg text-base leading-7 text-terminal-muted">Turn asset state, position risk, and lifecycle conditions into enforceable onchain financial decisions.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/app" className="bg-terminal-accent px-4 py-3 text-xs font-medium uppercase tracking-wide text-terminal-accent-fg hover:opacity-90">Explore LedgerLine Core</Link>
            <a href="#architecture" className="border border-terminal-border px-4 py-3 text-xs font-medium uppercase tracking-wide hover:bg-terminal-surface">View architecture</a>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -left-5 top-1/2 hidden h-px w-5 bg-terminal-border md:block" aria-hidden="true" />
          <LandingPolicyDemo />
        </div>
      </section>

      <section className="grid gap-8 border-b border-terminal-border pb-20 md:grid-cols-[.7fr_1.3fr]">
        <div><p className="eyebrow">The problem / 02</p><h2 className="mt-4 max-w-sm text-3xl font-semibold tracking-tight">Tokenized assets introduce state.</h2></div>
        <div className="grid gap-10 md:grid-cols-2"><p className="max-w-md text-sm leading-7 text-terminal-muted">A balance and a price are not always enough to determine whether a financial action should execute. Lifecycle, restrictions, corporate actions, and risk conditions change the rules.</p><div className="font-mono text-sm leading-8 text-terminal-muted"><div>BALANCE <span className="text-terminal-border">→</span> STATE</div><div>POSITION <span className="text-terminal-border">→</span> RISK</div><div className="text-terminal-text">POLICY <span className="text-terminal-border">→</span> ACTION</div></div></div>
      </section>

      <section id="architecture" className="grid gap-10 border-b border-terminal-border pb-20 scroll-mt-8 md:grid-cols-[.7fr_1.3fr]">
        <div><p className="eyebrow">The primitive / 03</p><h2 className="mt-4 max-w-sm text-3xl font-semibold tracking-tight">One policy layer. Multiple asset environments.</h2></div>
        <div className="grid gap-4 font-mono text-sm md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center"><div className="border border-terminal-border p-4"><span className="text-terminal-muted">INPUT</span><br />Asset environment<br /><span className="text-terminal-muted">Asset adapter</span></div><span className="text-terminal-muted">→</span><div className="bg-terminal-surface2 p-5"><span className="eyebrow">Core engine</span><div className="mt-3 text-lg font-semibold font-sans">LedgerLine Core</div><div className="mt-2 text-xs leading-6 text-terminal-muted">Position<br />Lifecycle<br />Risk<br />Policy</div></div><span className="text-terminal-muted">→</span><div className="border border-terminal-border p-4"><span className="text-terminal-muted">OUTPUT</span><br /><span className="text-decision-allow">ALLOW</span> / <span className="text-decision-limit">LIMIT</span><br /><span className="text-decision-review">REVIEW</span> / <span className="text-decision-block">BLOCK</span></div></div>
      </section>

      <section className="grid gap-8 border-b border-terminal-border pb-20 md:grid-cols-[.7fr_1.3fr]">
        <div><p className="eyebrow">Developer surface / 04</p><h2 className="mt-4 max-w-sm text-3xl font-semibold tracking-tight">A decision protocol, not a dashboard.</h2></div>
        <div className="grid gap-6 md:grid-cols-[1.2fr_.8fr]"><pre className="overflow-x-auto border border-terminal-border bg-terminal-surface2 p-5 text-xs leading-6 text-terminal-muted"><code>{code}</code></pre><div className="text-sm leading-7 text-terminal-muted"><p><span className="text-decision-allow">ALLOW</span> — execute.</p><p><span className="text-decision-limit">LIMIT</span> — reject and resubmit.</p><p><span className="text-decision-block">BLOCK</span> — prohibited by policy.</p></div></div>
      </section>

      <section className="flex flex-col gap-6 pb-12 md:flex-row md:items-end md:justify-between"><div><p className="eyebrow">Next action / 05</p><h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight">Build protocols that understand the assets they hold.</h2></div><div className="flex gap-3"><Link href="/app" className="bg-terminal-accent px-4 py-3 text-xs font-medium uppercase tracking-wide text-terminal-accent-fg">Explore Core</Link><DisabledGitHubLink /></div></section>
    </main>
  );
}

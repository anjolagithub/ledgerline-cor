import Link from "next/link";
import { ActivityLog } from "@/components/ActivityLog";

export default function Activity() {
  return <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-6 md:px-10 md:py-8">
    <header className="flex items-center justify-between border-b border-terminal-border pb-5"><div className="flex min-w-0 items-center gap-4 sm:gap-5"><Link href="/" className="flex items-center gap-2 font-semibold tracking-tight"><span aria-hidden="true" className="text-terminal-accent">←</span><span>LedgerLine Core</span></Link><nav className="hidden items-center gap-4 border-l border-terminal-border pl-5 font-mono text-[10px] uppercase tracking-[.14em] md:flex" aria-label="App navigation"><Link href="/app" className="text-terminal-muted transition-colors hover:text-terminal-text">Policy Console</Link><Link href="/app/activity" className="text-terminal-text">Activity</Link></nav></div><span className="hidden rounded-full border border-terminal-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.14em] text-terminal-muted sm:inline"><span className="mr-1.5 text-decision-allow">●</span>Robinhood Chain · Testnet</span></header>
    <section className="border-b border-terminal-border pb-7"><p className="eyebrow">Onchain record</p><h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">Every decision that moved value.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-terminal-muted">A read-only view of Deposited, Borrowed, Withdrawn, Transferred, and Registry state changes, sourced directly from onchain logs.</p></section>
    <ActivityLog />
    <footer className="border-t border-terminal-border py-5 text-xs text-terminal-muted">LedgerLine Core · Policy decisions are enforced by the lending adapter onchain.</footer>
  </main>;
}

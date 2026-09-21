import Link from "next/link";
import { PolicyConsole } from "@/components/PolicyConsole";

export default function Dashboard() {
  return <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-6 md:px-10 md:py-8">
    <header className="flex items-center justify-between border-b border-terminal-border pb-5"><div className="flex min-w-0 items-center gap-4 sm:gap-5"><Link href="/" className="flex items-center gap-2 font-semibold tracking-tight"><span aria-hidden="true" className="text-terminal-accent">←</span><span>LedgerLine Core</span></Link><span className="hidden border-l border-terminal-border pl-5 text-[11px] uppercase tracking-[.16em] text-terminal-muted md:inline">Policy console</span></div><span className="hidden rounded-full border border-terminal-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.14em] text-terminal-muted sm:inline"><span className="mr-1.5 text-decision-allow">●</span>Robinhood Chain · Testnet</span></header>
    <section className="border-b border-terminal-border pb-7"><p className="eyebrow">Core policy engine</p><h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">Decide before value moves.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-terminal-muted">LedgerLine determines whether a financial action is allowed based on an asset&apos;s price, lifecycle, position, and risk state.</p></section>
    <PolicyConsole />
    <footer className="border-t border-terminal-border py-5 text-xs text-terminal-muted">LedgerLine Core · Policy decisions are enforced by the lending adapter onchain.</footer>
  </main>;
}

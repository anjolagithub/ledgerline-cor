"use client";

import { useAccount, useReadContract } from "wagmi";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { LifecycleBadge } from "@/components/LifecycleBadge";
import { DepositForm } from "@/components/DepositForm";
import { BorrowForm } from "@/components/BorrowForm";
import { REGISTRY, ASSET_ID } from "@/lib/contracts";

export default function Dashboard() {
  const { address } = useAccount();
  const positionId = address ? BigInt(address) : 0n;

  const { data: assetState } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "getAssetState",
    args: [ASSET_ID],
  }) as {
    data:
      | {
          price: bigint;
          multiplier: bigint;
          lifecycle: number;
          collateralFactorBps: bigint;
          riskAdjustmentBps: bigint;
        }
      | undefined;
  };

  const { data: position } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "getPosition",
    args: [ASSET_ID, positionId],
    query: { enabled: !!address },
  }) as { data: { rawBalance: bigint } | undefined };

  const positionValue =
    position && assetState ? (position.rawBalance * assetState.price) / 10n ** 18n : undefined;

  const baseCapacity =
    positionValue && assetState ? (positionValue * assetState.collateralFactorBps) / 10000n : undefined;

  const effectiveCapacity =
    baseCapacity && assetState ? (baseCapacity * assetState.riskAdjustmentBps) / 10000n : undefined;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-6 md:px-10 md:py-8">
      <header className="flex items-center justify-between border-b border-terminal-border pb-5">
        <div className="flex items-center gap-5"><Link href="/" className="font-semibold tracking-tight">LedgerLine <span className="text-terminal-muted">/ Core</span></Link><span className="hidden border-l border-terminal-border pl-5 text-[11px] uppercase tracking-[.16em] text-terminal-muted md:inline">Operator console</span></div>
        <div className="flex items-center gap-4"><span className="hidden text-[11px] uppercase tracking-[.16em] text-terminal-muted md:inline">Robinhood Chain · Testnet</span><ConnectButton /></div>
      </header>

      <section className="flex flex-col gap-5 border-b border-terminal-border pb-8 md:flex-row md:items-end md:justify-between">
        <div><p className="eyebrow">Asset identity</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">AAPL <span className="text-terminal-muted">/ Stock Token</span></h1><p className="mt-2 font-mono text-xs text-terminal-muted">asset_id · #{ASSET_ID.toString()}</p></div><LifecycleBadge lifecycle={assetState?.lifecycle} />
      </section>

      <section className="grid gap-8 lg:grid-cols-[.7fr_1.3fr]">
        <div className="flex flex-col gap-6"><div><p className="eyebrow">Position</p><div className="mt-3 font-mono text-4xl font-semibold tabular-nums">{position ? position.rawBalance.toString() : "—"}<span className="ml-2 text-base font-sans font-normal text-terminal-muted">shares</span></div><p className="mt-2 text-sm text-terminal-muted">Current position value <span className="font-mono text-terminal-text">${positionValue ? Number(positionValue / 10n ** 18n).toLocaleString() : "—"}</span></p></div><DepositForm /></div>
        <BorrowForm positionValue={positionValue} collateralFactorBps={assetState?.collateralFactorBps} riskAdjustmentBps={assetState?.riskAdjustmentBps} effectiveCapacity={effectiveCapacity} lifecycle={assetState?.lifecycle} />
      </section>
    </main>
  );
}

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
    <main className="mx-auto max-w-3xl px-3 md:px-6 py-8 md:py-12 space-y-8">
      <div className="flex items-center justify-between border-b border-terminal-border pb-4">
        <div>
          <Link href="/" className="text-lg font-semibold hover:opacity-80">
            LedgerLine Core
          </Link>
          <div className="text-xs text-terminal-muted">Robinhood Chain</div>
        </div>
        <ConnectButton />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-terminal-muted">Stock Token</div>
          <div className="text-xl font-semibold">AAPL / Asset #{ASSET_ID.toString()}</div>
        </div>
        <LifecycleBadge lifecycle={assetState?.lifecycle} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DepositForm />
        <BorrowForm
          positionValue={positionValue}
          collateralFactorBps={assetState?.collateralFactorBps}
          riskAdjustmentBps={assetState?.riskAdjustmentBps}
          effectiveCapacity={effectiveCapacity}
          lifecycle={assetState?.lifecycle}
        />
      </div>
    </main>
  );
}

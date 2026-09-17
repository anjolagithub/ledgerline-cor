"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { REGISTRY, ASSET_ID, LIFECYCLE_LABELS } from "@/lib/contracts";

export default function AdminPage() {
  const { address } = useAccount();
  const [lifecycleTarget, setLifecycleTarget] = useState(0);
  const [collateralBps, setCollateralBps] = useState("7000");
  const [riskBps, setRiskBps] = useState("8000");

  const { data: owner } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "owner",
  }) as { data: string | undefined };

  const { data: assetState } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "getAssetState",
    args: [ASSET_ID],
  }) as { data: { lifecycle: number; price: bigint } | undefined };

  const { writeContract: transitionLifecycle } = useWriteContract();
  const { writeContract: updateParams } = useWriteContract();

  const isOwner = !!address && !!owner && address.toLowerCase() === owner.toLowerCase();

  if (!isOwner) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-sm text-terminal-muted">
          Operator Mode -- connect the Registry owner wallet to access this screen.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wide text-decision-limit mb-1">Operator Mode</div>
        <div className="text-lg font-semibold">LedgerLine / Operator</div>
      </div>

      <div className="rounded border border-terminal-border bg-terminal-surface p-4 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-terminal-muted mb-1">Lifecycle</div>
          <select
            value={lifecycleTarget}
            onChange={(e) => setLifecycleTarget(Number(e.target.value))}
            className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm"
          >
            {LIFECYCLE_LABELS.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-terminal-muted mb-1">Collateral Factor (bps)</div>
            <input
              value={collateralBps}
              onChange={(e) => setCollateralBps(e.target.value)}
              className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-terminal-muted mb-1">Risk Adjustment (bps)</div>
            <input
              value={riskBps}
              onChange={(e) => setRiskBps(e.target.value)}
              className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() =>
              transitionLifecycle({
                address: REGISTRY.address,
                abi: REGISTRY.abi,
                functionName: "transitionLifecycle",
                args: [ASSET_ID, lifecycleTarget],
              })
            }
            className="flex-1 rounded border border-terminal-border px-3 py-2 text-xs uppercase tracking-wide hover:bg-terminal-bg"
          >
            Transition Lifecycle
          </button>
          <button
            onClick={() =>
              updateParams({
                address: REGISTRY.address,
                abi: REGISTRY.abi,
                functionName: "updateAssetParameters",
                args: [ASSET_ID, assetState?.price ?? 0n, 10n ** 18n, BigInt(collateralBps), BigInt(riskBps)],
              })
            }
            className="flex-1 rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-white hover:opacity-90"
          >
            Update Risk Params
          </button>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-terminal-border text-xs text-terminal-muted space-y-1">
        <div>
          Current state:{" "}
          <span className="text-terminal-text">
            {assetState ? LIFECYCLE_LABELS[assetState.lifecycle] : "--"}
          </span>
        </div>
        <div>
          Owner: <span className="text-terminal-text">{owner ?? "--"}</span>
        </div>
      </div>
    </main>
  );
}

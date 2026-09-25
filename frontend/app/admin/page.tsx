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
          Operator Mode — connect the Registry owner wallet to access this screen.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <div className="mb-6">
        <p className="eyebrow status-config">Operator Mode</p>
        <div className="mt-2 text-lg font-semibold tracking-tight">CortexRails / Operator</div>
      </div>

      <div className="form-card space-y-4">
        <div>
          <label htmlFor="admin-lifecycle" className="field-label">Lifecycle</label>
          <select
            id="admin-lifecycle"
            value={lifecycleTarget}
            onChange={(e) => setLifecycleTarget(Number(e.target.value))}
            className="select-field"
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
            <label htmlFor="admin-collateral" className="field-label">Collateral Factor (bps)</label>
            <input
              id="admin-collateral"
              value={collateralBps}
              onChange={(e) => setCollateralBps(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="admin-risk" className="field-label">Risk Adjustment (bps)</label>
            <input
              id="admin-risk"
              value={riskBps}
              onChange={(e) => setRiskBps(e.target.value)}
              className="field-input"
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
            className="form-action form-action-secondary flex-1"
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
            className="form-action form-action-primary flex-1"
          >
            Update Risk Params
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-1 border-t border-terminal-border pt-4 text-xs text-terminal-muted">
        <div>
          Current state:{" "}
          <span className="text-terminal-text">
            {assetState ? LIFECYCLE_LABELS[assetState.lifecycle] : "—"}
          </span>
        </div>
        <div>
          Owner: <span className="text-terminal-text">{owner ?? "—"}</span>
        </div>
      </div>
    </main>
  );
}

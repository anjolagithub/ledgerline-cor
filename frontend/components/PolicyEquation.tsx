import { formatUnits18, bpsToPercent } from "@/lib/contracts";

/// Pure presentation component — per DESIGN_SPEC.md Section 5/11, this
/// must not perform its own contract reads. All values are computed by
/// the caller (app/page.tsx) from the existing getAssetState/getPosition
/// reads and passed down as props.
export function PolicyEquation({
  positionValue,
  collateralFactorBps,
  riskAdjustmentBps,
  effectiveCapacity,
}: {
  positionValue: bigint | undefined;
  collateralFactorBps: bigint | undefined;
  riskAdjustmentBps: bigint | undefined;
  effectiveCapacity: bigint | undefined;
}) {
  return (
    <div className="space-y-2 rounded-[.75rem] border border-terminal-border bg-terminal-surface2 p-4 shadow-[inset_0_1px_0_rgba(238,245,255,.05)]">
      <div className="flex items-baseline justify-between">
        <span className="field-label mb-0">Position Value</span>
        <span className="font-mono tabular-nums text-3xl font-semibold">
          ${formatUnits18(positionValue)}
        </span>
      </div>
      <div className="flex items-baseline justify-between pl-4 text-terminal-muted">
        <span className="text-sm">&times; Collateral Factor</span>
        <span className="font-mono tabular-nums text-sm">{bpsToPercent(collateralFactorBps)}</span>
      </div>
      <div className="flex items-baseline justify-between pl-4 text-terminal-muted">
        <span className="text-sm">&times; Risk Adjustment</span>
        <span className="font-mono tabular-nums text-sm">{bpsToPercent(riskAdjustmentBps)}</span>
      </div>
      <div className="flex items-baseline justify-between border-t border-terminal-border pt-2">
        <span className="field-label mb-0">Effective Capacity</span>
        <span className="font-mono tabular-nums text-3xl font-semibold">
          ${formatUnits18(effectiveCapacity)}
        </span>
      </div>
    </div>
  );
}

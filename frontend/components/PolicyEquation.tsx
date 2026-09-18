import { formatUnits18, bpsToPercent } from "@/lib/contracts";

/// Pure presentation component -- per DESIGN_SPEC.md Section 5/11, this
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
    <div className="rounded border border-terminal-border bg-terminal-surface2 p-4 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-terminal-muted">Position Value</span>
        <span className="font-mono tabular-nums text-3xl font-semibold">
          ${formatUnits18(positionValue)}
        </span>
      </div>
      <div className="flex items-baseline justify-between text-terminal-muted pl-4">
        <span className="text-sm">&times; Collateral Factor</span>
        <span className="font-mono tabular-nums text-sm">{bpsToPercent(collateralFactorBps)}</span>
      </div>
      <div className="flex items-baseline justify-between text-terminal-muted pl-4">
        <span className="text-sm">&times; Risk Adjustment</span>
        <span className="font-mono tabular-nums text-sm">{bpsToPercent(riskAdjustmentBps)}</span>
      </div>
      <div className="border-t border-terminal-border pt-2 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-terminal-muted">Effective Capacity</span>
        <span className="font-mono tabular-nums text-3xl font-semibold">
          ${formatUnits18(effectiveCapacity)}
        </span>
      </div>
    </div>
  );
}

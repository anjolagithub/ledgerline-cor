import { DECISION_LABELS, LIFECYCLE_LABELS, formatUnits18 } from "@/lib/contracts";

type PolicyResponse = { decision: number; permittedAmount: bigint; reason: string } | undefined;

/// Pure presentation component. Consumes the canExecute response passed
/// down from the caller -- does not call canExecute itself, per
/// DESIGN_SPEC.md Section 11.
export function PolicyVerdict({
  requestedAmount,
  lifecycle,
  response,
}: {
  requestedAmount: bigint | undefined;
  lifecycle: number | undefined;
  response: PolicyResponse;
}) {
  if (requestedAmount === undefined || requestedAmount === 0n) {
    return (
      <div className="text-sm text-terminal-muted">
        Enter an amount to evaluate a borrow request.
      </div>
    );
  }

  const decisionLabel = response ? DECISION_LABELS[response.decision] : undefined;
  const isActive = lifecycle === 0;

  const colorClass =
    decisionLabel === "ALLOW"
      ? "text-decision-allow"
      : decisionLabel === "LIMIT"
      ? "text-decision-limit"
      : decisionLabel === "REVIEW"
      ? "text-decision-review"
      : decisionLabel === "BLOCK"
      ? "text-decision-block"
      : "text-terminal-muted";

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {isActive ? (
          <>
            <div className="text-sm">&#10003; Lifecycle: ACTIVE</div>
            <div className="text-sm">&#10003; Price feed valid</div>
            <div className="text-sm">&#10003; Position exists</div>
          </>
        ) : (
          <div className="text-sm text-decision-limit">
            &#9888; Lifecycle: {lifecycle !== undefined ? LIFECYCLE_LABELS[lifecycle] : "--"} -- all
            actions blocked
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between text-sm">
        <span className="text-terminal-muted">Requested</span>
        <span className="font-mono tabular-nums">${formatUnits18(requestedAmount)} BORROW</span>
      </div>
      {response && (
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-terminal-muted">Effective Capacity</span>
          <span className="font-mono tabular-nums">${formatUnits18(response.permittedAmount)}</span>
        </div>
      )}

      <div className="border-t border-terminal-border pt-3 text-center">
        <div className={`text-3xl font-semibold ${colorClass}`}>{decisionLabel ?? "--"}</div>
        {(decisionLabel === "LIMIT" || decisionLabel === "BLOCK") && response && (
          <div className="mt-1 text-xs text-terminal-muted">
            Maximum permitted ${formatUnits18(response.permittedAmount)}
          </div>
        )}
      </div>

      <div className="text-xs text-terminal-muted text-center">
        LedgerLineLendingAdapter enforces this decision onchain.
      </div>
    </div>
  );
}

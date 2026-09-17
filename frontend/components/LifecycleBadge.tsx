import { LIFECYCLE_LABELS } from "@/lib/contracts";

export function LifecycleBadge({ lifecycle }: { lifecycle: number | undefined }) {
  const label = lifecycle !== undefined ? LIFECYCLE_LABELS[lifecycle] : "--";
  const isActive = lifecycle === 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs uppercase tracking-wide ${
        isActive
          ? "border-decision-allow/40 text-decision-allow"
          : "border-decision-limit/40 text-decision-limit"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-decision-allow" : "bg-decision-limit"}`} />
      {label}
    </span>
  );
}

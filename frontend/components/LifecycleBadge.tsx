import { LIFECYCLE_LABELS } from "@/lib/contracts";

export function LifecycleBadge({ lifecycle }: { lifecycle: number | undefined }) {
  const label = lifecycle !== undefined ? LIFECYCLE_LABELS[lifecycle] : "—";
  const isActive = lifecycle === 0;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.1em] ${
        isActive
          ? "border-decision-allow/40 text-decision-allow"
          : "border-decision-limit/40 text-decision-limit"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${isActive ? "bg-decision-allow" : "bg-decision-limit"}`} />
      {label}
    </span>
  );
}

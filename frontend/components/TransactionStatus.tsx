import type { TxStatus } from "@/lib/useTransactionFlow";

const LABELS: Record<TxStatus, string> = {
  idle: "",
  "wallet-confirmation": "Confirm in wallet",
  submitted: "Submitting...",
  pending: "Confirming...",
  confirmed: "Confirmed",
  failed: "Failed",
  rejected: "Rejected in wallet",
  "wrong-network": "Wrong network",
};

export function TransactionStatus({
  status,
  hash,
  message,
}: {
  status: TxStatus;
  hash?: `0x${string}`;
  message?: string;
}) {
  if (status === "idle") return null;

  const tone =
    status === "confirmed"
      ? "text-decision-allow"
      : status === "failed"
      ? "text-decision-block"
      : "text-terminal-muted";

  return (
    <div className={`mt-2 text-xs ${tone}`} role="status" aria-live="polite">
      <div>{LABELS[status]}</div>
      {hash && (status === "submitted" || status === "pending" || status === "confirmed") && (
        <div className="font-mono text-terminal-muted mt-0.5">
          {hash.slice(0, 10)}...{hash.slice(-8)}
        </div>
      )}
      {message && status === "failed" && <div className="mt-0.5">{message}</div>}
    </div>
  );
}

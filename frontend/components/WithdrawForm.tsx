"use client";

import { useState } from "react";
import { VAULT_ADAPTER, ONE, formatUnits18 } from "@/lib/contracts";
import { useTransactionFlow } from "@/lib/useTransactionFlow";
import { TransactionStatus } from "./TransactionStatus";

export function WithdrawForm({
  positionRawBalance,
  symbol,
  lifecycle,
}: {
  positionRawBalance: bigint | undefined;
  symbol: string | undefined;
  lifecycle: number | undefined;
}) {
  const [amount, setAmount] = useState("");
  const parsedAmount = amount ? BigInt(Math.floor(Number(amount))) * ONE : 0n;

  const exceedsPosition =
    parsedAmount > 0n && positionRawBalance !== undefined && parsedAmount > positionRawBalance;
  const isActive = lifecycle === 0;

  const tx = useTransactionFlow();
  const submitting = tx.status === "wallet-confirmation" || tx.status === "pending";
  const disabled = !amount || exceedsPosition || !isActive || submitting;

  return (
    <div className="rounded border border-terminal-border bg-terminal-surface p-4">
      <div className="text-xs uppercase tracking-wide text-terminal-muted mb-3">Withdraw Stock Token</div>
      <div className="mb-3 text-xs text-terminal-muted">
        Position <span className="text-terminal-text">{formatUnits18(positionRawBalance)} {symbol ?? ""}</span>
      </div>
      <label htmlFor="withdraw-amount" className="block text-xs uppercase tracking-wide text-terminal-muted mb-2">
        Shares
      </label>
      <input
        id="withdraw-amount"
        type="number"
        min="0"
        step="1"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        aria-describedby="withdraw-help"
        className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-terminal-accent"
      />
      {exceedsPosition && (
        <div className="text-xs text-decision-block mb-2">Exceeds your position</div>
      )}
      {!isActive && (
        <div id="withdraw-help" className="mb-2 text-xs text-decision-limit">
          Lifecycle is not ACTIVE -- withdrawals are blocked.
        </div>
      )}
      {tx.status === "wrong-network" ? (
        <button
          onClick={tx.switchToCorrectNetwork}
          className="w-full rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-terminal-accent-fg font-medium hover:opacity-90"
        >
          Switch Network
        </button>
      ) : (
        <button
          disabled={disabled}
          onClick={() =>
            tx.execute({
              address: VAULT_ADAPTER.address,
              abi: VAULT_ADAPTER.abi,
              functionName: "withdraw",
              args: [parsedAmount],
            })
          }
          className="w-full rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-terminal-accent-fg font-medium hover:opacity-90 disabled:opacity-40"
        >
          Withdraw
        </button>
      )}
      <TransactionStatus status={tx.status} hash={tx.hash} message={tx.message} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { isAddress, type Address } from "viem";
import { LENDING_ADAPTER, TRANSFER_ADAPTER, ONE, formatUnits18 } from "@/lib/contracts";
import { useTransactionFlow } from "@/lib/useTransactionFlow";
import { TransactionStatus } from "./TransactionStatus";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function TransferForm({
  positionRawBalance,
  symbol,
  lifecycle,
}: {
  positionRawBalance: bigint | undefined;
  symbol: string | undefined;
  lifecycle: number | undefined;
}) {
  const { address } = useAccount();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const parsedAmount = amount ? BigInt(Math.floor(Number(amount))) * ONE : 0n;

  // Same debt(address) read TransferAdapter.sol itself checks -- shown
  // BEFORE any transaction is attempted, not invented UX logic.
  const { data: existingDebt } = useReadContract({
    address: LENDING_ADAPTER.address,
    abi: LENDING_ADAPTER.abi,
    functionName: "debt",
    args: [address ?? ZERO_ADDRESS],
    query: { enabled: !!address },
  }) as { data: bigint | undefined };

  const hasOutstandingDebt = !!existingDebt && existingDebt > 0n;
  const recipientEntered = recipient.length > 0;
  const recipientValid = !recipientEntered || isAddress(recipient);
  const exceedsPosition =
    parsedAmount > 0n && positionRawBalance !== undefined && parsedAmount > positionRawBalance;
  const isActive = lifecycle === 0;

  const tx = useTransactionFlow();
  const submitting = tx.status === "wallet-confirmation" || tx.status === "pending";
  const disabled =
    !amount ||
    !recipientEntered ||
    !isAddress(recipient) ||
    exceedsPosition ||
    !isActive ||
    hasOutstandingDebt ||
    submitting;

  return (
    <div className="rounded border border-terminal-border bg-terminal-surface p-4">
      <div className="text-xs uppercase tracking-wide text-terminal-muted mb-3">Transfer Position</div>
      <div className="mb-3 text-xs text-terminal-muted">
        Position <span className="text-terminal-text">{formatUnits18(positionRawBalance)} {symbol ?? ""}</span>
      </div>
      <label htmlFor="transfer-recipient" className="block text-xs uppercase tracking-wide text-terminal-muted mb-2">
        Recipient address
      </label>
      <input
        id="transfer-recipient"
        type="text"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="0x..."
        aria-describedby="transfer-recipient-help"
        className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm mb-1 font-mono focus:outline-none focus:ring-2 focus:ring-terminal-accent"
      />
      {!recipientValid && (
        <div id="transfer-recipient-help" className="text-xs text-decision-block mb-2">
          Not a valid address
        </div>
      )}
      <label htmlFor="transfer-amount" className="mt-2 block text-xs uppercase tracking-wide text-terminal-muted mb-2">
        Shares
      </label>
      <input
        id="transfer-amount"
        type="number"
        min="0"
        step="1"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        aria-describedby="transfer-help"
        className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-terminal-accent"
      />
      {exceedsPosition && (
        <div className="text-xs text-decision-block mb-2">Exceeds your position</div>
      )}
      {hasOutstandingDebt && (
        <div id="transfer-help" className="mb-2 text-xs text-decision-block">
          Outstanding debt blocks transfer -- repay first.
        </div>
      )}
      {!isActive && (
        <div className="mb-2 text-xs text-decision-limit">
          Lifecycle is not ACTIVE -- transfers are blocked.
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
              address: TRANSFER_ADAPTER.address,
              abi: TRANSFER_ADAPTER.abi,
              functionName: "transfer",
              args: [recipient as Address, parsedAmount],
            })
          }
          className="w-full rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-terminal-accent-fg font-medium hover:opacity-90 disabled:opacity-40"
        >
          Transfer
        </button>
      )}
      <TransactionStatus status={tx.status} hash={tx.hash} message={tx.message} />
    </div>
  );
}

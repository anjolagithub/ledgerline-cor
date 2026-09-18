"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { STOCK_TOKEN, LENDING_ADAPTER, ONE } from "@/lib/contracts";
import { useTransactionFlow } from "@/lib/useTransactionFlow";
import { TransactionStatus } from "./TransactionStatus";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function DepositForm() {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const parsedAmount = amount ? BigInt(Math.floor(Number(amount))) * ONE : 0n;

  // Standard ERC20 balanceOf -- already part of the committed
  // MockStockToken ABI, no new contract surface needed.
  const { data: balance } = useReadContract({
    address: STOCK_TOKEN.address,
    abi: STOCK_TOKEN.abi,
    functionName: "balanceOf",
    args: [address ?? ZERO_ADDRESS],
    query: { enabled: !!address },
  }) as { data: bigint | undefined };

  const insufficientBalance =
    !!address && parsedAmount > 0n && balance !== undefined && parsedAmount > balance;

  const approveTx = useTransactionFlow();
  const depositTx = useTransactionFlow();

  const approveDisabled =
    !address ||
    !amount ||
    insufficientBalance ||
    approveTx.status === "wallet-confirmation" ||
    approveTx.status === "pending";
  const depositDisabled =
    !address ||
    !amount ||
    insufficientBalance ||
    depositTx.status === "wallet-confirmation" ||
    depositTx.status === "pending";

  return (
    <div className="rounded border border-terminal-border bg-terminal-surface p-4">
      <div className="text-xs uppercase tracking-wide text-terminal-muted mb-3">Deposit Stock Token</div>
      <label htmlFor="deposit-amount" className="block text-xs uppercase tracking-wide text-terminal-muted mb-2">
        Shares
      </label>
      <input
        id="deposit-amount"
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-terminal-accent"
      />
      {insufficientBalance && (
        <div className="text-xs text-decision-block mb-2">Insufficient balance</div>
      )}
      <div className="flex gap-2 mt-2">
        <button
          disabled={approveDisabled}
          onClick={() =>
            approveTx.execute({
              address: STOCK_TOKEN.address,
              abi: STOCK_TOKEN.abi,
              functionName: "approve",
              args: [LENDING_ADAPTER.address, parsedAmount],
            })
          }
          className="flex-1 rounded border border-terminal-border px-3 py-2 text-xs uppercase tracking-wide hover:bg-terminal-bg disabled:opacity-40"
        >
          Approve
        </button>
        <button
          disabled={depositDisabled}
          onClick={() =>
            depositTx.execute({
              address: LENDING_ADAPTER.address,
              abi: LENDING_ADAPTER.abi,
              functionName: "deposit",
              args: [parsedAmount],
            })
          }
          className="flex-1 rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-terminal-accent-fg font-medium hover:opacity-90 disabled:opacity-40"
        >
          Deposit
        </button>
      </div>
      <TransactionStatus status={approveTx.status} hash={approveTx.hash} message={approveTx.message} />
      <TransactionStatus status={depositTx.status} hash={depositTx.hash} message={depositTx.message} />
    </div>
  );
}

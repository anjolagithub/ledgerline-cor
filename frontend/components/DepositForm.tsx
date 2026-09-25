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

  // Standard ERC20 balanceOf — already part of the committed
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
    <div className="form-card">
      <div className="form-card-title">Deposit Stock Token</div>
      <label htmlFor="deposit-amount" className="field-label">
        Shares
      </label>
      <input
        id="deposit-amount"
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        className="field-input mb-1"
      />
      {insufficientBalance && <div className="field-error">Insufficient balance</div>}
      <div className="mt-3 flex gap-2">
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
          className="form-action form-action-secondary flex-1"
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
          className="form-action form-action-primary flex-1"
        >
          Deposit
        </button>
      </div>
      <TransactionStatus status={approveTx.status} hash={approveTx.hash} message={approveTx.message} />
      <TransactionStatus status={depositTx.status} hash={depositTx.hash} message={depositTx.message} />
    </div>
  );
}

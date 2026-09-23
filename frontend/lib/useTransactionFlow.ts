"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { CHAIN_ID } from "./wagmi";
import { decodeRevertReason } from "./contracts";

export type TxStatus =
  | "idle"
  | "wallet-confirmation"
  | "submitted"
  | "pending"
  | "confirmed"
  | "failed"
  | "rejected"
  | "wrong-network";

// Note: the design spec lists "preparing" as distinct from
// "wallet-confirmation" -- wagmi's actual API (no pre-submission
// simulate step in this implementation) doesn't expose a meaningfully
// separate state for that; both collapse into "wallet-confirmation"
// here rather than faking a state the underlying hooks don't produce.

function isUserRejection(error: unknown): boolean {
  const message = (error as Error)?.message?.toLowerCase() ?? "";
  return message.includes("user rejected") || message.includes("user denied");
}

export function useTransactionFlow() {
  const queryClient = useQueryClient();
  const { chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    isError: isFailed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  // Every write this app makes (deposit/borrow/withdraw/transfer) changes
  // Registry position/asset state that OTHER components read via
  // useReadContract (PolicyConsole's position/state, DepositForm's
  // balance, TransferForm's debt check, etc.) -- none of those reads
  // are watching this specific hash, so without this they'd stay stale
  // until a manual reload. wagmi/tanstack-query key every contract read
  // as ["readContract", ...], so invalidating that prefix once per
  // confirmed hash refetches all of them app-wide, at this single
  // shared call site rather than in each of the four forms.
  useEffect(() => {
    if (hash && isConfirmed) {
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
    }
  }, [hash, isConfirmed, queryClient]);

  const wrongNetwork = chainId !== undefined && chainId !== CHAIN_ID;

  let status: TxStatus = "idle";
  if (wrongNetwork) {
    status = "wrong-network";
  } else if (writeError) {
    status = isUserRejection(writeError) ? "rejected" : "failed";
  } else if (isPending) {
    status = "wallet-confirmation";
  } else if (hash && isFailed) {
    status = "failed";
  } else if (hash && isConfirmed) {
    status = "confirmed";
  } else if (hash && isConfirming) {
    status = "pending";
  } else if (hash) {
    status = "submitted";
  }

  const error = writeError ?? receiptError;
  const message = error ? decodeRevertReason(error) : undefined;

  return {
    status,
    hash,
    message,
    execute: writeContract,
    reset,
    switchToCorrectNetwork: () => switchChain?.({ chainId: CHAIN_ID }),
  };
}

import registryAbi from "../abi/LedgerLineRegistry.json";
import policyAbi from "../abi/LedgerLinePolicy.json";
import adapterAbi from "../abi/LedgerLineLendingAdapter.json";
import vaultAdapterAbi from "../abi/LedgerLineVaultAdapter.json";
import transferAdapterAbi from "../abi/LedgerLineTransferAdapter.json";
import stockTokenAbi from "../abi/MockStockToken.json";
import borrowTokenAbi from "../abi/MockBorrowToken.json";
import type { Abi, Address } from "viem";

function requireAddress(envVar: string | undefined, name: string): Address {
  if (!envVar) {
    // Zero address is a safe, obvious placeholder that fails loudly on
    // any real read/write rather than silently pointing somewhere wrong.
    console.warn(`NEXT_PUBLIC_${name}_ADDRESS is not set -- contract calls will fail until configured.`);
    return "0x0000000000000000000000000000000000000000";
  }
  return envVar as Address;
}

export const REGISTRY = {
  address: requireAddress(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS, "REGISTRY"),
  abi: registryAbi as Abi,
};

export const POLICY = {
  address: requireAddress(process.env.NEXT_PUBLIC_POLICY_ADDRESS, "POLICY"),
  abi: policyAbi as Abi,
};

export const LENDING_ADAPTER = {
  address: requireAddress(process.env.NEXT_PUBLIC_LENDING_ADAPTER_ADDRESS, "LENDING_ADAPTER"),
  abi: adapterAbi as Abi,
};

export const VAULT_ADAPTER = {
  address: requireAddress(process.env.NEXT_PUBLIC_VAULT_ADAPTER_ADDRESS, "VAULT_ADAPTER"),
  abi: vaultAdapterAbi as Abi,
};

export const TRANSFER_ADAPTER = {
  address: requireAddress(process.env.NEXT_PUBLIC_TRANSFER_ADAPTER_ADDRESS, "TRANSFER_ADAPTER"),
  abi: transferAdapterAbi as Abi,
};

export const STOCK_TOKEN = {
  address: requireAddress(process.env.NEXT_PUBLIC_STOCK_TOKEN_ADDRESS, "STOCK_TOKEN"),
  abi: stockTokenAbi as Abi,
};

export const BORROW_TOKEN = {
  address: requireAddress(process.env.NEXT_PUBLIC_BORROW_TOKEN_ADDRESS, "BORROW_TOKEN"),
  abi: borrowTokenAbi as Abi,
};

export const ASSET_ID = BigInt(process.env.NEXT_PUBLIC_ASSET_ID ?? "1");
export const ONE = 10n ** 18n;

export const LIFECYCLE_LABELS = [
  "ACTIVE", "RESTRICTED", "CORPORATE_ACTION", "SUSPENDED", "MATURING", "REDEEMABLE", "REDEEMED",
] as const;

export const DECISION_LABELS = ["ALLOW", "LIMIT", "REVIEW", "BLOCK"] as const;

export function formatUnits18(value: bigint | undefined): string {
  if (value === undefined) return "--";
  const whole = value / ONE;
  return whole.toLocaleString("en-US");
}

export function bpsToPercent(bps: bigint | undefined): string {
  if (bps === undefined) return "--";
  return `${(Number(bps) / 100).toFixed(0)}%`;
}

// Human-readable mappings for LedgerLineLendingAdapter/VaultAdapter/
// TransferAdapter's actual custom errors (src/*.sol). Not a fabricated
// mapping -- these are the exact error names those contracts define.
const KNOWN_ERRORS: Record<string, string> = {
  PolicyBlocked: "Blocked by policy",
  ExceedsPermittedAmount: "Exceeds permitted amount",
  AssetNotInitialized: "Asset not initialized",
  NoPosition: "No position -- deposit first",
  InvalidBps: "Invalid parameter value",
  ExceedsPosition: "Exceeds available position",
  WouldUnderCollateralizeDebt: "Would leave debt uncollateralized",
  OutstandingDebtBlocksTransfer: "Outstanding debt blocks transfer -- repay first",
};

export function decodeRevertReason(error: unknown): string {
  const err = error as {
    cause?: { data?: { errorName?: string } };
    shortMessage?: string;
    message?: string;
  };
  const errorName = err?.cause?.data?.errorName;
  if (errorName && KNOWN_ERRORS[errorName]) return KNOWN_ERRORS[errorName];
  if (err?.shortMessage) return err.shortMessage;
  if (err?.message) return err.message.slice(0, 120);
  return "Transaction failed";
}

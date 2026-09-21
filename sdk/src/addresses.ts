import type { Address } from "viem";

export type LedgerLineAddresses = {
  registry: Address;
  policy: Address;
  lendingAdapter: Address;
  vaultAdapter: Address;
};

/// Real contract addresses from the V2 deployment on Robinhood Chain
/// testnet (chain id 46630). Verified directly against
/// contracts/broadcast/DeployTestnetRealV2.s.sol/46630/run-latest.json
/// in the ledgerline-core repo -- not assumed. Re-derive these from a
/// fresh broadcast file if the contracts are ever redeployed.
export const ROBINHOOD_TESTNET_ADDRESSES: LedgerLineAddresses = {
  registry: "0x88508A6d9266fbc928cC11DEE92f4EB1801B907c",
  policy: "0x22fA5c1C36Cc1F7557B932dE7aCDa354ee4F6F52",
  lendingAdapter: "0x39E0d1F2877c69F1a617a86d4Bd4F8B3f2493C97",
  vaultAdapter: "0x5d27a9aC4bC4b63BE9939bD386c4f198B7308D67",
};

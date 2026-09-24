import type { Address } from "viem";

export type LedgerLineAddresses = {
  registry: Address;
  policy: Address;
  lendingAdapter: Address;
  vaultAdapter: Address;
  transferAdapter: Address;
};

/// Real contract addresses from the V2 deployment on Robinhood Chain
/// testnet (chain id 46630). Registry/Policy/LendingAdapter verified
/// directly against
/// contracts/broadcast/DeployTestnetRealV2.s.sol/46630/run-latest.json
/// in the ledgerline-core repo -- not assumed. `vaultAdapter` was
/// redeployed separately by contracts/script/RedeployVaultAdapter.s.sol
/// (debt-safety fix, commit 9fa2c38) and re-authorized as a releaser on
/// LendingAdapter; the old instance
/// (0x5d27a9aC4bC4b63BE9939bD386c4f198B7308D67) is abandoned -- see
/// docs/DEPLOYMENTS.md. WARNING (verified live 2026-09-24): that
/// redeploy never reached chain -- `vaultAdapter` below has NO bytecode,
/// so a withdraw() sent to it is a successful no-op transaction. The live
/// WITHDRAW consumer is still the pre-fix instance above. Not changed
/// here pending a real redeploy; see docs/DEPLOYMENTS.md. `transferAdapter` is CortexRails' third
/// reference consumer (Action.TRANSFER, commit 0dddd0d) and is also
/// authorized as a releaser on LendingAdapter for its no-custody
/// transferPosition() call. Re-derive these from a fresh broadcast
/// file if the contracts are ever redeployed again.
export const ROBINHOOD_TESTNET_ADDRESSES: LedgerLineAddresses = {
  registry: "0x88508A6d9266fbc928cC11DEE92f4EB1801B907c",
  policy: "0x22fA5c1C36Cc1F7557B932dE7aCDa354ee4F6F52",
  lendingAdapter: "0x39E0d1F2877c69F1a617a86d4Bd4F8B3f2493C97",
  vaultAdapter: "0x0F705a7473461C1eF4148bC3D813E1ab15EC93ac",
  transferAdapter: "0xc5Af6A4a36b6e1b2B22D03b18bBA9FEA6D456943",
};

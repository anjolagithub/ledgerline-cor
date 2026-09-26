import type { Address } from "viem";

export type LedgerLineAddresses = {
  registry: Address;
  policy: Address;
  lendingAdapter: Address;
  vaultAdapter: Address;
  transferAdapter: Address;
};

/// Real contract addresses on Robinhood Chain testnet (chain id 46630).
/// V3 stack, deployed 2026-09-26 to bring Policy/LendingAdapter onto the
/// source that fully implements the LIQUIDATE decision path and
/// repay() -- see docs/REDEPLOY_LIQUIDATE.md for the full sequence and
/// docs/DEPLOYMENTS.md for the addresses this superseded.
///
/// `registry` is unchanged from V2 -- only Policy/LendingAdapter/
/// VaultAdapter/TransferAdapter were redeployed, cascading because
/// LendingAdapter.policy is immutable (no setter) and VaultAdapter/
/// TransferAdapter both take lendingAdapterAddress in their
/// constructors. `policy` now points at a freshly-deployed Stylus
/// RiskEngine (0x10246f909139Aa83f7C223012bDd656472b3C2bc) with
/// isLiquidatable() -- the previously-live RiskEngine predated that
/// function and would have reverted every LIQUIDATE check.
///
/// KNOWN REAL COST: `lendingAdapter`'s debt mapping starts at zero for
/// every position. Any debt against the prior LendingAdapter
/// (0x39E0d1F2877c69F1a617a86d4Bd4F8B3f2493C97) is only repayable
/// through that old contract -- it does not carry over.
///
/// Verified on-chain, not assumed: `cast code` on all five new
/// addresses returns real bytecode; `policy.riskEngine()` ==
/// the new RiskEngine; `lendingAdapter.policy()` == the new Policy;
/// `registry.positionWriter()` == the new LendingAdapter;
/// `lendingAdapter.isAuthorizedReleaser()` == true for both the new
/// VaultAdapter and TransferAdapter.
export const ROBINHOOD_TESTNET_ADDRESSES: LedgerLineAddresses = {
  registry: "0x88508A6d9266fbc928cC11DEE92f4EB1801B907c",
  policy: "0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460",
  lendingAdapter: "0x020Bdf07C8970877677Ef064670a4d3BbDBcCa43",
  vaultAdapter: "0x919e140aa7277B64ecB124Eb79273E6fEd7682c7",
  transferAdapter: "0x8cAA372169A22a1963F686Bf0fD78D84057641B9",
};

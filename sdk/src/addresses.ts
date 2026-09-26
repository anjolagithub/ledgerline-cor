import type { Address } from "viem";

export type LedgerLineAddresses = {
  registry: Address;
  policy: Address;
  lendingAdapter: Address;
  vaultAdapter: Address;
  transferAdapter: Address;
  liquidationAdapter: Address;
};

/// Real contract addresses on Robinhood Chain testnet (chain id 46630).
/// V4 stack, deployed 2026-09-26 to add a real LIQUIDATE consumer
/// (LedgerLineLiquidationAdapter) -- see
/// contracts/src/LedgerLineLiquidationAdapter.sol and
/// docs/DEPLOYMENTS.md for the full sequence and the addresses this
/// superseded.
///
/// `registry` and `policy` are UNCHANGED from V3 -- Policy has no
/// dependency on LendingAdapter's address, so it was not redeployed
/// again here. Only LendingAdapter/VaultAdapter/TransferAdapter
/// cascade, because (1) LendingAdapter gained a new `liquidate()`
/// function that lets an authorized releaser reduce a THIRD PARTY's
/// debt and seize their collateral (repay() is strictly
/// debt[msg.sender]-only and could never do this), and (2)
/// VaultAdapter/TransferAdapter both take lendingAdapterAddress as an
/// immutable constructor arg with no setter. `liquidationAdapter` is
/// new: it is CortexRails' first real consumer of Action.LIQUIDATE,
/// supplying the borrower's live debt from LendingAdapter as
/// Policy.canExecute's debt-agnostic `amount` parameter, and calling
/// the new liquidate() only on ALLOW.
///
/// KNOWN REAL COST: `lendingAdapter`'s debt mapping starts at zero for
/// every position (same cost paid at every LendingAdapter redeploy so
/// far). Any debt against the prior LendingAdapter
/// (0x020Bdf07C8970877677Ef064670a4d3BbDBcCa43) is only repayable
/// through that old contract -- it does not carry over.
///
/// Verified on-chain, not assumed: `cast code` on all four new
/// addresses returns real bytecode; `registry.positionWriter()` ==
/// the new LendingAdapter; `lendingAdapter.isAuthorizedReleaser()` ==
/// true for the new VaultAdapter, TransferAdapter, AND
/// LiquidationAdapter.
export const ROBINHOOD_TESTNET_ADDRESSES: LedgerLineAddresses = {
  registry: "0x88508A6d9266fbc928cC11DEE92f4EB1801B907c",
  policy: "0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460",
  lendingAdapter: "0x5e559ADeb6B69E7c6f26c0aE51071a162Aa6560d",
  vaultAdapter: "0x4E94e5AdB0b03Be4E9d7336Da7f847E4E4BA9C43",
  transferAdapter: "0x32D47195108fE08aA518D9779689F83E2154D4f1",
  liquidationAdapter: "0xB24Af6a1bAfAB462DAa4776C0bc884Ce70B3a97d",
};

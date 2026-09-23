// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Action, Decision, PolicyResponse, Position} from "./interfaces/LedgerLineTypes.sol";
import {ILedgerLineRegistry} from "./interfaces/ILedgerLineRegistry.sol";
import {ILedgerLinePolicy} from "./interfaces/ILedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "./LedgerLineLendingAdapter.sol";

/// @notice LedgerLine's third reference consumer -- proves Action.TRANSFER
/// (index 2, unused until now) through the SAME Policy, Registry, and
/// Stylus engines as BORROW and WITHDRAW, with a mechanic genuinely
/// different from both: TRANSFER moves no tokens at all. It reassigns
/// which positionId in Registry owns a given rawBalance -- the underlying
/// TSLA never leaves LedgerLineLendingAdapter's custody.
///
/// DEBT SAFETY (simpler than VaultAdapter's, deliberately): VaultAdapter
/// only needs remaining capacity to still cover existing debt, because
/// the same owner keeps the debt and the (reduced) collateral. TRANSFER
/// hands the collateral to a different owner entirely, so whatever LTV
/// math applied to the original owner's debt no longer means anything
/// once that collateral changes hands. Any outstanding debt -- not a
/// recomputed shortfall -- blocks the transfer outright, in full, until
/// the debt is cleared.
contract LedgerLineTransferAdapter {
    ILedgerLineRegistry public immutable registry;
    ILedgerLinePolicy public immutable policy;
    LedgerLineLendingAdapter public immutable lendingAdapter;
    uint256 public immutable assetId;

    event Transferred(address indexed from, address indexed to, uint256 amount);

    error AssetNotInitialized();
    error NoPosition();
    error PolicyBlocked(bytes32 reason);
    error ExceedsPosition(uint256 requested, uint256 available);
    error OutstandingDebtBlocksTransfer(uint256 existingDebt);

    constructor(address registryAddress, address policyAddress, address lendingAdapterAddress, uint256 assetId_) {
        registry = ILedgerLineRegistry(registryAddress);
        policy = ILedgerLinePolicy(policyAddress);
        lendingAdapter = LedgerLineLendingAdapter(lendingAdapterAddress);
        assetId = assetId_;
    }

    function _positionId(address user) internal pure returns (uint256) {
        return uint256(uint160(user));
    }

    /// @notice Reassigns `amount` of the caller's position to `to`.
    /// Blocked entirely if the caller carries any outstanding
    /// LendingAdapter debt, regardless of amount -- see contract-level
    /// note. Otherwise lifecycle-gated only, matching the Action.TRANSFER
    /// branch in LedgerLinePolicy.
    function transfer(address to, uint256 amount) external {
        if (!registry.isAssetInitialized(assetId)) revert AssetNotInitialized();

        uint256 positionId = _positionId(msg.sender);
        Position memory position = registry.getPosition(assetId, positionId);
        if (position.rawBalance == 0) revert NoPosition();
        if (amount > position.rawBalance) revert ExceedsPosition(amount, position.rawBalance);

        PolicyResponse memory response = policy.canExecute(assetId, positionId, Action.TRANSFER, amount);

        if (response.decision == Decision.BLOCK) {
            revert PolicyBlocked(response.reason);
        }

        // Policy.canExecute() deliberately does not see debt -- it lives
        // only in LendingAdapter, per the locked Phase 4 design. Unlike
        // VaultAdapter's recomputed-capacity check, TRANSFER's debt rule
        // has nothing to recompute: any debt at all blocks any transfer.
        uint256 existingDebt = lendingAdapter.debt(msg.sender);
        if (existingDebt > 0) {
            revert OutstandingDebtBlocksTransfer(existingDebt);
        }

        lendingAdapter.transferPosition(msg.sender, to, amount);

        emit Transferred(msg.sender, to, amount);
    }
}

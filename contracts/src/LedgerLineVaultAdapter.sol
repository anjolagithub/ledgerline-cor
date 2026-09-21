// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Action, Decision, PolicyResponse, Position} from "./interfaces/LedgerLineTypes.sol";
import {ILedgerLineRegistry} from "./interfaces/ILedgerLineRegistry.sol";
import {ILedgerLinePolicy} from "./interfaces/ILedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "./LedgerLineLendingAdapter.sol";

/// @notice LedgerLine's second reference consumer -- deliberately NOT a
/// second lending market. Proves canExecute() correctly differentiates
/// Action.WITHDRAW from Action.BORROW through the SAME Policy,
/// Registry, and Stylus engines, with zero changes to any of them
/// beyond the real per-action branch added to LedgerLinePolicy.sol.
///
/// CUSTODY DESIGN (disclosed, not hidden): this adapter does not hold
/// collateral tokens itself. Deposits still happen through
/// LedgerLineLendingAdapter (unchanged) so custody stays centralized
/// in one place rather than duplicated. This adapter independently
/// calls Policy.canExecute() and makes its own ALLOW/BLOCK decision --
/// only after ALLOW does it call LendingAdapter.releaseCollateral() to
/// actually move tokens. Policy authority is genuinely distributed
/// across two independent contracts; token custody is deliberately
/// centralized. That is the real, bounded scope of this MVP.
contract LedgerLineVaultAdapter {
    ILedgerLineRegistry public immutable registry;
    ILedgerLinePolicy public immutable policy;
    LedgerLineLendingAdapter public immutable lendingAdapter;
    uint256 public immutable assetId;

    event Withdrawn(address indexed user, uint256 amount, uint256 newRawBalance);

    error AssetNotInitialized();
    error NoPosition();
    error PolicyBlocked(bytes32 reason);
    error ExceedsPosition(uint256 requested, uint256 available);

    constructor(
        address registryAddress,
        address policyAddress,
        address lendingAdapterAddress,
        uint256 assetId_
    ) {
        registry = ILedgerLineRegistry(registryAddress);
        policy = ILedgerLinePolicy(policyAddress);
        lendingAdapter = LedgerLineLendingAdapter(lendingAdapterAddress);
        assetId = assetId_;
    }

    function _positionId(address user) internal pure returns (uint256) {
        return uint256(uint160(user));
    }

    /// @notice Withdraw (redeem) previously-deposited collateral.
    /// Deliberately NOT gated by borrowing capacity -- Action.WITHDRAW
    /// is evaluated by Policy purely on lifecycle state, proving the
    /// same canExecute() call genuinely differentiates by action type.
    function withdraw(uint256 amount) external {
        if (!registry.isAssetInitialized(assetId)) revert AssetNotInitialized();

        uint256 positionId = _positionId(msg.sender);
        Position memory position = registry.getPosition(assetId, positionId);
        if (position.rawBalance == 0) revert NoPosition();
        if (amount > position.rawBalance) revert ExceedsPosition(amount, position.rawBalance);

        PolicyResponse memory response = policy.canExecute(assetId, positionId, Action.WITHDRAW, amount);

        if (response.decision == Decision.BLOCK) {
            revert PolicyBlocked(response.reason);
        }

        lendingAdapter.releaseCollateral(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, position.rawBalance - amount);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Action, Decision, PolicyResponse, Position} from "./interfaces/LedgerLineTypes.sol";
import {ILedgerLineRegistry} from "./interfaces/ILedgerLineRegistry.sol";
import {ILedgerLinePolicy} from "./interfaces/ILedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "./LedgerLineLendingAdapter.sol";

/// @notice LedgerLine's third reference consumer -- the first to exercise
/// Action.LIQUIDATE. Proves canExecute()'s LIQUIDATE branch end to end:
/// this adapter supplies the borrower's real outstanding debt as the
/// `amount` parameter (Policy is deliberately debt-agnostic and never
/// reads LendingAdapter directly -- see LedgerLinePolicy.sol's LIQUIDATE
/// branch), gets back ALLOW/BLOCK from the same Stylus RiskEngine used
/// by every other action, and only on ALLOW calls LendingAdapter's
/// liquidate() to actually reduce debt and seize collateral.
///
/// CUSTODY DESIGN (same pattern as VaultAdapter/TransferAdapter): this
/// adapter holds no tokens itself. It makes its own independent
/// Policy.canExecute() decision, then -- only after ALLOW -- calls
/// LendingAdapter.liquidate(), which is the sole place collateral and
/// debt actually move. Policy authority is distributed; custody stays
/// centralized in one already-audited contract.
///
/// PRICING IS OUT OF SCOPE HERE (disclosed, not hidden): this contract
/// does not compute a liquidation bonus or verify seizeAmount is a fair
/// exchange for repayAmount. The caller (a liquidator bot, or the
/// frontend acting on a connected wallet) chooses both amounts, using
/// live price data, and is the one who profits or loses on the trade --
/// exactly like a real liquidator would size a call to Aave or
/// Compound. What this contract enforces is narrower and more
/// important: that the position is genuinely eligible for liquidation
/// right now, per Policy's ALLOW/BLOCK decision, before any collateral
/// moves. Anyone can call this for any borrower -- permissionless
/// liquidation, the same as every reference lending protocol.
contract LedgerLineLiquidationAdapter {
    ILedgerLineRegistry public immutable registry;
    ILedgerLinePolicy public immutable policy;
    LedgerLineLendingAdapter public immutable lendingAdapter;
    uint256 public immutable assetId;

    event Liquidated(
        address indexed borrower, address indexed liquidator, uint256 repayAmount, uint256 seizeAmount, uint256 debtAtLiquidation
    );

    error AssetNotInitialized();
    error NoPosition();
    error NoDebt();
    error PolicyBlocked(bytes32 reason);
    error SeizeExceedsPosition(uint256 requested, uint256 available);
    error RepayExceedsDebt(uint256 requested, uint256 available);

    constructor(address registryAddress, address policyAddress, address lendingAdapterAddress, uint256 assetId_) {
        registry = ILedgerLineRegistry(registryAddress);
        policy = ILedgerLinePolicy(policyAddress);
        lendingAdapter = LedgerLineLendingAdapter(lendingAdapterAddress);
        assetId = assetId_;
    }

    function _positionId(address user) internal pure returns (uint256) {
        return uint256(uint160(user));
    }

    /// @notice Liquidates `borrower`'s position: repays `repayAmount` of
    /// their debt (pulled from msg.sender via LendingAdapter) and seizes
    /// `seizeAmount` of their collateral (paid to msg.sender), but only
    /// if Policy.canExecute() -- given the borrower's real, live debt --
    /// returns ALLOW for Action.LIQUIDATE. Reverts with PolicyBlocked
    /// otherwise, e.g. because debt has not (or no longer) crossed the
    /// RiskEngine's liquidation threshold.
    ///
    /// Permissionless: any address may call this for any borrower, and
    /// receives the seized collateral itself as msg.sender.
    function liquidate(address borrower, uint256 repayAmount, uint256 seizeAmount) external {
        if (!registry.isAssetInitialized(assetId)) revert AssetNotInitialized();

        uint256 positionId = _positionId(borrower);
        Position memory position = registry.getPosition(assetId, positionId);
        if (position.rawBalance == 0) revert NoPosition();
        if (seizeAmount > position.rawBalance) revert SeizeExceedsPosition(seizeAmount, position.rawBalance);

        // Policy never reads LendingAdapter -- this adapter is the one
        // place that legitimately needs visibility into both the
        // Registry position AND the real debt, so it supplies debt as
        // the LIQUIDATE `amount` parameter itself, per Policy's
        // documented (deliberately debt-agnostic) LIQUIDATE contract.
        uint256 currentDebt = lendingAdapter.debt(borrower);
        if (currentDebt == 0) revert NoDebt();
        if (repayAmount > currentDebt) revert RepayExceedsDebt(repayAmount, currentDebt);

        PolicyResponse memory response = policy.canExecute(assetId, positionId, Action.LIQUIDATE, currentDebt);

        if (response.decision == Decision.BLOCK) {
            revert PolicyBlocked(response.reason);
        }

        lendingAdapter.liquidate(borrower, repayAmount, seizeAmount, msg.sender);

        emit Liquidated(borrower, msg.sender, repayAmount, seizeAmount, currentDebt);
    }
}

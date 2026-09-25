// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Standardized asset lifecycle states. Additional states may be
/// added later; existing ones must not be removed or renumbered once used
/// onchain.
enum LifecycleState {
    ACTIVE,
    RESTRICTED,
    CORPORATE_ACTION,
    SUSPENDED,
    MATURING,
    REDEEMABLE,
    REDEEMED
}

/// @notice Financial actions a consuming protocol may request permission for.
enum Action {
    BORROW,
    WITHDRAW,
    TRANSFER,
    INCREASE_LEVERAGE,
    LIQUIDATE
}

/// @notice Policy decisions returned by canExecute.
/// REVIEW is reserved for a future manual-review path and has no MVP
/// trigger — do not wire logic to it until a trigger is explicitly approved.
enum Decision {
    ALLOW,
    LIMIT,
    REVIEW,
    BLOCK
}

/// @notice Per-asset state, populated by an IAssetStateAdapter implementation.
/// @dev price/multiplier fixed-point precision is defined in Phase 2, once
/// the adapter's real data source is confirmed.
struct AssetState {
    uint256 price;
    uint256 multiplier;
    LifecycleState lifecycle;
    uint256 collateralFactorBps;
    uint256 riskAdjustmentBps;
}

/// @notice Per-user, per-asset position. Only the raw balance is stored;
/// position value and borrowing capacity are always computed on read.
struct Position {
    uint256 rawBalance;
}

/// @notice Response returned by ILedgerLinePolicy.canExecute.
/// permittedAmount is the maximum amount LedgerLine permits — it is NOT
/// the requested amount, and it is not reduced to match a smaller request.
/// The caller must enforce requestedAmount <= permittedAmount itself.
struct PolicyResponse {
    Decision decision;
    uint256 permittedAmount;
    bytes32 reason;
}

// Machine-readable PolicyResponse.reason values. Consumers should match
// against these constants rather than assuming string layout.
bytes32 constant REASON_OK = "OK";
bytes32 constant REASON_EXCEEDS_CAPACITY = "EXCEEDS_CAPACITY";
bytes32 constant REASON_NO_CAPACITY = "NO_CAPACITY";
bytes32 constant REASON_RESTRICTED = "RESTRICTED";
bytes32 constant REASON_CORPORATE_ACTION = "CORPORATE_ACTION";
bytes32 constant REASON_SUSPENDED = "SUSPENDED";
bytes32 constant REASON_MATURING = "MATURING";
bytes32 constant REASON_REDEEMABLE = "REDEEMABLE";
bytes32 constant REASON_REDEEMED = "REDEEMED";
// LIQUIDATE only: the position's debt is at or below its maintenance
// threshold, so it is healthy and not eligible for liquidation.
bytes32 constant REASON_ABOVE_MAINTENANCE = "ABOVE_MAINTENANCE";

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Stateless borrowing-capacity calculation. Implemented as an
/// Arbitrum Stylus (Rust/WASM) contract; this interface is what Solidity
/// calls against. No persistent storage on the other side.
interface IRiskEngine {
    /// @param positionValue Economic position value (from IPositionEngine).
    /// @param collateralFactorBps Base collateral factor, in basis points.
    /// @param riskAdjustmentBps Risk adjustment, in basis points.
    /// @return borrowingCapacity The effective borrowing capacity.
    function computeBorrowingCapacity(
        uint256 positionValue,
        uint256 collateralFactorBps,
        uint256 riskAdjustmentBps
    ) external view returns (uint256 borrowingCapacity);
}

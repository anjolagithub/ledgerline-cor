// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Stateless economic position value calculation. Implemented as
/// an Arbitrum Stylus (Rust/WASM) contract; this interface is what
/// Solidity calls against. No persistent storage on the other side.
interface IPositionEngine {
    /// @param rawBalance Actual token units held.
    /// @param price Current asset price.
    /// @param multiplier Corporate-action adjustment factor (e.g. stock split).
    /// @return positionValue The computed economic value of the position.
    function computePositionValue(
        uint256 rawBalance,
        uint256 price,
        uint256 multiplier
    ) external view returns (uint256 positionValue);
}

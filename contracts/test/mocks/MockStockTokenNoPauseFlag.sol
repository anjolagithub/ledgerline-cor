// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Simulates a real-world Stock Token that does NOT implement
/// oraclePaused() -- matching the verified live testnet TSLA contract
/// behavior (uiMultiplier() works, oraclePaused() reverts / doesn't
/// exist). Deliberately does NOT implement IRobinhoodStockToken fully.
contract MockStockTokenNoPauseFlag {
    uint256 public uiMultiplierValue = 1e18;

    function uiMultiplier() external view returns (uint256) {
        return uiMultiplierValue;
    }

    // Deliberately no oraclePaused() function at all.
}

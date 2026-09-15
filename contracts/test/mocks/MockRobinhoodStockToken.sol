// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRobinhoodStockToken} from "../../src/interfaces/IRobinhoodStockToken.sol";

/// @notice Minimal mock implementing only what RobinhoodStockTokenAdapter
/// reads (uiMultiplier, oraclePaused). Not a real Stock Token.
contract MockRobinhoodStockToken is IRobinhoodStockToken {
    uint256 public uiMultiplierValue = 1e18;
    bool public paused;

    function setUiMultiplier(uint256 value) external {
        uiMultiplierValue = value;
    }

    function setPaused(bool value) external {
        paused = value;
    }

    function uiMultiplier() external view returns (uint256) {
        return uiMultiplierValue;
    }

    function oraclePaused() external view returns (bool) {
        return paused;
    }
}

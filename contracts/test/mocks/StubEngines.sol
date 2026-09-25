// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPositionEngine} from "../../src/interfaces/IPositionEngine.sol";
import {IRiskEngine} from "../../src/interfaces/IRiskEngine.sol";

/// @notice Solidity stand-ins for the Stylus engines, matching their exact
/// formulas, for fast local EVM testing only. See Phase 2 for the real,
/// tested Rust/WASM implementations.
contract StubPositionEngine is IPositionEngine {
    function computePositionValue(uint256 rawBalance, uint256 price, uint256 multiplier)
        external
        pure
        returns (uint256)
    {
        return (rawBalance * price / 1e18) * multiplier / 1e18;
    }
}

contract StubRiskEngine is IRiskEngine {
    function computeBorrowingCapacity(uint256 positionValue, uint256 collateralFactorBps, uint256 riskAdjustmentBps)
        external
        pure
        returns (uint256)
    {
        return (positionValue * collateralFactorBps / 10000) * riskAdjustmentBps / 10000;
    }

    function computeLiquidationThreshold(uint256 positionValue, uint256 collateralFactorBps)
        public
        pure
        returns (uint256)
    {
        return positionValue * collateralFactorBps / 10000;
    }

    function isLiquidatable(uint256 positionValue, uint256 collateralFactorBps, uint256 debt)
        external
        pure
        returns (bool)
    {
        return debt > computeLiquidationThreshold(positionValue, collateralFactorBps);
    }
}

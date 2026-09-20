// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

/// @notice 6-decimal mock, matching real USDG's actual decimals() (6),
/// verified live on Robinhood Chain testnet. Used only to test
/// LedgerLineLendingAdapter's decimal-scaling logic without needing a
/// real USDG balance in CI/local tests.
contract MockUSDGLike is ERC20 {
    constructor() ERC20("Mock Global Dollar", "mUSDG") {
        _mint(msg.sender, 10_000_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

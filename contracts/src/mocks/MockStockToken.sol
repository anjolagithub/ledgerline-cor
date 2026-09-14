// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/// @notice Mock representation of a Robinhood Stock Token (e.g. AAPL) for
/// demo purposes only. 18 decimals, owner-mintable. NOT a real Stock
/// Token integration -- see RobinhoodStockTokenAdapter for that
/// disclosure.
contract MockStockToken is ERC20, Ownable {
    constructor(address initialOwner, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        Ownable(initialOwner)
    {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/// @notice Mock borrowable asset (e.g. "MockUSD") for the reference
/// lending demo. 18 decimals, owner-mintable. The adapter contract must
/// hold a minted balance of this token to have liquidity to lend out.
contract MockBorrowToken is ERC20, Ownable {
    constructor(address initialOwner, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        Ownable(initialOwner)
    {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

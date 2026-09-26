// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Deploys LedgerLine's first LIQUIDATE consumer:
// LedgerLineLiquidationAdapter. Wired to the SAME Policy as the current
// V3 stack (unchanged -- Policy has no dependency on LendingAdapter's
// address) and to the new LendingAdapter from
// RedeployLendingAdapter3.s.sol (which carries the new liquidate()
// function this adapter calls on ALLOW).
//
// DEPLOY ONLY. Authorizing this instance as a releaser on the new
// LendingAdapter is a separate `cast send` step -- see
// RedeployLendingAdapter3.s.sol's header for the exact commands.
//
// Once authorized, liquidation is permissionless: anyone can call
// liquidate(borrower, repayAmount, seizeAmount) for any undercollateralized
// borrower.

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineLiquidationAdapter} from "../src/LedgerLineLiquidationAdapter.sol";

contract DeployLiquidationAdapter is Script {
    uint256 constant ASSET_ID = 1;
    address constant REGISTRY = 0x88508A6d9266fbc928cC11DEE92f4EB1801B907c;
    address constant CURRENT_POLICY = 0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460;

    // Set to RedeployLendingAdapter3.s.sol's confirmed output before
    // running.
    address constant NEW_LENDING_ADAPTER = address(0);

    function run() external {
        require(NEW_LENDING_ADAPTER != address(0), "Set NEW_LENDING_ADAPTER first");

        vm.startBroadcast();

        LedgerLineLiquidationAdapter liquidationAdapter =
            new LedgerLineLiquidationAdapter(REGISTRY, CURRENT_POLICY, NEW_LENDING_ADAPTER, ASSET_ID);

        vm.stopBroadcast();

        console.log("New LiquidationAdapter:", address(liquidationAdapter));
        console.log("NOT yet authorized -- run:");
        console.log("  cast send <NEW_LENDING_ADAPTER> \"setAuthorizedReleaser(address,bool)\" <this address> true --account <keystore>");
        console.log("then confirm with `cast call <NEW_LENDING_ADAPTER> \"isAuthorizedReleaser(address)\" <this address>`.");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Deploys ONLY a new LedgerLineVaultAdapter wired to the new
// LendingAdapter from RedeployLendingAdapter3.s.sol -- required because
// lendingAdapterAddress is baked into this contract's constructor with
// no setter, and RedeployLendingAdapter3 deploys a fresh LendingAdapter
// instance (to carry the new liquidate() function). Policy is
// unchanged from the current V3 stack.
//
// DEPLOY ONLY. Authorizing this instance as a releaser on the new
// LendingAdapter is a separate `cast send` step, run and verified on
// its own -- see RedeployLendingAdapter3.s.sol's header for the exact
// commands.

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineVaultAdapter} from "../src/LedgerLineVaultAdapter.sol";

contract RedeployVaultAdapter3 is Script {
    uint256 constant ASSET_ID = 1;
    address constant REGISTRY = 0x88508A6d9266fbc928cC11DEE92f4EB1801B907c;
    address constant CURRENT_POLICY = 0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460;

    // Set to RedeployLendingAdapter3.s.sol's confirmed output before
    // running.
    address constant NEW_LENDING_ADAPTER = address(0);

    function run() external {
        require(NEW_LENDING_ADAPTER != address(0), "Set NEW_LENDING_ADAPTER first");

        vm.startBroadcast();

        LedgerLineVaultAdapter vaultAdapter =
            new LedgerLineVaultAdapter(REGISTRY, CURRENT_POLICY, NEW_LENDING_ADAPTER, ASSET_ID);

        vm.stopBroadcast();

        console.log("New VaultAdapter (wired to new LendingAdapter):", address(vaultAdapter));
        console.log("NOT yet authorized -- run:");
        console.log("  cast send <NEW_LENDING_ADAPTER> \"setAuthorizedReleaser(address,bool)\" <this address> true --account <keystore>");
        console.log("then confirm with `cast call <NEW_LENDING_ADAPTER> \"isAuthorizedReleaser(address)\" <this address>`.");
    }
}

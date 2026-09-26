// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Deploys ONLY a new LedgerLineTransferAdapter wired to the new
// LendingAdapter from RedeployLendingAdapter3.s.sol -- same reason as
// RedeployVaultAdapter3.s.sol: lendingAdapterAddress is constructor-only,
// no setter. Policy is unchanged from the current V3 stack.
//
// DEPLOY ONLY. Authorize separately (see RedeployLendingAdapter3.s.sol's
// header for the exact `cast send` / `cast call` sequence).

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineTransferAdapter} from "../src/LedgerLineTransferAdapter.sol";

contract RedeployTransferAdapter3 is Script {
    uint256 constant ASSET_ID = 1;
    address constant REGISTRY = 0x88508A6d9266fbc928cC11DEE92f4EB1801B907c;
    address constant CURRENT_POLICY = 0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460;

    // Set to RedeployLendingAdapter3.s.sol's confirmed output before
    // running.
    address constant NEW_LENDING_ADAPTER = address(0);

    function run() external {
        require(NEW_LENDING_ADAPTER != address(0), "Set NEW_LENDING_ADAPTER first");

        vm.startBroadcast();

        LedgerLineTransferAdapter transferAdapter =
            new LedgerLineTransferAdapter(REGISTRY, CURRENT_POLICY, NEW_LENDING_ADAPTER, ASSET_ID);

        vm.stopBroadcast();

        console.log("New TransferAdapter (wired to new LendingAdapter):", address(transferAdapter));
        console.log("NOT yet authorized -- run:");
        console.log("  cast send <NEW_LENDING_ADAPTER> \"setAuthorizedReleaser(address,bool)\" <this address> true --account <keystore>");
        console.log("then confirm with `cast call <NEW_LENDING_ADAPTER> \"isAuthorizedReleaser(address)\" <this address>`.");
    }
}

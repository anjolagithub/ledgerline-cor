// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Deploys ONLY a new LedgerLineVaultAdapter wired to the new Policy
// (RedeployPolicy2.s.sol) and new LendingAdapter
// (RedeployLendingAdapter2.s.sol) -- required because both addresses are
// baked into this contract's constructor with no setters.
//
// DEPLOY ONLY. Authorizing this instance as a releaser on the new
// LendingAdapter is a separate `cast send` step, run and verified on its
// own -- see RedeployLendingAdapter2.s.sol's header for the exact commands
// and docs/DEPLOYMENTS.md for why this repo never combines deploy with an
// onlyOwner call in the same broadcast.

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineVaultAdapter} from "../src/LedgerLineVaultAdapter.sol";

contract RedeployVaultAdapter2 is Script {
    uint256 constant ASSET_ID = 1;
    address constant REGISTRY = 0x88508A6d9266fbc928cC11DEE92f4EB1801B907c;

    // Fill in with confirmed outputs from RedeployPolicy2.s.sol and
    // RedeployLendingAdapter2.s.sol before broadcasting.
    address constant NEW_POLICY = address(0); // <-- SET ME
    address constant NEW_LENDING_ADAPTER = address(0); // <-- SET ME

    function run() external {
        require(NEW_POLICY != address(0), "Set NEW_POLICY first");
        require(NEW_LENDING_ADAPTER != address(0), "Set NEW_LENDING_ADAPTER first");

        vm.startBroadcast();

        LedgerLineVaultAdapter vaultAdapter =
            new LedgerLineVaultAdapter(REGISTRY, NEW_POLICY, NEW_LENDING_ADAPTER, ASSET_ID);

        vm.stopBroadcast();

        console.log("New VaultAdapter (wired to new Policy + new LendingAdapter):", address(vaultAdapter));
        console.log("NOT yet authorized -- run:");
        console.log("  cast send <NEW_LENDING_ADAPTER> \"setAuthorizedReleaser(address,bool)\" <this address> true --account <keystore>");
        console.log("then confirm with `cast call <NEW_LENDING_ADAPTER> \"isAuthorizedReleaser(address)\" <this address>`.");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Deploys ONLY a new LedgerLineTransferAdapter wired to the new Policy
// (RedeployPolicy2.s.sol) and new LendingAdapter
// (RedeployLendingAdapter2.s.sol) -- same reason as
// RedeployVaultAdapter2.s.sol: both addresses are constructor-only, no
// setters.
//
// DEPLOY ONLY. Authorize separately (see RedeployLendingAdapter2.s.sol's
// header for the exact `cast send` / `cast call` sequence).

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineTransferAdapter} from "../src/LedgerLineTransferAdapter.sol";

contract RedeployTransferAdapter2 is Script {
    uint256 constant ASSET_ID = 1;
    address constant REGISTRY = 0x88508A6d9266fbc928cC11DEE92f4EB1801B907c;

    // Fill in with confirmed outputs before broadcasting.
    address constant NEW_POLICY = address(0); // <-- SET ME
    address constant NEW_LENDING_ADAPTER = address(0); // <-- SET ME

    function run() external {
        require(NEW_POLICY != address(0), "Set NEW_POLICY first");
        require(NEW_LENDING_ADAPTER != address(0), "Set NEW_LENDING_ADAPTER first");

        vm.startBroadcast();

        LedgerLineTransferAdapter transferAdapter =
            new LedgerLineTransferAdapter(REGISTRY, NEW_POLICY, NEW_LENDING_ADAPTER, ASSET_ID);

        vm.stopBroadcast();

        console.log("New TransferAdapter (wired to new Policy + new LendingAdapter):", address(transferAdapter));
        console.log("NOT yet authorized -- run:");
        console.log("  cast send <NEW_LENDING_ADAPTER> \"setAuthorizedReleaser(address,bool)\" <this address> true --account <keystore>");
        console.log("then confirm with `cast call <NEW_LENDING_ADAPTER> \"isAuthorizedReleaser(address)\" <this address>`.");
    }
}

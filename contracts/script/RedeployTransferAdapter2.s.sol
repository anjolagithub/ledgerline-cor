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

    // Deployed 2026-09-26: Policy tx 0x4cda5c91d6dec4cd870076efe9f358e745f63d942634e6ed798f053f05d8476c,
    // LendingAdapter tx 0xf154260adadba91e04cf5e39669ca89039c00d30fe1af8700c5d16947fa393e0.
    address constant NEW_POLICY = 0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460;
    address constant NEW_LENDING_ADAPTER = 0x020Bdf07C8970877677Ef064670a4d3BbDBcCa43;

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

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Deploys LedgerLineTransferAdapter, the third reference consumer
// (Action.TRANSFER), against the already-live Registry/Policy/
// LendingAdapter, then authorizes it via setAuthorizedReleaser so
// transferPosition() actually works.

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineTransferAdapter} from "../src/LedgerLineTransferAdapter.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";

contract DeployTransferAdapter is Script {
    uint256 constant ASSET_ID = 1;
    address constant REGISTRY = 0x88508A6d9266fbc928cC11DEE92f4EB1801B907c;
    address constant POLICY = 0x22fA5c1C36Cc1F7557B932dE7aCDa354ee4F6F52;
    address constant LENDING_ADAPTER = 0x39E0d1F2877c69F1a617a86d4Bd4F8B3f2493C97;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        LedgerLineTransferAdapter transferAdapter = new LedgerLineTransferAdapter(
            REGISTRY, POLICY, LENDING_ADAPTER, ASSET_ID
        );

        LedgerLineLendingAdapter(LENDING_ADAPTER).setAuthorizedReleaser(address(transferAdapter), true);

        vm.stopBroadcast();

        console.log("TransferAdapter deployed:", address(transferAdapter));
        console.log("Authorized as releaser on LendingAdapter:", LENDING_ADAPTER);
    }
}

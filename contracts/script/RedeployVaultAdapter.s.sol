// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Redeploys ONLY LedgerLineVaultAdapter with the debt-safety fix
// (withdraw() now checks it wouldn't leave outstanding LendingAdapter
// debt uncollateralized). Re-authorizes the new instance as a
// releaser -- the old VaultAdapter's authorization is left in place
// but the old instance is abandoned, same pattern as the previous
// RobinhoodStockTokenAdapter redeploy.

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineVaultAdapter} from "../src/LedgerLineVaultAdapter.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";

contract RedeployVaultAdapter is Script {
    uint256 constant ASSET_ID = 1;
    address constant REGISTRY = 0x88508A6d9266fbc928cC11DEE92f4EB1801B907c;
    address constant POLICY = 0x22fA5c1C36Cc1F7557B932dE7aCDa354ee4F6F52;
    address constant LENDING_ADAPTER = 0x39E0d1F2877c69F1a617a86d4Bd4F8B3f2493C97;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        LedgerLineVaultAdapter vaultAdapter = new LedgerLineVaultAdapter(
            REGISTRY, POLICY, LENDING_ADAPTER, ASSET_ID
        );

        LedgerLineLendingAdapter(LENDING_ADAPTER).setAuthorizedReleaser(address(vaultAdapter), true);

        vm.stopBroadcast();

        console.log("New VaultAdapter (debt-safety fix):", address(vaultAdapter));
        console.log("Old, unfixed instance (do not use): 0x5d27a9aC4bC4b63BE9939bD386c4f198B7308D67");
    }
}

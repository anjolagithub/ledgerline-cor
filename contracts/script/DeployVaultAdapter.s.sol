// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Deploys LedgerLineVaultAdapter against the already-live Registry,
// Policy, and LendingAdapter on Robinhood Chain testnet, then
// authorizes it as a releaser on LendingAdapter so its withdraw()
// flow can actually move custodied TSLA.

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineVaultAdapter} from "../src/LedgerLineVaultAdapter.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";

contract DeployVaultAdapter is Script {
    uint256 constant ASSET_ID = 1;

    // Already live -- verified this session, not re-deployed.
    address constant REGISTRY = 0x58202CfE6F8e6Eb9544B62542eeE8Cdb8DBd6aff;
    address constant POLICY = 0x3AaB9D02bED0850E0d991C886e8212d1c03c03B9;
    address constant LENDING_ADAPTER = 0x598e3884657c8eF4870381E4c1Cc4e8e2D0dbcB7;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        LedgerLineVaultAdapter vaultAdapter = new LedgerLineVaultAdapter(
            REGISTRY, POLICY, LENDING_ADAPTER, ASSET_ID
        );

        LedgerLineLendingAdapter(LENDING_ADAPTER).setAuthorizedReleaser(address(vaultAdapter), true);

        vm.stopBroadcast();

        console.log("VaultAdapter deployed:", address(vaultAdapter));
        console.log("Authorized as releaser on LendingAdapter:", LENDING_ADAPTER);
    }
}

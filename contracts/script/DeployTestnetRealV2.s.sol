// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Full redeploy, V2: includes VaultAdapter from the start. The V1
// LendingAdapter (0x598e3884657c8eF4870381E4c1Cc4e8e2D0dbcB7) predates
// authorized-releaser support and cannot be retrofitted -- this
// replaces the entire stack atomically instead of patching around it.
// Real TSLA and USDG addresses unchanged and re-verified from V1.

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineRegistry} from "../src/LedgerLineRegistry.sol";
import {LedgerLinePolicy} from "../src/LedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";
import {LedgerLineVaultAdapter} from "../src/LedgerLineVaultAdapter.sol";
import {RobinhoodStockTokenAdapter} from "../src/RobinhoodStockTokenAdapter.sol";
import {MockChainlinkFeed} from "../test/mocks/MockChainlinkFeed.sol";

contract DeployTestnetRealV2 is Script {
    uint256 constant ASSET_ID = 1;
    uint256 constant ONE = 1e18;

    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    int256 constant SEED_PRICE_8DP = 36427000000; // $364.27, same reference as V1

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address positionEngine = vm.envAddress("POSITION_ENGINE_ADDRESS");
        address riskEngine = vm.envAddress("RISK_ENGINE_ADDRESS");

        vm.startBroadcast(deployerKey);

        MockChainlinkFeed referenceFeed = new MockChainlinkFeed(SEED_PRICE_8DP, 8);

        RobinhoodStockTokenAdapter stockAdapter = new RobinhoodStockTokenAdapter(
            deployer, TSLA, address(referenceFeed), address(0),
            3600, 7 days, 7000, 8000
        );

        LedgerLineRegistry registry = new LedgerLineRegistry(deployer);

        LedgerLinePolicy policy = new LedgerLinePolicy(
            deployer, address(registry), positionEngine, riskEngine
        );

        LedgerLineLendingAdapter lendingAdapter = new LedgerLineLendingAdapter(
            deployer, address(registry), address(policy), TSLA, USDG, ASSET_ID
        );

        LedgerLineVaultAdapter vaultAdapter = new LedgerLineVaultAdapter(
            address(registry), address(policy), address(lendingAdapter), ASSET_ID
        );

        registry.setPositionWriter(address(lendingAdapter));
        lendingAdapter.setAuthorizedReleaser(address(vaultAdapter), true);
        registry.initializeAsset(ASSET_ID, uint256(SEED_PRICE_8DP) * 1e10, ONE, 7000, 8000);

        vm.stopBroadcast();

        console.log("=== V2 Deployment (includes VaultAdapter) ===");
        console.log("MockChainlinkFeed:          ", address(referenceFeed));
        console.log("RobinhoodStockTokenAdapter: ", address(stockAdapter));
        console.log("Registry:                   ", address(registry));
        console.log("Policy:                     ", address(policy));
        console.log("LendingAdapter:             ", address(lendingAdapter));
        console.log("VaultAdapter:               ", address(vaultAdapter));
        console.log("TSLA:                       ", TSLA);
        console.log("USDG:                       ", USDG);
        console.log("");
        console.log("Old V1 LendingAdapter (0x598e3884...dbcB7) is now");
        console.log("abandoned -- 1 TSLA remains stranded there permanently.");
        console.log("Re-deposit fresh TSLA and re-send USDG liquidity to the");
        console.log("NEW LendingAdapter address above.");
    }
}

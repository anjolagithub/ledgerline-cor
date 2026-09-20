// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Deploys the Solidity stack against REAL, already-deployed Stylus
// engines (Position/Risk) -- pass their addresses via env vars.
// Run this AFTER `cargo stylus deploy` for both engines against the
// local Nitro devnode.

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineRegistry} from "../src/LedgerLineRegistry.sol";
import {LedgerLinePolicy} from "../src/LedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockBorrowToken} from "../src/mocks/MockBorrowToken.sol";

contract DeployDevnode is Script {
    uint256 constant ASSET_ID = 1;
    uint256 constant ONE = 1e18;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address positionEngine = vm.envAddress("POSITION_ENGINE_ADDRESS");
        address riskEngine = vm.envAddress("RISK_ENGINE_ADDRESS");

        vm.startBroadcast(deployerKey);

        LedgerLineRegistry registry = new LedgerLineRegistry(deployer);
        MockStockToken stock = new MockStockToken(deployer, "Mock AAPL", "mAAPL");
        MockBorrowToken usd = new MockBorrowToken(deployer, "Mock USD", "mUSD");

        LedgerLinePolicy policy = new LedgerLinePolicy(
            deployer, address(registry), positionEngine, riskEngine
        );

        LedgerLineLendingAdapter adapter = new LedgerLineLendingAdapter(
            deployer, address(registry), address(policy), address(stock), address(usd), ASSET_ID
        );

        registry.setPositionWriter(address(adapter));
        registry.initializeAsset(ASSET_ID, 200 * ONE, ONE, 7000, 8000);
        usd.mint(address(adapter), 1_000_000 * ONE);
        stock.mint(deployer, 10_000 * ONE);

        vm.stopBroadcast();

        console.log("Registry:        ", address(registry));
        console.log("Policy:          ", address(policy));
        console.log("LendingAdapter:  ", address(adapter));
        console.log("MockStockToken:  ", address(stock));
        console.log("MockBorrowToken: ", address(usd));
        console.log("PositionEngine:  ", positionEngine);
        console.log("RiskEngine:      ", riskEngine);
        console.log("Deployer:        ", deployer);
    }
}

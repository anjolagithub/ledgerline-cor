// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Real Robinhood Chain testnet deployment.
//
// VERIFIED LIVE (this session, via direct cast call against the real
// chain -- not assumed from docs):
//   - TSLA:  0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E (18 decimals,
//            uiMultiplier() = 1e18, real balance in deployer wallet)
//   - USDG:  0x7E955252E15c84f5768B83c41a71F9eba181802F (6 decimals,
//            name "Global Dollar")
//
// KNOWN GAPS (verified absent, not assumed):
//   - No live Chainlink tokenized-equity feed for Robinhood Chain
//     testnet (Mainnet-only per Chainlink's own address table) --
//     MockChainlinkFeed deployed here as an operator-fed reference
//     price instead. Swapping to a real feed later, if/when one
//     ships, needs only priceFeed.setPriceFeed(realAddress) -- no
//     code changes.
//   - No Chainlink L2 Sequencer Uptime Feed exists for Robinhood
//     Chain on any network -- sequencerCheckEnabled stays at its
//     default (false).

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineRegistry} from "../src/LedgerLineRegistry.sol";
import {LedgerLinePolicy} from "../src/LedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";
import {RobinhoodStockTokenAdapter} from "../src/RobinhoodStockTokenAdapter.sol";
import {MockChainlinkFeed} from "../test/mocks/MockChainlinkFeed.sol";

contract DeployTestnetReal is Script {
    uint256 constant ASSET_ID = 1;
    uint256 constant ONE = 1e18;

    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;

    // Reference price seeded from real market data at deploy-script
    // write time ($364.27, 8-decimal Chainlink-style answer). This is
    // NOT live -- update via priceFeed.setAnswer() to refresh, or
    // replace the whole feed once/if a real one ships for this chain.
    int256 constant SEED_PRICE_8DP = 36427000000;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address positionEngine = vm.envAddress("POSITION_ENGINE_ADDRESS");
        address riskEngine = vm.envAddress("RISK_ENGINE_ADDRESS");

        vm.startBroadcast(deployerKey);

        // Operator-fed reference price feed -- disclosed, not disguised
        // as a live Chainlink feed.
        MockChainlinkFeed referenceFeed = new MockChainlinkFeed(SEED_PRICE_8DP, 8);

        RobinhoodStockTokenAdapter stockAdapter = new RobinhoodStockTokenAdapter(
            deployer,
            TSLA,
            address(referenceFeed),
            address(0), // no real sequencer feed exists for this chain
            3600, // gracePeriodSeconds (irrelevant while check disabled)
            7 days, // stalenessThresholdSeconds -- generous, this is our own manually-refreshed feed
            7000, // collateralFactorBps
            8000 // riskAdjustmentBps
        );
        // sequencerCheckEnabled defaults to false -- left as-is.

        LedgerLineRegistry registry = new LedgerLineRegistry(deployer);

        LedgerLinePolicy policy = new LedgerLinePolicy(
            deployer, address(registry), positionEngine, riskEngine
        );

        LedgerLineLendingAdapter lendingAdapter = new LedgerLineLendingAdapter(
            deployer, address(registry), address(policy), TSLA, USDG, ASSET_ID
        );

        registry.setPositionWriter(address(lendingAdapter));

        // Registry is initialized directly with the same values the
        // stockAdapter reports -- the adapter-to-Registry push is a
        // manual/keeper-driven step (disclosed since Phase 7), not
        // automatic yet.
        registry.initializeAsset(ASSET_ID, uint256(SEED_PRICE_8DP) * 1e10, ONE, 7000, 8000);

        vm.stopBroadcast();

        console.log("=== Real Robinhood Chain Testnet Deployment ===");
        console.log("MockChainlinkFeed (reference price):", address(referenceFeed));
        console.log("RobinhoodStockTokenAdapter:          ", address(stockAdapter));
        console.log("Registry:                            ", address(registry));
        console.log("Policy:                              ", address(policy));
        console.log("LendingAdapter:                      ", address(lendingAdapter));
        console.log("TSLA (real, collateral):             ", TSLA);
        console.log("USDG (real, borrow asset):           ", USDG);
        console.log("PositionEngine (real Stylus):        ", positionEngine);
        console.log("RiskEngine (real Stylus):            ", riskEngine);
        console.log("Deployer:                            ", deployer);
        console.log("");
        console.log("REQUIRED MANUAL STEP: the adapter needs real USDG liquidity");
        console.log("to lend out. Transfer real testnet USDG (from the Paxos");
        console.log("faucet) to the LendingAdapter address above before testing");
        console.log("borrow(). Your current USDG balance was 0 as of last check --");
        console.log("claim some from the Paxos faucet first.");
    }
}

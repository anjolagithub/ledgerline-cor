// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Redeploys ONLY RobinhoodStockTokenAdapter with the genuinely-fixed
// sequencer-check-optional code (the first deployment predates a fix
// that was written but never actually applied -- confirmed via git
// log and live on-chain testing). Reuses the already-deployed
// MockChainlinkFeed reference price rather than deploying a new one.

import {Script, console} from "forge-std/Script.sol";
import {RobinhoodStockTokenAdapter} from "../src/RobinhoodStockTokenAdapter.sol";

contract RedeployStockAdapter is Script {
    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant EXISTING_REFERENCE_FEED = 0x4548f12F03c3123983b046eAc237876e03a2d7e3;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        RobinhoodStockTokenAdapter stockAdapter = new RobinhoodStockTokenAdapter(
            deployer,
            TSLA,
            EXISTING_REFERENCE_FEED,
            address(0), // no real sequencer feed exists -- now correctly OPTIONAL, defaults disabled
            3600,
            7 days,
            7000,
            8000
        );

        vm.stopBroadcast();

        console.log("New RobinhoodStockTokenAdapter (fixed):", address(stockAdapter));
        console.log("Old, broken instance (do not use):      0x9Ae01A29Ec6774cAB63C6491f8F7D6b3866d1c2f");
    }
}

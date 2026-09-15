// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RobinhoodStockTokenAdapter} from "../src/RobinhoodStockTokenAdapter.sol";
import {AssetState} from "../src/interfaces/LedgerLineTypes.sol";
import {MockChainlinkFeed} from "./mocks/MockChainlinkFeed.sol";
import {MockRobinhoodStockToken} from "./mocks/MockRobinhoodStockToken.sol";

contract RobinhoodStockTokenAdapterTest is Test {
    RobinhoodStockTokenAdapter adapter;
    MockChainlinkFeed priceFeed;
    MockChainlinkFeed sequencerFeed;
    MockRobinhoodStockToken stockToken;

    address owner = address(0xA11CE);
    uint256 constant GRACE_PERIOD = 3600;
    uint256 constant STALENESS_THRESHOLD = 3600;

    function setUp() public {
        vm.warp(100_000); // avoid underflow on block.timestamp - startedAt at t=0

        priceFeed = new MockChainlinkFeed(30_000_000_000, 8); // $300.00 @ 8 decimals
        sequencerFeed = new MockChainlinkFeed(0, 0); // 0 = up
        sequencerFeed.setStartedAt(block.timestamp - GRACE_PERIOD - 1); // grace period already elapsed
        stockToken = new MockRobinhoodStockToken();

        vm.prank(owner);
        adapter = new RobinhoodStockTokenAdapter(
            owner, address(stockToken), address(priceFeed), address(sequencerFeed),
            GRACE_PERIOD, STALENESS_THRESHOLD, 7000, 8000
        );
    }

    function test_returnsScaledPriceAndNeutralMultiplier() public view {
        AssetState memory state = adapter.getAssetState(1);
        assertEq(state.price, 300 * 1e18, "8-decimal feed not scaled to 1e18 correctly");
        assertEq(state.multiplier, 1e18, "multiplier should be neutral -- feed already bakes it in");
    }

    function test_revertsWhenSequencerDown() public {
        sequencerFeed.setAnswer(1); // 1 = down
        vm.expectRevert(RobinhoodStockTokenAdapter.SequencerDown.selector);
        adapter.getAssetState(1);
    }

    function test_revertsDuringSequencerGracePeriod() public {
        sequencerFeed.setStartedAt(block.timestamp); // just came back up
        vm.expectRevert(RobinhoodStockTokenAdapter.GracePeriodNotOver.selector);
        adapter.getAssetState(1);
    }

    function test_revertsWhenOraclePaused() public {
        stockToken.setPaused(true);
        vm.expectRevert(RobinhoodStockTokenAdapter.OracleReportsPaused.selector);
        adapter.getAssetState(1);
    }

    function test_revertsOnZeroPrice() public {
        priceFeed.setAnswer(0);
        vm.expectRevert(RobinhoodStockTokenAdapter.InvalidPrice.selector);
        adapter.getAssetState(1);
    }

    function test_revertsOnNegativePrice() public {
        priceFeed.setAnswer(-1);
        vm.expectRevert(RobinhoodStockTokenAdapter.InvalidPrice.selector);
        adapter.getAssetState(1);
    }

    function test_revertsOnStalePrice() public {
        priceFeed.setUpdatedAt(block.timestamp - STALENESS_THRESHOLD - 1);
        vm.expectRevert(RobinhoodStockTokenAdapter.StalePrice.selector);
        adapter.getAssetState(1);
    }

    function testFuzz_decimalScalingAlwaysCorrect(uint8 decimals, uint64 rawAnswer) public {
        decimals = uint8(bound(decimals, 0, 18));
        vm.assume(rawAnswer > 0);

        MockChainlinkFeed customFeed = new MockChainlinkFeed(int256(uint256(rawAnswer)), decimals);
        vm.prank(owner);
        adapter.setPriceFeed(address(customFeed));

        AssetState memory state = adapter.getAssetState(1);
        uint256 expected = uint256(rawAnswer) * (10 ** (18 - decimals));
        assertEq(state.price, expected);
    }
}

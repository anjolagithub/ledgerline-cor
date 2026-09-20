// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LedgerLineRegistry} from "../src/LedgerLineRegistry.sol";
import {LedgerLinePolicy} from "../src/LedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockUSDGLike} from "./mocks/MockUSDGLike.sol";
import {StubPositionEngine, StubRiskEngine} from "./mocks/StubEngines.sol";

/// @notice Regression test for the decimal-scaling fix. Uses a 6-decimal
/// borrow token (matching real USDG's verified decimals()) instead of
/// the 18-decimal MockBorrowToken, to prove borrow() transfers the
/// correct real token amount, not the raw 18-decimal internal figure.
contract LedgerLineDecimalScalingTest is Test {
    LedgerLineRegistry registry;
    LedgerLinePolicy policy;
    LedgerLineLendingAdapter adapter;
    MockStockToken stock;
    MockUSDGLike usdgLike;

    address owner = address(0xA11CE);
    address user = address(0xB0B);
    uint256 constant ASSET_ID = 1;
    uint256 constant ONE = 1e18;

    function setUp() public {
        vm.startPrank(owner);
        registry = new LedgerLineRegistry(owner);
        stock = new MockStockToken(owner, "Mock AAPL", "mAAPL");
        usdgLike = new MockUSDGLike(); // 6 decimals, mints to owner

        StubPositionEngine positionEngine = new StubPositionEngine();
        StubRiskEngine riskEngine = new StubRiskEngine();
        policy = new LedgerLinePolicy(owner, address(registry), address(positionEngine), address(riskEngine));

        adapter = new LedgerLineLendingAdapter(
            owner, address(registry), address(policy), address(stock), address(usdgLike), ASSET_ID
        );

        registry.setPositionWriter(address(adapter));
        registry.initializeAsset(ASSET_ID, 200 * ONE, ONE, 7000, 8000);

        // Fund the adapter with real 6-decimal units (not 18-decimal!)
        usdgLike.transfer(address(adapter), 1_000_000 * 10 ** 6);

        stock.mint(user, 1000 * ONE);
        vm.stopPrank();
    }

    function test_borrowTransfersCorrectlyScaledAmount() public {
        vm.startPrank(user);
        stock.approve(address(adapter), 1000 * ONE);
        adapter.deposit(1000 * ONE);

        // Borrow $100,000 (18-decimal internal units, same as every
        // other test in this repo)
        adapter.borrow(100_000 * ONE);
        vm.stopPrank();

        // debt is tracked in 18-decimal internal units, unchanged
        assertEq(adapter.debt(user), 100_000 * ONE, "debt should stay in 18-decimal internal units");

        // but the actual token transfer must be in the token's real
        // 6-decimal units: $100,000 = 100_000 * 10**6 raw units
        assertEq(usdgLike.balanceOf(user), 100_000 * 10 ** 6, "transferred amount not correctly scaled to 6 decimals");
    }

    function test_borrowTokenDecimalsReadCorrectly() public view {
        assertEq(adapter.borrowTokenDecimals(), 6);
    }
}

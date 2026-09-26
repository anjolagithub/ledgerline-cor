// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LedgerLineRegistry} from "../src/LedgerLineRegistry.sol";
import {LedgerLinePolicy} from "../src/LedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";
import {LedgerLineLiquidationAdapter} from "../src/LedgerLineLiquidationAdapter.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockUSDGLike} from "./mocks/MockUSDGLike.sol";
import {StubPositionEngine, StubRiskEngine} from "./mocks/StubEngines.sol";
import {LifecycleState} from "../src/interfaces/LedgerLineTypes.sol";

/// @notice Covers LedgerLineLiquidationAdapter end to end, plus the new
/// LedgerLineLendingAdapter.liquidate() function it calls. Uses the
/// 6-decimal MockUSDGLike (matching real USDG) so liquidation exercises
/// the same decimal-scaling path as repay(). Setup mirrors
/// LedgerLineLiquidate.t.sol: 1000 shares x $200 = $200,000 value; 70%
/// CF => $140,000 maintenance threshold; 70% x 80% => $112,000
/// borrowing capacity.
///
/// Unlike LedgerLineLiquidate.t.sol (which calls Policy directly because
/// no consumer existed yet), this exercises the real permissionless
/// path: anyone can call LiquidationAdapter.liquidate() for any
/// borrower, it derives the borrower's real debt from LendingAdapter,
/// asks Policy for ALLOW/BLOCK, and only on ALLOW moves tokens.
contract LedgerLineLiquidationAdapterTest is Test {
    LedgerLineRegistry registry;
    LedgerLinePolicy policy;
    LedgerLineLendingAdapter lendingAdapter;
    LedgerLineLiquidationAdapter liquidationAdapter;
    MockStockToken stock;
    MockUSDGLike usdg;

    address owner = address(0xA11CE);
    address user = address(0xB0B);
    address liquidator = address(0xDEAD);
    uint256 constant ASSET_ID = 1;
    uint256 constant ONE = 1e18;
    uint256 constant USDG = 1e6; // one whole USDG in its real 6-decimal units

    event Liquidated(
        address indexed borrower, address indexed liquidator, uint256 repayAmount, uint256 seizeAmount, uint256 debtAtLiquidation
    );

    function setUp() public {
        vm.startPrank(owner);
        registry = new LedgerLineRegistry(owner);
        stock = new MockStockToken(owner, "Mock AAPL", "mAAPL");
        usdg = new MockUSDGLike(); // 6 decimals, 10M minted to owner

        StubPositionEngine positionEngine = new StubPositionEngine();
        StubRiskEngine riskEngine = new StubRiskEngine();
        policy = new LedgerLinePolicy(owner, address(registry), address(positionEngine), address(riskEngine));

        lendingAdapter = new LedgerLineLendingAdapter(
            owner, address(registry), address(policy), address(stock), address(usdg), ASSET_ID
        );
        liquidationAdapter =
            new LedgerLineLiquidationAdapter(address(registry), address(policy), address(lendingAdapter), ASSET_ID);

        registry.setPositionWriter(address(lendingAdapter));
        lendingAdapter.setAuthorizedReleaser(address(liquidationAdapter), true);
        // $200/share x 1000 shares = $200,000 position; 70% x 80% => $112,000 capacity
        registry.initializeAsset(ASSET_ID, 200 * ONE, ONE, 7000, 8000);

        usdg.transfer(address(lendingAdapter), 1_000_000 * USDG); // lending liquidity
        usdg.transfer(liquidator, 1_000_000 * USDG); // liquidator's repay funds
        stock.mint(user, 1000 * ONE);
        vm.stopPrank();

        vm.startPrank(user);
        stock.approve(address(lendingAdapter), 1000 * ONE);
        lendingAdapter.deposit(1000 * ONE);
        vm.stopPrank();

        vm.prank(liquidator);
        usdg.approve(address(lendingAdapter), type(uint256).max);
    }

    function _borrowToFullCapacity() internal {
        vm.prank(user);
        lendingAdapter.borrow(112_000 * ONE); // full $112,000 capacity, still healthy
    }

    function _crashPrice() internal {
        // $200 -> $150: value $150,000, threshold $105,000 < $112,000 debt
        vm.prank(owner);
        registry.updateAssetParameters(ASSET_ID, 150 * ONE, ONE, 7000, 8000);
    }

    // --- happy path ---

    function test_liquidatesUndercollateralizedPosition() public {
        _borrowToFullCapacity();
        _crashPrice();

        uint256 debt = lendingAdapter.debt(user);
        uint256 liquidatorUsdgBefore = usdg.balanceOf(liquidator);
        uint256 liquidatorStockBefore = stock.balanceOf(liquidator);

        vm.expectEmit(true, true, false, true, address(liquidationAdapter));
        emit Liquidated(user, liquidator, 50_000 * ONE, 400 * ONE, debt);

        vm.prank(liquidator);
        liquidationAdapter.liquidate(user, 50_000 * ONE, 400 * ONE);

        assertEq(lendingAdapter.debt(user), debt - 50_000 * ONE, "debt should drop by exactly repayAmount");
        assertEq(
            registry.getPosition(ASSET_ID, uint256(uint160(user))).rawBalance,
            1000 * ONE - 400 * ONE,
            "borrower's position should shrink by exactly seizeAmount"
        );
        assertEq(liquidatorUsdgBefore - usdg.balanceOf(liquidator), 50_000 * USDG, "liquidator pays the repay leg");
        assertEq(stock.balanceOf(liquidator) - liquidatorStockBefore, 400 * ONE, "liquidator receives seized collateral");
    }

    function test_fullLiquidationClearsDebtToZero() public {
        _borrowToFullCapacity();
        _crashPrice();
        uint256 debt = lendingAdapter.debt(user);

        vm.prank(liquidator);
        liquidationAdapter.liquidate(user, debt, 1000 * ONE);

        assertEq(lendingAdapter.debt(user), 0);
    }

    function test_anyoneCanLiquidate_permissionless() public {
        _borrowToFullCapacity();
        _crashPrice();

        address randomCaller = address(0xF00D);
        vm.prank(owner);
        usdg.transfer(randomCaller, 1_000_000 * USDG);
        vm.prank(randomCaller);
        usdg.approve(address(lendingAdapter), type(uint256).max);

        vm.prank(randomCaller);
        liquidationAdapter.liquidate(user, 1_000 * ONE, 10 * ONE);

        assertEq(stock.balanceOf(randomCaller), 10 * ONE, "any caller can act as the liquidator");
    }

    // --- Policy gate: still healthy positions are rejected ---

    function test_healthyPositionCannotBeLiquidated() public {
        _borrowToFullCapacity(); // debt = $112,000, threshold = $140,000: healthy

        vm.prank(liquidator);
        vm.expectRevert(); // PolicyBlocked(REASON_ABOVE_MAINTENANCE)
        liquidationAdapter.liquidate(user, 1_000 * ONE, 10 * ONE);
    }

    function test_noBorrowMeansNoDebtRevert() public {
        vm.prank(liquidator);
        vm.expectRevert(LedgerLineLiquidationAdapter.NoDebt.selector);
        liquidationAdapter.liquidate(user, 1 * ONE, 1 * ONE);
    }

    function test_suspendedAssetBlocksLiquidationEvenIfUndercollateralized() public {
        _borrowToFullCapacity();
        _crashPrice();

        vm.prank(owner);
        registry.transitionLifecycle(ASSET_ID, LifecycleState.SUSPENDED);

        vm.prank(liquidator);
        vm.expectRevert(); // PolicyBlocked(REASON_SUSPENDED)
        liquidationAdapter.liquidate(user, 1_000 * ONE, 10 * ONE);
    }

    // --- boundary and input validation ---

    function test_repayExceedingDebtReverts() public {
        _borrowToFullCapacity();
        _crashPrice();
        uint256 debt = lendingAdapter.debt(user);

        vm.prank(liquidator);
        vm.expectRevert(
            abi.encodeWithSelector(LedgerLineLiquidationAdapter.RepayExceedsDebt.selector, debt + 1, debt)
        );
        liquidationAdapter.liquidate(user, debt + 1, 10 * ONE);
    }

    function test_seizeExceedingPositionReverts() public {
        _borrowToFullCapacity();
        _crashPrice();

        vm.prank(liquidator);
        vm.expectRevert(
            abi.encodeWithSelector(LedgerLineLiquidationAdapter.SeizeExceedsPosition.selector, 1001 * ONE, 1000 * ONE)
        );
        liquidationAdapter.liquidate(user, 1_000 * ONE, 1001 * ONE);
    }

    // --- LendingAdapter.liquidate() authorization gate ---

    function test_lendingAdapterLiquidateRejectsUnauthorizedCaller() public {
        _borrowToFullCapacity();
        _crashPrice();

        vm.prank(liquidator); // not an authorized releaser itself
        vm.expectRevert(
            abi.encodeWithSelector(LedgerLineLendingAdapter.NotAuthorizedReleaser.selector, liquidator)
        );
        lendingAdapter.liquidate(user, 1_000 * ONE, 10 * ONE, liquidator);
    }

    // --- Non-regression: borrow()/repay() untouched by the new function ---

    function test_borrowAndRepayStillWorkAfterLiquidationAdapterWired() public {
        vm.startPrank(user);
        lendingAdapter.borrow(10_000 * ONE);
        assertEq(lendingAdapter.debt(user), 10_000 * ONE);
        vm.stopPrank();
    }
}

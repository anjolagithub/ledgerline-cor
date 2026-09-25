// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LedgerLineRegistry} from "../src/LedgerLineRegistry.sol";
import {LedgerLinePolicy} from "../src/LedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";
import {LedgerLineVaultAdapter} from "../src/LedgerLineVaultAdapter.sol";
import {LedgerLineTransferAdapter} from "../src/LedgerLineTransferAdapter.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockUSDGLike} from "./mocks/MockUSDGLike.sol";
import {StubPositionEngine, StubRiskEngine} from "./mocks/StubEngines.sol";
import {LifecycleState} from "../src/interfaces/LedgerLineTypes.sol";

/// @notice Covers LedgerLineLendingAdapter.repay(). Uses the 6-decimal
/// MockUSDGLike (matching real USDG) rather than the 18-decimal
/// MockBorrowToken, so every repayment exercises the real decimal
/// scaling and rounding path. Also proves repay() closes the
/// "debt is permanent" gap end to end (TransferAdapter unblocks), and
/// that BORROW / WITHDRAW / TRANSFER behave exactly as before.
contract LedgerLineRepayTest is Test {
    LedgerLineRegistry registry;
    LedgerLinePolicy policy;
    LedgerLineLendingAdapter lendingAdapter;
    LedgerLineVaultAdapter vaultAdapter;
    LedgerLineTransferAdapter transferAdapter;
    MockStockToken stock;
    MockUSDGLike usdg;

    address owner = address(0xA11CE);
    address user = address(0xB0B);
    address recipient = address(0xC0FFEE);
    uint256 constant ASSET_ID = 1;
    uint256 constant ONE = 1e18;
    uint256 constant USDG = 1e6; // one whole USDG in its real 6-decimal units

    event Repaid(address indexed user, uint256 amount, uint256 newDebt);

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
        vaultAdapter = new LedgerLineVaultAdapter(address(registry), address(policy), address(lendingAdapter), ASSET_ID);
        transferAdapter =
            new LedgerLineTransferAdapter(address(registry), address(policy), address(lendingAdapter), ASSET_ID);

        registry.setPositionWriter(address(lendingAdapter));
        lendingAdapter.setAuthorizedReleaser(address(vaultAdapter), true);
        lendingAdapter.setAuthorizedReleaser(address(transferAdapter), true);
        // $200/share x 1000 shares = $200,000 position; 70% x 80% => $112,000 capacity
        registry.initializeAsset(ASSET_ID, 200 * ONE, ONE, 7000, 8000);

        usdg.transfer(address(lendingAdapter), 1_000_000 * USDG); // lending liquidity
        usdg.transfer(user, 1_000 * USDG); // spare USDG so the user can cover rounding
        stock.mint(user, 1000 * ONE);
        vm.stopPrank();

        vm.startPrank(user);
        stock.approve(address(lendingAdapter), 1000 * ONE);
        lendingAdapter.deposit(1000 * ONE);
        usdg.approve(address(lendingAdapter), type(uint256).max);
        vm.stopPrank();
    }

    // --- repay() itself ---

    function test_partialRepayment() public {
        vm.startPrank(user);
        lendingAdapter.borrow(10_000 * ONE);
        uint256 userBefore = usdg.balanceOf(user);
        uint256 adapterBefore = usdg.balanceOf(address(lendingAdapter));

        vm.expectEmit(true, false, false, true, address(lendingAdapter));
        emit Repaid(user, 4_000 * ONE, 6_000 * ONE);
        lendingAdapter.repay(4_000 * ONE);
        vm.stopPrank();

        assertEq(lendingAdapter.debt(user), 6_000 * ONE, "debt should drop by exactly the repaid internal amount");
        assertEq(userBefore - usdg.balanceOf(user), 4_000 * USDG, "user should pay 4,000 USDG in 6-decimal units");
        assertEq(usdg.balanceOf(address(lendingAdapter)) - adapterBefore, 4_000 * USDG, "adapter should receive it");
    }

    function test_fullRepaymentClearsDebtToZero() public {
        vm.startPrank(user);
        lendingAdapter.borrow(10_000 * ONE);
        lendingAdapter.repay(10_000 * ONE);
        vm.stopPrank();

        assertEq(lendingAdapter.debt(user), 0);
    }

    function test_fullRepayOfDustyDebtReachesExactlyZero() public {
        // borrow() floors the USDG payout, so debt can carry sub-USDG dust.
        // Repaying the exact debt must still clear it to zero (rounding up
        // the pull), otherwise TransferAdapter's any-debt rule would lock
        // the position forever.
        vm.startPrank(user);
        lendingAdapter.borrow(10_000 * ONE + 5);
        uint256 owed = lendingAdapter.debt(user);
        uint256 userBefore = usdg.balanceOf(user);
        lendingAdapter.repay(owed);
        vm.stopPrank();

        assertEq(lendingAdapter.debt(user), 0, "dusty debt should clear to exactly zero");
        assertEq(userBefore - usdg.balanceOf(user), 10_000 * USDG + 1, "pull should round the dust up to 1 unit");
    }

    function test_repayMoreThanDebtReverts() public {
        vm.startPrank(user);
        lendingAdapter.borrow(10_000 * ONE);
        vm.expectRevert(
            abi.encodeWithSelector(LedgerLineLendingAdapter.RepayExceedsDebt.selector, 10_001 * ONE, 10_000 * ONE)
        );
        lendingAdapter.repay(10_001 * ONE);
        vm.stopPrank();

        assertEq(lendingAdapter.debt(user), 10_000 * ONE, "failed repay must not change debt");
    }

    function test_repayWithZeroDebtReverts() public {
        vm.prank(user);
        vm.expectRevert(LedgerLineLendingAdapter.NoDebt.selector);
        lendingAdapter.repay(1 * ONE);
    }

    function test_repayDustRoundsUpNeverFree() public {
        vm.startPrank(user);
        lendingAdapter.borrow(10_000 * ONE);
        uint256 userBefore = usdg.balanceOf(user);
        lendingAdapter.repay(1); // 1 wei of 18-decimal debt
        vm.stopPrank();

        assertEq(userBefore - usdg.balanceOf(user), 1, "must pull 1 USDG unit, never 0");
        assertEq(lendingAdapter.debt(user), 10_000 * ONE - 1);
    }

    function test_repayAllowedWhenNonActive() public {
        vm.prank(user);
        lendingAdapter.borrow(10_000 * ONE);

        vm.prank(owner);
        registry.transitionLifecycle(ASSET_ID, LifecycleState.SUSPENDED);

        vm.prank(user);
        lendingAdapter.repay(10_000 * ONE);
        assertEq(lendingAdapter.debt(user), 0, "repayment must not be blocked by lifecycle");
    }

    function test_repayRestoresBorrowingRoom() public {
        vm.startPrank(user);
        lendingAdapter.borrow(112_000 * ONE); // borrow to full capacity
        vm.expectRevert();
        lendingAdapter.borrow(1 * ONE); // no room left

        lendingAdapter.repay(12_000 * ONE);
        lendingAdapter.borrow(12_000 * ONE); // room restored
        vm.stopPrank();

        assertEq(lendingAdapter.debt(user), 112_000 * ONE);
    }

    function test_transferUnblockedAfterFullRepay() public {
        vm.prank(user);
        lendingAdapter.borrow(1 * ONE);

        vm.prank(user);
        vm.expectRevert();
        transferAdapter.transfer(recipient, 100 * ONE); // any debt blocks transfer

        vm.startPrank(user);
        lendingAdapter.repay(1 * ONE);
        transferAdapter.transfer(recipient, 100 * ONE); // now allowed
        vm.stopPrank();

        assertEq(registry.getPosition(ASSET_ID, uint256(uint160(recipient))).rawBalance, 100 * ONE);
    }

    // --- Non-regression: BORROW, WITHDRAW and TRANSFER are untouched ---

    function test_borrowBehaviorCompletelyUnchanged() public {
        vm.prank(user);
        lendingAdapter.borrow(100_000 * ONE);
        assertEq(lendingAdapter.debt(user), 100_000 * ONE);
        assertEq(usdg.balanceOf(user), 1_000 * USDG + 100_000 * USDG, "payout still scaled to 6 decimals");
    }

    function test_withdrawBehaviorCompletelyUnchanged() public {
        vm.prank(user);
        vaultAdapter.withdraw(500 * ONE);

        assertEq(registry.getPosition(ASSET_ID, uint256(uint160(user))).rawBalance, 500 * ONE);
        assertEq(stock.balanceOf(user), 500 * ONE, "withdrawn tokens should return to user");
    }

    function test_transferBehaviorCompletelyUnchanged() public {
        vm.prank(user);
        transferAdapter.transfer(recipient, 400 * ONE);

        assertEq(registry.getPosition(ASSET_ID, uint256(uint160(user))).rawBalance, 600 * ONE);
        assertEq(registry.getPosition(ASSET_ID, uint256(uint160(recipient))).rawBalance, 400 * ONE);
        assertEq(stock.balanceOf(address(lendingAdapter)), 1000 * ONE, "no tokens move on transfer");
    }
}

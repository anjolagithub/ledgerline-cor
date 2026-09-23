// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LedgerLineRegistry} from "../src/LedgerLineRegistry.sol";
import {LedgerLinePolicy} from "../src/LedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";
import {LedgerLineVaultAdapter} from "../src/LedgerLineVaultAdapter.sol";
import {LedgerLineTransferAdapter} from "../src/LedgerLineTransferAdapter.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockBorrowToken} from "../src/mocks/MockBorrowToken.sol";
import {StubPositionEngine, StubRiskEngine} from "./mocks/StubEngines.sol";
import {LifecycleState} from "../src/interfaces/LedgerLineTypes.sol";

/// @notice Proves the Phase 11 claim: the SAME Policy, Registry, and
/// engines correctly evaluate Action.TRANSFER (lifecycle-gated only,
/// like WITHDRAW) through a third, independent consumer whose custody
/// mechanic is genuinely different -- no tokens move, only Registry's
/// positionId bookkeeping changes -- with zero changes to BORROW or
/// WITHDRAW's existing behavior.
contract LedgerLineTransferAdapterTest is Test {
    LedgerLineRegistry registry;
    LedgerLinePolicy policy;
    LedgerLineLendingAdapter lendingAdapter;
    LedgerLineVaultAdapter vaultAdapter;
    LedgerLineTransferAdapter transferAdapter;
    MockStockToken stock;
    MockBorrowToken usd;

    address owner = address(0xA11CE);
    address user = address(0xB0B);
    address recipient = address(0xC0FFEE);
    uint256 constant ASSET_ID = 1;
    uint256 constant ONE = 1e18;

    function setUp() public {
        vm.startPrank(owner);
        registry = new LedgerLineRegistry(owner);
        stock = new MockStockToken(owner, "Mock AAPL", "mAAPL");
        usd = new MockBorrowToken(owner, "Mock USD", "mUSD");

        StubPositionEngine positionEngine = new StubPositionEngine();
        StubRiskEngine riskEngine = new StubRiskEngine();
        policy = new LedgerLinePolicy(owner, address(registry), address(positionEngine), address(riskEngine));

        lendingAdapter = new LedgerLineLendingAdapter(
            owner, address(registry), address(policy), address(stock), address(usd), ASSET_ID
        );
        vaultAdapter = new LedgerLineVaultAdapter(
            address(registry), address(policy), address(lendingAdapter), ASSET_ID
        );
        transferAdapter = new LedgerLineTransferAdapter(
            address(registry), address(policy), address(lendingAdapter), ASSET_ID
        );

        registry.setPositionWriter(address(lendingAdapter));
        lendingAdapter.setAuthorizedReleaser(address(vaultAdapter), true);
        lendingAdapter.setAuthorizedReleaser(address(transferAdapter), true);
        registry.initializeAsset(ASSET_ID, 200 * ONE, ONE, 7000, 8000);

        usd.mint(address(lendingAdapter), 10_000_000 * ONE);
        stock.mint(user, 1000 * ONE);
        vm.stopPrank();

        vm.startPrank(user);
        stock.approve(address(lendingAdapter), 1000 * ONE);
        lendingAdapter.deposit(1000 * ONE);
        vm.stopPrank();
    }

    // --- The core Phase 11 claim ---

    function test_transferAllowedWithZeroDebt() public {
        vm.prank(user);
        transferAdapter.transfer(recipient, 400 * ONE);

        assertEq(registry.getPosition(ASSET_ID, uint256(uint160(user))).rawBalance, 600 * ONE);
        assertEq(registry.getPosition(ASSET_ID, uint256(uint160(recipient))).rawBalance, 400 * ONE);
        // No tokens move -- collateral custody stays with LendingAdapter.
        assertEq(stock.balanceOf(user), 0);
        assertEq(stock.balanceOf(recipient), 0);
        assertEq(stock.balanceOf(address(lendingAdapter)), 1000 * ONE);
    }

    function test_transferBlockedWithAnyOutstandingDebt() public {
        vm.prank(user);
        lendingAdapter.borrow(1 * ONE); // even $1 of debt

        vm.prank(user);
        vm.expectRevert();
        transferAdapter.transfer(recipient, 1 * ONE); // any amount, not just a large one
    }

    function test_transferBlockedWhenNonActive() public {
        vm.prank(owner);
        registry.transitionLifecycle(ASSET_ID, LifecycleState.SUSPENDED);

        vm.prank(user);
        vm.expectRevert();
        transferAdapter.transfer(recipient, 100 * ONE);
    }

    function test_transferRevertsPastActualBalance() public {
        vm.prank(user);
        vm.expectRevert();
        transferAdapter.transfer(recipient, 1_000_000 * ONE);
    }

    function test_onlyAuthorizedReleaserCanTransferPosition() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        lendingAdapter.transferPosition(user, recipient, 1 * ONE);
    }

    // --- Non-regression: BORROW and WITHDRAW are untouched ---

    function test_borrowBehaviorCompletelyUnchanged() public {
        vm.prank(user);
        lendingAdapter.borrow(100_000 * ONE);
        assertEq(lendingAdapter.debt(user), 100_000 * ONE);
        assertEq(usd.balanceOf(user), 100_000 * ONE);
    }

    function test_withdrawBehaviorCompletelyUnchanged() public {
        vm.prank(user);
        vaultAdapter.withdraw(500 * ONE);

        assertEq(registry.getPosition(ASSET_ID, uint256(uint160(user))).rawBalance, 500 * ONE);
        assertEq(stock.balanceOf(user), 500 * ONE, "withdrawn tokens should return to user");
    }
}

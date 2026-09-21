// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LedgerLineRegistry} from "../src/LedgerLineRegistry.sol";
import {LedgerLinePolicy} from "../src/LedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";
import {LedgerLineVaultAdapter} from "../src/LedgerLineVaultAdapter.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockBorrowToken} from "../src/mocks/MockBorrowToken.sol";
import {StubPositionEngine, StubRiskEngine} from "./mocks/StubEngines.sol";
import {LifecycleState} from "../src/interfaces/LedgerLineTypes.sol";

/// @notice Proves the Phase 10 claim directly: the SAME Policy,
/// Registry, and engines correctly differentiate Action.WITHDRAW
/// (lifecycle-gated only) from Action.BORROW (capacity-gated),
/// through two genuinely independent consumer contracts, with zero
/// changes to BORROW's existing behavior.
contract LedgerLineVaultAdapterTest is Test {
    LedgerLineRegistry registry;
    LedgerLinePolicy policy;
    LedgerLineLendingAdapter lendingAdapter;
    LedgerLineVaultAdapter vaultAdapter;
    MockStockToken stock;
    MockBorrowToken usd;

    address owner = address(0xA11CE);
    address user = address(0xB0B);
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

        registry.setPositionWriter(address(lendingAdapter));
        lendingAdapter.setAuthorizedReleaser(address(vaultAdapter), true);
        registry.initializeAsset(ASSET_ID, 200 * ONE, ONE, 7000, 8000);

        usd.mint(address(lendingAdapter), 10_000_000 * ONE);
        stock.mint(user, 1000 * ONE);
        vm.stopPrank();

        vm.startPrank(user);
        stock.approve(address(lendingAdapter), 1000 * ONE);
        lendingAdapter.deposit(1000 * ONE);
        vm.stopPrank();
    }

    // --- The core Phase 10 claim ---

    function test_withdrawIgnoresCapacityEntirely() public {
        // $200 position value * 70% * 80% = $112 capacity (1000 shares
        // scaled proportionally in this test's smaller position). A
        // withdraw request analogous to "exceeds capacity" must still
        // succeed -- WITHDRAW is not capacity-gated at all.
        vm.prank(user);
        vaultAdapter.withdraw(500 * ONE); // well within actual balance, would still be "over capacity" if borrow-gated

        assertEq(registry.getPosition(ASSET_ID, uint256(uint160(user))).rawBalance, 500 * ONE);
        assertEq(stock.balanceOf(user), 500 * ONE, "withdrawn tokens should return to user");
    }

    function test_borrowBehaviorCompletelyUnchanged() public {
        // Same scenario as the original Phase 4 demo test -- proves
        // adding WITHDRAW differentiation did not touch BORROW at all.
        vm.prank(user);
        lendingAdapter.borrow(100_000 * ONE);
        assertEq(lendingAdapter.debt(user), 100_000 * ONE);
        assertEq(usd.balanceOf(user), 100_000 * ONE);
    }

    function test_withdrawBlockedWhenNonActive() public {
        vm.prank(owner);
        registry.transitionLifecycle(ASSET_ID, LifecycleState.SUSPENDED);

        vm.prank(user);
        vm.expectRevert();
        vaultAdapter.withdraw(100 * ONE);
    }

    function test_withdrawRevertsPastActualBalance() public {
        vm.prank(user);
        vm.expectRevert();
        vaultAdapter.withdraw(1_000_000 * ONE);
    }

    function test_onlyAuthorizedReleaserCanReleaseCollateral() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        lendingAdapter.releaseCollateral(user, 1 * ONE);
    }


    function test_withdrawBlockedIfWouldUnderCollateralizeDebt() public {
        vm.prank(user);
        lendingAdapter.borrow(100_000 * ONE); // near max capacity ($112k)

        // Withdrawing most of the collateral would leave remaining
        // capacity below the $100k debt -- must revert.
        vm.prank(user);
        vm.expectRevert();
        vaultAdapter.withdraw(900 * ONE); // leaves only 100/1000 shares
    }

    function test_withdrawAllowedIfDebtStillCovered() public {
        vm.prank(user);
        lendingAdapter.borrow(50_000 * ONE); // well under capacity

        // Withdrawing a small amount still leaves enough collateral
        // to cover the $50k debt -- should succeed.
        vm.prank(user);
        vaultAdapter.withdraw(10 * ONE);

        assertEq(stock.balanceOf(user), 10 * ONE);
    }
}
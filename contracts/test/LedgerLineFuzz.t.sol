// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LedgerLineRegistry} from "../src/LedgerLineRegistry.sol";
import {LedgerLinePolicy} from "../src/LedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockBorrowToken} from "../src/mocks/MockBorrowToken.sol";
import {LifecycleState, Decision, Action} from "../src/interfaces/LedgerLineTypes.sol";
import {StubPositionEngine, StubRiskEngine} from "./mocks/StubEngines.sol";

/// @notice Fuzz/property tests against the spec's invariants (Section 13).
/// Single-call fuzzing (forge's default), not stateful invariant testing --
/// see Phase 6 scope note: most invariants here are single-call
/// properties, and Phase 4 has no sequence-dependent operations
/// (withdraw/transfer/liquidate) yet to make stateful testing pay off.
contract LedgerLineFuzzTest is Test {
    LedgerLineRegistry registry;
    LedgerLinePolicy policy;
    LedgerLineLendingAdapter adapter;
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
        adapter = new LedgerLineLendingAdapter(
            owner, address(registry), address(policy), address(stock), address(usd), ASSET_ID
        );
        registry.setPositionWriter(address(adapter));
        registry.initializeAsset(ASSET_ID, 200 * ONE, ONE, 7000, 8000);
        usd.mint(address(adapter), 10_000_000 * ONE);
        stock.mint(user, 10_000 * ONE);
        vm.stopPrank();

        vm.startPrank(user);
        stock.approve(address(adapter), type(uint256).max);
        adapter.deposit(1000 * ONE);
        vm.stopPrank();
    }

    /// @dev Walks a valid path from ACTIVE to the target state so every
    /// reachable non-ACTIVE state can be tested, not just directly-adjacent ones.
    function _forceLifecycle(LifecycleState target) internal {
        vm.startPrank(owner);
        if (target == LifecycleState.RESTRICTED) {
            registry.transitionLifecycle(ASSET_ID, LifecycleState.RESTRICTED);
        } else if (target == LifecycleState.CORPORATE_ACTION) {
            registry.transitionLifecycle(ASSET_ID, LifecycleState.CORPORATE_ACTION);
        } else if (target == LifecycleState.SUSPENDED) {
            registry.transitionLifecycle(ASSET_ID, LifecycleState.SUSPENDED);
        } else if (target == LifecycleState.MATURING) {
            registry.transitionLifecycle(ASSET_ID, LifecycleState.MATURING);
        } else if (target == LifecycleState.REDEEMABLE) {
            registry.transitionLifecycle(ASSET_ID, LifecycleState.MATURING);
            registry.transitionLifecycle(ASSET_ID, LifecycleState.REDEEMABLE);
        } else if (target == LifecycleState.REDEEMED) {
            registry.transitionLifecycle(ASSET_ID, LifecycleState.MATURING);
            registry.transitionLifecycle(ASSET_ID, LifecycleState.REDEEMABLE);
            registry.transitionLifecycle(ASSET_ID, LifecycleState.REDEEMED);
        }
        vm.stopPrank();
    }

    // Invariant 3: invalid lifecycle transitions must fail. Enumerates
    // all 49 (from,to) pairs against the locked, approved edge set.
    function testFuzz_lifecycleTransitionTableMatchesApprovedGraph(uint8 fromRaw, uint8 toRaw) public view {
        LifecycleState from = LifecycleState(bound(fromRaw, 0, 6));
        LifecycleState to = LifecycleState(bound(toRaw, 0, 6));

        bool expected = _expectedValid(from, to);
        bool actual = registry.isValidTransition(from, to);
        assertEq(actual, expected, "transition table mismatch");
    }

    function _expectedValid(LifecycleState from, LifecycleState to) internal pure returns (bool) {
        if (from == LifecycleState.ACTIVE) {
            return to == LifecycleState.RESTRICTED || to == LifecycleState.CORPORATE_ACTION
                || to == LifecycleState.SUSPENDED || to == LifecycleState.MATURING;
        }
        if (from == LifecycleState.RESTRICTED) {
            return to == LifecycleState.ACTIVE || to == LifecycleState.SUSPENDED;
        }
        if (from == LifecycleState.CORPORATE_ACTION) {
            return to == LifecycleState.ACTIVE || to == LifecycleState.RESTRICTED;
        }
        if (from == LifecycleState.SUSPENDED) {
            return to == LifecycleState.ACTIVE || to == LifecycleState.RESTRICTED;
        }
        if (from == LifecycleState.MATURING) {
            return to == LifecycleState.REDEEMABLE;
        }
        if (from == LifecycleState.REDEEMABLE) {
            return to == LifecycleState.REDEEMED;
        }
        return false;
    }

    // Invariant 9: restricted assets must not bypass policy checks --
    // non-ACTIVE always blocks, regardless of amount.
    function testFuzz_nonActiveAlwaysBlocks(uint8 stateRaw, uint256 amount) public {
        LifecycleState target = LifecycleState(bound(stateRaw, 1, 6)); // exclude ACTIVE (0)
        _forceLifecycle(target);

        vm.prank(user);
        vm.expectRevert();
        adapter.borrow(amount);
    }

    // Invariant 5: zero/invalid prices must not generate borrowing capacity.
    function testFuzz_zeroPriceNeverAllowsCapacity(uint256 amount) public {
        vm.prank(owner);
        registry.updateAssetParameters(ASSET_ID, 0, ONE, 7000, 8000);

        vm.prank(user);
        vm.expectRevert();
        adapter.borrow(bound(amount, 1, type(uint128).max));
    }

    // Invariant 1: borrowing must never exceed permitted borrowing capacity.
    function testFuzz_successfulBorrowNeverExceedsCapacity(uint256 collateralBps, uint256 riskBps, uint256 amount) public {
        collateralBps = bound(collateralBps, 1, 10_000);
        riskBps = bound(riskBps, 1, 10_000);
        amount = bound(amount, 1, 10_000_000 * ONE);

        vm.prank(owner);
        registry.updateAssetParameters(ASSET_ID, 200 * ONE, ONE, collateralBps, riskBps);

        uint256 capacity = (((1000 * ONE) * (200 * ONE) / ONE) * ONE / ONE) * collateralBps / 10_000 * riskBps / 10_000;

        vm.prank(user);
        if (amount > capacity) {
            vm.expectRevert();
            adapter.borrow(amount);
        } else {
            adapter.borrow(amount);
            assertLe(adapter.debt(user), capacity, "debt exceeded capacity");
        }
    }

    // Registry hardening (Phase 6 finding): bps > 10000 must be rejected.
    function testFuzz_registryRejectsOutOfRangeBps(uint256 badBps) public {
        badBps = bound(badBps, 10_001, type(uint256).max);
        vm.prank(owner);
        vm.expectRevert();
        registry.updateAssetParameters(ASSET_ID, 200 * ONE, ONE, badBps, 8000);
    }
}

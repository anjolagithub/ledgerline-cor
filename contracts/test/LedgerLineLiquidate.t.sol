// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LedgerLineRegistry} from "../src/LedgerLineRegistry.sol";
import {LedgerLinePolicy} from "../src/LedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockBorrowToken} from "../src/mocks/MockBorrowToken.sol";
import {StubPositionEngine, StubRiskEngine} from "./mocks/StubEngines.sol";
import {
    Action,
    Decision,
    LifecycleState,
    PolicyResponse,
    REASON_OK,
    REASON_EXCEEDS_CAPACITY,
    REASON_SUSPENDED,
    REASON_ABOVE_MAINTENANCE
} from "../src/interfaces/LedgerLineTypes.sol";

/// @notice Covers the Action.LIQUIDATE branch of LedgerLinePolicy.canExecute().
/// For LIQUIDATE only, `amount` is the position's outstanding debt (Policy
/// stays debt-agnostic). Maintenance threshold = value x collateral factor.
/// Setup: 1000 shares x $200 = $200,000 value; 70% CF => $140,000 threshold;
/// 70% x 80% => $112,000 borrowing capacity. No liquidation consumer exists
/// yet, so these tests call Policy directly.
contract LedgerLineLiquidateTest is Test {
    LedgerLineRegistry registry;
    LedgerLinePolicy policy;
    LedgerLineLendingAdapter lendingAdapter;
    MockStockToken stock;
    MockBorrowToken usd;

    address owner = address(0xA11CE);
    address user = address(0xB0B);
    uint256 constant ASSET_ID = 1;
    uint256 constant ONE = 1e18;
    uint256 positionId;

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
        registry.setPositionWriter(address(lendingAdapter));
        registry.initializeAsset(ASSET_ID, 200 * ONE, ONE, 7000, 8000);

        usd.mint(address(lendingAdapter), 10_000_000 * ONE);
        stock.mint(user, 1000 * ONE);
        vm.stopPrank();

        vm.startPrank(user);
        stock.approve(address(lendingAdapter), 1000 * ONE);
        lendingAdapter.deposit(1000 * ONE);
        vm.stopPrank();

        positionId = uint256(uint160(user));
    }

    function _liquidate(uint256 debt) internal view returns (PolicyResponse memory) {
        return policy.canExecute(ASSET_ID, positionId, Action.LIQUIDATE, debt);
    }

    function _assertResponse(PolicyResponse memory r, Decision d, uint256 permitted, bytes32 reason) internal pure {
        assertEq(uint8(r.decision), uint8(d), "decision");
        assertEq(r.permittedAmount, permitted, "permittedAmount");
        assertEq(r.reason, reason, "reason");
    }

    // --- LIQUIDATE ---

    function test_healthyPositionAboveMaintenanceIsBlocked() public view {
        _assertResponse(_liquidate(100_000 * ONE), Decision.BLOCK, 0, REASON_ABOVE_MAINTENANCE);
    }

    function test_positionBelowMaintenanceIsAllowed() public view {
        _assertResponse(_liquidate(150_000 * ONE), Decision.ALLOW, 150_000 * ONE, REASON_OK);
    }

    function test_debtExactlyAtThresholdIsBlocked() public view {
        _assertResponse(_liquidate(140_000 * ONE), Decision.BLOCK, 0, REASON_ABOVE_MAINTENANCE);
    }

    function test_debtOneWeiAboveThresholdIsAllowed() public view {
        _assertResponse(_liquidate(140_000 * ONE + 1), Decision.ALLOW, 140_000 * ONE + 1, REASON_OK);
    }

    function test_zeroDebtIsBlocked() public view {
        _assertResponse(_liquidate(0), Decision.BLOCK, 0, REASON_ABOVE_MAINTENANCE);
    }

    function test_nonActiveLifecycleBlocksLiquidation() public {
        vm.prank(owner);
        registry.transitionLifecycle(ASSET_ID, LifecycleState.SUSPENDED);
        // Even a deeply under-collateralized position: lifecycle gate wins.
        _assertResponse(_liquidate(190_000 * ONE), Decision.BLOCK, 0, REASON_SUSPENDED);
    }

    /// End to end: a real borrow at full capacity is healthy (maintenance
    /// > capacity is the buffer), then a price drop makes it liquidatable.
    function test_fullCapacityBorrowBecomesLiquidatableAfterPriceDrop() public {
        vm.prank(user);
        lendingAdapter.borrow(112_000 * ONE);
        uint256 debt = lendingAdapter.debt(user);

        _assertResponse(_liquidate(debt), Decision.BLOCK, 0, REASON_ABOVE_MAINTENANCE);

        // $200 -> $150: value $150,000, threshold $105,000 < $112,000 debt
        vm.prank(owner);
        registry.updateAssetParameters(ASSET_ID, 150 * ONE, ONE, 7000, 8000);

        _assertResponse(_liquidate(debt), Decision.ALLOW, debt, REASON_OK);
    }

    function testFuzz_liquidateMatchesMaintenanceRule(uint256 debt) public view {
        debt = bound(debt, 0, 1_000_000 * ONE);
        PolicyResponse memory r = _liquidate(debt);
        if (debt > 140_000 * ONE) {
            _assertResponse(r, Decision.ALLOW, debt, REASON_OK);
        } else {
            _assertResponse(r, Decision.BLOCK, 0, REASON_ABOVE_MAINTENANCE);
        }
    }

    // --- Non-regression: BORROW / WITHDRAW / TRANSFER decisions unchanged ---
    // Expected values are exactly what canExecute returned before the
    // LIQUIDATE branch existed (same rules as docs/POLICY.md).

    function test_borrowDecisionsUnchanged() public view {
        _assertResponse(
            policy.canExecute(ASSET_ID, positionId, Action.BORROW, 100_000 * ONE), Decision.ALLOW, 112_000 * ONE, REASON_OK
        );
        _assertResponse(
            policy.canExecute(ASSET_ID, positionId, Action.BORROW, 120_000 * ONE),
            Decision.LIMIT,
            112_000 * ONE,
            REASON_EXCEEDS_CAPACITY
        );
    }

    function test_withdrawDecisionUnchanged() public view {
        _assertResponse(
            policy.canExecute(ASSET_ID, positionId, Action.WITHDRAW, 500 * ONE), Decision.ALLOW, 1000 * ONE, REASON_OK
        );
    }

    function test_transferDecisionUnchanged() public view {
        _assertResponse(
            policy.canExecute(ASSET_ID, positionId, Action.TRANSFER, 500 * ONE), Decision.ALLOW, 1000 * ONE, REASON_OK
        );
    }

    function test_nonActiveStillBlocksBorrowWithdrawTransfer() public {
        vm.prank(owner);
        registry.transitionLifecycle(ASSET_ID, LifecycleState.SUSPENDED);
        _assertResponse(policy.canExecute(ASSET_ID, positionId, Action.BORROW, 1), Decision.BLOCK, 0, REASON_SUSPENDED);
        _assertResponse(policy.canExecute(ASSET_ID, positionId, Action.WITHDRAW, 1), Decision.BLOCK, 0, REASON_SUSPENDED);
        _assertResponse(policy.canExecute(ASSET_ID, positionId, Action.TRANSFER, 1), Decision.BLOCK, 0, REASON_SUSPENDED);
    }

    function testFuzz_borrowStillFollowsCapacityRule(uint256 amount) public view {
        amount = bound(amount, 0, 1_000_000 * ONE);
        PolicyResponse memory r = policy.canExecute(ASSET_ID, positionId, Action.BORROW, amount);
        if (amount <= 112_000 * ONE) {
            _assertResponse(r, Decision.ALLOW, 112_000 * ONE, REASON_OK);
        } else {
            _assertResponse(r, Decision.LIMIT, 112_000 * ONE, REASON_EXCEEDS_CAPACITY);
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LedgerLineRegistry} from "../src/LedgerLineRegistry.sol";
import {LedgerLinePolicy} from "../src/LedgerLinePolicy.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockBorrowToken} from "../src/mocks/MockBorrowToken.sol";
import {LifecycleState} from "../src/interfaces/LedgerLineTypes.sol";

/// @notice End-to-end demo flow test. Position/Risk engines are Stylus
/// (WASM) contracts -- they cannot run inside Foundry's EVM test
/// environment directly, so this test deploys tiny Solidity stand-ins
/// implementing the exact same interfaces (IPositionEngine/IRiskEngine)
/// with the exact same formulas as the real Stylus engines, purely so
/// the rest of the stack (Registry -> Policy -> LendingAdapter) can be
/// exercised end-to-end in a fast local test. This does NOT replace
/// testing the real Stylus engines (already done in Phase 2's Rust unit
/// tests) -- it tests everything built on top of them.
contract LedgerLineDemoTest is Test {
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

        // Spec worked example: 1,000 shares @ $200, 70% collateral, 80% risk adjustment
        // -> $200,000 position value -> $112,000 capacity
        registry.initializeAsset(ASSET_ID, 200 * ONE, ONE, 7000, 8000);

        usd.mint(address(adapter), 1_000_000 * ONE); // adapter liquidity

        stock.mint(user, 1000 * ONE);

        vm.stopPrank();
    }

    function test_fullDemoFlow() public {
        vm.startPrank(user);
        stock.approve(address(adapter), 1000 * ONE);
        adapter.deposit(1000 * ONE);
        vm.stopPrank();

        // ALLOW: $100k <= $112k capacity
        vm.prank(user);
        adapter.borrow(100_000 * ONE);
        assertEq(adapter.debt(user), 100_000 * ONE);
        assertEq(usd.balanceOf(user), 100_000 * ONE);

        // Risk parameters change (still ACTIVE) -> capacity falls to $56,000
        // (200,000 * 70% * 40%)
        vm.prank(owner);
        registry.updateAssetParameters(ASSET_ID, 200 * ONE, ONE, 7000, 4000);

        // LIMIT: existing debt (100k) + 50k = 150k > new capacity (56k) -> reject
        vm.prank(user);
        vm.expectRevert();
        adapter.borrow(50_000 * ONE);

        // Lifecycle change -> BLOCK regardless of amount
        vm.prank(owner);
        registry.transitionLifecycle(ASSET_ID, LifecycleState.CORPORATE_ACTION);

        vm.prank(user);
        vm.expectRevert();
        adapter.borrow(1); // even a trivial amount is blocked

        // Restore lifecycle and risk parameters -> ALLOW again
        vm.startPrank(owner);
        registry.transitionLifecycle(ASSET_ID, LifecycleState.ACTIVE);
        registry.updateAssetParameters(ASSET_ID, 200 * ONE, ONE, 7000, 8000);
        vm.stopPrank();

        // Now capacity is back to $112k; existing debt 100k + 12k = 112k -> ALLOW at the boundary
        vm.prank(user);
        adapter.borrow(12_000 * ONE);
        assertEq(adapter.debt(user), 112_000 * ONE);
    }
}

// --- Solidity stand-ins for the Stylus engines, matching their exact
// --- formulas, for fast local EVM testing only. See Phase 2 for the
// --- real, tested Rust/WASM implementations.
import {IPositionEngine} from "../src/interfaces/IPositionEngine.sol";
import {IRiskEngine} from "../src/interfaces/IRiskEngine.sol";

contract StubPositionEngine is IPositionEngine {
    function computePositionValue(uint256 rawBalance, uint256 price, uint256 multiplier)
        external
        pure
        returns (uint256)
    {
        return (rawBalance * price / 1e18) * multiplier / 1e18;
    }
}

contract StubRiskEngine is IRiskEngine {
    function computeBorrowingCapacity(uint256 positionValue, uint256 collateralFactorBps, uint256 riskAdjustmentBps)
        external
        pure
        returns (uint256)
    {
        return (positionValue * collateralFactorBps / 10000) * riskAdjustmentBps / 10000;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Action, Decision, PolicyResponse, Position} from "./interfaces/LedgerLineTypes.sol";
import {ILedgerLineRegistry} from "./interfaces/ILedgerLineRegistry.sol";
import {ILedgerLinePolicy} from "./interfaces/ILedgerLinePolicy.sol";

/// @notice Reference lending protocol demonstrating real consumption of
/// LedgerLine. Combines what the spec lists as two contracts (lending
/// adapter + reference market) into one, per Phase 4 sign-off -- the
/// conceptual boundary is kept obvious via clearly separated sections
/// below, not enforced by a contract split.
///
/// Custody is real: deposit() pulls collateralToken via transferFrom,
/// borrow() pushes borrowToken via transfer. Debt accounting lives here,
/// not in Policy or Registry, per the locked architecture -- Policy's
/// permittedAmount is a capacity ceiling, not debt-aware, so this
/// contract is responsible for checking (existingDebt + requested) against
/// that ceiling, not just the raw requested amount.
///
/// LIMIT semantics (locked): reject-and-resubmit. A LIMIT-range request
/// reverts; it is never silently capped.
///
/// Scope (locked, Phase 4): deposit and borrow only. withdraw, transfer,
/// increase_leverage, and liquidate are not implemented -- not exercised
/// by the demo flow, so not built speculatively.
contract LedgerLineLendingAdapter is Ownable {
    using SafeERC20 for IERC20;

    ILedgerLineRegistry public immutable registry;
    ILedgerLinePolicy public immutable policy;
    IERC20 public immutable collateralToken;
    IERC20 public immutable borrowToken;
    uint256 public immutable assetId;

    mapping(address => uint256) public debt;

    event Deposited(address indexed user, uint256 amount, uint256 newRawBalance);
    event Borrowed(address indexed user, uint256 amount, uint256 newDebt);

    error AssetNotInitialized();
    error NoPosition();
    error PolicyBlocked(bytes32 reason);
    error ExceedsPermittedAmount(uint256 wouldOweTotal, uint256 permittedAmount);

    constructor(
        address initialOwner,
        address registryAddress,
        address policyAddress,
        address collateralTokenAddress,
        address borrowTokenAddress,
        uint256 assetId_
    ) Ownable(initialOwner) {
        registry = ILedgerLineRegistry(registryAddress);
        policy = ILedgerLinePolicy(policyAddress);
        collateralToken = IERC20(collateralTokenAddress);
        borrowToken = IERC20(borrowTokenAddress);
        assetId = assetId_;
    }

    function _positionId(address user) internal pure returns (uint256) {
        return uint256(uint160(user));
    }

    // ---------------------------------------------------------------
    // Collateral custody
    // ---------------------------------------------------------------
    function deposit(uint256 amount) external {
        if (!registry.isAssetInitialized(assetId)) revert AssetNotInitialized();

        collateralToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 positionId = _positionId(msg.sender);
        uint256 currentRawBalance = registry.getPosition(assetId, positionId).rawBalance;
        uint256 newRawBalance = currentRawBalance + amount;
        registry.setPosition(assetId, positionId, newRawBalance);

        emit Deposited(msg.sender, amount, newRawBalance);
    }

    // ---------------------------------------------------------------
    // Policy enforcement + debt accounting + MockUSD issuance
    // ---------------------------------------------------------------
    function borrow(uint256 amount) external {
        // 1. Validate asset exists
        if (!registry.isAssetInitialized(assetId)) revert AssetNotInitialized();

        // 2. Validate deposit/position
        uint256 positionId = _positionId(msg.sender);
        Position memory position = registry.getPosition(assetId, positionId);
        if (position.rawBalance == 0) revert NoPosition();

        // 3. Calculate policy decision
        PolicyResponse memory response = policy.canExecute(assetId, positionId, Action.BORROW, amount);

        // 4. Reject BLOCK
        if (response.decision == Decision.BLOCK) {
            revert PolicyBlocked(response.reason);
        }

        // 5 & 6. Reject if requested (combined with existing debt) exceeds
        // permitted capacity. Policy's permittedAmount is a ceiling on
        // total exposure, not debt-aware -- this contract must combine
        // the two itself. This also naturally re-derives LIMIT-style
        // rejection even in cases where Policy returned ALLOW for the
        // raw amount but existing debt would push the total over.
        uint256 wouldOweTotal = debt[msg.sender] + amount;
        if (wouldOweTotal > response.permittedAmount) {
            revert ExceedsPermittedAmount(wouldOweTotal, response.permittedAmount);
        }

        // 7. Update debt (only after all validation succeeds -- atomic
        // revert above guarantees no partial state on failure)
        debt[msg.sender] = wouldOweTotal;

        // 8. Transfer MockUSD
        borrowToken.safeTransfer(msg.sender, amount);

        emit Borrowed(msg.sender, amount, wouldOweTotal);
    }
}

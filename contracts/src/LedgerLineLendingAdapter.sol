// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Action, Decision, PolicyResponse, Position} from "./interfaces/LedgerLineTypes.sol";
import {ILedgerLineRegistry} from "./interfaces/ILedgerLineRegistry.sol";
import {ILedgerLinePolicy} from "./interfaces/ILedgerLinePolicy.sol";

/// @notice Reference lending protocol demonstrating real consumption of
/// LedgerLine. Combines what the spec lists as two contracts (lending
/// adapter + reference market) into one, per Phase 4 sign-off.
///
/// Custody is real: deposit() pulls collateralToken via transferFrom,
/// borrow() pushes borrowToken via transfer. Debt accounting lives here,
/// not in Policy or Registry, per the locked architecture.
///
/// DECIMAL HANDLING (added when integrating real USDG, decimals()=6,
/// verified live on Robinhood Chain testnet -- MockBorrowToken uses 18):
/// all internal accounting (debt, and every amount compared against
/// Policy's permittedAmount) stays 18-decimal fixed-point, matching
/// PositionEngine/RiskEngine's convention throughout. borrowTokenDecimals
/// is read once at construction via IERC20Metadata and used ONLY to scale
/// the literal token amount at the final safeTransfer call -- nothing
/// else in this contract, and nothing in Policy/Registry/the engines,
/// is decimals-aware. This lets the same adapter code work correctly
/// against both the 18-decimal MockBorrowToken (local dev) and real,
/// 6-decimal USDG (testnet/mainnet) with zero branching.
///
/// LIMIT semantics (locked): reject-and-resubmit. A LIMIT-range request
/// reverts; it is never silently capped.
///
/// Scope (locked, Phase 4): deposit and borrow only.
contract LedgerLineLendingAdapter is Ownable {
    using SafeERC20 for IERC20;

    ILedgerLineRegistry public immutable registry;
    ILedgerLinePolicy public immutable policy;
    IERC20 public immutable collateralToken;
    IERC20 public immutable borrowToken;
    uint256 public immutable assetId;
    uint8 public immutable borrowTokenDecimals;

    mapping(address => uint256) public debt;
    mapping(address => bool) public isAuthorizedReleaser;

    event Deposited(address indexed user, uint256 amount, uint256 newRawBalance);
    event Borrowed(address indexed user, uint256 amount, uint256 newDebt);
    event Released(address indexed user, uint256 amount, uint256 newRawBalance, address indexed releaser);
    event ReleaserUpdated(address indexed releaser, bool authorized);

    error AssetNotInitialized();
    error NoPosition();
    error PolicyBlocked(bytes32 reason);
    error ExceedsPermittedAmount(uint256 wouldOweTotal, uint256 permittedAmount);
    error NotAuthorizedReleaser(address caller);
    error InsufficientPosition(uint256 requested, uint256 available);

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
        borrowTokenDecimals = IERC20Metadata(borrowTokenAddress).decimals();
    }

    function _positionId(address user) internal pure returns (uint256) {
        return uint256(uint160(user));
    }

    /// @notice Owner-controlled allowlist of contracts permitted to
    /// trigger a custody release via releaseCollateral. Intended for
    /// other LedgerLine consumers (e.g. VaultAdapter) that make their
    /// own independent Policy.canExecute() decision and, only after
    /// ALLOW, need this adapter's already-custodied tokens released --
    /// centralizing custody here rather than duplicating token
    /// transfers across every consumer contract.
    function setAuthorizedReleaser(address releaser, bool authorized) external onlyOwner {
        isAuthorizedReleaser[releaser] = authorized;
        emit ReleaserUpdated(releaser, authorized);
    }

    /// @notice Releases previously-deposited collateral back to `user`
    /// and updates the shared Registry position accordingly. Callable
    /// ONLY by an authorized releaser (e.g. VaultAdapter) -- this
    /// adapter does not itself evaluate policy here; the caller is
    /// expected to have already called Policy.canExecute() with
    /// Action.WITHDRAW and confirmed ALLOW before calling this.
    function releaseCollateral(address user, uint256 amount) external {
        if (!isAuthorizedReleaser[msg.sender]) revert NotAuthorizedReleaser(msg.sender);

        uint256 positionId = _positionId(user);
        uint256 currentRawBalance = registry.getPosition(assetId, positionId).rawBalance;
        if (amount > currentRawBalance) revert InsufficientPosition(amount, currentRawBalance);

        uint256 newRawBalance = currentRawBalance - amount;
        registry.setPosition(assetId, positionId, newRawBalance);

        collateralToken.safeTransfer(user, amount);

        emit Released(user, amount, newRawBalance, msg.sender);
    }

    /// @dev Converts an 18-decimal internal amount to the borrow token's
    /// actual on-chain decimals, for the literal transfer only. Internal
    /// accounting (debt, permittedAmount comparisons) never uses this --
    /// only the final safeTransfer call does.
    function _toTokenAmount(uint256 internalAmount18) internal view returns (uint256) {
        if (borrowTokenDecimals == 18) return internalAmount18;
        if (borrowTokenDecimals < 18) {
            return internalAmount18 / (10 ** (18 - borrowTokenDecimals));
        }
        return internalAmount18 * (10 ** (borrowTokenDecimals - 18));
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
    // Policy enforcement + debt accounting + borrow token issuance
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
        // permitted capacity. All figures here (amount, debt,
        // permittedAmount) are 18-decimal internal units -- consistent,
        // no scaling needed for this comparison.
        uint256 wouldOweTotal = debt[msg.sender] + amount;
        if (wouldOweTotal > response.permittedAmount) {
            revert ExceedsPermittedAmount(wouldOweTotal, response.permittedAmount);
        }

        // 7. Update debt (18-decimal internal units, before the external
        // call -- atomic revert guarantees no partial state on failure)
        debt[msg.sender] = wouldOweTotal;

        // 8. Transfer the borrow token -- scaled to its real decimals
        // here, and only here.
        borrowToken.safeTransfer(msg.sender, _toTokenAmount(amount));

        emit Borrowed(msg.sender, amount, wouldOweTotal);
    }
}

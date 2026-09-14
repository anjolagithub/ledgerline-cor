// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {AssetState, Position, LifecycleState} from "./interfaces/LedgerLineTypes.sol";
import {ILedgerLineRegistry} from "./interfaces/ILedgerLineRegistry.sol";

/// @notice Canonical state store for LedgerLine. Holds AssetState (per
/// assetId) and Position (per assetId + positionId). All writes are
/// currently admin-gated (Ownable) -- a deliberate, disclosed MVP trust
/// assumption. This is expected to be replaced by verified external
/// state/oracle infrastructure later; it is not presented as final.
///
/// positionId is an opaque identifier chosen by whichever consuming
/// protocol calls this Registry (e.g. derived from a user address) --
/// Registry itself has no concept of "users" or debt, keeping it
/// consumer-agnostic per the locked architecture.
///
/// NOTE: setPosition is onlyOwner for Phase 3. Phase 4's lending adapter
/// will need write access to record deposits -- that access-control
/// expansion is explicitly deferred to Phase 4, not solved here.
contract LedgerLineRegistry is ILedgerLineRegistry, Ownable {
    mapping(uint256 => AssetState) private assetStates;
    mapping(uint256 => bool) private assetInitialized;
    mapping(uint256 => mapping(uint256 => Position)) private positions;

    event AssetInitialized(uint256 indexed assetId, uint256 price, uint256 multiplier);
    event AssetParametersUpdated(uint256 indexed assetId, uint256 price, uint256 multiplier, uint256 collateralFactorBps, uint256 riskAdjustmentBps);
    event LifecycleTransitioned(uint256 indexed assetId, LifecycleState from, LifecycleState to);
    event PositionUpdated(uint256 indexed assetId, uint256 indexed positionId, uint256 rawBalance);

    error AssetAlreadyInitialized(uint256 assetId);
    error AssetNotInitialized(uint256 assetId);
    error InvalidLifecycleTransition(LifecycleState from, LifecycleState to);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function initializeAsset(
        uint256 assetId,
        uint256 price,
        uint256 multiplier,
        uint256 collateralFactorBps,
        uint256 riskAdjustmentBps
    ) external onlyOwner {
        if (assetInitialized[assetId]) revert AssetAlreadyInitialized(assetId);

        assetStates[assetId] = AssetState({
            price: price,
            multiplier: multiplier,
            lifecycle: LifecycleState.ACTIVE,
            collateralFactorBps: collateralFactorBps,
            riskAdjustmentBps: riskAdjustmentBps
        });
        assetInitialized[assetId] = true;

        emit AssetInitialized(assetId, price, multiplier);
    }

    function updateAssetParameters(
        uint256 assetId,
        uint256 price,
        uint256 multiplier,
        uint256 collateralFactorBps,
        uint256 riskAdjustmentBps
    ) external onlyOwner {
        if (!assetInitialized[assetId]) revert AssetNotInitialized(assetId);

        AssetState storage state = assetStates[assetId];
        state.price = price;
        state.multiplier = multiplier;
        state.collateralFactorBps = collateralFactorBps;
        state.riskAdjustmentBps = riskAdjustmentBps;

        emit AssetParametersUpdated(assetId, price, multiplier, collateralFactorBps, riskAdjustmentBps);
    }

    function transitionLifecycle(uint256 assetId, LifecycleState newState) external onlyOwner {
        if (!assetInitialized[assetId]) revert AssetNotInitialized(assetId);

        LifecycleState current = assetStates[assetId].lifecycle;
        if (!_isValidTransition(current, newState)) {
            revert InvalidLifecycleTransition(current, newState);
        }

        assetStates[assetId].lifecycle = newState;
        emit LifecycleTransitioned(assetId, current, newState);
    }

    function setPosition(uint256 assetId, uint256 positionId, uint256 rawBalance) external onlyOwner {
        positions[assetId][positionId].rawBalance = rawBalance;
        emit PositionUpdated(assetId, positionId, rawBalance);
    }

    function getAssetState(uint256 assetId) external view returns (AssetState memory) {
        return assetStates[assetId];
    }

    function getPosition(uint256 assetId, uint256 positionId) external view returns (Position memory) {
        return positions[assetId][positionId];
    }

    /// @dev Locked transition graph (approved, MATURING -> ACTIVE removed):
    /// ACTIVE           -> RESTRICTED, CORPORATE_ACTION, SUSPENDED, MATURING
    /// RESTRICTED       -> ACTIVE, SUSPENDED
    /// CORPORATE_ACTION -> ACTIVE, RESTRICTED
    /// SUSPENDED        -> ACTIVE, RESTRICTED
    /// MATURING         -> REDEEMABLE
    /// REDEEMABLE       -> REDEEMED
    /// REDEEMED         -> (terminal)
    function _isValidTransition(LifecycleState from, LifecycleState to) internal pure returns (bool) {
        if (from == LifecycleState.ACTIVE) {
            return to == LifecycleState.RESTRICTED
                || to == LifecycleState.CORPORATE_ACTION
                || to == LifecycleState.SUSPENDED
                || to == LifecycleState.MATURING;
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
        return false; // REDEEMED is terminal
    }
}

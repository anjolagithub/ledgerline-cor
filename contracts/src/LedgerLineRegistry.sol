// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {AssetState, Position, LifecycleState} from "./interfaces/LedgerLineTypes.sol";
import {ILedgerLineRegistry} from "./interfaces/ILedgerLineRegistry.sol";

/// @notice Canonical state store for LedgerLine. Holds AssetState (per
/// assetId) and Position (per assetId + positionId). Asset-state writes
/// are owner-gated; position writes are gated to a single configured
/// `positionWriter` (intended to be LedgerLineLendingAdapter), settable
/// only by the owner. This is a deliberate, disclosed MVP trust
/// assumption, expected to be replaced by verified external state/oracle
/// infrastructure and more granular authorization later.
///
/// positionId is an opaque identifier chosen by the consuming protocol
/// (e.g. derived from a user address) -- Registry has no concept of
/// "users" or debt, keeping it consumer-agnostic.
contract LedgerLineRegistry is ILedgerLineRegistry, Ownable {
    mapping(uint256 => AssetState) private assetStates;
    mapping(uint256 => bool) private assetInitialized;
    mapping(uint256 => mapping(uint256 => Position)) private positions;

    address public positionWriter;

    event AssetInitialized(uint256 indexed assetId, uint256 price, uint256 multiplier);
    event AssetParametersUpdated(uint256 indexed assetId, uint256 price, uint256 multiplier, uint256 collateralFactorBps, uint256 riskAdjustmentBps);
    event LifecycleTransitioned(uint256 indexed assetId, LifecycleState from, LifecycleState to);
    event PositionUpdated(uint256 indexed assetId, uint256 indexed positionId, uint256 rawBalance);
    event PositionWriterUpdated(address indexed previousWriter, address indexed newWriter);

    error AssetAlreadyInitialized(uint256 assetId);
    error AssetNotInitialized(uint256 assetId);
    error InvalidLifecycleTransition(LifecycleState from, LifecycleState to);
    error InvalidBps(uint256 bps);
    error NotPositionWriter(address caller);

    modifier onlyPositionWriter() {
        if (msg.sender != positionWriter) revert NotPositionWriter(msg.sender);
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setPositionWriter(address newWriter) external onlyOwner {
        address previous = positionWriter;
        positionWriter = newWriter;
        emit PositionWriterUpdated(previous, newWriter);
    }

    function initializeAsset(
        uint256 assetId,
        uint256 price,
        uint256 multiplier,
        uint256 collateralFactorBps,
        uint256 riskAdjustmentBps
    ) external onlyOwner {
        if (assetInitialized[assetId]) revert AssetAlreadyInitialized(assetId);
        if (collateralFactorBps > 10_000) revert InvalidBps(collateralFactorBps);
        if (riskAdjustmentBps > 10_000) revert InvalidBps(riskAdjustmentBps);

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
        if (collateralFactorBps > 10_000) revert InvalidBps(collateralFactorBps);
        if (riskAdjustmentBps > 10_000) revert InvalidBps(riskAdjustmentBps);

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

    function setPosition(uint256 assetId, uint256 positionId, uint256 rawBalance) external onlyPositionWriter {
        positions[assetId][positionId].rawBalance = rawBalance;
        emit PositionUpdated(assetId, positionId, rawBalance);
    }

    function getAssetState(uint256 assetId) external view returns (AssetState memory) {
        return assetStates[assetId];
    }

    function getPosition(uint256 assetId, uint256 positionId) external view returns (Position memory) {
        return positions[assetId][positionId];
    }

    function isAssetInitialized(uint256 assetId) external view returns (bool) {
        return assetInitialized[assetId];
    }

    /// @dev Locked transition graph:
    /// ACTIVE -> RESTRICTED, CORPORATE_ACTION, SUSPENDED, MATURING
    /// RESTRICTED -> ACTIVE, SUSPENDED
    /// CORPORATE_ACTION -> ACTIVE, RESTRICTED
    /// SUSPENDED -> ACTIVE, RESTRICTED
    /// MATURING -> REDEEMABLE
    /// REDEEMABLE -> REDEEMED
    /// REDEEMED -> (terminal)
    /// @notice Public view of the transition table, for external verification/testing.
    function isValidTransition(LifecycleState from, LifecycleState to) external pure returns (bool) {
        return _isValidTransition(from, to);
    }

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
        return false;
    }
}

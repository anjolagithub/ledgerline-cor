// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {
    Action,
    Decision,
    LifecycleState,
    PolicyResponse,
    AssetState,
    Position,
    REASON_OK,
    REASON_EXCEEDS_CAPACITY,
    REASON_NO_CAPACITY,
    REASON_RESTRICTED,
    REASON_CORPORATE_ACTION,
    REASON_SUSPENDED,
    REASON_MATURING,
    REASON_REDEEMABLE,
    REASON_REDEEMED
} from "./interfaces/LedgerLineTypes.sol";
import {ILedgerLineRegistry} from "./interfaces/ILedgerLineRegistry.sol";
import {IPositionEngine} from "./interfaces/IPositionEngine.sol";
import {IRiskEngine} from "./interfaces/IRiskEngine.sol";
import {ILedgerLinePolicy} from "./interfaces/ILedgerLinePolicy.sol";

/// @notice The policy decision layer. Reads state from LedgerLineRegistry
/// (never from an adapter directly -- Registry is the storage of record),
/// computes position value and borrowing capacity via the Stylus engines,
/// and returns a deterministic ALLOW/LIMIT/BLOCK decision.
///
/// MVP blocking rule (locked): any lifecycle state other than ACTIVE
/// blocks all actions, regardless of `action`. `action` is accepted and
/// reserved for future per-action differentiation but not yet used to
/// vary the decision -- deliberately, per Phase 3 scope.
contract LedgerLinePolicy is ILedgerLinePolicy, Ownable {
    ILedgerLineRegistry public registry;
    IPositionEngine public positionEngine;
    IRiskEngine public riskEngine;

    constructor(
        address initialOwner,
        address registryAddress,
        address positionEngineAddress,
        address riskEngineAddress
    ) Ownable(initialOwner) {
        registry = ILedgerLineRegistry(registryAddress);
        positionEngine = IPositionEngine(positionEngineAddress);
        riskEngine = IRiskEngine(riskEngineAddress);
    }

    function canExecute(
        uint256 assetId,
        uint256 positionId,
        Action action,
        uint256 amount
    ) external view returns (PolicyResponse memory response) {
        action; // reserved for future per-action differentiation, unused in MVP

        AssetState memory asset = registry.getAssetState(assetId);

        if (asset.lifecycle != LifecycleState.ACTIVE) {
            return PolicyResponse({
                decision: Decision.BLOCK,
                permittedAmount: 0,
                reason: _lifecycleReason(asset.lifecycle)
            });
        }

        Position memory position = registry.getPosition(assetId, positionId);

        uint256 positionValue = positionEngine.computePositionValue(
            position.rawBalance,
            asset.price,
            asset.multiplier
        );

        uint256 capacity = riskEngine.computeBorrowingCapacity(
            positionValue,
            asset.collateralFactorBps,
            asset.riskAdjustmentBps
        );

        if (capacity == 0) {
            return PolicyResponse({decision: Decision.BLOCK, permittedAmount: 0, reason: REASON_NO_CAPACITY});
        }

        if (amount <= capacity) {
            return PolicyResponse({decision: Decision.ALLOW, permittedAmount: capacity, reason: REASON_OK});
        }

        return PolicyResponse({decision: Decision.LIMIT, permittedAmount: capacity, reason: REASON_EXCEEDS_CAPACITY});
    }

    function _lifecycleReason(LifecycleState state) internal pure returns (bytes32) {
        if (state == LifecycleState.RESTRICTED) return REASON_RESTRICTED;
        if (state == LifecycleState.CORPORATE_ACTION) return REASON_CORPORATE_ACTION;
        if (state == LifecycleState.SUSPENDED) return REASON_SUSPENDED;
        if (state == LifecycleState.MATURING) return REASON_MATURING;
        if (state == LifecycleState.REDEEMABLE) return REASON_REDEEMABLE;
        if (state == LifecycleState.REDEEMED) return REASON_REDEEMED;
        return REASON_RESTRICTED; // unreachable for ACTIVE (checked by caller)
    }
}

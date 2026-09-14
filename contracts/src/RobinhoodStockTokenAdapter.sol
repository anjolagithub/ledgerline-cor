// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {AssetState, LifecycleState} from "./interfaces/LedgerLineTypes.sol";
import {IAssetStateAdapter} from "./interfaces/IAssetStateAdapter.sol";

/// @notice PLACEHOLDER Robinhood Stock Token adapter.
///
/// This is intentionally a stub. Real Robinhood Chain integration
/// (verified price source, actual Stock Token contract reads, real
/// corporate-action/multiplier data) is deferred to Phase 7, pending
/// verification against official Robinhood Chain documentation -- no
/// price feed, API, or contract address is assumed here.
///
/// For now this exposes an admin-settable mock AssetState so the rest
/// of the system (Registry, Policy, the eventual lending demo) can be
/// built and tested end-to-end without a real data source. Do not treat
/// any value returned by this contract as real market data.
contract RobinhoodStockTokenAdapter is IAssetStateAdapter, Ownable {
    uint256 public mockPrice;
    uint256 public mockMultiplier;
    uint256 public mockCollateralFactorBps;
    uint256 public mockRiskAdjustmentBps;

    constructor(
        address initialOwner,
        uint256 initialPrice,
        uint256 initialMultiplier,
        uint256 initialCollateralFactorBps,
        uint256 initialRiskAdjustmentBps
    ) Ownable(initialOwner) {
        mockPrice = initialPrice;
        mockMultiplier = initialMultiplier;
        mockCollateralFactorBps = initialCollateralFactorBps;
        mockRiskAdjustmentBps = initialRiskAdjustmentBps;
    }

    function setMockPrice(uint256 newPrice) external onlyOwner {
        mockPrice = newPrice;
    }

    function setMockMultiplier(uint256 newMultiplier) external onlyOwner {
        mockMultiplier = newMultiplier;
    }

    /// @dev Always reports ACTIVE -- this stub does not model lifecycle.
    /// Lifecycle is driven directly on LedgerLineRegistry by the admin
    /// for Phase 3; real corporate-action detection is Phase 7 work.
    function getAssetState(uint256 /* assetId */) external view returns (AssetState memory) {
        return AssetState({
            price: mockPrice,
            multiplier: mockMultiplier,
            lifecycle: LifecycleState.ACTIVE,
            collateralFactorBps: mockCollateralFactorBps,
            riskAdjustmentBps: mockRiskAdjustmentBps
        });
    }
}

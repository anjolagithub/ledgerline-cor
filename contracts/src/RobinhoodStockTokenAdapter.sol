// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {AssetState, LifecycleState} from "./interfaces/LedgerLineTypes.sol";
import {IAssetStateAdapter} from "./interfaces/IAssetStateAdapter.sol";
import {AggregatorV3Interface} from "./interfaces/IChainlinkAggregatorV3.sol";
import {IRobinhoodStockToken} from "./interfaces/IRobinhoodStockToken.sol";

/// @notice Real Robinhood Stock Token adapter, wired against verified
/// current official interfaces (docs.robinhood.com/chain, checked during
/// Phase 7, plus live verification against a real deployed testnet
/// contract -- TSLA at 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E).
///
/// oraclePaused() HANDLING (updated after live verification): Robinhood's
/// own docs state this flag is "advisory and not enforced on-chain" and
/// that staleness checking should be the primary guard. Live testing
/// against the real testnet TSLA contract confirmed this in practice --
/// the call reverted (function not implemented on this deployment) even
/// though uiMultiplier() and standard ERC-20 reads worked fine. This
/// adapter now calls oraclePaused() via try/catch: if it succeeds and
/// reports paused, treat as paused; if the call fails for ANY reason
/// (not implemented, reverts, etc.), fall through to the staleness
/// check rather than hard-reverting the whole adapter. This matches
/// the documented advisory nature of the flag and works against both
/// current testnet contracts and any future deployment that does
/// implement it.
///
/// Feed and sequencer-uptime-feed addresses are NOT hardcoded -- admin-
/// configurable, set to real, looked-up values at deployment time.
///
/// KEY DESIGN DECISION (unchanged from original Phase 7 analysis): the
/// Chainlink feed price for a Stock Token already has the corporate-
/// action multiplier baked in, so this adapter reports multiplier = 1e18
/// (neutral) and lets `price` carry the full, already-adjusted value.
///
/// Lifecycle is hardcoded ACTIVE -- per-asset lifecycle state remains
/// admin-driven on LedgerLineRegistry (Phase 3 design, unchanged).
contract RobinhoodStockTokenAdapter is IAssetStateAdapter, Ownable {
    IRobinhoodStockToken public stockToken;
    AggregatorV3Interface public priceFeed;
    AggregatorV3Interface public sequencerUptimeFeed;

    bool public sequencerCheckEnabled;
    uint256 public gracePeriodSeconds;
    uint256 public stalenessThresholdSeconds;
    uint256 public collateralFactorBps;
    uint256 public riskAdjustmentBps;

    uint256 private constant NEUTRAL_MULTIPLIER = 1e18;

    error SequencerDown();
    error GracePeriodNotOver();
    error OracleReportsPaused();
    error InvalidPrice();
    error StalePrice();

    constructor(
        address initialOwner,
        address stockTokenAddress,
        address priceFeedAddress,
        address sequencerUptimeFeedAddress,
        uint256 gracePeriodSeconds_,
        uint256 stalenessThresholdSeconds_,
        uint256 initialCollateralFactorBps,
        uint256 initialRiskAdjustmentBps
    ) Ownable(initialOwner) {
        stockToken = IRobinhoodStockToken(stockTokenAddress);
        priceFeed = AggregatorV3Interface(priceFeedAddress);
        sequencerUptimeFeed = AggregatorV3Interface(sequencerUptimeFeedAddress);
        // Disabled by default -- no real Sequencer Uptime Feed exists
        // for this chain (verified against Chainlink's own supported-
        // network list). Enabling this against address(0) would make
        // every getAssetState() call revert unconditionally.
        sequencerCheckEnabled = false;
        gracePeriodSeconds = gracePeriodSeconds_;
        stalenessThresholdSeconds = stalenessThresholdSeconds_;
        collateralFactorBps = initialCollateralFactorBps;
        riskAdjustmentBps = initialRiskAdjustmentBps;
    }

    function setStockToken(address stockTokenAddress) external onlyOwner {
        stockToken = IRobinhoodStockToken(stockTokenAddress);
    }

    function setPriceFeed(address priceFeedAddress) external onlyOwner {
        priceFeed = AggregatorV3Interface(priceFeedAddress);
    }

    function setSequencerUptimeFeed(address feedAddress) external onlyOwner {
        sequencerUptimeFeed = AggregatorV3Interface(feedAddress);
    }

    /// @dev Only enable once a real Sequencer Uptime Feed address for
    /// this chain has been set via setSequencerUptimeFeed.
    function setSequencerCheckEnabled(bool enabled) external onlyOwner {
        sequencerCheckEnabled = enabled;
    }

    function setGracePeriodSeconds(uint256 value) external onlyOwner {
        gracePeriodSeconds = value;
    }

    function setStalenessThresholdSeconds(uint256 value) external onlyOwner {
        stalenessThresholdSeconds = value;
    }

    function setCollateralFactorBps(uint256 value) external onlyOwner {
        require(value <= 10_000, "collateralFactorBps > 10000");
        collateralFactorBps = value;
    }

    function setRiskAdjustmentBps(uint256 value) external onlyOwner {
        require(value <= 10_000, "riskAdjustmentBps > 10000");
        riskAdjustmentBps = value;
    }

    /// @dev assetId is unused -- this adapter instance corresponds to a
    /// single, specific Stock Token, matching the current single-asset
    /// scope established in Phase 3/4.
    function getAssetState(uint256 /* assetId */) external view returns (AssetState memory) {
        if (sequencerCheckEnabled) {
            _checkSequencerUp();
        }
        _checkOraclePausedAdvisory();

        (, int256 answer, , uint256 updatedAt,) = priceFeed.latestRoundData();
        if (answer <= 0) revert InvalidPrice();
        if (updatedAt == 0) revert InvalidPrice();
        if (block.timestamp - updatedAt > stalenessThresholdSeconds) revert StalePrice();

        uint8 feedDecimals = priceFeed.decimals();
        uint256 price18 = _scaleTo18(uint256(answer), feedDecimals);

        return AssetState({
            price: price18,
            multiplier: NEUTRAL_MULTIPLIER,
            lifecycle: LifecycleState.ACTIVE,
            collateralFactorBps: collateralFactorBps,
            riskAdjustmentBps: riskAdjustmentBps
        });
    }

    function _checkSequencerUp() internal view {
        (, int256 sequencerStatus, uint256 startedAt,,) = sequencerUptimeFeed.latestRoundData();
        if (sequencerStatus != 0) revert SequencerDown();
        if (block.timestamp - startedAt <= gracePeriodSeconds) revert GracePeriodNotOver();
    }

    /// @dev Advisory check, per Robinhood's own documented guidance: if
    /// the call succeeds and reports paused, block. If the call fails
    /// for any reason (not implemented on this deployment, reverts,
    /// etc.), fall through silently -- the mandatory staleness check
    /// above remains the primary guard regardless.
    function _checkOraclePausedAdvisory() internal view {
        try stockToken.oraclePaused() returns (bool paused) {
            if (paused) revert OracleReportsPaused();
        } catch {
            // Advisory flag unavailable -- staleness check is the
            // primary guard and still applies unconditionally.
        }
    }

    function _scaleTo18(uint256 amount, uint8 fromDecimals) internal pure returns (uint256) {
        if (fromDecimals == 18) return amount;
        if (fromDecimals < 18) return amount * (10 ** (18 - fromDecimals));
        return amount / (10 ** (fromDecimals - 18));
    }
}

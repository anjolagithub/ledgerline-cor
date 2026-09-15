// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {AssetState, LifecycleState} from "./interfaces/LedgerLineTypes.sol";
import {IAssetStateAdapter} from "./interfaces/IAssetStateAdapter.sol";
import {AggregatorV3Interface} from "./interfaces/IChainlinkAggregatorV3.sol";
import {IRobinhoodStockToken} from "./interfaces/IRobinhoodStockToken.sol";

/// @notice Real Robinhood Stock Token adapter, wired against verified
/// current official interfaces (docs.robinhood.com/chain, checked during
/// Phase 7). Feed/token/sequencer addresses are NOT hardcoded -- Robinhood's
/// own docs say the Chainlink registry
/// (docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood)
/// is the source of truth, so these are admin-configurable and must be
/// set to real, looked-up values at deployment time.
///
/// KEY DESIGN DECISION: per Robinhood's Oracles & Price Feeds docs, the
/// Chainlink feed price for a Stock Token already has the corporate-action
/// multiplier baked in ("the feed returns the price of one token, which
/// is the underlying share price times the multiplier... you don't apply
/// the multiplier yourself"). To avoid double-counting in LedgerLine's
/// generic PositionEngine(rawBalance, price, multiplier) formula, this
/// adapter always reports multiplier = 1e18 (neutral) and lets `price`
/// carry the full, already-adjusted value straight from the feed. This is
/// a property of Robinhood's specific oracle design, not a general rule
/// -- a different RWA issuer whose feed does NOT bake in a multiplier
/// would populate AssetState.multiplier for real.
///
/// Lifecycle is hardcoded ACTIVE -- per-asset lifecycle state remains
/// admin-driven on LedgerLineRegistry (Phase 3 design, unchanged); this
/// adapter's job is price/value data only, not lifecycle triggering.
contract RobinhoodStockTokenAdapter is IAssetStateAdapter, Ownable {
    IRobinhoodStockToken public stockToken;
    AggregatorV3Interface public priceFeed;
    AggregatorV3Interface public sequencerUptimeFeed;

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
    /// scope established in Phase 3/4. A multi-asset adapter is a future
    /// extension, not built speculatively here.
    function getAssetState(uint256 /* assetId */) external view returns (AssetState memory) {
        _checkSequencerUp();

        if (stockToken.oraclePaused()) revert OracleReportsPaused();

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

    function _scaleTo18(uint256 amount, uint8 fromDecimals) internal pure returns (uint256) {
        if (fromDecimals == 18) return amount;
        if (fromDecimals < 18) return amount * (10 ** (18 - fromDecimals));
        return amount / (10 ** (fromDecimals - 18));
    }
}

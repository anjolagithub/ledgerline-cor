// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Copied verbatim (pragma aligned to this repo's version) from
/// the official Robinhood Chain documentation:
/// docs.robinhood.com/chain/oracles-and-price-feeds
/// This is the standard Chainlink AggregatorV3Interface -- not
/// Robinhood-specific.
interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
    function decimals() external view returns (uint8);
}

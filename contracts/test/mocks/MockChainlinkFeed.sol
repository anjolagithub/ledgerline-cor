// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "../../src/interfaces/IChainlinkAggregatorV3.sol";

/// @notice Configurable mock of AggregatorV3Interface for testing
/// RobinhoodStockTokenAdapter against realistic and adversarial feed
/// responses. Not a real Chainlink feed.
contract MockChainlinkFeed is AggregatorV3Interface {
    int256 public answer;
    uint256 public updatedAt;
    uint256 public startedAt;
    uint8 public feedDecimals;

    constructor(int256 initialAnswer, uint8 decimals_) {
        answer = initialAnswer;
        feedDecimals = decimals_;
        updatedAt = block.timestamp;
        startedAt = block.timestamp;
    }

    function setAnswer(int256 newAnswer) external {
        answer = newAnswer;
        updatedAt = block.timestamp;
    }

    function setUpdatedAt(uint256 value) external {
        updatedAt = value;
    }

    function setStartedAt(uint256 value) external {
        startedAt = value;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer_, uint256 startedAt_, uint256 updatedAt_, uint80 answeredInRound)
    {
        return (1, answer, startedAt, updatedAt, 1);
    }

    function decimals() external view returns (uint8) {
        return feedDecimals;
    }
}

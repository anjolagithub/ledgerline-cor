// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal interface for the two Robinhood Stock Token
/// functions this adapter needs, per docs.robinhood.com/chain/stock-tokens
/// and docs.robinhood.com/chain/oracles-and-price-feeds.
///
/// uiMultiplier() is standardized by ERC-8056 (Scaled UI Amount
/// Extension): https://eips.ethereum.org/EIPS/eip-8056
/// oraclePaused() is Robinhood-Chain-specific: true while a corporate
/// action is being processed for this token; advisory, not enforced
/// onchain (per the docs' own caveat).
///
/// The full token contract is also a standard ERC-20 (see IERC20) --
/// this interface only adds the two extra reads this adapter uses.
interface IRobinhoodStockToken {
    function uiMultiplier() external view returns (uint256);
    function oraclePaused() external view returns (bool);
}

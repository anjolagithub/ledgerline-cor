// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AssetState, Position} from "./LedgerLineTypes.sol";

/// @notice Read interface for LedgerLine's canonical state store. Policy
/// reads through this interface, not through IAssetStateAdapter directly —
/// Registry is the storage of record regardless of which adapter (or
/// admin, for now) originally populated it.
interface ILedgerLineRegistry {
    function getAssetState(uint256 assetId) external view returns (AssetState memory);
    function getPosition(uint256 assetId, uint256 positionId) external view returns (Position memory);
}

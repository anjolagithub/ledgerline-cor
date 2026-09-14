// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AssetState, Position} from "./LedgerLineTypes.sol";

/// @notice Interface for LedgerLine's canonical state store. Policy reads
/// through this interface (never through IAssetStateAdapter directly) --
/// Registry is the storage of record regardless of which adapter (or
/// admin, for now) originally populated it. setPosition is restricted to
/// the configured positionWriter at the implementation level (see
/// LedgerLineRegistry), not enforced by this interface itself.
interface ILedgerLineRegistry {
    function getAssetState(uint256 assetId) external view returns (AssetState memory);
    function getPosition(uint256 assetId, uint256 positionId) external view returns (Position memory);
    function isAssetInitialized(uint256 assetId) external view returns (bool);
    function setPosition(uint256 assetId, uint256 positionId, uint256 rawBalance) external;
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AssetState} from "./LedgerLineTypes.sol";

/// @notice Boundary interface between an external RWA issuer's data and
/// LedgerLine's internal AssetState model. Concrete implementations (e.g.
/// a Robinhood Stock Token adapter) live behind this interface so the core
/// protocol never depends on any single issuer's data format or API.
interface IAssetStateAdapter {
    /// @notice Returns the current internal-model state for a given asset.
    function getAssetState(uint256 assetId) external view returns (AssetState memory);
}

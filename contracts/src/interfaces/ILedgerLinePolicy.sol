// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Action, PolicyResponse} from "./LedgerLineTypes.sol";

/// @notice The core policy decision interface. Any consuming protocol
/// (lending market, vault, etc.) calls this before executing a financial
/// action and MUST enforce the returned decision itself — this function
/// only decides, it does not execute or hold funds.
interface ILedgerLinePolicy {
    /// @param assetId The asset the position is denominated in.
    /// @param positionId The position being evaluated.
    /// @param action The action the caller wants to perform.
    /// @param amount The amount the caller wants to execute.
    /// @return response ALLOW/LIMIT/REVIEW/BLOCK plus the maximum permitted
    /// amount and a machine-readable reason. permittedAmount is the ceiling
    /// LedgerLine allows, not a reduced version of the caller's request —
    /// callers must check requestedAmount <= response.permittedAmount and
    /// account for their own existing debt/state themselves.
    function canExecute(
        uint256 assetId,
        uint256 positionId,
        Action action,
        uint256 amount
    ) external view returns (PolicyResponse memory response);
}

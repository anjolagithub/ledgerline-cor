// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Deploys ONLY a new LedgerLinePolicy against the CURRENT source, which
// already implements LIQUIDATE/TRANSFER/WITHDRAW branches and repay()
// support end to end (verified by reading contracts/src/LedgerLinePolicy.sol
// and LedgerLineLendingAdapter.sol directly -- these are not stubs). The
// LIVE deployed Policy at 0x22fA5c1C36Cc1F7557B932dE7aCDa354ee4F6F52 predates
// this source and does not carry it, so making LIQUIDATE support real on
// testnet requires a fresh Policy instance, not a config change.
//
// DEPLOY ONLY. This is step 1 of a 4-contract redeploy cascade (Policy ->
// LendingAdapter -> VaultAdapter -> TransferAdapter), because
// LedgerLineLendingAdapter.policy is `immutable` (no setter), and
// VaultAdapter/TransferAdapter both take lendingAdapterAddress in their
// constructors. Do NOT combine this with any onlyOwner authorization call
// in the same broadcast -- see the real incident documented in
// RedeployVaultAdapter.s.sol and docs/DEPLOYMENTS.md: an authorize call
// that reverts in simulation (wrong signer) makes forge broadcast NOTHING,
// including the deploy, leaving a console-logged address with no bytecode.
//
// Registry itself is NOT redeployed -- this Policy instance reads the same
// live Registry and its already-configured assetId 1. After this deploys,
// run RedeployLendingAdapter2.s.sol with this Policy's address, then
// RedeployVaultAdapter2.s.sol and RedeployTransferAdapter2.s.sol in turn.
// Always confirm each address with `cast code <address>` before wiring it
// into the next script -- never trust the logged address alone.

import {Script, console} from "forge-std/Script.sol";
import {LedgerLinePolicy} from "../src/LedgerLinePolicy.sol";

contract RedeployPolicy2 is Script {
    // Same owner as every other live contract in this stack
    // (LedgerLineLendingAdapter's confirmed owner, docs/DEPLOYMENTS.md).
    address constant OWNER = 0x00dC0f3ff1F2bca6b3d007684cC25a766c9815f4;
    address constant REGISTRY = 0x88508A6d9266fbc928cC11DEE92f4EB1801B907c;
    address constant POSITION_ENGINE = 0xde8365dAF3CFdF952E2F946F19a4DcAcd57eFf0F;
    address constant RISK_ENGINE = 0xf661dA9D3f214A181014Bc7ba8590B90F9314eC4;

    function run() external {
        // Signer comes from the CLI (--account <keystore> / --sender), so
        // no raw private key sits in an env var or in this file.
        vm.startBroadcast();

        LedgerLinePolicy policy = new LedgerLinePolicy(OWNER, REGISTRY, POSITION_ENGINE, RISK_ENGINE);

        vm.stopBroadcast();

        console.log("New Policy (current source, LIQUIDATE-capable):", address(policy));
        console.log("NOT yet wired to any adapter -- run RedeployLendingAdapter2.s.sol next,");
        console.log("passing this address as NEW_POLICY.");
        console.log("Old, pre-LIQUIDATE-source Policy (still live until adapters move): 0x22fA5c1C36Cc1F7557B932dE7aCDa354ee4F6F52");
    }
}

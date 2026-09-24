// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Deploys ONLY LedgerLineVaultAdapter with the debt-safety fix
// (withdraw() checks it wouldn't leave outstanding LendingAdapter debt
// uncollateralized). DEPLOY ONLY -- authorizing the new instance on
// LendingAdapter is a separate, owner-key step, run and verified on its
// own afterwards.
//
// WHY THIS SCRIPT NO LONGER AUTHORIZES (verified live 2026-09-24): the
// previous version deployed AND called setAuthorizedReleaser() in one
// broadcast. It was run with a key that is not the LendingAdapter owner
// (0x00dC0f3ff1F2bca6b3d007684cC25a766c9815f4), so the onlyOwner call
// reverted in simulation and forge broadcast NOTHING -- including the
// deploy. Its console-logged address,
// 0x0F705a7473461C1eF4148bC3D813E1ab15EC93ac, has no bytecode, but the
// owner later authorized it anyway (tx 0x43c33c83..., block 122912429).
// This deploy-only version was then run for real on 2026-09-24:
// 0xfF7EC5218730AdbCAa14cdf205cc57F97D335A6b, authorized separately, with
// the pre-fix 0x5d27a9aC4bC4b63BE9939bD386c4f198B7308D67 and the codeless
// 0x0F70... de-authorized (txs in docs/DEPLOYMENTS.md). Splitting the steps means
// the deploy can no longer be silently aborted by the authorization.
// Always confirm with `cast code <address>` afterwards -- never trust
// the logged address alone.

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineVaultAdapter} from "../src/LedgerLineVaultAdapter.sol";

contract RedeployVaultAdapter is Script {
    uint256 constant ASSET_ID = 1;
    address constant REGISTRY = 0x88508A6d9266fbc928cC11DEE92f4EB1801B907c;
    address constant POLICY = 0x22fA5c1C36Cc1F7557B932dE7aCDa354ee4F6F52;
    address constant LENDING_ADAPTER = 0x39E0d1F2877c69F1a617a86d4Bd4F8B3f2493C97;

    function run() external {
        // Signer comes from the CLI (--account <keystore> / --sender), so
        // no raw private key needs to sit in an environment variable.
        vm.startBroadcast();

        LedgerLineVaultAdapter vaultAdapter = new LedgerLineVaultAdapter(
            REGISTRY, POLICY, LENDING_ADAPTER, ASSET_ID
        );

        vm.stopBroadcast();

        console.log("New VaultAdapter (debt-safety fix, NOT yet authorized):", address(vaultAdapter));
        console.log("Old, unfixed instance (do not use): 0x5d27a9aC4bC4b63BE9939bD386c4f198B7308D67");
    }
}

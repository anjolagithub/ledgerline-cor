// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Deploys ONLY a new LedgerLineLendingAdapter, wired to the new Policy from
// RedeployPolicy2.s.sol. Required because `policy` is `immutable` on this
// contract (no setter) -- there is no way to point the live LendingAdapter
// at a new Policy without a fresh instance. This new instance's repay()
// (already fully implemented in the current source -- see
// contracts/src/LedgerLineLendingAdapter.sol) becomes usable once wired.
//
// DEPLOY ONLY -- see RedeployPolicy2.s.sol and RedeployVaultAdapter.s.sol
// for why this repo never combines a deploy with an onlyOwner authorize
// call in one broadcast.
//
// REAL CONSEQUENCE, read before running: debt is tracked in THIS
// contract's own `debt` mapping, not in Registry. This new instance starts
// every position's debt at zero -- any existing debt against the live
// LendingAdapter (0x39E0d1F2877c69F1a617a86d4Bd4F8B3f2493C97) remains real
// and remains only repayable through that OLD contract. Decide whether any
// open positions need to be settled on the old instance before moving
// borrow/repay traffic to the new one.
//
// After this deploys: (1) run RedeployVaultAdapter2.s.sol and
// RedeployTransferAdapter2.s.sol with this address as NEW_LENDING_ADAPTER,
// (2) as the Registry/LendingAdapter owner, call (each as its own
// transaction, each verified before the next):
//   cast send $REGISTRY "setPositionWriter(address)" $NEW_LENDING_ADAPTER --account <keystore>
//   cast send $NEW_LENDING_ADAPTER "setAuthorizedReleaser(address,bool)" $NEW_VAULT_ADAPTER true --account <keystore>
//   cast send $NEW_LENDING_ADAPTER "setAuthorizedReleaser(address,bool)" $NEW_TRANSFER_ADAPTER true --account <keystore>
// Confirm each with `cast call` (isAuthorizedReleaser / positionWriter)
// before moving to the next line, exactly as docs/DEPLOYMENTS.md records
// for the VaultAdapter debt-safety fix.

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";

contract RedeployLendingAdapter2 is Script {
    uint256 constant ASSET_ID = 1;
    address constant OWNER = 0x00dC0f3ff1F2bca6b3d007684cC25a766c9815f4;
    address constant REGISTRY = 0x88508A6d9266fbc928cC11DEE92f4EB1801B907c;
    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;

    // Deployed 2026-09-26, tx 0x4cda5c91d6dec4cd870076efe9f358e745f63d942634e6ed798f053f05d8476c,
    // riskEngine() confirmed == 0x10246f909139Aa83f7C223012bDd656472b3C2bc.
    address constant NEW_POLICY = 0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460;

    function run() external {
        require(NEW_POLICY != address(0), "Set NEW_POLICY to RedeployPolicy2's confirmed output first");

        vm.startBroadcast();

        LedgerLineLendingAdapter lendingAdapter =
            new LedgerLineLendingAdapter(OWNER, REGISTRY, NEW_POLICY, TSLA, USDG, ASSET_ID);

        vm.stopBroadcast();

        console.log("New LendingAdapter (wired to new Policy, debt starts at zero):", address(lendingAdapter));
        console.log("NOT yet the Registry.positionWriter, NOT yet authorizing any releaser.");
        console.log("Old LendingAdapter (existing debt stays here, still repayable there): 0x39E0d1F2877c69F1a617a86d4Bd4F8B3f2493C97");
    }
}

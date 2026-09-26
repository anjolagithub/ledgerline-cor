// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Deploys ONLY a new LedgerLineLendingAdapter carrying the new
// liquidate() function (contracts/src/LedgerLineLendingAdapter.sol),
// which lets an authorized releaser reduce a THIRD PARTY's debt and
// seize their collateral in one call -- required for a real LIQUIDATE
// consumer, since the live LendingAdapter's repay() is strictly
// debt[msg.sender]-only and has no such capability.
//
// Points at the SAME Policy as the current V3 stack
// (0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460) -- Policy does not
// depend on LendingAdapter's address, so it is NOT being redeployed
// again here. Only LendingAdapter/VaultAdapter/TransferAdapter cascade,
// because VaultAdapter/TransferAdapter both take lendingAdapterAddress
// as an immutable constructor arg with no setter.
//
// DEPLOY ONLY -- see RedeployLendingAdapter2.s.sol for why this repo
// never combines a deploy with an onlyOwner authorize call in one
// broadcast.
//
// REAL CONSEQUENCE, read before running: debt is tracked in THIS
// contract's own `debt` mapping, not in Registry. This new instance
// starts every position's debt at zero -- any existing debt against the
// current LendingAdapter (0x020Bdf07C8970877677Ef064670a4d3BbDBcCa43)
// remains real and remains only repayable through that OLD contract.
// Decide whether any open positions need to be settled on the old
// instance before moving borrow/repay/liquidate traffic to the new one.
//
// After this deploys: (1) run RedeployVaultAdapter3.s.sol,
// RedeployTransferAdapter3.s.sol, and DeployLiquidationAdapter.s.sol
// with this address as NEW_LENDING_ADAPTER, (2) as the
// Registry/LendingAdapter owner, call (each as its own transaction,
// each verified before the next):
//   cast send $REGISTRY "setPositionWriter(address)" $NEW_LENDING_ADAPTER --account <keystore>
//   cast send $NEW_LENDING_ADAPTER "setAuthorizedReleaser(address,bool)" $NEW_VAULT_ADAPTER true --account <keystore>
//   cast send $NEW_LENDING_ADAPTER "setAuthorizedReleaser(address,bool)" $NEW_TRANSFER_ADAPTER true --account <keystore>
//   cast send $NEW_LENDING_ADAPTER "setAuthorizedReleaser(address,bool)" $NEW_LIQUIDATION_ADAPTER true --account <keystore>
// Confirm each with `cast call` (isAuthorizedReleaser / positionWriter)
// before moving to the next line.

import {Script, console} from "forge-std/Script.sol";
import {LedgerLineLendingAdapter} from "../src/LedgerLineLendingAdapter.sol";

contract RedeployLendingAdapter3 is Script {
    uint256 constant ASSET_ID = 1;
    address constant OWNER = 0x00dC0f3ff1F2bca6b3d007684cC25a766c9815f4;
    address constant REGISTRY = 0x88508A6d9266fbc928cC11DEE92f4EB1801B907c;
    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;

    // Unchanged from the V3 stack -- Policy has no dependency on
    // LendingAdapter's address. Deployed 2026-09-26, tx
    // 0x4cda5c91d6dec4cd870076efe9f358e745f63d942634e6ed798f053f05d8476c.
    address constant CURRENT_POLICY = 0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460;

    function run() external {
        require(CURRENT_POLICY != address(0), "Set CURRENT_POLICY first");

        vm.startBroadcast();

        LedgerLineLendingAdapter lendingAdapter =
            new LedgerLineLendingAdapter(OWNER, REGISTRY, CURRENT_POLICY, TSLA, USDG, ASSET_ID);

        vm.stopBroadcast();

        console.log("New LendingAdapter (with liquidate(), debt starts at zero):", address(lendingAdapter));
        console.log("NOT yet the Registry.positionWriter, NOT yet authorizing any releaser.");
        console.log("Old LendingAdapter (existing debt stays here, still repayable there): 0x020Bdf07C8970877677Ef064670a4d3BbDBcCa43");
    }
}

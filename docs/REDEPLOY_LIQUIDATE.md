# Redeploying for LIQUIDATE + repay() support

**Status:** the sequence below (V3, 2026-09-26) is historical --
already run, confirmed, and superseded by the V4 redeploy documented
at the bottom of this file, which added a real LIQUIDATE consumer.
Kept here for the record of why the LIQUIDATE decision path needed a
RiskEngine redeploy in the first place.

**Why:** `contracts/src/LedgerLinePolicy.sol` and
`LedgerLineLendingAdapter.sol` already fully implement the LIQUIDATE
decision path and `repay()` in the current source, but the *live*
deployed instances (`docs/DEPLOYMENTS.md`) predate this source. There is
no setter to point the live LendingAdapter at a new Policy (`policy` is
`immutable`), so making this real on testnet means a 4-contract redeploy
cascade: Policy -> LendingAdapter -> VaultAdapter -> TransferAdapter.

**Before you start:** run `forge build` locally first — these scripts were
written and reviewed in an environment without Foundry installed, so they
have not been compiled yet. Fix anything that doesn't compile before
broadcasting.

**Known real cost of this redeploy:** debt lives in
`LedgerLineLendingAdapter`'s own `debt` mapping, not in Registry. The new
LendingAdapter starts every position's debt at zero. Any existing debt on
the current live instance (`0x39E0d1F2877c69F1a617a86d4Bd4F8B3f2493C97`)
stays real and stays repayable only through that old contract. If there's
open debt you care about, settle it there first or accept the split.

**Known real gap even after this redeploy (closed by V4, see bottom of
this file):** at this point, LIQUIDATE had no consumer contract and no
frontend UI. Deploying it made the decision path callable and testable
(e.g. via `cast call` against `Policy.canExecute`), but it was not
visible or demoable in the product until `LedgerLineLiquidationAdapter`
and a UI flow existed.

## Sequence

Run every step from `contracts/`, with your Foundry keystore (`--account
<keystore>`) as the signer — the same key that owns the current
LendingAdapter (`0x00dC0f3ff1F2bca6b3d007684cC25a766c9815f4`). Each step is
its own broadcast; confirm each result with `cast code` / `cast call`
before moving to the next. Never chain a deploy and an `onlyOwner` call in
one broadcast (see `RedeployVaultAdapter.s.sol` and
`docs/DEPLOYMENTS.md` for the real incident that rule exists because of).

### 0. Deploy a new RiskEngine (required for LIQUIDATE to actually work)

The live RiskEngine (`0xf661dA9D3f214A181014Bc7ba8590B90F9314eC4`) predates
commit `647136f`, which added `isLiquidatable()`. Policy's LIQUIDATE branch
calls that function, so wiring the new Policy to the old RiskEngine makes
every LIQUIDATE check revert. Deploy a fresh one first:

```
cd stylus/risk-engine
cargo stylus check  --endpoint $RPC_URL
cargo stylus deploy --endpoint $RPC_URL --keystore-path ~/.foundry/keystores/<keystore>
cast call <NEW_RISK_ENGINE> "isLiquidatable(uint256,uint256,uint256)(bool)" 100 7000 71 --rpc-url $RPC_URL   # expect true
```

(`cargo stylus deploy`'s exact flags vary by version — run `cargo stylus
deploy --help` if the keystore flag above is rejected.) Then set
`RISK_ENGINE` in `RedeployPolicy2.s.sol` to this address — the script now
`require()`s it be set to something other than the zero address before it
will broadcast, specifically so this step can't be silently skipped.

### 1. Deploy the new Policy

```
forge script script/RedeployPolicy2.s.sol --rpc-url $RPC_URL --account <keystore> --broadcast
```

Confirm: `cast code <NEW_POLICY> --rpc-url $RPC_URL` returns real bytecode
(not `0x`).

### 2. Deploy the new LendingAdapter

Edit `RedeployLendingAdapter2.s.sol`, set `NEW_POLICY` to the confirmed
address from step 1, then:

```
forge script script/RedeployLendingAdapter2.s.sol --rpc-url $RPC_URL --account <keystore> --broadcast
```

Confirm: `cast code <NEW_LENDING_ADAPTER> --rpc-url $RPC_URL`.

### 3. Deploy the new VaultAdapter and TransferAdapter

Edit both `RedeployVaultAdapter2.s.sol` and
`RedeployTransferAdapter2.s.sol`, setting `NEW_POLICY` and
`NEW_LENDING_ADAPTER` to the confirmed addresses from steps 1-2, then:

```
forge script script/RedeployVaultAdapter2.s.sol --rpc-url $RPC_URL --account <keystore> --broadcast
forge script script/RedeployTransferAdapter2.s.sol --rpc-url $RPC_URL --account <keystore> --broadcast
```

Confirm both with `cast code`.

### 4. Wire everything together (owner-key `cast send`, one call at a time)

```
cast send $REGISTRY "setPositionWriter(address)" $NEW_LENDING_ADAPTER --account <keystore> --rpc-url $RPC_URL
cast call  $REGISTRY "positionWriter()(address)" --rpc-url $RPC_URL   # confirm == NEW_LENDING_ADAPTER

cast send $NEW_LENDING_ADAPTER "setAuthorizedReleaser(address,bool)" $NEW_VAULT_ADAPTER true --account <keystore> --rpc-url $RPC_URL
cast call  $NEW_LENDING_ADAPTER "isAuthorizedReleaser(address)(bool)" $NEW_VAULT_ADAPTER --rpc-url $RPC_URL   # confirm true

cast send $NEW_LENDING_ADAPTER "setAuthorizedReleaser(address,bool)" $NEW_TRANSFER_ADAPTER true --account <keystore> --rpc-url $RPC_URL
cast call  $NEW_LENDING_ADAPTER "isAuthorizedReleaser(address)(bool)" $NEW_TRANSFER_ADAPTER --rpc-url $RPC_URL   # confirm true
```

### 5. Fund the new LendingAdapter

`borrow()` pays out from the LendingAdapter's own USDG balance — the new
instance starts at 0. Send it testnet USDG (Paxos faucet, per
`docs/INTEGRATIONS.md`) before testing `borrow()`/`repay()` against it.

### 6. Report back

Once every address is confirmed live and wired, report the five new
addresses (Policy, LendingAdapter, VaultAdapter, TransferAdapter — Registry
is unchanged) so `sdk/src/addresses.ts`, the Vercel
`NEXT_PUBLIC_*_ADDRESS` env vars, and `docs/DEPLOYMENTS.md` can be updated
to match, the same way the VaultAdapter debt-safety fix was documented.

### Optional: de-authorize the old instances

Once the new stack is confirmed working, revoke the old LendingAdapter's
releaser authorizations for the old VaultAdapter/TransferAdapter, and
optionally leave a note in `docs/DEPLOYMENTS.md` marking them abandoned —
mirroring exactly how the VaultAdapter debt-safety fix was closed out.

---

## V4: adding a real LIQUIDATE consumer (2026-09-26, run after the above)

**Why:** the V3 sequence above made LIQUIDATE's `canExecute()` decision
correct and callable, but nothing could act on an `ALLOW` -- `repay()`
is strictly `debt[msg.sender]`-only, so there was no way for a third
party (a liquidator) to reduce someone else's debt and take their
collateral. This added `LedgerLineLendingAdapter.liquidate(address
borrower, uint256 repayAmount, uint256 seizeAmount, address
liquidator)`, gated by `isAuthorizedReleaser` (same trust pattern as
`releaseCollateral`/`transferPosition`), plus the new
`LedgerLineLiquidationAdapter.sol` consumer that calls it.

**Cascade:** `Policy` did NOT need to be redeployed again -- it has no
dependency on LendingAdapter's address. Only LendingAdapter (to carry
the new function) cascades to VaultAdapter/TransferAdapter (both take
`lendingAdapterAddress` as an immutable constructor arg), plus the
brand-new LiquidationAdapter.

Sequence actually run (same discipline as V3 -- deploy-only scripts,
`cast send`/`cast call` verified one at a time, run from `contracts/`):

```
forge script script/RedeployLendingAdapter3.s.sol --rpc-url $RPC_URL --account <keystore> --broadcast
# -> new LendingAdapter. Edit RedeployVaultAdapter3.s.sol,
#    RedeployTransferAdapter3.s.sol, and DeployLiquidationAdapter.s.sol's
#    NEW_LENDING_ADAPTER to this address, then:

forge script script/RedeployVaultAdapter3.s.sol --rpc-url $RPC_URL --account <keystore> --broadcast
forge script script/RedeployTransferAdapter3.s.sol --rpc-url $RPC_URL --account <keystore> --broadcast
forge script script/DeployLiquidationAdapter.s.sol --rpc-url $RPC_URL --account <keystore> --broadcast

cast send $REGISTRY "setPositionWriter(address)" $NEW_LENDING_ADAPTER --account <keystore> --rpc-url $RPC_URL
cast send $NEW_LENDING_ADAPTER "setAuthorizedReleaser(address,bool)" $NEW_VAULT_ADAPTER true --account <keystore> --rpc-url $RPC_URL
cast send $NEW_LENDING_ADAPTER "setAuthorizedReleaser(address,bool)" $NEW_TRANSFER_ADAPTER true --account <keystore> --rpc-url $RPC_URL
cast send $NEW_LENDING_ADAPTER "setAuthorizedReleaser(address,bool)" $NEW_LIQUIDATION_ADAPTER true --account <keystore> --rpc-url $RPC_URL
# each cast send confirmed with the matching cast call before the next

cast send $USDG "transfer(address,uint256)" $NEW_LENDING_ADAPTER <amount> --account <keystore> --rpc-url $RPC_URL
```

Real addresses and tx hashes: see `docs/DEPLOYMENTS.md`'s "V4: real
LIQUIDATE consumer" section. Frontend/SDK wiring: `sdk/src/addresses.ts`,
`components/LiquidateForm.tsx`, and the Vercel `NEXT_PUBLIC_*_ADDRESS`
env vars were all updated to match, same as every prior redeploy.

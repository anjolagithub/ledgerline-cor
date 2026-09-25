# Redeploying for LIQUIDATE + repay() support

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

**Known real gap even after this redeploy:** LIQUIDATE has no consumer
contract and no frontend UI. Deploying it makes the decision path callable
and testable (e.g. via `cast call` against `Policy.canExecute`), but it
will not be visible or demoable in the product until a
LiquidationAdapter-style consumer and a UI flow exist. That's a separate,
unstarted piece of work — decide separately whether to build it.

## Sequence

Run every step from `contracts/`, with your Foundry keystore (`--account
<keystore>`) as the signer — the same key that owns the current
LendingAdapter (`0x00dC0f3ff1F2bca6b3d007684cC25a766c9815f4`). Each step is
its own broadcast; confirm each result with `cast code` / `cast call`
before moving to the next. Never chain a deploy and an `onlyOwner` call in
one broadcast (see `RedeployVaultAdapter.s.sol` and
`docs/DEPLOYMENTS.md` for the real incident that rule exists because of).

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

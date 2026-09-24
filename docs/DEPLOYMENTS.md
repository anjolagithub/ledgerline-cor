# Deployments

Source of truth: `contracts/broadcast/DeployTestnetRealV2.s.sol/46630/run-latest.json`
(the actual broadcast receipts, not the script source alone). Deployed
**2026-09-21** on **Robinhood Chain Testnet, chain ID 46630**.

## Core contracts

| Contract | Address | Deploy block | Deploy tx |
|---|---|---|---|
| `LedgerLineRegistry` | `0x88508A6d9266fbc928cC11DEE92f4EB1801B907c` | 122446927 | `0x0edda24bbec0a5119e4b3b07e185b8dfb4bef58689da1528d4c8a4921f12914e` |
| `LedgerLinePolicy` | `0x22fA5c1C36Cc1F7557B932dE7aCDa354ee4F6F52` | 122446935 | `0x4c8e45315361ebafffe62af9e9984ae4b5e1a444568fc51d907d567986c19444` |

## Consumers / adapters

| Contract | Address | Deploy block | Deploy tx |
|---|---|---|---|
| `LedgerLineLendingAdapter` | `0x39E0d1F2877c69F1a617a86d4Bd4F8B3f2493C97` | 122446946 | `0x5bde0152f9602b912d62ff7261ff04959a4b73752b7fcbb8817ce1b06923a699` |
| `LedgerLineVaultAdapter` (live, pre-debt-check build) | `0x5d27a9aC4bC4b63BE9939bD386c4f198B7308D67` | not recorded in this repo | not recorded in this repo |
| `LedgerLineTransferAdapter` | `0xc5Af6A4a36b6e1b2B22D03b18bBA9FEA6D456943` | 123081162 | `0x09db3fe80e2c5fba8b21d71cfbea093fb252333de553dc9789a46909f8c5997a` |
| `RobinhoodStockTokenAdapter` | `0x3A1B5a91DBb68C39647B5a7Fe0aDD1a59Ec3dfb9` | 122531798 | `0xdebba93e4771b6bcaee54eb3c2c7503c77ad1e672c95c6c4212e4ef77307b49c` |
| `MockChainlinkFeed` (reference price for the above) | `0x4548F12F03c3123983b046EAc237876E03A2D7e3` | 122446900 | `0x8eb349b06a4c191efb88bc3aea99f24e9d686c091fed61a24821ddfbbec72713` |

**`LedgerLineVaultAdapter`: the debt-safe redeploy never reached
chain.** `contracts/script/RedeployVaultAdapter.s.sol` was meant to
redeploy VaultAdapter after commit `9fa2c38` added a debt-safety check
to `withdraw()`. Checked live on 2026-09-24:

- `0x0F705a7473461C1eF4148bC3D813E1ab15EC93ac`, the address previously
  recorded here as the redeployed instance, has **no bytecode**
  (`cast code` returns `0x`).
- `LendingAdapter.isAuthorizedReleaser(0x0F70…93ac)` is `true`, so the
  manual `cast send setAuthorizedReleaser` step did run, against an
  empty address.
- The pre-fix instance `0x5d27a9aC4bC4b63BE9939bD386c4f198B7308D67` has
  bytecode, is still an authorized releaser, and is the contract the
  recorded Vault withdrawal in `docs/DEMO.md` actually called.

Likely cause: `forge script --broadcast` broadcasts nothing if any call
in `run()` reverts during simulation. The script's own comment records
that its `setAuthorizedReleaser` call reverted (the deployer key isn't
the LendingAdapter owner), so the `new LedgerLineVaultAdapter` was only
simulated and its console-logged address was never deployed.

**Live WITHDRAW consumer:** the pre-fix instance above. It gates on
`canExecute(..., Action.WITHDRAW, ...)` but does **not** check
outstanding `LendingAdapter` debt. To fix: deploy the current
`LedgerLineVaultAdapter` for real, authorize it with the LendingAdapter
owner key, revoke `0x5d27…8D67`'s releaser authorization, and point
`sdk/src/addresses.ts` / `NEXT_PUBLIC_VAULT_ADAPTER_ADDRESS` at it.

| Contract | Address | Status |
|---|---|---|
| `LedgerLineVaultAdapter` (intended debt-safe redeploy) | `0x0F705a7473461C1eF4148bC3D813E1ab15EC93ac` | **No code on chain.** Authorized as a releaser anyway; do not use |

`LedgerLineTransferAdapter` was deployed fresh (not a redeploy of an
earlier instance — TRANSFER never had a consumer before) by
`contracts/script/DeployTransferAdapter.s.sol`, LedgerLine's third
reference consumer proving `Action.TRANSFER`. Unlike
`RedeployVaultAdapter.s.sol`, this script's `setAuthorizedReleaser`
call ran successfully in the same `forge script --broadcast` session
as the deploy itself (both transactions are in the broadcast log
above) — no separate `cast send` was needed here.

`RobinhoodStockTokenAdapter` was redeployed at the address above by
`contracts/script/RedeployStockAdapter.s.sol` after commit `d1a289a`
made `sequencerCheckEnabled` a real, working toggle (default `false`)
— the original V2 instance's `getAssetState()` reverted
unconditionally because it unconditionally called `_checkSequencerUp()`
against a zero-address sequencer feed (no real one exists for this
chain). Verified directly: constructing the adapter with the exact
constructor arguments from this deployment's broadcast log and calling
`getAssetState()` now returns a valid `AssetState` instead of
reverting (see `docs/SECURITY.md`).

| Contract | Old address | Status |
|---|---|---|
| `RobinhoodStockTokenAdapter` (pre-fix) | `0x9aE01a29Ec6774CAb63C6491F8f7D6b3866D1c2f` | Abandoned — `getAssetState()` reverts unconditionally on this instance; do not use |

Both `RobinhoodStockTokenAdapter` instances and `MockChainlinkFeed` are
real, live contracts, but neither is wired into the live Registry-read
decision path — see `docs/INTEGRATIONS.md`.

## Real assets

| Token | Address | Decimals | Role |
|---|---|---|---|
| TSLA (real Robinhood Stock Token) | `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` | 18 | Collateral |
| USDG ("Global Dollar") | `0x7E955252E15c84f5768B83c41a71F9eba181802F` | 6 | Borrow asset |

## Configuration at deploy time

- `assetId = 1` (the only configured asset)
- Seed price: `$364.27` (`36427000000` at 8 decimals, scaled to
  `364270000000000000000` at 18 decimals) — an owner-set reference
  value, not a live oracle read; see `docs/INTEGRATIONS.md`.
- `collateralFactorBps = 7000` (70%)
- `riskAdjustmentBps = 8000` (80%)
- `Registry.positionWriter` = `LedgerLineLendingAdapter`
- `LedgerLineLendingAdapter.isAuthorizedReleaser[VaultAdapter] = true`

## Stylus engines (PositionEngine / RiskEngine)

Deployed via `cargo stylus deploy`, outside Foundry's broadcast
mechanism, so no broadcast artifact in this repo records them.
`DeployTestnetRealV2.s.sol` takes them as `POSITION_ENGINE_ADDRESS` /
`RISK_ENGINE_ADDRESS`. Read live from the deployed `LedgerLinePolicy`
(`positionEngine()` / `riskEngine()`) on 2026-09-24; both have bytecode:

| Contract | Address |
|---|---|
| `PositionEngine` (Stylus) | `0xde8365dAF3CFdF952E2F946F19a4DcAcd57eFf0F` |
| `RiskEngine` (Stylus) | `0xf661dA9D3f214A181014Bc7ba8590B90F9314eC4` |

## Abandoned V1 deployment

`DeployTestnetRealV2.s.sol`'s own header comment discloses this
directly: the V1 stack predates `LendingAdapter.setAuthorizedReleaser`
/ `releaseCollateral` support and could not be retrofitted for
`VaultAdapter` without a storage-layout change, so V2 redeploys the
entire stack atomically instead of patching around it.

| Contract | V1 address | Status |
|---|---|---|
| `LedgerLineRegistry` | `0x58202CfE6F8e6Eb9544B62542eeE8Cdb8DBd6aff` | Abandoned |
| `LedgerLinePolicy` | `0x3AaB9D02bED0850E0d991C886e8212d1c03c03B9` | Abandoned |
| `LedgerLineLendingAdapter` | `0x598e3884657c8eF4870381E4c1Cc4e8e2D0dbcB7` | Abandoned — **1 real TSLA is permanently stranded here** |

`contracts/script/DeployVaultAdapter.s.sol` targets these V1 addresses
and is superseded by `DeployTestnetRealV2.s.sol`; it is left in the
repo as a record of what was tried, not as a script to run again.

## Local development deployment

`contracts/script/DeployDevnode.s.sol` deploys a full mock stack
(`MockStockToken`, `MockBorrowToken` in place of real TSLA/USDG)
against an Arbitrum Nitro dev-mode chain, chain ID **412346**
(`frontend/lib/chains.ts`'s `nitroDevnode`, confirmed live from the
actual `nitro-devnode` startup log). This is for local iteration only
and is not a judged deployment.

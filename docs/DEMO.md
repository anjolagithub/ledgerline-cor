# Demo Walkthrough

A judge-facing walkthrough of five core flows, run against the live
V2 deployment on Robinhood Chain testnet (`docs/DEPLOYMENTS.md`)
through the frontend's Policy Console (`/app`) and Activity log
(`/app/activity`).

> **Status of the hashes below:** Deposit, ALLOW borrow, and Vault
> withdrawal each have a real transaction hash from actually
> performing that action through the live frontend with a real
> wallet — none are fabricated. The LIMIT borrow step and the Transfer
> debt-safety step have **no hash at all, by design**, not because
> they're still pending: see each section for why. No successful
> (non-blocked) Transfer hash exists yet either — stated plainly below
> rather than filled with a placeholder.

Every hash links to Robinhood Chain testnet's explorer:
`https://explorer.testnet.chain.robinhood.com/tx/<hash>`.

## Prerequisites

- A wallet connected to Robinhood Chain testnet (chain ID 46630) with
  a small ETH balance for gas.
- A real TSLA balance (the live collateral token,
  `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`).
- The `LedgerLineLendingAdapter`
  (`0x39E0d1F2877c69F1a617a86d4Bd4F8B3f2493C97`) needs to already hold
  real USDG liquidity to pay out borrows — funded once from the Paxos
  testnet faucet per `docs/INTEGRATIONS.md`.

## 1. TSLA deposit

On the Policy Console, enter an amount of TSLA in the Deposit form and
approve, then deposit. This is a real `safeTransferFrom` of TSLA into
`LedgerLineLendingAdapter`, followed by `Registry.setPosition`
recording the new raw balance. The `Deposited` event appears
immediately in the Activity log.

- Explorer: `https://explorer.testnet.chain.robinhood.com/tx/0x271b0e52fc14b757e0b22259caea2ec2cf4dc3db365fc98fa7af009ad687f8fe`

## 2. ALLOW borrow

With a deposited position, request a USDG amount within the position's
effective capacity (Position Value × 70% collateral factor × 80% risk
adjustment, shown live in the Policy Evaluation panel). `canExecute`
returns `ALLOW`; `LendingAdapter.borrow()` succeeds, `debt` is updated,
and real USDG (6-decimal, correctly scaled from the 18-decimal
request — see `docs/INTEGRATIONS.md`) is transferred to the wallet.
The `Borrowed` event appears in the Activity log.

- Explorer: `https://explorer.testnet.chain.robinhood.com/tx/0xf0b1e5553f58d6ba1cfe6782d4b386a76e0d54167e5ae6dbb7cb9dbb7127540c`

## 3. LIMIT / reverted borrow

Request a USDG amount that exceeds the position's effective capacity.
`canExecute` returns `LIMIT` — LedgerLine never silently clamps a
request — and the Policy Console shows the verdict and the actual
maximum permitted amount before you'd even submit a transaction.

**No hash exists for this step, by design, not because it's pending.**
`BorrowForm` disables the submit button entirely whenever the
evaluated decision isn't `ALLOW` (it reads "Preview only -- adjust
amount"), so through the actual live frontend this request never
reaches `writeContract` at all — it is never signed, never submitted,
and never broadcast. (A raw, direct `LendingAdapter.borrow()` call
bypassing the frontend would still revert with `ExceedsPermittedAmount`
and would get a real, minable hash showing "Failed" on the explorer —
but that is not what this judge-facing walkthrough demonstrates.) As
`frontend/lib/activity.ts` notes explicitly, a reverted transaction
would leave no onchain event either way — the Activity log correctly
shows nothing for this step, which is itself the point.

## 4. Vault withdrawal

On the same position, withdraw TSLA via the Withdraw form. This calls
`LedgerLineVaultAdapter.withdraw()`, which makes its own independent
`canExecute(..., Action.WITHDRAW, ...)` call — evaluated purely on
lifecycle state (`ACTIVE`), not borrowing capacity, per
`docs/POLICY.md` — and on `ALLOW` calls
`LendingAdapter.releaseCollateral()` to transfer TSLA back to the
wallet and update the shared Registry position. The `Withdrawn` event
appears in the Activity log. Note (see `docs/SECURITY.md`): this
succeeds regardless of any outstanding USDG debt from step 2 — that is
documented, tested behavior, not a bug in this walkthrough.

- Explorer: `https://explorer.testnet.chain.robinhood.com/tx/0xfbb0095b7dcf6a17c9f324879bf082a04c36db53e24d9e8b0fc33080f4c0bdf3`

## 5. Transfer blocked by outstanding debt

With an outstanding USDG debt on the position (from step 2), attempt
a `TransferAdapter.transfer(to, amount)`
(`0xc5Af6A4a36b6e1b2B22D03b18bBA9FEA6D456943`) for any amount. Per
`docs/POLICY.md`/`docs/SECURITY.md`, `Action.TRANSFER` is
lifecycle-gated only through `canExecute` — same as WITHDRAW — but
`TransferAdapter` itself independently checks
`LendingAdapter.debt(msg.sender)` and blocks the transfer outright if
that debt is anything above zero, regardless of the amount requested
or the position's actual size. This is a stricter rule than
`VaultAdapter`'s (which only requires *remaining* capacity to still
cover debt): collateral changing owners invalidates whatever LTV math
applied to the original owner's debt, so there is nothing to
recompute.

Confirmed live two ways:

- **Direct `cast send`** against `TransferAdapter` from an account
  carrying $22 of outstanding debt reverted with
  `OutstandingDebtBlocksTransfer(22000000000000000000)` — correctly
  blocked.
- **Live UI**: the Transfer panel on the Policy Console showed
  "Outstanding debt blocks transfer -- repay first" and the submit
  button was disabled, matching `TransferAdapter.sol`'s check exactly
  (see `frontend/components/TransferForm.tsx`).

**No hash exists for this step, by design** — same reasoning as step
3: a call that reverts is never actually broadcast (a `cast send`
against a call Foundry/the RPC estimates will revert fails at gas
estimation and never gets mined; the live UI's disabled submit button
prevents `writeContract` from ever being called at all). **No
successful (non-blocked) transfer hash exists yet either** — that
would require a wallet with zero debt actually performing a transfer,
which hasn't been done through the live frontend as of this writing.
Stated here plainly rather than filled with a fabricated hash.

- Explorer: n/a — no transaction was ever broadcast for this step.

## Verifying independently

Every contract address referenced above is listed in
`docs/DEPLOYMENTS.md`. Any transaction hash placed into this document
can be independently checked against
`https://explorer.testnet.chain.robinhood.com/tx/<hash>`, and the
`/app/activity` page reads the same events directly from these
contracts' logs — it does not maintain its own separate record.

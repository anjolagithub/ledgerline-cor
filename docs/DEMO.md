# Demo Walkthrough

A judge-facing walkthrough of the four core flows, run against the
live V2 deployment on Robinhood Chain testnet (`docs/DEPLOYMENTS.md`)
through the frontend's Policy Console (`/app`) and Activity log
(`/app/activity`).

> **Transaction hashes below are placeholders.** They can only come
> from actually performing each action through the live frontend with
> a real wallet — they don't exist anywhere in this repository (Foundry
> broadcast files only record *deployment* transactions, not user
> interactions), and none are fabricated here. Replace each
> `<TX_HASH_...>` placeholder with the real hash after performing that
> action against the current V2 addresses, then this document is
> accurate rather than illustrative.

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

- Explorer: `https://explorer.testnet.chain.robinhood.com/tx/<TX_HASH_DEPOSIT>`

## 2. ALLOW borrow

With a deposited position, request a USDG amount within the position's
effective capacity (Position Value × 70% collateral factor × 80% risk
adjustment, shown live in the Policy Evaluation panel). `canExecute`
returns `ALLOW`; `LendingAdapter.borrow()` succeeds, `debt` is updated,
and real USDG (6-decimal, correctly scaled from the 18-decimal
request — see `docs/INTEGRATIONS.md`) is transferred to the wallet.
The `Borrowed` event appears in the Activity log.

- Explorer: `https://explorer.testnet.chain.robinhood.com/tx/<TX_HASH_BORROW_ALLOW>`

## 3. LIMIT / reverted borrow

Request a USDG amount that exceeds the position's effective capacity.
`canExecute` returns `LIMIT` — LedgerLine never silently clamps a
request — and the Policy Console shows the verdict and the actual
maximum permitted amount before you'd even submit a transaction. If
submitted anyway, `LendingAdapter.borrow()` reverts with
`ExceedsPermittedAmount`. As `frontend/lib/activity.ts` notes
explicitly: a reverted transaction leaves **no onchain event** — the
Activity log correctly shows nothing for this step, which is itself
the point (only successful actions are ever recorded onchain).

- Explorer: `https://explorer.testnet.chain.robinhood.com/tx/<TX_HASH_BORROW_LIMIT_REVERTED>`
  (a reverted transaction still has a real hash and appears on the
  explorer as "Failed" — it just emits no `Borrowed` event)

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

- Explorer: `https://explorer.testnet.chain.robinhood.com/tx/<TX_HASH_WITHDRAW>`

## Verifying independently

Every contract address referenced above is listed in
`docs/DEPLOYMENTS.md`. Any transaction hash placed into this document
can be independently checked against
`https://explorer.testnet.chain.robinhood.com/tx/<hash>`, and the
`/app/activity` page reads the same events directly from these
contracts' logs — it does not maintain its own separate record.

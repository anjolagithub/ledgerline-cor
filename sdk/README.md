# CortexRails Protocol SDK (@ledgerline/core)

A thin, typed viem client (`LedgerLineClient`) over CortexRails' underlying
LedgerLine Registry, Policy, LendingAdapter, VaultAdapter, and TransferAdapter
contracts on Robinhood Chain testnet. Defaults to the real V2 deployment
addresses in `src/addresses.ts`.

```
npm install
npm run build
```

See `src/client.ts` for the full read/write surface and its documented
amount and confirmation conventions.


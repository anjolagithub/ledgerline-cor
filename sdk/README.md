# LedgerLine Core SDK (@ledgerline/core)

A thin, typed viem client (`LedgerLineClient`) over LedgerLine's deployed
Registry, Policy, LendingAdapter, and VaultAdapter contracts on Robinhood
Chain testnet. Defaults to the real V2 deployment addresses in `src/addresses.ts`.

```
npm install
npm run build
```

See `src/client.ts` for the full read/write surface and its documented
amount and confirmation conventions.


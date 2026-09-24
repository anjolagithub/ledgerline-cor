# CortexRails Protocol SDK (`@ledgerline/core`)

TypeScript SDK for CortexRails Protocol, the policy layer between intent
and financial execution. A typed viem client (`LedgerLineClient`) over
the deployed Registry, Policy, LendingAdapter, VaultAdapter, and
TransferAdapter contracts on Robinhood Chain testnet, plus a thin
agent-intent layer. Defaults to the testnet addresses in
`src/addresses.ts`. Not yet published to npm; build it from this
directory.

```
npm install
npm run build
npm test
```

## Policy reads

```ts
import { LedgerLineClient, Action } from "@ledgerline/core";

const client = new LedgerLineClient({ rpcUrl: "https://rpc.testnet.chain.robinhood.com" });
const positionId = LedgerLineClient.positionIdFromAddress(wallet);
const response = await client.canExecute(positionId, Action.BORROW, 120_000n * 10n ** 18n);
// { decision, permittedAmount, reason }. Amounts are 18-decimal internal units.
```

## Agent intents

`evaluateAgentIntent` resolves a structured intent into the same
`canExecute()` call and decodes the result to human units. It does no
risk math of its own.

```ts
import { evaluateAgentIntent, suggestRetryIntent } from "@ledgerline/core";

const intent = { asset: "TSLA", positionId: wallet, action: "BORROW" as const, amount: "120000" };
const result = await evaluateAgentIntent(client, intent);
// { decision: "LIMIT", requestedAmount: "120000", permittedAmount: "112000", reason: "EXCEEDS_CAPACITY", ... }
const retry = suggestRetryIntent(intent, result); // only defined when decision === "LIMIT"
```

Supported agent actions: `BORROW`, `WITHDRAW`, `TRANSFER`. Supported
asset: `TSLA` (the one asset this deployment configures).

See `src/client.ts` for the full read/write surface and its documented
amount and confirmation conventions.

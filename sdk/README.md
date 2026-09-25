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

Supported agent actions: `BORROW`, `WITHDRAW`, `TRANSFER`. Seeded with
one known asset, `TSLA` -- the one this deployment currently has
configured on the Registry (see `registerAgentAsset` below for what
that does and doesn't mean).

See `src/client.ts` for the full read/write surface and its documented
amount and confirmation conventions.

## Multi-asset: what's real today, and what a second asset needs

`Policy.canExecute`, `LedgerLineRegistry`, and every adapter's write
path already take `assetId` as a real onchain parameter -- the
contracts are not hardcoded to one asset. `KNOWN_AGENT_ASSETS` is this
SDK's local, offchain symbol -> assetId display lookup, and it's
seeded with only `TSLA: 1n` because that's the only asset this
deployment's Registry owner has actually configured onchain so far.

```ts
import { registerAgentAsset, evaluateAgentIntent } from "@ledgerline/core";

// Once a second asset is configured on the deployed Registry (an
// onlyOwner call this SDK does not and cannot make on your behalf --
// see LedgerLineRegistry.sol), teach this SDK's local lookup about it:
registerAgentAsset("AAPL", 2n);

const result = await evaluateAgentIntent(client, {
  asset: "AAPL",
  positionId: wallet,
  action: "BORROW",
  amount: "50000",
});
// Resolves to a real canExecute(assetId=2n, ...) call -- same code path as TSLA, no special-casing.
```

`sdk/test/agent.test.ts` exercises this end-to-end against assetId `2n`
to prove the intent layer generalizes, without claiming a second asset
is actually live on testnet -- it isn't, and this SDK won't fabricate
that it is. Configuring one is a real onchain admin action outside
this SDK's scope.

## Coinbase AgentKit integration

`@ledgerline/core/agentkit` exports a real [AgentKit](https://github.com/coinbase/agentkit)
`ActionProvider` -- `cortexRailsActionProvider()` -- built against
AgentKit's actual published `ActionProvider`/`@CreateAction` interface,
not a hand-rolled imitation of it. It is CortexRails' second real
consumer of `evaluateAgentIntent()`, alongside this SDK's own direct
usage and the CortexRails frontend.

```ts
import { AgentKit } from "@coinbase/agentkit";
import { cortexRailsActionProvider } from "@ledgerline/core/agentkit";

const agentKit = await AgentKit.from({
  walletProvider, // any EvmWalletProvider -- AgentKit's own custody/signing infra
  actionProviders: [cortexRailsActionProvider()],
});
```

This gives an AgentKit-driven agent four actions: `check_policy` (a
read-only pre-check), and `borrow`/`withdraw`/`transfer`, each of which
calls the real `Policy.canExecute()` BEFORE submitting a transaction
and refuses outright (no tx sent) on `BLOCK` or `REVIEW` -- `REVIEW` is
deliberately not auto-executed, matching the CortexRails frontend's own
"Reserved" treatment of it. On `LIMIT`, the submitted amount is the
real `permittedAmount`, not the originally requested one.

This action provider does not replace AgentKit's wallet-level controls
(spend limits, session keys, custody) -- it sits downstream of them:
AgentKit decides whether its wallet will sign at all, CortexRails
decides whether this specific action on this specific RWA position
should be attempted. See `sdk/src/integrations/agentkit.ts` for the
full implementation and `sdk/test/agentkit.test.ts` for its test
coverage (9 tests, run against the compiled build -- see the note at
the top of that file for why).

**Requires `@coinbase/agentkit` and `zod`** as peer dependencies
(`peerDependenciesMeta` marks both optional -- only needed if you
import `@ledgerline/core/agentkit`). Not yet exercised against a real
AgentKit wallet/agent loop end-to-end -- that needs a live AgentKit
account and API key this SDK's own test environment doesn't have; the
test suite verifies the pre-check and transaction-building logic
directly instead of through a live AgentKit runtime.

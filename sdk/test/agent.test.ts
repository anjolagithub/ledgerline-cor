import { test } from "node:test";
import assert from "node:assert/strict";
import { stringToHex } from "viem";
import {
  evaluateAgentIntent,
  suggestRetryIntent,
  registerAgentAsset,
  KNOWN_AGENT_ASSETS,
  UnknownAgentAssetError,
  type AgentIntent,
  type AgentPolicyClient,
} from "../src/agent";
import { Action, Decision, type PolicyResponse } from "../src/types";

const ONE = 1_000_000_000_000_000_000n;
const WALLET = "0x00000000000000000000000000000000000042" as const;

/// A stub satisfying AgentPolicyClient -- records exactly the args it was
/// called with, so tests can assert evaluateAgentIntent performed no
/// alternate math beyond unit/enum conversion, and returns a canned
/// PolicyResponse to verify the mapping back is lossless.
function stubClient(response: PolicyResponse): AgentPolicyClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async canExecute(positionId, action, amount, assetId) {
      calls.push([positionId, action, amount, assetId]);
      return response;
    },
  };
}

test("evaluateAgentIntent calls canExecute with exactly the resolved args, no alternate math", async () => {
  const client = stubClient({ decision: Decision.ALLOW, permittedAmount: 112_000n * ONE, reason: stringToHex("OK", { size: 32 }) });
  const intent: AgentIntent = { asset: "TSLA", positionId: 1n, action: "BORROW", amount: "100000" };

  await evaluateAgentIntent(client, intent);

  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0], [1n, Action.BORROW, 100_000n * ONE, KNOWN_AGENT_ASSETS.TSLA]);
});

test("evaluateAgentIntent resolves a wallet address positionId the same way LedgerLineClient does", async () => {
  const client = stubClient({ decision: Decision.ALLOW, permittedAmount: 0n, reason: stringToHex("OK", { size: 32 }) });
  const intent: AgentIntent = { asset: "TSLA", positionId: WALLET, action: "WITHDRAW", amount: "1" };

  await evaluateAgentIntent(client, intent);

  assert.equal(client.calls[0][0], BigInt(WALLET));
});

test("evaluateAgentIntent maps a LIMIT PolicyResponse losslessly, keeping the real reason constant", async () => {
  const client = stubClient({
    decision: Decision.LIMIT,
    permittedAmount: 112_000n * ONE,
    reason: stringToHex("EXCEEDS_CAPACITY", { size: 32 }),
  });
  const intent: AgentIntent = { asset: "TSLA", positionId: 1n, action: "BORROW", amount: "120000" };

  const result = await evaluateAgentIntent(client, intent);

  assert.equal(result.decision, "LIMIT");
  assert.equal(result.requestedAmount, "120000");
  assert.equal(result.permittedAmount, "112000");
  assert.equal(result.reason, "EXCEEDS_CAPACITY"); // real constant, not the paraphrase "CAPACITY_EXCEEDED"
  assert.equal(result.raw.decision, Decision.LIMIT);
});

test("evaluateAgentIntent rejects an unknown asset without guessing", async () => {
  const client = stubClient({ decision: Decision.BLOCK, permittedAmount: 0n, reason: stringToHex("OK", { size: 32 }) });
  const intent: AgentIntent = { asset: "AAPL", positionId: 1n, action: "BORROW", amount: "1" };

  await assert.rejects(() => evaluateAgentIntent(client, intent), UnknownAgentAssetError);
  assert.equal(client.calls.length, 0);
});

test("suggestRetryIntent returns an amount-adjusted intent only on LIMIT", async () => {
  const intent: AgentIntent = { asset: "TSLA", positionId: 1n, action: "BORROW", amount: "120000" };

  const limitResult = await evaluateAgentIntent(
    stubClient({ decision: Decision.LIMIT, permittedAmount: 112_000n * ONE, reason: stringToHex("EXCEEDS_CAPACITY", { size: 32 }) }),
    intent
  );
  const retry = suggestRetryIntent(intent, limitResult);
  assert.deepEqual(retry, { ...intent, amount: "112000" });

  const allowResult = await evaluateAgentIntent(
    stubClient({ decision: Decision.ALLOW, permittedAmount: 120_000n * ONE, reason: stringToHex("OK", { size: 32 }) }),
    intent
  );
  assert.equal(suggestRetryIntent(intent, allowResult), undefined);
});

test("registerAgentAsset lets evaluateAgentIntent resolve a SECOND assetId end-to-end -- proves the intent " +
     "layer is not hardcoded to TSLA/assetId 1, only seeded with it", async () => {
  registerAgentAsset("AAPL", 2n);
  const client = stubClient({ decision: Decision.ALLOW, permittedAmount: 50_000n * ONE, reason: stringToHex("OK", { size: 32 }) });
  const intent: AgentIntent = { asset: "AAPL", positionId: 7n, action: "BORROW", amount: "50000" };

  const result = await evaluateAgentIntent(client, intent);

  assert.deepEqual(client.calls[0], [7n, Action.BORROW, 50_000n * ONE, 2n]);
  assert.equal(result.assetId, 2n);
  assert.equal(result.decision, "ALLOW");
});

test("registerAgentAsset refuses to silently redefine an already-registered symbol to a different assetId", () => {
  assert.throws(() => registerAgentAsset("TSLA", 99n), /already registered as assetId 1/);
  // Re-registering the SAME assetId is a no-op, not an error.
  registerAgentAsset("TSLA", KNOWN_AGENT_ASSETS.TSLA);
  assert.equal(KNOWN_AGENT_ASSETS.TSLA, 1n);
});

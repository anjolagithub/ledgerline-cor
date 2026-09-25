import { test } from "node:test";
import assert from "node:assert/strict";
import { stringToHex, type Address, type PublicClient } from "viem";
import type { EvmWalletProvider } from "@coinbase/agentkit";
import { Decision, type PolicyResponse } from "../src/types";
import { ROBINHOOD_TESTNET_ADDRESSES } from "../src/addresses";

/// NOTE: imported from the COMPILED output (../dist), not ../src, unlike
/// every other test file in this suite. `@CreateAction`'s validation
/// reads TypeScript's `design:paramtypes` decorator metadata, which only
/// a real `tsc` build emits -- `tsx`'s esbuild-based transpilation (used
/// to run every other *.test.ts directly against source) does not
/// support `emitDecoratorMetadata` and throws before a single test runs.
/// Run `npm run build` before `npm test` for this file to pick up
/// changes to src/integrations/agentkit.ts.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CortexRailsActionProvider } = require("../dist/integrations/agentkit") as typeof import("../src/integrations/agentkit");

const ONE = 1_000_000_000_000_000_000n;
const WALLET = "0x000000000000000000000000000000000000dEaD" as Address;

/// A minimal EvmWalletProvider stub -- just enough surface for
/// CortexRailsActionProvider to call, with no real network or signing.
/// `readContract` answers exactly like Policy.canExecute would, driven
/// by the canned `policyResponse`; `sendTransaction` records every call
/// instead of submitting anything, so tests can assert whether (and
/// what) this action provider tried to send.
function stubWalletProvider(policyResponse: PolicyResponse): EvmWalletProvider & {
  sentTransactions: { to: Address; data: `0x${string}` }[];
} {
  const sentTransactions: { to: Address; data: `0x${string}` }[] = [];

  const publicClient = {
    readContract: async () => policyResponse,
  } as unknown as PublicClient;

  return {
    sentTransactions,
    getAddress: () => WALLET,
    getNetwork: () => ({ protocolFamily: "evm", networkId: "robinhood-testnet", chainId: "46630" }),
    getName: () => "stub",
    getPublicClient: () => publicClient,
    sendTransaction: async (tx: { to: Address; data: `0x${string}` }) => {
      sentTransactions.push({ to: tx.to, data: tx.data });
      return "0xfeed000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    },
    // Unused by this action provider, but required by the abstract class.
    getBalance: async () => 0n,
    nativeTransfer: async () => "0x00" as `0x${string}`,
    sign: async () => "0x00" as `0x${string}`,
    signMessage: async () => "0x00" as `0x${string}`,
    signTypedData: async () => "0x00" as `0x${string}`,
    signTransaction: async () => "0x00" as `0x${string}`,
    waitForTransactionReceipt: async () => ({}),
    toSigner: () => ({}) as never,
  } as unknown as EvmWalletProvider & { sentTransactions: { to: Address; data: `0x${string}` }[] };
}

test("check_policy reports ALLOW without sending a transaction", async () => {
  const provider = new CortexRailsActionProvider();
  const wallet = stubWalletProvider({ decision: Decision.ALLOW, permittedAmount: 120_000n * ONE, reason: stringToHex("OK", { size: 32 }) });

  const result = await provider.checkPolicy(wallet, { asset: "TSLA", action: "BORROW", amount: "120000" });

  assert.match(result, /ALLOW/);
  assert.match(result, /reason: OK/);
  assert.equal(wallet.sentTransactions.length, 0);
});

test("check_policy on LIMIT reports the real permitted amount and tells the agent to retry with it", async () => {
  const provider = new CortexRailsActionProvider();
  const wallet = stubWalletProvider({
    decision: Decision.LIMIT,
    permittedAmount: 112_000n * ONE,
    reason: stringToHex("EXCEEDS_CAPACITY", { size: 32 }),
  });

  const result = await provider.checkPolicy(wallet, { asset: "TSLA", action: "BORROW", amount: "120000" });

  assert.match(result, /LIMIT/);
  assert.match(result, /112000/);
  assert.match(result, /retry with that amount/);
});

test("borrow refuses and sends no transaction on BLOCK", async () => {
  const provider = new CortexRailsActionProvider();
  const wallet = stubWalletProvider({ decision: Decision.BLOCK, permittedAmount: 0n, reason: stringToHex("SUSPENDED", { size: 32 }) });

  const result = await provider.borrow(wallet, { amount: "50000" });

  assert.match(result, /Refused/);
  assert.match(result, /SUSPENDED/);
  assert.equal(wallet.sentTransactions.length, 0);
});

test("borrow refuses and sends no transaction on REVIEW -- not auto-executed, same as the frontend's 'Reserved' state", async () => {
  const provider = new CortexRailsActionProvider();
  const wallet = stubWalletProvider({ decision: Decision.REVIEW, permittedAmount: 50_000n * ONE, reason: stringToHex("FLAGGED", { size: 32 }) });

  const result = await provider.borrow(wallet, { amount: "50000" });

  assert.match(result, /Refused/);
  assert.equal(wallet.sentTransactions.length, 0);
});

test("borrow on ALLOW submits a real borrow() call to LendingAdapter for the requested amount", async () => {
  const provider = new CortexRailsActionProvider();
  const wallet = stubWalletProvider({ decision: Decision.ALLOW, permittedAmount: 120_000n * ONE, reason: stringToHex("OK", { size: 32 }) });

  const result = await provider.borrow(wallet, { amount: "120000" });

  assert.equal(wallet.sentTransactions.length, 1);
  assert.equal(wallet.sentTransactions[0].to, ROBINHOOD_TESTNET_ADDRESSES.lendingAdapter);
  assert.match(result, /Submitted borrow\(120000\)/);
  assert.match(result, /0xfeed/);
});

test("borrow on LIMIT submits the permitted amount, not the requested amount", async () => {
  const provider = new CortexRailsActionProvider();
  const wallet = stubWalletProvider({
    decision: Decision.LIMIT,
    permittedAmount: 112_000n * ONE,
    reason: stringToHex("EXCEEDS_CAPACITY", { size: 32 }),
  });

  const result = await provider.borrow(wallet, { amount: "120000" });

  assert.equal(wallet.sentTransactions.length, 1);
  assert.match(result, /Submitted borrow\(112000\)/);
  assert.match(result, /limited this to 112000/);
});

test("withdraw refuses on BLOCK and submits to VaultAdapter on ALLOW", async () => {
  const provider = new CortexRailsActionProvider();

  const blocked = stubWalletProvider({ decision: Decision.BLOCK, permittedAmount: 0n, reason: stringToHex("SUSPENDED", { size: 32 }) });
  const blockedResult = await provider.withdraw(blocked, { amount: "10" });
  assert.match(blockedResult, /Refused/);
  assert.equal(blocked.sentTransactions.length, 0);

  const allowed = stubWalletProvider({ decision: Decision.ALLOW, permittedAmount: 10n * ONE, reason: stringToHex("OK", { size: 32 }) });
  const allowedResult = await provider.withdraw(allowed, { amount: "10" });
  assert.equal(allowed.sentTransactions.length, 1);
  assert.equal(allowed.sentTransactions[0].to, ROBINHOOD_TESTNET_ADDRESSES.vaultAdapter);
  assert.match(allowedResult, /Submitted withdraw\(10\)/);
});

test("transfer refuses on BLOCK (e.g. outstanding debt) and submits to TransferAdapter on ALLOW", async () => {
  const provider = new CortexRailsActionProvider();
  const to = "0x00000000000000000000000000000000000000ef" as Address;

  const blocked = stubWalletProvider({ decision: Decision.BLOCK, permittedAmount: 0n, reason: stringToHex("OUTSTANDING_DEBT", { size: 32 }) });
  const blockedResult = await provider.transfer(blocked, { to, amount: "5" });
  assert.match(blockedResult, /Refused/);
  assert.equal(blocked.sentTransactions.length, 0);

  const allowed = stubWalletProvider({ decision: Decision.ALLOW, permittedAmount: 5n * ONE, reason: stringToHex("OK", { size: 32 }) });
  const allowedResult = await provider.transfer(allowed, { to, amount: "5" });
  assert.equal(allowed.sentTransactions.length, 1);
  assert.equal(allowed.sentTransactions[0].to, ROBINHOOD_TESTNET_ADDRESSES.transferAdapter);
  // Output is EIP-55 checksummed regardless of the input's casing -- see the
  // getAddress() comment in transfer() -- so this asserts the checksummed form.
  assert.match(allowedResult, /Submitted transfer\(0x00000000000000000000000000000000000000EF, 5\)/);
});

test("supportsNetwork is true for any evm-family network, matching how AgentKit's own action providers gate by protocol family", () => {
  const provider = new CortexRailsActionProvider();
  assert.equal(provider.supportsNetwork({ protocolFamily: "evm", networkId: "robinhood-testnet" } as never), true);
  assert.equal(provider.supportsNetwork({ protocolFamily: "svm", networkId: "solana-devnet" } as never), false);
});

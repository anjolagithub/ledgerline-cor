/// Oracle-sync hook -- DRY-RUN BY DEFAULT.
///
/// Reads a MOCK price feed (scripts/oracle-sync/mock-feed.json, not a real
/// oracle) and the live Registry's current asset state (read-only), then
/// prints whether a >10% price deviation or a compliance flag WOULD move
/// the asset to SUSPENDED / RESTRICTED, and exactly which call it would make.
///
/// It sends nothing unless ALL of these hold:
///   --execute is passed, ORACLE_SYNC_PRIVATE_KEY is set, it runs in an
///   interactive terminal, the key is the Registry owner, the transition is
///   still valid onchain against unchanged state, and you type the target
///   state name to confirm.
/// It never calls updateAssetParameters in any mode. Do not wire this into
/// CI, cron, or anything else that runs unattended.
///
/// Usage (from sdk/):
///   npm run oracle-sync                             # dry run, mock feed as-is
///   npm run oracle-sync -- --feed-price 300         # dry run, simulate a 17.6% drop
///   npm run oracle-sync -- --compliance-flag        # dry run, simulate a compliance flag

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { createWalletClient, formatUnits, http, parseUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LedgerLineRegistryAbi } from "../src/abi";
import { robinhoodChainTestnet } from "../src/chain";
import { LedgerLineClient } from "../src/client";
import { LifecycleState } from "../src/types";
import {
  DEFAULT_MAX_DEVIATION_BPS,
  DEFAULT_MAX_STALENESS_SEC,
  decideLifecycleAction,
  executionBlockers,
} from "./oracle-sync/decide";

const DEFAULT_RPC_URL = "https://rpc.testnet.chain.robinhood.com";

type MockFeed = { asset: string; price: string; updatedAt: number | "now"; complianceFlag: boolean };

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      execute: { type: "boolean", default: false },
      feed: { type: "string", default: resolve(__dirname, "oracle-sync/mock-feed.json") },
      "feed-price": { type: "string" },
      "compliance-flag": { type: "boolean", default: false },
      "asset-id": { type: "string", default: "1" },
      "rpc-url": { type: "string", default: process.env.ORACLE_SYNC_RPC_URL ?? DEFAULT_RPC_URL },
      "max-deviation-bps": { type: "string", default: DEFAULT_MAX_DEVIATION_BPS.toString() },
      "max-staleness-sec": { type: "string", default: String(DEFAULT_MAX_STALENESS_SEC) },
    },
  });

  const now = Math.floor(Date.now() / 1000);
  const feed = JSON.parse(readFileSync(values.feed!, "utf8")) as MockFeed;
  const feedPrice = parseUnits(values["feed-price"] ?? feed.price, 18);
  const feedUpdatedAt = feed.updatedAt === "now" ? now : feed.updatedAt;
  const complianceFlag = values["compliance-flag"] || feed.complianceFlag;
  const assetId = BigInt(values["asset-id"]!);
  const rpcUrl = values["rpc-url"]!;

  // Read-only: current Registry state.
  const client = new LedgerLineClient({ rpcUrl, assetId });
  const registry = client.addresses.registry;
  const state = await client.getAssetState(assetId);
  const current = Number(state.lifecycle) as LifecycleState;

  const decision = decideLifecycleAction({
    referencePrice: state.price,
    feedPrice,
    feedUpdatedAt,
    now,
    complianceFlag,
    currentLifecycle: current,
    maxDeviationBps: BigInt(values["max-deviation-bps"]!),
    maxStalenessSec: Number(values["max-staleness-sec"]),
  });

  console.log("CortexRails oracle-sync (mock feed)");
  console.log(`  Registry           ${registry} (asset ${assetId}, chain ${robinhoodChainTestnet.id})`);
  console.log(`  Registry price     $${formatUnits(state.price, 18)}  lifecycle ${LifecycleState[current]}`);
  console.log(`  Feed price         $${formatUnits(feedPrice, 18)}  compliance flag ${complianceFlag}  age ${now - feedUpdatedAt}s`);
  console.log(`  Decision           ${decision.action}${"why" in decision ? ` -- ${decision.why}` : ""}`);

  if (decision.action !== "TRANSITION") {
    console.log("\nNothing to send.");
    return 0;
  }

  const target = LifecycleState[decision.to];
  console.log(`  Reasons            ${decision.reasons.join("; ")}`);
  console.log(`\nWOULD CALL: Registry(${registry}).transitionLifecycle(${assetId}, ${target} /* ${decision.to} */)`);

  const privateKey = process.env.ORACLE_SYNC_PRIVATE_KEY;
  const blockers = executionBlockers({
    executeFlag: values.execute!,
    hasPrivateKey: !!privateKey,
    stdinIsTTY: !!process.stdin.isTTY,
    stdoutIsTTY: !!process.stdout.isTTY,
  });
  if (blockers.length > 0) {
    console.log(`\nDRY RUN -- no transaction sent. (${blockers.join("; ")})`);
    return 0;
  }

  // ---- Execute path: only reachable with every guard above passed. ----
  const account = privateKeyToAccount(privateKey as Hex);
  const chainId = await client.publicClient.getChainId();
  if (chainId !== robinhoodChainTestnet.id) {
    console.error(`Refusing: RPC chain id ${chainId} is not ${robinhoodChainTestnet.id}.`);
    return 1;
  }
  const owner = await client.publicClient.readContract({ address: registry, abi: LedgerLineRegistryAbi, functionName: "owner" });
  if ((owner as string).toLowerCase() !== account.address.toLowerCase()) {
    console.error(`Refusing: ${account.address} is not the Registry owner (${owner}).`);
    return 1;
  }
  const fresh = await client.getAssetState(assetId);
  if (Number(fresh.lifecycle) !== current) {
    console.error("Refusing: Registry lifecycle changed since the decision was made. Re-run.");
    return 1;
  }
  const validOnchain = await client.publicClient.readContract({
    address: registry,
    abi: LedgerLineRegistryAbi,
    functionName: "isValidTransition",
    args: [current, decision.to],
  });
  if (!validOnchain) {
    console.error(`Refusing: Registry.isValidTransition(${LifecycleState[current]}, ${target}) is false onchain.`);
    return 1;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(`\nThis changes LIVE testnet state. Type ${target} to send, anything else to abort: `);
  rl.close();
  if (typed.trim() !== target) {
    console.log("Aborted. No transaction sent.");
    return 0;
  }

  const wallet = createWalletClient({ account, chain: robinhoodChainTestnet, transport: http(rpcUrl) });
  const hash = await wallet.writeContract({
    address: registry,
    abi: LedgerLineRegistryAbi,
    functionName: "transitionLifecycle",
    args: [assetId, decision.to],
  });
  console.log(`Sent: ${hash}`);
  const receipt = await client.publicClient.waitForTransactionReceipt({ hash });
  console.log(`Status: ${receipt.status} (block ${receipt.blockNumber})`);
  return receipt.status === "success" ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
);

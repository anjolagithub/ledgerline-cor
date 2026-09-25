import { test } from "node:test";
import assert from "node:assert/strict";
import { LifecycleState } from "../src/types";
import {
  decideLifecycleAction,
  exceedsDeviation,
  executionBlockers,
  isValidTransition,
  type OracleInputs,
} from "../scripts/oracle-sync/decide";

/// Pure decision-logic tests only. Nothing here touches an RPC or chain
/// state -- by design, no test executes oracle-sync against a Registry.

const ONE = 10n ** 18n;
const NOW = 1_800_000_000;
const REF = 100n * ONE; // $100 reference makes percentages easy to read

function inputs(overrides: Partial<OracleInputs> = {}): OracleInputs {
  return {
    referencePrice: REF,
    feedPrice: REF,
    feedUpdatedAt: NOW,
    now: NOW,
    complianceFlag: false,
    currentLifecycle: LifecycleState.ACTIVE,
    ...overrides,
  };
}

test("within the 10% band: no change", () => {
  const d = decideLifecycleAction(inputs({ feedPrice: 105n * ONE }));
  assert.equal(d.action, "NONE");
});

test("exactly 10% deviation is NOT a breach (boundary)", () => {
  assert.equal(decideLifecycleAction(inputs({ feedPrice: 110n * ONE })).action, "NONE");
  assert.equal(decideLifecycleAction(inputs({ feedPrice: 90n * ONE })).action, "NONE");
});

test("just over 10% up -> SUSPENDED", () => {
  const d = decideLifecycleAction(inputs({ feedPrice: 110n * ONE + 1n }));
  assert.deepEqual(d, { action: "TRANSITION", to: LifecycleState.SUSPENDED, reasons: ["price deviation above 10%"] });
});

test("just over 10% down -> SUSPENDED", () => {
  const d = decideLifecycleAction(inputs({ feedPrice: 90n * ONE - 1n }));
  assert.equal(d.action, "TRANSITION");
  assert.equal(d.action === "TRANSITION" && d.to, LifecycleState.SUSPENDED);
});

test("compliance flag -> RESTRICTED, even with a normal price", () => {
  const d = decideLifecycleAction(inputs({ complianceFlag: true }));
  assert.deepEqual(d, { action: "TRANSITION", to: LifecycleState.RESTRICTED, reasons: ["compliance flag set"] });
});

test("compliance flag AND deviation -> RESTRICTED (compliance takes precedence), both reasons reported", () => {
  const d = decideLifecycleAction(inputs({ complianceFlag: true, feedPrice: 50n * ONE }));
  assert.deepEqual(d, {
    action: "TRANSITION",
    to: LifecycleState.RESTRICTED,
    reasons: ["compliance flag set", "price deviation above 10%"],
  });
});

test("stale feed -> SKIP, even with a huge deviation and a compliance flag", () => {
  const d = decideLifecycleAction(inputs({ feedPrice: 10n * ONE, complianceFlag: true, feedUpdatedAt: NOW - 3601 }));
  assert.equal(d.action, "SKIP");
});

test("feed exactly at the staleness limit is still usable", () => {
  const d = decideLifecycleAction(inputs({ feedPrice: 50n * ONE, feedUpdatedAt: NOW - 3600 }));
  assert.equal(d.action, "TRANSITION");
});

test("feed timestamp in the future -> SKIP", () => {
  assert.equal(decideLifecycleAction(inputs({ feedUpdatedAt: NOW + 61 })).action, "SKIP");
});

test("zero or negative prices -> SKIP (never act on bad data)", () => {
  assert.equal(decideLifecycleAction(inputs({ feedPrice: 0n })).action, "SKIP");
  assert.equal(decideLifecycleAction(inputs({ feedPrice: -1n })).action, "SKIP");
  assert.equal(decideLifecycleAction(inputs({ referencePrice: 0n })).action, "SKIP");
});

test("already in the target state -> NONE (no redundant transition)", () => {
  const d = decideLifecycleAction(inputs({ feedPrice: 50n * ONE, currentLifecycle: LifecycleState.SUSPENDED }));
  assert.equal(d.action, "NONE");
});

test("SUSPENDED + compliance flag -> RESTRICTED (a valid Registry transition)", () => {
  const d = decideLifecycleAction(inputs({ complianceFlag: true, currentLifecycle: LifecycleState.SUSPENDED }));
  assert.equal(d.action === "TRANSITION" && d.to, LifecycleState.RESTRICTED);
});

test("invalid transition (e.g. from REDEEMED or MATURING) -> SKIP, never proposed", () => {
  assert.equal(decideLifecycleAction(inputs({ feedPrice: 50n * ONE, currentLifecycle: LifecycleState.REDEEMED })).action, "SKIP");
  assert.equal(decideLifecycleAction(inputs({ complianceFlag: true, currentLifecycle: LifecycleState.MATURING })).action, "SKIP");
});

test("never proposes a return to ACTIVE, even when the price is back in band", () => {
  for (const current of [LifecycleState.SUSPENDED, LifecycleState.RESTRICTED]) {
    assert.equal(decideLifecycleAction(inputs({ currentLifecycle: current })).action, "NONE");
  }
});

test("custom deviation threshold is respected", () => {
  assert.equal(exceedsDeviation(REF, 104n * ONE, 500n), false);
  assert.equal(exceedsDeviation(REF, 106n * ONE, 500n), true);
});

test("transition mirror matches LedgerLineRegistry._isValidTransition for all 49 pairs", () => {
  // The allowed edges, copied from the Registry's documented table
  // (contracts/src/LedgerLineRegistry.sol).
  const S = LifecycleState;
  const allowed = new Set([
    `${S.ACTIVE}>${S.RESTRICTED}`, `${S.ACTIVE}>${S.CORPORATE_ACTION}`, `${S.ACTIVE}>${S.SUSPENDED}`, `${S.ACTIVE}>${S.MATURING}`,
    `${S.RESTRICTED}>${S.ACTIVE}`, `${S.RESTRICTED}>${S.SUSPENDED}`,
    `${S.CORPORATE_ACTION}>${S.ACTIVE}`, `${S.CORPORATE_ACTION}>${S.RESTRICTED}`,
    `${S.SUSPENDED}>${S.ACTIVE}`, `${S.SUSPENDED}>${S.RESTRICTED}`,
    `${S.MATURING}>${S.REDEEMABLE}`,
    `${S.REDEEMABLE}>${S.REDEEMED}`,
  ]);
  for (let from = 0; from < 7; from++) {
    for (let to = 0; to < 7; to++) {
      assert.equal(isValidTransition(from, to), allowed.has(`${from}>${to}`), `${S[from]} -> ${S[to]}`);
    }
  }
});

test("execution guards: dry-run unless --execute AND a key AND an interactive terminal", () => {
  const ok = { executeFlag: true, hasPrivateKey: true, stdinIsTTY: true, stdoutIsTTY: true };
  assert.deepEqual(executionBlockers(ok), []);
  assert.equal(executionBlockers({ ...ok, executeFlag: false }).length, 1);
  assert.equal(executionBlockers({ ...ok, hasPrivateKey: false }).length, 1);
  assert.equal(executionBlockers({ ...ok, stdinIsTTY: false }).length, 1, "piped/cron stdin must refuse");
  assert.equal(executionBlockers({ ...ok, stdoutIsTTY: false }).length, 1);
  assert.equal(executionBlockers({ executeFlag: false, hasPrivateKey: false, stdinIsTTY: false, stdoutIsTTY: false }).length, 3);
});

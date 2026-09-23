import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PlanningReceipts, type ReceiptContext } from "../planning-context.ts";
import { TrainingPlanning } from "./training-planning.ts";
import { page, readAll } from "../read-pages.ts";
import { ATHLETE, SYNTHETIC_KEY, contextFixture, fixtureServer } from "./protocol-fixture.ts";

const contextAt = (now: Date) => contextFixture(now) as ReceiptContext;
test("receipt expires at 15 minutes or athlete-local midnight, not UTC midnight", () => {
  for (const [start, expires] of [
    ["2026-09-22T16:00:00.000Z", "2026-09-22T16:15:00.000Z"],
    ["2026-09-23T03:58:00.000Z", "2026-09-23T04:00:00.000Z"],
    ["2026-03-08T04:58:00.000Z", "2026-03-08T05:00:00.000Z"],
    ["2026-11-01T03:58:00.000Z", "2026-11-01T04:00:00.000Z"],
  ]) {
    let now = new Date(start);
    const receipts = new PlanningReceipts(() => ATHLETE, () => now);
    const context = contextAt(now);
    const receipt = receipts.issue(context);
    assert.equal(receipt.expires_at, expires);
    receipts.assert(receipt.id, { capability: "legacy:freeform", targetDate: context.target_date }, context.versions);
    now = new Date(new Date(expires).getTime() - 1);
    receipts.assert(receipt.id, { capability: "legacy:freeform" }, context.versions);
    now = new Date(expires);
    assert.throws(() => receipts.assert(receipt.id, { capability: "legacy:freeform" }, context.versions), { code: "FRESH_CONTEXT_REQUIRED" });
  }
});

test("receipt cannot survive connection, configured athlete, captured version or occurrence changes", () => {
  const now = new Date("2026-09-22T16:00:00Z");
  let athlete = ATHLETE;
  const receipts = new PlanningReceipts(() => athlete, () => now);
  const context = contextAt(now);
  const receipt = receipts.issue(context);
  assert.throws(() => new PlanningReceipts(() => athlete, () => now).assert(receipt.id, { capability: "legacy:freeform" }, context.versions), { code: "FRESH_CONTEXT_REQUIRED" });
  assert.throws(() => receipts.assert(receipt.id, { capability: "record_training_decision", sessionId: randomUUID() }, context.versions), { code: "CONTEXT_CHANGED" });
  assert.throws(() => receipts.assert(receipt.id, { capability: "legacy:freeform" }, { state: 1, evidence: 2 }), { code: "CONTEXT_CHANGED" });
  athlete = randomUUID();
  assert.throws(() => receipts.assert(receipt.id, { capability: "legacy:freeform" }, context.versions), { code: "FRESH_CONTEXT_REQUIRED" });
});

test("ineligible activity gets no materialization capability while eligible alternatives remain available", () => {
  const now = new Date("2026-09-22T16:00:00Z");
  const context = contextAt(now);
  context.activity_eligibility.strength = { eligible: false, reasons: ["RECOVERY_SPACING_NOT_MET"] };
  const receipts = new PlanningReceipts(() => ATHLETE, () => now);
  const receipt = receipts.issue(context);
  assert.equal(receipt.capabilities.includes("materialize:strength"), false);
  assert.equal(receipt.capabilities.includes("materialize:rest"), true);
  assert.throws(() => receipts.assert(receipt.id, { capability: "materialize:strength" }, context.versions), { code: "AUTHORITY_REQUIRED" });
  receipts.assert(receipt.id, { capability: "materialize:rest" }, context.versions);
});

test("committed retry replays after expiry, local rollover and restart without executing SQL again", async () => {
  const fixture = await fixtureServer();
  try {
    let now = new Date("2026-09-23T03:58:00Z");
    fixture.state.context = contextFixture(now);
    const db = createClient(fixture.url, SYNTHETIC_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const planning = new TrainingPlanning(() => db, () => ATHLETE, () => now);
    const context = await planning.getContext({});
    const args = { context_id: context.context_receipt!.id, request_id: randomUUID(), expected_state_version: context.versions.state,
      expected_evidence_version: context.versions.evidence, activity_kind: "rest", target_date: context.today,
      reason: "Synthetic replay", revisit_on: context.today };
    const first = await planning.mutate("materialize_training_session", args);
    now = new Date("2026-09-23T04:15:00Z");
    assert.deepEqual(await planning.mutate("materialize_training_session", args), first);
    const restarted = new TrainingPlanning(() => db, () => ATHLETE, () => now);
    assert.deepEqual(await restarted.mutate("materialize_training_session", args), first);
    await assert.rejects(restarted.mutate("materialize_training_session", { ...args, reason: "Changed" }), { code: "IDEMPOTENCY_CONFLICT" });
    await assert.rejects(restarted.mutate("materialize_training_session", { ...args, request_id: randomUUID() }), { code: "FRESH_CONTEXT_REQUIRED" });
    assert.equal(fixture.state.insertCount, 1);
  } finally { await fixture.close(); }
});

test("unknown counts, changing pages and source failures never advertise complete evidence", async () => {
  assert.equal(page({ data: [{ id: 1 }], count: null, error: null }, 0, 10).complete, false);
  assert.equal(page({ data: [{ id: 1 }], count: null, error: null }, 0, 10).has_more, null);
  const pages = [{ data: [{ id: 1 }], count: 2, error: null }, { data: [{ id: 2 }, { id: 3 }], count: 3, error: null }];
  assert.equal((await readAll(async () => pages.shift()!)).complete, false);
  await assert.rejects(readAll(async () => ({ data: null, count: null, error: new Error("Synthetic read failure") })), /Synthetic read failure/);
});

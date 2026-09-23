import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ATHLETE, REVISION, SESSION, call, fixtureServer, protocolClient } from "./protocol-fixture.ts";
import { addCalendarDays } from "../dates.ts";
import type { TrainingPlanning } from "./training-planning.ts";

// Real public stdio discovery/calls against a synthetic loopback HTTP contract.
// These assertions deliberately do not claim to execute PostgreSQL or verify grants.
type Fixture = Awaited<ReturnType<typeof fixtureServer>>;
type Context = Awaited<ReturnType<TrainingPlanning["getContext"]>>;
type History = Awaited<ReturnType<TrainingPlanning["getHistory"]>>;
type Day = Record<string, unknown> & { logged_sets: Fixture["state"]["sets"] };
type Page = Record<string, unknown> & { items: Record<string, unknown>[] };
type Summary = Record<string, unknown> & { sets_by_exercise: { library_status: string }[] };
async function withProtocol(run: (fixture: Fixture, client: Client) => Promise<void>, athlete = ATHLETE) {
  const fixture = await fixtureServer();
  let client: Client | undefined;
  try { client = await protocolClient(fixture.url, athlete); await run(fixture, client); }
  finally { await client?.close(); await fixture.close(); }
}
function guard(context: Context, mode: "linked" | "freeform" = "freeform") {
  return { context_id: context.context_receipt!.id, expected_state_version: context.versions.state,
    expected_evidence_version: context.versions.evidence, request_id: randomUUID(), mode,
    reason: "Synthetic protocol check", revisit_on: context.target_date };
}
function legacy(date: string) {
  return [
    { name: "create_or_update_workout", args: { date, name: "Synthetic intent" } },
    { name: "add_workout_exercise", args: { date, exercise_id: 7, details: "Synthetic fixture only" } },
    { name: "update_workout_exercise", args: { workout_exercise_id: 23, note: "Synthetic edit" } },
    { name: "remove_workout_exercise", args: { workout_exercise_id: 23 } },
  ];
}
function rejected(result: { error?: string }, code: string) { assert.match(result.error ?? "Unexpected success", new RegExp(code)); }

test("public discovery exposes coach tools, not owner authority, and matches wire fields", async () => {
  await withProtocol(async (_fixture, client) => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map(tool => [tool.name, tool]));
    for (const name of ["get_training_context", "get_training_history", "get_training_request", "propose_training_revision", "record_training_decision", "materialize_training_session", ...legacy("2026-09-22").map(tool => tool.name)]) assert.ok(byName.has(name), name);
    for (const name of ["activate_training_revision", "set_training_lifecycle", "confirm_report", "confirm_day"]) assert.equal(byName.has(name), false);
    const decision = byName.get("record_training_decision")!.inputSchema.properties as { kind: { enum: string[] } };
    assert.equal(decision.kind.enum.includes("cancel_session"), false, "owner-only kind must not be advertised to coach");
    assert.equal(decision.kind.enum.includes("recommendation"), false, "use materialize for durable day intent; no unsupported SQL kind");
    const history = byName.get("get_training_history")!.inputSchema.properties!;
    assert.ok(history.limit);
    assert.equal("request_id" in history, false);
    const materialize = byName.get("materialize_training_session")!.inputSchema.properties as { exercises: { items: { properties: Record<string, unknown> } } };
    assert.ok(materialize.exercises.items.properties.optional);
  });
});

for (const lifecycle of ["active", "paused"] as const) {
  test(`all four legacy routes require context and explicit mode during ${lifecycle}, including freeform`, async () => {
    await withProtocol(async ({ state }, client) => {
      state.context.authority.lifecycle = lifecycle;
      for (const tool of legacy(state.context.today)) {
        rejected(await call(client, tool.name, tool.args), "FRESH_CONTEXT_REQUIRED");
        rejected(await call(client, tool.name, { ...tool.args, mode: "freeform", request_id: randomUUID() }), "FRESH_CONTEXT_REQUIRED");
        const context = await call<Context>(client, "get_training_context");
        const args = { ...tool.args, ...guard(context) };
        const withoutMode: Record<string, unknown> = { ...args };
        delete withoutMode.mode;
        rejected(await call(client, tool.name, withoutMode), "FRESH_CONTEXT_REQUIRED");
        const before = state.insertCount;
        const result = await call(client, tool.name, args);
        assert.equal(result.status, "committed");
        assert.equal(result.planning_enforcement, "guarded");
        assert.equal(state.insertCount, before + 1);
        const replay = await call(client, tool.name, args);
        assert.equal(replay.event_id, result.event_id);
        assert.equal(state.insertCount, before + 1, "retry must not invoke a second write");
        rejected(await call(client, tool.name, { ...args, request_id: randomUUID() }), "FRESH_CONTEXT_REQUIRED");
        rejected(await call(client, tool.name, { ...args, reason: "Changed payload" }), "IDEMPOTENCY_CONFLICT");
      }
      assert.equal(state.insertCount, 4);
      assert.equal(state.calls.filter(c => c.method !== "GET" && c.path.endsWith("/workouts_exercises")).length, 0);
    });
  });
}

test("connection, target, occurrence and version scopes cannot be substituted", async () => {
  await withProtocol(async ({ state, url }, client) => {
    const other = await protocolClient(url);
    try {
      const context = await call<Context>(client, "get_training_context");
      const args = { ...legacy(context.today)[0].args, ...guard(context) };
      rejected(await call(other, "create_or_update_workout", args), "FRESH_CONTEXT_REQUIRED");
      rejected(await call(client, "create_or_update_workout", { ...args, date: addCalendarDays(context.today, 1) }), "CONTEXT_CHANGED");
      rejected(await call(client, "create_or_update_workout", { ...args, expected_evidence_version: 99 }), "CONTEXT_CHANGED");
      rejected(await call(client, "record_training_decision", { ...guard(context), kind: "reconcile", session_id: randomUUID() }), "CONTEXT_CHANGED");
      state.context.versions.evidence++;
      rejected(await call(client, "create_or_update_workout", args), "CONTEXT_CHANGED");
      rejected(await call(client, "materialize_training_session", { ...guard(context), target_date: context.today, activity_kind: "rest" }), "VERSION_CONFLICT");
      assert.equal(state.insertCount, 0);
    } finally { await other.close(); }
  });
});

test("owner configuration is explicit and must match; missing context never falls back", async () => {
  for (const athlete of ["", "44444444-4444-4444-8444-444444444444"]) {
    await withProtocol(async ({ state }, client) => {
      rejected(await call<Context>(client, "get_training_context"), athlete ? "AUTHORITY_REQUIRED" : "ATHLETE_NOT_CONFIGURED");
      assert.equal(state.insertCount, 0);
    }, athlete);
  }
  await withProtocol(async ({ state }, client) => {
    state.contextError = true;
    for (const tool of legacy(state.context.today)) rejected(await call(client, tool.name, { ...tool.args, mode: "freeform" }), "PLANNING_UNAVAILABLE");
    rejected(await call<Context>(client, "get_training_context"), "PLANNING_UNAVAILABLE");
    assert.equal(state.insertCount, 0);
  });
});

test("incomplete and unsupported contexts grant no authority or automatic fallback", async () => {
  await withProtocol(async ({ state }, client) => {
    const complete = await call<Context>(client, "get_training_context");
    state.context.evidence.complete = false;
    const incomplete = await call<Context>(client, "get_training_context");
    assert.equal(incomplete.context_receipt, null);
    assert.equal(incomplete.receipt_blocking_reason, "INCOMPLETE_EVIDENCE");
    rejected(await call(client, "materialize_training_session", { ...guard(complete), target_date: complete.today, activity_kind: "rest" }), "FRESH_CONTEXT_REQUIRED");
    for (const tool of legacy(state.context.today)) rejected(await call(client, tool.name, { ...tool.args, ...guard(complete) }), "INCOMPLETE_EVIDENCE");
    state.context.schema_version = 999;
    rejected(await call<Context>(client, "get_training_context"), "UNSUPPORTED_CONTEXT");
    assert.equal(state.insertCount, 0);
  });
});

test("inactive unlinked compatibility is labeled; paused and archived linked targets stay protected", async () => {
  await withProtocol(async ({ state }, client) => {
    state.context.authority.lifecycle = "inactive";
    const context = await call<Context>(client, "get_training_context");
    assert.deepEqual(context.context_receipt!.capabilities, ["propose_training_revision"]);
    for (const tool of legacy(state.context.today)) {
      const result = await call(client, tool.name, tool.args);
      assert.equal(result.planning_enforcement, "not_applicable");
    }
    state.context.authority.lifecycle = "paused";
    const paused = await call<Context>(client, "get_training_context");
    for (const tool of legacy(state.context.today)) rejected(await call(client, tool.name, { ...tool.args, ...guard(paused, "linked") }), "AUTHORITY_REQUIRED");
    rejected(await call(client, "materialize_training_session", { ...guard(paused), target_date: paused.today, activity_kind: "rest" }), "AUTHORITY_REQUIRED");
    state.context.authority.lifecycle = "archived";
    state.context.target_conflict = { session_id: SESSION };
    for (const tool of legacy(state.context.today)) rejected(await call(client, tool.name, { ...tool.args, mode: "freeform" }), "FRESH_CONTEXT_REQUIRED");
    assert.equal(state.insertCount, 4);
  });
});

test("due review is not expiry; rest intent and proposals use exact RPC envelopes and readback", async () => {
  await withProtocol(async ({ state }, client) => {
    state.context.review.review_due = true;
    const context = await call<Context>(client, "get_training_context");
    assert.equal(context.recommended_today, null);
    const args = { context_id: context.context_receipt!.id, expected_state_version: context.versions.state,
      expected_evidence_version: context.versions.evidence, request_id: randomUUID(), target_date: context.today,
      activity_kind: "rest", reason: "Synthetic approved supportive intent", revisit_on: context.today };
    const result = await call(client, "materialize_training_session", args);
    assert.equal(result.status, "committed");
    assert.equal(result.workout_id, null);
    const payload: Record<string, unknown> = { ...args };
    delete payload.context_id;
    const lookup = await call(client, "get_training_request", { operation: "materialize_training_session", request_id: args.request_id, payload });
    assert.deepEqual(lookup, result);
    const history = await call<History>(client, "get_training_history", { session_id: result.session_id, limit: 1 });
    assert.equal(history.sessions[0].id, result.session_id);
    assert.equal(history.events[0].event_id, result.event_id);
    assert.equal(history.has_more, false);
    assert.equal(state.calls.at(-1)?.input.p_input!.limit, 1);
    const next = await call<Context>(client, "get_training_context");
    const proposal = await call(client, "propose_training_revision", { ...guard(next), content: { fixture: "SQL validation is outside this synthetic test" }, parent_revision_id: REVISION });
    assert.equal(proposal.status, "committed");
    assert.equal(state.calls.at(-1)?.path.endsWith("/propose_training_revision"), true);
    assert.equal(state.calls.some(c => c.path.endsWith("/activate_training_revision")), false);
  });
});

test("SQL safety errors propagate for every route, with no direct or freeform retry", async () => {
  await withProtocol(async ({ state }, client) => {
    const context = await call<Context>(client, "get_training_context");
    for (const code of ["RECOVERY_SPACING_NOT_MET", "QUEUE_UNRESOLVED", "OUTSIDE_DELEGATED_SCOPE", "WORKOUT_CONFLICT", "AUTHORITY_REQUIRED"]) {
      state.mutationError = code;
      for (const tool of legacy(context.today)) rejected(await call(client, tool.name, { ...tool.args, ...guard(context) }), code);
      rejected(await call(client, "materialize_training_session", { ...guard(context), activity_kind: "strength", target_date: context.today }), code);
    }
    state.mutationError = "";
    const alternative = await call(client, "materialize_training_session", { ...guard(context), activity_kind: "rest", target_date: context.today });
    assert.equal(alternative.status, "committed");
    assert.equal(state.insertCount, 1);
  });
});

test("exercise creation invalidates receipts, without granting anchor approval", async () => {
  await withProtocol(async ({ state }, client) => {
    const context = await call<Context>(client, "get_training_context");
    assert.equal((await call(client, "create_exercise", { name: "Synthetic distinct movement", confirm_create: true })).status, "created");
    rejected(await call(client, "materialize_training_session", { ...guard(context), target_date: context.today, activity_kind: "rest" }), "FRESH_CONTEXT_REQUIRED");
    assert.equal(state.insertCount, 0);
  });
});

test("invalid dates and past prescription edits reject, including owning-date routes", async () => {
  await withProtocol(async ({ state }, client) => {
    for (const date of ["2026-02-30", "2026-1-01", "not-a-date"]) rejected(await call<Context>(client, "get_training_context", { target_date: date }), "date|Date|YYYY");
    const yesterday = addCalendarDays(state.context.today, -1);
    state.context.target_date = yesterday;
    for (const tool of legacy(yesterday)) rejected(await call(client, tool.name, tool.args), "DATE_NOT_EDITABLE");
    assert.equal(state.insertCount, 0);
  });
});

test("day reads keep unplanned archived-library sets, null metrics and DST-local half-open bounds", async () => {
  await withProtocol(async ({ state }, client) => {
    const day = await call<Day>(client, "get_workout_by_date", { date: "2026-03-08" });
    assert.equal(day.id, null);
    assert.equal(day.logged_sets[0].id, 91);
    assert.equal(day.logged_sets[0].weight, null);
    assert.equal(day.logged_sets[0].exercises.is_deleted, true);
    assert.equal(day.complete, true);
    assert.equal(day.consistency, "non_atomic");
    assert.deepEqual(day.window, { from_inclusive: "2026-03-08T05:00:00.000Z", to_exclusive: "2026-03-09T04:00:00.000Z" });
    const setQuery = state.calls.find(c => c.path.endsWith("/sets"))!.url;
    assert.deepEqual(setQuery.searchParams.getAll("logged_at"), ["gte.2026-03-08T05:00:00.000Z", "lt.2026-03-09T04:00:00.000Z"]);
    state.workout = { id: 17, date: "2026-03-08", name: "Synthetic name", note: "Synthetic note" };
    const planned = await call<Page>(client, "list_recent_workouts");
    assert.equal(planned.items[0].name, state.workout.name);
    assert.equal(planned.items[0].note, state.workout.note);
    assert.equal(planned.evidence_kind, "planned_workouts_not_execution");
  });
});

test("server-capped evidence pages are explicitly incomplete; day reads follow every page", async () => {
  await withProtocol(async ({ state }, client) => {
    state.sets = Array.from({ length: 5 }, (_, i) => ({ ...state.sets[0], id: 91 + i }));
    state.serverCap = 2;
    const first = await call<Page>(client, "list_sets", { limit: 5 });
    assert.equal(first.items.length, 2);
    assert.equal(first.total, 5);
    assert.equal(first.has_more, true);
    assert.equal(first.complete, false);
    assert.equal(first.next_offset, 2);
    const second = await call(client, "get_exercise_history", { exercise_id: 7, limit: 5, offset: first.next_offset });
    assert.equal(second.next_offset, 4);
    const last = await call(client, "list_sets", { limit: 5, offset: second.next_offset });
    assert.equal(last.has_more, false);
    assert.equal(last.complete, false, "a final page alone is not the complete window");
    const day = await call<Day>(client, "get_workout_by_date", { date: "2026-03-08" });
    assert.equal(day.logged_sets.length, 5);
    assert.equal(day.complete, true);
    const summary = await call<Summary>(client, "get_summary", { from: "2026-03-08", to: "2026-03-08" });
    assert.equal(summary.set_count, 5);
    assert.equal(summary.workout_count_semantics, "planned_rows_not_performed_sessions");
    assert.equal(summary.sets_by_exercise[0].library_status, "archived");
    assert.equal(summary.complete, true);
  });
});

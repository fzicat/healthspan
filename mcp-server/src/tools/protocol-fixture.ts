import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { athleteDate } from "../dates.ts";

export const ATHLETE = "11111111-1111-4111-8111-111111111111";
export const SESSION = "22222222-2222-4222-8222-222222222222";
export const REVISION = "33333333-3333-4333-8333-333333333333";
export const SYNTHETIC_KEY = "synthetic-local-contract-test-key";
// Deliberately synthetic transport fixture. It is NOT a database/SQL safety test.
// Actual migrations must be exercised by the repository's disposable DB suite.
export function contextFixture(now = new Date()) {
  const today = athleteDate(now, "America/Montreal");
  return {
    schema_version: 1, status: "ready", athlete_timezone: "America/Montreal", today, target_date: today,
    versions: { state: 1, evidence: 1 },
    authority: { owner_user_id: ATHLETE, lifecycle: "active", revision_id: REVISION, activation_event_id: randomUUID(), authorized_through: null },
    direction: { intent: "SYNTHETIC fixture: sustainable participation", block_key: "full-body-fixture" },
    queue: { next_slot_key: "arbitrary-b", next_resistance_slot: "arbitrary-b", confidence: "resolved", basis_event_ids: [], qualifying_exposures: {} },
    activity_eligibility: Object.fromEntries(["strength", "cardio", "mobility", "rest"].map((kind) => [kind,
      { eligible: true, eligible_on_or_after: today, reasons: [], conditions: ["Minimum spacing is not proof of recovery"] }])),
    recommended_today: null,
    review: { review_due: false, reasons: [], original_due_on: null, last_review: null, handling: null, open_concerns: [] },
    evidence: { complete: true, queue_history_complete: true, sets: [], cardio_sessions: [], daily_logs: [], pending_qualifiers: [], unlinked_sets: [] },
    sessions: [{ id: SESSION, planned_date: today }], proposals: [], recent_phases: [], blocking_reasons: [], target_conflict: null as unknown,
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

type Json = Record<string, unknown>;
export async function fixtureServer() {
  const state = { context: contextFixture(), contextError: false, mutationError: "", insertCount: 0,
    calls: [] as { path: string; method: string; input: Json & { p_input?: Json }; url: URL }[],
    committed: new Map<string, { operation: string; payload: string; result: Json }>(),
    workout: null as Json | null,
    sets: [{ id: 91, exercise_id: 7, logged_at: "2026-03-09T02:30:00Z", weight: null, reps: 4, time: null, distance: null, rir: null,
      exercises: { id: 7, name: "Archived fixture lift", is_deleted: true } }],
    serverCap: 500,
  };
  const http = createServer(async (req, res) => {
    const send = (data: unknown, status = 200) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
    try {
      assert.equal(req.headers.authorization, `Bearer ${SYNTHETIC_KEY}`);
      assert.equal(req.headers.apikey, SYNTHETIC_KEY);
      const url = new URL(req.url!, "http://127.0.0.1");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      const input = body.p_input ?? {};
      state.calls.push({ path: url.pathname, method: req.method!, input: body, url });
      const rpc = url.pathname.split("/rpc/")[1];
      if (rpc) {
        if (rpc === "find_similar_exercises") return send([]);
        assert.deepEqual(Object.keys(body), ["p_input"]);
        assert.equal("context_id" in input, false);
        if (rpc === "get_training_context") {
          if (state.contextError) return send({ code: "P0001", message: "PLANNING_UNAVAILABLE" }, 503);
          return send({ ...state.context, target_date: input.target_date ?? state.context.today });
        }
        if (rpc === "get_training_history") return send({ revisions: [{ id: REVISION }], sessions: state.context.sessions,
          events: [...state.committed.values()].map(value => value.result), has_more: false, next_cursor: null });
        if (rpc === "get_training_request") {
          const prior = state.committed.get(input.request_id);
          if (!prior) return send({ status: "not_found" });
          if (prior.operation !== input.operation || prior.payload !== canonical(input.payload)) return send({ code: "P0001", message: "IDEMPOTENCY_CONFLICT" }, 400);
          return send(prior.result);
        }
        if (state.mutationError) return send({ code: "P0001", message: state.mutationError }, 400);
        if (input.expected_state_version !== state.context.versions.state || input.expected_evidence_version !== state.context.versions.evidence) return send({ code: "P0001", message: "VERSION_CONFLICT" }, 400);
        if (rpc === "mutate_training_workout") {
          assert.ok(input.args);
          assert.ok(["create_or_update_workout", "add_workout_exercise", "update_workout_exercise", "remove_workout_exercise"].includes(input.operation));
        }
        state.insertCount++;
        state.context.versions.state++;
        const result = { status: "committed", event_id: randomUUID(), session_id: SESSION, revision_id: REVISION,
          workout_id: rpc === "mutate_training_workout" ? 17 : null, request_id: input.request_id, versions: { ...state.context.versions } };
        state.committed.set(input.request_id, { operation: rpc, payload: canonical(input), result });
        return send(result);
      }
      const table = url.pathname.split("/").at(-1);
      if (req.method === "POST" && table === "exercises") {
        state.context.versions.evidence++;
        return send({ id: 50, ...body }, 201);
      }
      if (table === "workouts_exercises") return send({ id: 23, workout_id: 17, workouts: { date: state.context.target_date } });
      if (req.method === "GET" && table === "workouts" && url.searchParams.has("date")) return send(state.workout ? [state.workout] : []);
      const rows = table === "sets" ? state.sets : table === "workouts" && state.workout ? [state.workout] : [];
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), state.serverCap);
      res.setHeader("Content-Range", rows.length ? `${offset}-${Math.min(rows.length, offset + limit) - 1}/${rows.length}` : "*/0");
      if (req.method === "HEAD") { res.end(); return; }
      return send(rows.slice(offset, offset + limit));
    } catch (error) { send({ code: "FIXTURE_ASSERTION", message: String(error) }, 500); }
  });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  return { state, url, close: () => new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve())) };
}

export async function protocolClient(url: string, athlete = ATHLETE, extra: Record<string, string> = {}) {
  assert.equal(new URL(url).hostname, "127.0.0.1", "Tests may only call their own loopback fixture");
  const client = new Client({ name: "synthetic-healthspan-protocol-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath, args: ["--import", "tsx", "src/index.ts"],
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HSPAN_MCP_NO_DOTENV: "1", SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: SYNTHETIC_KEY, HSPAN_ATHLETE_USER_ID: athlete, HSPAN_ATHLETE_TIMEZONE: "America/Montreal", ...extra },
    stderr: "pipe",
  });
  transport.stderr?.on("data", () => {});
  try { await client.connect(transport); }
  catch (error) { await transport.close(); throw error; }
  return client;
}

export async function call<T extends object = Json>(client: Client, name: string, args: Json = {}): Promise<T & { error?: string }> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text?: string }>;
  const text = content.filter(item => item.type === "text").map(item => item.text).join("\n");
  const data: unknown = result.isError ? { error: text } : JSON.parse(text);
  return data as T & { error?: string };
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { validateDate, athleteDate } from "../dates.ts";
import { getSupabase, type DB } from "../supabase.ts";
import { PlanningError, PlanningReceipts, type ReceiptContext } from "../planning-context.ts";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  try { validateDate(date); return true; } catch { return false; }
}, "Expected a real YYYY-MM-DD athlete-local date");
const uuid = z.string().uuid();
const version = z.number().int().nonnegative();
const text = z.string().trim().min(1).max(10000);
const activity = z.enum(["strength", "cardio", "mobility", "rest"]);
const exercise = z.object({
  exercise_id: z.number().int().positive(), details: z.string(),
  note: z.string().nullable().optional(), optional: z.boolean().optional(),
}).strict();
export const guardSchema = {
  context_id: uuid.optional().describe("Fresh get_training_context receipt from this MCP connection. Required for active/paused plans, including freeform."),
  expected_state_version: version.optional(), expected_evidence_version: version.optional(),
  request_id: uuid.optional().describe("Stable UUID for this operation; retry identically after timeout, never with a new key."),
  mode: z.enum(["linked", "freeform"]).optional(),
  reason: text.optional(), revisit_on: dateSchema.optional(),
};
const mutationSchema = {
  context_id: uuid, request_id: uuid,
  expected_state_version: version.optional().describe("Defaults to receipt version; send explicitly for restart-safe replay."),
  expected_evidence_version: version.optional().describe("Defaults to receipt version; send explicitly for restart-safe replay."),
};
const record = z.record(z.unknown());
const contextSchema = z.object({
  schema_version: z.literal(1), status: z.enum(["ready", "inactive", "unprovisioned"]),
  athlete_timezone: text, today: dateSchema, target_date: dateSchema,
  versions: z.object({ state: version, evidence: version }),
  authority: z.object({ owner_user_id: uuid.nullable(), lifecycle: z.enum(["inactive", "active", "paused", "archived"]),
    revision_id: uuid.nullable(), activation_event_id: uuid.nullable(), authorized_through: dateSchema.nullable() }).passthrough(),
  direction: record.nullable(),
  queue: z.object({ next_slot_key: z.string().nullable(), next_resistance_slot: z.string().nullable(),
    confidence: z.string(), basis_event_ids: z.array(uuid), qualifying_exposures: z.unknown() }).passthrough(),
  activity_eligibility: z.object(Object.fromEntries(["strength", "cardio", "mobility", "rest"].map((kind) => [kind,
    z.object({ eligible: z.boolean(), eligible_on_or_after: dateSchema.nullable(), reasons: z.array(z.string()), conditions: z.array(z.union([z.string(), record])) }).passthrough(),
  ])) as Record<"strength" | "cardio" | "mobility" | "rest", z.ZodObject<{
    eligible: z.ZodBoolean; eligible_on_or_after: z.ZodNullable<typeof dateSchema>; reasons: z.ZodArray<z.ZodString>; conditions: z.ZodArray<z.ZodUnion<[z.ZodString, typeof record]>>
  }, "passthrough">>),
  recommended_today: record.nullable(),
  review: z.object({ review_due: z.boolean(), reasons: z.array(z.unknown()), original_due_on: dateSchema.nullable(),
    last_review: z.unknown(), handling: z.unknown(), open_concerns: z.array(z.unknown()) }).passthrough(),
  evidence: z.object({ complete: z.boolean(), queue_history_complete: z.boolean(), sets: z.array(record),
    cardio_sessions: z.array(record), daily_logs: z.array(record), pending_qualifiers: z.array(z.unknown()), unlinked_sets: z.array(z.unknown()) }).passthrough(),
  sessions: z.array(z.object({ id: uuid }).passthrough()), proposals: z.array(record), recent_phases: z.unknown(),
  blocking_reasons: z.array(z.unknown()), target_conflict: z.unknown(),
}).passthrough();

export type LegacyOperation = "create_or_update_workout" | "add_workout_exercise" | "update_workout_exercise" | "remove_workout_exercise";
export type LegacyGuard = z.infer<z.ZodObject<typeof guardSchema>>;
type Input = Record<string, unknown>;
const operations = ["propose_training_revision", "record_training_decision", "materialize_training_session", "mutate_training_workout"] as const;

/** Adapter only. SQL owns authority, queue, qualification, spacing and atomicity. */
export class TrainingPlanning {
  readonly receipts: PlanningReceipts;
  constructor(private readonly db: () => DB = getSupabase,
    private readonly athlete = () => process.env.HSPAN_ATHLETE_USER_ID,
    private readonly now = () => new Date()) {
    this.receipts = new PlanningReceipts(athlete, now);
  }

  private async rpc(name: string, input: Input) {
    const { data, error } = await this.db().rpc(name, { p_input: input });
    if (error) throw new PlanningError(error.message?.match(/\b[A-Z][A-Z_]{3,}\b/)?.[0] ?? error.code ?? "PLANNING_UNAVAILABLE", error.message);
    return data;
  }

  private async readContext(target_date?: string) {
    if (target_date) validateDate(target_date);
    const data = await this.rpc("get_training_context", target_date ? { target_date } : {});
    const parsed = contextSchema.safeParse(data);
    if (!parsed.success) throw new PlanningError("UNSUPPORTED_CONTEXT", "Missing, malformed or unsupported planning context; no freeform fallback.");
    const context = parsed.data;
    // Validate the IANA zone rather than silently using the device/server zone.
    try { athleteDate(this.now(), context.athlete_timezone); } catch { throw new PlanningError("UNSUPPORTED_CONTEXT", "Invalid athlete timezone."); }
    if (this.athlete() && context.authority.owner_user_id && context.authority.owner_user_id !== this.athlete()) throw new PlanningError("AUTHORITY_REQUIRED", "Configured athlete does not match owner.");
    if (process.env.HSPAN_ATHLETE_TIMEZONE && process.env.HSPAN_ATHLETE_TIMEZONE !== context.athlete_timezone) throw new PlanningError("CONTEXT_CHANGED", "Configured read timezone differs from the provisioned athlete timezone.");
    if (context.target_date !== (target_date ?? context.today)) throw new PlanningError("CONTEXT_CHANGED");
    return context;
  }

  async getContext(args: { target_date?: string }) {
    try {
      const context = await this.readContext(args.target_date);
      // Incomplete reads remain useful display evidence, but never mint write authority.
      if (!context.evidence.complete || !context.evidence.queue_history_complete) {
        this.receipts.invalidate();
        return { ...context, context_receipt: null, receipt_blocking_reason: "INCOMPLETE_EVIDENCE" };
      }
      return { ...context, context_receipt: this.receipts.issue(context as ReceiptContext) };
    } catch (error) {
      // A failed refresh must not leave older capabilities usable on this lane.
      this.receipts.invalidate();
      throw error;
    }
  }

  async getHistory(args: Input) {
    const result = await this.rpc("get_training_history", args);
    const parsed = z.object({ revisions: z.array(record), sessions: z.array(record), events: z.array(record),
      has_more: z.boolean(), next_cursor: z.string().nullable() }).passthrough().safeParse(result);
    if (!parsed.success || (parsed.data.has_more && !parsed.data.next_cursor)) throw new PlanningError("INCOMPLETE_HISTORY");
    return parsed.data;
  }

  private payload(args: Input, extra: Input = {}): Input {
    const { context_id, ...payload } = args;
    const captured = this.receipts.captured(context_id);
    return Object.fromEntries(Object.entries({ ...payload,
      expected_state_version: args.expected_state_version ?? captured?.state,
      expected_evidence_version: args.expected_evidence_version ?? captured?.evidence,
      ...extra,
    }).filter(([, value]) => value !== undefined));
  }

  async getRequest(args: { operation: string; request_id: string; payload: Input }) {
    // DB derives the actor and verifies the operation-scoped canonical digest.
    const payload = { ...args.payload };
    delete payload.context_id;
    const result = await this.rpc("get_training_request", { ...args, payload });
    // Accept the migration's explicit not_found envelope as well as JSON null.
    return result?.status === "not_found" ? null : result;
  }

  private async replay(operation: string, payload: Input) {
    if (!payload.request_id) return null;
    return this.getRequest({ operation, request_id: String(payload.request_id), payload });
  }

  async mutate(operation: typeof operations[number], args: Input) {
    const payload = this.payload(args);
    // An already-committed identical actor/payload is a read, not new authority.
    const replay = await this.replay(operation, payload);
    if (replay !== null) return replay;
    const versions = { state: Number(payload.expected_state_version), evidence: Number(payload.expected_evidence_version) };
    const capability = operation === "materialize_training_session" ? `materialize:${args.activity_kind}` : operation;
    this.receipts.assert(args.context_id, {
      capability, targetDate: args.target_date as string | undefined, sessionId: args.session_id as string | undefined,
    }, versions);
    const result = await this.rpc(operation, payload);
    this.receipts.invalidate();
    return result;
  }

  async mutateWorkout(operation: LegacyOperation, args: Input) {
    const { context_id, expected_state_version, expected_evidence_version,
      request_id, mode, reason, revisit_on, ...legacyArgs } = args;
    let payload = this.payload({ context_id, request_id,
      expected_state_version, expected_evidence_version,
      mode, reason, revisit_on }, { operation, args: legacyArgs });
    const replay = await this.replay("mutate_training_workout", payload);
    if (replay !== null) return replay;
    let date = args.date as string | undefined;
    if (!date) {
      const { data, error } = await this.db().from("workouts_exercises")
        .select("id, workout_id, workouts!inner(date)").eq("id", args.workout_exercise_id).maybeSingle();
      if (error) throw error;
      if (!data) throw new PlanningError("WORKOUT_NOT_FOUND");
      date = (data as unknown as { workouts: { date: string } }).workouts.date;
    }
    validateDate(date);
    const context = await this.readContext(date); // every route, every lifecycle; failure never means inactive
    if (!context.evidence.complete || !context.evidence.queue_history_complete) throw new PlanningError("INCOMPLETE_EVIDENCE");
    if (date < athleteDate(this.now(), context.athlete_timezone)) throw new PlanningError("DATE_NOT_EDITABLE");
    const guarded = ["active", "paused"].includes(context.authority.lifecycle) || args.mode === "linked" || context.target_conflict != null;
    if (guarded) {
      if (!args.mode || !args.request_id) throw new PlanningError("FRESH_CONTEXT_REQUIRED", "Explicit linked/freeform mode, request_id and fresh receipt required.");
      this.receipts.assert(args.context_id, { capability: `legacy:${args.mode}`, targetDate: date }, {
        state: Number(payload.expected_state_version), evidence: Number(payload.expected_evidence_version),
      });
      if (payload.expected_state_version !== context.versions.state || payload.expected_evidence_version !== context.versions.evidence) throw new PlanningError("CONTEXT_CHANGED");
    } else {
      // Compatibility is explicit in the result, not an error fallback. The protected
      // RPC still atomically checks the resolved versions/lifecycle/target linkage.
      payload = { ...payload, mode: "freeform", request_id: args.request_id ?? randomUUID(),
        reason: args.reason ?? "Intentional unlinked legacy planning; no active direction enforced.", expected_state_version: context.versions.state,
        expected_evidence_version: context.versions.evidence };
    }
    const result = await this.rpc("mutate_training_workout", payload);
    this.receipts.invalidate();
    return { ...result, planning_enforcement: guarded ? "guarded" : "not_applicable" };
  }
}

export function toolResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const decisionKinds = ["reconcile", "propose_report", "bounded_continuation", "review", "concern", "deviation"] as const;
const decisionFields = {
  ...mutationSchema, kind: z.enum(decisionKinds), session_id: uuid.optional(),
  reason: text.optional(), revisit_on: dateSchema.optional(),
  outcome: z.enum(["finished", "reduced", "partial", "stopped", "unknown", "continue", "extend_expected_window", "revise", "pause", "complete", "retire"]).optional(),
  evidence: record.optional(), review_event_ids: z.array(uuid).optional(),
  next_review_on: dateSchema.optional(),
  next_exposure_threshold: z.number().int().positive().optional(), resolve_concern_ids: z.array(uuid).optional(),
  code: text.optional(), activity_kinds: z.array(activity).optional(), stop: z.boolean().optional(),
  report: record.optional(),
};

export function registerTrainingTools(server: McpServer, planning: TrainingPlanning) {
  server.registerTool("get_training_context", {
    description: "Read authoritative direction, actual evidence, activity eligibility (not just the pending resistance slot), review and prior phases. Complete reads mint a connection-scoped 15-minute/local-midnight receipt, not proof of understanding. Required before supported prescriptions. No read invents a recommendation.",
    inputSchema: { target_date: dateSchema.optional() },
  }, async (args) => toolResult(await planning.getContext(args)));
  server.registerTool("get_training_history", {
    description: "Read immutable revisions, occurrences and decisions with explicit pagination. Historical reads do NOT grant mutation receipts. Use exact revision/session IDs for readback; request lookups use get_training_request.",
    inputSchema: { revision_id: uuid.optional(), session_id: uuid.optional(), cursor: uuid.optional(), limit: z.number().int().min(1).max(100).optional() },
  }, async (args) => toolResult(await planning.getHistory(args)));
  server.registerTool("propose_training_revision", {
    description: "Submit an immutable complete revision proposal; never activates direction. SQL validates typed content, exercise IDs, rules and dates. Athlete activation requires authenticated Healthspan, not an agent approval field.",
    inputSchema: { ...mutationSchema, content: record.describe("Complete schema_version=1 revision per supabase/TRAINING-CONTRACT.md; not a prose-only plan."), parent_revision_id: uuid.optional() },
  }, async (args) => toolResult(await planning.mutate("propose_training_revision", args)));
  server.registerTool("record_training_decision", {
    description: "Narrow coach decision. Reconcile evaluates stored occurrence evidence; cannot assert qualification, confirm a report, impersonate the athlete or activate a revision. Reviews/deviations require typed fields and delegated scope, checked transactionally. Save day recommendations with materialize_training_session. Prescription edits use the guarded workout tools.",
    inputSchema: decisionFields,
  }, async (args) => {
    // Keep public fields discoverable; discriminate required fields before any RPC.
    if (["reconcile", "propose_report", "deviation"].includes(args.kind) && !args.session_id) throw new PlanningError("INVALID_INPUT", "session_id required for this decision kind.");
    if (args.kind !== "reconcile" && !args.reason) throw new PlanningError("INVALID_INPUT", "reason required for this decision kind.");
    if (["bounded_continuation", "deviation"].includes(args.kind) && !args.revisit_on) throw new PlanningError("INVALID_INPUT", "Concrete revisit_on required.");
    if (["bounded_continuation", "review"].includes(args.kind) && (!args.review_event_ids || !args.evidence)) throw new PlanningError("INVALID_INPUT", "Review handling needs review_event_ids and evidence.");
    if (args.kind === "review" && (!args.next_review_on || !["continue", "extend_expected_window"].includes(args.outcome ?? ""))) throw new PlanningError("OUTSIDE_DELEGATED_SCOPE", "Coach reviews require a routine outcome and next_review_on; material changes need owner authorization.");
    if (args.kind === "propose_report" && !args.report) throw new PlanningError("INVALID_INPUT", "report required.");
    if (args.kind === "concern" && (!args.code || !args.activity_kinds || args.stop === undefined)) throw new PlanningError("INVALID_INPUT", "Concern needs code, activity_kinds and stop.");
    if (args.kind === "reconcile" && args.outcome && !["finished", "reduced", "partial", "stopped", "unknown"].includes(args.outcome)) throw new PlanningError("INVALID_INPUT", "Reconciliation needs a session outcome, not a review outcome.");
    return toolResult(await planning.mutate("record_training_decision", args));
  });
  server.registerTool("materialize_training_session", {
    description: "Atomically save eligible dated strength/cardio/mobility/rest intent and its frozen context. Supportive intent need not contain exercises or consume the pending resistance slot. SQL rechecks actual-load spacing and review handling; a label cannot bypass it. Read back the returned session/request ID.",
    inputSchema: { ...mutationSchema, target_date: dateSchema, activity_kind: activity, slot_key: text.optional(),
      reason: text, revisit_on: dateSchema, exercises: z.array(exercise).optional(),
      replace_cancelled_session_id: uuid.optional().describe("Explicitly reissue this already owner-cancelled, unperformed dated workout. Reuses only its dated container, not snapshot/evidence/credit; fresh spacing and scope checks still apply."),
      duration_minutes: z.number().positive().optional(), intensity: z.number().min(1).max(10).optional() },
  }, async (args) => toolResult(await planning.mutate("materialize_training_session", args)));
  server.registerTool("get_training_request", {
    description: "Resolve an uncertain mutation result by identical operation/request UUID/payload. Returns original committed result or null; changed payload rejects. Not permission to execute a new mutation. Omit context_id from payload; include original expected versions.",
    inputSchema: { operation: z.enum(operations), request_id: uuid, payload: record },
  }, async (args) => toolResult(await planning.getRequest(args)));
}

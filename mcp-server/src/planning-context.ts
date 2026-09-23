import { randomUUID } from "node:crypto";
import { athleteDate, localDayBounds } from "./dates.ts";

export class PlanningError extends Error {
  constructor(public readonly code: string, message = code) {
    // MCP serializes Error.message, not custom properties: preserve the code.
    super(message === code ? code : `${code}: ${message}`);
    this.name = "PlanningError";
  }
}

export type Versions = { state: number; evidence: number };
export type ReceiptContext = {
  schema_version: 1;
  status: "ready" | "inactive" | "unprovisioned";
  athlete_timezone: string;
  today: string;
  target_date: string;
  versions: Versions;
  authority: { owner_user_id: string | null; lifecycle: string; revision_id: string | null };
  evidence: { complete: boolean; queue_history_complete: boolean };
  activity_eligibility: Record<string, { eligible: boolean; reasons: string[] }>;
  sessions: Array<{ id: string; [key: string]: unknown }>;
};

type Receipt = {
  id: string;
  athlete: string;
  targetDate: string;
  localDate: string;
  timezone: string;
  versions: Versions;
  capabilities: string[];
  sessionIds: string[];
  expiresAt: number;
  invalidated: boolean;
};

/** One instance per MCP connection. No DB receipt or durable bearer authority. */
export class PlanningReceipts {
  private readonly receipts = new Map<string, Receipt>();
  constructor(private readonly athlete: () => string | undefined, private readonly now = () => new Date()) {}

  issue(context: ReceiptContext) {
    const athlete = this.athlete();
    if (!athlete) throw new PlanningError("ATHLETE_NOT_CONFIGURED", "Set HSPAN_ATHLETE_USER_ID explicitly; never infer ownership from a read.");
    if (context.authority.owner_user_id && context.authority.owner_user_id !== athlete) {
      throw new PlanningError("AUTHORITY_REQUIRED", "Configured athlete does not match the provisioned owner.");
    }
    if (!context.evidence.complete || !context.evidence.queue_history_complete) {
      throw new PlanningError("INCOMPLETE_EVIDENCE");
    }
    const now = this.now();
    if (athleteDate(now, context.athlete_timezone) !== context.today) throw new PlanningError("CONTEXT_CHANGED", "Context local date no longer matches today.");
    const capabilities = ["propose_training_revision"];
    const lifecycle = context.authority.lifecycle;
    if (context.status === "ready" && ["active", "paused"].includes(lifecycle)) {
      capabilities.push("record_training_decision", "legacy:freeform");
      if (lifecycle === "active") {
        capabilities.push("legacy:linked");
        for (const [activity, eligibility] of Object.entries(context.activity_eligibility)) {
          if (eligibility.eligible) capabilities.push(`materialize:${activity}`);
        }
      }
    }
    const bounds = localDayBounds(context.today, context.athlete_timezone);
    const expiresAt = Math.min(now.getTime() + 15 * 60 * 1000, new Date(bounds.end).getTime());
    const receipt: Receipt = {
      id: randomUUID(), athlete, targetDate: context.target_date, localDate: context.today,
      timezone: context.athlete_timezone, versions: { ...context.versions }, capabilities,
      sessionIds: context.sessions.map((session) => session.id), expiresAt, invalidated: false,
    };
    // Keep invalidated/expired entries for identical replay payload reconstruction.
    // Eviction loses only the convenience of omitting versions, never grants authority.
    if (this.receipts.size >= 1000) this.receipts.delete(this.receipts.keys().next().value!);
    this.receipts.set(receipt.id, receipt);
    return { id: receipt.id, expires_at: new Date(expiresAt).toISOString(), capabilities,
      target_date: receipt.targetDate, session_ids: receipt.sessionIds, versions: receipt.versions };
  }

  captured(id: unknown): Versions | undefined {
    return typeof id === "string" ? this.receipts.get(id)?.versions : undefined;
  }

  assert(id: unknown, scope: { capability: string; targetDate?: string; sessionId?: string }, supplied: Versions) {
    const receipt = typeof id === "string" ? this.receipts.get(id) : undefined;
    if (!receipt || receipt.invalidated || receipt.athlete !== this.athlete() ||
        this.now().getTime() >= receipt.expiresAt || athleteDate(this.now(), receipt.timezone) !== receipt.localDate) {
      throw new PlanningError("FRESH_CONTEXT_REQUIRED");
    }
    if (receipt.versions.state !== supplied.state || receipt.versions.evidence !== supplied.evidence) throw new PlanningError("CONTEXT_CHANGED", "Caller versions differ from the context receipt.");
    if (scope.targetDate && receipt.targetDate !== scope.targetDate) throw new PlanningError("CONTEXT_CHANGED", "Receipt is for another target date.");
    if (scope.sessionId && !receipt.sessionIds.includes(scope.sessionId)) throw new PlanningError("CONTEXT_CHANGED", "Occurrence was not included in this context receipt.");
    if (!receipt.capabilities.includes(scope.capability)) throw new PlanningError("AUTHORITY_REQUIRED", "This context receipt does not grant the requested capability; inspect authority and activity-specific eligibility.");
    return receipt;
  }

  invalidate() {
    for (const receipt of this.receipts.values()) receipt.invalidated = true;
  }
}

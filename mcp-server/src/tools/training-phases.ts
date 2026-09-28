import { getSupabase } from "../supabase.ts";

// Training phases: what we did, what we do now, what we plan next. Content is
// owned by the AI coach; the database only enforces a single `current` phase.

export type PhaseStatus = "planned" | "current" | "completed";

const COLUMNS =
  "id, name, status, start_date, end_date, goal, plan, outcome, created_at, updated_at";

type PhaseFields = {
  name?: string;
  status?: PhaseStatus;
  start_date?: string | null;
  end_date?: string | null;
  goal?: string | null;
  plan?: string | null;
  outcome?: string | null;
};

type PhaseRow = PhaseFields & { id: number; status: PhaseStatus; start_date: string | null };

// Friendlier than the raw unique-index / check-constraint violations.
function explain(error: { code?: string; message: string }): Error {
  if (error.code === "23505") {
    return new Error(
      "Another phase is already `current`. Mark it `completed` (with an outcome) " +
        "first, or pass set_current_completed: true."
    );
  }
  if (error.code === "23514") {
    return new Error(`Invalid phase: ${error.message} (end_date must be on/after start_date; name non-empty).`);
  }
  return new Error(error.message);
}

export async function getTrainingPhases() {
  const { data, error } = await getSupabase()
    .from("training_phases")
    .select(COLUMNS);
  if (error) throw explain(error);
  const phases = (data ?? []) as PhaseRow[];

  const byStart = (a: PhaseRow, b: PhaseRow) =>
    (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999") || a.id - b.id;
  return {
    current: phases.find((p) => p.status === "current") ?? null,
    planned: phases.filter((p) => p.status === "planned").sort(byStart),
    // Most recent first: the latest completed phase is usually the relevant one.
    completed: phases.filter((p) => p.status === "completed").sort(byStart).reverse(),
  };
}

// When a phase becomes current, optionally close the existing current phase in
// the same call. The target row is written/validated first, so a bad request
// never leaves the athlete without a current phase.
async function promote(id: number) {
  const supabase = getSupabase();
  const { data: closed, error: closeErr } = await supabase
    .from("training_phases")
    .update({ status: "completed" })
    .eq("status", "current")
    .neq("id", id)
    .select("id, name");
  if (closeErr) throw explain(closeErr);
  const { data, error } = await supabase
    .from("training_phases")
    .update({ status: "current" })
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw explain(error);
  return { phase: data, completed_previous: (closed ?? []) as { id: number; name: string }[] };
}

export async function createTrainingPhase(
  args: PhaseFields & { name: string; set_current_completed?: boolean }
) {
  const { set_current_completed, ...fields } = args;
  const promoting = fields.status === "current" && set_current_completed;
  const { data, error } = await getSupabase()
    .from("training_phases")
    .insert(promoting ? { ...fields, status: "planned" } : fields)
    .select(COLUMNS)
    .single();
  if (error) throw explain(error);
  if (!promoting) return { status: "created" as const, phase: data, completed_previous: [] };
  return { status: "created" as const, ...(await promote((data as PhaseRow).id)) };
}

export async function updateTrainingPhase(
  args: PhaseFields & { id: number; set_current_completed?: boolean }
) {
  const { id, set_current_completed, ...fields } = args;
  if (Object.keys(fields).length === 0) {
    throw new Error("Nothing to update: provide at least one field.");
  }
  const promoting = fields.status === "current" && set_current_completed;
  // When promoting, write the other fields first; status changes last in promote().
  const patch: PhaseFields = { ...fields };
  if (promoting) delete patch.status;
  const supabase = getSupabase();
  const { data, error } = Object.keys(patch).length
    ? await supabase.from("training_phases").update(patch).eq("id", id).select(COLUMNS).maybeSingle()
    : await supabase.from("training_phases").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw explain(error);
  if (!data) throw new Error(`Training phase ${id} not found.`);
  if (!promoting) return { status: "updated" as const, phase: data, completed_previous: [] };
  return { status: "updated" as const, ...(await promote(id)) };
}

// Only planned phases can be deleted: current/completed phases are history.
export async function deleteTrainingPhase(args: { id: number }) {
  const { data, error } = await getSupabase()
    .from("training_phases")
    .delete()
    .eq("id", args.id)
    .eq("status", "planned")
    .select("id, name");
  if (error) throw explain(error);
  if (!data?.length) {
    throw new Error(
      `Training phase ${args.id} not deleted: it does not exist or is not \`planned\`. ` +
        "Current and completed phases are kept as history; update them instead."
    );
  }
  return { status: "deleted" as const, phase: data[0] };
}

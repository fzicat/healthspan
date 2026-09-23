import { getSupabase } from "../supabase.ts";
import { page } from "../read-pages.ts";

export const SET_COLUMNS = "id, exercise_id, logged_at, weight, reps, time, distance, rir, exercises(id, name, metrics, is_deleted)";

type SetQuery = { exercise_id?: number; limit?: number; offset?: number; from?: string; to?: string };
export async function getExerciseHistory(args: SetQuery & { exercise_id: number }) {
  return listSets(args);
}

export async function listSets(args: SetQuery) {
  const limit = args.limit ?? 100;
  const offset = args.offset ?? 0;
  let q = getSupabase().from("sets").select(SET_COLUMNS, { count: "exact" })
    .eq("is_deleted", false).order("logged_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  // Historical actual sets remain visible when an exercise is archived.
  if (args.exercise_id) q = q.eq("exercise_id", args.exercise_id);
  if (args.from) q = q.gte("logged_at", args.from);
  if (args.to) q = q.lte("logged_at", args.to);
  return { ...page(await q, offset, limit), window: { from: args.from ?? null, to: args.to ?? null },
    evidence_kind: "actual_logged_sets", missing_metrics: "null_is_unknown_not_zero" };
}

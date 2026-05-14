import { getSupabase } from "../supabase.ts";

export async function getExerciseHistory(args: {
  exercise_id: number;
  limit?: number;
  from?: string;
  to?: string;
}) {
  const supabase = getSupabase();
  const limit = args.limit ?? 100;

  let q = supabase
    .from("sets")
    .select("id, exercise_id, logged_at, weight, reps, time, distance, rir")
    .eq("exercise_id", args.exercise_id)
    .eq("is_deleted", false)
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (args.from) q = q.gte("logged_at", args.from);
  if (args.to) q = q.lte("logged_at", args.to);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listSets(args: {
  exercise_id?: number;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const supabase = getSupabase();
  const limit = args.limit ?? 100;

  let q = supabase
    .from("sets")
    .select(
      "id, exercise_id, logged_at, weight, reps, time, distance, rir, exercises!inner(id, name, is_deleted)"
    )
    .eq("is_deleted", false)
    .eq("exercises.is_deleted", false)
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (args.exercise_id) q = q.eq("exercise_id", args.exercise_id);
  if (args.from) q = q.gte("logged_at", args.from);
  if (args.to) q = q.lte("logged_at", args.to);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

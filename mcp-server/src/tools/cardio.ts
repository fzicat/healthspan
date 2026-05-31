import { getSupabase } from "../supabase.ts";

const COLUMNS =
  "id, exercise_id, date, duration_minutes, heart_rate_avg, " +
  "heart_rate_max, perceived_intensity, notes, logged_at";

export async function listCardioSessions(args: {
  exercise_id?: number;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const supabase = getSupabase();
  const limit = args.limit ?? 50;

  let q = supabase
    .from("cardio_sessions")
    .select(`${COLUMNS}, exercises!inner(id, name, category, is_deleted)`)
    .eq("is_deleted", false)
    .eq("exercises.is_deleted", false)
    .order("date", { ascending: false })
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (args.exercise_id) q = q.eq("exercise_id", args.exercise_id);
  if (args.from) q = q.gte("date", args.from);
  if (args.to) q = q.lte("date", args.to);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getCardioSessionsByDate(args: { date: string }) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("cardio_sessions")
    .select(`${COLUMNS}, exercises!inner(id, name, category, is_deleted)`)
    .eq("is_deleted", false)
    .eq("exercises.is_deleted", false)
    .eq("date", args.date)
    .order("logged_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

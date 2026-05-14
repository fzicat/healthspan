import { getSupabase } from "../supabase.ts";

export async function searchExercises(args: {
  query?: string;
  limit?: number;
}) {
  const supabase = getSupabase();
  const limit = args.limit ?? 50;

  let q = supabase
    .from("exercises")
    .select("id, name, metrics, created_at")
    .eq("is_deleted", false)
    .order("name", { ascending: true })
    .limit(limit);

  if (args.query && args.query.trim().length > 0) {
    q = q.ilike("name", `%${args.query.trim()}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

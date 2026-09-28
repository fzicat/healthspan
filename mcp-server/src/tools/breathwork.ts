import { getSupabase } from "../supabase.ts";

const COLUMNS =
  "id, date, time, duration_minutes, sauna, type, comments, heart_rate_end, logged_at";

export async function listBreathworkSessions(args: {
  type?: string;
  sauna?: boolean;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const supabase = getSupabase();
  const limit = args.limit ?? 50;

  let q = supabase
    .from("breathwork_sessions")
    .select(COLUMNS)
    .eq("is_deleted", false)
    .order("date", { ascending: false })
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (args.type) q = q.eq("type", args.type);
  if (typeof args.sauna === "boolean") q = q.eq("sauna", args.sauna);
  if (args.from) q = q.gte("date", args.from);
  if (args.to) q = q.lte("date", args.to);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

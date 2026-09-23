import { getSupabase } from "../supabase.ts";
import { page } from "../read-pages.ts";
import { validateDate } from "../dates.ts";

const COLUMNS =
  "id, date, time, duration_minutes, sauna, type, comments, heart_rate_end, logged_at";

export async function listBreathworkSessions(args: {
  type?: string;
  sauna?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const supabase = getSupabase();
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;
  if (args.from) validateDate(args.from);
  if (args.to) validateDate(args.to);

  let q = supabase
    .from("breathwork_sessions")
    .select(COLUMNS, { count: "exact" })
    .eq("is_deleted", false)
    .order("date", { ascending: false })
    .order("logged_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (args.type) q = q.eq("type", args.type);
  if (typeof args.sauna === "boolean") q = q.eq("sauna", args.sauna);
  if (args.from) q = q.gte("date", args.from);
  if (args.to) q = q.lte("date", args.to);

  return page(await q, offset, limit);
}

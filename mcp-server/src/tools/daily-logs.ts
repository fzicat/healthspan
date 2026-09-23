import { getSupabase } from "../supabase.ts";
import { page } from "../read-pages.ts";
import { validateDate } from "../dates.ts";

const COLUMNS =
  "date, sleep_duration_minutes, sleep_score, sleep_hrv_rmssd, " +
  "morning_hrv_rmssd, weight_lbs, calories, protein_g, fat_g, " +
  "carbs_g, alcohol_g, steps, created_at, updated_at";

export async function getDailyLog(args: { date: string }) {
  validateDate(args.date);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("daily_logs")
    .select(COLUMNS)
    .eq("date", args.date)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listDailyLogs(args: {
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const supabase = getSupabase();
  const limit = args.limit ?? 30;
  const offset = args.offset ?? 0;
  if (args.from) validateDate(args.from);
  if (args.to) validateDate(args.to);

  let q = supabase
    .from("daily_logs")
    .select(COLUMNS, { count: "exact" })
    .order("date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (args.from) q = q.gte("date", args.from);
  if (args.to) q = q.lte("date", args.to);

  return page(await q, offset, limit);
}

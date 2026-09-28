import { getSupabase } from "../supabase.ts";

const COLUMNS =
  "date, sleep_duration_minutes, sleep_score, sleep_hrv_rmssd, " +
  "morning_hrv_rmssd, weight_lbs, calories, protein_g, fat_g, " +
  "carbs_g, alcohol_g, steps, created_at, updated_at";

export async function getDailyLog(args: { date: string }) {
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
}) {
  const supabase = getSupabase();
  const limit = args.limit ?? 30;

  let q = supabase
    .from("daily_logs")
    .select(COLUMNS)
    .order("date", { ascending: false })
    .limit(limit);

  if (args.from) q = q.gte("date", args.from);
  if (args.to) q = q.lte("date", args.to);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

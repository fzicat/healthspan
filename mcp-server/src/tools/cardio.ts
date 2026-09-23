import { getSupabase } from "../supabase.ts";
import { page, readAll } from "../read-pages.ts";
import { validateDate } from "../dates.ts";

const COLUMNS = "id, exercise_id, date, duration_minutes, heart_rate_avg, heart_rate_max, perceived_intensity, notes, logged_at, exercises(id, name, category, is_deleted)";
export async function listCardioSessions(args: { exercise_id?: number; from?: string; to?: string; limit?: number; offset?: number }) {
  if (args.from) validateDate(args.from);
  if (args.to) validateDate(args.to);
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;
  let q = getSupabase().from("cardio_sessions").select(COLUMNS, { count: "exact" }).eq("is_deleted", false)
    .order("date", { ascending: false }).order("logged_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
  if (args.exercise_id) q = q.eq("exercise_id", args.exercise_id);
  if (args.from) q = q.gte("date", args.from);
  if (args.to) q = q.lte("date", args.to);
  return page(await q, offset, limit);
}
export async function getCardioSessionsByDate(args: { date: string }) {
  validateDate(args.date);
  return readAll((start, end) => getSupabase().from("cardio_sessions").select(COLUMNS, { count: "exact" })
    .eq("is_deleted", false).eq("date", args.date).order("logged_at", { ascending: true }).order("id", { ascending: true }).range(start, end));
}

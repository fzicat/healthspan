import { getSupabase } from "../supabase.ts";
import { getCardioSessionsByDate } from "./cardio.ts";
import { SET_COLUMNS } from "./sets.ts";
import { page, readAll, readTimezone } from "../read-pages.ts";
import { localDayBounds, validateDate } from "../dates.ts";
import type { LegacyGuard, TrainingPlanning } from "./training-planning.ts";

// All four routes share the same connection-scoped guard and protected SQL path.
// There is no direct service-role workout writer to accidentally bypass it.
export async function createOrUpdateWorkout(args: LegacyGuard & { date: string; name?: string | null; note?: string | null }, planning: TrainingPlanning) {
  return planning.mutateWorkout("create_or_update_workout", args);
}
export async function addWorkoutExercise(args: LegacyGuard & { date: string; exercise_id: number; details?: string | null; note?: string | null; sort_order?: number }, planning: TrainingPlanning) {
  return planning.mutateWorkout("add_workout_exercise", args);
}
export async function updateWorkoutExercise(args: LegacyGuard & { workout_exercise_id: number; details?: string | null; note?: string | null; sort_order?: number }, planning: TrainingPlanning) {
  return planning.mutateWorkout("update_workout_exercise", args);
}
export async function removeWorkoutExercise(args: LegacyGuard & { workout_exercise_id: number }, planning: TrainingPlanning) {
  return planning.mutateWorkout("remove_workout_exercise", args);
}

export async function listRecentWorkouts(args: { limit?: number; before_date?: string }) {
  if (args.before_date) validateDate(args.before_date);
  const limit = args.limit ?? 20;
  let q = getSupabase().from("workouts").select(`id, date, name, note,
    workouts_exercises(id, sort_order, details, note, exercises(id, name, metrics, is_deleted))`, { count: "exact" })
    .order("date", { ascending: false }).range(0, limit - 1);
  if (args.before_date) q = q.lt("date", args.before_date);
  const result = page(await q, 0, limit);
  return { ...result, next_before_date: result.has_more ? result.items.at(-1)?.date ?? null : null,
    evidence_kind: "planned_workouts_not_execution" };
}

export async function getWorkoutByDate(args: { date: string }) {
  validateDate(args.date);
  const timezone = readTimezone();
  const bounds = localDayBounds(args.date, timezone);
  const supabase = getSupabase();
  // Never return early just because no workout was scheduled on this day.
  const [workoutResult, sets, cardio] = await Promise.all([
    supabase.from("workouts").select("id, date, name, note").eq("date", args.date).maybeSingle(),
    readAll((start, end) => supabase.from("sets").select(SET_COLUMNS, { count: "exact" }).eq("is_deleted", false)
      .gte("logged_at", bounds.start).lt("logged_at", bounds.end)
      .order("logged_at", { ascending: true }).order("id", { ascending: true }).range(start, end)),
    getCardioSessionsByDate(args),
  ]);
  if (workoutResult.error) throw workoutResult.error;
  const workout = workoutResult.data;
  const planned = workout ? await readAll((start, end) => supabase.from("workouts_exercises")
    .select("id, exercise_id, sort_order, details, note, exercises(id, name, metrics, is_deleted)", { count: "exact" })
    .eq("workout_id", workout.id).order("sort_order", { ascending: true }).order("id", { ascending: true }).range(start, end))
    : { items: [], complete: true, total: 0, has_more: false, next_offset: null, returned_count: 0, consistency: "non_atomic" as const };
  const { items: logged_sets, ...setsPage } = sets;
  const { items: planned_exercises, ...plannedPage } = planned;
  const { items: cardio_sessions, ...cardioPage } = cardio;
  return { id: workout?.id ?? null, date: args.date, name: workout?.name ?? null, note: workout?.note ?? null,
    athlete_timezone: timezone, window: { from_inclusive: bounds.start, to_exclusive: bounds.end },
    planned_exercises, logged_sets, cardio_sessions,
    complete: sets.complete && planned.complete && cardio.complete,
    completeness: { logged_sets: setsPage, planned_exercises: plannedPage, cardio_sessions: cardioPage },
    consistency: "non_atomic", association: "Same local date is not proof of occurrence linkage or qualification." };
}

export async function getSummary(args: { from?: string; to?: string }) {
  if (args.from) validateDate(args.from);
  if (args.to) validateDate(args.to);
  if (args.from && args.to && args.from > args.to) throw new Error("Invalid date range");
  const supabase = getSupabase();
  const timezone = readTimezone();
  const lower = args.from ? localDayBounds(args.from, timezone).start : null;
  const upper = args.to ? localDayBounds(args.to, timezone).end : null;
  let workoutQ = supabase.from("workouts").select("id", { count: "exact", head: true });
  if (args.from) workoutQ = workoutQ.gte("date", args.from);
  if (args.to) workoutQ = workoutQ.lte("date", args.to);
  const [workouts, sets] = await Promise.all([workoutQ, readAll((start, end) => {
    let q = supabase.from("sets").select("id, exercise_id, exercises(id, name, is_deleted)", { count: "exact" })
      .eq("is_deleted", false).order("id", { ascending: true }).range(start, end);
    if (lower) q = q.gte("logged_at", lower);
    if (upper) q = q.lt("logged_at", upper);
    return q;
  })]);
  if (workouts.error) throw workouts.error;
  const tally = new Map<number, { exercise_id: number; name: string | null; library_status: string; set_count: number }>();
  for (const row of sets.items) {
    const exercise = row.exercises as unknown as { name: string; is_deleted: boolean } | null;
    const current = tally.get(row.exercise_id);
    if (current) current.set_count++;
    else tally.set(row.exercise_id, { exercise_id: row.exercise_id, name: exercise?.name ?? null,
      library_status: !exercise ? "missing" : exercise.is_deleted ? "archived" : "active", set_count: 1 });
  }
  return { from: args.from ?? null, to: args.to ?? null, athlete_timezone: timezone,
    workout_count: workouts.count, workout_count_semantics: "planned_rows_not_performed_sessions",
    set_count: sets.total, sets_by_exercise: [...tally.values()].sort((a, b) => b.set_count - a.set_count),
    complete: workouts.count !== null && sets.complete, tally_returned_set_count: sets.returned_count,
    has_more: sets.has_more, next_offset: sets.next_offset, consistency: "non_atomic" };
}

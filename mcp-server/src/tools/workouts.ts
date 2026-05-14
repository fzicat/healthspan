import { getSupabase } from "../supabase.ts";

type WorkoutRow = { id: number; date: string };
type ExerciseRow = {
  id: number;
  name: string;
  is_deleted: boolean;
  metrics?: unknown;
};
type WorkoutExerciseJoined = {
  id?: number;
  sort_order: number;
  details: string | null;
  exercises: ExerciseRow;
};
type WorkoutWithExercises = WorkoutRow & {
  workouts_exercises: WorkoutExerciseJoined[] | null;
};
type SetJoined = {
  id: number;
  exercise_id: number;
  logged_at: string;
  weight: number | null;
  reps: number | null;
  time: number | null;
  distance: number | null;
  rir: number | null;
  exercises: ExerciseRow;
};

export async function listRecentWorkouts(args: {
  limit?: number;
  before_date?: string;
}) {
  const supabase = getSupabase();
  const limit = args.limit ?? 20;

  let q = supabase
    .from("workouts")
    .select(
      `id, date,
       workouts_exercises (
         sort_order,
         details,
         exercises!inner ( id, name, is_deleted )
       )`
    )
    .order("date", { ascending: false })
    .limit(limit);

  if (args.before_date) q = q.lt("date", args.before_date);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as unknown as WorkoutWithExercises[];

  return rows.map((w) => ({
    id: w.id,
    date: w.date,
    exercises: (w.workouts_exercises ?? [])
      .filter((we) => !we.exercises?.is_deleted)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((we) => ({
        sort_order: we.sort_order,
        details: we.details,
        exercise_id: we.exercises.id,
        name: we.exercises.name,
      })),
  }));
}

export async function getWorkoutByDate(args: { date: string }) {
  const supabase = getSupabase();

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .select("id, date")
    .eq("date", args.date)
    .maybeSingle();

  if (wErr) throw wErr;
  if (!workout) return null;

  const w = workout as unknown as WorkoutRow;

  const { data: planned, error: pErr } = await supabase
    .from("workouts_exercises")
    .select(
      "id, sort_order, details, exercises!inner(id, name, metrics, is_deleted)"
    )
    .eq("workout_id", w.id)
    .eq("exercises.is_deleted", false)
    .order("sort_order", { ascending: true });

  if (pErr) throw pErr;

  const startOfDay = `${args.date}T00:00:00.000Z`;
  const endOfDay = `${args.date}T23:59:59.999Z`;

  const { data: sets, error: sErr } = await supabase
    .from("sets")
    .select(
      "id, exercise_id, logged_at, weight, reps, time, distance, rir, exercises!inner(id, name, is_deleted)"
    )
    .eq("is_deleted", false)
    .eq("exercises.is_deleted", false)
    .gte("logged_at", startOfDay)
    .lte("logged_at", endOfDay)
    .order("logged_at", { ascending: true });

  if (sErr) throw sErr;

  return {
    id: w.id,
    date: w.date,
    planned_exercises: (planned ?? []) as unknown as WorkoutExerciseJoined[],
    logged_sets: (sets ?? []) as unknown as SetJoined[],
  };
}

export async function getSummary(args: { from?: string; to?: string }) {
  const supabase = getSupabase();

  let workoutQ = supabase
    .from("workouts")
    .select("id", { count: "exact", head: true });
  if (args.from) workoutQ = workoutQ.gte("date", args.from);
  if (args.to) workoutQ = workoutQ.lte("date", args.to);
  const { count: workout_count, error: wErr } = await workoutQ;
  if (wErr) throw wErr;

  let setQ = supabase
    .from("sets")
    .select("id", { count: "exact", head: true })
    .eq("is_deleted", false);
  if (args.from) setQ = setQ.gte("logged_at", `${args.from}T00:00:00.000Z`);
  if (args.to) setQ = setQ.lte("logged_at", `${args.to}T23:59:59.999Z`);
  const { count: set_count, error: sErr } = await setQ;
  if (sErr) throw sErr;

  let perExerciseQ = supabase
    .from("sets")
    .select("exercise_id, exercises!inner(id, name, is_deleted)")
    .eq("is_deleted", false)
    .eq("exercises.is_deleted", false);
  if (args.from)
    perExerciseQ = perExerciseQ.gte("logged_at", `${args.from}T00:00:00.000Z`);
  if (args.to)
    perExerciseQ = perExerciseQ.lte("logged_at", `${args.to}T23:59:59.999Z`);
  const { data: rows, error: eErr } = await perExerciseQ;
  if (eErr) throw eErr;

  type Row = { exercise_id: number; exercises: ExerciseRow };
  const typedRows = (rows ?? []) as unknown as Row[];

  const tally = new Map<
    number,
    { exercise_id: number; name: string; set_count: number }
  >();
  for (const r of typedRows) {
    const cur = tally.get(r.exercise_id);
    if (cur) cur.set_count += 1;
    else
      tally.set(r.exercise_id, {
        exercise_id: r.exercise_id,
        name: r.exercises.name,
        set_count: 1,
      });
  }
  const sets_by_exercise = Array.from(tally.values()).sort(
    (a, b) => b.set_count - a.set_count
  );

  return {
    from: args.from ?? null,
    to: args.to ?? null,
    workout_count: workout_count ?? 0,
    set_count: set_count ?? 0,
    sets_by_exercise,
  };
}

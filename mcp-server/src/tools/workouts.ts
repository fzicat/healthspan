import { getSupabase } from "../supabase.ts";
import { getCardioSessionsByDate } from "./cardio.ts";

// --- Write guardrails ---------------------------------------------------
// The MCP server uses the service-role key (RLS is bypassed), so the
// "today or later" edit window must be enforced here in code.

function today(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ISO YYYY-MM-DD strings compare chronologically as plain strings.
function assertEditable(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date "${date}". Expected YYYY-MM-DD.`);
  }
  if (date < today()) {
    throw new Error(
      `Cannot edit ${date}: it is in the past. The agent may only create or edit ` +
        `workouts dated today (${today()}) or later.`
    );
  }
}

// Resolve the workout row for a date, creating it if missing. Caller guards date.
async function getOrCreateWorkoutRow(date: string) {
  const supabase = getSupabase();

  const { data: existing, error: selErr } = await supabase
    .from("workouts")
    .select("id, date, name, note")
    .eq("date", date)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing;

  const { data: created, error: insErr } = await supabase
    .from("workouts")
    .insert({ date })
    .select("id, date, name, note")
    .single();
  if (insErr) throw insErr;
  return created;
}

// Create a workout for a date (if absent) and/or update its name/note.
export async function createOrUpdateWorkout(args: {
  date: string;
  name?: string | null;
  note?: string | null;
}) {
  assertEditable(args.date);
  const supabase = getSupabase();

  const workout = await getOrCreateWorkoutRow(args.date);

  const patch: { name?: string | null; note?: string | null } = {};
  if (args.name !== undefined) patch.name = args.name;
  if (args.note !== undefined) patch.note = args.note;

  if (Object.keys(patch).length === 0) {
    return { status: "ok" as const, workout };
  }

  const { data, error } = await supabase
    .from("workouts")
    .update(patch)
    .eq("id", workout.id)
    .select("id, date, name, note")
    .single();
  if (error) throw error;
  return { status: "ok" as const, workout: data };
}

// Add an exercise to a workout's plan (creates the workout if needed).
export async function addWorkoutExercise(args: {
  date: string;
  exercise_id: number;
  details?: string | null;
  note?: string | null;
  sort_order?: number;
}) {
  assertEditable(args.date);
  const supabase = getSupabase();

  // Verify the exercise exists and isn't soft-deleted.
  const { data: exercise, error: exErr } = await supabase
    .from("exercises")
    .select("id, name, is_deleted")
    .eq("id", args.exercise_id)
    .maybeSingle();
  if (exErr) throw exErr;
  if (!exercise || exercise.is_deleted) {
    throw new Error(
      `exercise_id ${args.exercise_id} does not exist (or is deleted). ` +
        `Resolve it with search_exercises / create_exercise first.`
    );
  }

  const workout = await getOrCreateWorkoutRow(args.date);

  let sort_order = args.sort_order;
  if (sort_order === undefined) {
    const { data: last } = await supabase
      .from("workouts_exercises")
      .select("sort_order")
      .eq("workout_id", workout.id)
      .order("sort_order", { ascending: false })
      .limit(1);
    sort_order = (last?.[0]?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from("workouts_exercises")
    .insert({
      workout_id: workout.id,
      exercise_id: args.exercise_id,
      sort_order,
      details: args.details ?? null,
      note: args.note ?? null,
    })
    .select("id, workout_id, exercise_id, sort_order, details, note")
    .single();
  if (error) throw error;

  return { status: "created" as const, workout_exercise: data };
}

// Look up the workout date that owns a workouts_exercises row.
async function getWorkoutExerciseDate(workoutExerciseId: number) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("workouts_exercises")
    .select("id, workout_id, workouts!inner(date)")
    .eq("id", workoutExerciseId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`workout_exercise_id ${workoutExerciseId} not found.`);
  }
  const date = (data as unknown as { workouts: { date: string } }).workouts.date;
  return date;
}

// Update details / note / sort_order of a planned exercise.
export async function updateWorkoutExercise(args: {
  workout_exercise_id: number;
  details?: string | null;
  note?: string | null;
  sort_order?: number;
}) {
  const date = await getWorkoutExerciseDate(args.workout_exercise_id);
  assertEditable(date);
  const supabase = getSupabase();

  const patch: { details?: string | null; note?: string | null; sort_order?: number } = {};
  if (args.details !== undefined) patch.details = args.details;
  if (args.note !== undefined) patch.note = args.note;
  if (args.sort_order !== undefined) patch.sort_order = args.sort_order;

  if (Object.keys(patch).length === 0) {
    throw new Error("Nothing to update: provide details, note, or sort_order.");
  }

  const { data, error } = await supabase
    .from("workouts_exercises")
    .update(patch)
    .eq("id", args.workout_exercise_id)
    .select("id, workout_id, exercise_id, sort_order, details, note")
    .single();
  if (error) throw error;
  return { status: "ok" as const, workout_exercise: data };
}

// Remove a planned exercise from a workout.
export async function removeWorkoutExercise(args: {
  workout_exercise_id: number;
}) {
  const date = await getWorkoutExerciseDate(args.workout_exercise_id);
  assertEditable(date);
  const supabase = getSupabase();

  const { error } = await supabase
    .from("workouts_exercises")
    .delete()
    .eq("id", args.workout_exercise_id);
  if (error) throw error;
  return { status: "deleted" as const, workout_exercise_id: args.workout_exercise_id };
}

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

  const cardio_sessions = await getCardioSessionsByDate({ date: args.date });

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .select("id, date")
    .eq("date", args.date)
    .maybeSingle();

  if (wErr) throw wErr;
  if (!workout) {
    if (cardio_sessions.length === 0) return null;
    return {
      id: null,
      date: args.date,
      planned_exercises: [],
      logged_sets: [],
      cardio_sessions,
    };
  }

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
    cardio_sessions,
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

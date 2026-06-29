import { getSupabase } from "../supabase.ts";

type SimilarExercise = {
  id: number;
  name: string;
  category: string;
  similarity: number;
};

const DEFAULT_METRICS = {
  weight: true,
  reps: true,
  time: false,
  distance: false,
  unilateral: false,
  dual_implements: false,
};

export async function searchExercises(args: {
  query?: string;
  category?: "strength" | "cardio";
  limit?: number;
}) {
  const supabase = getSupabase();
  const limit = args.limit ?? 50;

  let q = supabase
    .from("exercises")
    .select("id, name, category, metrics, created_at")
    .eq("is_deleted", false)
    .order("name", { ascending: true })
    .limit(limit);

  if (args.query && args.query.trim().length > 0) {
    q = q.ilike("name", `%${args.query.trim()}%`);
  }
  if (args.category) q = q.eq("category", args.category);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Fuzzy search for existing exercises that resemble a candidate name.
// Backed by the find_similar_exercises Postgres function (pg_trgm).
export async function findSimilarExercises(args: {
  query: string;
  threshold?: number;
  limit?: number;
}): Promise<SimilarExercise[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("find_similar_exercises", {
    p_query: args.query.trim(),
    p_threshold: args.threshold ?? 0.3,
    p_limit: args.limit ?? 10,
  });
  if (error) throw error;
  return (data ?? []) as SimilarExercise[];
}

// Create a new exercise, guarding against duplicates.
//
// Strength exercises have many aliases ("DB Bench Press" == "Dumbbell Chest
// Press"), so this does NOT insert blindly: it first runs a fuzzy similarity
// search. If any existing exercise looks similar and confirm_create is not set,
// it refuses and returns the candidates so the caller can reuse an existing id
// or confirm the new one is genuinely distinct. The DB unique index on
// LOWER(name) is the final backstop against exact dupes.
export async function createExercise(args: {
  name: string;
  category?: "strength" | "cardio";
  metrics?: Record<string, boolean>;
  confirm_create?: boolean;
}) {
  const supabase = getSupabase();
  const name = args.name.trim();

  if (!name) {
    return { status: "error" as const, message: "Exercise name is required." };
  }

  if (!args.confirm_create) {
    const candidates = await findSimilarExercises({ query: name });
    if (candidates.length > 0) {
      return {
        status: "possible_duplicate" as const,
        message:
          "Similar exercise(s) already exist. Reuse one of these exercise_id values " +
          "if it is the same movement (consider abbreviations/synonyms, e.g. 'DB' = " +
          "'Dumbbell'). Only if none is the same, call again with confirm_create=true.",
        candidates,
      };
    }
  }

  const { data, error } = await supabase
    .from("exercises")
    .insert({
      name,
      category: args.category ?? "strength",
      metrics: args.metrics ?? DEFAULT_METRICS,
    })
    .select("id, name, category, metrics, created_at")
    .single();

  if (error) {
    // 23505 = unique_violation on the LOWER(name) index
    if ((error as { code?: string }).code === "23505") {
      return {
        status: "already_exists" as const,
        message: `An exercise named "${name}" already exists.`,
      };
    }
    throw error;
  }

  return { status: "created" as const, exercise: data };
}

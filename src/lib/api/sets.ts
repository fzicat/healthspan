import { Set, SetInsert, SetUpdate, SetWithExercise, Exercise } from '@/types/database'
import { createClient } from '@/lib/supabase/client'

// Get sets for an exercise with pagination
export async function getSetsForExercise(
    exerciseId: number,
    page = 1,
    pageSize = 50
): Promise<{ sets: Set[]; hasMore: boolean }> {
    const supabase = createClient()
    const from = (page - 1) * pageSize
    const to = from + pageSize

    const { data, error, count } = await supabase
        .from('sets')
        .select('*', { count: 'exact' })
        .eq('exercise_id', exerciseId)
        .eq('is_deleted', false)
        .order('logged_at', { ascending: false })
        .range(from, to - 1)

    if (error) throw error

    return {
        sets: data ?? [],
        hasMore: (count ?? 0) > to
    }
}

// Get the last logged set for an exercise (for pre-fill)
export async function getLastSetForExercise(exerciseId: number): Promise<Set | null> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('sets')
        .select('*')
        .eq('exercise_id', exerciseId)
        .eq('is_deleted', false)
        .order('logged_at', { ascending: false })
        .limit(1)
        .single()

    if (error) {
        if (error.code === 'PGRST116') return null // Not found
        throw error
    }
    return data
}

// Get a single set by ID
export async function getSet(id: number): Promise<Set | null> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('sets')
        .select('*')
        .eq('id', id)
        .eq('is_deleted', false)
        .single()

    if (error) {
        if (error.code === 'PGRST116') return null
        throw error
    }
    return data
}

// Create a new set
export async function createSet(
    exerciseId: number,
    values: {
        weight?: number | null
        reps?: number | null
        time?: number | null
        distance?: number | null
        rir?: number | null
    }
): Promise<Set> {
    const supabase = createClient()
    const insert: SetInsert = {
        exercise_id: exerciseId,
        weight: values.weight ?? null,
        reps: values.reps ?? null,
        time: values.time ?? null,
        distance: values.distance ?? null,
        rir: values.rir ?? null,
    }

    const { data, error } = await supabase
        .from('sets')
        .insert(insert)
        .select()
        .single()

    if (error) throw error
    return data
}

// Update a set
export async function updateSet(
    id: number,
    values: {
        weight?: number | null
        reps?: number | null
        time?: number | null
        distance?: number | null
        rir?: number | null
    }
): Promise<Set> {
    const supabase = createClient()
    const update: SetUpdate = {}

    if ('weight' in values) update.weight = values.weight
    if ('reps' in values) update.reps = values.reps
    if ('time' in values) update.time = values.time
    if ('distance' in values) update.distance = values.distance
    if ('rir' in values) update.rir = values.rir

    const { data, error } = await supabase
        .from('sets')
        .update(update)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data
}

// Soft delete a set
export async function deleteSet(id: number): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
        .from('sets')
        .update({ is_deleted: true })
        .eq('id', id)

    if (error) throw error
}

// Get all sets logged on a specific date with their exercises
export async function getSetsForDate(date: string): Promise<SetWithExercise[]> {
    const supabase = createClient()
    const startOfDay = `${date}T00:00:00.000Z`
    const endOfDay = `${date}T23:59:59.999Z`

    const { data, error } = await supabase
        .from('sets')
        .select(`
      *,
      exercises!inner(*)
    `)
        .eq('is_deleted', false)
        .eq('exercises.is_deleted', false)
        .gte('logged_at', startOfDay)
        .lte('logged_at', endOfDay)
        .order('logged_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as SetWithExercise[]
}

// Get unique exercises from sets logged on a date (for Repeat a Day)
export async function getExercisesFromDate(date: string): Promise<{ exercise: Exercise; summary: string }[]> {
    const setsWithExercises = await getSetsForDate(date)

    // Group by exercise
    const exerciseMap = new Map<number, { exercise: Exercise; sets: Set[] }>()

    for (const set of setsWithExercises) {
        const existing = exerciseMap.get(set.exercise_id)
        if (existing) {
            existing.sets.push(set)
        } else {
            exerciseMap.set(set.exercise_id, {
                exercise: set.exercises,
                sets: [set]
            })
        }
    }

    // Generate summaries
    return Array.from(exerciseMap.values()).map(({ exercise, sets }) => {
        const summary = generateSetSummary(sets, exercise)
        return { exercise, summary }
    })
}

// Generate a summary string from sets (for auto-generated details)
function generateSetSummary(sets: Set[], exercise: Exercise): string {
    const metrics = exercise.metrics
    const parts: string[] = []

    // Count sets
    parts.push(`${sets.length} sets`)

    // Analyze reps range
    if (metrics.reps) {
        const reps = sets.map(s => s.reps).filter((r): r is number => r !== null)
        if (reps.length > 0) {
            const minReps = Math.min(...reps)
            const maxReps = Math.max(...reps)
            parts.push(minReps === maxReps ? `× ${minReps} reps` : `× ${minReps}-${maxReps} reps`)
        }
    }

    // Show weight range
    if (metrics.weight) {
        const weights = sets.map(s => s.weight).filter((w): w is number => w !== null)
        if (weights.length > 0) {
            const maxWeight = Math.max(...weights)
            parts.push(`@ ${maxWeight} lbs`)
        }
    }

    return parts.join(' ')
}

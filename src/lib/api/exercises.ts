import { Exercise, ExerciseMetrics, ExerciseInsert, ExerciseUpdate } from '@/types/database'
import { createClient } from '@/lib/supabase/client'

// Get all non-deleted exercises
export async function getExercises(): Promise<Exercise[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('is_deleted', false)
        .order('name', { ascending: true })

    if (error) throw error
    return data ?? []
}

// Get a single exercise by ID
export async function getExercise(id: number): Promise<Exercise | null> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', id)
        .eq('is_deleted', false)
        .single()

    if (error) {
        if (error.code === 'PGRST116') return null // Not found
        throw error
    }
    return data
}

// Search exercises by name (MRU sorted)
export async function searchExercises(query: string, limit = 10): Promise<Exercise[]> {
    const supabase = createClient()

    // Get exercises matching the query
    const queryBuilder = supabase
        .from('exercises')
        .select('*')
        .eq('is_deleted', false)
        .ilike('name', `%${query}%`)
        .limit(limit)

    const { data, error } = await queryBuilder

    if (error) throw error
    return data ?? []
}

// Get exercises sorted by most recently used (based on sets logged_at)
export async function getMRUExercises(limit = 10): Promise<Exercise[]> {
    const supabase = createClient()

    // Get recent sets to find which exercises were used recently
    const { data: recentSets, error: setsError } = await supabase
        .from('sets')
        .select('exercise_id')
        .eq('is_deleted', false)
        .order('logged_at', { ascending: false })
        .limit(100)

    if (setsError || !recentSets || recentSets.length === 0) {
        // Fall back to regular exercise list sorted by name
        return getExercises()
    }

    // Get unique exercise IDs in MRU order
    const seen = new Set<number>()
    const mruExerciseIds: number[] = []
    for (const set of recentSets) {
        if (!seen.has(set.exercise_id) && mruExerciseIds.length < limit) {
            seen.add(set.exercise_id)
            mruExerciseIds.push(set.exercise_id)
        }
    }

    if (mruExerciseIds.length === 0) {
        return getExercises()
    }

    // Fetch the actual exercise records
    const { data: exercises, error } = await supabase
        .from('exercises')
        .select('*')
        .in('id', mruExerciseIds)
        .eq('is_deleted', false)

    if (error) throw error

    // Sort by MRU order
    const exerciseMap = new Map((exercises ?? []).map(e => [e.id, e]))
    return mruExerciseIds
        .map(id => exerciseMap.get(id))
        .filter((e): e is Exercise => e !== undefined)
}

// Create a new exercise
export async function createExercise(
    name: string,
    metrics: ExerciseMetrics = { weight: true, reps: true, time: false, distance: false, unilateral: false, dual_implements: false }
): Promise<Exercise> {
    const supabase = createClient()
    const insert: ExerciseInsert = { name: name.trim(), metrics }

    const { data, error } = await supabase
        .from('exercises')
        .insert(insert)
        .select()
        .single()

    if (error) throw error
    return data
}

// Update an exercise
export async function updateExercise(
    id: number,
    updates: { name?: string; metrics?: ExerciseMetrics }
): Promise<Exercise> {
    const supabase = createClient()
    const update: ExerciseUpdate = {}

    if (updates.name !== undefined) update.name = updates.name.trim()
    if (updates.metrics !== undefined) update.metrics = updates.metrics

    const { data, error } = await supabase
        .from('exercises')
        .update(update)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data
}

// Soft delete an exercise
export async function deleteExercise(id: number): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
        .from('exercises')
        .update({ is_deleted: true })
        .eq('id', id)

    if (error) throw error
}

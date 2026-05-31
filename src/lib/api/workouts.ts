import {
    Workout,
    WorkoutExercise,
    WorkoutExerciseWithExercise,
    WorkoutExerciseInsert,
    WorkoutWithPreview
} from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getExercisesFromDate } from './sets'

// Get workout for a specific date
export async function getWorkoutForDate(date: string): Promise<{
    workout: Workout | null
    exercises: WorkoutExerciseWithExercise[]
}> {
    const supabase = createClient()

    // Get workout
    const { data: workout, error: workoutError } = await supabase
        .from('workouts')
        .select('*')
        .eq('date', date)
        .maybeSingle()

    if (workoutError) throw workoutError
    if (!workout) return { workout: null, exercises: [] }

    // Get exercises for this workout
    const { data: exercises, error: exercisesError } = await supabase
        .from('workouts_exercises')
        .select(`
      *,
      exercises!inner(*)
    `)
        .eq('workout_id', workout.id)
        .eq('exercises.is_deleted', false)
        .order('sort_order', { ascending: true })

    if (exercisesError) throw exercisesError

    return {
        workout,
        exercises: (exercises ?? []) as WorkoutExerciseWithExercise[]
    }
}

// Get or create workout for a date
export async function getOrCreateWorkout(date: string): Promise<Workout> {
    const supabase = createClient()

    // Try to get existing
    const { data: existing } = await supabase
        .from('workouts')
        .select('*')
        .eq('date', date)
        .single()

    if (existing) return existing

    // Create new
    const { data, error } = await supabase
        .from('workouts')
        .insert({ date })
        .select()
        .single()

    if (error) throw error
    return data
}

// Add exercise to workout
export async function addExerciseToWorkout(
    workoutId: number,
    exerciseId: number,
    details?: string
): Promise<WorkoutExercise> {
    const supabase = createClient()

    // Get current max sort_order
    const { data: existing } = await supabase
        .from('workouts_exercises')
        .select('sort_order')
        .eq('workout_id', workoutId)
        .order('sort_order', { ascending: false })
        .limit(1)

    const maxOrder = existing?.[0]?.sort_order ?? -1

    const insert: WorkoutExerciseInsert = {
        workout_id: workoutId,
        exercise_id: exerciseId,
        sort_order: maxOrder + 1,
        details: details ?? null
    }

    const { data, error } = await supabase
        .from('workouts_exercises')
        .insert(insert)
        .select()
        .single()

    if (error) throw error
    return data
}

// Remove exercise from workout
export async function removeExerciseFromWorkout(
    workoutExerciseId: number
): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
        .from('workouts_exercises')
        .delete()
        .eq('id', workoutExerciseId)

    if (error) throw error
}

// Update exercise details in workout
export async function updateWorkoutExerciseDetails(
    workoutExerciseId: number,
    details: string
): Promise<WorkoutExercise> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('workouts_exercises')
        .update({ details })
        .eq('id', workoutExerciseId)
        .select()
        .single()

    if (error) throw error
    return data
}

// Reorder exercises in workout
export async function reorderWorkoutExercises(
    workoutId: number,
    orderedIds: number[]
): Promise<void> {
    const supabase = createClient()

    // Update each exercise's sort_order
    const updates = orderedIds.map((id, index) =>
        supabase
            .from('workouts_exercises')
            .update({ sort_order: index })
            .eq('id', id)
            .eq('workout_id', workoutId)
    )

    await Promise.all(updates)
}

// Repeat a day: copy exercises from another date to today's workout
export async function repeatDay(
    sourceDate: string,
    targetDate: string
): Promise<void> {
    const supabase = createClient()

    // Get exercises from source date (based on logged sets)
    const exercisesFromDate = await getExercisesFromDate(sourceDate)

    if (exercisesFromDate.length === 0) {
        throw new Error('No exercises found on that date')
    }

    // Get or create target workout
    const targetWorkout = await getOrCreateWorkout(targetDate)

    // Clear existing exercises from target workout
    await supabase
        .from('workouts_exercises')
        .delete()
        .eq('workout_id', targetWorkout.id)

    // Add exercises from source date
    const inserts: WorkoutExerciseInsert[] = exercisesFromDate.map((item, index) => ({
        workout_id: targetWorkout.id,
        exercise_id: item.exercise.id,
        sort_order: index,
        details: item.summary
    }))

    const { error } = await supabase
        .from('workouts_exercises')
        .insert(inserts)

    if (error) throw error
}

// Get all workouts with exercise preview
export async function getAllWorkouts(): Promise<WorkoutWithPreview[]> {
    const supabase = createClient()

    // Get all workouts with their exercises
    const { data: workouts, error: workoutsError } = await supabase
        .from('workouts')
        .select(`
            *,
            workouts_exercises (
                exercises!inner (
                    id,
                    name,
                    is_deleted
                )
            )
        `)
        .order('date', { ascending: true })

    if (workoutsError) throw workoutsError

    // Transform to WorkoutWithPreview
    return (workouts ?? []).map(workout => {
        const exercises = (workout.workouts_exercises ?? [])
            .filter((we: { exercises: { is_deleted: boolean } }) => !we.exercises.is_deleted)
            .map((we: { exercises: { name: string } }) => we.exercises.name)

        return {
            id: workout.id,
            date: workout.date,
            exercise_count: exercises.length,
            exercise_names: exercises.slice(0, 3)
        }
    })
}

// Get exercise details for a specific date (from workouts_exercises)
export async function getExerciseDetailsForDate(
    exerciseId: number,
    date: string
): Promise<string | null> {
    const supabase = createClient()

    const { data: workout } = await supabase
        .from('workouts')
        .select('id')
        .eq('date', date)
        .single()

    if (!workout) return null

    const { data } = await supabase
        .from('workouts_exercises')
        .select('details')
        .eq('workout_id', workout.id)
        .eq('exercise_id', exerciseId)
        .single()

    return data?.details ?? null
}

// Get adjacent exercises in today's workout plan
export async function getAdjacentExercises(
    exerciseId: number,
    date: string
): Promise<{
    prev: { id: number; name: string } | null
    next: { id: number; name: string } | null
}> {
    const { exercises } = await getWorkoutForDate(date)

    if (exercises.length === 0) {
        return { prev: null, next: null }
    }

    const currentIndex = exercises.findIndex(e => e.exercise_id === exerciseId)

    if (currentIndex === -1) {
        return { prev: null, next: null }
    }

    const prev = currentIndex > 0
        ? { id: exercises[currentIndex - 1].exercise_id, name: exercises[currentIndex - 1].exercises.name }
        : null

    const next = currentIndex < exercises.length - 1
        ? { id: exercises[currentIndex + 1].exercise_id, name: exercises[currentIndex + 1].exercises.name }
        : null

    return { prev, next }
}

// Delete a workout and all its exercises
export async function deleteWorkout(workoutId: number): Promise<void> {
    const supabase = createClient()

    // Delete workout (cascade will remove workouts_exercises)
    const { error } = await supabase
        .from('workouts')
        .delete()
        .eq('id', workoutId)

    if (error) throw error
}

// Copy a workout to a new date
// Returns 'created' if new workout was created, 'replaced' if existing was replaced, 'conflict' if target exists and needs confirmation
export async function copyWorkout(
    sourceWorkoutId: number,
    targetDate: string,
    replaceIfExists: boolean = false
): Promise<{ status: 'created' | 'replaced' | 'conflict'; workoutId?: number }> {
    const supabase = createClient()

    // Check if target date already has a workout
    const { data: existingWorkout } = await supabase
        .from('workouts')
        .select('id')
        .eq('date', targetDate)
        .single()

    if (existingWorkout && !replaceIfExists) {
        return { status: 'conflict' }
    }

    // Get source workout exercises
    const { data: sourceExercises, error: sourceError } = await supabase
        .from('workouts_exercises')
        .select('exercise_id, sort_order, details')
        .eq('workout_id', sourceWorkoutId)
        .order('sort_order', { ascending: true })

    if (sourceError) throw sourceError

    let targetWorkoutId: number

    if (existingWorkout) {
        // Delete existing exercises from target workout
        await supabase
            .from('workouts_exercises')
            .delete()
            .eq('workout_id', existingWorkout.id)
        targetWorkoutId = existingWorkout.id
    } else {
        // Create new workout
        const { data: newWorkout, error: createError } = await supabase
            .from('workouts')
            .insert({ date: targetDate })
            .select()
            .single()

        if (createError) throw createError
        targetWorkoutId = newWorkout.id
    }

    // Copy exercises to target workout
    if (sourceExercises && sourceExercises.length > 0) {
        const inserts = sourceExercises.map(ex => ({
            workout_id: targetWorkoutId,
            exercise_id: ex.exercise_id,
            sort_order: ex.sort_order,
            details: ex.details
        }))

        const { error: insertError } = await supabase
            .from('workouts_exercises')
            .insert(inserts)

        if (insertError) throw insertError
    }

    return {
        status: existingWorkout ? 'replaced' : 'created',
        workoutId: targetWorkoutId
    }
}

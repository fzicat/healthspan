export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type ExerciseMetrics = {
    weight?: boolean
    reps?: boolean
    time?: boolean
    distance?: boolean
    unilateral?: boolean
    dual_implements?: boolean
}

export type ExerciseCategory = 'strength' | 'cardio'

type ReadOnlyPlanningTable<Row> = { Row: Row; Insert: never; Update: never }
type PlanningFunction = { Args: { p_input?: Json }; Returns: Json }

export interface Database {
    public: {
        Tables: {
            training_plan_state: ReadOnlyPlanningTable<{
                id: number; owner_user_id: string; athlete_timezone: string
                lifecycle: 'inactive' | 'active' | 'paused' | 'archived'
                active_revision_id: string | null; state_version: number; evidence_version: number
            }>
            training_plan_revisions: ReadOnlyPlanningTable<{
                id: string; state_id: number; parent_revision_id: string | null; schema_version: number
                content: Json; authored_at: string; authored_on: string; timezone: string; source: 'owner' | 'coach'
            }>
            training_session_contexts: ReadOnlyPlanningTable<{
                id: string; state_id: number; revision_id: string; slot_key: string | null; cycle_key: string
                planned_date: string; timezone: string; activity_kind: 'strength' | 'cardio' | 'mobility' | 'rest'
                load_tags: Json; resistance_slot_key: string | null; workout_id: number | null
                snapshot: Json; origin: 'prescribed' | 'retrospective'; source_state_version: number
                source_evidence_version: number; created_at: string
            }>
            training_plan_events: ReadOnlyPlanningTable<{
                id: string; state_id: number; kind: string; revision_id: string | null; session_id: string | null
                payload: Json; actor: string; occurred_at: string; occurred_on: string; timezone: string
                request_id: string | null; operation: string | null; request_digest: string | null; result: Json | null
            }>
            exercises: {
                Row: {
                    id: number
                    name: string
                    metrics: ExerciseMetrics
                    category: ExerciseCategory
                    is_deleted: boolean
                    created_at: string
                }
                Insert: {
                    id?: number
                    name: string
                    metrics?: ExerciseMetrics
                    category?: ExerciseCategory
                    is_deleted?: boolean
                    created_at?: string
                }
                Update: {
                    id?: number
                    name?: string
                    metrics?: ExerciseMetrics
                    category?: ExerciseCategory
                    is_deleted?: boolean
                    created_at?: string
                }
            }
            sets: {
                Row: {
                    id: number
                    exercise_id: number
                    logged_at: string
                    training_session_id: string | null
                    weight: number | null
                    reps: number | null
                    time: number | null
                    distance: number | null
                    rir: number | null
                    is_deleted: boolean
                }
                Insert: {
                    id?: number
                    exercise_id: number
                    training_session_id?: string | null
                    logged_at?: string
                    weight?: number | null
                    reps?: number | null
                    time?: number | null
                    distance?: number | null
                    rir?: number | null
                    is_deleted?: boolean
                }
                Update: {
                    id?: number
                    exercise_id?: number
                    training_session_id?: string | null
                    logged_at?: string
                    weight?: number | null
                    reps?: number | null
                    time?: number | null
                    distance?: number | null
                    rir?: number | null
                    is_deleted?: boolean
                }
            }
            workouts: {
                Row: {
                    id: number
                    date: string
                    name: string | null
                    note: string | null
                }
                Insert: {
                    id?: number
                    date: string
                    name?: string | null
                    note?: string | null
                }
                Update: {
                    id?: number
                    date?: string
                    name?: string | null
                    note?: string | null
                }
            }
            workouts_exercises: {
                Row: {
                    id: number
                    workout_id: number
                    exercise_id: number
                    sort_order: number
                    details: string | null
                    note: string | null
                }
                Insert: {
                    id?: number
                    workout_id: number
                    exercise_id: number
                    sort_order: number
                    details?: string | null
                    note?: string | null
                }
                Update: {
                    id?: number
                    workout_id?: number
                    exercise_id?: number
                    sort_order?: number
                    details?: string | null
                    note?: string | null
                }
            }
            cardio_sessions: {
                Row: {
                    id: number
                    exercise_id: number
                    date: string
                    duration_minutes: number
                    heart_rate_avg: number | null
                    heart_rate_max: number | null
                    perceived_intensity: number | null
                    notes: string | null
                    logged_at: string
                    is_deleted: boolean
                }
                Insert: {
                    id?: number
                    exercise_id: number
                    date: string
                    duration_minutes: number
                    heart_rate_avg?: number | null
                    heart_rate_max?: number | null
                    perceived_intensity?: number | null
                    notes?: string | null
                    logged_at?: string
                    is_deleted?: boolean
                }
                Update: {
                    id?: number
                    exercise_id?: number
                    date?: string
                    duration_minutes?: number
                    heart_rate_avg?: number | null
                    heart_rate_max?: number | null
                    perceived_intensity?: number | null
                    notes?: string | null
                    logged_at?: string
                    is_deleted?: boolean
                }
            }
            breathwork_sessions: {
                Row: {
                    id: number
                    date: string
                    time: string | null
                    duration_minutes: number
                    sauna: boolean
                    type: string
                    comments: string | null
                    heart_rate_end: number | null
                    logged_at: string
                    is_deleted: boolean
                }
                Insert: {
                    id?: number
                    date: string
                    time?: string | null
                    duration_minutes: number
                    sauna?: boolean
                    type?: string
                    comments?: string | null
                    heart_rate_end?: number | null
                    logged_at?: string
                    is_deleted?: boolean
                }
                Update: {
                    id?: number
                    date?: string
                    time?: string | null
                    duration_minutes?: number
                    sauna?: boolean
                    type?: string
                    comments?: string | null
                    heart_rate_end?: number | null
                    logged_at?: string
                    is_deleted?: boolean
                }
            }
            daily_logs: {
                Row: {
                    date: string
                    sleep_duration_minutes: number | null
                    sleep_score: number | null
                    sleep_hrv_rmssd: number | null
                    morning_hrv_rmssd: number | null
                    weight_lbs: number | null
                    calories: number | null
                    protein_g: number | null
                    fat_g: number | null
                    carbs_g: number | null
                    alcohol_g: number | null
                    steps: number | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    date: string
                    sleep_duration_minutes?: number | null
                    sleep_score?: number | null
                    sleep_hrv_rmssd?: number | null
                    morning_hrv_rmssd?: number | null
                    weight_lbs?: number | null
                    calories?: number | null
                    protein_g?: number | null
                    fat_g?: number | null
                    carbs_g?: number | null
                    alcohol_g?: number | null
                    steps?: number | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    date?: string
                    sleep_duration_minutes?: number | null
                    sleep_score?: number | null
                    sleep_hrv_rmssd?: number | null
                    morning_hrv_rmssd?: number | null
                    weight_lbs?: number | null
                    calories?: number | null
                    protein_g?: number | null
                    fat_g?: number | null
                    carbs_g?: number | null
                    alcohol_g?: number | null
                    steps?: number | null
                    created_at?: string
                    updated_at?: string
                }
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            get_training_context: PlanningFunction
            get_training_history: PlanningFunction
            get_training_request: PlanningFunction
            propose_training_revision: PlanningFunction
            activate_training_revision: PlanningFunction
            set_training_lifecycle: PlanningFunction
            record_training_decision: PlanningFunction
            materialize_training_session: PlanningFunction
            mutate_training_workout: PlanningFunction
            find_similar_exercises: {
                Args: {
                    p_query: string
                    p_threshold?: number
                    p_limit?: number
                }
                Returns: {
                    id: number
                    name: string
                    category: string
                    similarity: number
                }[]
            }
        }
        Enums: {
            [_ in never]: never
        }
    }
}

// Helper types for easier access
export type Exercise = Database['public']['Tables']['exercises']['Row']
export type ExerciseInsert = Database['public']['Tables']['exercises']['Insert']
export type ExerciseUpdate = Database['public']['Tables']['exercises']['Update']

export type Set = Database['public']['Tables']['sets']['Row']
export type SetInsert = Database['public']['Tables']['sets']['Insert']
export type SetUpdate = Database['public']['Tables']['sets']['Update']

export type Workout = Database['public']['Tables']['workouts']['Row']
export type WorkoutInsert = Database['public']['Tables']['workouts']['Insert']
export type WorkoutUpdate = Database['public']['Tables']['workouts']['Update']

export type WorkoutExercise = Database['public']['Tables']['workouts_exercises']['Row']
export type WorkoutExerciseInsert = Database['public']['Tables']['workouts_exercises']['Insert']
export type WorkoutExerciseUpdate = Database['public']['Tables']['workouts_exercises']['Update']

export type DailyLog = Database['public']['Tables']['daily_logs']['Row']
export type DailyLogInsert = Database['public']['Tables']['daily_logs']['Insert']
export type DailyLogUpdate = Database['public']['Tables']['daily_logs']['Update']

export type CardioSession = Database['public']['Tables']['cardio_sessions']['Row']
export type CardioSessionInsert = Database['public']['Tables']['cardio_sessions']['Insert']
export type CardioSessionUpdate = Database['public']['Tables']['cardio_sessions']['Update']

export type BreathworkSession = Database['public']['Tables']['breathwork_sessions']['Row']
export type BreathworkSessionInsert = Database['public']['Tables']['breathwork_sessions']['Insert']
export type BreathworkSessionUpdate = Database['public']['Tables']['breathwork_sessions']['Update']

export const BREATHWORK_TYPES = ['Resonance Breathing'] as const
export type BreathworkType = typeof BREATHWORK_TYPES[number]

export type CardioSessionWithExercise = CardioSession & {
    exercises: Pick<Exercise, 'id' | 'name' | 'category'>
}

// Extended types with joins
export type WorkoutExerciseWithExercise = WorkoutExercise & {
    exercises: Exercise
}

export type SetWithExercise = Set & {
    exercises: Exercise
}

// Type for workout list with exercise preview
export type WorkoutWithPreview = Workout & {
    exercise_count: number
    exercise_names: string[]
}

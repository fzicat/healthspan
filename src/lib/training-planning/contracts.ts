// Shared RPC vocabulary. SQL validates all authority, references and predicates;
// these types are documentation/client checks, never a second decision engine.
export type ActivityKind = 'strength' | 'cardio' | 'mobility' | 'rest'
export type Lifecycle = 'inactive' | 'active' | 'paused' | 'archived'
export type Versions = { state: number; evidence: number }
export type LoadTag = 'resistance' | 'full_body' | 'upper' | 'lower' | 'systemic' | 'cardio' | 'mobility' | 'recovery'
export type PhaseProfile = {
    split: string
    emphases: ('strength' | 'power' | 'performance' | 'muscle_development' | 'endurance' | 'mobility')[]
    rep_emphasis: 'low' | 'mid' | 'high' | 'mixed' | 'not_applicable'
    laterality_emphasis: 'bilateral' | 'unilateral' | 'mixed' | 'not_applicable'
}
export type PrescriptionExercise = { exercise_id: number; details: string; note?: string | null; optional?: boolean }
/** Author-approved work definition; not a universal training threshold. */
export type WorkSetRule = { metric: 'weight' | 'reps' | 'time' | 'distance'; minimum: number }
export type RecoverySpacingRule = {
    id: string; candidate_tags: LoadTag[]; preceding_tags: LoadTag[]; min_days: number
} & (
    | { predicate: 'intervening_non_strength_days'; require_day_confirmation: true }
    | { predicate: 'min_calendar_days'; require_day_confirmation?: false }
)
export type QualificationRule = {
    kind: 'strength_sets' | 'cardio_minutes' | 'reported_objective'
    anchors?: { exercise_ids: number[]; min_sets: number; min_reps?: number; max_rir?: number }[]
    min_minutes?: number
    objective?: string
    require_work_set_confirmation: boolean
    work_set_rule?: WorkSetRule
    required_quality?: string
    admissible_sources: ('logged' | 'self_reported')[]
    queue_effect: 'advance'
    out_of_order: 'hold' | 'advance'
    continuation_days: number
}
export type TrainingSlot = {
    key: string; activity_kind: Exclude<ActivityKind, 'rest'>; purpose: string; review_scope: string
    load_tags: LoadTag[]; exercises: PrescriptionExercise[]; qualification: QualificationRule
}
export type TrainingRevisionContent = {
    schema_version: 1
    macro: {
        intent: string
        priorities: { capacity: string; mode: 'build' | 'maintain' | 'deprioritize'; success_criteria: string }[]
        constraints: string[]; horizon: string; cardio_recovery_intent: string
    }
    block: { key: string; purpose: string; starts_on: string; expected_until: string; authorized_through: string | null; phase_profile: PhaseProfile }
    sequence: TrainingSlot[]
    variation_policy: { comparable: string; allowed: string; benefit: string; review_triggers: string; transition_rationale: string; previous_phase_ids: string[] }
    recovery_spacing_rules: RecoverySpacingRule[]
    progression_policy: { build: string; maintain: string; reduce: string; recalibrate: string }
    review_policy: { review_due_on: string; exposure_threshold: number | null; scope: string; concern_triggers: string[] }
    delegation: {
        supportive_activities: Exclude<ActivityKind, 'strength'>[]
        supportive_constraints: { cardio_max_minutes?: number; cardio_max_intensity?: number; mobility_unloaded?: boolean }
        routine_review: boolean; bounded_continuation_days: number; substitutions: boolean; stop_conditions: string[]
    }
}
export type VersionedRequest = { expected_state_version: number; expected_evidence_version: number; request_id: string }
export type Eligibility = { eligible: boolean; eligible_on_or_after: string | null; reasons: unknown[]; conditions: unknown[] }
export type PlanningMutationResult = {
    status: string; event_id: string; request_id: string; versions: Versions
    revision_id?: string; session_id?: string; workout_id?: number | null
}
export const PLANNING_RPC_NAMES = [
    'get_training_context', 'get_training_history', 'get_training_request',
    'propose_training_revision', 'activate_training_revision', 'set_training_lifecycle',
    'record_training_decision', 'materialize_training_session', 'mutate_training_workout',
] as const
export type PlanningRpc = typeof PLANNING_RPC_NAMES[number]

// TEST ONLY. Synthetic authored direction shared by the native concurrency cases.
export const nativeOwner = '11111111-1111-4111-8111-111111111111';
export const nativeOther = '22222222-2222-4222-8222-222222222222';
export function nativeDirection(exercise: number, dates: { start: string; end: string }) {
  return {
    schema_version: 1,
    macro: { intent: 'Synthetic native concurrency fixture', priorities: [{ capacity: 'strength', mode: 'maintain', success_criteria: 'Keep benchmarks' }], constraints: [], horizon: 'fixture', cardio_recovery_intent: 'low cost' },
    block: { key: 'native', purpose: 'Disposable native tests only', starts_on: dates.start, expected_until: dates.end, authorized_through: null, phase_profile: { split: 'full_body', emphases: ['strength', 'mobility'], rep_emphasis: 'mixed', laterality_emphasis: 'mixed' } },
    sequence: ['alpha', 'beta'].map(key => ({ key, activity_kind: 'strength', purpose: key, review_scope: 'block', load_tags: ['resistance', 'full_body'], exercises: [{ exercise_id: exercise, details: 'Synthetic native fixture' }], qualification: { kind: 'strength_sets', anchors: [{ exercise_ids: [exercise], min_sets: 1, min_reps: 5, max_rir: 3 }], require_work_set_confirmation: true, admissible_sources: ['logged', 'self_reported'], queue_effect: 'advance', out_of_order: 'hold', continuation_days: 2 } })),
    variation_policy: { comparable: 'anchors', allowed: 'accessories', benefit: 'engagement', review_triggers: 'tolerance', transition_rationale: 'initial fixture', previous_phase_ids: [] },
    recovery_spacing_rules: [{ id: 'full-body', candidate_tags: ['resistance'], preceding_tags: ['resistance'], predicate: 'intervening_non_strength_days', min_days: 1, require_day_confirmation: true }],
    progression_policy: { build: 'authored', maintain: 'hold', reduce: 'fatigue', recalibrate: 'review' },
    review_policy: { review_due_on: dates.end, exposure_threshold: 100, scope: 'block', concern_triggers: ['pain'] },
    delegation: { supportive_activities: ['cardio', 'mobility', 'rest'], supportive_constraints: { cardio_max_minutes: 30, cardio_max_intensity: 3, mobility_unloaded: true }, routine_review: true, bounded_continuation_days: 3, substitutions: true, stop_conditions: ['pain'] },
  };
}

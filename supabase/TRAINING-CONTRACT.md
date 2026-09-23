# Database wire contract (schema_version 1)

All nine public RPCs take `p_input jsonb DEFAULT '{}'`. The initial coordination contract is retained. No MCP `context_id` is persisted or sent to SQL. Every mutation requires `request_id` (UUID), `expected_state_version`, and `expected_evidence_version`. An exact actor/operation/request/payload replay returns the original receipt **before** version checks; the same actor/request with a different operation or payload is rejected. Input JSON is canonicalized by PostgreSQL JSONB for SHA-256. Versions are integer counters.

## Structured decision payloads

`record_training_decision` uses `kind` plus the following fields. Every decision needs nonempty `reason` except `reconcile`.

- `reconcile`: `session_id`; optional `outcome` (`finished|reduced|partial|stopped|unknown`). SQL reads actual evidence, never trusts a caller qualification/count.
- `clarify_session` (owner): `session_id`, `set_ids` (all identified work sets; warmups omitted), optional `effort_by_set` object `{set_id: rir}`, `quality` exact rule quality, `continuation_dates` (explicit dates allowed by the frozen rule), `cardio_session_ids`. Set IDs must already belong to this occurrence or be unlinked and are atomically linked; conflicting ownership is rejected. Same-day distinct occurrences are allowed. Cross-date fragments without an authorized continuation stay pending.
- `propose_report` (coach/owner) / `confirm_report` (owner): `session_id`, `report` object `{performed_on, work:[{exercise_id,sets,reps?,rir?}], minutes?, objective_met?, quality?, load_tags?}`, optional `proposal_event_id`. Reports do not create sets. A report with insufficient positive evidence is retained but pending. Report confirmation must identify `duplicate_checked:true`. Later actual logs on the same occurrence yield one mixed/logged exposure. Discrepancies stay pending until an owner `resolve_report` decision with `resolution: use_logs|use_report`.
- `attribute_occurrence` (owner): `revision_id`, `slot_key`, `performed_on`, `set_ids` (possibly empty), `duplicate_checked:true`, optional `distinct_from_session_ids`. Creates a retrospective occurrence with `origin: retrospective`, no invented original prescription. Existing occurrence on the date/slot requires explicit distinctness, not a fresh UUID alone.
- `confirm_day` (owner): `date`, `non_strength:true|false`, `complete:true`. Only complete past athlete-local dates can be confirmed. Actual resistance evidence always overrides an asserted non-strength date.
- `bounded_continuation`: `review_event_ids`, `evidence` (object), `reason`, `revisit_on`. Does not resolve review. Bound is at most the revision's delegated days.
- `review`: `review_event_ids`, `evidence` (object), `reason`, `outcome:continue|extend_expected_window|revise|pause|complete|retire`, `next_review_on`, optional `next_exposure_threshold`, `resolve_concern_ids`. Coach can only `continue` or `extend_expected_window` with routine_review enabled. No authorization extension; material changes require a proposal and owner activation.
- `concern`: `code`, `reason`, `activity_kinds` array, `stop:boolean` (only an authored stop-condition code can create a stop), optional `revisit_on`.
- `deviation`: `session_id`, `reason`, `revisit_on`, optional `exercises` array. Prescription deviations must use the guarded workout mutation RPC; decision-only deviations cannot mutate a snapshot.
- `cancel_session` (owner): `session_id`, `reason`; history retained.
- `queue_correction` (owner): `next_slot_key`, `reason`, `evidence` object. Appends a baseline correction and resolves dependent queue uncertainty without deleting earlier credit.
- `resolve_report` (owner): `session_id`, `resolution`, `reason`.

Decisions that change occurrence evidence immediately reconcile that occurrence in the same transaction. Context also dynamically evaluates linked evidence, exposes changes versus accepted credit as `queue.confidence: unresolved`, and lists exact missing qualifiers. Ordinary set saving is never gated by this logic.

## Prescription payloads

`materialize_training_session`: `target_date`, `activity_kind`, optional `slot_key`, required `reason`, `revisit_on`; optional `exercises:[{exercise_id,details,note?,optional?}]`. A primary slot defaults to its frozen exercise list; empty supportive/rest intents need no workout. Non-primary alternatives must be delegated and obey `delegation.supportive_constraints`. Supported constraints: `{cardio_max_minutes?:number,cardio_max_intensity?:number,mobility_unloaded?:boolean}`; nonempty supportive cardio prescriptions additionally supply `duration_minutes` and `intensity`, validated against authored limits. Loaded exercise-library strength content is always resistance load regardless of activity label. `readiness` is not a caller override: authored stop codes are enforced through unresolved concern events. Daily observations and missingness remain visible; minimum spacing is never a recovery certification.

`mutate_training_workout`: `operation` is one of the four legacy names, `args` holds the unchanged legacy arguments (`date`, `workout_exercise_id`, `exercise_id`, etc.), `mode:linked|freeform`, `reason`, optional `revisit_on`. Resolves the owning workout/date before validation, applies the operation, then checks **resulting complete prescription** in one transaction. Active or paused freeform writes cannot evade load spacing. Linked edits require delegated substitutions, reason/revisit and append an accepted prescription fingerprint, leaving original snapshots immutable.

`activate_training_revision`: `revision_id`, `seed_slot_key`, `pending_intent_action:retain|cancel`; exact owner JWT only.

`set_training_lifecycle`: `lifecycle:active|paused|archived|inactive`, `reason`; exact owner JWT only. Does not rewrite reviews or authorization horizons.

`get_training_request`: `operation`, `request_id`, `payload` (the exact original mutation input). Returns original receipt or `{status:not_found}`; different digest conflicts. Reads are restricted to owner or service role.

`get_training_history`: optional `revision_id`, `session_id`, `cursor` UUID event id, `limit` (1–100, default 50). `revisions` and `sessions` contain complete relevant snapshots; `events` is keyset paginated in stable `(occurred_at,id)` order with truthful `has_more`/`next_cursor`.

## Additional validation

Load-tag vocabulary: `resistance`, `full_body`, `upper`, `lower`, `systemic`, `cardio`, `mobility`, `recovery`. Strength rules must select `resistance` as a candidate and preceding tag so new phases, labels and unlinked raw sets cannot evade the safety rule. `full_body` is descriptive, not permission to ignore other resistance. Unknown library classification is conservatively resistance. `review_scope` is `block` or the slot's own key; `review_policy.scope` is `block` or a defined slot key. Qualification kinds are `strength_sets`, `cardio_minutes`, `reported_objective`. All required work-set identity is confirmed at occurrence level; when `require_work_set_confirmation:false`, missing work identity still cannot be inferred from legacy sets, so a positive authenticated report or occurrence clarification is required. This flag never grants permission to count warmups.

`get_training_context` follows the baseline schema, with `evidence.complete:true` only after all source reads succeed. It includes all non-deleted raw sets (including deleted-library flags), cardio, daily logs and full event-derived queue history. `review.reasons` are durable trigger objects with source IDs. `recent_phases` carries full revision contents and associated review outcomes (not invented summaries). Unknown intervening days produce nullable eligibility dates and required confirmations. Recommended intent includes version provenance and becomes stale on any subsequent evidence/state change.

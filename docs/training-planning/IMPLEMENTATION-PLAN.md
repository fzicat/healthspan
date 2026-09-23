# Authorized implementation checkpoint

The authorization in the implementation brief supersedes only the old drafting-status text in SPEC-training-planning.md. The original SPEC is preserved byte-for-byte. No actual athlete direction is approved by this work.

Worktree: `/home/fzicat/projects/healthspan-training-planning`
Branch: `feat/training-planning`
Base: `a80725f0fbfa42ac63ad9f3ef3cfdd9a2b14f4a0`
Main worktree is read-only. No push, PR, merge, production credentials/data/SQL, live service changes or deployment.

## Incremental delivery and ownership

1. Establish shared types/RPC wire contract, preserve SPEC, install isolated dependencies and capture baseline lint/build/typecheck. Neo owns contracts, dates, integration harness and final review.
2. Database lane: additive migrations, explicit setup template/runbook, protected immutable history, typed validation, transactional state/version/idempotency, qualification/queue/reviews, raw-load spacing and all supported workout mutations. Owns supabase/ only. Verify in disposable PostgreSQL; no mocks as SQL evidence.
3. MCP lane: connection-scoped receipts, context/history/proposal/decision/materialization tools, all four guarded legacy mutation routes and read correctness/completeness; public protocol tests and repo coach documentation. Owns mcp-server/ only.
4. UI lane: /training, navigation, readable comparisons/history, owner activation, reports/clarification, compact context and safe automatic occurrence links; preserve ordinary logging. Owns src/app/, src/components/, src/lib/api/, src/types/database.ts only.
5. Integrate actual DB, MCP and browser synthetic workflows; verify all A1–A32 separately, including negative cases. Spec compliance review precedes quality review; fix gaps. Produce exact evidence and honest live-only limitations.
6. Commit coherent local artifacts, implementation report, acceptance matrix and SQL runbook. Verify main remains unchanged. Smith reviews; no merge approval is implied.

## Wire contract (coordination baseline)

All planning RPCs accept `p_input jsonb DEFAULT '{}'`. Public function names:

- `get_training_context`: target_date?; returns one complete consistent snapshot.
- `get_training_history`: revision_id?, session_id?, cursor?, request_id?; exact immutable records, `has_more`/`next_cursor`.
- `propose_training_revision`: content, parent_revision_id?, expected_state_version, expected_evidence_version, request_id.
- `activate_training_revision`: revision_id, seed_slot_key (nullable only for empty sequence), pending_intent_action ('retain'/'cancel'), expected versions, request_id. Owner JWT only.
- `set_training_lifecycle`: lifecycle, reason, expected versions, request_id. Owner JWT only.
- `record_training_decision`: discriminated kind and fields, expected versions, request_id.
- `materialize_training_session`: target_date, activity_kind, slot_key?, reason, revisit_on, exercises? (exercise_id/details/note), expected versions, request_id; immutable intent and optional workout atomically.
- `mutate_training_workout`: operation (the four legacy MCP tool names), original fields, mode ('linked'/'freeform'), reason?, revisit_on?, expected versions, request_id. DB resolves owning date, resulting content/load and link, then validates atomically.
- `get_training_request`: operation, request_id, payload; committed identical replay BEFORE freshness/version validation. Changed digest => IDEMPOTENCY_CONFLICT. Actor-bound.

MCP context_id is checked in memory, stripped before RPC call, and is not DB authority. Every successful guarded mutation returns `{status, event_id, session_id?, workout_id?, revision_id?, request_id, versions}`. Errors are symbolic SPEC codes with detail. Versions in context are `{state:number,evidence:number}`. Revision/session/event IDs are UUID strings. Legacy workout/exercise/set IDs remain integers. State singleton id=1. Schema version=1.

Context minimum shape:

```
{
 schema_version:1, status:'ready'|'inactive'|'unprovisioned',
 athlete_timezone, today, target_date, versions:{state,evidence},
 authority:{owner_user_id,lifecycle,revision_id,activation_event_id,authorized_through},
 direction: revision.content|null,
 queue:{next_slot_key,next_resistance_slot,confidence,basis_event_ids,qualifying_exposures},
 activity_eligibility:{strength:{eligible,eligible_on_or_after,reasons,conditions},cardio:...,mobility:...,rest:...},
 recommended_today:null|{activity_kind,reason,revisit_on,source_event_id,based_on_versions,stale},
 review:{review_due,reasons,original_due_on,last_review,handling,open_concerns},
 evidence:{complete,queue_history_complete,sets,cardio_sessions,daily_logs,pending_qualifiers,unlinked_sets},
 sessions:[], proposals:[], recent_phases:[], blocking_reasons:[], target_conflict:null|{...}
}
```

History returns `{revisions:[],sessions:[],events:[],has_more,next_cursor}`. Row content/snapshot/payload stays frozen. Session rows include id, revision_id, slot_key, planned_date, timezone, activity_kind, workout_id, snapshot, origin. Revision rows include id, content, parent_revision_id, authored_at, source. Event rows include id, kind, revision_id, session_id, payload, actor, occurred_at.

Revision content is a typed bounded JSON vocabulary (no generic rule evaluator):

```
{
 schema_version:1,
 macro:{intent,priorities:[{capacity,mode:'build'|'maintain'|'deprioritize',success_criteria}],constraints:[...],horizon,cardio_recovery_intent},
 block:{key,purpose,starts_on,expected_until,authorized_through:null|string,
   phase_profile:{split,emphases:[],rep_emphasis,laterality_emphasis}},
 sequence:[{key,activity_kind:'strength'|'cardio'|'mobility',purpose,review_scope,
   load_tags:[],exercises:[{exercise_id,details,note?,optional?}],
   qualification:{kind:'strength_sets'|'cardio_minutes'|'reported_objective',
      anchors:[{exercise_ids:[],min_sets,min_reps?,max_rir?}],min_minutes?,objective?,
      require_work_set_confirmation:boolean,required_quality?:string,
      admissible_sources:['logged','self_reported'],queue_effect:'advance',
      out_of_order:'hold'|'advance',continuation_days:number}}],
 variation_policy:{comparable,allowed,benefit,review_triggers,transition_rationale,previous_phase_ids:[]},
 recovery_spacing_rules:[{id,candidate_tags:[],preceding_tags:[],predicate:'intervening_non_strength_days',min_days:1,require_day_confirmation:true}],
 progression_policy:{build,maintain,reduce,recalibrate},
 review_policy:{review_due_on,exposure_threshold:null|number,scope:'block'|slot_key,concern_triggers:[]},
 delegation:{supportive_activities:['cardio','mobility','rest'],supportive_constraints,
    routine_review:boolean,bounded_continuation_days:number,substitutions:boolean,
    stop_conditions:[],...}
}
```

All exercise/rule IDs, enumerations, positive numeric predicates, dates, independent profile dimensions and delegated boundaries are validated by SQL. Undefined permissions are denied. Arbitrary sequence size; no fabricated strength slot. Default unknown evidence remains unknown. No hardcoded physiology. Conservative ambiguous outcomes are explicit, not qualification guesses.

Decision kinds: reconcile; confirm_report/clarify_session/confirm_day (owner only); propose_report (coach); bounded_continuation; review; concern; deviation; cancel_session; queue_correction (owner). Each must have kind-specific validation and narrow authority. Reports/clarifications reference concrete occurrence and evidence IDs rather than coach-asserted qualification. Unlinked retrospective occurrence attribution is explicit and never claims an original prescription.

Final delivered types, migration documentation and executed tests are authoritative if coordination adjustments are necessary; document any SPEC deviations explicitly rather than silently narrowing the feature.

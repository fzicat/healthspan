# Durable Training Planning in Healthspan

Status: proposed feature SPEC; not implemented; no implementation authorization.
Baseline: `main`, `a80725f0fbfa42ac63ad9f3ef3cfdd9a2b14f4a0`. Prepared 2026-09-22, America/Montreal.
Author: Smith — Frank's AI Agent. Engineering input: Neo. Coaching requirements: Dozer, integrated with Smith's product reconciliation.

Review inputs: Dozer's written coaching requirements and Smith's product acceptance checklist, reconciled on 2026-09-22, then refined with Frank's explicit requirements for varied phases and recovery-aware scheduling, reviewed by Dozer and Neo. The requirements are incorporated here; implementation does not depend on chat history or separate working notes. Dozer supplied coaching requirements, not approval of this technical schema. This revision supersedes the earlier draft's PPL-only assumption, review lockout, mandatory Finish confirmation and logged-only qualification decisions.

## 1. Decision, problem and scope

**Yes: durable training direction belongs in Healthspan, alongside the evidence of training.** On-demand workouts lose their long-term purpose when chat context fades. Healthspan should own months-level intent, one current block, execution rules and dated decisions; Dozer should retrieve and apply them rather than rely on memory. Storage alone cannot guarantee model adherence.

The purpose is longevity, useful strength/muscle/function, cardio capacity, enjoyment and sustainable recovery. Explicitly distinguish capacities to build, maintain or temporarily deprioritize. **Dozer is a creative, context-aware coach, not a fixed-split queue dispenser.** He should proactively propose purposeful variety in training structure and stimulus when it serves the athlete. Full-body, upper/lower, PPL and other sensible structures are first-class alternatives; PPL is neither a permanent default nor a required three-slot sequence. Strength, power, performance and mobility can each be meaningful phase priorities without making endless performance escalation compulsory. Maintain a stable purpose, not an immutable template; neither novelty nor repetition is automatically the correct choice.

This is a scoped evolution of `SPEC.md`, not its replacement: preserve fast mobile logging, last-set recall and minimal taps. Planning is optional. A missing plan, due review or unavailable planning service must not add a dependency to ordinary set saving.

MVP:
- One athlete, one active strategy/current block (also called a phase), configurable session structure, appropriate within-phase benchmarks and purposeful variation.
- One Current direction overview and a compact linked-workout header; readable revision/decision history.
- Explicit authority, review checkpoints, qualification/queue rules, phase-specific recovery spacing and bounded coaching flexibility.
- Deterministic reconciliation where evidence suffices; session-level clarification only where needed; distinct self-reported evidence.
- A fresh machine-readable context path distinguishing the next queued resistance session from the activity appropriate today, guarded supported MCP writes, and honest legacy-path limitations.

Non-goals: a mandatory annual peaking calendar, unattended automatic block activation, a duplicate calendar, recurring reminders/cron, compulsory progression, an embedded LLM, medical diagnosis, a generic approval/workflow engine, multi-athlete isolation, or offline write synchronization. Proposed next-phase direction and deliberate rotation are in scope; an optimizer or automatic block chain is not. Do not import physiological limits from old notes. Dozer supplies any needed quantities when authoring a plan; Frank authorizes the direction.

## 2. Existing architecture and constraints

These findings come from the original repository inspection, not a deployed-database audit. This bounded revision performed no new broad code audit. `/home/fzicat/projects/AGENTS.md` was read first originally; no project-local AGENTS file was found.

| Evidence paths | Existing behavior and design consequence |
| --- | --- |
| `package.json`, `README.md` | Next.js 16.1.4/React 19.2.3, Supabase, Tailwind 4. Reuse this app/database. README's four-table/home-page description is incomplete compared with source. |
| `SPEC.md`, `src/app/page.tsx`, `src/app/strength/page.tsx`, `src/app/exercise/[id]/page.tsx` | Root SPEC prioritizes logging without planning clutter. Actual home is Welcome; strength has its own page. Exercise page has last-set prefill, save/history/soft delete and stopwatch. Preserve these. |
| `supabase/schema.sql`, `src/types/database.ts` | Sets link only to exercises, with timestamp/nullable metrics/RIR/soft delete: no workout/session/template FK and no warmup/work-set marker. Workouts are unique by date; their ordered exercises have freeform details/note. No durable strategy/completion model exists. |
| `src/lib/api/workouts.ts`, `src/lib/api/sets.ts`, `src/lib/api/exercises.ts`, `src/app/scheduled/[date]/page.tsx` | Browser CRUD is direct Supabase access. Copy/repeat/reorder are multi-request operations, not planning transactions. Human edits are broader than MCP's today/future restriction. |
| `mcp-server/src/index.ts`, `mcp-server/src/tools/workouts.ts` | Stdio tools expose reads plus exercise creation and four workout mutations. Workout writes check dates, not context/version/qualification. Add-exercise retries can duplicate rows. |
| `mcp-server/src/tools/workouts.ts`, `mcp-server/src/tools/sets.ts` | Recent workouts are planned lists; `workout_count` counts rows, not execution. Day read returns before reading strength sets if no workout exists. Name/note selections are incomplete. Bounded set reads lack completeness envelopes. Do not compose these unchanged into authoritative planning context. |
| `src/lib/api/daily-logs.ts`, `src/lib/api/sets.ts`, `src/lib/api/reports.ts`, `src/lib/reports/workout-calendar.ts` | Browser/server-local dates coexist with UTC day bounds/slicing. Reports derive labels from exercise names, not authoritative slot association. Use athlete-local dates and explicit rules instead. |
| `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/middleware.ts`, `supabase/schema.sql` | Supabase user sessions protect UI access, but existing RLS permits all authenticated users through `USING(true)`; legacy tables have no athlete ownership. This remains a single-user trust boundary. |
| `mcp-server/src/supabase.ts`, `mcp-server/README.md` | MCP uses a service-role client without athlete authentication; RLS alone does not restrict it. Both clients rely on handwritten types/casts. Never interpret a coach field as a human identity. |
| `mcp-server/COACH_PLAYBOOK.md`, `mcp-server/src/index.ts` | Current playbook requests priming and week planning; harness loading is requested, not enforced by server startup. No durable context tool currently exists. |
| `src/components/Navigation.tsx`, `src/app/globals.css`, `public/sw.js` | Hamburger navigation, compact mobile cards and Gruvbox variables; shell/static caching is not an offline save queue. Planning authority must not come from cached pages. |
| `supabase/schema.sql`, `package.json`, `mcp-server/package.json`, `tsconfig.json`, `mcp-server/tsconfig.json`, `eslint.config.mjs` | Original inventory found no tracked migration/test files or test scripts. App has dev/build/start/lint; MCP dev/inspect. Root TS config excludes MCP. Bootstrap SQL is not a safe incremental migration runner. |

## 3. Product journeys and distinct concepts

1. Establish direction: Dozer reads context, proposes a complete strategy/block, explains why its split and emphases fit the goals, availability, recovery and enjoyment, and resolves exercise IDs where applicable. Frank sees current versus proposed and activates the exact revision in authenticated Healthspan. A quoted chat agreement is not authentication.
2. Ask for today: a fresh Dozer session reads direction, authority, queue, review state, actual load and spacing eligibility; first chooses the appropriate activity today, then its content. A request for another workout does not itself make another resistance session appropriate. Explain purpose/fit/deviation, write only within authority, and read back the exact saved intent.
3. Train: the normal logger remains primary. Reliable log-derived qualification is reconciled without Finish confirmation. Missing warmup/work, effort, association or subjective evidence triggers a small session-level clarification, not mandatory new per-set inputs.
4. Adapt: qualifying reduced/partial work advances under the accepted rule. Recovery-only work does not. A pain substitution records a reason and revisit point; it does not silently replace the enduring anchor.
5. Return/review: calendar review can be due after an absence despite few exposures. Surface it, reassess entry demands and queue relevance, keep history, and never invent catch-up debt. At phase review proactively recommend justified continuation or a specific change using previous phases' objectives, outcomes, tolerability and enjoyment. Due review alone does not invalidate approved direction.
6. Consecutive-day request: in a full-body phase requiring one complete intervening non-strength day, Monday full-body makes Tuesday a bounded cardio, mobility or rest recommendation rather than another resistance session. Wednesday is the earliest calendar candidate only if the intervening day meets the rule and recovery permits. Preserve the pending resistance slot; do not silently switch to upper/lower to evade the spacing rule.

| Concept | Meaning; never conflate with the next row |
| --- | --- |
| Planned session | Intended work, not evidence of execution. Opening/copying/scheduling it earns nothing. |
| Session outcome | Finished, reduced, partial, stopped or unknown. A Finish action records outcome, not stimulus. |
| Raw work | Actual non-deleted logged sets, plus separately identified reports. Unknown/unlogged is not zero. |
| Qualifying exposure | One occurrence meets its approved slot rule: required anchor/pattern or equivalent, minimum work and applicable effort/quality. Outcome labels do not decide. |
| Queue effect | Advance/hold/explicit out-of-order treatment under the approved rule. Qualification and queue movement are separate decisions. |
| Activity eligibility | Whether a candidate activity fits actual recent load, phase-specific spacing and readiness. Nonqualifying or unplanned resistance work can still constrain eligibility. Next in sequence does not mean eligible today. |
| Review state | Calendar OR qualifying-exposure checkpoint OR documented concern makes review_due visible; not automatic expiry or deload. |
| Authorization | Activated scope and delegated flexibility, with any genuine end/expiry specified separately. Stored approval evidence records an authorized action; it cannot create one. |

## 4. Proposed minimal model and ownership

Use four additive tables. Keep macro/block/slot rules together in validated revision JSON because they are activated together. Avoid separate macrocycle/template/calendar engines. Existing logs remain canonical for logged metrics; plan data never fabricates sets.

| Proposed table | Minimum fields and responsibility |
| --- | --- |
| `training_plan_state` | Singleton ID, explicitly provisioned `owner_user_id`, IANA `athlete_timezone`, lifecycle (`inactive/active/paused/archived`), active revision FK, state/evidence version counters. One live direction; no independently mutable queue index. |
| `training_plan_revisions` | ID/state FK, parent revision, schema version, immutable content JSON, authored timestamp/local date/source. Proposed versus activated is established by activation history/live pointer, not `approved=true`. |
| `training_session_contexts` | ID as stable session occurrence identity; revision/slot/cycle references, activity kind, validated load tags, optional resistance-slot reference, planned local date/zone, optional workout FK, origin, immutable intent/rule/prescription snapshot, source versions. A cardio, mobility or rest intent need not contain exercises or a workout row. Can represent unlinked/report-attributed work without inventing an earlier prescription. |
| `training_plan_events` | Append-only, narrowly typed activation/lifecycle, reconciliation, activity recommendation, review, session-deviation or mutation receipt records. References revision/occurrence; server actor/time, reason, evidence provenance, delegated rule, optional superseded record, request UUID/digest/result IDs. No arbitrary user-defined workflows. |

One small proposed compatibility addition: nullable `sets.training_session_id` FK to the occurrence. The logger supplies it automatically only when opened in a known session context; direct exercise logging may leave it NULL. This provides reliable association without mandatory taps. Missing planning context means log unlinked, not refuse an otherwise valid save. Legacy sets stay unlinked; date/name similarity alone never proves association.

Revision content must include:
- Macro intent, priorities, build/maintain/deprioritize choices, success criteria, practical constraints and intended horizon; separate cardio/recovery intentions.
- Current block key/purpose/start, expected window and `phase_profile`: split/structure (`full_body`, `upper_lower`, `ppl` or another named/custom structure), prioritized training emphases (strength, power, performance, muscle development, endurance, mobility or combinations), rep emphasis (low/mid/high/mixed/not-applicable), and laterality emphasis (bilateral/unilateral/mixed/not-applicable). These are independent, potentially overlapping dimensions, not mutually exclusive programs or a claim that all combinations are appropriate. Numeric rep ranges belong to authored session/exercise rules, not hardcoded meanings of low/mid/high. A mobility objective need not have reps or weight; power/performance objectives require their own meaningful quality/outcome criteria rather than load increases alone.
- Stable arbitrary sequence/slot keys with activity kind and review/credit scope; applicable exercise IDs, anchors/benchmarks, optional accessories and permitted equivalents. No fixed slot count, PPL enum or modulo-three progression. A mobility/cardio-focused phase may have no resistance slot and has its own positive completion criteria. Loads are not transferable across equipment merely because an equivalent is allowed.
- `variation_policy`: what should remain comparable, what may vary within this phase, the intended benefit, and review/rotation triggers. Proposed transitions reference previous-phase outcomes and explain the next stimulus, retained capacities and trade-offs. Recent-block summaries are derived from existing version/decision history with source IDs and completeness; no extra phase scheduler/table is required. Phase means the current block, not a new lifecycle. Dozer should propose variety proactively, not wait for Frank to say he is bored, while allowing evidence-based continuation.
- `recovery_spacing_rules`: named candidate-load and preceding-load selectors, defined load tags, evidence requirements, a small typed predicate and explicit parameters. Support the requested full-body policy `min_intervening_non_strength_days=1` with precise athlete-local calendar semantics; do not translate it into a universal elapsed-hour requirement. Rules apply to relevant actual work across phase revisions, not only credited sessions in the current queue. Minimum spacing does not certify recovery.
- Per-slot qualification rule: required patterns/anchors or modality-specific objectives, minimum work, applicable effort/quality, warmup exclusion where relevant, admissible evidence, and queue effect. Structure machine-evaluable predicates; keep nuance in prose. Evidence references may identify actual sets, cardio sessions or an authenticated report as appropriate; no fake strength sets for non-strength work. No arbitrary completion percentage or default set minimum.
- Progress/hold/reduce/recalibrate rules based on comparable evidence, maintenance success, and any athlete-approved effort/volume limits. Numbers are required only where the rule uses them.
- Review policy: calendar checkpoint, scoped qualifying-exposure checkpoint/baseline, concern triggers and delegated review actions. `expected_until` describes a window; optional `authorized_through` is an explicit inclusive local-date authorization limit. Neither `review_due_on` nor `expected_until` expires the program.
- Delegated scope: routine activity selection (including appropriate cardio, mobility or rest instead of resistance), target selection/reduction/stopping, allowed variation/substitutions, reconciliation predicates, bounded continuation and review decisions; conditions requiring Frank's approval. Daily creativity within this scope need not prompt for approval each time. Material phase/split/emphasis changes remain proposed revisions. Undefined flexibility is not unrestricted permission.

Integrity/lifecycle:
- Explicit owner setup; no first-login ownership claim. Active pointers/FKs belong to the same state. JSON exercise/rule references and real dates are validated in RPCs, not just UI forms.
- Submitted revisions and historical snapshots cannot be overwritten; corrections append superseding records. Activation is an authenticated athlete action on an exact proposal/version; new blocks have an explicit seed, not inferred past compliance.
- A revision change does not rewrite old prescriptions. Retain or cancel/reissue pending intent explicitly. Name/metric changes in the library do not alter historical snapshot labels/conventions.
- One occurrence earns at most one effective exposure per applicable slot rule and one queue credit. A set cannot supply duplicate credit to different occurrences. Transactional checks enforce these despite JSON evidence references.
- No global one-credit-per-calendar-day constraint. MVP can materialize one next session at a time because existing workouts are unique by date; other distinct occurrences remain reconcilable. Rich multiple-session day editing is deferred, not a health rule.
- Paused/archived means no new plan-linked prescription; history and logging remain. Resume/end/material change needs appropriate authorization. Review state cannot disappear through renaming or lifecycle changes.

## 5. Reconciliation, qualification and rolling execution

### Evidence and low-friction operation

Read sets independently of workouts, including unplanned exercises. Preserve non-deleted sets for soft-deleted exercises as historical work with a library-status flag. Name heuristics may suggest classification, never establish it. Read all evidence required for the decision; a recent page is not the full cycle history.

For each occurrence, store source (`logged/self_reported/mixed`), supporting set/report IDs, outcome, rule version, qualification (`qualifies/does_not_qualify/pending`), reasons, queue effect and evidence fingerprint. Logged-volume/set totals always come from actual sets; reports have separate totals. No nullable metric becomes zero or an inferred hard set.

A deterministic reconciliation RPC may be called by UI or Dozer. It computes qualification from actual records and the approved rule, rather than trusting a supplied `qualifies=true`. Auto-reconcile only when occurrence association and every required predicate are unambiguous, including warmup exclusion and applicable effort/quality. A link and a Finish button do not establish these predicates. Optional accessories do not veto qualification. Reduced/partial work that meets the same approved minimum qualifies without ad hoc athlete permission.

Current sets lack a work-set marker and have optional RIR. Where the approved rule cannot be evaluated from recorded metrics or existing occurrence evidence, return the exact missing qualifier. Ask once at session level for work-set identification, relevant effort/quality or association. An optional Finish/clarify panel records that information in an event; no mandatory per-set fields. Narrative judgments are identified as coach assessments under a named delegated rule, not falsely labeled deterministic facts.

### Athlete reports and continuations

A sufficiently specific athlete-confirmed report may establish qualifying work under the applicable approved rule: occurrence/date, anchor/equivalent, work performed and necessary effort/quality must be known. Recommended MVP confirmation is authenticated Healthspan UI, prefilled from Dozer's proposed report so Frank does not re-enter it. An agent-written quote is not authenticated confirmation. An ambiguous report remains pending; never manufacture set rows.

Later logs attach to the same occurrence and supersede/augment its evidence: change source to mixed/logged as appropriate, preserve the original report and reconcile discrepancies. Occurrence identity, not evidence-source count, controls credit. Potential duplicates require matching/clarification before new credit; creating a new ID is not permission to count the same session twice.

Do not implicitly pool fragments across dates. An explicitly identified continuation references the original occurrence and its approved continuation conditions; later sets may finish that occurrence but cannot earn a second credit. Keep original dates/evidence. Multiple real sessions on one date require distinct association, not a global cap.

### Queue, recovery and correction behavior

Starting from the activation seed, apply effective occurrence decisions in execution order (local occurrence date/time plus stable ID tie-break), using the authored arbitrary sequence and explicit queue effects. Planned days, elapsed weekdays, warmup-only work and supportive recovery/cardio never consume a resistance slot. A primary cardio/mobility slot can qualify and advance its own declared sequence/review scope; it is not failed strength. A qualifying expected slot advances once under its rule; nonqualifying/pending work holds. A partial label alone never holds or advances it. Rest can be a correct day decision without an invented exercise log or resistance credit.

Out-of-order work remains real load and can qualify for its scoped review counter. Apply an explicit queue treatment from the approved policy, or record a proposal/ask Frank when outside that policy; do not silently skip slots or create catch-up obligations. Pain/recovery adaptations may reduce/stop work within delegated policy; record the reason and a dated or occurrence-based revisit point. Repeated deviations surface review instead of quietly becoming a new program.

Edits/deletions/late links trigger evidence invalidation and recomputation. If objective re-evaluation leaves qualification and order unchanged, update evidence without asking Frank again. If it changes prior credit and later queue interpretation, expose unresolved scope and block only prescriptions dependent on that uncertain position. MVP provides a simple attributed correction/explicit queue decision; a broad historical replay/conflict editor is deferred. Never silently rewrite old intent, erase an accepted report, or pretend contradictory evidence is settled.

### Temporal eligibility and choosing today's activity

Determine the next resistance slot, its eligibility, and the recommended activity today separately. Evaluate phase-specific spacing against actual relevant exposure (including partial, unplanned, out-of-order, self-reported and nonqualifying work), overlapping muscular/systemic load, current symptoms/readiness and applicable stop conditions. Keep actual load distinct from future reservations. Unperformed reservations influence prospective scheduling conflicts, not performed-work counts; recheck against actual work before execution-day prescribing. Activating a new phase does not reset recovery history.

The requested full-body rule requires **one complete athlete-local non-strength date strictly between the preceding applicable resistance load and a candidate resistance day**. Monday full-body → Tuesday appropriate cardio/mobility/rest → Wednesday earliest calendar candidate, subject to completed intervening-day evidence and readiness. It is not “24 hours later,” not a blanket medical law for every full-body program, and not an automatic Wednesday clearance. If Tuesday includes relevant resistance work, even too little for queue credit, it does not satisfy that non-strength day. Capture the new load and reassess the earliest candidate. Candidate/preceding-load selectors must prevent evasion by renaming the workout, changing the exercise, switching split labels, starting a new phase or using explicit freeform mode.

An empty log is not proof of rest. Use recorded activity plus sufficiently specific athlete confirmation where needed; ask the smallest question that changes eligibility, not an intake interview. If a required day/activity is unknown, return the uncertainty and a nullable earliest eligible date rather than assert recovery. Validate load tags from exercise/content/evidence and approved classification rules; an arbitrary “mobility” label cannot downgrade loaded resistance. Where classification remains ambiguous, disclose it and require the missing qualifier before a dependent prescription.

If resistance is not appropriate, Dozer recommends a specific suitable alternative within approved scope, or rest, with its reason and a revisit/eligibility condition. Hard intervals, long cardio or loaded mobility are not automatically recovery; their local/systemic cost must fit the phase's recovery intent. Persist this as linked day intent with the pending resistance slot retained. Do not fabricate a performed cardio/mobility session, require an exercise for rest, or cancel an unresolved resistance occurrence merely to record a supportive day.

The server enforces typed spacing predicates and sufficient evidence on **all supported prescription writes**, including legacy and explicit freeform routes, inside the version-checked transaction and against the resulting prescription. A blocked resistance candidate does not block eligible cardio/mobility/rest intent or actual-set logging. Deterministic eligibility is distinct from Dozer's contextual recommendation; neither a positive spacing result nor a high readiness metric is a guarantee of physiological recovery.

## 6. Review is not expiry; authority is not blanket permission

Compute `review_due` on reads when calendar OR relevant qualifying exposure OR documented concern reaches its checkpoint. Show all original reasons, original due point, last review, open concerns, latest acknowledgement and next revisit. Calendar can become due without any logging. Review due/overdue does not by itself block safe plan-linked prescribing, force a deload/new block, or require a UI exception before each workout.

Exposure thresholds name their slot/block scope and baseline activation/review event. Count each qualifying occurrence once, including qualifying reduced/partial and sufficiently supported self-reported work under the rule. Exclude mere attendance, nonqualifying work and recovery. A later report-to-log reconciliation is the same exposure. Threshold recognition uses the acceptance timestamp/local date, not a retroactive claim that a review happened on the exercise date. Once surfaced/recorded, keep the original trigger through later corrections; resolve a mistaken trigger explicitly rather than silently erase it.

When due, Dozer must surface it and either conduct/record an authorized review, propose one, or record bounded continuation: affected review IDs, evidence/uncertainty, why existing direction remains suitable, and a concrete revisit date or occurrence checkpoint. This acknowledgement does not reset/resolve due status. A still-valid recorded continuation can cover its explicit bound without repeated athlete approval; reference it while continuing to surface review_due. When the bound is reached, Dozer must revisit the judgment, not automatically move the date. RPCs can require these fields/references; they cannot prove the rationale is sound.

A genuine review records evidence, reasoning, outcome (`continue/extend_expected_window/revise/pause/complete/retire`) and next checkpoints. Dozer can record routine outcomes only within explicitly delegated scope, e.g. maintain unchanged and set a permitted next checkpoint. Material goal/block/anchor/sequence/authorization-horizon changes remain proposals until Frank activates them in the authenticated UI. “Extend expected window” never extends `authorized_through`. A full review may resolve due status; a proposal or continuation acknowledgement cannot.

Actual blockers are separate: absent/unavailable/unsupported/stale required context, ambiguous evidence/queue on which the action depends, unmet applicable recovery spacing, inactive/paused/archived authority, explicit authorization expiry/end, out-of-scope material change, or an applicable safety/stop condition. Reasons are activity-specific: blocked resistance does not by itself prohibit eligible supportive work. A concern requests judgment; a genuine applicable stop condition restricts the affected prescription independently of review_due. Do not continue merely because a review is informational.

If valid durable direction cannot be established, disclose that. Do not fall back silently to memory or freeform writes. A separately athlete-authorized one-session recommendation may be recorded with date/scope and provenance, explicitly not a replacement strategy. Existing intentional freeform logging remains available; it is not an automated fallback.

## 7. UI and historical context

Proposed `/training`: one Current direction card with priorities/build-maintain labels, active phase/revision, split and stimulus emphases, elapsed window, qualifying exposures by scope, **recommended activity today versus next resistance slot**, earliest calendar candidate/conditions, review_due and activity-specific blockers distinctly. Expand for spacing/variation rules, prior-phase outcomes, proposed next-phase rationale, last decisions and readable history. Compare “Current approved” with “Proposed change”; activate/reject explicitly. No-plan state offers setup or continued freeform logging. Cardio, mobility and rest recommendations must be visible on this overview without opening the strength logger.

On `/strength` and scheduled days, a compact header shows block/version, today's purpose, progression/maintenance intention and deviation/revisit. Keep the normal list primary. Exercise logging retains last-set prefill; targets must not masquerade as actual last performance. Show a lightweight clarification only for missing/ambiguous evidence. Offer a “Report unlogged work” action using the same occurrence reconciliation view.

History renders the frozen strategy/rules/prescription used then, with later outcome/evidence decisions separately. For retrospective attribution say that no original prescription was stored. Freeform days say “Not linked / not checked against plan”; no compliance badge based on date alone. Use existing Gruvbox variables, mobile cards, accessible text statuses and large targets.

Copy/repeat never copies credit, authority or review resolution. Freeform behavior stays available. A linked target conflict needs explicit cancel/reissue or a scoped accepted deviation, preserving the original snapshot; no silent replacement. A deviation event stores the accepted new prescription/fingerprint, so later comparison does not forever flag already-accepted changes. Referenced workout hard deletion is restricted; cancellation retains history. Old direct clients can still edit plan rows, but divergence must be visible rather than retroactively rewriting intent.

## 8. Proposed shared API/MCP contract

These contracts do not exist today. Browser and MCP adapters use common types and transactional database RPCs, not competing queue/review implementations. Response examples are abbreviated synthetic fixtures, not athlete telemetry, an approved program or actual tool output.

| Operation | Contract |
| --- | --- |
| `get_training_context({ target_date? })` | One consistent DB snapshot: live authority/phase profile/rules, arbitrary sequence and nullable next resistance slot, activity-specific eligibility/spacing reasons and earliest calendar candidates, actual versus reserved load, recent-phase outcomes/completeness, reviews, workload/readiness with missingness, target-day conflict and original session context. Return any current recorded recommendation with provenance, otherwise `recommended_today=null` and `needs_coach_decision`; a read does not invent coaching judgment. Default athlete-local today. |
| `get_training_history({ revision_id?, session_id?, cursor? })` | Read exact immutable snapshots/decisions with truthful pagination. Historical prescription reads do not grant workout-edit authority. |
| `propose_training_revision` | Submit immutable typed revision against current version; return proposal ID/diff. Never implicitly activate it. |
| `record_training_decision` | Narrow discriminated RPC/tool for reconciliation, scoped activity recommendation, routine review/continuation or deviation. Recommendation records reference phase/rules, eligibility/evidence versions, reason and revisit condition. Server derives actor/authority, checks evidence/rules and versions; outside delegated scope returns proposal-required. Not a generic ledger writer. |
| `materialize_training_session` | Atomically persist an eligible strength/cardio/mobility/rest intent, frozen context and receipt, plus a dated workout/ordered exercises only when needed. Takes activity kind, target date/optional slot, validated load tags, context ID, versions, request UUID, scoped adjustments and due-review handling. Check content-specific spacing; allow approved supportive intent without consuming the resistance queue, requiring exercises or fabricating performance logs. Existing same-date workout conflicts remain explicit; nullable-workout intent is not a multi-session editor bypass. |
| Athlete-only operations | Activate initial/material revision, change lifecycle/authorization, confirm reports/missing subjective evidence, authorize out-of-scope decisions. Authenticated identity required; never granted by coach request fields. |

Full context must include every relevant rule and open concern even when recent evidence is summarized. Use explicit windows, completeness, source IDs, schema version and activity-specific `blocking_reasons`; keep `review_due` separate from prescription eligibility. `eligible_on_or_after` is scoped to the candidate and rule, nullable when indeterminate, and is only an earliest calendar candidate; carry additional readiness/evidence conditions. A stored `recommended_today` must match current phase/evidence versions or be flagged stale and require reassessment. Distinguish absent records from retrieval failure. Unknown recovery is unknown, not automatically good or an automatic logger lockout.

```json
{
  "schema_version": 1,
  "status": "ready",
  "athlete_timezone": "America/Montreal",
  "today": "2026-09-22",
  "target_date": "2026-09-22",
  "versions": { "state": 8, "evidence": 27 },
  "authority": { "revision_id": 12, "activation_event_id": 40, "lifecycle": "active", "authorized_through": null },
  "direction": {
    "intent": "Useful strength and sustainable participation",
    "block_key": "full-body-phase-example",
    "phase_profile": { "split": "full_body", "emphases": ["strength", "mobility"], "rep_emphasis": "mid", "laterality_emphasis": "mixed" }
  },
  "queue": { "next_resistance_slot": "full_body_b", "confidence": "resolved", "basis_event_ids": [41, 42] },
  "activity_eligibility": {
    "strength": { "eligible": false, "rule_id": "full-body-spacing", "min_intervening_non_strength_days": 1, "eligible_on_or_after": null, "reasons": ["RECOVERY_SPACING_NOT_MET"], "required_condition": "Complete an intervening non-strength day and reassess readiness" },
    "mobility": { "eligible": true, "conditions": ["Stay within the approved low-cost mobility scope"] }
  },
  "recommended_today": { "activity_kind": "mobility", "source_event_id": 44, "based_on_versions": { "state": 8, "evidence": 27 }, "reason": "Support the phase while preserving the intervening non-strength day", "resistance_queue_effect": "hold" },
  "review": {
    "review_due": true,
    "original_due_on": "2026-09-21",
    "reasons": ["calendar"],
    "handling": { "event_id": 43, "kind": "bounded_continuation", "revisit_on": "2026-09-24" }
  },
  "evidence": { "complete": true, "queue_history_complete": true, "pending_qualifiers": [] },
  "can_prescribe_under_current_direction": { "strength": false, "mobility": true },
  "blocking_reasons": [{ "activity_kind": "strength", "code": "RECOVERY_SPACING_NOT_MET" }],
  "context_receipt": { "id": "ctx_example_not_valid", "expires_at": "2026-09-22T12:15:00-04:00" }
}
```

The example omits full slot rules/evidence only for readability; production responses cannot omit information needed for the requested decision. Reconciliation input references records, not asserted counts. A coach request below lets the RPC evaluate logged evidence; it cannot mint a report or subjective athlete confirmation.

```json
{
  "kind": "reconcile",
  "session_id": 31,
  "rule_revision_id": 12,
  "set_ids": [901, 902],
  "athlete_report_event_id": null,
  "outcome": "partial",
  "context_id": "ctx_example_not_valid",
  "expected_state_version": 8,
  "expected_evidence_version": 27,
  "request_id": "e5f3de47-ec68-43bb-80f6-25a3277257db"
}
```

```json
{
  "status": "needs_evidence",
  "session_id": 31,
  "outcome": "partial",
  "raw_logged_set_count": 2,
  "qualification": "pending",
  "missing_qualifiers": ["work_set_identification", "required_quality_evidence"],
  "queue_effect": "hold",
  "set_rows_created": 0,
  "next_action": "request_session_level_clarification"
}
```

Successful mutations return exact event/occurrence/workout/revision IDs where applicable, effective versions and request ID for readback. Errors distinguish `FRESH_CONTEXT_REQUIRED`, `CONTEXT_CHANGED`, `VERSION_CONFLICT`, `INCOMPLETE_EVIDENCE`, `AUTHORITY_REQUIRED`, `OUTSIDE_DELEGATED_SCOPE`, `QUEUE_UNRESOLVED`, `RECOVERY_SPACING_NOT_MET`, `WORKOUT_CONFLICT`, `DATE_NOT_EDITABLE` and `IDEMPOTENCY_CONFLICT`. Spacing rejection identifies the affected activity, rule/evidence and eligible alternatives rather than forbidding all activity. Review due is not an expiry error. Missing required review-handling acknowledgement requests that decision, not athlete reauthorization of the workout.

## 9. Fresh context and supported write coverage

Before individualized prescription, Dozer reads authoritative context: strategy/rule version, phase profile, authority, review state, reconciliation, timing eligibility and relevant actual workload/readiness. Briefly state current purpose, why the chosen activity fits today, what resistance session remains next if deferred, deviations and review_due. For phase reviews inspect prior-phase objectives, stimuli, outcomes, tolerability and enjoyment, not only the recent workout list; recommend a concrete purposeful change or explain continuation. Update the future playbook/harness contract accordingly; this SPEC changes no agent instructions now.

Concrete guard: after a complete read, MCP issues a random in-memory receipt bound to connection, configured athlete, target/occurrence scope, state/evidence versions and returned capabilities. Recommended TTL: 15 minutes or local-date rollover, whichever is sooner. Restart invalidates it. No active plan can yield a proposal-only receipt, not plan-linked prescription authority. Due review can yield prescribing capability under valid direction; review handling is checked separately. No persistent receipt table is needed.

Before every guarded mutation, validate receipt in MCP and atomically compare captured versions/authority and evaluate applicable content/load-based spacing predicates in the DB transaction. Cover materialization and all four legacy workout mutations, including explicit freeform mode; a caller-supplied activity label cannot override the result. Base changes bump evidence version; successful decisions/writes require a fresh read before the next independent mutation. The atomic session operation avoids four calls for routine materialization. UI RPCs also use version and eligibility checks. This establishes retrieval/freshness and the shipped typed predicates, not model understanding or enforcement against arbitrary raw service-key calls.

| Existing write route | Proposed release requirement |
| --- | --- |
| `create_or_update_workout` | Resolve active/paused authority every call; require context/version/request ID and explicit linked or freeform mode. Linked change validates scope and preserves original intent. |
| `add_workout_exercise` | Same guard, exercise checks and transactional idempotency; no repeated inserts on retry. |
| `update_workout_exercise` | Resolve owning date/link before guard; reject out-of-scope anchor changes; capture accepted routine deviation. |
| `remove_workout_exercise` | Same guard; cannot erase intent/credit history or silently redefine qualification. |
| `create_exercise` | Keep duplicate prevention. Creation alone neither approves an anchor nor advances a queue; invalidate relevant context. |
| Browser set CRUD | No context/review gate. Optional automatic occurrence FK; unlinked saves remain valid. Invalidate evidence on insert/edit/delete/link change. |
| Browser workout/library CRUD | Preserve freeform editing; linked UI uses scoped operations. Direct old-client changes are detected by version/fingerprint divergence, not claimed impossible. |
| SQL/raw service key/old MCP | Outside receipt enforcement. Retire old MCP instances before activation; no sandbox guarantee for compromised credentials/admins. |

Lifecycle policy: active and paused strategies require fresh context for all four MCP workout routes, even explicit freeform; paused blocks new plan-linked prescriptions, not intentional independent logging. Inactive/archived may retain date-guarded unlinked legacy behavior with `planning_enforcement=not_applicable`; linked archived targets stay protected. Optional new arguments are optional only for these compatibility cases. Never turn a failed plan read into freeform automatically. A deliberately authorized one-off is visibly distinct from live strategy.

Do not claim complete supported-MCP protection while any of the four legacy routes bypasses the checks. Playbook instructions cannot substitute for these guards. A model can still ignore prose or give advice without tools: test explanation quality separately and report only shipped enforcement.

## 10. Security, dates and failure integrity

Auth: new planning data is owner-scoped, with no anonymous access. Revoke direct table mutations from application roles, including service role where applicable; narrow RPC grants perform allowed operations. RLS bypass is not a substitute for privilege checks. Athlete-only activation/report confirmation validates the authenticated owner JWT; service-role callers cannot impersonate Frank with an actor field, quote or approval flag. Dozer's objective/routine RPC path records coach/system attribution and a delegated rule, never athlete identity.

For SECURITY DEFINER functions use a restricted owner, fixed search path, qualified names, explicit caller checks and narrow EXECUTE grants; revoke PUBLIC defaults. Verify effective privileges during an authorized implementation. Current broad legacy RLS remains a documented single-user limitation, not fixed by adding plan ownership. Keep the service key server-side; no new remote MCP exposure is implied.

Transactions lock state, validate versions/references/authority and commit plan rows/snapshots/decision together. Relevant base writes (sets, exercise identity/metrics/deletion, day plans, included recovery sources) bump `evidence_version` via narrowly scoped triggers; do not use only maximum timestamps/counts, which miss old edits. Consistent read snapshots plus atomic version comparison prevent stale-write races. Handle lock-order/deadlock conflicts without partial results. Snapshot mismatches block dependent plan claims, not all logging.

Planning RPCs and guarded legacy mutations require operation-scoped UUID/digest uniqueness: same key/payload retrieves original result; changed payload rejects. Already-committed replay works after receipt expiry without executing again. On timeout read by request ID or retry identically, never create a fresh-key duplicate. Read the exact target after writes before announcing success; report unverified outcome honestly if readback fails. Existing direct set/freeform CRUD does not acquire an unimplemented idempotency or stale-tab guarantee.

All planning dates use configured athlete-local `YYYY-MM-DD`; timestamps are instants. Convert local-day bounds to half-open intervals using IANA timezone, including DST, not UTC slicing or fixed-day duration. Existing DATE values remain literal local dates. Default `America/Montreal`, explicitly confirmed; travel/device/server zone changes do not silently relabel history. Store occurrence/review zone snapshots and explicit continuation dates. Date guards on workout writes remain today/future in athlete time; recording a retrospective evidence decision is not editing a past prescription.

Unavailable/unsupported/incomplete required context fails closed for dependent automation. Preserve independent logging where its own online save works. No fabricated offline success, no hidden retry-to-freeform, no assumption that absent telemetry means ready. Cache only display data, never write authority. Technical completeness means all required source reads succeeded; optional missing observations remain explicit and need not block unrelated actions. Errors/logs should carry IDs and reasons, not secrets or whole health payloads.

## 11. Staged integration, migration and rollback

Future authorized work only; “new” paths below are proposals, not existing artifacts. Retain a small typed rule vocabulary plus explicit unavailable/manual outcomes rather than a generic rule language. No app build/test/migration is performed by this SPEC revision.

| Stage | Exact integration paths and exit condition |
| --- | --- |
| A: schema/contracts | New `supabase/migrations/202609220001_training_planning.sql`; later align `supabase/schema.sql`. Update `src/types/database.ts`; new `src/lib/training-planning/contracts.ts`, `src/lib/training-planning/dates.ts`. Four tables, nullable set association, phase profiles/arbitrary slots, modality-specific evidence, typed recovery spacing, protected RPCs, validated authority and local dates. |
| B: reads/coach | New `src/lib/api/training-planning.ts`, `mcp-server/src/tools/training-planning.ts`, `mcp-server/src/planning-context.ts`. Update `mcp-server/src/index.ts`, `mcp-server/src/tools/workouts.ts`, `mcp-server/src/tools/sets.ts`, `mcp-server/src/supabase.ts`. Fix no-workout reads/name-note omissions/completeness; keep legacy planned count semantics labeled. All four workout routes guarded before activation. |
| C: useful UI | New `src/app/training/page.tsx`, `src/components/TrainingContext.tsx`; update `src/components/Navigation.tsx`, `src/app/strength/page.tsx`, `src/app/scheduled/[date]/page.tsx`, `src/app/exercise/[id]/page.tsx`, `src/lib/api/workouts.ts`, `src/lib/api/sets.ts`. Overview/header, automatic association, ambiguity-only clarification, report confirmation, readable decisions. |
| D: dates/docs/tests | Align affected helpers in `src/lib/api/daily-logs.ts`, `src/lib/api/reports.ts`, `src/lib/reports/workout-calendar.ts`, timezone display in `src/app/settings/page.tsx`; verify `public/sw.js` cache behavior. Update `mcp-server/README.md`, `mcp-server/COACH_PLAYBOOK.md`. New `supabase/tests/training-planning.sql`, `mcp-server/src/tools/training-planning.test.ts`, `tests/training-planning.spec.ts`; select/document runners in existing package manifests. |

Before migration, separately authorize deployed-schema/grant discovery and backup; repo SQL is not proof of production shape. Use an additive versioned migration, not blind rerun of bootstrap SQL. Provision the owner/zone, leave feature inactive and old set links NULL. Legacy logs remain work, schedules remain plans; no inferred approvals or program compliance. An imported strategy is a proposal; initial queue seed is explicit. Pilot with synthetic fixtures/disposable DB; prohibit production credentials and automatic real environment loading in MCP tests. Future verification includes app lint/build, separate MCP type-check, protocol discovery/calls and the new focused suites.

MVP release needs configurable phase profiles and purposeful variation proposals, current authority/reviews, reliable retrieval, actual-load spacing and appropriate daily alternatives, linked intent/history, occurrence qualification and safe failure. Defer rich retrospective conflict UI, bulk historical attribution, multi-session day editor, sophisticated analytics and cross-block optimization. Retained phase summaries/proposals, basic correction visibility and duplicate prevention are not deferred. No release claim may include checks not shipped and exercised.

Rollback defaults to disable planning mutations/UI integration while retaining additive schema/history and freeform logging. Preserve generated workouts, sets, immutable revisions and decisions; handle retained linked-day deletion restrictions coherently. Any destructive schema rollback needs separate authorization and dependency review/export. Do not delete training history to restore old UI behavior.

## 12. Acceptance criteria for the future build

These are test requirements, not passed tests. Fixtures supply authored training-dose and quality quantities. The one-intervening-non-strength-day example is Frank's explicit phase-policy requirement, not a universal medical threshold. Test both DB/direct-function behavior and public MCP/UI routes.

| ID | Scenario | Required result |
| --- | --- | --- |
| A1 | Fresh Dozer session, no prior chat. | Reads live authority/block/rules/queue/reviews before prescribing; explains purpose and actual basis; reads back saved revision/target. |
| A2 | Schedule/open/Finish an unperformed workout. | No qualifying exposure/queue advance. Planned lists/counts are never described as performed work. |
| A3 | Required qualifying work, optional accessories omitted. | One exposure and approved queue effect; accessories do not veto; no redundant confirmation where evidence is sufficient. |
| A4 | Reduced/partial sessions above versus below approved minimum. | Above qualifies/counts toward relevant review scope without ad hoc approval; below preserves work, no auto-advance. Label is not the rule. |
| A5 | Warmup-only sets, then missing work/effort/quality evidence. | Warmups do not qualify. Missing qualifier prompts at session level; no guess, percentage shortcut or mandatory per-set field. |
| A6 | Sets without workout or occurrence link; overlapping/shared anchors. | Work appears independently of workout existence. Auto-association only if reliable; otherwise expose exact ambiguity, not an inferred split/slot. |
| A7 | Supportive recovery/cardio or rest during any resistance phase. | Resistance queue unchanged; separate activity evidence retained. Recovery changes today's execution, not automatically the phase. |
| A8 | Ambiguous report, specific authenticated confirmation, later matching logs. | Pending becomes self-reported qualifying exposure if rule met; later logs reconcile same occurrence once. No fabricated sets or reported volume added to logged totals. |
| A9 | Two fragments across dates; explicitly identified continuation; multiple real occurrences same day. | No implicit pooling; approved continuation finishes original occurrence once; distinct sessions can qualify without a calendar-day credit cap. |
| A10 | Out-of-order qualifying work. | Preserve workload and scoped exposure; apply explicit approved queue treatment or request authorization, no silent skip/catch-up debt. |
| A11 | Review calendar date passes with no new logs. | review_due visible; still-valid safe direction can be prescribed with required review handling, logging uninterrupted; no automatic expiry/deload/UI exception. |
| A12 | Qualifying reduced/partial/report exposure reaches scoped threshold; later correction. | Count occurrences not attendance or evidence sources; retain original due reason/history, show corrections, no silent date reset. |
| A13 | Due review, bounded continuation, revisit reached. | Dozer surfaces due state and records/references rationale/revisit within authority. Acknowledgement does not resolve it; genuine delegated review can resolve with evidence/new checkpoint. |
| A14 | Pain substitution repeated or revisit reached. | Reason/revisit preserved, anchor unchanged; repeated deviation surfaces review. Applicable stop condition restricts affected prescription independently of review status. |
| A15 | Absence followed by return. | Calendar/concern review and retained history exposed; reassess entry/queue within authority, no compressed catch-up or automatic new program. |
| A16 | Steady capacity satisfies maintenance policy. | Success can mean hold/continue; no mandatory escalation, novelty, inferred machine-load transfer or invented global cap. |
| A17 | Material revision, paused state, genuine authorization expiry; agent asserts approval. | Athlete-only activation enforced; valid routine decisions need no repeat approval. Expiry/pause blocks linked prescribing; no silent freeform fallback. |
| A18 | Missing/unavailable/unsupported/stale context; old receipt/another connection or local rollover. | Distinct reasons, no invented active plan; guarded writes reject; intentional separately authorized one-off stays clearly separate. |
| A19 | Each of four legacy MCP workout mutations omits context, requests freeform, or retries. | Active/paused checks cover all routes; freeform cannot bypass linked restrictions. Idempotent guarded retry creates no duplicate; absent-plan compatibility labeled honestly. |
| A20 | Concurrent activate/materialize/reconcile; incomplete pages/null metrics. | Atomic result/version conflict, no lost decision/double credit; exact completeness, unknown not zero, dependent automation blocked only where needed. |
| A21 | Old credited set edit/deletion, report/log conflict, direct legacy prescription edit. | Recompute; unchanged objective result needs no confirmation. Changed dependent queue exposed; original snapshot retained and no false compliance. |
| A22 | Revision switch, copy/repeat/delete or historical view. | Old intent/rule version preserved; no copied credit/authority; explicit linked-target conflict and readable later corrections. |
| A23 | Athlete evening/DST/server-device zone differences; retrospective report. | One athlete-local date contract, original zone/evidence preserved; invalid dates rejected; past attribution is not a rewritten prescription. |
| A24 | Anonymous/other-user/service-role attempts human activation/report confirmation; ordinary logger during outage. | Actual grant/identity boundary verified, no actor spoofing; logger retains existing online behavior/tap count. Receipt never advertised as proof of reasoning. |
| A25 | Full-body A/B, upper/lower, PPL and a custom sequence with a different slot count. | All author, validate and progress without PPL defaults, fixed three-slot logic or fabricated resistance slots in a non-resistance phase. Phase transitions preserve history and recent actual load. |
| A26 | Low/mid/high/mixed rep, bilateral/unilateral/mixed, strength/power/performance/mobility phase profiles. | Dimensions are configurable and can coexist. Goals use appropriate outcomes/quality; mobility need not specify load/reps, power is not evaluated by load alone. Dozer proposes a coherent combination with rationale, not arbitrary category rotation. |
| A27 | Monday full-body, repeat request Tuesday, next candidate Wednesday under the explicit intervening-day rule. | Tuesday returns bounded appropriate cardio/mobility/rest and holds the next resistance slot. Wednesday is only a candidate if the intervening non-strength day is established and readiness permits; no fixed-hours or automatic-recovery claim. |
| A28 | Tuesday unplanned/partial strength that does not earn queue credit; relabel it mobility/freeform or activate another phase. | Actual applicable load still delays resistance eligibility. Label, split, phase or lack of qualification cannot bypass spacing on any supported prescription route. Logging real work remains available. |
| A29 | Intervening-day log empty; planned strength unperformed; future reservation; late-night/DST boundaries. | Unknown activity is not proven rest; ask minimally. Plans are not actual load. Prospective conflicts and actual spacing remain distinct, using complete athlete-local dates; recheck before execution-day prescription. |
| A30 | Approved supportive cardio/mobility/rest intent versus a primary cardio/mobility-phase slot. | Supportive intent persists without cancelling the pending resistance slot, inventing logs or awarding resistance credit. Primary modality-specific work can satisfy its own objectives/completion; hard cardio/loaded mobility is not automatically recovery. |
| A31 | Several prior phases and a due review in a fresh Dozer session. | Retrieve prior-phase outcomes/stimuli/tolerability and proactively recommend a specific justified change or continuation. Preserve useful comparisons; no random exercise churn, endless default PPL, compulsory novelty or silent phase activation. |
| A32 | Actual-load insertion after context read; request alternative after a spacing rejection. | Version-checked spacing is re-evaluated transactionally on materialization and each legacy prescription mutation. Reject affected stale/ineligible resistance; allow independently eligible alternatives. Stale recorded recommendations are not presented as current advice. |

## 13. Defaults, remaining risks and handoff

Recommended defaults after Smith/Dozer reconciliation: review is not expiry; qualification is independent of outcome labels; qualifying reports are allowed; ordinary objective reconciliation is not approval-only; routine decisions may be delegated; material direction changes use authenticated UI in MVP. These recommendations are integrated into this proposed SPEC; they are not evidence that Frank has approved implementation or an actual training strategy.

Still required during plan authoring: a coherent split/phase profile, actual anchors/benchmarks/equivalents, measurable modality-specific minimum/quality predicates, recovery/load classifications, build/maintain criteria, accepted evidence, review/rotation checkpoints and bounded flexibility. Frank's full-body spacing example is now a supported policy/acceptance fixture, not activation of a current training phase. No live athlete plan or training-dose prescription is created here. Validate session-level clarification usability, especially where logs cannot distinguish warmups or establish intervening-day activity. Confirm timezone/travel preference at setup. Four tables plus one nullable association column remain Neo's design recommendation, not Dozer-endorsed schema; the variety extension fits this model rather than adding another scheduler.

Residual risks: broad legacy RLS/service-role trust; deployed-schema drift; sparse/ambiguous evidence; semantic coaching mistakes beyond typed predicates; future clients bypassing supported MCP guards. Test and disclose the real boundary. Freshness receipts, immutable history and prompt rules reduce specific failure modes; they do not guarantee all model reasoning.

Verification scope: Neo inspected the repository and drafted the feature; Dozer supplied coaching requirements; Smith reconciled the design and independently reviewed the complete revised artifact. No application build, feature tests, database migration or live training-data audit was performed. Specialist CLI sessions initialized their configured MCP subprocesses; that is not an application deployment or evidence of production-schema verification. Repository checks used git status/branch/rev-parse/ls-files and package/source reads. Document validation parsed every JSON example, checked acceptance-criterion identifiers and cited existing/proposed file paths, and compared the root SPEC with HEAD. The project change is only the new `SPEC-training-planning.md`; root SPEC, app code, migrations, git index/commits and deployments are unchanged. The specification did not modify live workout records or Dozer's instructions. Document checks are not feature tests.

---
Smith — Frank's AI Agent
Engineering input: Neo. Coaching requirements: Dozer, integrated with Smith's product decisions. No implementation authorized.

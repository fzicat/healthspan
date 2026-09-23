# Bounded SQL/MCP specification review

## Verdict and scope

**Three concrete gaps remain: two prescription-safety bypasses and one occurrence-deduplication gap.** The safety bypasses were reproduced through the public MCP stdio tools against the real repository migrations in disposable PGlite. This is not a claim that all A1–A32 acceptance criteria have been reviewed or passed.

Reviewed in `/home/fzicat/projects/healthspan-training-planning`, branch `feat/training-planning`. Read `/home/fzicat/projects/AGENTS.md`, the complete `SPEC-training-planning.md`, relevant software-delivery/review skills, and the earlier timed-out review log. Investigated the migration 001–004 SQL, public MCP adapter/receipts, and relevant test paths. Investigation used five bounded tool batches; the sixth writes this report. No application source, migration, environment, production data, main branch, or profile was changed by this review. Only this report is added.

Line references describe the working files inspected during this review; concurrent parent changes may move them. Parent fixes already in progress—`mutate_training_workout` alias ambiguity, deviation review surfacing, UI argument/date handling, supportive-cardio inputs, and the stale runbook—are **not reported below as separate open findings**. None is the root cause of the reproduced safety bypasses.

## Findings

### F1 — High: an applicable cardio stop is bypassed by every unlinked legacy workout route

**Specification:** §§5–6 and §9; A14, A19, A30, A32. Applicable stop conditions must constrain the resulting prescription on supported routes, including explicit freeform. Freeform removes linked authority requirements, not safety restrictions.

**Evidence:**

- `supabase/migrations/202609220003_training_rpcs.sql:388–389`: after applying a legacy mutation, `training_check_prescription` receives `s.activity_kind` for linked work, but the literal `mobility` for **all unlinked work**.
- `supabase/migrations/202609220002_training_engine.sql:293–295`: exercise content contributes cardio/systemic load tags.
- The stop check at `202609220002_training_engine.sql:303–304` does not use those cardio tags. It matches the supplied `kind`, with a special content-derived override only for strength. Thus a cardio-only stop is invisible when a cardio prescription is checked as mobility.
- `mcp-server/src/planning-context.ts:55–62` grants `legacy:freeform` independently of per-activity materialization eligibility. This is reasonable only if the transactional resulting-content check is complete.

**Fresh reproduction:** activated a synthetic plan, created an unlinked workout containing an exercise explicitly categorized as cardio with time-only metrics, and recorded an authorized `pain` stop for `activity_kinds: ["cardio"]`. Public `get_training_context` returned cardio reasons `["STOP_CONDITION"]`. With a fresh receipt for each action, all of these public MCP calls nevertheless returned `status: "committed"` in explicit freeform mode:

1. `create_or_update_workout`: renamed that cardio workout.
2. `add_workout_exercise`: added another cardio prescription.
3. `update_workout_exercise`: changed the original cardio details.
4. `remove_workout_exercise`: removed the original row while leaving the added cardio row.

Exact workout/exercise SQL readbacks after each call confirmed the mutations. In particular, the add/update results demonstrate new or changed affected prescriptions, not merely safe deletion of all stopped work. The stop event was not resolved.

**Required correction/regression:** evaluate stop applicability against the activity classes of the resulting content, including mixed content, rather than only the fallback kind. Exercise all four public legacy routes with a cardio-specific stop and assert rollback of prohibited changes; independently eligible alternatives must remain available. Fixing the known SQL alias ambiguity does not address this classification mismatch.

### F2 — High: accepted regional spacing rules lose their tags on unlinked evidence and freeform candidates

**Specification:** §4 recovery/load classifications and §5 temporal eligibility; A25, A28, A32. Actual unplanned/nonqualifying work must retain relevant overlapping load, and explicit freeform or lack of occurrence association must not evade accepted spacing rules. Unknown classification must not become affirmative eligibility.

**Evidence:**

- `202609220002_training_engine.sql:4–5,79–85` accepts regional tags such as `upper`/`lower` and `min_calendar_days` rules selecting them.
- `202609220002_training_engine.sql:268–277` preserves occurrence tags for linked sets, but an unlinked strength set receives only generic resistance/systemic tags. Classification capture in `202609220001_training_planning.sql:169–187` preserves category/metrics, not regional classification.
- `202609220002_training_engine.sql:293–295` likewise starts candidate tags from the supplied slot plus generic content-derived tags. Freeform legacy candidates have no slot.
- At `202609220002_training_engine.sql:306–310`, an unmatched candidate selector skips the rule, and missing matching prior load also skips it. Neither case returns classification uncertainty.

**Fresh reproductions:** used an accepted synthetic sequence whose slots have `load_tags: ["resistance", "upper"]`, with an `upper` → `upper` `min_calendar_days: 2` rule. The exact same exercise ID was used throughout; no name heuristic or split rename was needed.

- **Lost preceding classification:** inserted yesterday's actual set without a session link. `training_load_dates` returned only `["resistance", "systemic"]`. Today's public context declared strength eligible, and public `materialize_training_session` committed today's same-anchor slot. Exact session readback confirmed the new intent had the regional `upper` tag. The prior same-anchor actual work had not been accounted for by that rule.
- **Lost candidate classification:** in a separate fixture, explicitly attributed yesterday's actual set to the approved `upper` slot. Today's public context correctly returned `RECOVERY_SPACING_NOT_MET`. A fresh public `add_workout_exercise` call for that exact exercise in explicit freeform mode still committed; exact exercise-row readback confirmed it. Without a slot, the candidate's regional selector was silently skipped.

**Required correction/regression:** provide a validated classification path for both actual unlinked evidence and resulting freeform content, or fail closed for prescriptions dependent on unresolved regional classification. Do not infer physiological regions from names or treat every resistance exercise as every region. Add both missing-prior-tag and missing-candidate-tag tests through SQL and public MCP. Current generic `resistance` selector tests do not establish safety for the wider accepted rule vocabulary.

### F3 — Medium: switching slot keys bypasses potential-duplicate report detection

**Specification:** §4 integrity and §5 athlete reports; A6, A8, A9. A newly allocated occurrence ID must not by itself permit repeated credit for potentially identical work. Shared anchors require matching/clarification, while genuinely distinct same-day sessions must remain possible.

**Evidence:**

- `202609220003_training_rpcs.sql:195–200` checks potential duplicates only when **both date and slot key** match. It requires `distinct_from_session_ids` for that case, but not for overlapping work assigned to a different slot.
- `202609220003_training_rpcs.sql:236–254` validates each confirmed report locally and requires the generic boolean `duplicate_checked`, but does not compare its work against reports in other occurrences.
- `202609220002_training_engine.sql:206–217` independently credits each qualifying occurrence.

**Fresh reproduction:** activated the normal synthetic `alpha`/`beta` sequence, whose slots share the same anchor. Through authenticated owner RPCs, attributed yesterday's work to `alpha` and confirmed a specific one-set report. Then attributed the same date to `beta` and confirmed the identical report. Both used `duplicate_checked: true`; neither supplied any explicit distinction from the other occurrence. Both qualifications were `qualifies`. Public MCP context then returned `qualifying_exposures: 2` and the queue back at `alpha`; exact event readback showed the two identical reports attached to different occurrence IDs, with zero fabricated/logged set rows.

This is a **missing ambiguity check**, not proof that all identical same-day reports describe the same real session. Nor is it an athlete-authentication bypass: the confirmations were genuinely owner-authorized. The defect is that the system demands explicit occurrence distinction within one slot but silently accepts the same potential duplicate across shared-anchor slots. A blanket `duplicate_checked` flag does not identify which matching occurrence was considered.

**Required correction/regression:** detect overlapping date/work/report candidates across slot keys and revisions, require explicit matching to the existing occurrence or an attributed distinct-session decision, and retain support for real same-day separate sessions. Add a cross-slot shared-anchor duplicate case alongside the existing same-slot duplicate rejection test.

## Executed verification and coverage limits

All fresh checks used synthetic disposable data. Public protocol checks launched the repository MCP process with `HSPAN_MCP_NO_DOTENV=1`, a minimal synthetic environment, and a loopback fixture endpoint. The fixture executes the real SQL migrations. No live Supabase or athlete credentials were loaded.

| Executed command/check | Observed result |
| --- | --- |
| `node supabase/tests/training-planning.mjs` | **49 assertions passed.** |
| `node supabase/tests/extended-training.mjs` | **23 passed; 0 failed.** |
| `node supabase/tests/automatic-training.mjs`, initial execution | **19 passed; 2 failed.** Failures: `A5 authored RIR and quality remain mandatory, clarification overrides work identification` returned `does_not_qualify` instead of `qualifies`; `mobility reports require classification; actual tags enforce mobility calendar rule` returned `pending` instead of `qualifies`. The chained command exited 1 and therefore did not run its subsequent MCP command. |
| `node_modules/.bin/tsx --test tests/mcp-database.spec.ts`, separate execution | **7 passed; 0 failed.** |
| `node supabase/tests/automatic-training.mjs`, separate rerun | **21 passed; 0 failed.** No reviewer source fix was applied between runs. The intermittent failures were not diagnosed within the bound; the rerun does not erase the initial failures. |
| Inline focused reproduction harness using `node --import tsx --input-type=module -e …` | **Exit 0.** Reproduced F1, both F2 paths, and F3. Exact SQL target readbacks followed mutations. All four disposable fixture listeners were closed and closure checked with failed connection attempts. No temporary script file was created. These are ad-hoc regression demonstrations, not committed tests. |

### What the green checks do not establish

- The public MCP suite proves protocol/client/SQL integration through a **test-only PostgREST-shaped adapter**, not deployed Supabase/PostgREST behavior. The adapter serializes database access; its green result is not native concurrent-transaction evidence (`tests/support/local-training-server.ts:25–48`).
- The repository has native PostgreSQL tests for concurrency, lock inversion, effective grants, identity boundaries and temporary-table shadowing (`tests/native-training.mts`). Their source/test inventory was inspected, but that suite was **not freshly executed in this bounded review**. No native PostgreSQL pass or live deployment certification is claimed here.
- Existing successful generic-resistance spacing and same-slot duplicate tests do not cover the selector/stop/cross-slot cases above. Freshness and idempotency tests can pass while a freshly authorized transaction evaluates the wrong activity classification.
- The protocol suite includes a passing test explicitly named `known production defect: absent migration rejects ordinary legacy planning instead of compatibility`. That is a characterization of refusal when migrations are absent, not evidence of migration-absent compatibility. It is not promoted here into a fourth finding; coordinate staged rollout claims accordingly.
- Browser usability, fresh-coach explanation quality, independent logger behavior during a real planning-service outage, deployed schema/grants, and all A1–A32 combinations were not verified here. Complete acceptance remains broader than these SQL/MCP checks.

## Handoff

Fix F1 and F2 before claiming all supported prescription routes enforce applicable safety/spacing rules. Close the cross-slot ambiguity gap in F3 without imposing a calendar-day credit cap. Preserve the parent fixes in progress, commit focused regressions for the reproduced paths, and investigate the automatic suite's intermittent failures before reporting stable suite green.

# Bounded final review — training planning

## Parent verification after review

The final-source native rerun is now green: `npm run test:training` recorded 16/16 native checks and matching migration hashes in `.training-test/evidence/native-postgres.json`. The final browser run records 13/13 including mobile layout, outage and absent-migration logger saves. See IMPLEMENTATION-REPORT.md for current evidence; the reviewer observations below remain an honest historical snapshot.

The unmigrated MCP behavior remains an explicit rollout limitation: ordinary browser set logging is preserved, but the new coach server refuses failed/missing planning RPC reads instead of guessing absent authority. This is not advertised as an enforcement or compatibility guarantee. Smith must assess the limitation before rollout; no old instance may stay prescription-capable after activation.


## Explicit verdict

**Stage 1 — PASS for closure of the three concrete findings F1–F3 in `REVIEW-SPEC-SQL.md`, within the exercised cases.** The previous cardio-stop bypass, regional-spacing bypasses, and cross-slot retrospective-attribution ambiguity now have matching implementation changes and freshly passing regressions. No remaining blocker was found in those narrowly reviewed paths. This is **not** an A1–A32 specification PASS.

**Stage 2 — bounded security/integration review completed after that gate passed.** No new high-severity implementation defect was established in the inspected paths. Two important release qualifications remain:

1. **Known migration-absent MCP compatibility defect remains:** the updated MCP refuses ordinary legacy workout planning on an unmigrated database. A green characterization test proves the refusal, not compatibility.
2. **Saved native PostgreSQL evidence does not match the final migration 002:** its 16 passing checks cannot certify the current complete migration set. Rerun native verification against final sources before making that claim.

**Overall: focused fixes accepted; full-spec, release, deployed-security, and coaching acceptance NOT established.** Do not translate this report into “all A1–A32 passed,” “live Supabase verified,” or “Dozer coaching validated.”

## Scope and method

Reviewed only `/home/fzicat/projects/healthspan-training-planning`, with branch confirmed as `feat/training-planning`. Read `/home/fzicat/projects/AGENTS.md`, the full `SPEC-training-planning.md`, the previous SQL/spec review, and the software-delivery and Karpathy review skills. Used six bounded tool batches, reserving the sixth for this report.

Application source was read-only. This review writes only this report; it makes no commits and changes no environment, production data, main branch, or profile. Parent work was concurrent, so line references and evidence hashes describe the inspected state, not an immutable release commit. This was not an exhaustive review of every modified/untracked artifact.

Fresh execution used repository PGlite fixtures and public MCP stdio clients with synthetic credentials and `HSPAN_MCP_NO_DOTENV=1`. The test adapter is loopback-only and serializes database access (`tests/support/local-training-server.ts:25–48`). Its results are not native concurrent-transaction or deployed PostgREST evidence. No build, browser run, or native run was launched by this reviewer.

## Stage 1: concrete defect closure

### F1 — Cardio stop on all four unlinked legacy routes: closed in tested scope

**Implementation evidence:**

- `supabase/migrations/202609220002_training_engine.sql:277–295` derives exercise tags from current/captured metadata and accepted exercise-ID classifications, including cardio/systemic tags.
- `202609220002_training_engine.sql:305–310,331–357` collects resulting-content tags and applies stop activity selectors to those tags. Strength maps to `resistance`; cardio is no longer hidden by the legacy `mobility` fallback. A nonempty unlinked workout is not falsely classified as mobility solely by that fallback.
- `supabase/migrations/202609220003_training_rpcs.sql:378–389` checks the resulting workout after the mutation, inside the transaction. `:35–39` removes lifecycle/queue reasons for intentional freeform, but does not remove spacing, classification, or stop reasons.

**Fresh regression evidence:** `tests/mcp-safety.spec.ts:99–127` exercises all four public tools with cardio-only and mixed content, in active and paused states. Rejections compare exact workout/exercise/session/version/event snapshots (`:71–83`). It also verifies that removing the last stopped row, prescribing independent strength, and eligible active rest remain possible (`:113–124`). These checks passed in the fresh **34-test** safety run.

This closes the reported cardio bypass, not every conceivable stop-condition/content combination.

### F2 — Regional classification of actual work and freeform candidates: closed in tested scope

**Implementation evidence:**

- `202609220002_training_engine.sql:273–295` resolves exact exercise IDs, including permitted equivalents, using activated revisions rather than proposals or exercise-name heuristics. Accepted history is retained across phase changes and library relabeling.
- `:300–310` represents unresolved regional classification separately from affirmative tags, including per-exercise uncertainty in mixed content.
- `:312–329` carries classifications into actual sets, reports, and cardio load. Unlinked/nonqualifying sets are not discarded.
- `:359–395` returns `LOAD_CLASSIFICATION_REQUIRED` and a null earliest date when relevant unresolved classifications can change the spacing result; known applicable loads still produce `RECOVERY_SPACING_NOT_MET`. Independent activities and load outside the calendar rule's horizon are not blanket-blocked.

**Fresh regression evidence:** `tests/mcp-safety.spec.ts:130–228` covers the original missing-preceding-tag and missing-candidate-tag cases, SQL enforcement independently of receipt rejection, all four active/paused freeform routes, exact IDs/equivalents across phases and library relabeling, proposal-only classification rejection, unknown preceding/candidate regions, mixed candidates, and independent lower/rest alternatives. The suite passed **34/34** including its nested route checks; this number must not be interpreted as 34 independent acceptance criteria.

The fix is conservative accepted-history classification, not a newly validated physiological classifier. Exhaustive combinations of accepted tags/rules and practical athlete classification workflows remain outside this review.

### F3 — Cross-slot same-date retrospective duplicates: closed in tested scope

**Implementation evidence:** `202609220003_training_rpcs.sql:195–205`, especially `:199`, checks every existing same-date primary occurrence (`slot_key IS NOT NULL`), without limiting the check to the requested slot or revision. Each must be explicitly represented in `distinct_from_session_ids` before another retrospective occurrence is created. Existing set-association checks remain in place.

**Fresh regression evidence:**

- `supabase/tests/extended-training.mjs:188–192`: switching from `alpha` to `beta` on the same date without explicit distinction rejects with `POTENTIAL_DUPLICATE_OCCURRENCE`.
- `:193–199`: an authenticated owner identifies separate same-day occurrences, confirms their separate reports, and receives two exposures. There is no global one-credit-per-day cap.

The extended suite passed **26/26**. The newly added F3 tests use authenticated SQL RPCs; they are not fresh browser tests of the attribution workflow. The SQL comparison spans revisions, but the added explicit regression is same-revision/cross-slot. Genuine athlete truthfulness is not inferred from these checks.

### Other supplied fixes inspected

- **SQL alias ambiguity:** `202609220003_training_rpcs.sql:396` now uses `anchor` rather than colliding with the local `a` JSON variable. `extended-training.mjs:200–209` freshly passes linked edits, immutable snapshot comparison, accepted-fingerprint handling, and repeated-deviation review surfacing.
- **Linked UI date arguments:** `src/components/TrainingLinkedEditor.tsx:30–35` supplies the session date only for create/add; update/remove use the row ID and server-owned date resolution. Saved browser evidence includes `linked-workout-operation-contracts` passing.
- **Supportive cardio inputs:** `src/app/training/page.tsx:108–136` checks authored bounds, rejects missing/nonfinite/out-of-bound values, and sends numeric `duration_minutes`/`intensity` only for supportive cardio. The SQL bound check remains at `202609220003_training_rpcs.sql:333–334`. Saved browser evidence includes `supportive-cardio-bounds-and-numeric-payload` passing.
- **Same-tick event ordering:** `supabase/migrations/202609220001_training_planning.sql:118–126` locks the singleton and assigns the later of wall-clock time and the prior event maximum plus one microsecond. This addresses ambiguous ordering of relevant events by random UUID on equal timestamps. The automatic suite passed **21/21 on each of two fresh consecutive runs**, including the two cases that had intermittently failed in the previous review. This is positive regression evidence, not proof that all timing flakiness is impossible.

## Stage 2: bounded code quality, security, and integration

### Checks supported by inspected code and fresh tests

- **Shared protected workout path:** all four public legacy wrappers delegate to `TrainingPlanning.mutateWorkout` (`mcp-server/src/tools/workouts.ts:8–20`), which reads current authority and performs guarded transactional RPC writes (`mcp-server/src/tools/training-planning.ts:152–188`). No parallel direct service-role workout writer was found in these wrappers.
- **Receipts remain scoped capabilities, not athlete approval:** `mcp-server/src/planning-context.ts:44–99` checks configured athlete, completeness, local date/TTL, versions, target/session scope, and capabilities. Failed refresh invalidates receipts; committed identical replay is handled separately (`tools/training-planning.ts:89–102,123–149`).
- **Database enforcement is independent of caller prose:** migration 001 provides actual role/JWT/owner checks (`:87–97`), state locking/version comparison (`:143–150`), and actor/request/payload replay checks (`:130–140,161–170`). Migration 003 separately restricts athlete-only decisions and validates resulting prescriptions. The role boundary does not rely on a client-supplied “approved” field.
- **Privilege intent is explicit:** `202609220001_training_planning.sql:29–33,191–199` and `202609220004_training_grants.sql:4–30` establish a restricted RPC owner, revoke direct planning-table/helper access, transfer function ownership, and narrowly grant RPC execution. SECURITY DEFINER functions use fixed paths and relevant table references are qualified. The existing broad legacy-table trust boundary is not removed by these changes.
- **Browser mutation readback and uncertainty:** `src/lib/api/training-planning.ts:100–117` retains the request UUID/payload and checks the committed receipt against history before returning verified success. Readback failure explicitly remains uncertain instead of becoming a new-key retry.
- **Ordinary set saving has no context/review read gate:** `src/lib/api/sets.ts:67–97` performs direct set insertion with an optional occurrence FK. This is consistent with the saved local browser outage/unmigrated logger checks; it does not establish behavior during a real database-trigger failure or every deployed outage.
- **Focused static checks passed:** MCP TypeScript checking, ESLint on the safety test and two directly reviewed UI files, and tracked-diff whitespace checking. No complete root app build or repository-wide static audit was performed in this review.

### R1 — Medium, known integration limitation: unmigrated MCP legacy planning still fails

**Evidence:** `mcp-server/src/tools/training-planning.ts:169–186` requires planning context/RPC availability before the compatibility branch can execute. `tests/mcp-database.spec.ts:230–235` deliberately characterizes the absence of the context RPC and expects `create_or_update_workout` to fail with no workout created. This exact test passed again in the fresh **7/7** public SQL/protocol run.

**Impact:** the compatibility branch supports suitable migrated lifecycle states; it does not preserve ordinary legacy MCP planning when the new schema/RPCs are absent. Browser set-saving compatibility is a different path and does not close this limitation.

**Release treatment:** keep this limitation explicit and enforce migration-first server rollout, or implement and test a separately justified migration-absent compatibility path. Do not turn arbitrary planning-read failures into silent freeform fallback. A passing “known production defect” test is not fulfillment of the compatibility requirement.

### R2 — Verification gap: native evidence is from a different migration 002

Saved `.training-test/evidence/native-console.log:12–46` reports **16 passed, 0 failed**, native PostgreSQL 18.4, real concurrency/deadlock/identity/ACL/shadowing checks, and successful cleanup. The enumerated `ok` count was parsed and verified. This is useful existing native evidence, not a run executed by this reviewer.

However, source hashes were compared programmatically:

- Recorded migration 002 hash (`native-console.log:9`): `c74b8056b14b9ae6ae1c4f3b8ba664060d323b2fd4e1488aab57e0d90fbd05c0`
- Current inspected migration 002 hash: `8658d7408cae98a8f9f583bf81df61216f6a0b3b8c931af7f42eeea68920e550`
- The recorded bootstrap schema and migrations 001, 003, and 004 matched at comparison time.

**Required before claiming final native green:** rerun the native suite after source changes stop, verify its recorded hashes against all final migrations, and retain the actual result/cleanup evidence. This mismatch is not evidence of a native failure; it is evidence that current-source native verification remains incomplete.

### Maintainability/performance boundary

The SQL remains dense and the authoritative context read traverses retained occurrences/evidence while holding the state lock (`202609220003_training_rpcs.sql:48–87`), with repeated evaluation/load-classification queries. No representative long-history latency or contention benchmark was run. Do not infer production responsiveness from tiny fixtures. This is an unverified operational risk, not a reproduced performance defect or a request for speculative refactoring.

## Verification ledger

| Evidence | Actual result | Scope |
| --- | --- | --- |
| Fresh `node_modules/.bin/tsx --test tests/mcp-safety.spec.ts` | **34 passed, 0 failed** | Public MCP stdio → test HTTP adapter → actual migrations; nested route checks included. |
| Fresh `node supabase/tests/extended-training.mjs` | **26 passed, 0 failed** | Disposable PGlite; includes F3 rejection/distinct-session acceptance and linked deviations. |
| Fresh `node supabase/tests/automatic-training.mjs`, run twice sequentially | **21 passed, 0 failed each run** | Automatic qualification and related timing/regression fixtures. |
| Fresh `node_modules/.bin/tsx --test tests/mcp-database.spec.ts` | **7 passed, 0 failed** | Public protocol/SQL integration; includes the known migration-absent refusal characterization. |
| Fresh `node_modules/.bin/tsc --noEmit -p mcp-server/tsconfig.json` | **Exit 0** | MCP TypeScript only. |
| Fresh `node_modules/.bin/eslint tests/mcp-safety.spec.ts src/components/TrainingLinkedEditor.tsx src/app/training/page.tsx` | **Exit 0** | Listed files only. |
| Fresh `git diff --check` | No diagnostics | Tracked diff whitespace; not an untracked-file code audit. |
| Existing `.training-test/evidence/native-console.log` | **16 passed, 0 failed; cleanup=true** | Saved native run; migration 002 hash mismatch prevents final-source certification. |
| Existing `.training-test/evidence/browser/results.json` | **12 passed**, no recorded page errors or blocked external origins | Parsed/count-checked saved synthetic-browser report, not a fresh run here or real Supabase validation. Screenshots explicitly say “Captured, not visually inspected.” |

## Acceptance and release work still unverified

**No A1–A32 criterion is marked fully passed by this review.** Individual passing fixtures demonstrate selected behavior, not every clause or every DB/MCP/UI route of the named criterion.

| Criteria | What remains beyond this review |
| --- | --- |
| **A1, A13, A15, A16, A31** | Fresh Dozer/no-chat retrieval and actual explanation quality; appropriate return-after-absence and maintenance judgments; bounded-continuation rationale/revisit behavior; prior-phase synthesis and a justified proactive change/continuation. Tool/schema tests cannot establish coherent coaching. |
| **A2–A6** | Full UI journeys for schedule/open/Finish versus actual credit, automatic qualifying work, partial thresholds, minimal ambiguity prompts, and shared-anchor association. Fresh SQL regressions cover selected qualification/missingness/association cases, not complete athlete usability or every public route. |
| **A7, A27, A29, A30** | End-to-end supportive versus primary modality behavior for all modalities, complete intervening-day evidence handling, actual-versus-reserved load, hard-cardio/loaded-mobility boundaries, and real execution-day reassessment. Saved browser checks and synthetic SQL examples do not establish all scenarios or suitability of the prescribed activity. |
| **A8–A10** | Complete athlete report/confirmation/later-log workflow, continuation UX, and out-of-order decisions across routes. F3 now covers same-revision cross-slot rejection and explicit distinct same-day reports; a dedicated cross-revision duplicate regression and full browser attribution/clarification usability remain unverified here. |
| **A11–A12** | Complete calendar/exposure/review-history behavior across inactivity, lifecycle/revision changes, continuation, and later corrections. Selected SQL review-trigger tests are not full acceptance. |
| **A14** | All applicable stop kinds, all pain substitution/revisit paths, and real coaching response. Fresh checks establish the reported cardio-stop bypass is closed and selected repeated-deviation review behavior works. |
| **A17–A20** | All authority/expiry/paused/inactive cases, unsupported/stale/incomplete contexts, receipt rollover/restart/connection combinations, all replay cases and concurrent races against final native sources. Migration-absent MCP compatibility remains the explicit R1 limitation. |
| **A21–A22** | Complete old-evidence correction, linked direct-edit divergence, revision retention, copy/repeat/delete, and historical-view workflows. Selected immutable snapshot and discrepancy fixtures do not cover every branch. |
| **A23** | All athlete/server/device timezone and DST boundaries, travel policy, and retrospective-report preservation across deployed clients. A synthetic DST case passed; the full date contract was not revalidated. |
| **A24** | Actual deployed Supabase grants/roles/JWT behavior and ordinary logger behavior/tap count during a real planning-service outage. Saved native ACL/identity checks and local browser outage checks are narrower, and final-source native rerun is outstanding. |
| **A25–A26** | All supported phase/profile/sequence combinations and coherent authored power/performance/mobility quality criteria, plus Dozer's rationale for selecting them. Configurability fixtures are not a physiological or coaching endorsement. |
| **A28, A32** | Exhaustive content/tag/rule combinations and all stale-load/alternative paths on final native/deployed DB and browser routes. F1/F2 regressions give strong focused evidence for the repaired stop/region paths, not universal supported-route certification. |

Also outstanding: authorized deployed-schema/grant discovery and backup; applying/provisioning the final migrations with the real owner/timezone; migration/rollback rollout validation; production-scale performance; real Supabase/PostgREST integration; and mobile/accessibility/visual and fresh-coach evaluation. No live athlete plan was activated, no live health data was audited, and no medical/recovery guarantee is made.

## Handoff

Keep F1–F3 closed with their regression evidence. Preserve R1 as an explicit rollout limitation unless it is separately fixed and exercised. Refresh native evidence against final source hashes, retain honest browser provenance, and complete the broader acceptance/coaching/live checks before a release or full-spec claim. This bounded review alone authorizes none of those claims.

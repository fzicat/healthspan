# Durable training planning — implementation and Smith handoff

> Historical implementation report. The default dashboard/control-panel behavior below is superseded by [SIMPLE-DASHBOARD-DELIVERY.md](SIMPLE-DASHBOARD-DELIVERY.md) and the product-correction preface in `SPEC-training-planning.md`. Do not use this report to restore administrative UI to `/training`; those operations now live at `/training/manage` only for authenticated compatibility. Historical commit/hash/deployment statements below describe their original checkpoints, not current live state.

## Status and scope

Local implementation candidate, exercised with synthetic data. NOT merged, pushed, deployed, or approved as an athlete plan. Full product/coaching acceptance is NOT claimed: the matrix below distinguishes local verification, incomplete scenario coverage and authorized-environment gates. Smith owns independent verification and any later merge-approval request to Frank.

- Worktree: `/home/fzicat/projects/healthspan-training-planning`
- Branch: `feat/training-planning`
- Base: `a80725f0fbfa42ac63ad9f3ef3cfdd9a2b14f4a0`
- Implementation/evidence commit: `34c9c584ffbd35d46d8e573d3f038af909a67f15`
- Original candidate handoff: `4897fee97a3dae2ac050b79a459fc8dab8720cbd`.
- R1–R5 SQL/UI checkpoint: `52268c1e9ca97a344ae17de5d08dedd46d96f75f`.
- Final code/tests/procedure commit: `4431a412f350cacc60c3862ded9895da68b78ed5`.
- This refreshed report/evidence is a subsequent documentation commit. Obtain its exact hash with `git log -1 --format=%H -- docs/training-planning/IMPLEMENTATION-REPORT.md`; the Smith handoff also supplies it explicitly.
- Original planning SPEC SHA-256 remains `4e8d2587e89e130096e012d9440d7177bffa0bbf18a4efa86161dffa25285fc6`. Its earlier drafting-status language is preserved; implementation authorization is recorded separately in `IMPLEMENTATION-PLAN.md` and here.
- Main worktree `/home/fzicat/projects/healthspan` remains on `main` at the base above, with its pre-existing `?? SPEC-training-planning.md` and no tracked changes. No merge, rebase, push, PR, deployment, production SQL/data write, live plan activation, service change, gateway change, or specialist profile modification occurred.

## Delivered behavior

### Application

- `/training` and navigation entry; readable priorities, build/maintain/deprioritize intent, current phase/profile/window, effective progress, review history and proposals.
- Separate cards for appropriate activity today and pending resistance. Stale recommendations are visibly stale, spacing candidates remain conditional, empty activity is unknown, and supportive intent does not silently consume resistance credit.
- Arbitrary full-body/upper-lower/PPL/custom sequences; independent rep/laterality/emphasis dimensions; positive primary-cardio/mobility qualification without fabricated strength slots.
- Readable current/proposed comparison and exact owner activation with explicit queue seed and retain/cancel decision. Owner rejection preserves proposal history. Advanced JSON authoring is deliberate: no sample athlete program is prefilled or activated.
- Dated strength/cardio/mobility/rest intent; explicit supportive-cardio dose bounds; immutable historical context; reports, work/effort/quality clarification and retrospective attribution with explicit same-day distinction.
- Compact Strength/scheduled context, optional exact occurrence association, scoped linked workout management, and preserved last-set prefill/save. No Finish prerequisite for sufficient objective evidence. Planning outage or missing migration does not block ordinary timestamped set saving.
- Mobile wrapping navigation and collapsed technical review provenance. Current-purpose, recovery and review messages remain readable without expanding raw evidence.

### Smith R1–R5 repair

- Report confirmation preserves the unchanged proposal exactly. Deliberately edited proposals carry a separate corrected-source provenance link. Direct reports expose explicit load classification, including mobility. No self-report manufactures sets/cardio rows.
- Owner cardio association offers readable dated records/minutes/type/intensity; only selected exact IDs qualify. Missing association is an explicit qualifier; duplicate association is rejected.
- Same-date cancel/reissue is an explicit `/training` choice and supported MCP field. It transactionally reuses only an empty cancelled dated workout, creates a new occurrence/current snapshot and preserves the original frozen history. Actual work, freeform/uncancelled intent, prior credit and stale/replayed-changed requests cannot be overwritten.
- Recovery uses latest effective day confirmation and report evidence independently of qualification. Contradictory/corrected day reports, reported-date/load corrections, evidence-scoped resolution and retained real sets are covered.

### Database and MCP

- Four additive planning tables, nullable legacy set association, immutable revisions/session snapshots/events, explicit singleton owner/timezone provisioning, restricted function owner, nine transactional RPCs, RLS and narrow effective privileges.
- Typed qualification/reconciliation, one occurrence credit, source-specific reports versus logged volume, explicit continuation and duplicate checks, corrections and unresolved queue handling, review-due bookkeeping separate from genuine expiry.
- Actual-work spacing across revisions, partial/unplanned work and library relabeling; validated exact-ID load classifications from activated history; unresolved regional load blocks only dependent prescriptions rather than inventing classification.
- Atomic state/evidence checks and actor/request-scoped receipts; identical committed replay, changed-payload rejection, trigger invalidation, fixed search paths, real owner checks and service-role denial of owner-only actions.
- Connection/athlete/target/occurrence/version-scoped expiring MCP receipts. Materialization and all four supported legacy prescription mutations are guarded, including explicit freeform. Current content controls load/stop checks, not workout labels. Receipts prove retrieval/freshness only, NOT reasoning.
- Complete planning context/history, independent no-workout set reads, deleted-library evidence retention in planning/MCP, explicit pagination completeness and athlete-local bounds.
- Repo `mcp-server/README.md` and `mcp-server/COACH_PLAYBOOK.md` explain the fresh-session workflow, genuine owner authority, due-review handling, current versus queued activity, prior-phase rationale, and exact write readback. Dozer's configuration/skills/memories were not changed.

## SQL deliverable and manual order

Read `docs/training-planning/SQL-RUNBOOK.md` before any separately authorized application. It contains executable preflight/postcheck SELECTs, backup/restore recommendation, privilege inspection, once-only/unknown-commit handling, compatibility requirements and non-destructive disable/restore SQL. Do NOT rerun `supabase/schema.sql` on an existing database.

1. `supabase/migrations/202609220001_training_planning.sql` — checked prerequisites, restricted role, four tables, nullable FK, immutability/evidence/provenance helpers and intermediate privilege sealing.
2. `supabase/migrations/202609220002_training_engine.sql` — bounded validation, qualification, queue, review, classification and activity-specific spacing.
3. `supabase/migrations/202609220003_training_rpcs.sql` — versioned reads/decisions/activation/materialization/legacy mutation RPCs.
4. `supabase/migrations/202609220004_training_grants.sql` — restricted ownership, exact grants and final public surface.
5. After all verification, separately fill and run `supabase/setup-training-owner.sql`. Untouched/invalid input aborts. It inserts only an inactive singleton, no proposal/activation/history links. Frank must choose the real Auth UUID and confirm the IANA zone; none is guessed here.

Each migration has its own transaction and is applied once in order. History and old NULL associations are retained. RPC disable retains logs/history/triggers, not a destructive rollback. App `NEXT_PUBLIC_ATHLETE_TIMEZONE` at build time and MCP `HSPAN_ATHLETE_TIMEZONE` must match provisioning (defaults America/Montreal). A browser/SQL zone mismatch refuses planning rather than silently using a device zone; ordinary set saving remains independent.

`evidence/native-postgres.json` records the hashes of the exact files applied. Native PostgreSQL 18.4 executed the full bootstrap including pg_trgm, then all four migrations as a restricted non-superuser schema administrator. PGlite 0.5.8/PostgreSQL 18.3 executed all migration SQL; its bootstrap omits only the unrelated trigram tail. Neither is validation of Frank's deployed schema, Supabase SQL Editor role, Auth or PostgREST.

## Reproducible verification and actual results

Run from this worktree. `tests/README.md` gives dependency/build/browser isolation instructions; `tests/support/NATIVE-POSTGRES.md` explains native prerequisites and cleanup. No runner falls back to real environment credentials. `env -i` does not hide dotenv files on disk: the isolated build checkout contained none. The built app used only `http://127.0.0.1:54399` and a synthetic public test key; generated test JWT signing material stayed test-only and in memory.

| Command / evidence key | Exact test files | Final observed result |
| --- | --- | --- |
| `node_modules/.bin/tsx --test tests/dates.test.ts` (D) | `tests/dates.test.ts` | 4 tests passed; invalid dates/zones, Montreal 23/25-hour DST, explicit Tokyo, skipped date |
| `node_modules/.bin/tsx --test tests/review-regressions.spec.ts` (F) | `tests/review-regressions.spec.ts` | 11 real-SQL repair cases passed; includes full-sequence out-of-order advance and reached-revisit read synchronization |
| `node supabase/tests/training-planning.mjs` (S) | `supabase/tests/training-planning.mjs`, `.sql` | 49 PostgreSQL assertions passed |
| `node supabase/tests/extended-training.mjs` (E) | `supabase/tests/extended-training.mjs` | 28 cases passed, 0 failed |
| `node supabase/tests/automatic-training.mjs` (A) | `supabase/tests/automatic-training.mjs` | 21 cases passed, 0 failed |
| `node supabase/tests/runbook.mjs` (R) | `supabase/tests/runbook.mjs`; actual runbook SQL fences and setup template | 62 checks passed; 6 SQL blocks, 35 SELECT result sets |
| `npm --prefix mcp-server test` (P) | `mcp-server/src/tools/planning-context.test.ts`, `training-planning.test.ts`, `protocol-fixture.ts` | 18 passed; receipt unit + public stdio contract tests; response fixture is NOT SQL evidence |
| `npm run test:training:protocol` (I) | `tests/mcp-database.spec.ts`, `tests/mcp-safety.spec.ts` | 43 passed: 9 database-protocol cases + 34 safety checks including nested route tests; real SQL behind local adapter |
| `npm run test:training:native` (N) | `tests/native-training.mts`, `tests/support/native-training-fixture.mts` | 18 passed, 0 failed; includes same/distinct-key cancelled-reissue races; distinct native backends/lock barriers, real login roles/ACLs, real 40P01 rollback/retry |
| `npm run test:training` | D + F + S + E + A + R + P + I + N above | Exit 0; all final outputs in `evidence/final-tests.log` |
| `npm run lint` | Full app/MCP/test lint scope | Exit 0, no warnings/errors (`evidence/lint.log`) |
| `npm --prefix mcp-server run typecheck` | Separate MCP TS project | Exit 0 (`evidence/mcp-typecheck.log`) |
| `npm exec tsc -- --noEmit` | App/test TypeScript | Exit 0 (`evidence/app-typecheck.log`; empty stdout is expected) |
| Synthetic-environment `npm run build` | Next.js 16.1.4 production compilation | Exit 0, `/training` included (`evidence/build.log`); existing middleware-to-proxy deprecation warning remains |
| Isolated `npm run test:training:browser` (B) | `tests/training-planning.spec.ts`, `tests/review-browser.ts`, `tests/support/local-training-server.ts` | 24 checks passed; no page errors, no unexpected external origins; exit 0 |
| Baseline lint/build from archived base in `.training-test/baseline` | Base a80725f, separate output inside worktree | Both exit 0 (`evidence/baseline-lint.log`, `baseline-build.log`) |
| `git diff --check main...HEAD` | Entire committed feature branch versus main | Exit 0 after evidence normalization (verified again after report commit); not merely an empty worktree diff |

Counts have different units; no combined “total tests” claim is made. Full local command logs and selected screenshots are committed under `docs/training-planning/evidence/`. The larger rerunnable fixture/browser output remains in ignored `.training-test/evidence/`.

Native cleanup verified: listener closed, all 17 tracked native PIDs exited, disposable cluster/data removed. Browser cleanup explicitly verified app and adapter listeners refuse connections (`browser-results.json`: `cleanupVerified: true`); MCP fixtures close their spawned clients/listeners in `finally`. No running live app/MCP instance was replaced. Initial helper runs briefly wrote diagnostic logs under `/tmp`; project artifacts/evidence were collected into this worktree. No credentials or production data were copied from main, and no source changes were made there.

## Browser evidence

All captures are synthetic LOCAL data, not athlete telemetry. In `docs/training-planning/evidence/`:

- `03-activated.png`: authenticated synthetic owner activation/current direction.
- `04-next-day-recovery.png`: previous-day actual full-body report, next-day rest intent, pending resistance retained.
- `04-supportive-cardio.png`: bounded cardio intent with no fabricated actual cardio log.
- `05-history.png`: immutable intent/decision history.
- `07-logger-saved.png`: unchanged original logger save and last-set prefill regression.
- `09-mobile-training.png`: mobile page, all four tabs wrapped, current activity separate from resistance, technical review provenance collapsed.
- `09-outage-logger.png`, `10-unmigrated-logger.png`: actual set save during synthetic planning outage / missing migration.
- `11-exact-report.png`, `11-corrected-report.png`, `12-mobility-report.png`: exact proposal, deliberate corrected proposal and direct mobility report confirmation.
- `13-cardio-association-negative.png`: human-readable exact cardio choice and duplicate rejection.
- `15-unlogged-strength-recovery.png`, `12-corrected-no-work.png`: actual-load corrections through owner UI and explicit queue correction.
- `16-reissue-history.png`: cancellation/reissue with both snapshots retained.
- `14-distinct-clarification.png`, `17-copy-repeat-safety.png`, `17-reached-review.png`: clarification/continuation/distinctness, copy/repeat guards, reached concern.
- `browser-results.json`: exact 24 names/statuses, cleanup verified, empty page-error/external-origin lists.

The harness labels captures as not visually inspected because it only captures/asserts DOM. A separate visual inspection of the final mobile capture confirmed wrapped tabs, collapsed provenance and distinct current/pending cards with no significant clipping. The final cardio association/duplicate-error capture was also visually inspected: readable date/minutes/type/intensity and explicit `INVALID_CARDIO_ASSOCIATION` were visible. These bounded inspections are not a complete accessibility or athlete-usability audit.

## A1–A32 acceptance matrix

Legend: LOCAL = stated mechanics exercised locally; PARTIAL = implementation exists but the complete criterion has remaining scenario/coaching coverage; BLOCKED = actual named environment requires separate authorization. Every evidence key maps to exact files/commands/results above. “LOCAL” is never deployed/coaching acceptance.

| ID | Status | Exact evidence and remaining limitation |
| --- | --- | --- |
| A1 | PARTIAL / coaching BLOCKED | I `fresh public discovery and real SQL schema...` uses a new stdio client, proposal/owner activation/materialization/readback; P enforces context. Actual fresh Dozer with no chat and its explanation quality not run. |
| A2 | LOCAL | S `planned/opened session is not work`; E below-minimum `finished` holds; B linked edits leave zero exposure. Planned lists stay labeled intent. |
| A3 | LOCAL | A `automatic required work qualifies partial and advances once without accessories or RIR`; E optional accessories omitted. No owner clarification event where the authored objective predicate suffices. |
| A4 | LOCAL | E above-minimum partial vs below-minimum finished; A objective predicates. Work preserved independently of label and queue. |
| A5 | LOCAL | E warmup-only/null effort; A bounded work/quality predicates; B `A5-A9-browser-effort-quality-clarification-and-distinct-session` submits session-level work IDs, effort and quality only when missing. No mandatory per-set qualifier. |
| A6 | LOCAL | E unlinked/deleted-library sets, overlapping-anchor rejection; P no-workout/DST/null reads; I regional unknowns remain unresolved. No heuristic slot association. |
| A7 | LOCAL | S rest has no workout/credit; B next-day recovery and supportive cardio preserve pending slot; A primary modality tested separately. |
| A8 | LOCAL | S owner confirmation/mixed later logs/no duplicate; E discrepancy; A scoped resolution; F R2/R5 corrections; B unchanged cardio proposal, deliberate corrected proposal, direct mobility load confirmation and correction-to-none. Payloads/readback asserted; no fabricated logs. |
| A9 | LOCAL | E explicit continuation/distinct occurrence negatives; B `A5/A9` explicitly selects two fragments across dates, declares continuation and confirms work/effort/quality, then explicitly attributes a distinct same-day occurrence. One credit for the fragments, distinct IDs, no date cap. |
| A10 | LOCAL | E out-of-order hold; F `A10 approved advance traverses the authored out-of-order full sequence without catch-up` executes beta→gamma→alpha against approved alpha/beta/gamma, verifies successive gamma/alpha/beta pointers, three exposures, no implicit catch-up. |
| A11 | LOCAL | S calendar due/no expiry/continuation; B logger unaffected by due review and planning failure. Due alone does not invalidate authority. |
| A12 | LOCAL | E exposure trigger survives later correction; S/A same occurrence one credit and report-to-log behavior. Trigger bookkeeping persists rather than silently erasing history. |
| A13 | PARTIAL | S continuation retains due, genuine review resolves named reasons; E reached bound rejects renewal-free prescribing. Actual Dozer surfacing/rationale not evaluated. |
| A14 | LOCAL mechanics | E immutable substitutions/repeated concern; S stop independent of review; I four cardio-stop routes; F future-not-due then reached-revisit synchronization idempotent; B `A14` reached concern/history with original anchor retained. Reached-date fixture models elapsed time without changing system clock; no multi-day live clock/coaching validation claimed. |
| A15 | PARTIAL | Calendar read/review/history and explicit queue rules implemented/tested in S/E. Full absence-and-return coaching/entry reassessment not exercised. No catch-up scheduler exists. |
| A16 | PARTIAL / coaching BLOCKED | Maintenance policy and hold/continue displayed in B; A arbitrary structures and authored predicates. No progression/novelty mandate or machine-load transfer added. Actual coaching appropriateness unverified. |
| A17 | LOCAL | N real role owner/other/service negative checks; S pause/out-of-scope; E explicit authorization expiry; B exact activation. No quote/actor flag grants ownership. |
| A18 | LOCAL with compatibility limitation | P receipt TTL, rollover, connection/athlete/occurrence/version checks and missing/incomplete/unsupported refusal. I confirms missing migrations fail closed for updated MCP legacy planning; this is NOT pre-migration MCP compatibility. Browser logging remains available. |
| A19 | LOCAL, installed-schema boundary | P/I all four active/paused explicit-freeform routes, stale checks and exact replay. Inactive/archived semantics covered in contract tests; raw service SQL and old MCP remain outside guarantees. |
| A20 | LOCAL | N real simultaneous activate/materialize/reconcile and evidence writes, same/distinct keys, lock inversion; P incomplete pages and E null metrics. Local adapter serialization alone is not the concurrency evidence. |
| A21 | LOCAL | S prior-credit edit/unresolved queue/correction; A scoped report resolution invalidation; F R5 effective report/date/load corrections, use_logs/use_report and real-set retention; B correction-to-none plus explicit queue correction; E linked accepted-fingerprint regression. Exact historical logs remain immutable in planning history; old clients may still diverge. |
| A22 | LOCAL | S FK deletion/history; F R4 same-date and changed-phase reissue preserves snapshots/queue; I public reissue/history/replay; N overlapping same/distinct-key reissue; B cancelled history/reissue, copy-to-freeform and repeat-to-freeform positive paths, linked-target copy replacement/repeat negatives, no copied authority/credit. |
| A23 | LOCAL with rollout prerequisite | D invalid literal dates, DST, non-default zone and skipped date; E SQL late-night DST; P local half-open reads; retrospective origin preserved. App/MCP build/config zones must match SQL. Non-default-zone full browser build not exercised. |
| A24 | LOCAL / live gateway BLOCKED | N actual SQL logins/effective grants and actor-spoof denial; R intermediate/final seals; B missing/forged session, middleware redirect, original logger, outage/unmigrated saves. Real Supabase Auth/PostgREST not exercised. |
| A25 | LOCAL | A full-body A/B, upper/lower, PPL and five-slot custom sequence progression; primary modality no resistance slot. I exact approved IDs/equivalents retain actual load across phase/library changes. |
| A26 | PARTIAL / coaching BLOCKED | E independent power/performance/mobility/quality and invalid dimension checks; A metric/quality/primary modality rules. Coherent authored combination/rationale still a coach judgment, not a validator guarantee. |
| A27 | LOCAL | S Tuesday blocked/rest and E completed intervening-date evidence; B previous-day actual full-body → next-day rest with queue held; F/B R1 reported resistance restarts spacing, changed day reports never override raw sets. Relative synthetic dates test Monday/Tuesday/Wednesday semantics without pretending today has those weekday names. |
| A28 | LOCAL | A unlinked category relabeling; I F2 actual nonqualifying work/freeform all four routes, exact-ID phase continuity and unresolved classification; F R1 unknown regional report across phase switch and R5 nonqualifying effective actual work. Raw set logging not blocked. |
| A29 | LOCAL | E empty/intervening evidence, unperformed reservations and indeterminate earliest date; D/E/P timezone bounds. Candidate remains conditional and unknown is not proven rest. |
| A30 | LOCAL | A primary cardio/mobility positive completion; B bounded supportive cardio plus direct primary mobility qualification and actual primary-cardio owner association, no fake logs; I cardio stop/loaded relabeling. No fabricated strength slot. |
| A31 | PARTIAL / coaching BLOCKED | Full retained revisions/outcomes/source IDs available through context/history; B history and I phase transition readbacks. Several-phase fresh-Dozer purposeful proposal/continuation narrative not exercised. |
| A32 | LOCAL | N stale actual-load insertion/races; P/I resulting-content legacy checks, denied transaction readback and eligible alternatives. B stale recommendation explicitly labeled, not offered as current advice. |

## R1–R5 correction mapping

No open R1–R5 blocker is known after these local regressions. This is a repaired engineering candidate, not deployed/coaching certification.

| Finding | Changed implementation | Reproduction and verification |
| --- | --- | --- |
| R1 | `002_training_engine.sql`: `training_load_dates`, `training_eligibility` include latest effective `confirm_day(false)` as resistance/systemic, with regional uncertainty. | F `R1` changed/contradictory days, raw-set retention and phase change; I public-context fresh/stale checks; B `R1-browser-complete-day-strength-recovery`. No qualifying-detail prerequisite. |
| R2 | `TrainingEvidence.tsx` `ReportForm`; `003_training_rpcs.sql` `confirm_report`: exact unchanged payload vs explicit `corrected_proposal_event_id`, same-occurrence proposal validation, explicit direct load tags. | F `R2` unchanged/invalid-exact/corrected/foreign reference; B exact cardio proposal, edited cardio proposal and direct mobility objective all qualify through owner UI. |
| R3 | `training_evaluate`: missing/insufficient unassociated cardio becomes `cardio_association`; `TrainingEvidence.tsx` exposes selectable dated records. | F `R3` pending association, partial association then qualifying completion, duplicate rejection; B actual 25-minute logged cardio selected, second occurrence duplicate refused. No inferred same-date association or self-report replacement. |
| R4 | `materialize_training_session`: optional `replace_cancelled_session_id`, current-authority/spacing/version validation, empty-workout-only transactional reuse/new occurrence; `/training`, logger context resolution, MCP schema. | F same-date replacement/replay/changed payload/phase change, uncancelled/freeform/raw-work conflicts; I real public MCP discovery/cancel/reissue/readback; N two overlapping reissue race cases; B cancellation→explicit reissue→history and current linked header. Original snapshot and credit remain independent. |
| R5 | `training_evaluate.effective_report` supplies shared latest report/resolution evidence to `training_load_dates`; raw sets remain independent. | F three R5 cases: correction-to-none, use_logs/use_report/fingerprint invalidation with retained real sets, bounded declared-continuation date/load correction; I context after report correction; B empty-work correction and explicit dependent queue repair. No filtering actual work by qualification. |

Migration filenames in this table are abbreviated: the complete unshipped paths/order are above. Their definitions were updated coherently; no live migration or production fixup was applied. Public RPC signatures stay `(p_input jsonb)`; the added fields and explicit operator procedure are in `SQL-RUNBOOK.md` under “Unshipped Smith-review correction definitions” and `supabase/TRAINING-CONTRACT.md`.

The additional A10 advance and A14 reached-revisit tests are in F; related browser paths are in `tests/review-browser.ts`, invoked by B. Native SQL grants/concurrency and public MCP calls are distinct from the sequential HTTP adapter. `review-red.log` retains the initial failing repair reproductions against the candidate; it is historical failure evidence, not a final result. `final-tests.log`, native JSON/log, browser JSON/screenshots, and build/type/lint logs are refreshed final-source evidence.

Human-readable evidence logs were normalized to LF, trailing whitespace removed and excess blank EOF lines removed. No substantive log lines were discarded or success output invented. Historical baseline logs remain labeled baseline. The entire branch comparison is checked, not just unstaged changes.

## Review findings, fixes and remaining work

Independent bounded spec review `REVIEW-SPEC-SQL.md` found cardio-stop bypass, missing regional classification and cross-slot duplicate ambiguity. These were fixed and regressed through real SQL/public MCP. The subsequent `REVIEW-FINAL.md` accepts those focused fixes before security/integration review; it does not claim exhaustive SPEC approval. Other integration fixes include invalid linked UI date payloads, missing cardio dose fields, SQL alias ambiguity, repeated-deviation review surfacing and same-clock-tick event ordering. The initially intermittent PGlite qualification failures were traced to timestamp ties ordered by random UUID; monotonic serialized event timestamps preserve append order. Later independent repeated and final executions passed. Earlier native failures were test-accounting errors after automatic reconciliation; actual concurrency/deadlock checks were retained and final native execution passed.

Before treating this as fully accepted or releasing it:

1. Smith independently reviews the repaired branch, R1–R5 mapping below, and remaining PARTIAL/coaching matrix items. The specifically requested local report/clarification/continuation/distinct-session/copy-repeat/cancellation/advance/revisit regressions are now executed, not deferred behind deployment gates. No all-32 pass claim is made.
2. Authorize an isolated actual Supabase rehearsal for deployed-version/schema/grants/SQL Editor compatibility, GoTrue-issued owner/other-user tokens, real PostgREST discovery/cache behavior and signed-client paths. Do not infer these from the loopback adapter or native claim GUCs.
3. Authorize a fresh-Dozer synthetic sandbox/config step, with no real athlete activation, to test no-chat retrieval, appropriate recovery choice, explicit review handling, prior-phase purposeful rationale, and exact readback. No Dozer profile or running MCP/gateway was changed to manufacture this evidence.
4. Resolve rollout compatibility explicitly: the updated MCP deliberately refuses missing/unavailable planning RPCs rather than silently falling back. Its green missing-migration characterization is not a compatibility success. Ordinary browser logging is verified preserved. Retire old prescription-capable MCP instances before any later live activation; raw service credentials/legacy broad RLS remain a documented single-user boundary.
5. Review performance on authorized representative synthetic history sizes. Context reads currently retrieve/reconcile all retained evidence and serialize on one singleton for correctness; they are not benchmarked against long production history. This is a scalability risk, not a claimed optimized analytics engine.
6. Keep configuration consistent: explicitly provision the owner/zone, match app-build/MCP zone, keep inactive until owner review/activation. No authenticated multi-athlete isolation is claimed for legacy tables.

No production credentials or live database data were used in tests. No production DB changes, merge, push, PR, deployment or actual athlete training-plan activation occurred. All exercise/dose examples in tests and screenshots are synthetic engineering fixtures, not coaching prescriptions.

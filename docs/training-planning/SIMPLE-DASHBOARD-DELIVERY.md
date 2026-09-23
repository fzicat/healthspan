# Simple training dashboard — delivery to Smith

## Scope and status

Implemented and verified locally in `/home/fzicat/projects/healthspan-training-planning`, branch `feat/training-planning`, starting at `8b5a34392822a3152bf8f99c4ff4768a8d9972ff`. The delivery commit contains this report; obtain its full SHA with `git log -1 --format=%H -- docs/training-planning/SIMPLE-DASHBOARD-DELIVERY.md`. The final handoff also supplies the SHA.

This is the product correction requested by Frank, not another architecture/planning project. No push, merge, deployment, Vercel invocation, production credential read, live service operation, live SQL, bot/profile/skill/config edit, or new dependency was performed. Original `SPEC.md`, all production SQL/migrations/setup files, authentication/MCP implementation, and package/config files are unchanged. Local tests execute the existing SQL in disposable synthetic databases only. No new Supabase project or repetition of already-applied runbook steps is required.

## Changed behavior

`/training` now defaults to exactly three sections, without tabs or hidden administration:

- **What we did:** ordinary non-deleted strength sets and cardio records, whether plan-linked or not. Reads the independent logger tables rather than depending on planning availability. Uses the configured athlete timezone for set timestamps and treats cardio dates as date-only values. The last 14 calendar days are queried, capped at 200 sets and 100 cardio records, with up to five recent active dates displayed. Exact response counts detect incomplete/truncated reads; unknown counts and partial failures are labelled as a partial view, never all-time totals or zero activity. Future timestamps/dates are excluded. Exercise names and cardio minutes are shown; scheduled workouts and proposals are never counted as performed work. The previous activated phase's purpose and latest recorded review reason are shown when available. This follows the current activated revision's parent link, which SQL validates against the outgoing active revision, rather than mistaking arbitrary proposals in the revision list for past phases. No additional paginated history fetch is needed.
- **Where we are:** current phase purpose, a few recorded emphases, structure, and the server's counted-session progress only when evidence/history completeness and resolved progress support it. No percentage, invented goal, or inferred completion. Paused, inactive/expired, not-yet-started, and current phases have distinct copy. No saved active direction gets a friendly line about establishing a plan with Dozer.
- **Where we're going:** today's saved recommendation only when current and not stale; the next strength session is explicitly a sequence position, not today's clearance. A short recovery/timing note appears when strength is not eligible. Non-strength primary sequence entries and the nearest future non-cancelled prescribed session are supported. The current approved long-term intent is shown; proposals are explicitly “Proposed, not active.” The existing model has one active phase and proposals, not an agreed next-phase chain, so it truthfully says “No next phase is saved” rather than promote a proposal or invent a roadmap.

Planning and activity have independent loading/error states. Refresh clears stale display state and retries both reads. A planning outage, missing migration, or denied planning read does not hide successfully loaded ordinary logs. No owner provisioning means the existing RPC denies owner lookup; the dashboard shows planning unavailable rather than guessing that authorization exists. Ordinary logs still render.

The default page has no JSON editor, proposal authoring, lifecycle/review/qualification/correction forms, receipts, IDs, version counters, raw evidence, eligibility matrix, embedded chat, or message-Dozer integration. Links go to existing logger/history pages. Styling reuses Healthspan cards, colors, spacing and touch-sized links/buttons. Navigation now says “Training.” The small logger context banner points to the dashboard when no link is verified and routes exact session-record links to the compatibility page. The logger itself was not redesigned.

## Transitional authenticated compatibility — important limitation

`/training/manage` preserves the existing authenticated proposal/activation, lifecycle, review, evidence clarification, report correction, intent/reissue, and immutable-history tools. Settings has an unobtrusive “Training confirmations (advanced)” link; the dashboard has no control-center link. Some redundant display-only console panels were deleted. The retained forms, mutation functions, owner checks, immutable-history rules, recovery/qualification engine, request verification, and logging guards are unchanged.

Decisions and discussion happen with Dozer outside Healthspan, but **end-to-end external Dozer activation has not been implemented**. Existing owner-only actions still require Frank's authenticated confirmation. A claimed conversation is not authorization, and service-role MCP cannot activate the plan or confirm owner-only evidence. The compatibility route exists specifically so those operations are not stranded; it is not a new coaching UI. On a session-specific link, the existing History tab uses the supplied session filter.

## Verification environment and exact commands

All commands below ran from the worktree root. Locked app/MCP dependencies and project-local Chromium/runtime libraries already existed; no install or live connection was needed. Root and `src` were checked for `.env*` paths without reading their contents; both lists were empty. `env -i` is used below in addition to that disk check, not as a substitute for it. The browser harness starts Next from an allowlisted runtime copy containing build assets and dependencies, not repository dotenv files. It serves only `127.0.0.1:3109` and a synthetic PGlite/HTTP adapter at `127.0.0.1:54399`. Browser external origins are blocked. Native PostgreSQL uses a disposable loopback server, synthetic identities and cleanup checks.

Build (exit 0):

```sh
env -i PATH="$PATH" HOME="$PWD/.training-test/home" \
  NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-local-anon npm run build
```

Static checks (each exit 0):

```sh
env -i PATH="$PATH" HOME="$PWD/.training-test/home" npm run lint
env -i PATH="$PATH" HOME="$PWD/.training-test/home" node_modules/.bin/tsc --noEmit
env -i PATH="$PATH" HOME="$PWD/.training-test/home" npm --prefix mcp-server run typecheck
```

Regression command (exit 0):

```sh
env -i PATH="$PATH" HOME="$PWD/.training-test/home" npm run test:training
```

Actual runner outcomes are separate units, not a fabricated combined test total:

| Runner | Actual result |
| --- | --- |
| Calendar/date unit tests | 4 passed, 0 failed |
| R1–R5/A10/A14 SQL regression cases | 11 passed, 0 failed |
| Core planning SQL | 49 PostgreSQL assertions passed |
| Extended planning SQL | 28 passed, 0 failed |
| Automatic planning SQL | 21 passed, 0 failed |
| SQL runbook fixture | 62 checks passed; 6 SQL blocks; 35 SELECT result sets |
| MCP contract/receipt tests | 18 passed, 0 failed |
| Real-SQL public MCP protocol/safety cases | 43 passed, 0 failed |
| Native PostgreSQL concurrency/security cases | 18 passed, 0 failed; cleanup true |

Browser command (exit 0):

```sh
env -i PATH="$PATH" HOME="$PWD/.training-test/evidence/browser" \
  PLAYWRIGHT_BROWSERS_PATH="$PWD/.training-test/browsers" \
  LD_LIBRARY_PATH="$PWD/.training-test/evidence/browser/deps/usr/lib" \
  FONTCONFIG_FILE="$PWD/.training-test/evidence/browser/fonts.conf" \
  node_modules/.bin/tsx tests/training-planning.spec.ts
```

Result: **28 named browser checks passed, 0 failed; no page exceptions; no attempted external origins; listener cleanup verified.** This includes the existing authenticated administration/logging regressions plus actual rendered dashboard checks for active/inactive/paused/empty states, ordinary logs, previous phase vs proposals, recovery vs sequence, upcoming intent, missing next phase, stale recommendation, independent plan/activity loading, planning outage, partial logger failure, refresh, and bounded incomplete activity. The missing-migration test saves an ordinary set, reads it back from SQL, then sees it on the unavailable-plan dashboard. Both dashboard and compatibility route reject anonymous navigation.

Desktop viewport: 1200×900. Mobile viewport: 390×844. Dashboard scenarios run in an Asia/Tokyo browser while athlete records remain America/Montreal, including UTC-midnight grouping. DOM assertions verify the three headings, absence of administrative/technical controls and identifiers, and no horizontal overflow. Active desktop/mobile screenshots were also visually inspected; no clipping was identified. This is not an accessibility certification or Frank's final product sign-off.

The build emits the existing Next.js middleware-to-proxy deprecation warning; compilation, route generation and TypeScript succeed. No unrelated middleware migration was attempted.

## Evidence paths

Committed evidence directory (absolute):

`/home/fzicat/projects/healthspan-training-planning/docs/training-planning/evidence/simple-dashboard/`

Twelve actual screenshots:

- `dashboard-active-desktop.png`
- `dashboard-active-mobile.png`
- `dashboard-inactive-desktop.png`
- `dashboard-inactive-mobile.png`
- `dashboard-paused-mobile.png`
- `dashboard-empty.png`
- `dashboard-plan-loading.png`
- `dashboard-activity-loading.png`
- `dashboard-plan-outage.png`
- `dashboard-partial-activity.png`
- `dashboard-bounded-activity.png`
- `dashboard-without-migration.png`

Machine-readable evidence: `browser-results.json`, `native-postgres.json`. Execution logs: `build.log`, `browser.log`, `regressions.log`, `lint.log`, `app-typecheck.log`, `mcp-typecheck.log`, `native-postgres.log`. Empty app-typecheck output means the command exited successfully without diagnostics. Human-readable log trailing whitespace is normalized for git; outcomes and counts are unchanged.

Raw local iterations remain at `.training-test/evidence/simple-dashboard/`; the final successful sources are `accepted-build.log`, `accepted-browser.log`, `verified-regressions.log`, `accepted-lint.log`, `accepted-app-typecheck.log`, `accepted-mcp-typecheck.log`. Runtime screenshots, request traces and test JSON remain at `.training-test/evidence/browser/`; native evidence remains at `.training-test/evidence/native-postgres.*`.

Earlier failures are not presented as passes: the initial browser red check failed against the old console; a fixture used the wrong cardio intensity column; interrupted runs lost children; the HTTP adapter lacked the exercised cardio FK join and initially serialized SQL dates as JS timestamps; a delayed route cleanup raced its handler; an attempted second timezone override was rejected. Fixes were confined to the synthetic harness. Direct fixture SQL retains its native date types, while HTTP reads now use PostgREST-shaped date strings. The missing-provisioning assertion was corrected to honor the existing SQL denial. A leftover Next test child from a crashed iteration was verified by its exact worktree runtime directory and terminated before rerunning. Final browser/native cleanup checks passed, and no test listeners remain.

## Review boundary

These are **synthetic local SQL/browser/MCP results**, not Frank's data and not real Supabase/GoTrue/PostgREST deployment coverage. Successful planning responses are produced by real disposable SQL; only delay/outage transport scenarios are intercepted. The test-only HTTP adapter remains deliberately narrow. No live migration status or live authorization flow was inspected.

Changed product files: dashboard, bounded recent-log adapter, relocated compatibility page, Settings/navigation/banner links. Changed verification files: dashboard scenarios, browser runner, existing administration journey routes, narrow HTTP fixture adapter. Documentation: README, feature SPEC correction, historical-report/plan supersession notices, tests README, this delivery and evidence bundle. Smith owns independent review and the decision whether to push this branch for the existing preview. Stop here: no push, merge or deploy is included.

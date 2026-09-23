# Synthetic local training verification

Install locked dependencies only inside this isolated checkout:

```sh
npm ci --ignore-scripts
npm --prefix mcp-server ci --ignore-scripts
npm run test:training
npm run lint
npm --prefix mcp-server run typecheck
```

`test:training` runs calendar unit tests, the Smith R1–R5/A10/A14 regression suite, four disposable SQL/runbook suites, MCP receipt/contract tests, real-SQL public MCP suites and native PostgreSQL concurrency/security tests. Results mix assertions and test cases: report each runner separately, not a misleading combined test total. No production credentials or `.env` files are consumed by these runners. See `support/NATIVE-POSTGRES.md` for the native server's loopback/cleanup isolation.

For browser verification, first use a clean isolated checkout containing no real `.env*` files. `env -i` alone does NOT prevent Next from reading dotenv files from disk. The build below intentionally points only at the synthetic loopback adapter:

```sh
env -i PATH="$PATH" HOME="$PWD/.training-test/home" \
  NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-local-anon npm run build
PLAYWRIGHT_BROWSERS_PATH="$PWD/.training-test/browsers" npm exec playwright install chromium
```

Never use `playwright install-deps` here: it modifies system packages. The fixture needs browser runtime libraries already available, or separately reviewed project-local extracts as described below. No global/system install or live service change is authorized by this test workflow.

## Synthetic local browser integration

`training-planning.spec.ts` is an executable Playwright assertion harness (run with `tsx`, not the Playwright test runner). It starts a disposable in-memory PGlite database, executes `supabase/schema.sql` excluding optional trigram search and **every installed migration**, then exposes a narrow test-only GoTrue/PostgREST-shaped adapter on `127.0.0.1:54399`. Real SQL runs under `authenticated`/`service_role` with actual JWT claims; no planning responses are mocked.

The Next production build must already use `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-local-anon`. The harness copies only `.next`, a synthetic package manifest, and symlinks to public assets/dependencies to `.training-test/evidence/browser/runtime`, so Next cannot discover repository dotenv files. It launches on `127.0.0.1:3109`, with an allowlisted environment, and closes children/listeners in `finally`. Do not run against a production build configured for a real service.

Run from the repository root:

```sh
env -i PATH="$PATH" HOME="$PWD/.training-test/evidence/browser" \
  PLAYWRIGHT_BROWSERS_PATH="$PWD/.training-test/browsers" \
  LD_LIBRARY_PATH="$PWD/.training-test/evidence/browser/deps/usr/lib" \
  FONTCONFIG_FILE="$PWD/.training-test/evidence/browser/fonts.conf" \
  node_modules/.bin/tsx tests/training-planning.spec.ts
```

`LD_LIBRARY_PATH`/`FONTCONFIG_FILE` are needed on this minimal Arch environment. Missing browser libraries were downloaded as Arch packages and extracted **locally**, without package installation, to the evidence directory: nspr, nss, at-spi2-core, libxcomposite, libxdamage, libxrandr, libxkbcommon, libxi, libxtst, plus ttf-dejavu. Systems with those browser dependencies/fonts installed can omit these two variables. Fontconfig caches also stay in the evidence directory.

Evidence: `results.json`, `requests.json` (no tokens), `app.log`, exact context/history JSON, failure DOM text, and PNG screenshots under `.training-test/evidence/browser`. Screenshots are captures, not a claim of visual review. Failed prerequisites remain failed; logger checks still execute independently. Scenario dates derive from actual SQL athlete-local `today`: the recovery scenario attributes a qualifying occurrence to yesterday and tests today's supportive rest vs the retained pending resistance slot.

The browser harness also runs `review-browser.ts` using a fresh in-memory store
per correction scenario: exact/corrected cardio proposals, explicit mobility load,
report correction and queue repair, logged-cardio association and duplicate refusal,
work/effort/quality/continuation and distinct sessions, day testimony, cancel/reissue,
reached revisit, and copy/repeat safety. `tests/review-regressions.spec.ts` supplies
synthetic setup helpers, not fabricated responses. Native reissue races use real
separate backends and observed lock barriers. Committed human-readable logs have
trailing line whitespace normalized; substantive output/counts are unchanged.

Scope: synthetic LOCAL integration only, **not Supabase/GoTrue/PostgREST validation**. HMAC session keys and synthetic session state are generated in memory and never written. The middleware is unmodified and must redirect an absent session. REST supports only the exercised tables/operators; unsupported requests fail rather than fabricate data. Exports in `support/local-training-server.ts` can support a later local MCP protocol harness.

## Simple dashboard correction

The same browser command now also runs `simple-dashboard.spec.ts`. It asserts the rendered three-section `/training` product, not the old tabs: active/inactive/paused/empty states, real unlinked sets and cardio, previous activated phase vs proposals, counted phase progress, rest today vs the next strength session, future dated intent vs completed activity, missing next phase, stale recommendation, planning/partial-logger errors, retry, and separate plan/activity loading states. It also checks absence of administrative controls, technical copy and identifiers, and horizontal overflow at desktop/mobile widths. Dashboard scenarios use an Asia/Tokyo browser against America/Montreal athlete dates, including an actual UTC-midnight set boundary. A 207-row fixture checks the honest 200-row partial view and exclusion of future, deleted and out-of-window logs. Removing owner provisioning must deny planning reads without hiding ordinary logs.

Existing activation, reports, recovery, correction and immutable-history browser journeys use `/training/manage`; their real SQL readbacks and negative assertions remain. This route preserves authenticated compatibility, not an external Dozer approval flow. The logger and SQL/MCP/native security regressions remain in the suite.

The narrow local HTTP adapter supports the dashboard's real cardio/exercise FK join. Its HTTP query wrapper preserves SQL `date` as `YYYY-MM-DD` (PGlite otherwise serializes a JS midnight timestamp); direct fixture SQL keeps its native types. No query results are fabricated. Delay/outage cases intercept transport only; successful responses still come from the disposable SQL fixture. Wait for delayed route handlers to complete before unregistering them so cleanup cannot race an outstanding response.

Current accepted screenshots/logs are copied to `docs/training-planning/evidence/simple-dashboard/`, with exact commands/results in `docs/training-planning/SIMPLE-DASHBOARD-DELIVERY.md`. Raw local runs, including failed development iterations, remain under `.training-test/evidence/simple-dashboard/` and `.training-test/evidence/browser/`; stale `*-failure.*` files are not accepted evidence. No extra Supabase project or migration is part of this correction.

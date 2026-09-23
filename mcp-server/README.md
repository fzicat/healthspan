# Healthspan MCP Server

Local stdio MCP access to Healthspan reads, exercise creation and guarded training
planning. This is a **single-athlete, service-role** adapter, not a remote multi-user
API. Load [COACH_PLAYBOOK.md](./COACH_PLAYBOOK.md) in the coaching harness; server
startup does not load it or prove the model followed it.

## Setup and rollout boundary

From this directory:

```sh
npm ci
npm run typecheck
npm test
```

Normal operation requires the versioned training migrations and all RPCs in
[TRAINING-CONTRACT.md](../supabase/TRAINING-CONTRACT.md), not just the bootstrap
schema. Database deployment, effective grants, explicitly provisioned owner and
confirmed athlete timezone are separate rollout steps. Do not infer an owner from
the first login or read. Retire older MCP instances before activating direction.
No migration or production-data audit is performed by the MCP test command.

Provide these server-only environment settings through your local harness or the
repository's `.env.local` (one level above this directory):

```text
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only secret>
HSPAN_ATHLETE_USER_ID=<explicitly provisioned owner UUID>
HSPAN_ATHLETE_TIMEZONE=America/Montreal
```

Confirm the timezone with the athlete and match the provisioned state. The default
for legacy date reads is `America/Montreal`; a configured mismatch with planning
context rejects. `SUPABASE_URL` takes precedence over the app's
`NEXT_PUBLIC_SUPABASE_URL`. Never expose the service key through a
`NEXT_PUBLIC_` setting, chat, logs or a browser bundle.

`src/index.ts` normally loads the repository's `.env.local`, then `.env`, without
overwriting existing environment values. Set `HSPAN_MCP_NO_DOTENV=1` to disable
both files; that mode requires explicit `SUPABASE_URL` and does not use the app's
URL fallback. This is configuration isolation, **not** an authentication bypass.
Tests always disable dotenv and launch the actual server with synthetic credentials
and a loopback-only fixture URL. Production code has no fake-data/test-mode writer.

Point a local MCP harness at the installed `tsx` executable and this entrypoint;
substitute absolute checkout paths:

```json
{
  "mcpServers": {
    "healthspan-data": {
      "command": "/absolute/checkout/mcp-server/node_modules/.bin/tsx",
      "args": ["/absolute/checkout/mcp-server/src/index.ts"]
    }
  }
}
```

`npm run dev` starts stdio; `npm run inspect` launches MCP Inspector. Inspector uses
normal configuration, so do not run write experiments against a real database.
Shared calendar helpers live in the app's `src/lib/training-planning/dates.ts`;
`src/dates.ts` bridges the Next.js/CommonJS and MCP/ESM module boundary for `tsx`.

## Planning tools

| Tool | Contract |
| --- | --- |
| `get_training_context({target_date?})` | Consistent SQL snapshot of authority, full direction/rules, queue, activity eligibility, actual evidence, reservations, review, recent phases and target conflicts. Default athlete-local today. No invented recommendation. Complete supported context mints a receipt. |
| `get_training_history({revision_id?,session_id?,cursor?,limit?})` | Exact immutable snapshots and events. UUID cursor; limit 1–100. Follow `has_more` / `next_cursor`. Never grants a receipt. |
| `propose_training_revision` | Immutable full revision content plus optional parent revision. Does not activate it. Content types are in the shared contracts; SQL validates references/rules. |
| `record_training_decision` | Coach kinds: `reconcile`, `propose_report`, `bounded_continuation`, `review`, `concern`, `deviation`. Required fields depend on kind; see the SQL wire contract and discovery schema. No generic ledger writer. |
| `materialize_training_session` | Atomic dated strength/cardio/mobility/rest intent, frozen occurrence and optional workout. Requires reason/revisit, activity and target date; optional slot/exercises and supportive cardio duration/intensity. Exercises carry `exercise_id`, `details`, optional `note` and `optional`. |
| `get_training_request({operation,request_id,payload})` | Read the original committed result for an identical request; null if absent, conflict for a different payload. Not new write authority. |

The nine SQL RPCs also include athlete-only `activate_training_revision` and
`set_training_lifecycle`; these are **not** MCP tools. Owner confirmation of reports,
work-set/effort/quality evidence, day activity, retrospective attribution, cancellation
and queue corrections requires authenticated Healthspan. A quote, `actor` field or
agent-written approval is not athlete authentication.

`reconcile` takes an occurrence and optional outcome; SQL reads evidence itself.
There is no coach `qualifies=true` or asserted-count input. `propose_report` cannot
confirm the report. Routine reviews may only continue/extend the expected window
within delegation; extending that window does not extend authorization. Save a day
recommendation with `materialize_training_session`, not an unsupported decision kind.
A decision-only deviation cannot change the frozen prescription; edits use the
guarded workout mutation path.

## Fresh context and all four workout guards

All four public legacy mutations use **one guarded RPC path**, never direct workout
inserts/updates/deletes:

- `create_or_update_workout({date,name?,note?,...guard})`
- `add_workout_exercise({date,exercise_id,details?,note?,sort_order?,...guard})`
- `update_workout_exercise({workout_exercise_id,details?,note?,sort_order?,...guard})`
- `remove_workout_exercise({workout_exercise_id,...guard})`

For active **or paused** direction, `guard` includes `context_id`, `request_id`,
explicit `mode: linked|freeform`, reason and any required revisit. Supply original
`expected_state_version` / `expected_evidence_version` explicitly for restart-safe
replay; within the same connection they can default to the receipt's captured values.
Update/remove resolve the owning workout date before checking the receipt. Every
new workout mutation re-reads lifecycle/target context. All prescription edits are
today/future in athlete-local time, never server-local or UTC date slices.

A receipt is random, in-memory, scoped to one stdio connection, configured athlete,
target date, included occurrences, captured state/evidence versions and capabilities.
It expires after 15 minutes **or local midnight, whichever comes first**. Restart,
a successful independent mutation, exercise creation or a failed/incomplete context
refresh invalidates usable authority. Fetch fresh context before each independent
mutation; use atomic materialization rather than four calls for a routine new intent.
Inactive/no-plan context grants proposal-only capability, not plan-linked authority.

Paused direction blocks new linked prescriptions but permits deliberately independent
freeform work through the same context and SQL spacing checks. Inactive/archived
unlinked legacy writes may omit guards and return `planning_enforcement: not_applicable`;
linked targets remain protected. This compatibility still requires working migrations
and context reads. An unavailable/unsupported/incomplete read **never** falls back to
freeform. Guarded first-write results are labeled `planning_enforcement: guarded`;
request replay returns the original database receipt/IDs.

SQL must atomically compare versions/authority and validate the **resulting complete
prescription** against actual-load spacing and delegated scope. A name, activity label,
new phase or `mode: freeform` cannot exempt resistance content. Reviews being due do not
automatically expire direction; applicable stop conditions, authorization expiry,
unresolved queue and missing activity evidence are separate blockers. Supportive
alternatives may remain eligible when resistance is not.

### Timeout and readback discipline

Keep one UUID and unchanged payload for each mutation. MCP sends `{p_input: ...}`;
`context_id` stays in memory and is **never** sent to SQL. Already-committed replay
is checked before receipt freshness so it can return after expiry, rollover or restart
without executing again. Always retain the original expected versions. A changed
operation/payload with the same request UUID rejects with `IDEMPOTENCY_CONFLICT`.

On timeout, retry identically or use `get_training_request`. For legacy operations its
`operation` is `mutate_training_workout`, and `payload` contains the nested legacy
`operation`, `args`, guard fields except `context_id`, and original versions. Never
use a new key to resolve uncertainty. Guardless compatibility calls synthesize a key
when omitted; callers must not claim client-controlled idempotent retry for those calls.

After success, read the exact returned revision/session through `get_training_history`
and the exact dated workout through `get_workout_by_date` if applicable. Use the request
lookup to confirm the receipt. If readback fails, report an unverified outcome, not
success. A new context read is needed before the next independent write.

Errors preserve codes in MCP error text, including `FRESH_CONTEXT_REQUIRED`,
`CONTEXT_CHANGED`, `VERSION_CONFLICT`, `INCOMPLETE_EVIDENCE`, `UNSUPPORTED_CONTEXT`,
`AUTHORITY_REQUIRED`, `OUTSIDE_DELEGATED_SCOPE`, `QUEUE_UNRESOLVED`,
`RECOVERY_SPACING_NOT_MET`, `WORKOUT_CONFLICT`, `DATE_NOT_EDITABLE` and
`IDEMPOTENCY_CONFLICT`. Inspect context's activity-specific reasons when a receipt
lacks a materialization capability; no capability is not blanket prohibition on logging.

## Evidence reads and exercise library

- `get_workout_by_date({date})` returns names/notes, actual sets and cardio even with no
  workout. Sets use half-open athlete-local day bounds, including DST. Date proximity
  never proves occurrence association or qualification.
- `list_recent_workouts({limit?,before_date?})` is **planned** rows, not attendance.
- `get_summary({from?,to?})` labels `workout_count` as planned rows; set counts/tallies
  are actual non-deleted sets, not qualifying exposures or normalized load volume.
- `list_sets` / `get_exercise_history` support instant bounds, limit and offset.
- `get_daily_log`, `list_daily_logs`, `list_cardio_sessions`, `list_breathwork_sessions`
  preserve unknown/null observations. Daily sleep duration is minutes, HRV is RMSSD ms,
  weight is pounds, nutrients/alcohol grams, calories kcal.
- Bounded time-series reads return `items`, `total`, `returned_count`, `complete`,
  `has_more`, `next_offset`. Counts can be null; then completeness is unknown, not true.
  Follow pages despite server-side caps. Day reads have bounded page traversal and
  per-source completeness. These legacy reads are explicitly `non_atomic`; only the
  planning context snapshot can grant write authority.
- Deleted set rows are excluded, but actual sets for archived/deleted library exercises
  remain visible with `exercises.is_deleted`. Null load/RIR is not zero.
- `search_exercises` resolves IDs. `find_similar_exercises` checks aliases before
  `create_exercise`; near-matches block insertion unless deliberately confirmed. Library
  creation does not approve an anchor, make equipment loads comparable or earn credit.

## Verification and limitations

`npm test` runs Node tests via `tsx`. Direct adapter/receipt tests use an injected
clock; public tests spawn **the real stdio entrypoint**, discover tools and call them
through the SDK client and a synthetic loopback PostgREST fixture. They cover all four
active/paused/freeform guards, target/connection/occurrence/version scope, expiry/local
rollover/restart replay, invalidation, errors, no-workout actual sets, null metrics,
DST bounds, pagination and RPC envelopes. The fixture is test-only, with no real
credentials, `.env` loading or production fallback.

These tests verify the MCP/protocol contract, **not** PostgreSQL transactional safety,
actual privileges/RLS, qualification math, spacing predicates, race handling, UI flows
or production schema. Run the separate disposable-database integration suite and UI
checks before release; injected SQL errors are not proof SQL would enforce them.

A receipt proves retrieval/freshness of a supported response, **never understanding,
reasoning quality or physiological recovery**. Prompt adherence needs a separate fresh
coach-session evaluation. Raw service keys, SQL/admin calls and old MCP clients remain
outside receipt enforcement. Existing broad legacy RLS remains a single-user limitation.
Ordinary online logging must not depend on planning availability; no offline-save or
compromised-key sandbox guarantee is implied.

# Training planning: manual Supabase SQL Editor runbook

## Scope and stop conditions

**Nothing in this runbook has been deployed.** This is an operator procedure for Frank, not authorization for an agent to discover or modify a live database. Repository inventory is not evidence of the deployed schema, grants, Supabase version, or project identity. Obtain separate authorization for deployed read-only discovery, backup/export and restore rehearsal, SQL application, and service/app rollout. Never paste credentials, JWTs, health payloads, or backup contents into agent chat.

Local implementation: `/home/fzicat/projects/healthspan-training-planning`, branch `feat/training-planning`, specification baseline `a80725f`. Read the complete `SPEC-training-planning.md` and `supabase/TRAINING-CONTRACT.md`. The specification's original proposal/status text is historical, not a deployment approval. `supabase/schema.sql` is the legacy bootstrap inventory, **not a migration runner**; do not rerun it against an existing database. Its `IF NOT EXISTS` clauses do not validate existing definitions and its policies/seeds are not an incremental upgrade.

All database application is manual in the intended project's Supabase SQL Editor, as an authorized schema administrator. No CLI migration push, connection-string discovery, env loading, or automatic production test execution is needed or authorized here. Do not run `supabase/tests/*` against Supabase: these are synthetic disposable-engine tests.

### Implemented safeguards and remaining release gates

These describe the current repository SQL, not the deployed project. No additional sealing or role-transfer patch is prescribed by this runbook.

1. **001 now rejects several schema-drift cases before creating objects.** It checks required legacy column/type pairs, the two literal workout sequence names, a single-column unique constraint on `workouts.date`, and collisions with `training_*` functions or any of the nine public RPC names (including overloads), as well as legacy/Auth relation and note-column presence. This is not a complete compatibility audit: Auth key type/constraints, remaining observation fields, defaults/nullability, sequence ownership, indexes, policies, triggers, reserved non-function names and effective privileges still require the inventories below. A mismatch requires a separately reviewed compatibility/precondition patch, never a bootstrap rerun.
2. **001 explicitly grants the new owner role to the applying administrator.** Immediately after `CREATE ROLE training_rpc_owner`, its DO block executes `format('GRANT training_rpc_owner TO %I', current_user)`. It does not assume that the administrator is named `postgres` or is a superuser. 004 grants temporary schema CREATE, transfers feature functions to this restricted role and revokes that CREATE grant before COMMIT. The administrator membership is retained by these files; record it and verify the actual applying role's ownership, CREATEROLE/admin and SET ROLE capabilities. Do not pre-create the role, manually duplicate the grant, or grant it to an application role. Native PostgreSQL rehearsal exercises a non-superuser migrator; the actual Supabase Editor role graph/version remains an isolated-rehearsal gate.
3. **Each creating transaction seals its feature objects before COMMIT.** 001 enables RLS and revokes all four planning tables from PUBLIC/anon/authenticated/service_role, and revokes feature-helper execution. 002 and 003 revoke all feature-function execution before their commits; 003's nine public RPCs are not exposed until 004 grants their final authenticated/service surface. These revokes cover the named roles and PUBLIC, not arbitrary custom/inherited grantees. The saved runbook test checks intermediate commits under deliberately permissive named-role defaults. A sealed partial installation is still unsupported: keep planning use off and complete all four files within the approved maintenance window.
4. **Effective privileges remain a deployment gate.** PUBLIC schema CREATE, inherited grants, custom default grantees and column-level grants can defeat narrow explicit ACLs. Final `training_rpc_owner` must not effectively CREATE in public; application roles must neither inherit nor be able to SET ROLE to it. The name-based sealing/ownership loops require a clean reserved-name inventory, so they cannot adopt an unrelated same-prefix function. Unexpected grants need explicit reviewed remediation, not broad resets of project defaults or legacy permissions.

No live project, GoTrue-issued JWT or PostgREST validation has been performed. Those checks, backup/restore rehearsal, service retirement and deployment remain blocked on separate authorization; local SQL results do not waive them.

## Unshipped Smith-review correction definitions

The R1–R5 correction pass edits the **unapplied** 002/003 definitions coherently.
Do not treat the earlier candidate hashes as a deployed migration history. Apply
001 → 002 → 003 → 004 once, using one reviewed final commit and the matching
`evidence/native-postgres.json` hashes. No additional production patch, bootstrap
rerun or manual database write is required by these fixes. If any earlier candidate
was applied in a separately authorized sandbox, recreate that disposable sandbox;
if unexpectedly applied live, STOP for an explicitly reviewed forward migration.

RPC SQL signatures remain `(p_input jsonb DEFAULT '{}')`; grants are unchanged.
New optional JSON fields and operator-visible procedures:

- Owner `confirm_report`: use either `proposal_event_id` for byte-equivalent JSONB
  content or `corrected_proposal_event_id` for a deliberate different report linked
  to the same occurrence's proposal. Never both. No work-array or load-tag defaults
  are silently inserted by the UI. Mobility objectives need confirmed actual tags.
- `materialize_training_session`: `replace_cancelled_session_id` explicitly reissues
  the latest owner-cancelled unperformed occurrence on the same dated workout.
  Cancellation may also come from exact revision activation. Reissue creates a new
  frozen occurrence, preserves old intent and all logs/associations, and replaces
  only unperformed prescription rows. It does not grant cancellation authority to
  MCP, bypass current spacing, overwrite freeform/uncancelled/completed work or
  transfer exposure. UI: cancel under Manage linked intent, then choose the exact
  cancelled occurrence under Training → Record a dated intent. MCP: fresh target
  context, same optional field, stable request ID, exact history/workout readback.
- Latest complete day testimony of resistance resets spacing without qualifying.
  Latest effective report and evidence-scoped resolution govern report load. Older
  positive reports remain history, not phantom work; independent raw sets/cardio
  always retain actual load. Date corrections require an explicit frozen-rule-
  bounded continuation (otherwise use distinct corrected occurrence testimony).
- Primary logged cardio candidates expose owner association with readable records.
  No same-date auto-link or fabricated report/log. Duplicate association is refused.

The updated MCP remains migration-first and fail-closed. These changes add no
fallback on missing or arbitrary RPC errors. They are not GoTrue/PostgREST or
fresh-Dozer coaching validation. See the implementation report for actual local
SQL, native overlap, public protocol and browser evidence.

## 1. Authorization, backup and maintenance checklist

- Frank verifies the intended project and administrator role in his own Supabase UI; an agent must not discover production credentials or resources.
- Separately authorize a backup covering legacy data, schema/ACLs/functions/triggers and, for later rollbacks, all planning history. Confirm how Auth users/identities and roles/grants are covered; a public-schema export alone does not restore `auth.users` references. Preserve backup security and verify a restore in an isolated destination. No backup was taken by this work.
- Save the preflight outputs privately, the reviewed artifact revision/digest, and a manual applied-ID ledger. SQL Editor execution does not automatically register these files with a migration tool. Do not insert synthetic entries into Supabase's internal migration history as part of this procedure.
- Schedule a bounded maintenance window for DDL locks and all four files. Keep new planning use off. Evidence triggers begin affecting legacy writes in 001; do not treat a partial installation as a supported runtime. Existing clients may otherwise keep logging between migrations and hit locks/permission problems.
- **Retire old service-role MCP instances before any live activation.** They remain outside receipt enforcement even after all migrations. Inventory/retire processes and deployment/configuration separately, with operator authorization. Replacing repository source or pausing planning does not stop an old process. No agent configuration or service was changed by this task.

## 2. Read-only preflight SQL (Frank runs after authorization)

These SELECTs are schema/security discovery, not migrations. Save outputs privately. Run the groups separately; an error or an unexpected result is a stop, not permission to infer a default.

### Applying role, schemas, role graph and defaults

<!-- runbook-sql: preflight-role -->
```sql
SELECT current_database(), current_user, session_user,
       current_setting('server_version') AS server_version,
       current_setting('search_path') AS editor_search_path;

SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin,
       rolinherit, rolbypassrls
FROM pg_catalog.pg_roles
WHERE rolname IN (current_user, session_user, 'postgres', 'anon',
                  'authenticated', 'service_role', 'training_rpc_owner');

SELECT parent.rolname AS granted_role, member.rolname AS member,
       m.admin_option
FROM pg_catalog.pg_auth_members m
JOIN pg_catalog.pg_roles parent ON parent.oid = m.roleid
JOIN pg_catalog.pg_roles member ON member.oid = m.member
ORDER BY parent.rolname, member.rolname;

SELECT nspname, pg_catalog.pg_get_userbyid(nspowner) AS owner, nspacl,
       has_schema_privilege(current_user, oid, 'USAGE') AS editor_usage,
       has_schema_privilege(current_user, oid, 'CREATE') AS editor_create
FROM pg_catalog.pg_namespace WHERE nspname IN ('public','auth');

SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS creator,
       coalesce(n.nspname, '(all schemas)') AS schema_scope,
       d.defaclobjtype, d.defaclacl
FROM pg_catalog.pg_default_acl d
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY creator, schema_scope, d.defaclobjtype;
```

Before a fresh 001, `training_rpc_owner` must be absent. All three application roles must exist. The applying role needs the ownership/DDL/role capabilities described above and SELECT on `auth.users` for setup. Empty default-ACL output **does not mean no privileges**: functions default to PUBLIC EXECUTE. Review PUBLIC and role inheritance in addition to named grants.

### Complete relation, column, constraint, index and sequence inventory

<!-- runbook-sql: preflight-schema -->
```sql
WITH expected(schema_name, table_name) AS (VALUES
  ('auth','users'), ('public','exercises'), ('public','sets'),
  ('public','workouts'), ('public','workouts_exercises'),
  ('public','daily_logs'), ('public','cardio_sessions'),
  ('public','breathwork_sessions'))
SELECT e.*, c.oid::regclass AS actual_relation, c.relkind,
       pg_catalog.pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity, c.relforcerowsecurity, c.relacl
FROM expected e
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = e.schema_name
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = e.table_name
ORDER BY e.schema_name, e.table_name;

SELECT n.nspname, c.relname, a.attnum, a.attname,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull, a.attidentity, a.attgenerated, a.attacl,
       pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attnum > 0 AND NOT a.attisdropped AND
  ((n.nspname = 'auth' AND c.relname = 'users' AND a.attname = 'id') OR
   (n.nspname = 'public' AND c.relname IN
    ('exercises','sets','workouts','workouts_exercises','daily_logs',
     'cardio_sessions','breathwork_sessions')))
ORDER BY n.nspname, c.relname, a.attnum;

SELECT con.conrelid::regclass AS relation, con.conname, con.contype,
       con.convalidated, con.condeferrable,
       pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint con
WHERE con.conrelid IN
  (SELECT c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE (n.nspname='auth' AND c.relname='users') OR
     (n.nspname='public' AND c.relname IN
      ('exercises','sets','workouts','workouts_exercises','daily_logs',
       'cardio_sessions','breathwork_sessions')))
ORDER BY relation, con.conname;

SELECT schemaname, tablename, indexname, indexdef FROM pg_catalog.pg_indexes
WHERE schemaname='public' AND tablename IN
  ('exercises','sets','workouts','workouts_exercises','daily_logs',
   'cardio_sessions','breathwork_sessions')
ORDER BY tablename, indexname;

SELECT c.relname AS table_name,
       pg_catalog.pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), 'id') AS id_sequence
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname IN
  ('exercises','sets','workouts','workouts_exercises','cardio_sessions','breathwork_sessions');

SELECT c.oid::regclass AS sequence_name,
       pg_catalog.pg_get_userbyid(c.relowner) AS owner, c.relacl,
       pg_catalog.format_type(s.seqtypid,NULL) AS sequence_type,
       s.seqincrement, s.seqmin, s.seqmax, s.seqcycle
FROM pg_catalog.pg_sequence s JOIN pg_catalog.pg_class c ON c.oid=s.seqrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' ORDER BY sequence_name;

SELECT to_regprocedure('pg_catalog.gen_random_uuid()') AS uuid_function,
       to_regprocedure('pg_catalog.sha256(bytea)') AS digest_function,
       EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names
               WHERE name='America/Montreal') AS proposed_zone_exists;
```

Compare **every required legacy column** with `supabase/schema.sql` and all four migration bodies, not just table presence. In particular:

- `auth.users.id` is a unique/primary-key `uuid`; legacy IDs and exercise/workout FKs are `integer`; `workouts.date` is a unique non-null `date`.
- `exercises` needs `name text`, `metrics jsonb`, `category text`, `is_deleted boolean`, `created_at timestamptz`; preserve the partial case-insensitive name uniqueness and category check.
- `sets` needs `exercise_id`, `logged_at timestamptz`, nullable integer metrics `weight/reps/time/distance/rir`, and `is_deleted`. `training_session_id` must be absent before fresh 001.
- `workouts.name/note` and `workouts_exercises.details/note` must exist as text; junction IDs/FKs/sort order must match. Missing text fields can surface only at RPC execution time if merely relying on CREATE FUNCTION success.
- All daily-log/cardio/breathwork fields, timestamp types, nullable observations and existing checks must match the source inventory. These are recovery/evidence inputs, not optional missing tables.
- 004 names **`public.workouts_id_seq` and `public.workouts_exercises_id_seq`** literally; confirm these are the actual owned/default sequences, not merely relations with those names. Do not rename deployed sequences opportunistically.
- Check validated FKs and deletion behavior, nullability, defaults, indexes, unexpected triggers, policies and grants. Different owner/type/partitioning arrangements need review, not assumptions.

### Existing RLS/grants and reserved-name conflicts

<!-- runbook-sql: preflight-conflicts -->
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname='public'
ORDER BY tablename, policyname;

SELECT t.tgrelid::regclass AS relation, t.tgname, t.tgenabled,
       pg_catalog.pg_get_triggerdef(t.oid, true) AS definition
FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal
ORDER BY relation, t.tgname;

SELECT n.nspname, c.relname, c.relkind, c.relacl
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND (c.relname ~ '^training_' OR c.relname='sets_training_session');

SELECT n.nspname, t.typname, t.typtype
FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='public' AND t.typname ~ '^training_';

SELECT p.oid::regprocedure AS signature,
       pg_catalog.pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef, p.proconfig, p.proacl
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.proname ~ '^training_' OR p.proname IN
  ('get_training_context','get_training_history','get_training_request',
   'propose_training_revision','activate_training_revision','set_training_lifecycle',
   'record_training_decision','materialize_training_session','mutate_training_workout'))
ORDER BY signature;

SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='sets' AND column_name='training_session_id';

SELECT r.rolname, c.oid::regclass AS relation, priv.privilege,
       has_table_privilege(r.oid,c.oid,priv.privilege) AS effective_table_privilege
FROM pg_catalog.pg_roles r
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) priv(privilege)
CROSS JOIN pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='public'
  AND c.relkind IN ('r','p')
ORDER BY r.rolname, relation, priv.privilege;

SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_registry;
-- ONLY if the preceding relation exists and access is authorized:
-- SELECT version FROM supabase_migrations.schema_migrations
-- WHERE version IN ('202609220001','202609220002','202609220003','202609220004')
-- ORDER BY version;
```

All feature-name results must be empty on a fresh installation, including same-name overloads, constraints/indexes/types, `training_rpc_access` policies and `training_evidence_changed` triggers. If anything exists, switch to recovery below. Do not let 004 transfer/revoke an unrelated same-prefix function. The legacy bootstrap intentionally allows broad authenticated access with `USING(true)`; this remains a **single-user trust limitation**, not an owner-isolation fix. Service-role raw legacy access remains outside supported MCP guards.

## 3. Apply exactly once, in order, each file's own transaction

Proceed only after gates, backup, approved preflight and isolated rehearsal. Copy each entire reviewed file into the SQL Editor and run it separately. Each already contains `BEGIN; ... COMMIT;`; do not nest transactions, select just the middle, combine files, or rely on the Editor to infer transaction boundaries.

| Order / manual applied ID | Exact repository path | Committed effect |
| --- | --- | --- |
| 1 / `202609220001` | `supabase/migrations/202609220001_training_planning.sql` | Expanded preflight, role/admin membership, four RLS-sealed tables, nullable set FK, immutable/state/evidence/classification triggers and sealed foundation helpers |
| 2 / `202609220002` | `supabase/migrations/202609220002_training_engine.sql` | Validation, evidence, queue, review and eligibility engine; feature functions sealed before COMMIT |
| 3 / `202609220003` | `supabase/migrations/202609220003_training_rpcs.sql` | Nine transactional RPCs and supporting helpers, still sealed before COMMIT |
| 4 / `202609220004` | `supabase/migrations/202609220004_training_grants.sql` | Restricted function owner, RLS policies and final explicit table/function/sequence grants |

Record the ID, reviewed artifact digest/revision, applying role, confirmed COMMIT and postcheck result in the operator's private ledger **after each successful transaction**. None provisions an owner, populates legacy links, proposes a plan, or activates a plan. Do not enable use after only a subset.

### Failure, unknown commit status and recovery

- On an error, stop immediately. In the same still-open Editor session, execute `ROLLBACK;` to clear an aborted transaction. A lost session normally rolls back an uncommitted transaction, but absence of a success message does not establish whether COMMIT occurred.
- Reconcile the private applied-ID ledger with the catalog and approved file definitions. Internal migration history may be absent or unrelated for manual Editor work. A function/table name alone is not proof that a file committed intact.
- Expected checkpoints: before 001 no feature objects; after 001 four RLS-sealed tables/role/admin membership/set FK and sealed foundation helpers; after 002 sealed engine helpers such as `training_validate_revision(jsonb)`; after 003 all nine RPCs still denied to application roles; after 004 restricted function owners, final ACLs and policies as verified below. Inspect exact definitions with `pg_get_functiondef`, constraints, triggers and ACLs when deciding applied state.
- A confirmed failed transaction leaves prior successful files committed. Correct the reviewed prerequisite, then rerun **only the failed, confirmed-uncommitted file**, continuing in order. Already-committed files are once-only; do not rerun 001 or 004, add `IF NOT EXISTS`, skip failures, or drop/recreate objects to force progress.
- Unexpected partial artifacts, an uncertain commit, another version's objects, or an ownership failure mean stop and obtain an explicit forward-repair plan. Keep the security maintenance perimeter in place until resolved. Do not allow a broken partial installation to become the normal legacy logger environment.

## 4. Postmigration SELECT checks (before provisioning/use)

Re-run the preflight relation/column/constraint/policy/trigger/sequence inventories with the four planning tables included. Then run these focused checks. Save and compare the full rows, not just a green Editor status.

<!-- runbook-sql: postmigration -->
```sql
SELECT c.relname, pg_catalog.pg_get_userbyid(c.relowner) AS table_owner,
       c.relrowsecurity, c.relforcerowsecurity, c.relacl
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('training_plan_state','training_plan_revisions','training_session_contexts','training_plan_events');

SELECT rolname, rolsuper, rolcanlogin, rolcreatedb, rolcreaterole,
       rolinherit, rolbypassrls,
       has_schema_privilege(oid,'public','USAGE') AS public_usage,
       has_schema_privilege(oid,'public','CREATE') AS public_create
FROM pg_catalog.pg_roles WHERE rolname='training_rpc_owner';

WITH RECURSIVE memberships(member, granted_role) AS (
 SELECT member, roleid FROM pg_catalog.pg_auth_members
 UNION
 SELECT m.member, a.roleid FROM memberships m
 JOIN pg_catalog.pg_auth_members a ON a.member=m.granted_role
)
SELECT r.rolname AS application_role, target.rolname AS reachable_role
FROM memberships m JOIN pg_catalog.pg_roles r ON r.oid=m.member
JOIN pg_catalog.pg_roles target ON target.oid=m.granted_role
WHERE r.rolname IN ('anon','authenticated','service_role')
  AND target.rolname='training_rpc_owner';

SELECT r.rolname, c.relname, p.privilege,
       has_table_privilege(r.oid,c.oid,p.privilege) AS allowed
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('anon','authenticated','service_role','training_rpc_owner')
 AND n.nspname='public' AND c.relname IN
 ('training_plan_state','training_plan_revisions','training_session_contexts','training_plan_events')
ORDER BY r.rolname,c.relname,p.privilege;

SELECT r.rolname, c.relname, p.privilege,
       has_any_column_privilege(r.oid,c.oid,p.privilege) AS any_column_allowed
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='public'
 AND c.relname IN ('training_plan_state','training_plan_revisions','training_session_contexts','training_plan_events')
ORDER BY r.rolname,c.relname,p.privilege;

SELECT c.relname, p.privilege,
       has_table_privilege('training_rpc_owner',c.oid,p.privilege) AS table_allowed
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)
WHERE n.nspname='public' AND c.relname IN
 ('exercises','sets','workouts','workouts_exercises','daily_logs','cardio_sessions','breathwork_sessions')
ORDER BY c.relname,p.privilege;

SELECT a.attname,
       has_column_privilege('training_rpc_owner',c.oid,a.attnum,'UPDATE') AS update_allowed,
       a.attacl
FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='sets' AND a.attnum>0 AND NOT a.attisdropped
ORDER BY a.attnum;

SELECT p.oid::regprocedure AS signature, pg_catalog.pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef, p.proconfig, p.proacl,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
       EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
               WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.proname ~ '^training_' OR p.proname IN
 ('get_training_context','get_training_history','get_training_request',
  'propose_training_revision','activate_training_revision','set_training_lifecycle',
  'record_training_decision','materialize_training_session','mutate_training_workout'))
ORDER BY signature;

WITH expected(name) AS (VALUES
 ('get_training_context'),('get_training_history'),('get_training_request'),
 ('propose_training_revision'),('activate_training_revision'),('set_training_lifecycle'),
 ('record_training_decision'),('materialize_training_session'),('mutate_training_workout'))
SELECT name, to_regprocedure(format('public.%I(jsonb)',name)) AS required_signature
FROM expected;

SELECT con.conrelid::regclass AS relation, con.conname, con.convalidated,
       pg_catalog.pg_get_constraintdef(con.oid,true) AS definition
FROM pg_catalog.pg_constraint con
WHERE con.conrelid IN (to_regclass('public.training_plan_state'),
 to_regclass('public.training_plan_revisions'),to_regclass('public.training_session_contexts'),
 to_regclass('public.training_plan_events'),to_regclass('public.sets'))
ORDER BY relation,con.conname;

SELECT t.tgrelid::regclass AS relation, t.tgname, t.tgenabled,
       pg_catalog.pg_get_triggerdef(t.oid,true) AS definition
FROM pg_catalog.pg_trigger t
WHERE NOT t.tgisinternal AND t.tgname ~ '^training_'
ORDER BY relation,t.tgname;

SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_catalog.pg_policies
WHERE schemaname='public' AND (tablename ~ '^training_' OR policyname='training_rpc_access')
ORDER BY tablename,policyname;

SELECT column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='sets' AND column_name='training_session_id';

SELECT s.seq, has_sequence_privilege('training_rpc_owner',s.seq,'USAGE') AS usage,
       has_sequence_privilege('training_rpc_owner',s.seq,'SELECT') AS select_allowed,
       has_sequence_privilege('training_rpc_owner',s.seq,'UPDATE') AS update_allowed
FROM (VALUES ('public.workouts_id_seq'),('public.workouts_exercises_id_seq')) s(seq);

SELECT
 (SELECT count(*) FROM public.training_plan_state) AS state_count,
 (SELECT count(*) FROM public.training_plan_revisions) AS revision_count,
 (SELECT count(*) FROM public.training_session_contexts) AS session_count,
 (SELECT count(*) FROM public.training_plan_events) AS event_count,
 (SELECT count(*) FROM public.sets WHERE training_session_id IS NOT NULL) AS linked_set_count;
```

Expected results:

- Four planning tables, RLS enabled. Their table owner remains the schema administrator; the definer role is not the table owner and is `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`. `public_usage=true`, **effective** `public_create=false`; no application-role path to that role. Inspect PUBLIC schema grants if CREATE is unexpectedly true.
- All application planning-table privileges, including column access, false. `training_rpc_owner` gets SELECT/INSERT on all four and UPDATE only on state; no DELETE/TRUNCATE/history UPDATE. Its legacy grants are SELECT on seven evidence tables, INSERT/UPDATE/DELETE on workouts and junction, UPDATE **only `sets.training_session_id`**, and USAGE/SELECT on the two sequences. Check exact ACLs and effective permissions, not RLS alone.
- All nine listed public RPCs have exactly the `(jsonb)` signature, `prosecdef=true`, owner `training_rpc_owner`, and `proconfig` containing `search_path=pg_catalog, public`. Helpers have the same owner/fixed path; `training_actor`, `training_evidence_changed` and `training_capture_classification` are also SECURITY DEFINER, the other helpers are invoker functions. No helper PUBLIC/anon/authenticated/service execution; all nine RPCs allow authenticated/service, not anon/PUBLIC. Service EXECUTE on activation/lifecycle does **not** confer athlete identity; the RPC must reject it internally.
- `training_rpc_access` policies on four planning and seven legacy tables target only the restricted role. Existing broad authenticated legacy policies remain; no new public planning access. Evidence triggers are enabled, AFTER INSERT/UPDATE/DELETE FOR EACH STATEMENT on all seven legacy tables; immutable BEFORE UPDATE/DELETE triggers on revisions/sessions/events and the state-validation trigger are enabled. Classification-capture triggers preserve provenance on exercise category/metrics updates and set inserts/exercise-or-weight updates. Inspect definitions and referenced function identities, not only names.
- `sets.training_session_id` is nullable UUID with no default and ON DELETE RESTRICT FK. Owner FK to `auth.users` is RESTRICT; session workout FK is RESTRICT. Active pointer is a composite `(id,active_revision_id)` FK to revisions `(state_id,id)`. Check validated state/revision/session/event references, singleton/check constraints and receipt uniqueness against 001.
- Before provisioning, all five final counts are zero. Legacy sets stay NULL-linked, with no fabricated compliance. Compare pre/post legacy backups/counts privately if separately authorized; the migrations should not rewrite legacy rows.

## 5. Owner and timezone: separate manual template

Only after all four commits and security checks, Frank runs the lookup in **`supabase/setup-training-owner.sql`**, confirms exactly the intended `auth.users` account, and copies that UUID into the template. The lookup is for Frank to execute, not an agent credential-discovery step. Do not guess from the first row, an email remembered from chat, an environment variable or the test fixture UUID.

The app build uses `NEXT_PUBLIC_ATHLETE_TIMEZONE` (default `America/Montreal`); MCP uses `HSPAN_ATHLETE_TIMEZONE`. Both must exactly match the provisioned timezone. Configure a different zone explicitly before building, never derive it from a travel/device timezone. The browser refuses planning context when its build zone differs from SQL; timestamped set saving has no dependency on that read. Confirm `America/Montreal` explicitly or supply the intended valid IANA name; then set `zone_confirmed := true` in the template. Run the complete file as administrator. The untouched file deliberately raises and rolls back. It validates UUID spelling before casting/lookup, checks the actual Auth row and zone, refuses any existing planning state/history/links, and inserts only singleton `id=1`, lifecycle `inactive`, NULL active revision and zero counters. It is **not an upsert** and must not be used to change an existing owner/timezone. Those changes need a separate admin migration because historical dates/identity are durable.

Read back both SELECT results at the end: exact confirmed UUID/zone, inactive, NULL revision, zero history/links. With legacy writes resumed, `evidence_version` can increase and classification-provenance events can appear via triggers; neither is activation. Record successful setup privately. Do not populate a proposal or activation with SQL. A later exact proposal/seed/pending-intent choice must be reviewed and activated by the authenticated owner in Healthspan, after old MCP retirement and the release checks.

## 6. Isolation smoke checks and compatibility

### Disposable engine evidence and reproducible commands

From the repository root, with its locked dependencies installed, run:

```sh
node supabase/tests/runbook.mjs
node supabase/tests/training-planning.mjs
node --import tsx tests/native-training.mts
```

These are local synthetic tests, not commands to point at a Supabase project. The runbook and core tests use in-memory PGlite; the native test starts its own PostgreSQL server on loopback with generated test credentials and removes its disposable cluster afterward. None loads project env files or discovers a live connection. Do not overlap native runs; the harness deliberately refuses an existing run lock.

- **Saved runbook test:** `node supabase/tests/runbook.mjs` passed **62 checks, all 6 fenced SQL blocks and 35 SELECT result sets** on PGlite 0.5.8 / PostgreSQL 18.3. It extracts the actual labeled blocks from this document (and fails on any untested SQL fence), executes discovery/postchecks in read-only transactions, applies all four unmodified migrations as a non-superuser schema-owner role, and checks intermediate seals despite permissive named-role table/function defaults. It reads the actual owner template: untouched, malformed/braced/nil/unknown UUID and unconfirmed/invalid-zone cases fail without writes; valid synthetic input creates only the inactive singleton; a repeat refuses overwrite. It verifies actual circuit-breaker denial, ordinary logging while disabled, exact grant restoration, restricted ownership/paths, RLS and legacy preservation. It prints each block's result-set/row counts and migration SHA-256 hashes. Readback counts were state/revisions/sessions/events/links **0/0/0/0/0 after migrations**, then **1/0/0/0/0 after setup**. Later synthetic raw logging advances evidence and appends classification provenance, not a plan/activation/link. The in-memory engine closes in `finally`; no listener or database directory is created.
- **Core behavior regression:** `node supabase/tests/training-planning.mjs` freshly passed **49 PostgreSQL assertions**. This sequential PGlite suite exercises RPC decisions, permissions, replay, evidence and legacy guards. Both PGlite fixtures omit only the unrelated trailing `pg_trgm` search section of the bootstrap; all four migration files are executed unchanged.
- **Native final-source rehearsal:** `npm run test:training:native` passed **16/16** on PostgreSQL **18.4**. Exact migration hashes are in `.training-test/evidence/native-postgres.json` and match the delivered SQL. Tests include restricted non-superuser migration application, real authenticated database login roles/effective ACLs, genuinely overlapping separate backends for activation/materialization/reconciliation/evidence races, and a deliberately reproduced `40P01` deadlock with rollback plus explicit fresh-context retry. An earlier assertion incorrectly conflated immutable event count with state-version increments; the corrected assertions distinguish the actual deadlock victim and retain no-partial-write/one-credit checks. All 17 tracked PostgreSQL PIDs exited, its listener closed, and disposable cluster/data were removed. Native execution includes the full bootstrap and `pg_trgm`; it is still not a deployed Supabase or JWT-gateway rehearsal.

Native results are saved under `.training-test/evidence/native-postgres.{json,log}` with source hashes, individual test outcomes and cleanup state; rerun after any SQL/test change and use the fresh report rather than treating this snapshot as a release approval. Even real SQL login roles plus trusted claim GUCs do not validate JWT signatures/issuance, GoTrue, PostgREST routing/schema cache, deployed grants or a Supabase project's actual Editor role. **Isolated Supabase rehearsal and all live steps remain unperformed and require separate authorization.**

### Required isolated Supabase rehearsal before activation

Use a separately authorized disposable project with synthetic accounts/data, not production smoke writes. Apply the reviewed SQL exactly as the intended non-superuser Editor role, including owner setup with a synthetic account. Use actual owner/other-user JWTs issued through Auth and the service-role client only within the isolated environment; never paste secrets into SQL or into this document. SQL `SET ROLE` plus hand-set claims alone does not exercise GoTrue/PostgREST.

- Owner JWT: context/history/request reads succeed; a synthetic proposal remains inactive until owner activation; exact-version activation/lifecycle/report confirmation work and read back the exact receipt/revision/session/event IDs.
- Anonymous and another authenticated user: RPC access/actor checks reject; no planning-table reads/mutations. Note that broad legacy authenticated RLS still permits legacy data access: do not mistake planning ownership for whole-app multi-user isolation.
- Service role: allowed read/proposal/routine paths work; activation, lifecycle changes, report/work-set/day confirmation and other owner-only decisions return `AUTHORITY_REQUIRED`; caller-supplied actor/approval fields cannot impersonate the owner. Direct planning-table writes and helper execution fail despite BYPASSRLS.
- Exercise all four supported MCP legacy mutations while active/paused, including explicit freeform, stale/expired/other-connection receipts, independent alternatives, request retries and readback. Raw SQL/service-key access and old MCP processes remain outside receipt enforcement.
- Separate connections racing activate/materialize/reconcile and concurrent base evidence changes must yield atomic success or explicit version/conflict/retry, never duplicate credit or a partial prescription. PGlite's sequential tests are not this proof; native SQL-engine race evidence above must still be complemented by the actual authorized Supabase client path. On `40P01` deadlock or a version conflict, refresh context, reconcile the exact request receipt/commit status and retry explicitly; never blindly duplicate a mutation.
- PostgREST resolves the exact nine `p_input jsonb` RPCs and enforces ACLs after schema changes. If it has a stale schema cache, diagnose it in the isolated project; an administrator may explicitly issue `NOTIFY pgrst, 'reload schema';` and then verify discovery again. No cache command was issued here.
- Missing migrations/unavailable planning service, unprovisioned state, inactive state and paused state: ordinary online set logging still works through its existing path, with NULL occurrence links when no reliable context is available. Review due alone is not a logger gate. Verify the new app omits a nonexistent link column when migrations are absent; do not send a new-column payload to an old schema. Dependent automation fails closed, not silent freeform fallback.

Read APIs can have stateful bookkeeping: `get_training_context` locks the singleton, reconciles changed evidence, may append reconciliation/review_due events and bump state versions. Do not call it on production under the label "read-only schema preflight." Isolated setup/template tests and catalog SELECTs are separate from real athlete activation. No live smoke test was performed here.

## 7. Non-destructive disable / rollback

1. If an active revision exists and the app is healthy, the authenticated owner pauses it **through the app**, preserving attribution and exact receipt/readback. Paused blocks new linked prescriptions but intentionally does not stop actual-set logging or all independent freeform intent. A pause is not a service shutdown or a credential sandbox. Never directly UPDATE lifecycle as the ordinary rollback path.
2. Separately authorize and verify stopping/retiring **all prescription-capable old and new MCP/service instances**. Retire old guard-bypassing clients before any activation; do not bring them back as an active-plan rollback. This task neither changes agent configuration nor runs service-management commands.
3. Roll back app/MCP integration only after the service retirement step. Keep all four migrations, singleton state, immutable revisions/events/contexts, generated workouts and sets. If the app is unusable, retire services first and use the optional admin RPC circuit breaker below rather than forging an owner JWT or deleting history.
4. Confirm ordinary unlinked online logging still works and history remains readable as intended. Do not remove evidence/immutable triggers or unlink sets to silence errors. Linked-workout hard deletion remains restricted by retained FKs; use the supported cancel/deviation paths when available, keep generated records, and expose a coherent read-only/conflict message in a rolled-back client rather than promising an old destructive UI action will work.
5. Destructive schema/data rollback, auth-user deletion, owner/timezone replacement, or restore over production requires separate authorization/dependency review. No DROP/TRUNCATE/history deletion instructions are provided here.

### Optional administrator RPC circuit breaker (explicit choice, not automatic)

Use only after capturing/validating the final baseline grants above. This revokes **all nine public planning RPCs**, including context reads that can synchronize reviews. It leaves helper/trigger ownership, legacy table permissions, history and ordinary logging intact. It does not revoke a raw service key's legacy access; separately retiring those services is mandatory. It does not cancel already-running transactions; coordinate/verify the maintenance window separately. Clients must surface planning unavailability, not attempt a fallback.

<!-- runbook-sql: disable-rpcs -->
```sql
BEGIN;
REVOKE EXECUTE ON FUNCTION
 public.get_training_context(jsonb), public.get_training_history(jsonb),
 public.get_training_request(jsonb), public.propose_training_revision(jsonb),
 public.activate_training_revision(jsonb), public.set_training_lifecycle(jsonb),
 public.record_training_decision(jsonb), public.materialize_training_session(jsonb),
 public.mutate_training_workout(jsonb)
FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
```

Re-run the function privilege SELECT: all application EXECUTE columns must now be false; inherited grants must not bypass the breaker. Do not claim it worked merely because REVOKE returned success. History is retained for authorized administrator access but application planning reads are unavailable while disabled.

Exact restoration to **migration 004's documented baseline only**, after reviewing current objects/security and confirming services are the guarded version:

<!-- runbook-sql: restore-rpcs -->
```sql
BEGIN;
GRANT EXECUTE ON FUNCTION
 public.get_training_context(jsonb), public.get_training_history(jsonb),
 public.get_training_request(jsonb), public.propose_training_revision(jsonb),
 public.activate_training_revision(jsonb), public.set_training_lifecycle(jsonb),
 public.record_training_decision(jsonb), public.materialize_training_session(jsonb),
 public.mutate_training_workout(jsonb)
TO authenticated, service_role;
COMMIT;
```

Verify the entire final privilege matrix again. PUBLIC/anon and helpers must remain denied. If the installation had later intentional ACL differences, these statements are not an exact restoration of that custom state: stop and use its separately approved saved ACL procedure. Restoring RPC permission does not resume a paused plan or activate any revision; those remain authenticated owner actions.

## Completion record

A release record must distinguish: repository SQL reviewed; disposable runbook/core/native test outcomes (including failures); isolated Supabase/JWT/PostgREST rehearsal results; backup/restore evidence; actual manually committed IDs; owner setup readback; old-service retirement; and authenticated plan activation, if ever separately requested. A repository build, a source inventory or this document is not evidence that any live step occurred. This refresh changes only this runbook and its saved disposable test; the manual owner template remains unapplied to Supabase. **No deployment, live owner provisioning or plan activation, live inspection, service/config change, or production write was performed.**

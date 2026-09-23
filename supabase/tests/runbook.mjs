// Run: node supabase/tests/runbook.mjs
// Disposable, in-memory PostgreSQL only; no env, connection strings or network.
// This validates the runbook's actual fenced SQL, not copies of its statements.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../../', import.meta.url);
const source = path => readFile(new URL(path, root), 'utf8');
const runbook = await source('docs/training-planning/SQL-RUNBOOK.md');
const ownerTemplate = await source('supabase/setup-training-owner.sql');
const blockNames = ['preflight-role', 'preflight-schema', 'preflight-conflicts', 'postmigration', 'disable-rpcs', 'restore-rpcs'];
const matches = [...runbook.matchAll(/<!-- runbook-sql: ([a-z-]+) -->\s*```sql\n([\s\S]*?)\n```/g)];
assert.deepEqual(matches.map(m => m[1]), blockNames, 'every required runbook block must have a stable test label');
assert.equal(matches.length, [...runbook.matchAll(/^```sql\s*$/gm)].length, 'no SQL fence may be silently skipped');
const blocks = Object.fromEntries(matches.map(m => [m[1], m[2]]));
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const planning = ['training_plan_state', 'training_plan_revisions', 'training_session_contexts', 'training_plan_events'];
const publicRPCs = ['get_training_context', 'get_training_history', 'get_training_request', 'propose_training_revision', 'activate_training_revision', 'set_training_lifecycle', 'record_training_decision', 'materialize_training_session', 'mutate_training_workout'];
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const scalar = async (sql, params = []) => Object.values((await query(sql, params))[0])[0];
let checks = 0;
const executions = [];
function check(condition, label) { assert.ok(condition, label); console.log(`ok ${++checks} - ${label}`); }
function equal(actual, expected, label) { assert.deepEqual(actual, expected, label); console.log(`ok ${++checks} - ${label}`); }
async function rejectSQL(sql, pattern, label) {
  try { await assert.rejects(() => db.exec(sql), pattern); }
  finally { await db.exec('ROLLBACK'); }
  console.log(`ok ${++checks} - ${label}`);
}
async function block(name, readOnly = true) {
  let result;
  try {
    if (readOnly) await db.exec('BEGIN READ ONLY');
    result = await db.exec(blocks[name]);
  } finally { if (readOnly) await db.exec('ROLLBACK'); }
  const selects = result.filter(r => r.fields.length > 0);
  const summary = { name, selects: selects.length, rows: selects.map(r => r.rows.length) };
  executions.push(summary);
  console.log(`SQL ${JSON.stringify(summary)}`);
  check(result.length > 0, `${name}: actual fenced SQL executes${readOnly ? ' in a read-only transaction' : ''}`);
  return selects;
}
function rowsWith(results, column) {
  const matching = results.filter(r => r.fields.some(f => f.name === column));
  assert.equal(matching.length, 1, `one result set containing ${column}`);
  return matching[0].rows;
}
const counts = () => scalar(`SELECT jsonb_build_object(
  'state',(SELECT count(*) FROM training_plan_state),
  'revisions',(SELECT count(*) FROM training_plan_revisions),
  'sessions',(SELECT count(*) FROM training_session_contexts),
  'events',(SELECT count(*) FROM training_plan_events),
  'links',(SELECT count(*) FROM sets WHERE training_session_id IS NOT NULL))`);
const empty = { state: 0, revisions: 0, sessions: 0, events: 0, links: 0 };
const functions = () => query(`SELECT p.proname, p.oid::regprocedure::text AS signature,
  pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service,
  EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname ~ '^training_' OR p.proname=ANY($1::text[]))
  ORDER BY p.proname,signature`, [publicRPCs]);
async function sealedTables() {
  const rows = await query(`SELECT c.relname,c.relrowsecurity,
    NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')
      AND (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) AS sealed
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])`, [planning]);
  return rows.length === planning.length && rows.every(r => r.relrowsecurity && r.sealed);
}
function template(uuid = owner, zone = 'America/Montreal', confirmed = true) {
  assert.match(uuid, /^[a-zA-Z0-9{} -]+$/); // Synthetic literal substitution, never user input.
  assert.match(zone, /^[a-zA-Z_/]+$/);
  return ownerTemplate.replace("owner_uuid_text constant text := 'REPLACE_WITH_AUTH_USERS_UUID'", `owner_uuid_text constant text := '${uuid}'`)
    .replace("athlete_zone constant text := 'America/Montreal'", `athlete_zone constant text := '${zone}'`)
    .replace('zone_confirmed constant boolean := false', `zone_confirmed constant boolean := ${confirmed}`);
}

try {
  console.log(`ENGINE ${await scalar('SELECT version()')}`);
  // Native multi-connection/real-login coverage lives in tests/native-training.mts.
  // Here SET ROLE proves the SQL blocks work for a non-superuser schema owner.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE runbook_schema_admin NOSUPERUSER NOBYPASSRLS CREATEROLE;
    GRANT CREATE ON DATABASE postgres TO runbook_schema_admin;
    ALTER SCHEMA public OWNER TO runbook_schema_admin;
    SET ROLE runbook_schema_admin;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${owner}');`);
  equal(await scalar('SELECT rolsuper FROM pg_roles WHERE rolname=current_user'), false, 'fixture migrator is not superuser');
  const bootstrap = await source('supabase/schema.sql');
  // PGlite fixture omits only the unrelated trailing pg_trgm search section.
  assert.ok(bootstrap.includes('-- Fuzzy duplicate detection'));
  await db.exec(bootstrap.split('-- Fuzzy duplicate detection')[0]);
  await db.exec(`GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
    GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated,service_role;
    INSERT INTO sets(exercise_id,reps) SELECT id,5 FROM exercises ORDER BY id LIMIT 1;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;`);
  const legacySet = await query('SELECT to_jsonb(s) AS row FROM sets s ORDER BY id');
  const preRole = await block('preflight-role');
  check(rowsWith(preRole, 'rolname').every(r => r.rolname !== 'training_rpc_owner'), 'preflight sees no reserved owner role');
  const preSchema = await block('preflight-schema');
  const relations = rowsWith(preSchema, 'actual_relation');
  check(relations.length === 8 && relations.every(r => r.actual_relation !== null), 'preflight resolves all eight required relations');
  const preConflicts = await block('preflight-conflicts');
  equal(rowsWith(preConflicts, 'signature'), [], 'reserved function inventory starts empty');
  equal(rowsWith(preConflicts, 'column_name'), [], 'legacy set link column starts absent');
  const migrationFiles = (await readdir(new URL('supabase/migrations/', root))).filter(f => f.endsWith('.sql')).sort();
  equal(migrationFiles.map(f => f.slice(0, 12)), ['202609220001', '202609220002', '202609220003', '202609220004'], 'exact four once-only migrations in filename order');
  for (const [index, file] of migrationFiles.entries()) {
    const sql = await source(`supabase/migrations/${file}`);
    console.log(`SOURCE ${file} ${createHash('sha256').update(sql).digest('hex')}`);
    await db.exec(sql);
    check(await sealedTables(), `${file}: four RLS tables deny application table and column access at COMMIT`);
    const fs = await functions();
    if (index < 3) check(fs.length > 0 && fs.every(f => !f.public && !f.anon && !f.authenticated && !f.service), `${file}: all feature functions sealed at COMMIT despite permissive fixture defaults`);
  }
  const post = await block('postmigration');
  check(rowsWith(post, 'required_signature').length === 9 && rowsWith(post, 'required_signature').every(r => r.required_signature), 'postcheck resolves nine exact public signatures');
  const fs = await functions();
  equal(fs.filter(f => publicRPCs.includes(f.proname)).map(f => f.proname).sort(), [...publicRPCs].sort(), 'nine public RPCs, no untested overloads');
  check(fs.every(f => f.owner === 'training_rpc_owner' && f.proconfig.includes('search_path=pg_catalog, public') && !f.anon && !f.public && f.authenticated === publicRPCs.includes(f.proname) && f.service === publicRPCs.includes(f.proname)), 'all feature owners, paths and effective EXECUTE grants match baseline');
  check(fs.filter(f => publicRPCs.includes(f.proname)).every(f => f.prosecdef), 'all public RPCs are SECURITY DEFINER');
  const restricted = rowsWith(post, 'public_create');
  check(restricted.length === 1 && restricted[0].public_usage && !restricted[0].public_create && ['rolsuper', 'rolcanlogin', 'rolcreatedb', 'rolcreaterole', 'rolinherit', 'rolbypassrls'].every(k => !restricted[0][k]), 'restricted owner flags and effective schema access match baseline');
  equal(rowsWith(post, 'reachable_role'), [], 'no application membership path to restricted owner');
  equal(rowsWith(post, 'attname').filter(r => r.update_allowed).map(r => r.attname), ['training_session_id'], 'restricted owner can update only the set link column');
  const policies = rowsWith(post, 'policyname');
  check(policies.length === 11 && policies.every(p => p.roles.length === 1 && p.roles[0] === 'training_rpc_owner'), 'eleven feature policies target only restricted owner');
  equal(await counts(), empty, 'migrations leave state, history and links empty');
  console.log(`COUNTS postmigration ${JSON.stringify(await counts())}`);
  equal(await query("SELECT to_jsonb(s)-'training_session_id' AS row FROM sets s ORDER BY id"), legacySet, 'migrations preserve synthetic legacy set values');

  const invalid = [
    ['untouched owner template', ownerTemplate, /supply the exact confirmed/],
    ['malformed UUID', template('not-a-uuid'), /supply the exact confirmed/],
    ['UUID braces are not normalized', template(`{${owner}}`), /supply the exact confirmed/],
    ['nil UUID', template('00000000-0000-0000-0000-000000000000'), /supply the exact confirmed/],
    ['unknown Auth UUID', template('22222222-2222-4222-8222-222222222222'), /does not exist in auth.users/],
    ['unconfirmed timezone', template(owner, 'America/Montreal', false), /explicitly confirm/],
    ['invalid timezone', template(owner, 'Invalid/Nowhere'), /explicitly confirm/],
  ];
  for (const [label, sql, error] of invalid) {
    await rejectSQL(sql, error, `${label} fails closed`);
    equal(await counts(), empty, `${label} leaves no planning data`);
  }
  const provision = await db.exec(template());
  equal(rowsWith(provision, 'owner_user_id'), [{ id: 1, owner_user_id: owner, athlete_timezone: 'America/Montreal', lifecycle: 'inactive', active_revision_id: null, state_version: 0, evidence_version: 0 }], 'exact owner-template readback: inactive singleton, no authority or versions');
  equal(rowsWith(provision, 'revision_count'), [{ revision_count: 0, session_count: 0, event_count: 0, linked_set_count: 0 }], 'owner-template history/link SELECT returns four zero counts');
  equal(await counts(), { ...empty, state: 1 }, 'valid template creates only the singleton');
  console.log(`COUNTS provisioned ${JSON.stringify(await counts())}`);
  const singleton = await query('SELECT * FROM training_plan_state');
  await rejectSQL(template(), /OWNER_SETUP_REFUSED/, 'second setup refuses overwrite');
  equal(await query('SELECT * FROM training_plan_state'), singleton, 'refused setup preserves exact singleton');

  await block('disable-rpcs', false);
  check((await functions()).every(f => !f.public && !f.anon && !f.authenticated && !f.service), 'circuit breaker actually denies all RPC/helper application execution');
  await db.exec('SET ROLE authenticated');
  await rejectSQL("SELECT get_training_context('{}')", /permission denied/, 'disabled RPC invocation is denied, not just absent from explicit ACL');
  await db.exec('RESET ROLE; SET ROLE runbook_schema_admin');
  equal(await counts(), { ...empty, state: 1 }, 'breaker leaves state/history/links intact');
  await db.exec('SET ROLE authenticated; BEGIN; INSERT INTO sets(exercise_id,reps) SELECT id,6 FROM exercises ORDER BY id LIMIT 1; RESET ROLE; SET ROLE runbook_schema_admin');
  equal(await scalar('SELECT evidence_version FROM training_plan_state'), 1, 'ordinary unlinked logging and evidence trigger work while RPCs are disabled');
  await db.exec('ROLLBACK; RESET ROLE; SET ROLE runbook_schema_admin');
  equal(await query('SELECT * FROM training_plan_state'), singleton, 'disposable logger probe rollback restores exact state');
  equal(await counts(), { ...empty, state: 1 }, 'probe rollback removes raw-write provenance without deleting history');
  await block('restore-rpcs', false);
  equal(await functions(), fs, 'restore exactly recovers full feature function privilege baseline');
  check(await sealedTables(), 'restoration never reopens planning tables');
  equal(await query("SELECT to_jsonb(s)-'training_session_id' AS row FROM sets s ORDER BY id"), legacySet, 'provisioning and breaker preserve legacy rows');
  await db.exec('SET ROLE authenticated');
  await query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: owner })]);
  equal((await scalar("SELECT get_training_context('{}')")).status, 'inactive', 'restored owner RPC works without activating a plan');
  await db.exec('RESET ROLE; SET ROLE runbook_schema_admin');
  const beforeEvidence = await scalar('SELECT evidence_version FROM training_plan_state');
  await db.exec('SET ROLE authenticated; INSERT INTO sets(exercise_id,reps) SELECT id,6 FROM exercises ORDER BY id LIMIT 1; RESET ROLE; SET ROLE runbook_schema_admin');
  equal(await scalar('SELECT evidence_version FROM training_plan_state'), beforeEvidence + 1, 'ordinary unlinked logging still advances evidence after restoration');
  equal(await counts(), { ...empty, state: 1, events: 1 }, 'legacy logging adds only one classification provenance event, no revision/session/link');
  equal(await query('SELECT kind,actor FROM training_plan_events'), [{ kind: 'load_classification', actor: 'system' }], 'raw evidence provenance is not a prescription or owner action');
  equal(executions.map(e => e.name), blockNames, 'every fenced SQL block was executed once');
  console.log(`PASS ${checks} runbook checks; ${executions.length} SQL blocks; ${executions.reduce((n, e) => n + e.selects, 0)} SELECT result sets; synthetic PGlite only`);
} finally {
  await db.close();
  console.log('CLEANUP in-memory PGlite closed; no listener or database directory created');
}

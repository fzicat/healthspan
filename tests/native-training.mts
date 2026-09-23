// Real, disposable native PostgreSQL: no dotenv, live database, or Supabase service.
// Run: node --import tsx tests/native-training.mts
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';
import { nativeDirection, nativeOther, nativeOwner } from './support/native-training-fixture.mts';

// JSON RPC result types intentionally reflect SQL's dynamic JSON objects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
type Outcome = { ok: true; value: Json } | { ok: false; message: string; code: string };
const root = resolve(import.meta.dirname, '..');
const testRoot = resolve(root, '.training-test');
const dataDir = resolve(testRoot, 'native-postgres');
const lockDir = resolve(testRoot, 'native-run.lock');
const tempDir = resolve(testRoot, 'native-temp');
const evidenceDir = resolve(testRoot, 'evidence');
const logPath = resolve(evidenceDir, 'native-postgres.log');
const reportPath = resolve(evidenceDir, 'native-postgres.json');
const results: { name: string; passed: boolean; detail?: string }[] = [];
const clients: Client[] = [];
const pids = new Set<number>();
const log = (line: string) => { appendFileSync(logPath, `${line.trimEnd()}\n`); };
const info = (line: string) => { console.log(line); log(line); };
const scalar = async (c: Client, sql: string, values: unknown[] = []): Promise<Json> => Object.values((await c.query(sql, values)).rows[0])[0];
const rpc = (c: Client, name: string, payload: Json = {}) => {
  assert.match(name, /^[a-z_]+$/);
  return scalar(c, `SELECT public.${name}($1::jsonb)`, [JSON.stringify(payload)]);
};
const context = (c: Client) => rpc(c, 'get_training_context');
const request = (c: Json, body: Json) => ({ ...body, expected_state_version: c.versions.state, expected_evidence_version: c.versions.evidence, request_id: randomUUID() });
const settle = async (p: Promise<Json>): Promise<Outcome> => {
  try { return { ok: true, value: await p }; }
  catch (e) { const error = e as Error & { code?: string }; return { ok: false, message: error.message, code: error.code || '' }; }
};
const deny = async (p: Promise<Json>, pattern: RegExp) => {
  const out = await settle(p); assert.equal(out.ok, false, 'operation must reject');
  if (!out.ok) assert.match(out.message, pattern);
};
const must = (out: Outcome): Json => { assert.equal(out.ok, true, JSON.stringify(out)); return out.ok ? out.value : undefined; };
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, passed: true }); info(`ok ${results.length} - ${name}`); }
  catch (e) { const detail = e instanceof Error ? e.stack || e.message : String(e); results.push({ name, passed: false, detail }); info(`not ok ${results.length} - ${name}\n${detail}`); }
  finally { for (const c of clients) await c.query('ROLLBACK').catch(() => {}); }
}
async function freePort() {
  const server = createServer();
  await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  await new Promise<void>((ok, fail) => server.close(e => e ? fail(e) : ok()));
  return address.port;
}
async function portClosed(port: number) {
  const server = createServer();
  await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  await new Promise<void>(ok => server.close(() => ok()));
}
function isAlive(pid: number) { try { process.kill(pid, 0); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ESRCH') return false; throw e; } }

await mkdir(testRoot, { recursive: true });
await mkdir(lockDir); // Refuse overlapping runs rather than touching another cluster.
await mkdir(evidenceDir, { recursive: true });
await writeFile(logPath, 'Native disposable PostgreSQL evidence (synthetic data only)\n');
const startedAt = new Date().toISOString();
const sourceHashes: { file: string; sha256: string }[] = [];
let port = 0, serverVersion = '', closed = false, ownedData = false, ownedTemp = false;
let pg: import('embedded-postgres').default | undefined;
let startupError: string | undefined;
const previousTmp = process.env.TMPDIR;
const oldUmask = process.umask(0o077);
try {
  assert.notEqual(process.getuid?.(), 0, 'Do not run as root or create a system account');
  await assert.rejects(access(dataDir), { code: 'ENOENT' });
  await mkdir(tempDir); // Do not reuse or remove any pre-existing temporary files.
  ownedTemp = true;
  process.env.TMPDIR = tempDir; // embedded-postgres removes its transient initdb password file.
  const require = createRequire(import.meta.url);
  const binaries = dirname(dirname(require.resolve(`@embedded-postgres/${process.platform}-${process.arch}`)));
  // npm --ignore-scripts skips required bundled-library symlinks. Rehydrate ONLY
  // the documented, package-local postinstall; never install system libraries.
  const hydration = spawnSync(process.execPath, ['scripts/hydrate-symlinks.js'], { cwd: binaries, encoding: 'utf8' });
  assert.equal(hydration.status, 0, hydration.stderr);
  const binaryVersion = spawnSync(resolve(binaries, 'native/bin/postgres'), ['--version'], { encoding: 'utf8' });
  assert.equal(binaryVersion.status, 0, binaryVersion.stderr);
  info(binaryVersion.stdout.trim());
  const EmbeddedPostgres = (await import('embedded-postgres')).default;
  port = await freePort();
  const password = randomBytes(32).toString('hex');
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'native_admin', password, port, persistent: false,
    authMethod: 'scram-sha-256', createPostgresUser: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1', '-k', '', '-c', 'deadlock_timeout=300ms', '-c', 'log_lock_waits=on', '-c', 'log_min_error_statement=panic'],
    onLog: message => log(String(message)), onError: message => log(String(message)),
  });
  ownedData = true;
  await pg.initialise();
  await pg.start();
  pids.add(Number((await readFile(resolve(dataDir, 'postmaster.pid'), 'utf8')).split('\n')[0]));
  info(`START ${startedAt}; loopback 127.0.0.1:${port}`);
  async function connect(user: string, database = 'native_training') {
    const c = new Client({ host: '127.0.0.1', port, user, password, database, ssl: false, connectionTimeoutMillis: 5000, application_name: `native-training:${user}`, options: '-c statement_timeout=10000 -c lock_timeout=8000 -c idle_in_transaction_session_timeout=15000' });
    c.on('error', error => log(`client error: ${error.message}`));
    await c.connect(); clients.push(c); pids.add(Number(await scalar(c, 'SELECT pg_backend_pid()'))); return c;
  }
  const bootstrap = await connect('native_admin', 'postgres');
  serverVersion = await scalar(bootstrap, 'SELECT version()');
  // Test a non-superuser migration administrator with real CREATEROLE behavior.
  // Native superuser creates only the platform scaffolding supplied by Supabase.
  const literal = bootstrap.escapeLiteral(password);
  await bootstrap.query(`CREATE ROLE native_schema_admin LOGIN NOSUPERUSER NOBYPASSRLS CREATEROLE PASSWORD ${literal};
    CREATE ROLE anon LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD ${literal};
    CREATE ROLE authenticated LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD ${literal};
    CREATE ROLE service_role LOGIN NOSUPERUSER BYPASSRLS NOINHERIT PASSWORD ${literal};`);
  await bootstrap.query('CREATE DATABASE native_training OWNER native_schema_admin');
  const admin = await connect('native_admin');
  const migrationAdmin = await connect('native_schema_admin');
  await migrationAdmin.query(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('${nativeOwner}'),('${nativeOther}');`);
  const files = ['supabase/schema.sql', ...(await readdir(resolve(root, 'supabase/migrations'))).filter(f => f.endsWith('.sql')).sort().map(f => `supabase/migrations/${f}`)];
  const sources = await Promise.all(files.map(async file => {
    const sql = await readFile(resolve(root, file), 'utf8');
    return { file, sql };
  }));
  assert.equal(sources.length, 5, 'bootstrap plus four actual migrations');
  sourceHashes.push(...sources.map(({ file, sql }) => ({ file, sha256: createHash('sha256').update(sql).digest('hex') })));
  for (const s of sourceHashes) info(`SOURCE ${s.file} ${s.sha256}`);
  await migrationAdmin.query(sources[0].sql); // Full legacy bootstrap, including native pg_trgm.
  await migrationAdmin.query('GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated,service_role;');
  await test('restricted non-superuser schema administrator applies all four real migrations', async () => {
    assert.equal(await scalar(migrationAdmin, "SELECT rolsuper FROM pg_roles WHERE rolname=current_user"), false);
    for (const source of sources.slice(1)) {
      try { await migrationAdmin.query(source.sql); }
      catch (e) {
        await migrationAdmin.query('ROLLBACK');
        // Keep exercising concurrency, but retain the migration failure as a
        // failing test; this fallback is explicit in the evidence, never green.
        info(`MIGRATION BLOCKER ${source.file}: ${(e as Error).message}; applying remaining SQL as disposable native superuser for independent tests`);
        await admin.query(source.sql);
        for (const later of sources.slice(sources.indexOf(source) + 1)) await admin.query(later.sql);
        throw e;
      }
    }
  });
  await admin.query(await readFile(resolve(root, 'supabase/tests/training-planning.sql'), 'utf8'));
  const a = await connect('authenticated'), b = await connect('authenticated');
  const other = await connect('authenticated'), anon = await connect('anon'), coach = await connect('service_role');
  async function claims(c: Client, role: 'authenticated' | 'anon' | 'service_role', sub: string | undefined = nativeOwner, claimRole: string = role) {
    await c.query(`SET ROLE ${role}`);
    await c.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: claimRole, sub })]);
  }
  async function standardClaims() { await Promise.all([claims(a, 'authenticated'), claims(b, 'authenticated'), claims(other, 'authenticated', nativeOther), claims(anon, 'anon'), claims(coach, 'service_role', undefined)]); }
  await standardClaims();
  const exercise = Number(await scalar(admin, "INSERT INTO exercises(name,category) VALUES ('Synthetic native squat','strength') RETURNING id"));
  const today = await scalar(admin, "SELECT (clock_timestamp() AT TIME ZONE 'America/Montreal')::date::text");
  const date = (n: number): Promise<string> => scalar(admin, 'SELECT ($1::date+$2::int)::text', [today, n]);
  const content = nativeDirection(exercise, { start: await date(-20), end: await date(30) });
  const mutate = async (c: Client, name: string, body: Json) => rpc(c, name, request(await context(c), body));
  async function fixture() {
    await standardClaims();
    await admin.query('TRUNCATE training_plan_events,training_session_contexts,training_plan_revisions,training_plan_state,sets,workouts_exercises,workouts,daily_logs,cardio_sessions,breathwork_sessions CASCADE');
    await admin.query("INSERT INTO training_plan_state(id,owner_user_id,athlete_timezone) VALUES (1,$1,'America/Montreal')", [nativeOwner]);
    const revision = (await mutate(a, 'propose_training_revision', { content })).revision_id;
    await mutate(a, 'activate_training_revision', { revision_id: revision, seed_slot_key: 'alpha', pending_intent_action: 'retain' });
    return revision;
  }
  const strength = () => ({ target_date: today, activity_kind: 'strength', slot_key: 'alpha', reason: 'Synthetic concurrent materialization', revisit_on: today });
  const rest = (day: string) => ({ target_date: day, activity_kind: 'rest', reason: 'Synthetic recovery fixture', revisit_on: day });
  const counts = () => scalar(admin, `SELECT jsonb_build_object('sessions',(SELECT count(*) FROM training_session_contexts),'workouts',(SELECT count(*) FROM workouts),'exercises',(SELECT count(*) FROM workouts_exercises),'receipts',(SELECT count(*) FROM training_plan_events WHERE kind='mutation_receipt'),'events',(SELECT count(*) FROM training_plan_events),'state',state_version,'evidence',evidence_version) FROM training_plan_state WHERE id=1`);
  const receiptCount = (id: string) => scalar(admin, 'SELECT count(*)::int FROM training_plan_events WHERE request_id=$1', [id]);
  async function waitBlocked(cs: Client[]) {
    const targetPids = await Promise.all(cs.map(c => pidFor(c)));
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = (await admin.query('SELECT pid,pg_blocking_pids(pid) AS blockers,wait_event_type,wait_event FROM pg_stat_activity WHERE pid=ANY($1::int[])', [targetPids])).rows;
      if (rows.length === cs.length && rows.every(r => r.wait_event_type === 'Lock' && r.blockers.length > 0)) {
        info(`BARRIER ${JSON.stringify(rows)}`); return;
      }
      await delay(10);
    }
    throw new Error(`Expected real lock waits for backend PIDs ${targetPids.join(',')}`);
  }
  const clientPids = new Map<Client, number>();
  for (const c of [a, b, other, anon, coach]) clientPids.set(c, Number(await scalar(c, 'SELECT pg_backend_pid()')));
  async function pidFor(c: Client) { const pid = clientPids.get(c); assert.ok(pid); return pid; }
  async function race(nameA: string, payloadA: Json, nameB: string, payloadB: Json, first: 0 | 1 = 0): Promise<Outcome[]> {
    // A third connection holds the singleton while BOTH actual server backends
    // enter their RPCs. Observed pg_stat_activity waits, not sleeps, prove overlap.
    await migrationAdmin.query('BEGIN; SELECT 1 FROM training_plan_state WHERE id=1 FOR UPDATE');
    const jobs: Promise<Outcome>[] = [];
    const connections = [a, b], names = [nameA, nameB], payloads = [payloadA, payloadB];
    try {
      jobs[first] = settle(rpc(connections[first], names[first], payloads[first]));
      await waitBlocked([connections[first]]);
      const second = first === 0 ? 1 : 0;
      jobs[second] = settle(rpc(connections[second], names[second], payloads[second]));
      await waitBlocked([a, b]);
    }
    finally { await migrationAdmin.query('COMMIT'); }
    return Promise.all(jobs);
  }
  function oneConflict(outcomes: Outcome[]) {
    assert.equal(outcomes.filter(o => o.ok).length, 1, JSON.stringify(outcomes));
    const conflict = outcomes.find(o => !o.ok); assert.ok(conflict && !conflict.ok); assert.match(conflict.message, /VERSION_CONFLICT/);
    return outcomes.findIndex(o => o.ok);
  }
  async function pending() {
    const session = await mutate(a, 'materialize_training_session', strength());
    const set = Number(await scalar(b, "INSERT INTO sets(exercise_id,reps,rir,training_session_id,logged_at) VALUES($1,5,2,$2,($3::date+time '12:00') AT TIME ZONE 'America/Montreal') RETURNING id", [exercise, session.session_id, today]));
    return { ...session, set };
  }

  await test('A20/A32 simultaneous identical request: one receipt/session/workout/prescription', async () => {
    await fixture(); const before = await counts(); const p = request(await context(a), strength());
    const out = await race('materialize_training_session', p, 'materialize_training_session', p);
    assert.deepEqual(must(out[0]), must(out[1]));
    const after = await counts(); assert.equal(after.sessions - before.sessions, 1); assert.equal(after.workouts - before.workouts, 1); assert.equal(after.exercises - before.exercises, 1); assert.equal(after.receipts - before.receipts, 1); assert.equal(after.state - before.state, 1); assert.equal(await receiptCount(p.request_id), 1);
    assert.deepEqual(await rpc(a, 'get_training_request', { operation: 'materialize_training_session', request_id: p.request_id, payload: p }), must(out[0]));
    await deny(rpc(b, 'materialize_training_session', { ...p, reason: 'changed payload' }), /IDEMPOTENCY_CONFLICT/);
    assert.deepEqual(await counts(), after);
  });
  await test('A20/A32 distinct concurrent keys on one expected version: one commit, one VERSION_CONFLICT', async () => {
    await fixture(); const c = await context(a), before = await counts();
    const p = request(c, strength()), q = request(c, strength());
    oneConflict(await race('materialize_training_session', p, 'materialize_training_session', q));
    const after = await counts(); assert.equal(after.sessions - before.sessions, 1); assert.equal(after.workouts - before.workouts, 1); assert.equal(after.exercises - before.exercises, 1); assert.equal(after.receipts - before.receipts, 1); assert.equal(after.state - before.state, 1);
    assert.equal(await receiptCount(p.request_id) + await receiptCount(q.request_id), 1);
  });
  for (const first of [0, 1] as const) await test(`activation versus materialization (first=${first}): no partial authority/intent`, async () => {
    const old = await fixture();
    const next = (await mutate(a, 'propose_training_revision', { content })).revision_id;
    const c = await context(a), before = await counts();
    const p = request(c, { revision_id: next, seed_slot_key: 'beta', pending_intent_action: 'cancel' }), q = request(c, strength());
    const winner = oneConflict(await race('activate_training_revision', p, 'materialize_training_session', q, first));
    assert.equal(winner, first, 'both lock acquisition orders exercised deterministically');
    const after = await counts(), now = await context(a);
    assert.equal(after.state - before.state, 1); assert.equal(after.receipts - before.receipts, 1);
    assert.equal(now.authority.revision_id, winner === 0 ? next : old);
    assert.equal(after.sessions - before.sessions, winner === 0 ? 0 : 1); assert.equal(after.workouts - before.workouts, winner === 0 ? 0 : 1);
    assert.equal(now.queue.qualifying_exposures, 0); assert.equal(await receiptCount((winner === 0 ? q : p).request_id), 0);
  });
  for (const first of [0, 1] as const) await test(`activation versus qualifying reconciliation (first=${first}): no double credit`, async () => {
    const old = await fixture(), s = await pending();
    // Seed owner evidence; a subsequent context read may auto-reconcile it.
    // The race still verifies one committed public mutation against one version.
    await admin.query("SELECT training_event('clarify_session',$1,$2,$3::jsonb,$4)", [old, s.session_id, JSON.stringify({ set_ids: [s.set] }), `owner:${nativeOwner}`]);
    const next = (await mutate(a, 'propose_training_revision', { content })).revision_id;
    const c = await context(a), before = await counts();
    const reconcilesBefore = await scalar(admin, "SELECT count(*)::int FROM training_plan_events WHERE session_id=$1 AND kind='reconcile'", [s.session_id]);
    const p = request(c, { revision_id: next, seed_slot_key: 'beta', pending_intent_action: 'retain' }), q = request(c, { kind: 'reconcile', session_id: s.session_id, outcome: 'finished' });
    const winner = oneConflict(await race('activate_training_revision', p, 'record_training_decision', q, first));
    assert.equal(winner, first, 'both lock acquisition orders exercised deterministically');
    assert.equal((await counts()).receipts - before.receipts, 1);
    assert.equal(await scalar(admin, "SELECT count(*)::int FROM training_plan_events WHERE session_id=$1 AND kind='reconcile'", [s.session_id]), reconcilesBefore + (winner === 1 ? 1 : 0));
    const now = await context(a); assert.equal(now.authority.revision_id, winner === 0 ? next : old); assert.equal(now.queue.qualifying_exposures, winner === 1 ? 1 : 0);
    await mutate(a, 'record_training_decision', { kind: 'reconcile', session_id: s.session_id });
    assert.equal((await context(a)).queue.qualifying_exposures, winner === 1 ? 1 : 0);
    assert.equal(await scalar(admin, 'SELECT count(*)::int FROM sets WHERE id=$1 AND training_session_id=$2', [s.set, s.session_id]), 1);
  });
  await test('concurrent same-occurrence reconciliations advance exactly once, including fresh retry', async () => {
    const revision = await fixture(), s = await pending();
    await admin.query("SELECT training_event('clarify_session',$1,$2,$3::jsonb,$4)", [revision, s.session_id, JSON.stringify({ set_ids: [s.set] }), `owner:${nativeOwner}`]);
    const c = await context(a), body = { kind: 'reconcile', session_id: s.session_id, outcome: 'partial' };
    oneConflict(await race('record_training_decision', request(c, body), 'record_training_decision', request(c, body)));
    await mutate(b, 'record_training_decision', body);
    const now = await context(a); assert.equal(now.queue.qualifying_exposures, 1); assert.equal(now.queue.next_slot_key, 'beta');
  });
  await test('raw evidence committed after context: stale mutation rejects without partial intent', async () => {
    await fixture(); const c = await context(a), before = await counts(); const p = request(c, rest(await date(1)));
    await b.query('BEGIN'); await b.query('INSERT INTO sets(exercise_id,reps,rir) VALUES($1,5,2)', [exercise]); await b.query('COMMIT');
    const afterRaw = await counts(); // Provenance event belongs to the raw write, not rejected prescription.
    await deny(rpc(a, 'materialize_training_session', p), /VERSION_CONFLICT/);
    const after = await counts(); assert.equal(after.evidence, before.evidence + 1); assert.equal(after.state, before.state); assert.equal(after.sessions, before.sessions); assert.equal(after.events, afterRaw.events); assert.equal(after.receipts, before.receipts); assert.equal(await receiptCount(p.request_id), 0);
    assert.equal((await context(a)).evidence.unlinked_sets.length, 1);
  });
  await test('evidence triggers serialize concurrent raw writers; rollback restores version and raw row', async () => {
    await fixture(); const before = await counts();
    await a.query('BEGIN'); await a.query('INSERT INTO sets(exercise_id,reps) VALUES($1,5)', [exercise]);
    const second = settle(b.query('INSERT INTO daily_logs(date,steps) VALUES($1,123)', [today]));
    try { await waitBlocked([b]); } finally { await a.query('COMMIT'); }
    must(await second); assert.equal((await counts()).evidence, before.evidence + 2);
    await b.query('BEGIN'); await b.query('INSERT INTO sets(exercise_id,reps) VALUES($1,99)', [exercise]); await b.query('ROLLBACK');
    assert.equal((await counts()).evidence, before.evidence + 2); assert.equal(await scalar(admin, 'SELECT count(*)::int FROM sets'), 1);
  });
  await test('all seven legacy evidence sources increment versions on INSERT/UPDATE/DELETE', async () => {
    await fixture(); const base = (await counts()).evidence;
    const extra = Number(await scalar(b, "INSERT INTO exercises(name,category) VALUES('Native disposable evidence probe','strength') RETURNING id"));
    const set = await scalar(b, 'INSERT INTO sets(exercise_id,reps) VALUES($1,5) RETURNING id', [extra]);
    const w = await scalar(b, 'INSERT INTO workouts(date) VALUES($1) RETURNING id', [today]);
    const we = await scalar(b, 'INSERT INTO workouts_exercises(workout_id,exercise_id) VALUES($1,$2) RETURNING id', [w, extra]);
    await b.query('INSERT INTO daily_logs(date,steps) VALUES($1,10)', [today]);
    const cardio = await scalar(b, "INSERT INTO cardio_sessions(exercise_id,date,duration_minutes) SELECT id,$1,20 FROM exercises WHERE name='Zone 2' RETURNING id", [today]);
    const breath = await scalar(b, 'INSERT INTO breathwork_sessions(date,duration_minutes) VALUES($1,5) RETURNING id', [today]);
    assert.equal((await counts()).evidence, base + 7);
    for (const [table, column, id] of [['exercises','id',extra],['sets','id',set],['workouts','id',w],['workouts_exercises','id',we],['daily_logs','date',today],['cardio_sessions','id',cardio],['breathwork_sessions','id',breath]]) await b.query(`UPDATE ${table} SET ${column}=${column} WHERE ${column}=$1`, [id]);
    assert.equal((await counts()).evidence, base + 14);
    // Parent rows come last to avoid cascading deletes adding extra statements.
    for (const [table, column, id] of [['workouts_exercises','id',we],['sets','id',set],['workouts','id',w],['daily_logs','date',today],['cardio_sessions','id',cardio],['breathwork_sessions','id',breath],['exercises','id',extra]]) {
      const previous = (await counts()).evidence;
      await b.query(`DELETE FROM ${table} WHERE ${column}=$1`, [id]);
      assert.ok((await counts()).evidence > previous, `${table} delete must advance evidence`);
    }
    assert.ok((await counts()).evidence >= base + 21, 'all deletes observed, including FK cascade statements');
  });
  await test('real lock inversion deadlock: 40P01 rollback, context refresh/retry, no partial or double credit', async () => {
    await fixture(); const s = await pending(), c = await context(a), before = await counts();
    const body = { kind: 'clarify_session', session_id: s.session_id, set_ids: [s.set], reason: 'Synthetic identified work' };
    const p = request(c, body);
    await a.query('BEGIN'); await a.query('SELECT id FROM sets WHERE id=$1 FOR UPDATE', [s.set]);
    // B first takes the planning singleton, then waits for A's set-row lock.
    const planner = settle(rpc(b, 'record_training_decision', p));
    await waitBlocked([b]);
    // A now holds the row and its evidence trigger wants B's singleton lock.
    const raw = settle(a.query('UPDATE sets SET reps=6 WHERE id=$1', [s.set]));
    const first = await Promise.race([planner.then(out => ({ side: 'planner', out })), raw.then(out => ({ side: 'raw', out }))]);
    assert.equal(first.out.ok, false, 'actual cycle must choose a deadlock victim');
    if (!first.out.ok) assert.equal(first.out.code, '40P01', JSON.stringify(first));
    if (first.side === 'raw') await a.query('ROLLBACK');
    else { must(await raw); await a.query('COMMIT'); }
    const out = await Promise.all([planner, raw]);
    assert.equal(out.filter(v => !v.ok && v.code === '40P01').length, 1);
    if (!out[0].ok) {
      assert.equal(await receiptCount(p.request_id), 0);
      assert.equal(await scalar(admin, "SELECT count(*)::int FROM training_plan_events WHERE session_id=$1 AND kind='clarify_session'", [s.session_id]), 0);
      must(out[1]);
      await mutate(b, 'record_training_decision', body); // explicit retry with fresh context/key
    } else {
      must(out[0]);
      await a.query('UPDATE sets SET reps=6 WHERE id=$1', [s.set]);
    }
    const after = await counts(); assert.ok(after.state >= before.state + 1); assert.equal(after.evidence, before.evidence + 2); assert.equal(after.receipts, before.receipts + 1);
    // Reconciliation during retry adds its own state change; raw provenance
    // and clarification events do not each increment state. Assert the exact
    // outcome for each deadlock victim instead of conflating event/state totals.
    assert.equal(after.state - before.state, first.side === 'planner' ? 2 : 1);
    assert.equal(after.events - before.events, first.side === 'planner' ? 4 : 3);
    assert.equal(await scalar(admin, 'SELECT reps FROM sets WHERE id=$1', [s.set]), 6);
    assert.equal(await scalar(admin, "SELECT count(*)::int FROM training_plan_events WHERE session_id=$1 AND kind='clarify_session'", [s.session_id]), 1);
    const now = await context(a); assert.equal(now.queue.qualifying_exposures, 1); assert.equal(now.queue.next_slot_key, 'beta');
    info(`DEADLOCK ${JSON.stringify({ victim: first.side, sqlstate: '40P01', explicitFreshRetry: true })}`);
  });
  await test('real login roles: owner permitted; other user/anon and role-claim mismatches denied', async () => {
    await fixture();
    for (const c of [a, other, anon, coach]) assert.equal(await scalar(c, 'SELECT rolsuper FROM pg_roles WHERE rolname=session_user'), false);
    assert.equal((await context(a)).authority.owner_user_id, nativeOwner);
    assert.equal((await context(coach)).authority.owner_user_id, nativeOwner);
    await deny(context(other), /AUTHORITY_REQUIRED/); await deny(context(anon), /permission denied/);
    await claims(other, 'authenticated', nativeOther, 'service_role'); await deny(context(other), /AUTHORITY_REQUIRED/);
    await claims(coach, 'service_role', nativeOwner, 'authenticated'); await deny(context(coach), /AUTHORITY_REQUIRED/);
    await claims(a, 'authenticated', nativeOwner, 'service_role'); await deny(context(a), /AUTHORITY_REQUIRED/);
    await claims(other, 'authenticated', 'not-a-uuid'); await deny(context(other), /AUTHORITY_REQUIRED/);
    await claims(anon, 'anon', nativeOwner, 'authenticated'); await deny(context(anon), /permission denied/);
    await deny(other.query('SET ROLE service_role'), /permission denied/); await deny(other.query('SET ROLE training_rpc_owner'), /permission denied/);
    await standardClaims();
  });
  await test('service-role coach cannot activate, change lifecycle, confirm owner evidence, or forge actor fields', async () => {
    const revision = await fixture(), s = await pending();
    const c = await context(coach), before = await counts();
    for (const [name, body] of [
      ['activate_training_revision', { revision_id: revision, seed_slot_key: 'alpha', pending_intent_action: 'retain' }],
      ['set_training_lifecycle', { lifecycle: 'paused', reason: 'spoof' }],
      ['record_training_decision', { kind: 'clarify_session', session_id: s.session_id, set_ids: [s.set], reason: 'spoof' }],
      ['record_training_decision', { kind: 'confirm_report', session_id: s.session_id, report: {}, duplicate_checked: true, reason: 'spoof' }],
      ['record_training_decision', { kind: 'confirm_day', date: await date(-1), complete: true, non_strength: true, reason: 'spoof' }],
    ] as [string, Json][]) await deny(rpc(coach, name, request(c, body)), /AUTHORITY_REQUIRED/);
    await deny(rpc(coach, 'materialize_training_session', request(c, { ...rest(await date(2)), actor: `owner:${nativeOwner}` })), /INVALID_INPUT_FIELDS/);
    assert.deepEqual(await counts(), before);
  });
  await test('planning tables, helper execution, history mutation, and schema-create are denied at SQL ACLs', async () => {
    await fixture(); const before = await counts();
    for (const c of [a, other, anon, coach]) {
      for (const table of ['training_plan_state','training_plan_revisions','training_session_contexts','training_plan_events']) {
        await deny(c.query(`SELECT * FROM ${table}`), /permission denied/);
        await deny(c.query(`INSERT INTO ${table} DEFAULT VALUES`), /permission denied/);
        await deny(c.query(`UPDATE ${table} SET id=id`), /permission denied/);
        await deny(c.query(`DELETE FROM ${table}`), /permission denied/);
      }
      await deny(c.query("SELECT training_actor(false)"), /permission denied/);
      await deny(c.query("SELECT training_event('proposal',NULL,NULL,'{}','owner:forged')"), /permission denied/);
    }
    assert.equal(await scalar(admin, "SELECT bool_and(NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'training\\_%' ESCAPE '\\'"), true);
    assert.equal(await scalar(admin, "SELECT has_schema_privilege('training_rpc_owner','public','CREATE')"), false);
    assert.equal(await scalar(admin, "SELECT rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname='training_rpc_owner'"), false);
    await deny(admin.query("UPDATE training_plan_revisions SET content=content"), /IMMUTABLE_TRAINING_HISTORY/);
    assert.deepEqual(await counts(), before);
  });
  await test('fixed SECURITY DEFINER paths resist caller temporary-table shadowing', async () => {
    await fixture(); const before = await context(a);
    await a.query(`CREATE TEMP TABLE training_plan_state(owner_user_id uuid); INSERT INTO training_plan_state VALUES('${nativeOther}'); SET search_path=pg_temp,public`);
    try { const after = await context(a); assert.equal(after.authority.owner_user_id, nativeOwner); assert.deepEqual(after.versions, before.versions); }
    finally { await a.query('DROP TABLE pg_temp.training_plan_state; RESET search_path'); }
    assert.equal(await scalar(admin, "SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public']) FROM pg_proc WHERE proname IN ('get_training_context','materialize_training_session','record_training_decision','activate_training_revision')"), true);
  });
  const nativeBackendPids = (await admin.query('SELECT pid FROM pg_stat_activity')).rows.map(row => Number(row.pid));
  for (const pid of nativeBackendPids) pids.add(pid);
} catch (e) {
  startupError = e instanceof Error ? e.stack || e.message : String(e);
  info(`FATAL ${startupError}`); process.exitCode = 1;
} finally {
  await Promise.all(clients.map(c => c.end().catch(() => {})));
  await pg?.stop();
  if (ownedData) await rm(dataDir, { recursive: true, force: true });
  if (ownedTemp) await rm(tempDir, { recursive: true, force: true });
  if (previousTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previousTmp;
  process.umask(oldUmask);
  try {
    if (port) await portClosed(port);
    const alive = [...pids].filter(isAlive); assert.deepEqual(alive, [], 'all tracked native server/backend PIDs must be gone');
    closed = true; info(`CLEANUP listener closed; ${pids.size} tracked PIDs exited; disposable data removed`);
  } catch (e) { info(`CLEANUP FAILED ${String(e)}`); process.exitCode = 1; }
  const failed = results.filter(r => !r.passed).length;
  if (failed || startupError) process.exitCode = 1;
  info(`RESULT ${results.length - failed} passed; ${failed} failed; native PostgreSQL; cleanup=${closed}`);
  await writeFile(reportPath, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), serverVersion, port, sourceHashes, results, startupError, cleanup: { closed, dataRemoved: ownedData, trackedPids: [...pids] }, scope: 'Synthetic native PostgreSQL engine/SQL privileges only. JWT claim GUCs model trusted gateway inputs; no JWT signature, GoTrue, PostgREST, or production Supabase certification.' }, null, 2));
  await rm(lockDir, { recursive: true, force: true });
}
// embedded-postgres's async-exit-hook hardcodes beforeExit=0. Cleanup has already
// completed, so preserve the actual test status rather than silently passing CI.
process.exit(process.exitCode || 0);

// Execute: node_modules/.bin/tsx --test tests/mcp-database.spec.ts
// Public MCP stdio -> real Supabase client -> loopback adapter -> repository SQL.
// Synthetic PGlite only. This is not real Supabase/PostgREST certification.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from '../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { createLocalTrainingServer, owner, root } from './support/local-training-server';

// Dynamic JSON wire assertions deliberately do not import production schema types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
type Fixture = Awaited<ReturnType<typeof createLocalTrainingServer>>;
async function connect(f: Fixture) {
  assert.equal(new URL(f.url).hostname, '127.0.0.1');
  const client = new Client({ name: 'real-sql-synthetic-test', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath, args: ['--import', 'tsx', 'src/index.ts'], cwd: resolve(root, 'mcp-server'),
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HSPAN_MCP_NO_DOTENV: '1', SUPABASE_URL: f.url,
      SUPABASE_SERVICE_ROLE_KEY: f.serviceRoleKey, HSPAN_ATHLETE_USER_ID: owner, HSPAN_ATHLETE_TIMEZONE: 'America/Montreal' },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', value => { stderr += value; });
  try { await client.connect(transport); }
  catch (error) { await transport.close(); throw new Error(`${String(error)}\n${stderr}`); }
  return client;
}
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Json> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{type:string;text?:string}>).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (result.isError) throw new Error(text);
  return JSON.parse(text);
}
async function withDatabase(run: (f: Fixture, client: Client) => Promise<void>, planning = true) {
  const f = await createLocalTrainingServer({ port: 0, planning });
  let client: Client | undefined;
  try { client = await connect(f); await run(f, client); }
  finally { try { await client?.close(); } finally { await f.close(); } }
  await assert.rejects(fetch(f.url), /fetch failed/, 'adapter listener must close');
}
function guard(c: Json) {
  assert.ok(c.context_receipt?.id, JSON.stringify(c));
  return { context_id: c.context_receipt.id, request_id: randomUUID(), expected_state_version: c.versions.state, expected_evidence_version: c.versions.evidence };
}
async function httpRPC(f: Fixture, name: string, input: Record<string, unknown> = {}, token = f.ownerToken) {
  const response = await fetch(`${f.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_input: input }) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${result.code}: ${result.message}`);
  return result;
}
async function ownerMutation(f: Fixture, name: string, input: Record<string, unknown>) {
  const c = await httpRPC(f, 'get_training_context');
  return httpRPC(f, name, { ...input, request_id: randomUUID(), expected_state_version: c.versions.state, expected_evidence_version: c.versions.evidence });
}
async function activate(f: Fixture, client: Client) {
  const c = await call(client, 'get_training_context');
  const proposed = await call(client, 'propose_training_revision', { ...guard(c), content: f.content });
  const activated = await ownerMutation(f, 'activate_training_revision', { revision_id: proposed.revision_id, seed_slot_key: 'alpha', pending_intent_action: 'retain' });
  assert.equal((await call(client, 'get_training_context')).authority.revision_id, proposed.revision_id);
  return { proposed, activated };
}
async function sql(f: Fixture, query: string, params: unknown[] = []): Promise<Json[]> {
  return f.admin(async db => (await db.query(query, params)).rows);
}
async function actualSet(f: Fixture) {
  return (await sql(f, "INSERT INTO sets(exercise_id,reps,rir,logged_at) VALUES ($1,5,2,($2::date + time '12:00') AT TIME ZONE 'America/Montreal') RETURNING *", [f.exercise, f.yesterday]))[0];
}

test('adapter verifies signed roles, retains browser cookies, and refuses unsupported REST', async () => {
  const f = await createLocalTrainingServer({ port: 0 });
  try {
    for (const token of ['', 'forged.token.signature']) {
      assert.equal((await fetch(`${f.url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    }
    assert.equal((await fetch(`${f.url}/auth/v1/user`, { headers: { Authorization: `Bearer ${f.serviceRoleKey}` } })).status, 403);
    const [header, payload, signature] = f.serviceRoleKey.split('.');
    const serviceClaims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    assert.equal(serviceClaims.sub, undefined, 'coach token must never carry athlete identity');
    const forgedOwner = `${header}.${Buffer.from(JSON.stringify({ ...serviceClaims, sub: owner, role: 'authenticated' })).toString('base64url')}.${signature}`;
    assert.equal((await fetch(`${f.url}/auth/v1/user`, { headers: { Authorization: `Bearer ${forgedOwner}` } })).status, 401);
    assert.ok((await f.cookies()).length, 'existing browser cookie flow still works');
    const c = await httpRPC(f, 'get_training_context', {}, f.serviceRoleKey);
    assert.equal(c.authority.owner_user_id, owner);
    await assert.rejects(httpRPC(f, 'set_training_lifecycle', { lifecycle: 'active' }, f.serviceRoleKey), /AUTHORITY_REQUIRED/);
    for (const path of ['unknown_table', 'sets?select=*,invented(id)', 'sets?id=unsupported.1']) {
      const response = await fetch(`${f.url}/rest/v1/${path}`, { headers: { Authorization: `Bearer ${f.serviceRoleKey}` } });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'TEST_ADAPTER_UNSUPPORTED');
    }
  } finally { await f.close(); }
});

test('fresh public discovery and real SQL schema, immutable coach proposal, owner activation, materialization and restart replay', async () => {
  await withDatabase(async (f, client) => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map(tool => [tool.name, tool]));
    for (const name of ['get_training_context', 'get_training_history', 'get_training_request', 'propose_training_revision', 'materialize_training_session']) assert.ok(byName.has(name), name);
    for (const name of ['activate_training_revision', 'set_training_lifecycle', 'confirm_report']) assert.equal(byName.has(name), false);
    assert.ok((byName.get('materialize_training_session')!.inputSchema.properties as Json).exercises.items.properties.optional);
    const initial = await call(client, 'get_training_context');
    const { context_receipt: receipt, ...wire } = initial;
    assert.deepEqual(wire, await httpRPC(f, 'get_training_context', {}, f.serviceRoleKey), 'public parser must retain real SQL fields');
    assert.equal(initial.status, 'inactive');
    assert.equal(initial.authority.owner_user_id, owner);
    for (const value of [initial.evidence.sets, initial.proposals, initial.recent_phases]) assert.ok(Array.isArray(value));
    assert.deepEqual(receipt.capabilities, ['propose_training_revision']);
    const proposed = await call(client, 'propose_training_revision', { ...guard(initial), content: f.content });
    assert.ok(proposed.revision_id);
    const pending = await call(client, 'get_training_context');
    assert.equal(pending.authority.revision_id, null);
    assert.equal(pending.proposals.length, 1);
    const revisionHistory = await call(client, 'get_training_history', { revision_id: proposed.revision_id });
    assert.equal(revisionHistory.revisions[0].source, 'coach');
    assert.deepEqual(revisionHistory.revisions[0].content, f.content);
    assert.ok(revisionHistory.events.some((e: Json) => e.id === proposed.event_id));
    await assert.rejects(sql(f, 'UPDATE training_plan_revisions SET content=content WHERE id=$1', [proposed.revision_id]), /IMMUTABLE|immutable/);
    const activationInput = { revision_id: proposed.revision_id, seed_slot_key: 'alpha', pending_intent_action: 'retain', request_id: randomUUID(), expected_state_version: pending.versions.state, expected_evidence_version: pending.versions.evidence };
    await assert.rejects(httpRPC(f, 'activate_training_revision', activationInput, f.serviceRoleKey), /AUTHORITY_REQUIRED/);
    const activated = await httpRPC(f, 'activate_training_revision', activationInput);
    const active = await call(client, 'get_training_context');
    assert.equal(active.authority.activation_event_id, activated.activation_event_id);
    assert.equal(active.queue.next_slot_key, 'alpha');
    const args = { ...guard(active), target_date: f.today, activity_kind: 'strength', slot_key: 'alpha', reason: 'Synthetic approved work intent', revisit_on: f.tomorrow };
    const materialized = await call(client, 'materialize_training_session', args);
    assert.ok(materialized.session_id);
    assert.ok(materialized.workout_id);
    const history = await call(client, 'get_training_history', { session_id: materialized.session_id });
    assert.equal(history.sessions.length, 1);
    assert.equal(history.sessions[0].id, materialized.session_id);
    assert.equal(history.sessions[0].revision_id, proposed.revision_id);
    assert.ok(history.events.some((e: Json) => e.id === materialized.event_id));
    assert.deepEqual(history.sessions[0], (await sql(f, 'SELECT to_jsonb(s) AS value FROM training_session_contexts s WHERE id=$1', [materialized.session_id]))[0].value);
    assert.deepEqual((await sql(f, 'SELECT result FROM training_plan_events WHERE id=$1', [materialized.event_id]))[0].result, materialized);
    assert.equal((await call(client, 'get_training_context')).queue.next_slot_key, 'alpha', 'planned intent is not execution');
    assert.deepEqual(await call(client, 'materialize_training_session', args), materialized, 'committed replay works after receipt invalidation');
    const payload: Record<string, unknown> = { ...args }; delete payload.context_id;
    assert.deepEqual(await call(client, 'get_training_request', { operation: 'materialize_training_session', request_id: args.request_id, payload }), materialized);
    await client.close();
    const restarted = await connect(f);
    try {
      assert.deepEqual(await call(restarted, 'materialize_training_session', args), materialized, 'exact payload replays with no receipt in restarted process');
      await assert.rejects(call(restarted, 'materialize_training_session', { ...args, request_id: randomUUID() }), /FRESH_CONTEXT_REQUIRED/);
      await assert.rejects(call(restarted, 'materialize_training_session', { ...args, reason: 'changed' }), /IDEMPOTENCY_CONFLICT/);
      assert.equal((await sql(f, 'SELECT count(*)::int AS n FROM training_session_contexts'))[0].n, 1);
      assert.equal((await sql(f, "SELECT count(*)::int AS n FROM training_plan_events WHERE operation='materialize_training_session'"))[0].n, 1);
    } finally { await restarted.close(); }
  });
});

test('R4 public MCP discovers explicit reissue, requires owner cancellation, then replays and reads immutable history', async () => {
  await withDatabase(async (f, client) => {
    await activate(f, client);
    const schema = (await client.listTools()).tools.find(t => t.name === 'materialize_training_session')!.inputSchema.properties as Json;
    assert.ok(schema.replace_cancelled_session_id);
    let c = await call(client, 'get_training_context');
    const args = { target_date: f.today, activity_kind: 'strength', slot_key: 'alpha', reason: 'Synthetic public reissue test', revisit_on: f.tomorrow };
    const old = await call(client, 'materialize_training_session', { ...args, ...guard(c) });
    await assert.rejects(call(client, 'record_training_decision', { ...guard(await call(client, 'get_training_context')), kind: 'cancel_session', session_id: old.session_id, reason: 'coach cannot cancel' }), /cancel_session|Invalid|invalid/);
    await ownerMutation(f, 'record_training_decision', { kind: 'cancel_session', session_id: old.session_id, reason: 'Synthetic owner cancellation' });
    c = await call(client, 'get_training_context');
    const reissue = { ...args, replace_cancelled_session_id: old.session_id, ...guard(c) };
    const result = await call(client, 'materialize_training_session', reissue);
    assert.equal(result.workout_id, old.workout_id); assert.notEqual(result.session_id, old.session_id);
    assert.deepEqual(await call(client, 'materialize_training_session', reissue), result);
    const history = await call(client, 'get_training_history');
    assert.equal(history.sessions.length, 2);
    assert(history.events.some((e: Json) => e.payload.replaces_cancelled_session_id === old.session_id));
    c = await call(client, 'get_training_context'); assert.equal(c.queue.qualifying_exposures, 0);
    assert.equal(c.queue.next_slot_key, 'alpha');
  });
});

test('R1/R5 public MCP reads effective actual evidence and refuses prescriptions, not independent recovery intent', async () => {
  await withDatabase(async (f, client) => {
    const { proposed } = await activate(f, client);
    await ownerMutation(f, 'record_training_decision', { kind: 'confirm_day', date: f.yesterday, non_strength: false, complete: true, reason: 'Synthetic unlogged actual resistance' });
    let c = await call(client, 'get_training_context');
    assert.equal(c.activity_eligibility.strength.eligible, false);
    await assert.rejects(call(client, 'materialize_training_session', { ...guard(c), target_date: f.today, activity_kind: 'strength', slot_key: 'alpha', reason: 'Cannot ignore unlogged strength', revisit_on: f.tomorrow }), /AUTHORITY_REQUIRED/);
    assert(c.activity_eligibility.strength.reasons.includes('RECOVERY_SPACING_NOT_MET'));
    await ownerMutation(f, 'record_training_decision', { kind: 'confirm_day', date: f.yesterday, non_strength: true, complete: true, reason: 'Owner correction' });
    const occurrence = await ownerMutation(f, 'record_training_decision', { kind: 'attribute_occurrence', revision_id: proposed.revision_id, slot_key: 'alpha', performed_on: f.yesterday, set_ids: [], duplicate_checked: true, reason: 'Synthetic actual occurrence' });
    for (const work of [[{ exercise_id: f.exercise, sets: 1, reps: 5, rir: 2 }], []]) {
      await ownerMutation(f, 'record_training_decision', { kind: 'confirm_report', session_id: occurrence.session_id, report: { performed_on: f.yesterday, work }, duplicate_checked: true, reason: 'Synthetic corrected report' });
    }
    await ownerMutation(f, 'record_training_decision', { kind: 'queue_correction', next_slot_key: 'alpha', evidence: { summary: 'Removed erroneous work' }, reason: 'Owner queue correction' });
    c = await call(client, 'get_training_context'); assert.equal(c.activity_eligibility.strength.eligible, true); assert.equal(c.queue.qualifying_exposures, 0);
    await call(client, 'materialize_training_session', { ...guard(c), target_date: f.today, activity_kind: 'rest', reason: 'Synthetic independent recovery choice', revisit_on: f.tomorrow });
    assert.equal((await call(client, 'get_training_context')).queue.next_slot_key, 'alpha');
  });
});

for (const lifecycle of ['active', 'paused']) {
  test(`all four real SQL legacy routes require fresh explicit freeform during ${lifecycle}; actual evidence invalidates`, async () => {
    await withDatabase(async (f, client) => {
      await activate(f, client);
      if (lifecycle === 'paused') await ownerMutation(f, 'set_training_lifecycle', { lifecycle, reason: 'Synthetic owner pause' });
      const workout = (await sql(f, 'INSERT INTO workouts(date,name) VALUES ($1,$2) RETURNING id', [f.today, 'Synthetic initial']))[0];
      const entry = (await sql(f, 'INSERT INTO workouts_exercises(workout_id,exercise_id,details) VALUES ($1,$2,$3) RETURNING id', [workout.id, f.exercise, 'Synthetic initial']))[0];
      const operations = [
        { name: 'create_or_update_workout', args: { date: f.today, name: 'Synthetic renamed' } },
        { name: 'add_workout_exercise', args: { date: f.today, exercise_id: f.exercise, details: 'Synthetic addition' } },
        { name: 'update_workout_exercise', args: { workout_exercise_id: entry.id, note: 'Synthetic updated' } },
        { name: 'remove_workout_exercise', args: { workout_exercise_id: entry.id } },
      ];
      for (const op of operations) {
        await assert.rejects(call(client, op.name, op.args), /FRESH_CONTEXT_REQUIRED/);
        await assert.rejects(call(client, op.name, { ...op.args, mode: 'freeform', request_id: randomUUID() }), /FRESH_CONTEXT_REQUIRED/);
        const c = await call(client, 'get_training_context');
        await assert.rejects(call(client, op.name, { ...op.args, ...guard(c) }), /FRESH_CONTEXT_REQUIRED/);
      }
      const stale = await call(client, 'get_training_context');
      const actual = await actualSet(f);
      const refreshed = await call(client, 'get_training_context');
      assert.ok(refreshed.versions.evidence > stale.versions.evidence);
      assert.ok(refreshed.evidence.sets.some((s: Json) => s.id === actual.id));
      for (const op of operations) await assert.rejects(call(client, op.name, { ...op.args, ...guard(stale), mode: 'freeform', reason: 'Synthetic stale request' }), /CONTEXT_CHANGED/);
      // Soft-deletion is genuine evidence mutation, not context-response patching.
      await sql(f, 'UPDATE sets SET is_deleted=true WHERE id=$1', [actual.id]);
      let addedId: number | undefined;
      for (const op of operations) {
        const c = await call(client, 'get_training_context');
        const args = { ...op.args, ...guard(c), mode: 'freeform', reason: 'Synthetic explicit independent intent', revisit_on: f.tomorrow };
        const result = await call(client, op.name, args);
        assert.equal(result.planning_enforcement, 'guarded');
        assert.equal(result.workout_id, workout.id);
        if (op.name === 'add_workout_exercise') addedId = result.workout_exercise_id;
        if (op.name === 'create_or_update_workout') assert.equal((await sql(f, 'SELECT name FROM workouts WHERE id=$1', [workout.id]))[0].name, op.args.name);
        if (op.name === 'add_workout_exercise') assert.equal((await sql(f, 'SELECT details FROM workouts_exercises WHERE id=$1', [addedId]))[0].details, op.args.details);
        if (op.name === 'update_workout_exercise') assert.equal((await sql(f, 'SELECT note FROM workouts_exercises WHERE id=$1', [entry.id]))[0].note, op.args.note);
        if (op.name === 'remove_workout_exercise') assert.deepEqual(await sql(f, 'SELECT id FROM workouts_exercises WHERE id=$1', [entry.id]), []);
        assert.equal((await call(client, op.name, args)).event_id, result.event_id);
        assert.equal((await sql(f, 'SELECT result FROM training_plan_events WHERE id=$1', [result.event_id]))[0].result.event_id, result.event_id);
      }
      assert.equal((await sql(f, 'SELECT name FROM workouts WHERE id=$1', [workout.id]))[0].name, 'Synthetic renamed');
      assert.deepEqual((await sql(f, 'SELECT id FROM workouts_exercises WHERE workout_id=$1', [workout.id])).map(row => row.id), [addedId]);
      assert.ok(f.requests.some((r: Json) => r.path === '/rest/v1/workouts_exercises' && new URLSearchParams(r.query).get('select')?.includes('workouts!inner(date)')), 'owning date resolved through actual FK SQL join');
    });
  });
}

for (const lifecycle of ['active', 'paused']) {
test(`real resistance spacing survives ${lifecycle} freeform rename; relabeling cannot bypass and active rest remains eligible`, async () => {
  await withDatabase(async (f, client) => {
    await activate(f, client);
    if (lifecycle === 'paused') await ownerMutation(f, 'set_training_lifecycle', { lifecycle, reason: 'Synthetic owner pause' });
    const workout = (await sql(f, 'INSERT INTO workouts(date,name) VALUES ($1,$2) RETURNING id', [f.today, 'Synthetic strength']))[0];
    await sql(f, 'INSERT INTO workouts_exercises(workout_id,exercise_id,details) VALUES ($1,$2,$3)', [workout.id, f.exercise, 'Loaded strength']);
    await actualSet(f);
    const c = await call(client, 'get_training_context');
    assert.equal(c.activity_eligibility.strength.eligible, false);
    await assert.rejects(call(client, 'create_or_update_workout', { ...guard(c), date: f.today, name: 'Mobility label', mode: 'freeform', reason: 'Cannot hide load' }), /RECOVERY_SPACING_NOT_MET/);
    assert.equal((await sql(f, 'SELECT name FROM workouts WHERE id=$1', [workout.id]))[0].name, 'Synthetic strength');
    if (lifecycle === 'paused') await ownerMutation(f, 'set_training_lifecycle', { lifecycle: 'active', reason: 'Synthetic owner resume for supportive intent' });
    const active = await call(client, 'get_training_context');
    assert.equal(active.activity_eligibility.rest.eligible, true);
    await assert.rejects(call(client, 'materialize_training_session', { ...guard(active), target_date: f.today, activity_kind: 'mobility', exercises: [{ exercise_id: f.exercise, details: 'Loaded mobility label' }], reason: 'Cannot hide load', revisit_on: f.tomorrow }), /RECOVERY_SPACING_NOT_MET/);
    const restContext = await call(client, 'get_training_context', { target_date: f.tomorrow });
    assert.ok(restContext.activity_eligibility.strength.conditions.some((condition: Json) => typeof condition === 'object'), 'structured SQL eligibility conditions parse');
    const rest = await call(client, 'materialize_training_session', { ...guard(restContext), target_date: f.tomorrow, activity_kind: 'rest', reason: 'Synthetic recovery alternative', revisit_on: f.later });
    assert.equal(rest.workout_id, null);
    const history = await call(client, 'get_training_history', { session_id: rest.session_id });
    assert.equal(history.sessions[0].activity_kind, 'rest');
    assert.ok(history.events.some((event: Json) => event.id === rest.event_id));
    assert.equal((await call(client, 'get_training_context')).queue.next_slot_key, 'alpha');
  });
});
}

test('known production defect: absent migration rejects ordinary legacy planning instead of compatibility', async () => {
  await withDatabase(async (f, client) => {
    assert.equal((await sql(f, "SELECT to_regprocedure('public.get_training_context(jsonb)') AS rpc"))[0].rpc, null);
    await assert.rejects(call(client, 'create_or_update_workout', { date: f.today, name: 'Ordinary synthetic legacy' }), /does not exist/);
    assert.equal((await sql(f, 'SELECT count(*)::int AS n FROM workouts'))[0].n, 0);
  }, false);
});

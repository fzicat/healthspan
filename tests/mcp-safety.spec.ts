// Execute: node_modules/.bin/tsx --test tests/mcp-safety.spec.ts
// Public MCP stdio -> real SQL migrations in disposable PGlite; no live credentials.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from '../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { createLocalTrainingServer, owner, root } from './support/local-training-server';

// SQL/JSON protocol fixtures deliberately exercise runtime contracts, not app types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
type Fixture = Awaited<ReturnType<typeof createLocalTrainingServer>>;
async function withDatabase(run: (f: Fixture, client: Client) => Promise<void>) {
  const f = await createLocalTrainingServer({ port: 0 });
  const client = new Client({ name: 'prescription-safety-sql-test', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath, args: ['--import', 'tsx', 'src/index.ts'], cwd: resolve(root, 'mcp-server'),
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HSPAN_MCP_NO_DOTENV: '1', SUPABASE_URL: f.url,
      SUPABASE_SERVICE_ROLE_KEY: f.serviceRoleKey, HSPAN_ATHLETE_USER_ID: owner, HSPAN_ATHLETE_TIMEZONE: 'America/Montreal' },
    stderr: 'pipe',
  });
  assert.equal(new URL(f.url).hostname, '127.0.0.1');
  try { await client.connect(transport); await run(f, client); }
  finally {
    try { await client.close(); await transport.close(); }
    finally { await f.close(); await assert.rejects(fetch(f.url), /fetch failed/, 'fixture listener closes even on failure'); }
  }
}
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Json> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{type:string;text?:string}>).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (result.isError) throw new Error(text);
  return JSON.parse(text);
}
function guard(c: Json) {
  assert.ok(c.context_receipt?.id);
  return { context_id: c.context_receipt.id, request_id: randomUUID(), expected_state_version: c.versions.state, expected_evidence_version: c.versions.evidence };
}
async function sql(f: Fixture, query: string, params: unknown[] = []): Promise<Json[]> {
  return f.admin(async db => (await db.query(query, params)).rows);
}
async function propose(f: Fixture, client: Client, content: Json) {
  return call(client, 'propose_training_revision', { ...guard(await call(client, 'get_training_context')), content });
}
async function activate(f: Fixture, client: Client, content: Json = f.content) {
  const proposed = await propose(f, client, content);
  await f.mutate('activate_training_revision', { revision_id: proposed.revision_id, seed_slot_key: content.sequence[0].key, pending_intent_action: 'retain' });
  assert.equal((await call(client, 'get_training_context')).authority.revision_id, proposed.revision_id);
  return proposed.revision_id;
}
function regional(f: Fixture): Json {
  const c: Json = structuredClone(f.content);
  c.sequence.forEach((s: Json) => { s.load_tags = ['resistance', 'upper']; });
  c.recovery_spacing_rules = [{ id: 'upper-spacing', candidate_tags: ['upper'], preceding_tags: ['upper'], predicate: 'min_calendar_days', min_days: 2 }];
  return c;
}
async function exercise(f: Fixture, category = 'strength', name = `Synthetic unclassified movement ${randomUUID()}`) {
  return (await sql(f, 'INSERT INTO exercises(name,category,metrics) VALUES ($1,$2,$3::jsonb) RETURNING id', [name, category, JSON.stringify({ weight: category === 'strength', reps: category === 'strength', time: category !== 'strength', distance: false })]))[0].id as number;
}
async function set(f: Fixture, id = f.exercise, date = f.yesterday) {
  return (await sql(f, "INSERT INTO sets(exercise_id,reps,rir,logged_at) VALUES ($1,1,2,($2::date + time '12:00') AT TIME ZONE 'America/Montreal') RETURNING *", [id, date]))[0];
}
async function workout(f: Fixture, ids: number[]) {
  const w = (await sql(f, 'INSERT INTO workouts(date,name) VALUES ($1,$2) RETURNING id', [f.today, 'Original synthetic prescription']))[0];
  const entries: number[] = [];
  for (const id of ids) entries.push((await sql(f, 'INSERT INTO workouts_exercises(workout_id,exercise_id,details) VALUES ($1,$2,$3) RETURNING id', [w.id, id, 'Original synthetic work']))[0].id);
  return { id: w.id, entries };
}
async function snapshot(f: Fixture) {
  return (await sql(f, `SELECT jsonb_build_object(
    'workouts',(SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY id),'[]') FROM workouts w),
    'exercises',(SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY id),'[]') FROM workouts_exercises w),
    'sessions',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM training_session_contexts s),
    'versions',(SELECT to_jsonb(s) FROM training_plan_state s WHERE id=1),
    'events',(SELECT count(*) FROM training_plan_events)) AS value`))[0].value;
}
async function denied(f: Fixture, client: Client, name: string, args: Json, reason: RegExp) {
  const context = await call(client, 'get_training_context');
  const before = await snapshot(f);
  await assert.rejects(call(client, name, { ...args, ...guard(context) }), reason);
  assert.deepEqual(await snapshot(f), before, 'denial rolls back exact target, versions, sessions and events');
}
function routes(f: Fixture, firstEntry: number, id = f.exercise) {
  return [
    { name: 'create_or_update_workout', args: { date: f.today, name: 'Relabeled mobility' } },
    { name: 'add_workout_exercise', args: { date: f.today, exercise_id: id, details: 'New synthetic work' } },
    { name: 'update_workout_exercise', args: { workout_exercise_id: firstEntry, details: 'Changed synthetic work' } },
    { name: 'remove_workout_exercise', args: { workout_exercise_id: firstEntry } },
  ];
}
const freeform = { mode: 'freeform', reason: 'Synthetic explicit independent prescription' };
async function acknowledgeReview(f: Fixture, client: Client) {
  const c = await call(client, 'get_training_context');
  if (c.review.review_due) await call(client, 'record_training_decision', { ...guard(c), kind: 'bounded_continuation', review_event_ids: c.review.reasons.map((r: Json) => r.event_id), evidence: { synthetic: true }, reason: 'Retain stop; permit only independent alternatives', revisit_on: f.tomorrow });
}

for (const lifecycle of ['active', 'paused']) for (const mixed of [false, true]) {
  test(`F1 cardio stop rejects all four ${lifecycle} freeform routes (${mixed ? 'mixed' : 'cardio-only'} content)`, async t => {
    await withDatabase(async (f, client) => {
      await activate(f, client);
      const cardio = await exercise(f, 'cardio');
      const w = await workout(f, mixed ? [f.exercise, cardio] : [cardio, cardio]);
      await f.mutate('record_training_decision', { kind: 'concern', code: 'pain', activity_kinds: ['cardio'], stop: true, reason: 'Synthetic cardio-only stop', revisit_on: f.tomorrow });
      if (lifecycle === 'paused') await f.mutate('set_training_lifecycle', { lifecycle, reason: 'Synthetic pause' });
      const c = await call(client, 'get_training_context');
      assert.ok(c.activity_eligibility.cardio.reasons.includes('STOP_CONDITION'));
      assert.equal(c.activity_eligibility.strength.reasons.includes('STOP_CONDITION'), false);
      for (const route of routes(f, w.entries[0], cardio)) await t.test(route.name, async () => {
        await denied(f, client, route.name, { ...route.args, ...freeform }, /STOP_CONDITION/);
      });
      // Unlike removing one row while stopped content remains, removing the
      // final stopped row is safe and must be available through the public tool.
      await sql(f, 'DELETE FROM workouts_exercises WHERE workout_id=$1 AND id<>$2', [w.id, w.entries[1]]);
      await call(client, 'remove_workout_exercise', { ...guard(await call(client, 'get_training_context')), workout_exercise_id: w.entries[1], ...freeform });
      assert.deepEqual(await sql(f, 'SELECT id FROM workouts_exercises WHERE workout_id=$1', [w.id]), []);
      await denied(f, client, 'add_workout_exercise', { date: f.today, exercise_id: cardio, details: 'New cardio in empty workout', ...freeform }, /STOP_CONDITION/);
      const allowed = await call(client, 'add_workout_exercise', { ...guard(await call(client, 'get_training_context')), date: f.today, exercise_id: f.exercise, details: 'Independent strength', ...freeform });
      assert.equal((await sql(f, 'SELECT exercise_id FROM workouts_exercises WHERE id=$1', [allowed.workout_exercise_id]))[0].exercise_id, f.exercise);
      if (lifecycle === 'active') {
        await acknowledgeReview(f, client);
        const rest = await call(client, 'materialize_training_session', { ...guard(await call(client, 'get_training_context')), target_date: f.today, activity_kind: 'rest', reason: 'Independent rest alternative', revisit_on: f.tomorrow });
        assert.equal((await sql(f, 'SELECT activity_kind FROM training_session_contexts WHERE id=$1', [rest.session_id]))[0].activity_kind, 'rest');
      }
    });
  });
}

test('F2 actual unlinked nonqualifying upper work blocks SQL and public MCP materialization', async () => {
  await withDatabase(async (f, client) => {
    await activate(f, client, regional(f));
    const actual = await set(f);
    const args = { target_date: f.today, activity_kind: 'strength', slot_key: 'alpha', reason: 'Same approved anchor', revisit_on: f.tomorrow };
    await denied(f, client, 'materialize_training_session', args, /AUTHORITY_REQUIRED|RECOVERY_SPACING_NOT_MET/);
    const before = await snapshot(f);
    await assert.rejects(f.mutate('materialize_training_session', args, 'service_role'), /RECOVERY_SPACING_NOT_MET/);
    assert.deepEqual(await snapshot(f), before, 'database independently rechecks spacing, not just the MCP receipt');
    const load = (await sql(f, "SELECT * FROM training_load_dates('America/Montreal') WHERE source='set' AND source_id=$1", [String(actual.id)]))[0];
    assert.ok(load.tags.includes('upper'));
    assert.equal(actual.training_session_id, null);
    const c = await call(client, 'get_training_context');
    assert.ok(c.activity_eligibility.strength.reasons.includes('RECOVERY_SPACING_NOT_MET'));
    assert.equal(c.queue.qualifying_exposures, 0);
    assert.equal(c.activity_eligibility.rest.eligible, true);
  });
});

for (const lifecycle of ['active', 'paused']) {
  test(`F2 freeform candidate keeps upper classification on all four ${lifecycle} routes`, async t => {
    await withDatabase(async (f, client) => {
      const rid = await activate(f, client, regional(f));
      const actual = await set(f);
      await f.mutate('record_training_decision', { kind: 'attribute_occurrence', revision_id: rid, slot_key: 'alpha', performed_on: f.yesterday, set_ids: [actual.id], duplicate_checked: true, reason: 'Explicit original upper occurrence' });
      if (lifecycle === 'paused') await f.mutate('set_training_lifecycle', { lifecycle, reason: 'Synthetic pause' });
      const w = await workout(f, [f.exercise, f.exercise]);
      for (const route of routes(f, w.entries[0])) await t.test(route.name, async () => {
        await denied(f, client, route.name, { ...route.args, ...freeform }, /RECOVERY_SPACING_NOT_MET/);
      });
    });
  });
}

test('F2 activated history classifies exact slot and equivalent IDs across phase changes and library relabeling', async () => {
  await withDatabase(async (f, client) => {
    const equivalent = await exercise(f);
    const nextAnchor = await exercise(f);
    const first = regional(f);
    first.sequence.forEach((s: Json) => s.qualification.anchors[0].exercise_ids.push(equivalent));
    const oldRevision = await activate(f, client, first);
    const actual = await set(f, equivalent);
    const next = regional(f);
    next.block.key = 'new-phase';
    next.variation_policy.previous_phase_ids = [oldRevision];
    next.sequence.forEach((s: Json) => { s.exercises[0].exercise_id = nextAnchor; s.qualification.anchors[0].exercise_ids = [nextAnchor]; });
    await activate(f, client, next);
    await sql(f, "UPDATE exercises SET category='cardio',metrics='{}',name='Misleading name '||id WHERE id IN ($1,$2)", [f.exercise, equivalent]);
    await denied(f, client, 'add_workout_exercise', { date: f.today, exercise_id: f.exercise, details: 'Old approved ID', ...freeform }, /RECOVERY_SPACING_NOT_MET/);
    await denied(f, client, 'add_workout_exercise', { date: f.today, exercise_id: equivalent, details: 'Old permitted equivalent', ...freeform }, /RECOVERY_SPACING_NOT_MET/);
    const load = (await sql(f, "SELECT tags FROM training_load_dates('America/Montreal') WHERE source='set' AND source_id=$1", [String(actual.id)]))[0];
    assert.ok(load.tags.includes('upper'));
    assert.ok((await call(client, 'get_training_context')).activity_eligibility.strength.reasons.includes('RECOVERY_SPACING_NOT_MET'));
  });
});

test('F2 unknown preceding regional load fails closed without treating it as upper; proposals cannot classify it', async () => {
  await withDatabase(async (f, client) => {
    const unknown = await exercise(f, 'strength', 'Upper sounding name is not classification');
    await activate(f, client, regional(f));
    const actual = await set(f, unknown);
    // A merely proposed lower classification must not turn uncertainty into clearance.
    const proposal = regional(f);
    proposal.sequence.forEach((s: Json) => { s.load_tags = ['resistance', 'lower']; s.exercises[0].exercise_id = unknown; s.qualification.anchors[0].exercise_ids = [unknown]; });
    await propose(f, client, proposal);
    await denied(f, client, 'add_workout_exercise', { date: f.today, exercise_id: f.exercise, details: 'Dependent upper work', ...freeform }, /LOAD_CLASSIFICATION_REQUIRED/);
    const c = await call(client, 'get_training_context');
    assert.ok(c.activity_eligibility.strength.reasons.includes('LOAD_CLASSIFICATION_REQUIRED'));
    assert.equal(c.activity_eligibility.strength.eligible_on_or_after, null);
    for (const activity of ['cardio', 'mobility', 'rest']) assert.equal(c.activity_eligibility[activity].eligible, true);
    const load = (await sql(f, "SELECT tags FROM training_load_dates('America/Montreal') WHERE source='set' AND source_id=$1", [String(actual.id)]))[0];
    assert.equal(load.tags.includes('upper'), false);
    assert.equal(load.tags.includes('lower'), false);
    // Classification uncertainty has a bounded effect under min_calendar_days.
    const later = await call(client, 'get_training_context', { target_date: f.later });
    assert.equal(later.activity_eligibility.strength.eligible, true);
    const rest = await call(client, 'materialize_training_session', { ...guard(await call(client, 'get_training_context')), target_date: f.today, activity_kind: 'rest', reason: 'Independent alternative to unresolved load', revisit_on: f.tomorrow });
    assert.equal((await sql(f, 'SELECT activity_kind FROM training_session_contexts WHERE id=$1', [rest.session_id]))[0].activity_kind, 'rest');
  });
});

test('F2 unknown candidate is blocked only when regional spacing depends on it; known lower is independent', async () => {
  await withDatabase(async (f, client) => {
    const unknown = await exercise(f), lower = await exercise(f);
    const c = regional(f);
    c.sequence[1].load_tags = ['resistance', 'lower'];
    c.sequence[1].exercises[0].exercise_id = lower;
    c.sequence[1].qualification.anchors[0].exercise_ids = [lower];
    await activate(f, client, c);
    const actual = await set(f);
    await denied(f, client, 'add_workout_exercise', { date: f.today, exercise_id: unknown, details: 'Unclassified candidate', ...freeform }, /LOAD_CLASSIFICATION_REQUIRED/);
    const allowed = await call(client, 'add_workout_exercise', { ...guard(await call(client, 'get_training_context')), date: f.today, exercise_id: lower, details: 'Approved independent lower work', ...freeform });
    assert.equal((await sql(f, 'SELECT exercise_id FROM workouts_exercises WHERE id=$1', [allowed.workout_exercise_id]))[0].exercise_id, lower);
    // Known work in a mixed candidate must not hide the unknown exercise.
    await denied(f, client, 'add_workout_exercise', { date: f.today, exercise_id: unknown, details: 'Mixed unknown candidate', ...freeform }, /LOAD_CLASSIFICATION_REQUIRED/);
    await sql(f, 'UPDATE sets SET is_deleted=true WHERE id=$1', [actual.id]);
    const nowSafe = await call(client, 'add_workout_exercise', { ...guard(await call(client, 'get_training_context')), date: f.today, exercise_id: unknown, details: 'No preceding load relevant to the rule', ...freeform });
    assert.equal((await sql(f, 'SELECT exercise_id FROM workouts_exercises WHERE id=$1', [nowSafe.workout_exercise_id]))[0].exercise_id, unknown);
  });
});

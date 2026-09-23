// Real migrations and SQL in disposable PostgreSQL/WASM; no env/live services.
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const scalar = async (sql, p = []) => Object.values((await db.query(sql, p)).rows[0])[0];
const owner = '11111111-1111-4111-8111-111111111111';
let today, ex, cardio, base, rid, passed = 0, failed = 0;
const date = n => scalar('SELECT ($1::date+$2::int)::text', [today, n]);
const ev = sid => scalar('SELECT training_evaluate($1)', [sid]);
async function event(kind, sid, payload) {
  return scalar("SELECT training_event($1,$2,$3,$4::jsonb,'owner:fixture')", [kind, rid, sid, JSON.stringify(payload)]);
}
async function activate(c = base) {
  await scalar('SELECT training_validate_revision($1::jsonb)', [JSON.stringify(c)]);
  rid = await scalar("INSERT INTO training_plan_revisions(schema_version,content,authored_on,timezone,source) VALUES(1,$1,$2,'America/Montreal','owner') RETURNING id", [JSON.stringify(c), today]);
  await db.query("UPDATE training_plan_state SET active_revision_id=$1,lifecycle='active' WHERE id=1", [rid]);
  await event('activation', null, { seed_slot_key: c.sequence[0].key });
}
async function session(key = 'a', day = today) {
  return scalar(`INSERT INTO training_session_contexts(revision_id,slot_key,cycle_key,planned_date,timezone,activity_kind,load_tags,snapshot,origin,source_state_version,source_evidence_version)
    SELECT $1,$2,gen_random_uuid(),$3,'America/Montreal',s->>'activity_kind',s->'load_tags',jsonb_build_object('slot',s,'exercises',s->'exercises'),'retrospective',0,0 FROM (SELECT training_slot($1,$2) s) x RETURNING id`, [rid, key, day]);
}
async function set(sid, { weight = 100, reps = 5, rir = null, time = null, distance = null, day = today, exercise = ex } = {}) {
  return scalar("INSERT INTO sets(exercise_id,training_session_id,weight,reps,rir,time,distance,logged_at) VALUES($1,$2,$3,$4,$5,$6,$7,($8::date+time '12:00') AT TIME ZONE 'America/Montreal') RETURNING id", [exercise, sid, weight, reps, rir, time, distance, day]);
}
async function test(label, fn) {
  await db.exec('RESET ROLE; BEGIN');
  try { await activate(); await fn(); passed++; console.log(`ok - ${label}`); }
  catch (e) { failed++; console.error(`not ok - ${label}: ${e.message}`); }
  finally { await db.exec('ROLLBACK; RESET ROLE'); }
}
async function invalid(label, mutate, code) {
  await test(label, async () => {
    const c = structuredClone(base); mutate(c);
    await assert.rejects(() => scalar('SELECT training_validate_revision($1::jsonb)', [JSON.stringify(c)]), e => e.message.includes(code));
  });
}
const eligibility = (day, kind = 'strength', exercises = [], slot = null) => scalar('SELECT training_eligibility($1,$2,$3::jsonb,$4::jsonb)', [day, kind, JSON.stringify(exercises), slot && JSON.stringify(slot)]);
async function reconcile(sid) {
  await db.exec('SET ROLE authenticated');
  await scalar("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: owner })]);
  try {
    const c = await scalar('SELECT get_training_context()');
    return await scalar('SELECT record_training_decision($1::jsonb)', [JSON.stringify({ kind: 'reconcile', session_id: sid, outcome: 'partial', expected_state_version: c.versions.state, expected_evidence_version: c.versions.evidence, request_id: crypto.randomUUID() })]);
  } finally { await db.exec('RESET ROLE'); }
}
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${owner}');`);
  await db.exec((await readFile(new URL('../schema.sql', import.meta.url), 'utf8')).split('-- Fuzzy duplicate detection')[0]);
  await db.exec('GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated,service_role;');
  for (const f of (await readdir(new URL('../migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  await db.query("INSERT INTO training_plan_state(id,owner_user_id,athlete_timezone) VALUES(1,$1,'America/Montreal')", [owner]);
  today = await scalar("SELECT (clock_timestamp() AT TIME ZONE 'America/Montreal')::date::text");
  ex = await scalar("INSERT INTO exercises(name,category) VALUES('Automatic fixture','strength') RETURNING id");
  cardio = await scalar("SELECT id FROM exercises WHERE name='Zone 2'");
  base = {
    schema_version: 1,
    macro: { intent: 'Synthetic fixture', priorities: [{ capacity: 'strength', mode: 'maintain', success_criteria: 'Comparable work' }], constraints: [], horizon: 'fixture', cardio_recovery_intent: 'authored' },
    block: { key: 'automatic', purpose: 'fixture', starts_on: await date(-30), expected_until: await date(30), authorized_through: null, phase_profile: { split: 'full_body', emphases: ['strength'], rep_emphasis: 'mixed', laterality_emphasis: 'mixed' } },
    sequence: ['a', 'b'].map(key => ({ key, activity_kind: 'strength', purpose: key, review_scope: 'block', load_tags: ['resistance'], exercises: [{ exercise_id: ex, details: 'authored fixture' }, { exercise_id: cardio, details: 'optional', optional: true }], qualification: { kind: 'strength_sets', anchors: [{ exercise_ids: [ex], min_sets: 1, min_reps: 5 }], require_work_set_confirmation: false, work_set_rule: { metric: 'weight', minimum: 80 }, admissible_sources: ['logged', 'self_reported'], queue_effect: 'advance', out_of_order: 'hold', continuation_days: 1 } })),
    variation_policy: { comparable: 'anchors', allowed: 'accessories', benefit: 'engagement', review_triggers: 'tolerance', transition_rationale: 'fixture', previous_phase_ids: [] },
    recovery_spacing_rules: [], progression_policy: { build: 'authored', maintain: 'hold', reduce: 'fatigue', recalibrate: 'review' },
    review_policy: { review_due_on: await date(20), exposure_threshold: null, scope: 'block', concern_triggers: [] },
    delegation: { supportive_activities: ['cardio', 'mobility', 'rest'], supportive_constraints: { mobility_unloaded: true }, routine_review: true, bounded_continuation_days: 2, substitutions: false, stop_conditions: [] }
  };
  await invalid('false confirmation without authored predicate rejected', c => delete c.sequence[0].qualification.work_set_rule, 'UNSUPPORTED_WORK_SET_PREDICATE');
  for (const rule of [{ metric: 'velocity', minimum: 1 }, { metric: 'weight', minimum: 0 }, { metric: 'reps', minimum: '5' }, { metric: 'time', minimum: 2, invented: true }]) {
    await invalid(`invalid bounded work predicate ${JSON.stringify(rule)}`, c => c.sequence[0].qualification.work_set_rule = rule, 'UNSUPPORTED_WORK_SET_PREDICATE');
  }
  await test('A3/A4 automatic required work qualifies partial and advances once without accessories or RIR', async () => {
    const sid = await session(); await set(sid);
    assert.equal((await ev(sid)).qualification, 'qualifies');
    assert.equal((await reconcile(sid)).qualification, 'qualifies'); await reconcile(sid);
    const queue = await scalar('SELECT training_queue()'); assert.equal(queue.next_slot_key, 'b'); assert.equal(queue.qualifying_exposures, 1);
    assert.equal(await scalar("SELECT count(*)::int FROM training_plan_events WHERE kind='clarify_session'"), 0);
  });
  await test('A5 below threshold warmups excluded; null metric stays pending precisely', async () => {
    const sid = await session(); await set(sid, { weight: 20 });
    assert.equal((await ev(sid)).qualification, 'does_not_qualify');
    await set(sid, { weight: null }); const pending = await ev(sid);
    assert.equal(pending.qualification, 'pending'); assert.ok(pending.missing_qualifiers.includes('work_set_metric:weight'));
    await set(sid); assert.equal((await ev(sid)).qualification, 'qualifies');
  });
  for (const metric of ['weight', 'reps', 'time', 'distance']) await test(`authored ${metric} rule is actually evaluated`, async () => {
    const c = structuredClone(base); for (const s of c.sequence) s.qualification.work_set_rule = { metric, minimum: 10 };
    await activate(c); const sid = await session(); const id = await set(sid, { [metric]: 1 });
    assert.equal((await ev(sid)).qualification, 'does_not_qualify');
    await db.query(`UPDATE sets SET ${metric}=12 WHERE id=$1`, [id]); assert.equal((await ev(sid)).qualification, 'qualifies');
  });
  await test('A5 authored RIR and quality remain mandatory, clarification overrides work identification', async () => {
    const c = structuredClone(base); c.sequence[0].qualification.anchors[0].max_rir = 2; c.sequence[0].qualification.required_quality = 'Controlled movement';
    await activate(c); const sid = await session(); const id = await set(sid);
    const first = await ev(sid); assert.ok(first.missing_qualifiers.includes('effort')); assert.ok(first.missing_qualifiers.includes('required_quality_evidence'));
    await event('clarify_session', sid, { set_ids: [id], effort_by_set: { [id]: 3 }, quality: 'Controlled movement' }); assert.equal((await ev(sid)).qualification, 'does_not_qualify');
    await event('clarify_session', sid, { set_ids: [id], effort_by_set: { [id]: 1 }, quality: 'Controlled movement' }); assert.equal((await ev(sid)).qualification, 'qualifies');
    await event('clarify_session', sid, { set_ids: [], quality: 'Controlled movement' }); assert.equal((await ev(sid)).qualification, 'does_not_qualify');
  });
  await test('A21 resolution applies only to its raw evidence fingerprint', async () => {
    const sid = await session(); const id = await set(sid);
    await event('confirm_report', sid, { report: { performed_on: today, work: [{ exercise_id: ex, sets: 2, reps: 5 }] } });
    const before = await ev(sid); assert.equal(before.qualification, 'pending'); assert.match(before.evidence_fingerprint, /^[a-f0-9]{64}$/);
    await event('resolve_report', sid, { resolution: 'use_logs', evidence_fingerprint: before.evidence_fingerprint });
    const resolved = await ev(sid); assert.equal(resolved.qualification, 'qualifies'); assert.equal(resolved.evidence_fingerprint, before.evidence_fingerprint);
    await db.query('UPDATE sets SET reps=6 WHERE id=$1', [id]);
    const edited = await ev(sid); assert.notEqual(edited.evidence_fingerprint, before.evidence_fingerprint); assert.equal(edited.qualification, 'pending');
    assert.equal(await scalar("SELECT count(*)::int FROM training_plan_events WHERE kind='resolve_report' AND session_id=$1", [sid]), 1);
  });
  await test('A21 new report and clarification invalidate old resolution, including legacy unscoped events', async () => {
    const sid = await session(); const id = await set(sid);
    const report = { performed_on: today, work: [{ exercise_id: ex, sets: 2, reps: 5 }] };
    await event('confirm_report', sid, { report });
    await event('resolve_report', sid, { resolution: 'use_logs' }); assert.equal((await ev(sid)).qualification, 'pending');
    let before = await ev(sid); await event('resolve_report', sid, { resolution: 'use_logs', evidence_fingerprint: before.evidence_fingerprint });
    assert.equal((await ev(sid)).qualification, 'qualifies');
    await event('confirm_report', sid, { report }); assert.equal((await ev(sid)).qualification, 'pending');
    before = await ev(sid); await event('resolve_report', sid, { resolution: 'use_report', evidence_fingerprint: before.evidence_fingerprint });
    assert.equal((await ev(sid)).source, 'self_reported');
    await event('clarify_session', sid, { set_ids: [id] }); assert.equal((await ev(sid)).qualification, 'pending');
  });
  await test('A25 full-body, upper/lower, PPL, custom sequences progress by authored length', async () => {
    for (const [split, keys] of [['full_body', ['a', 'b']], ['upper_lower', ['upper', 'lower']], ['ppl', ['push', 'pull', 'legs']], ['custom', ['one', 'two', 'three', 'four', 'five']]]) {
      const c = structuredClone(base); c.block.phase_profile.split = split; c.sequence = keys.map(key => ({ ...structuredClone(base.sequence[0]), key })); await activate(c);
      for (const [i, key] of keys.entries()) { const sid = await session(key); await set(sid); await reconcile(sid); assert.equal((await scalar('SELECT training_queue()')).next_slot_key, keys[(i + 1) % keys.length]); }
    }
  });
  await test('A30 primary cardio and mobility qualify without resistance slots or fake sets', async () => {
    for (const kind of ['cardio', 'mobility']) {
      const c = structuredClone(base); c.block.phase_profile = { split: 'custom', emphases: [kind === 'cardio' ? 'endurance' : 'mobility'], rep_emphasis: 'not_applicable', laterality_emphasis: 'not_applicable' };
      c.sequence = [{ ...structuredClone(base.sequence[0]), activity_kind: kind, exercises: [], load_tags: [kind], qualification: { ...base.sequence[0].qualification, anchors: [], work_set_rule: undefined, kind: kind === 'cardio' ? 'cardio_minutes' : 'reported_objective', min_minutes: kind === 'cardio' ? 20 : undefined, objective: 'Authored mobility task' } }];
      await activate(c); const sid = await session();
      if (kind === 'cardio') { const id = await scalar('INSERT INTO cardio_sessions(exercise_id,date,duration_minutes) VALUES($1,$2,25) RETURNING id', [cardio, today]); await event('clarify_session', sid, { set_ids: [], cardio_session_ids: [id] }); }
      else await event('confirm_report', sid, { report: { performed_on: today, objective_met: true, load_tags: ['mobility'] } });
      assert.equal((await reconcile(sid)).qualification, 'qualifies'); assert.equal((await scalar('SELECT training_queue()')).next_resistance_slot, null);
      assert.equal(await scalar('SELECT count(*)::int FROM sets WHERE training_session_id=$1', [sid]), 0);
    }
  });
  await test('A28 raw category history prevents relabeling unlinked bodyweight work', async () => {
    const id = await set(null, { weight: null }); await db.query("UPDATE exercises SET category='cardio',metrics='{}' WHERE id=$1", [ex]);
    assert.equal(await scalar("SELECT tags?'resistance' FROM training_load_dates('America/Montreal') WHERE source='set' AND source_id=$1", [String(id)]), true);
    await db.query('UPDATE sets SET is_deleted=true WHERE id=$1', [id]); assert.equal(await scalar("SELECT count(*)::int FROM training_load_dates('America/Montreal') WHERE source='set' AND source_id=$1", [String(id)]), 0);
  });
  await test('typed cardio/systemic calendar spacing uses actual load, not unknown empty dates', async () => {
    const c = structuredClone(base); c.recovery_spacing_rules = [{ id: 'cardio-gap', candidate_tags: ['cardio'], preceding_tags: ['cardio'], predicate: 'min_calendar_days', min_days: 2, require_day_confirmation: false }]; await activate(c);
    await db.query('INSERT INTO cardio_sessions(exercise_id,date,duration_minutes) VALUES($1,$2,25)', [cardio, today]);
    assert.equal((await eligibility(await date(1), 'cardio')).eligible, false);
    const allowed = await eligibility(await date(2), 'cardio'); assert.equal(allowed.eligible, true); assert.ok(allowed.conditions.some(x => typeof x === 'string' && x.includes('readiness')));
    assert.equal((await eligibility(await date(1), 'mobility')).eligible, true);
    c.recovery_spacing_rules[0].candidate_tags = ['systemic']; await activate(c); assert.equal((await eligibility(await date(1), 'strength')).eligible, false);
    c.recovery_spacing_rules[0].min_days = 0; await activate(c); assert.equal((await eligibility(today, 'cardio')).eligible, true);
  });
  await test('mobility reports require classification; actual tags enforce mobility calendar rule', async () => {
    const c = structuredClone(base); c.sequence = [{ ...c.sequence[0], activity_kind: 'mobility', load_tags: ['mobility'], exercises: [], qualification: { ...c.sequence[0].qualification, kind: 'reported_objective', objective: 'Authored mobility task', anchors: [] } }];
    c.recovery_spacing_rules = [{ id: 'mobility-gap', predicate: 'min_calendar_days', min_days: 2, candidate_tags: ['mobility'], preceding_tags: ['mobility'] }];
    await activate(c); const sid = await session();
    await event('confirm_report', sid, { report: { performed_on: today, objective_met: true } });
    const missing = await ev(sid); assert.equal(missing.qualification, 'pending'); assert.ok(missing.missing_qualifiers.includes('reported_load_tags'));
    await event('confirm_report', sid, { report: { performed_on: today, objective_met: true, load_tags: ['mobility'] } }); assert.equal((await ev(sid)).qualification, 'qualifies');
    const blocked = await eligibility(await date(1), 'mobility'); assert.equal(blocked.eligible, false); assert.ok(blocked.actual_load.some(x => x.source === 'report' && x.tags.includes('mobility')));
    assert.equal((await eligibility(await date(2), 'mobility')).eligible, true);
  });
  await invalid('intervening-day rule still requires resistance selectors', c => c.recovery_spacing_rules = [{ id: 'bad', candidate_tags: ['cardio'], preceding_tags: ['cardio'], predicate: 'intervening_non_strength_days', min_days: 1, require_day_confirmation: true }], 'UNSUPPORTED_SPACING_RULE');
  await invalid('loaded non-strength content cannot claim mobility-only load', c => { c.sequence[0].activity_kind = 'mobility'; c.sequence[0].load_tags = ['mobility']; c.sequence[0].qualification.kind = 'reported_objective'; c.sequence[0].qualification.objective = 'fixture'; }, 'INVALID_LOAD_CLASSIFICATION');
  console.log(`RESULT ${passed} passed; ${failed} failed (disposable PGlite)`); if (failed) process.exitCode = 1;
} finally { await db.close(); }

// Disposable PostgreSQL regressions: no environment loading or network database.
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await q(sql, args))[0])[0];
const owner = '11111111-1111-4111-8111-111111111111';
let passed = 0, failed = 0, content, rid, exercise, other, today;
async function role(name) {
  await db.exec(`RESET ROLE; SET ROLE ${name}`);
  await q("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: name, sub: owner })]);
}
async function rpc(name, input) {
  const v = await scalar('SELECT get_training_context()');
  return scalar(`SELECT ${name}($1::jsonb)`, [JSON.stringify({ ...input, expected_state_version: v.versions.state, expected_evidence_version: v.versions.evidence, request_id: crypto.randomUUID() })]);
}
const date = n => scalar('SELECT ($1::date+$2::int)::text', [today, n]);
async function occurrence(key = 'alpha', day = today, revision = rid) {
  return scalar(`INSERT INTO training_session_contexts(revision_id,slot_key,cycle_key,planned_date,timezone,activity_kind,load_tags,snapshot,origin,source_state_version,source_evidence_version)
    SELECT $1,$2,gen_random_uuid(),$3,'America/Montreal',s->>'activity_kind',s->'load_tags',jsonb_build_object('slot',s,'exercises','[]'::jsonb),'retrospective',0,0 FROM (SELECT training_slot($1,$2) s) x RETURNING id`, [revision, key, day]);
}
async function set(sid, { reps = 5, rir = 2, day = today, ex = exercise } = {}) {
  return scalar("INSERT INTO sets(exercise_id,reps,rir,training_session_id,logged_at) VALUES($1,$2,$3,$4,($5::date+time '12:00') AT TIME ZONE 'America/Montreal') RETURNING id", [ex, reps, rir, sid, day]);
}
async function event(kind, sid, payload, revision = rid) {
  return scalar("SELECT training_event($1,$2,$3,$4::jsonb,'owner:fixture')", [kind, revision, sid, JSON.stringify(payload)]);
}
const evaluate = sid => scalar('SELECT training_evaluate($1)', [sid]);
async function reconcile(sid, outcome = 'unknown') {
  await role('authenticated');
  try { return await rpc('record_training_decision', { kind: 'reconcile', session_id: sid, outcome }); }
  finally { await db.exec('RESET ROLE'); }
}
async function test(label, fn) {
  await db.exec('RESET ROLE; BEGIN');
  try { await fn(); passed++; console.log(`ok - ${label}`); }
  catch (e) { failed++; console.error(`not ok - ${label}: ${e.message}`); }
  finally { await db.exec('ROLLBACK; RESET ROLE'); }
}
async function invalid(label, mutate, code) {
  await test(label, async () => {
    const c = structuredClone(content); mutate(c);
    await assert.rejects(() => scalar('SELECT training_validate_revision($1::jsonb)', [JSON.stringify(c)]), e => e.message.includes(code));
  });
}
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); INSERT INTO auth.users VALUES ('${owner}');`);
  await db.exec((await readFile(new URL('../schema.sql', import.meta.url), 'utf8')).split('-- Fuzzy duplicate detection')[0]);
  await db.exec('GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated,service_role;');
  const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
  assert.equal(migrations.length, 4);
  for (const file of migrations) await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  await q("INSERT INTO training_plan_state(id,owner_user_id,athlete_timezone) VALUES(1,$1,'America/Montreal')", [owner]);
  [exercise, other] = (await q("INSERT INTO exercises(name,category) VALUES('Extended squat','strength'),('Extended row','strength') RETURNING id")).map(x => x.id);
  today = await scalar("SELECT (clock_timestamp() AT TIME ZONE 'America/Montreal')::date::text");
  content = {
    schema_version: 1,
    macro: { intent: 'Synthetic only', priorities: [{ capacity: 'strength', mode: 'maintain', success_criteria: 'Hold comparable performance' }], constraints: [], horizon: 'fixture', cardio_recovery_intent: 'low cost' },
    block: { key: 'fixture', purpose: 'Regression fixture', starts_on: await date(-20), expected_until: await date(20), authorized_through: null, phase_profile: { split: 'custom', emphases: ['strength', 'mobility'], rep_emphasis: 'mixed', laterality_emphasis: 'mixed' } },
    sequence: ['alpha', 'beta', 'gamma', 'delta'].map(key => ({ key, activity_kind: 'strength', purpose: key, review_scope: 'block', load_tags: ['resistance', 'full_body'], exercises: [{ exercise_id: exercise, details: 'fixture' }, { exercise_id: other, details: 'optional fixture', optional: true }], qualification: { kind: 'strength_sets', anchors: [{ exercise_ids: [exercise], min_sets: 1, min_reps: 5, max_rir: 3 }], require_work_set_confirmation: true, admissible_sources: ['logged', 'self_reported'], queue_effect: 'advance', out_of_order: 'hold', continuation_days: 2 } })),
    variation_policy: { comparable: 'anchors', allowed: 'accessories', benefit: 'engagement', review_triggers: 'tolerance', transition_rationale: 'fixture only', previous_phase_ids: [] },
    recovery_spacing_rules: [{ id: 'full-body', candidate_tags: ['resistance'], preceding_tags: ['resistance'], predicate: 'intervening_non_strength_days', min_days: 1, require_day_confirmation: true }],
    progression_policy: { build: 'authored', maintain: 'hold', reduce: 'fatigue', recalibrate: 'review' },
    review_policy: { review_due_on: await date(10), exposure_threshold: 2, scope: 'block', concern_triggers: ['pain'] },
    delegation: { supportive_activities: ['cardio', 'mobility', 'rest'], supportive_constraints: { cardio_max_minutes: 30, cardio_max_intensity: 3, mobility_unloaded: true }, routine_review: true, bounded_continuation_days: 3, substitutions: true, stop_conditions: ['pain'] }
  };
  await role('authenticated');
  rid = (await rpc('propose_training_revision', { content })).revision_id;
  await rpc('activate_training_revision', { revision_id: rid, seed_slot_key: 'alpha', pending_intent_action: 'retain' });
  await db.exec('RESET ROLE');

  await invalid('A26 rejects unknown emphasis, not arbitrary category rotation', c => c.block.phase_profile.emphases = ['invented'], 'INVALID_PHASE_PROFILE');
  await invalid('A26 rejects null emphasis', c => c.block.phase_profile.emphases = [null], 'INVALID_PHASE_PROFILE');
  await invalid('A26 rejects structured quality instead of prose criterion', c => c.sequence[0].qualification.required_quality = {}, 'INVALID_QUALITY_CRITERION');
  await invalid('A20 numeric minimum must be JSON number', c => c.sequence[0].qualification.anchors[0].min_sets = '1', 'INVALID_ANCHOR');
  await invalid('A20 numeric exercise reference must be JSON number', c => c.sequence[0].qualification.anchors[0].exercise_ids = [String(exercise)], 'INVALID_EXERCISE_REFERENCE');
  await invalid('A28 null load tag cannot pass validated classification', c => c.sequence[0].load_tags.push(null), 'INVALID_SLOT');
  await invalid('A5 false work confirmation cannot silently claim supported automatic predicate', c => c.sequence[0].qualification.require_work_set_confirmation = false, 'UNSUPPORTED_WORK_SET_PREDICATE');
  await invalid('A6 overlapping anchors cannot count one set twice', c => c.sequence[0].qualification.anchors.push({ exercise_ids: [exercise, other], min_sets: 1 }), 'OVERLAPPING_ANCHORS');
  await invalid('A29 spacing requires typed boolean', c => c.recovery_spacing_rules[0].require_day_confirmation = 'true', 'UNSUPPORTED_SPACING_RULE');

  await test('A3/A4 optional accessories omitted; partial above minimum advances', async () => {
    const sid = await occurrence(); const id = await set(sid);
    await event('clarify_session', sid, { set_ids: [id] });
    const result = await reconcile(sid, 'partial');
    assert.equal(result.qualification, 'qualifies'); assert.equal(result.outcome, 'partial');
    const queue = await scalar('SELECT training_queue()'); assert.equal(queue.next_slot_key, 'beta'); assert.equal(queue.qualifying_exposures, 1);

  });
  await test('A4 below minimum holds regardless of finished outcome', async () => {
    const sid = await occurrence(); const id = await set(sid, { reps: 1 });
    await event('clarify_session', sid, { set_ids: [id] });
    assert.equal((await reconcile(sid, 'finished')).qualification, 'does_not_qualify');
    assert.equal((await scalar('SELECT training_queue()')).next_slot_key, 'alpha');
  });
  await test('A5 explicit warmup-only clarification does not qualify', async () => {
    const sid = await occurrence(); await set(sid); await event('clarify_session', sid, { set_ids: [] });
    assert.equal((await evaluate(sid)).qualification, 'does_not_qualify');
  });
  await test('A5/A20 null effort remains exact missing qualifier, not zero', async () => {
    const sid = await occurrence(); const id = await set(sid, { rir: null });
    await event('clarify_session', sid, { set_ids: [id] });
    const ev = await evaluate(sid); assert.equal(ev.qualification, 'pending'); assert.ok(ev.missing_qualifiers.includes('effort'));
  });
  await test('A6 raw unlinked sets remain visible without workout, including deleted library', async () => {
    const id = await set(null); await q('UPDATE exercises SET is_deleted=true WHERE id=$1', [exercise]);
    await role('authenticated'); const c = await scalar('SELECT get_training_context()');
    assert.ok(c.evidence.sets.some(s => s.id === id && s.library_deleted)); assert.equal(c.queue.qualifying_exposures, 0);
  });
  await test('A8/A21 report-to-log same occurrence, discrepancy stays pending', async () => {
    const sid = await occurrence(); await event('confirm_report', sid, { report: { performed_on: today, work: [{ exercise_id: exercise, sets: 1, reps: 5, rir: 2 }] } });
    assert.equal((await evaluate(sid)).source, 'self_reported');
    const id = await set(sid); await event('clarify_session', sid, { set_ids: [id] });
    assert.equal((await evaluate(sid)).source, 'mixed');
    await q('UPDATE sets SET reps=1 WHERE id=$1', [id]);
    const ev = await evaluate(sid); assert.equal(ev.qualification, 'pending'); assert.ok(ev.missing_qualifiers.includes('report_log_discrepancy'));
  });
  await test('A9 cross-date fragments require continuation; original occurrence only', async () => {
    const day = await date(-1); const sid = await occurrence('alpha', day); const id = await set(sid);
    await event('clarify_session', sid, { set_ids: [id] }); assert.ok((await evaluate(sid)).missing_qualifiers.includes('explicit_continuation'));
    await event('clarify_session', sid, { set_ids: [id], continuation_dates: [today] });
    await reconcile(sid); await reconcile(sid);
    assert.equal((await scalar('SELECT training_queue()')).qualifying_exposures, 1);
  });
  await test('A9/A10/A25 distinct same-day out-of-order occurrences count without skipping custom queue', async () => {
    for (const key of ['beta', 'gamma']) {
      const sid = await occurrence(key); const id = await set(sid); await event('clarify_session', sid, { set_ids: [id] }); await reconcile(sid);
    }
    const queue = await scalar('SELECT training_queue()'); assert.equal(queue.qualifying_exposures, 2); assert.equal(queue.next_slot_key, 'alpha');
  });
  await test('A12 exposure review trigger survives later correction', async () => {
    const ids = [];
    for (const key of ['alpha', 'beta']) {
      const sid = await occurrence(key); const id = await set(sid); ids.push(id); await event('clarify_session', sid, { set_ids: [id] }); await reconcile(sid);
    }
    const before = await scalar('SELECT training_review()'); assert.ok(before.reasons.some(r => r.reason === 'exposure'));
    await q('UPDATE sets SET is_deleted=true WHERE id=$1', [ids[0]]); await scalar('SELECT training_sync_review()');
    assert.deepEqual((await scalar('SELECT training_review()')).reasons, before.reasons);
  });
  await test('A27/A29 completed intervening day required; reservations alone are not performed work', async () => {
    const day = await date(-2); await set(null, { day });
    let ev = await scalar("SELECT training_eligibility($1,'strength')", [today]); assert.equal(ev.eligible_on_or_after, null);
    await event('confirm_day', null, { date: await date(-1), complete: true, non_strength: true });
    ev = await scalar("SELECT training_eligibility($1,'strength')", [today]); assert.equal(ev.eligible, true);
    await occurrence('alpha', await date(-1)); assert.equal((await scalar("SELECT training_eligibility($1,'strength')", [today])).eligible, true);
    await set(null, { day: await date(-1), reps: 1 }); assert.equal((await scalar("SELECT training_eligibility($1,'strength')", [today])).eligible, false);
  });
  await test('A29 later spacing rule cannot replace unknown earliest date with certainty', async () => {
    const c = structuredClone(content);
    c.recovery_spacing_rules.push({ ...c.recovery_spacing_rules[0], id: 'second-rule', min_days: 2 });
    await role('authenticated'); const r = (await rpc('propose_training_revision', { content: c })).revision_id;
    await rpc('activate_training_revision', { revision_id: r, seed_slot_key: 'alpha', pending_intent_action: 'retain' });
    await db.exec('RESET ROLE'); await set(null, { day: await date(-2) });
    const ev = await scalar("SELECT training_eligibility($1,'strength')", [today]);
    assert.ok(ev.reasons.includes('INCOMPLETE_INTERVENING_DAY_EVIDENCE'));
    assert.equal(ev.eligible_on_or_after, null);
  });
  await test('A26 independent power, performance, mobility dimensions accept authored quality', async () => {
    const c = structuredClone(content);
    c.block.phase_profile = { split: 'upper_lower', emphases: ['power', 'performance', 'mobility'], rep_emphasis: 'low', laterality_emphasis: 'unilateral' };
    for (const slot of c.sequence) slot.qualification.required_quality = 'Athlete confirms controlled landing and maintained movement speed';
    await scalar('SELECT training_validate_revision($1::jsonb)', [JSON.stringify(c)]);
    await role('authenticated'); const r = (await rpc('propose_training_revision', { content: c })).revision_id;
    await db.exec('RESET ROLE'); const sid = await occurrence('alpha', today, r); const id = await set(sid);
    await event('clarify_session', sid, { set_ids: [id] }, r);
    assert.ok((await evaluate(sid)).missing_qualifiers.includes('required_quality_evidence'));
    await event('clarify_session', sid, { set_ids: [id], quality: c.sequence[0].qualification.required_quality }, r);
    assert.equal((await evaluate(sid)).qualification, 'qualifies');
  });
  await test('A23 athlete-local DST boundary preserves complete dates', async () => {
    const id = await scalar("INSERT INTO sets(exercise_id,logged_at) VALUES($1,'2026-11-02T04:30:00Z') RETURNING id", [exercise]);
    assert.equal(await scalar("SELECT load_date::text FROM training_load_dates('America/Montreal') WHERE source='set' AND source_id=$1", [String(id)]), '2026-11-01');
  });
  await test('A30 cardio exact raw evidence changes fingerprint, mixed source and correction', async () => {
    const c = structuredClone(content); c.sequence = [{ key: 'aerobic', activity_kind: 'cardio', purpose: 'Cardio objective', review_scope: 'block', load_tags: ['cardio'], exercises: [], qualification: { kind: 'cardio_minutes', anchors: [], min_minutes: 20, require_work_set_confirmation: false, admissible_sources: ['logged', 'self_reported'], queue_effect: 'advance', out_of_order: 'hold', continuation_days: 1 } }];
    await role('authenticated'); const cr = (await rpc('propose_training_revision', { content: c })).revision_id;
    await db.exec('RESET ROLE'); const sid = await occurrence('aerobic', today, cr);
    const cs = await scalar("INSERT INTO cardio_sessions(date,duration_minutes,exercise_id) SELECT $1,25,id FROM exercises WHERE name='Zone 2' RETURNING id", [today]);
    await event('confirm_report', sid, { report: { performed_on: today, minutes: 25 } }, cr);
    await event('clarify_session', sid, { set_ids: [], cardio_session_ids: [cs] }, cr);
    const first = await evaluate(sid); assert.equal(first.qualification, 'qualifies'); assert.equal(first.source, 'mixed');
    await q('UPDATE cardio_sessions SET duration_minutes=30 WHERE id=$1', [cs]); const changed = await evaluate(sid);
    assert.notEqual(changed.fingerprint, first.fingerprint); assert.equal(changed.qualification, 'pending');
    await q('UPDATE cardio_sessions SET is_deleted=true WHERE id=$1', [cs]);
    assert.equal((await evaluate(sid)).source, 'self_reported');
  });
  await test('F3 cross-slot same-day attribution requires identified distinct occurrences; no global day cap', async () => {
    await role('authenticated');
    await rpc('record_training_decision', { kind: 'attribute_occurrence', revision_id: rid, slot_key: 'alpha', performed_on: today, set_ids: [], duplicate_checked: true, reason: 'First actual session' });
    await assert.rejects(() => rpc('record_training_decision', { kind: 'attribute_occurrence', revision_id: rid, slot_key: 'beta', performed_on: today, set_ids: [], duplicate_checked: true, reason: 'Ambiguous shared-anchor work' }), /POTENTIAL_DUPLICATE_OCCURRENCE/);
  });
  await test('F3 owner identifies separate same-day sessions before separate reports', async () => {
    await role('authenticated');
    const first = await rpc('record_training_decision', { kind: 'attribute_occurrence', revision_id: rid, slot_key: 'alpha', performed_on: today, set_ids: [], duplicate_checked: true, reason: 'Morning session' });
    const second = await rpc('record_training_decision', { kind: 'attribute_occurrence', revision_id: rid, slot_key: 'beta', performed_on: today, set_ids: [], distinct_from_session_ids: [first.session_id], duplicate_checked: true, reason: 'Separate evening session, not fragments' });
    for (const s of [first, second]) await rpc('record_training_decision', { kind: 'confirm_report', session_id: s.session_id, report: { performed_on: today, work: [{ exercise_id: exercise, sets: 1, reps: 5, rir: 2 }] }, duplicate_checked: true, reason: 'Actual separate work' });
    const c = await scalar('SELECT get_training_context()'); assert.equal(c.queue.qualifying_exposures, 2);
  });
  await test('A14 linked routine changes preserve snapshots and repeated deviations surface review', async () => {
    await role('authenticated');
    const s = await rpc('materialize_training_session', { target_date: today, activity_kind: 'strength', slot_key: 'alpha', reason: 'Fixture intent', revisit_on: await date(1) });
    await db.exec('RESET ROLE'); const original = await scalar('SELECT snapshot FROM training_session_contexts WHERE id=$1', [s.session_id]);
    const row = await scalar('SELECT id FROM workouts_exercises WHERE workout_id=$1 ORDER BY sort_order LIMIT 1', [s.workout_id]);
    await role('authenticated');
    for (let i=0;i<2;i++) await rpc('mutate_training_workout', { operation: 'update_workout_exercise', mode: 'linked', args: { workout_exercise_id: row, details: 'Reduced target '+i }, reason: 'Pain reduction within unchanged anchor', revisit_on: await date(1) });
    const c = await scalar('SELECT get_training_context()'); assert.equal(c.review.review_due,true); assert.ok(c.review.open_concerns.some(e => e.payload.code === 'deviation_review'));
    assert.equal(c.sessions.find(x => x.id===s.session_id).prescription_diverged,false);
    await db.exec('RESET ROLE'); assert.deepEqual(await scalar('SELECT snapshot FROM training_session_contexts WHERE id=$1',[s.session_id]),original);
  });
  await test('A17 explicit authorization expiry blocks linked intent, not elapsed expected window alone', async () => {
    const c = structuredClone(content); c.block.authorized_through = await date(-1); c.block.expected_until = await date(-2);
    await role('authenticated'); const revision = (await rpc('propose_training_revision',{content:c})).revision_id;
    await rpc('activate_training_revision',{revision_id:revision,seed_slot_key:'alpha',pending_intent_action:'retain'});
    const context = await scalar('SELECT get_training_context()'); assert.ok(context.activity_eligibility.strength.reasons.includes('AUTHORIZATION_EXPIRED'));
    await assert.rejects(()=>rpc('materialize_training_session',{target_date:today,activity_kind:'strength',slot_key:'alpha',reason:'Expired fixture',revisit_on:today}),/AUTHORIZATION_EXPIRED/);
  });
  await test('A13 reached continuation is not an automatic renewed permission', async () => {
    await event('review_due',null,{reason:'concern',trigger_key:'fixture-revisit',original_due_on:today});
    const due = await scalar("SELECT id::text FROM training_plan_events WHERE kind='review_due' AND payload->>'trigger_key'='fixture-revisit'");
    await event('bounded_continuation',null,{review_event_ids:[due],evidence:{fixture:true},reason:'Previously bounded',revisit_on:today});
    await assert.rejects(()=>scalar('SELECT training_check_review($1)',[today]),/REVIEW_HANDLING_REQUIRED/);
  });
  console.log(`RESULT ${passed} passed; ${failed} failed (disposable PGlite)`);
  if (failed) process.exitCode = 1;
} finally { await db.close(); }

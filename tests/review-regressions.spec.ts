// Smith R1–R5: actual unshipped SQL, disposable PGlite, no dotenv/live endpoints.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createLocalTrainingServer } from './support/local-training-server';
// Deliberately inspect dynamic SQL JSON, not a mocked production contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;
export type Fixture = Awaited<ReturnType<typeof createLocalTrainingServer>>;
export async function sql(f: Fixture, query: string, args: unknown[] = []): Promise<Json[]> {
  return f.admin(async db => (await db.query(query, args)).rows);
}
export async function activate(f: Fixture, content: Json = f.content, pending = 'retain') {
  const p = await f.mutate('propose_training_revision', { content });
  await f.mutate('activate_training_revision', { revision_id: p.revision_id, seed_slot_key: content.sequence[0].key, pending_intent_action: pending });
  return p.revision_id;
}
export async function attribute(f: Fixture, rid: string, key = 'alpha', day = f.yesterday, distinct: string[] = []) {
  return (await f.mutate('record_training_decision', { kind: 'attribute_occurrence', revision_id: rid, slot_key: key, performed_on: day, set_ids: [], distinct_from_session_ids: distinct, duplicate_checked: true, reason: 'Synthetic actual occurrence, not a prescription' })).session_id;
}
export const decision = (f: Fixture, input: Json) => f.mutate('record_training_decision', { reason: 'Synthetic review regression', ...input });
export const report = (f: Fixture, sid: string, value: Json) => decision(f, { kind: 'confirm_report', session_id: sid, duplicate_checked: true, report: value });
export const materialize = (f: Fixture, extra: Json = {}) => f.mutate('materialize_training_session', { target_date: f.today, activity_kind: 'strength', slot_key: 'alpha', reason: 'Synthetic intent', revisit_on: f.tomorrow, ...extra });
export async function withFixture(fn: (f: Fixture) => Promise<void>) {
  const f = await createLocalTrainingServer({ port: 0 });
  try { await fn(f); } finally { await f.close(); }
  await assert.rejects(fetch(f.url), /fetch failed/, 'disposable listener closed');
}

export function modalityContent(f: Fixture, kind: 'cardio' | 'mobility', source = 'self_reported'): Json {
  const content: Json = structuredClone(f.content);
  content.sequence = [{ ...content.sequence[0], activity_kind: kind, load_tags: [kind], exercises: [], qualification: {
    kind: kind === 'cardio' ? 'cardio_minutes' : 'reported_objective', anchors: [], require_work_set_confirmation: false,
    ...(kind === 'cardio' ? { min_minutes: 20 } : { objective: 'unloaded movement' }),
    admissible_sources: [source], queue_effect: 'advance', out_of_order: 'hold', continuation_days: 2,
  } }];
  return content;
}

// Keep the fixture helpers reusable by browser tests without registering node tests.
if (process.argv[1]?.endsWith('review-regressions.spec.ts')) {
  test('A10 authored out-of-order advance follows the completed slot through a complete cycle', async () => withFixture(async f => {
    const content: Json = structuredClone(f.content);
    content.sequence.push({ ...structuredClone(content.sequence[0]), key: 'gamma' });
    for (const slot of content.sequence) slot.qualification.out_of_order = 'advance';
    const rid = await activate(f, content);
    const ids: string[] = [];
    for (const [key, expected] of [['beta', 'gamma'], ['gamma', 'alpha'], ['alpha', 'beta']]) {
      const sid = await attribute(f, rid, key, f.yesterday, ids); ids.push(sid);
      await report(f, sid, { performed_on: f.yesterday, work: [{ exercise_id: f.exercise, sets: 1, reps: 5, rir: 2 }] });
      assert.equal((await f.rpc('get_training_context')).queue.next_slot_key, expected);
    }
    assert.equal((await f.rpc('get_training_context')).queue.qualifying_exposures, 3);
  }));

  test('A14 read synchronizes a reached deviation revisit once, and bounded handling does not expire authority', async () => withFixture(async f => {
    const rid = await activate(f); const intent = await materialize(f);
    // Seed retained history whose revisit has now arrived, rather than change the
    // host clock or pretend a future revisit passed during this short test.
    const event = (await sql(f, "SELECT training_event('deviation',$1,$2,$3::jsonb,'owner:fixture') id", [rid, intent.session_id, JSON.stringify({ reason: 'Historical synthetic deviation', revisit_on: f.today })]))[0].id;
    let c = await f.rpc('get_training_context');
    const reached = c.review.open_concerns.filter((v: Json) => v.payload.deviation_event_id === event);
    assert.equal(reached.length, 1); assert.equal(reached[0].payload.code, 'deviation_revisit');
    assert.equal(c.review.review_due, true); assert.equal(c.authority.lifecycle, 'active');
    await assert.rejects(materialize(f, { activity_kind: 'rest', slot_key: undefined }), /REVIEW_HANDLING_REQUIRED/);
    await decision(f, { kind: 'bounded_continuation', review_event_ids: c.review.reasons.map((v: Json) => v.event_id), evidence: { summary: 'Review reached date, keep bounds' }, revisit_on: f.tomorrow });
    c = await f.rpc('get_training_context');
    assert.equal(c.review.open_concerns.filter((v: Json) => v.payload.deviation_event_id === event).length, 1);
    assert.equal(c.review.review_due, true); assert.equal(c.authority.lifecycle, 'active');
    await materialize(f, { activity_kind: 'rest', slot_key: undefined });
  }));

  test('R1 effective day confirmation resets spacing; correction never overrides real sets', async () => withFixture(async f => {
    await activate(f);
    const old = (await sql(f, 'SELECT ($1::date-3)::text d', [f.today]))[0].d;
    const gap = (await sql(f, 'SELECT ($1::date-2)::text d', [f.today]))[0].d;
    await sql(f, "INSERT INTO sets(exercise_id,reps,logged_at) VALUES($1,1,($2::date+time '12:00') AT TIME ZONE 'America/Montreal')", [f.exercise, old]);
    await decision(f, { kind: 'confirm_day', date: gap, non_strength: true, complete: true });
    await decision(f, { kind: 'confirm_day', date: f.yesterday, non_strength: false, complete: true });
    let c = await f.rpc('get_training_context');
    assert.equal(c.activity_eligibility.strength.eligible, false);
    assert(c.activity_eligibility.strength.reasons.includes('RECOVERY_SPACING_NOT_MET'));
    const loads = await sql(f, "SELECT * FROM training_load_dates('America/Montreal') WHERE source='day_confirmation'");
    assert.equal(loads.length, 1); assert.equal(loads[0].load_date.toISOString().slice(0, 10), f.yesterday);
    assert.deepEqual(loads[0].tags, ['resistance', 'systemic']);
    assert(loads[0].unresolved_tags.includes('upper'));
    assert.equal(c.queue.qualifying_exposures, 0);
    await decision(f, { kind: 'confirm_day', date: f.yesterday, non_strength: true, complete: true });
    assert.equal((await f.rpc('get_training_context')).activity_eligibility.strength.eligible, true);
    await sql(f, "INSERT INTO sets(exercise_id,reps,logged_at) VALUES($1,1,($2::date+time '12:00') AT TIME ZONE 'America/Montreal')", [f.exercise, f.yesterday]);
    c = await f.rpc('get_training_context');
    assert.equal(c.activity_eligibility.strength.eligible, false);
    assert.equal((await sql(f, "SELECT * FROM training_load_dates('America/Montreal') WHERE source='day_confirmation'")).length, 0);
  }));

  test('R1 unknown regional day load blocks only dependent rules across revision changes', async () => withFixture(async f => {
    await activate(f);
    await decision(f, { kind: 'confirm_day', date: f.yesterday, non_strength: false, complete: true });
    const next: Json = structuredClone(f.content); next.block.key = 'regional';
    next.recovery_spacing_rules = [{ id: 'regional', candidate_tags: ['resistance'], preceding_tags: ['upper'], predicate: 'min_calendar_days', min_days: 2, require_day_confirmation: false }];
    await activate(f, next);
    const c = await f.rpc('get_training_context');
    assert(c.activity_eligibility.strength.reasons.includes('LOAD_CLASSIFICATION_REQUIRED'));
    assert.equal(c.activity_eligibility.rest.eligible, true);
    assert.equal(c.queue.qualifying_exposures, 0);
  }));

  test('R5 latest corrected report removes phantom work but retains history and nonqualifying actual load', async () => withFixture(async f => {
    const rid = await activate(f); const sid = await attribute(f, rid);
    await report(f, sid, { performed_on: f.yesterday, work: [{ exercise_id: f.exercise, sets: 1, reps: 5, rir: 2 }] });
    await report(f, sid, { performed_on: f.yesterday, work: [] });
    await decision(f, { kind: 'queue_correction', next_slot_key: 'alpha', evidence: { summary: 'Erroneous report corrected to no work' } });
    let c = await f.rpc('get_training_context');
    assert.equal(c.queue.qualifying_exposures, 0); assert.equal(c.queue.confidence, 'resolved');
    assert.equal(c.activity_eligibility.strength.eligible, true);
    assert.equal((await sql(f, "SELECT * FROM training_load_dates('America/Montreal') WHERE source='report'")).length, 0);
    assert.equal((await f.rpc('get_training_history', { session_id: sid })).events.filter((e: Json) => e.kind === 'confirm_report').length, 2);
    await report(f, sid, { performed_on: f.yesterday, work: [{ exercise_id: f.exercise, sets: 1, reps: 1, rir: 9 }] });
    c = await f.rpc('get_training_context');
    assert.equal(c.queue.qualifying_exposures, 0); assert.equal(c.activity_eligibility.strength.eligible, false);
  }));

  test('R5 evidence-scoped resolutions and changed load/date: stale resolutions never erase new work or raw sets', async () => withFixture(async f => {
    const content: Json = structuredClone(f.content);
    content.sequence = [{ ...content.sequence[0], activity_kind: 'mobility', load_tags: ['mobility'], exercises: [], qualification: { kind: 'reported_objective', anchors: [], require_work_set_confirmation: false, objective: 'unloaded movement', admissible_sources: ['self_reported'], queue_effect: 'advance', out_of_order: 'hold', continuation_days: 2 } }];
    const rid = await activate(f, content); const sid = await attribute(f, rid);
    await report(f, sid, { performed_on: f.yesterday, objective_met: true, load_tags: ['mobility', 'resistance'] });
    await decision(f, { kind: 'resolve_report', session_id: sid, resolution: 'use_logs' });
    assert.equal((await sql(f, "SELECT * FROM training_load_dates('America/Montreal') WHERE source='report'")).length, 0);
    // A corrected report is new evidence, so the previous resolution is stale.
    await report(f, sid, { performed_on: f.yesterday, objective_met: true, load_tags: ['mobility'] });
    let loads = await sql(f, "SELECT * FROM training_load_dates('America/Montreal') WHERE source='report'");
    assert.equal(loads.length, 1); assert(!loads[0].tags.includes('resistance'));
    await decision(f, { kind: 'clarify_session', session_id: sid, set_ids: [], continuation_dates: [f.today] });
    await report(f, sid, { performed_on: f.today, objective_met: true, load_tags: ['mobility', 'resistance'] });
    loads = await sql(f, "SELECT * FROM training_load_dates('America/Montreal') WHERE source='report'");
    assert.equal(loads.length, 1); assert.equal(loads[0].load_date.toISOString().slice(0, 10), f.today); assert(loads[0].tags.includes('resistance'));
    await decision(f, { kind: 'resolve_report', session_id: sid, resolution: 'use_report' });
    await sql(f, "INSERT INTO sets(exercise_id,reps,training_session_id,logged_at) VALUES($1,1,$2,($3::date+time '12:00') AT TIME ZONE 'America/Montreal')", [f.exercise, sid, f.yesterday]);
    await decision(f, { kind: 'resolve_report', session_id: sid, resolution: 'use_logs' });
    loads = await sql(f, "SELECT * FROM training_load_dates('America/Montreal')");
    assert(loads.some(l => l.source === 'set')); assert(!loads.some(l => l.source === 'report'));
    await decision(f, { kind: 'resolve_report', session_id: sid, resolution: 'use_report' });
    assert((await sql(f, "SELECT * FROM training_load_dates('America/Montreal')")).some(l => l.source === 'set'), 'use_report must not discard independently recorded sets');
    await decision(f, { kind: 'resolve_report', session_id: sid, resolution: 'use_logs' });
    // Raw edits invalidate that resolution, even though qualification isn't the filter.
    await sql(f, 'UPDATE sets SET reps=2 WHERE training_session_id=$1', [sid]);
    loads = await sql(f, "SELECT * FROM training_load_dates('America/Montreal')");
    assert(loads.some(l => l.source === 'set')); assert(loads.some(l => l.source === 'report'));
  }));

  test('R2 exact cardio proposal and deliberate corrected reference; owner-only and mismatched references rejected', async () => withFixture(async f => {
    const rid = await activate(f); const sid = await attribute(f, rid);
    const original = { performed_on: f.yesterday, minutes: 25 };
    const p = await decision(f, { kind: 'propose_report', session_id: sid, report: original });
    await decision(f, { kind: 'confirm_report', session_id: sid, report: original, proposal_event_id: p.decision_event_id, duplicate_checked: true });
    await assert.rejects(decision(f, { kind: 'confirm_report', session_id: sid, report: { ...original, minutes: 30 }, proposal_event_id: p.decision_event_id, duplicate_checked: true }), /INVALID_REPORT_PROPOSAL/);
    await decision(f, { kind: 'confirm_report', session_id: sid, report: { ...original, minutes: 30 }, corrected_proposal_event_id: p.decision_event_id, duplicate_checked: true });
    await assert.rejects(decision(f, { kind: 'confirm_report', session_id: sid, report: original, corrected_proposal_event_id: p.decision_event_id, duplicate_checked: true }), /INVALID_REPORT_CORRECTION/);
    await assert.rejects(decision(f, { kind: 'confirm_report', session_id: sid, report: { ...original, minutes: 30 }, corrected_proposal_event_id: randomUUID(), duplicate_checked: true }), /INVALID_REPORT_CORRECTION/);
    await assert.rejects(f.mutate('record_training_decision', { kind: 'confirm_report', session_id: sid, report: original, duplicate_checked: true, reason: 'coach is not owner' }, 'service_role'), /AUTHORITY_REQUIRED/);
  }));

  test('R3 logged primary cardio exposes precise association, never auto-links and rejects duplicate reuse', async () => withFixture(async f => {
    const content: Json = structuredClone(f.content);
    content.sequence = [{ ...content.sequence[0], activity_kind: 'cardio', load_tags: ['cardio'], exercises: [], qualification: { kind: 'cardio_minutes', anchors: [], require_work_set_confirmation: false, min_minutes: 20, admissible_sources: ['logged'], queue_effect: 'advance', out_of_order: 'hold', continuation_days: 1 } }];
    const rid = await activate(f, content); const sid = await attribute(f, rid);
    const id = (await sql(f, 'INSERT INTO cardio_sessions(exercise_id,date,duration_minutes) VALUES($1,$2,25) RETURNING id', [f.exercise, f.yesterday]))[0].id;
    let c = await f.rpc('get_training_context');
    assert(c.evidence.pending_qualifiers.some((q: Json) => q.session_id === sid && q.missing_qualifiers.includes('cardio_association')));
    assert.equal(c.queue.qualifying_exposures, 0);
    await decision(f, { kind: 'clarify_session', session_id: sid, set_ids: [], cardio_session_ids: [id] });
    c = await f.rpc('get_training_context'); assert.equal(c.queue.qualifying_exposures, 1);
    const other = await attribute(f, rid, 'alpha', f.yesterday, [sid]);
    await assert.rejects(decision(f, { kind: 'clarify_session', session_id: other, set_ids: [], cardio_session_ids: [id] }), /INVALID_CARDIO_ASSOCIATION/);
    await assert.rejects(decision(f, { kind: 'clarify_session', session_id: sid, set_ids: [], cardio_session_ids: [id, id] }), /INVALID_CARDIO_IDS/);
  }));

  test('R4 explicit cancelled reissue reuses dated workout, keeps snapshots and exact replay, never credits intent', async () => withFixture(async f => {
    await activate(f); const old = await materialize(f);
    const before = await f.rpc('get_training_history', { session_id: old.session_id });
    await decision(f, { kind: 'cancel_session', session_id: old.session_id });
    await assert.rejects(materialize(f), /WORKOUT_CONFLICT/);
    const c = await f.rpc('get_training_context');
    const input = { target_date: f.today, activity_kind: 'strength', slot_key: 'alpha', reason: 'Explicit reissue', revisit_on: f.tomorrow, replace_cancelled_session_id: old.session_id, request_id: randomUUID(), expected_state_version: c.versions.state, expected_evidence_version: c.versions.evidence };
    const replacement = await f.rpc('materialize_training_session', input);
    assert.notEqual(replacement.session_id, old.session_id); assert.equal(replacement.workout_id, old.workout_id);
    assert.deepEqual(await f.rpc('materialize_training_session', input), replacement);
    assert.deepEqual((await f.rpc('get_training_history', { session_id: old.session_id })).sessions[0].snapshot, before.sessions[0].snapshot);
    const after = await f.rpc('get_training_context'); assert.equal(after.sessions.length, 2); assert.equal(after.queue.qualifying_exposures, 0); assert.equal(after.queue.next_slot_key, 'alpha');
    await assert.rejects(materialize(f, { replace_cancelled_session_id: old.session_id }), /WORKOUT_CONFLICT|PENDING_SESSION_CONFLICT/);
  }));

  test('R4 no-spacing plan still refuses actual work, freeform workout and foreign/date targets', async () => withFixture(async f => {
    const content: Json = structuredClone(f.content); content.recovery_spacing_rules = [];
    await activate(f, content); const old = await materialize(f);
    await assert.rejects(materialize(f, { replace_cancelled_session_id: old.session_id }), /PENDING_SESSION_CONFLICT|WORKOUT_CONFLICT/);
    await decision(f, { kind: 'cancel_session', session_id: old.session_id });
    await assert.rejects(materialize(f, { target_date: f.tomorrow, replace_cancelled_session_id: old.session_id }), /WORKOUT_CONFLICT/);
    await sql(f, 'INSERT INTO workouts(date) VALUES($1)', [f.tomorrow]);
    await assert.rejects(materialize(f, { target_date: f.tomorrow }), /WORKOUT_CONFLICT/);
    await assert.rejects(materialize(f, { replace_cancelled_session_id: randomUUID() }), /WORKOUT_CONFLICT/);
    const before = await sql(f, 'SELECT * FROM workouts_exercises WHERE workout_id=$1', [old.workout_id]);
    await sql(f, "INSERT INTO sets(exercise_id,reps,training_session_id,logged_at) VALUES($1,1,$2,($3::date+time '12:00') AT TIME ZONE 'America/Montreal')", [f.exercise, old.session_id, f.today]);
    await assert.rejects(materialize(f, { replace_cancelled_session_id: old.session_id }), /REISSUE_ACTUAL_WORK_CONFLICT/);
    assert.deepEqual(await sql(f, 'SELECT * FROM workouts_exercises WHERE workout_id=$1', [old.workout_id]), before);
    assert.equal((await f.rpc('get_training_context')).sessions.length, 1);
  }));

  test('R4 activation-cancelled phase can reissue; actual work or freeform/uncancelled intent cannot be overwritten', async () => withFixture(async f => {
    await activate(f); const old = await materialize(f);
    const next: Json = structuredClone(f.content); next.block.key = 'next'; next.sequence[0].exercises[0].details = 'Changed phase intent';
    await activate(f, next, 'cancel');
    const replacement = await materialize(f, { replace_cancelled_session_id: old.session_id });
    assert.equal(replacement.workout_id, old.workout_id);
    await decision(f, { kind: 'cancel_session', session_id: replacement.session_id });
    await sql(f, "INSERT INTO sets(exercise_id,reps,training_session_id,logged_at) VALUES($1,1,$2,($3::date+time '12:00') AT TIME ZONE 'America/Montreal')", [f.exercise, replacement.session_id, f.today]);
    await assert.rejects(materialize(f, { replace_cancelled_session_id: replacement.session_id }), /RECOVERY_SPACING_NOT_MET|REISSUE_ACTUAL_WORK_CONFLICT/);
    assert.equal((await sql(f, 'SELECT training_session_id FROM sets'))[0].training_session_id, replacement.session_id);
    assert.equal((await f.rpc('get_training_context')).queue.qualifying_exposures, 0);
  }));
}

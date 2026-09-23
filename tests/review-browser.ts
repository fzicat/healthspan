// Bounded Smith repair journeys. Real SQL and real browser; only setup is synthetic.
import assert from 'node:assert/strict';
import { expect, type Page, type Locator } from '@playwright/test';
import { appURL } from './support/local-training-server';
import { activate, attribute, decision, materialize, modalityContent, sql, type Fixture, type Json } from './review-regressions.spec';

export async function reviewBrowser(page: Page, reset: () => Promise<Fixture>, check: (name: string, fn: () => Promise<void>) => Promise<boolean>, shot: (name: string) => Promise<void>) {
  async function evidence() {
    await page.goto(`${appURL}/training/manage`);
    await page.getByRole('button', { name: 'Reports & clarification', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Actual work & missing evidence', exact: true })).toBeVisible();
  }
  async function submit(form: Locator, button: string, rpc = 'record_training_decision') {
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith(`/rpc/${rpc}`) && r.request().method() === 'POST'),
      form.getByRole('button', { name: button, exact: true }).click(),
    ]);
    assert.equal(response.ok(), true, await response.text());
    // Cancelling unmounts the linked editor after verified refresh.
    if (button !== 'Cancel intent — preserve history') await expect(page.getByText(/Saved and verified/).first()).toBeVisible();
    return { input: response.request().postDataJSON().p_input as Json, result: await response.json() as Json };
  }
  for (const correcting of [false, true]) await check(`R2-browser-${correcting ? 'corrected' : 'exact'}-cardio-proposal`, async () => {
    const f = await reset(); const rid = await activate(f, modalityContent(f, 'cardio'));
    const sid = await attribute(f, rid);
    const original = { performed_on: f.yesterday, minutes: 25 };
    const p = await decision(f, { kind: 'propose_report', session_id: sid, report: original });
    await evidence();
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Confirm proposed athlete report', exact: true }) });
    await expect(form.getByRole('button', { name: 'Confirm my report', exact: true })).toBeDisabled();
    if (correcting) {
      await form.getByRole('button', { name: 'Correct proposed report', exact: true }).click();
    }
    const current = page.locator('form').filter({ has: page.getByRole('heading', { name: correcting ? 'Correct proposed athlete report' : 'Confirm proposed athlete report', exact: true }) });
    if (correcting) await current.getByLabel('Actual minutes', { exact: true }).fill('30');
    await current.getByLabel(/I confirm this describes my actual work/).check();
    const saved = await submit(current, correcting ? 'Confirm corrected report' : 'Confirm my report');
    assert.deepEqual(saved.input.report, correcting ? { ...original, minutes: 30 } : original);
    assert.equal(saved.input[correcting ? 'corrected_proposal_event_id' : 'proposal_event_id'], p.decision_event_id);
    assert.equal(correcting ? saved.input.proposal_event_id : saved.input.corrected_proposal_event_id, undefined);
    assert.equal((await f.rpc('get_training_context')).queue.qualifying_exposures, 1);
    assert.equal((await sql(f, 'SELECT count(*)::int n FROM cardio_sessions'))[0].n, 0);
    await expect(page.getByRole('heading', { name: /proposed athlete report/ })).toHaveCount(0);
    await shot(correcting ? '11-corrected-report' : '11-exact-report');
  });
  await check('R2-browser-direct-mobility-objective-explicit-load-confirmation', async () => {
    const f = await reset(); const rid = await activate(f, modalityContent(f, 'mobility')); const sid = await attribute(f, rid);
    await evidence(); await page.getByRole('button', { name: 'Report unlogged work', exact: true }).click();
    await page.getByRole('combobox', { name: /^Occurrence/ }).selectOption(sid);
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Report actual unlogged work', exact: true }) });
    await form.getByLabel(/I achieved the specified objective/).check();
    await form.getByLabel('Report / explanation', { exact: true }).fill('Synthetic unloaded movement performed, no invented logged volume');
    await form.getByLabel(/I confirm this describes my actual work/).check();
    await expect(form.getByRole('button', { name: 'Confirm my report' })).toBeDisabled();
    await form.getByLabel('mobility', { exact: true }).check();
    await form.getByLabel(/I explicitly confirm these load/).check();
    await form.getByLabel(/I confirm this describes my actual work/).check();
    const saved = await submit(form, 'Confirm my report');
    assert.deepEqual(saved.input.report.load_tags, ['mobility']);
    assert.equal((await f.rpc('get_training_context')).queue.qualifying_exposures, 1);
    assert.equal((await sql(f, 'SELECT count(*)::int n FROM sets'))[0].n, 0);
    await shot('12-mobility-report');
  });
  await check('R5-browser-correct-to-no-work-and-explicit-queue-repair', async () => {
    const f = await reset(); const rid = await activate(f); const sid = await attribute(f, rid);
    await decision(f, { kind: 'confirm_report', session_id: sid, report: { performed_on: f.yesterday, work: [{ exercise_id: f.exercise, sets: 1, reps: 5, rir: 2 }] }, duplicate_checked: true });
    await evidence(); await page.getByRole('button', { name: 'Report unlogged work', exact: true }).click();
    await page.getByRole('combobox', { name: /^Occurrence/ }).selectOption(sid);
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Report actual unlogged work', exact: true }) });
    await form.getByRole('button', { name: 'Add work performed', exact: true }).click();
    await form.getByRole('button', { name: 'Remove reported anchor', exact: true }).click();
    await form.getByLabel('Report / explanation').fill('Correction: the previously reported work did not occur');
    await form.getByLabel(/I confirm this describes my actual work/).check();
    const saved = await submit(form, 'Confirm my report'); assert.deepEqual(saved.input.report.work, []);
    let c = await f.rpc('get_training_context'); assert.equal(c.queue.qualifying_exposures, 0); assert.equal(c.queue.confidence, 'unresolved');
    await page.getByRole('button', { name: 'Current', exact: true }).click();
    await page.getByText('Record review, concern or queue correction', { exact: true }).click();
    const correction = page.locator('form').filter({ has: page.getByRole('button', { name: 'Record attributed decision', exact: true }) });
    await correction.getByRole('combobox', { name: /^Decision/ }).selectOption('queue_correction');
    await correction.getByLabel('Reasoning', { exact: true }).fill('Report removed; explicitly restore pending alpha');
    await correction.getByLabel('Evidence, source IDs & uncertainty').fill(`No raw logs; corrected occurrence ${sid}`);
    await correction.getByRole('combobox', { name: /^Explicit next slot/ }).selectOption('alpha');
    await submit(correction, 'Record attributed decision');
    c = await f.rpc('get_training_context'); assert.equal(c.queue.confidence, 'resolved'); assert.equal(c.activity_eligibility.strength.eligible, true);
    assert.equal((await f.rpc('get_training_history', { session_id: sid })).events.filter((v: Json) => v.kind === 'confirm_report').length, 2);
    await shot('12-corrected-no-work');
  });
  await check('R3-browser-logged-cardio-selection-and-duplicate-association-refusal', async () => {
    const f = await reset(); const rid = await activate(f, modalityContent(f, 'cardio', 'logged')); const sid = await attribute(f, rid);
    const cardioEx = (await sql(f, "INSERT INTO exercises(name,category) VALUES('Synthetic recovery cycle','cardio') RETURNING id"))[0].id;
    const id = (await sql(f, 'INSERT INTO cardio_sessions(exercise_id,date,duration_minutes,perceived_intensity) VALUES($1,$2,25,2) RETURNING id', [cardioEx, f.yesterday]))[0].id;
    await evidence();
    let form = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: sid }) });
    await form.locator('summary').click();
    await expect(form.getByText(/Synthetic recovery cycle/)).toBeVisible();
    const choice = form.getByLabel(new RegExp(`Cardio record ${id} ·`));
    await expect(choice).not.toBeChecked(); await choice.check();
    await form.getByLabel('Clarification', { exact: true }).fill('This actual cycle record is this occurrence');
    await submit(form, 'Confirm missing evidence');
    assert.equal((await f.rpc('get_training_context')).queue.qualifying_exposures, 1);
    const other = await attribute(f, rid, 'alpha', f.yesterday, [sid]);
    await evidence(); form = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: other }) });
    await form.locator('summary').click(); await form.getByLabel(new RegExp(`Cardio record ${id} ·`)).check();
    await form.getByLabel('Clarification', { exact: true }).fill('Synthetic forbidden duplicate attempt');
    await form.getByRole('button', { name: 'Confirm missing evidence' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'INVALID_CARDIO_ASSOCIATION' })).toBeVisible();
    assert.equal((await f.rpc('get_training_context')).queue.qualifying_exposures, 1);
    await shot('13-cardio-association-negative');
  });
  await check('A5-A9-browser-effort-quality-clarification-and-distinct-session', async () => {
    const f = await reset(); const content: Json = structuredClone(f.content); content.sequence[0].qualification.required_quality = 'controlled';
    const rid = await activate(f, content); const sid = await attribute(f, rid);
    const id = (await sql(f, "INSERT INTO sets(exercise_id,reps,training_session_id,logged_at) VALUES($1,5,$2,($3::date+time '12:00') AT TIME ZONE 'America/Montreal') RETURNING id", [f.exercise, sid, f.yesterday]))[0].id;
    const continuationSet = (await sql(f, "INSERT INTO sets(exercise_id,reps,rir,training_session_id,logged_at) VALUES($1,5,2,$2,($3::date+time '12:00') AT TIME ZONE 'America/Montreal') RETURNING id", [f.exercise, sid, f.today]))[0].id;
    await evidence(); const clarify = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: sid }) });
    await clarify.locator('summary').click(); await clarify.getByLabel(new RegExp(`Set ${id} ·`)).check();
    await clarify.getByLabel(new RegExp(`Set ${continuationSet} ·`)).check();
    await clarify.getByLabel('Explicit continuation dates (YYYY-MM-DD, comma separated)').fill(f.today);
    await clarify.getByLabel(`Actual RIR for set ${id}`, { exact: true }).fill('2');
    await clarify.getByLabel('Quality achieved (exact authored criterion)').fill('controlled');
    await clarify.getByLabel('Clarification', { exact: true }).fill('Actual working set, controlled movement, not warmup');
    await submit(clarify, 'Confirm missing evidence');
    assert.equal((await f.rpc('get_training_context')).queue.qualifying_exposures, 1);
    await page.getByRole('button', { name: 'Report unlogged work', exact: true }).click();
    await page.getByRole('button', { name: 'No occurrence stored? Attribute actual work', exact: true }).click();
    const attr = page.locator('form').filter({ has: page.getByRole('button', { name: 'Attribute actual work, then report / clarify' }) });
    await attr.getByLabel('Approved slot').selectOption('beta'); await attr.getByLabel('Performed on', { exact: true }).fill(f.yesterday);
    await attr.getByLabel('Reason', { exact: true }).fill('A genuinely distinct synthetic second session, not a fragment');
    await attr.getByLabel(/I checked for an existing occurrence/).check();
    await attr.getByRole('button', { name: 'Attribute actual work, then report / clarify' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'POTENTIAL_DUPLICATE_OCCURRENCE' })).toBeVisible();
    await attr.getByLabel(/This is separate actual work, not a duplicate/).check();
    const saved = await submit(attr, 'Attribute actual work, then report / clarify');
    assert.notEqual(saved.result.session_id, sid);
    const c = await f.rpc('get_training_context'); assert.equal(c.sessions.length, 2); assert.equal(c.queue.qualifying_exposures, 1);
    assert.equal((await sql(f, 'SELECT training_session_id FROM sets WHERE id=$1', [id]))[0].training_session_id, sid);
    await shot('14-distinct-clarification');
  });
  await check('R1-browser-complete-day-strength-recovery', async () => {
    const f = await reset(); await activate(f); await evidence();
    await page.getByText('Confirm a complete intervening day', { exact: true }).click();
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Confirm day activity', exact: true }) });
    await form.getByLabel('Completed date').fill(f.yesterday); await form.getByRole('combobox', { name: /^Actual activity/ }).selectOption('strength');
    await form.getByLabel('What did you do?').fill('Actual unlogged loaded work, detail still unknown');
    await form.getByLabel(/I confirm the entire athlete-local date/).check();
    await submit(form, 'Confirm day activity');
    await page.getByRole('button', { name: 'Current', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Strength · Not eligible' })).toBeVisible();
    assert.equal((await f.rpc('get_training_context')).queue.qualifying_exposures, 0);
    await shot('15-unlogged-strength-recovery');
  });
  await check('R4-browser-cancel-reissue-current-linked-header-and-frozen-history', async () => {
    const f = await reset(); await activate(f); const old = await materialize(f);
    const before = await f.rpc('get_training_history', { session_id: old.session_id });
    await page.goto(`${appURL}/scheduled/${f.today}`); await page.getByText('Manage linked intent', { exact: true }).click();
    const editor = page.locator('details').filter({ has: page.getByText('Manage linked intent', { exact: true }) });
    await editor.getByLabel('Reason', { exact: true }).fill('Synthetic explicit owner cancel and reissue');
    page.once('dialog', dialog => dialog.accept());
    await submit(editor, 'Cancel intent — preserve history');
    await page.goto(`${appURL}/training/manage`); await page.getByText('Choose an activity within approved scope', { exact: true }).click();
    const intent = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Record a dated intent', exact: true }) });
    await intent.getByLabel('Activity', { exact: true }).selectOption('strength');
    await intent.getByLabel('Primary slot or supportive intent').selectOption('alpha');
    await intent.getByLabel('Explicitly reissue cancelled intent', { exact: false }).selectOption(old.session_id);
    await intent.getByLabel('Why this fits today').fill('Fresh evidence, unperformed cancelled intent, same approved slot');
    await intent.getByLabel('Revisit on', { exact: true }).fill(f.tomorrow);
    const saved = await submit(intent, 'Save intent, not performed work', 'materialize_training_session');
    assert.equal(saved.result.workout_id, old.workout_id); assert.notEqual(saved.result.session_id, old.session_id);
    await page.goto(`${appURL}/scheduled/${f.today}`); await expect(page.getByText('Manage linked intent', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Session record', exact: true })).toHaveAttribute('href', `/training/manage?session=${saved.result.session_id}`);
    await page.goto(`${appURL}/training/manage`); await page.getByRole('button', { name: 'History', exact: true }).click();
    const oldHistory = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: `Occurrence ${old.session_id}` }) });
    await oldHistory.locator('summary').click(); await expect(oldHistory.getByRole('heading', { name: 'Cancel session' })).toBeVisible();
    assert.deepEqual((await f.rpc('get_training_history', { session_id: old.session_id })).sessions[0].snapshot, before.sessions[0].snapshot);
    assert.equal((await f.rpc('get_training_context')).queue.qualifying_exposures, 0);
    await shot('16-reissue-history');
  });
  await check('A14-browser-reached-revisit-is-review-not-expiry', async () => {
    const f = await reset(); const rid = await activate(f); const intent = await materialize(f);
    await sql(f, "SELECT training_event('deviation',$1,$2,$3::jsonb,'owner:fixture')", [rid, intent.session_id, JSON.stringify({ reason: 'Synthetic retained deviation', revisit_on: f.today })]);
    await page.goto(`${appURL}/training/manage`);
    await expect(page.getByRole('heading', { name: 'Review due — not expiry', exact: true })).toBeVisible();
    await expect(page.locator('p').filter({ hasText: 'Recorded deviation reached its revisit date' })).toBeVisible();
    assert.equal((await f.rpc('get_training_context')).authority.lifecycle, 'active');
    await shot('17-reached-review');
  });
  await check('A22-browser-repeat-freeform-copies-intent-not-evidence', async () => {
    const f = await reset(); await activate(f);
    await sql(f, "INSERT INTO sets(exercise_id,reps,logged_at) VALUES($1,5,($2::date+time '12:00') AT TIME ZONE 'America/Montreal')", [f.exercise, f.yesterday]);
    await page.goto(`${appURL}/strength`); await page.getByRole('button', { name: 'Repeat a day', exact: true }).click();
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Copy Workout', exact: true }) });
    await form.locator('input[type=date]').fill(f.yesterday); await form.getByRole('button', { name: 'Copy Workout', exact: true }).click();
    await expect(page.getByText('Workout copied!', { exact: true })).toBeVisible();
    const c = await f.rpc('get_training_context'); assert.equal(c.sessions.length, 0); assert.equal(c.queue.qualifying_exposures, 0);
    assert.equal((await sql(f, 'SELECT count(*)::int n FROM sets'))[0].n, 1);
    assert.equal((await sql(f, 'SELECT count(*)::int n FROM workouts_exercises'))[0].n, 1);
    await shot('17-repeat-freeform');
  });
  await check('A22-browser-copy-repeat-never-copy-credit-or-overwrite-linked-work', async () => {
    const f = await reset(); await activate(f); const old = await materialize(f);
    await page.goto(`${appURL}/scheduled/${f.today}`); await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
    await page.getByRole('button', { name: /Copy to/ }).click();
    const modal = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Copy to Date', exact: true }) }).filter({ has: page.getByRole('button', { name: 'Copy', exact: true }) }).last();
    await modal.locator('input[type=date]').fill(f.tomorrow); await modal.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page).toHaveURL(`${appURL}/scheduled/${f.tomorrow}`);
    let c = await f.rpc('get_training_context'); assert.equal(c.sessions.length, 1); assert.equal(c.queue.qualifying_exposures, 0);
    await page.getByRole('button', { name: 'Edit workout', exact: true }).click(); await page.getByRole('button', { name: /Copy to/ }).click();
    await page.locator('input[type=date]').fill(f.today); await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.getByText(/Plan-linked workout: use Manage linked intent/)).toBeVisible();
    await sql(f, "INSERT INTO sets(exercise_id,reps,logged_at) VALUES($1,5,($2::date+time '12:00') AT TIME ZONE 'America/Montreal')", [f.exercise, f.yesterday]);
    await page.goto(`${appURL}/strength`); await page.getByRole('button', { name: 'Repeat a day', exact: true }).click();
    await page.locator('form').filter({ has: page.getByRole('button', { name: 'Copy Workout', exact: true }) }).locator('input[type=date]').fill(f.yesterday); await page.getByRole('button', { name: 'Copy Workout', exact: true }).click();
    await expect(page.getByText(/Plan-linked workout: use Manage linked intent/)).toBeVisible();
    c = await f.rpc('get_training_context'); assert.equal(c.sessions.length, 1); assert.equal(c.sessions[0].id, old.session_id); assert.equal(c.queue.qualifying_exposures, 0);
    assert.equal((await sql(f, 'SELECT count(*)::int n FROM sets'))[0].n, 1);
    await shot('17-copy-repeat-safety');
  });
}

// Rendered product checks against real disposable SQL, not mocked planning data.
import assert from 'node:assert/strict';
import { expect, type Page } from '@playwright/test';
import { appURL, type createLocalTrainingServer } from './support/local-training-server';

type Fixture = Awaited<ReturnType<typeof createLocalTrainingServer>>;
type Check = (name: string, fn: () => Promise<void>) => Promise<boolean>;

export async function simpleDashboard(page: Page, reset: () => Promise<Fixture>, check: Check, shot: (name: string) => Promise<void>) {

  const past = () => page.locator('section').filter({ has: page.getByRole('heading', { name: 'What we did', exact: true }) });
  const present = () => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Where we are', exact: true }) });
  const future = () => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Where we’re going', exact: true }) });
  async function calm() {
    await expect(page.locator('main h2')).toHaveText(['What we did', 'Where we are', 'Where we’re going']);
    await expect(page.locator('main input, main textarea, main select, main form, main details, main pre, main [role="tab"]')).toHaveCount(0);
    await expect(page.locator('main a[href*="/manage"]')).toHaveCount(0);
    const content = await page.locator('main').innerText();
    assert.doesNotMatch(content, /\b(JSON|receipt|revision|lifecycle|eligibility|qualification|queue|evidence version|source_event_id)\b/i);
    assert.doesNotMatch(content, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  async function seedLogs(f: Fixture) {
    await f.admin(async db => {
      // 00:30 UTC today belongs to yesterday in Montreal, not Tokyo.
      await db.query("INSERT INTO sets(exercise_id,reps,logged_at) VALUES ($1,7,($2::date + time '00:30') AT TIME ZONE 'UTC'),($1,8,($3::date + time '12:00') AT TIME ZONE 'America/Montreal')", [f.exercise, f.today, f.yesterday]);
      const cardio = (await db.query<{id:number}>("INSERT INTO exercises(name,category) VALUES ('Synthetic easy ride','cardio') RETURNING id")).rows[0].id;
      await db.query('INSERT INTO cardio_sessions(exercise_id,date,duration_minutes,perceived_intensity) VALUES ($1,$2,25,2)', [cardio, f.yesterday]);
      await db.query("INSERT INTO workouts(date,name) VALUES ($1,'Scheduled only — never performed')", [f.tomorrow]);
    });
  }
  async function activate(f: Fixture, content = f.content) {
    const proposal = await f.mutate('propose_training_revision', { content });
    await f.mutate('activate_training_revision', { revision_id: proposal.revision_id, seed_slot_key: 'alpha', pending_intent_action: 'retain' });
    return proposal.revision_id;
  }
  await check('dashboard-inactive-ordinary-activity-mobile', async () => {
    const f = await reset(); await seedLogs(f);
    await page.setViewportSize({width:390,height:844});
    await page.goto(`${appURL}/training`);
    await expect(present().getByText(/Establish a plan with Dozer/)).toBeVisible();
    await expect(past().getByText('2 logged sets', {exact:true})).toBeVisible();
    await expect(past().locator('time')).toHaveAttribute('datetime', f.yesterday);
    await expect(past().getByText(/Synthetic easy ride · 25 min/)).toBeVisible();
    await expect(past().getByText(/Scheduled only/)).toHaveCount(0);
    await expect(future().getByText('No next phase is saved.')).toBeVisible();
    await calm(); await shot('dashboard-inactive-mobile');
    await page.setViewportSize({width:1200,height:900}); await shot('dashboard-inactive-desktop');
  });
  await check('dashboard-active-recovery-proposals-and-previous-phase', async () => {
    const f = await reset();
    await page.setViewportSize({width:1200,height:900});
    const previous = structuredClone(f.content); previous.block.purpose = 'Synthetic previous foundation';
    const previousId = await activate(f, previous);
    await f.mutate('record_training_decision', {kind:'review', outcome:'complete', reason:'Foundation reviewed; ready for a different focus.', evidence:{summary:'Synthetic phase review'}, review_event_ids:[], next_review_on:f.later});
    await activate(f);
    // Actual report, not a scheduled row, establishes recovery and progress.
    const occurrence = await f.mutate('record_training_decision', {kind:'attribute_occurrence',revision_id:(await f.rpc('get_training_context')).authority.revision_id,slot_key:'alpha',performed_on:f.yesterday,set_ids:[],duplicate_checked:true,reason:'Synthetic prior-day work'});
    await f.mutate('record_training_decision', {kind:'confirm_report',session_id:occurrence.session_id,report:{performed_on:f.yesterday,work:[{exercise_id:f.exercise,sets:1,reps:5,rir:2}]},duplicate_checked:true,reason:'Synthetic owner confirmation'});
    const proposal = structuredClone(f.content); proposal.block.purpose = 'Synthetic proposed power phase';
    await f.mutate('propose_training_revision', {content:proposal});
    await seedLogs(f);
    await f.mutate('materialize_training_session', {target_date:f.tomorrow,activity_kind:'rest',reason:'Synthetic future recovery intent.',revisit_on:f.later});
    await f.mutate('materialize_training_session', {target_date:f.today,activity_kind:'rest',reason:'Recovery after yesterday’s strength session.',revisit_on:f.tomorrow});
    const before = await f.rpc('get_training_context');
    assert.equal(before.queue.next_slot_key,'beta'); assert.equal(before.activity_eligibility.strength.eligible,false);
    await page.goto(`${appURL}/training`);
    await expect(present().getByText('Current phase',{exact:true})).toBeVisible();
    await expect(present().getByText('Synthetic browser phase',{exact:true})).toBeVisible();
    await expect(present().getByText(/1 session counted toward this phase/)).toBeVisible();
    await expect(future().getByText(/^rest$/i)).toBeVisible();
    await expect(future().getByText('Next strength session',{exact:true})).toBeVisible();
    await expect(future().getByText('beta',{exact:true})).toBeVisible();
    await expect(future().getByText(/Sequence only — not today’s clearance/)).toBeVisible();
    await expect(future().getByText(/Proposed, not active: Synthetic proposed power phase/)).toBeVisible();
    await expect(future().getByText('No next phase is saved.')).toBeVisible();
    await expect(future().getByRole('heading',{name:/Upcoming ·/})).toBeVisible();
    await expect(future().getByText('rest · scheduled, not completed',{exact:true})).toBeVisible();
    await expect(past().getByText('2 logged sets',{exact:true})).toBeVisible();
    await expect(past().getByText('Synthetic previous foundation',{exact:true})).toBeVisible();
    await expect(past().getByText('Foundation reviewed; ready for a different focus.',{exact:true})).toBeVisible();
    await expect(past().getByText('Synthetic proposed power phase',{exact:true})).toHaveCount(0);
    await calm(); await shot('dashboard-active-desktop');
    await page.setViewportSize({width:390,height:844}); await calm(); await shot('dashboard-active-mobile');
    const after = await f.rpc('get_training_context');
    assert.equal(after.authority.revision_id,before.authority.revision_id);
    assert.equal(after.queue.qualifying_exposures,before.queue.qualifying_exposures);
    assert.notEqual(after.authority.revision_id,previousId);
    // Real ordinary logging makes the saved recommendation stale.
    await f.admin(db => db.query('INSERT INTO sets(exercise_id,reps) VALUES ($1,6)', [f.exercise]));
    await page.reload();
    await expect(future().getByText('No current recommendation is saved.')).toBeVisible();
    await expect(future().getByText(/^rest$/i)).toHaveCount(0);
    await f.mutate('set_training_lifecycle',{lifecycle:'paused',reason:'Synthetic pause'});
    await page.reload(); await expect(present().getByText('Plan paused',{exact:true})).toBeVisible();
    await expect(past().getByText('2 logged sets',{exact:true})).toBeVisible();
    await expect(future().getByText('Next strength session',{exact:true})).toHaveCount(0);
    await calm(); await shot('dashboard-paused-mobile');
  });
  await check('dashboard-empty-unprovisioned-and-bounded-activity', async () => {
    const f = await reset();
    await page.goto(`${appURL}/training`);
    await expect(present().getByText(/Establish a plan with Dozer/)).toBeVisible();
    await expect(past().getByText('No activity logged in the last 14 days.',{exact:true})).toBeVisible();
    await calm(); await shot('dashboard-empty');
    await f.admin(async db => {
      // Owner lookup denies planning reads after provisioning is removed. The
      // independent logger must still render; do not weaken auth to hide this.
      await db.query('DELETE FROM training_plan_state');
      await db.query("INSERT INTO sets(exercise_id,reps,logged_at) SELECT $1,5,($2::date + time '12:00') AT TIME ZONE 'America/Montreal' FROM generate_series(1,207)",[f.exercise,f.yesterday]);
      await db.query("INSERT INTO sets(exercise_id,reps,logged_at) VALUES ($1,5,($2::date + time '12:00') AT TIME ZONE 'America/Montreal'),($1,5,($3::date-20+time '12:00') AT TIME ZONE 'America/Montreal')",[f.exercise,f.tomorrow,f.today]);
      await db.query('INSERT INTO sets(exercise_id,reps,is_deleted) VALUES ($1,5,true)',[f.exercise]);
    });
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await expect(past().getByText('200 logged sets',{exact:true})).toBeVisible();
    await expect(present().getByRole('alert')).toHaveText('Your plan is unavailable right now.');
    await expect(past().getByText('Partial view; counts below include only the records loaded.',{exact:true})).toBeVisible();
    await expect(past().locator('time')).toHaveAttribute('datetime',f.yesterday);
    await calm(); await shot('dashboard-bounded-activity');
  });
  await check('dashboard-loading-errors-and-retry', async () => {
    const f = await reset(); await seedLogs(f);
    const pattern = '**/rest/v1/rpc/get_training_context';
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const pending: Promise<void>[] = [];
    await page.route(pattern, route => {
      const response = gate.then(() => route.continue());
      pending.push(response);
      return response;
    });
    try {
      await page.goto(`${appURL}/training`);
      await expect(present().getByRole('status')).toHaveText('Loading your plan…');
      await expect(past().getByText('2 logged sets',{exact:true})).toBeVisible();
      await shot('dashboard-plan-loading');
    } finally { release(); await Promise.all(pending); await page.unroute(pattern); }
    await expect(present().getByText(/Establish a plan with Dozer/)).toBeVisible();
    let releaseActivity!: () => void;
    const activityGate = new Promise<void>(resolve => { releaseActivity = resolve; });
    const activityReads: Promise<void>[] = [];
    await page.route('**/rest/v1/sets?*', route => {
      const response = activityGate.then(() => route.continue());
      activityReads.push(response);
      return response;
    });
    try {
      await page.reload();
      await expect(present().getByText(/Establish a plan with Dozer/)).toBeVisible();
      await expect(past().getByRole('status')).toHaveText('Loading recent activity…');
      await shot('dashboard-activity-loading');
    } finally { releaseActivity(); await Promise.all(activityReads); await page.unroute('**/rest/v1/sets?*'); }
    await expect(past().getByText('2 logged sets',{exact:true})).toBeVisible();
    await page.route(pattern, route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic outage with technical internals'})}));
    try {
      await page.reload(); await expect(present().getByRole('alert')).toHaveText('Your plan is unavailable right now.');
      await expect(past().getByText('2 logged sets',{exact:true})).toBeVisible();
      await calm(); await shot('dashboard-plan-outage');
    } finally { await page.unroute(pattern); }
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await expect(present().getByText(/Establish a plan with Dozer/)).toBeVisible();
    await page.route('**/rest/v1/sets?*', route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic set outage'})}));
    try {
      await page.reload(); await expect(past().getByRole('alert')).toContainText('Some recent activity could not be loaded.');
      await expect(past().getByText(/Synthetic easy ride · 25 min/)).toBeVisible();
      await expect(past().getByText(/No activity logged/)).toHaveCount(0);
      await shot('dashboard-partial-activity');
    } finally { await page.unroute('**/rest/v1/sets?*'); }
  });

}

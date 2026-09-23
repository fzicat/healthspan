// Execute: PLAYWRIGHT_BROWSERS_PATH=$PWD/.training-test/browsers node_modules/.bin/tsx tests/training-planning.spec.ts
// Synthetic LOCAL PGlite browser integration. Not real Supabase/GoTrue validation.
import { reviewBrowser } from './review-browser';
import { simpleDashboard } from './simple-dashboard.spec';
import { chromium, expect, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLocalTrainingServer, startIsolatedApp, appURL, evidenceDir } from './support/local-training-server';
import type { Database } from '../src/types/database';
import type { TrainingHistory, TrainingRecord } from '../src/lib/api/training-planning';

type CheckResult = { name: string; status: 'passed' | 'failed'; error?: string };

async function main() {
  await mkdir(evidenceDir,{recursive:true});
  const results: CheckResult[] = [], errors: string[] = [], blocked: string[] = [];
  let server: Awaited<ReturnType<typeof createLocalTrainingServer>> | undefined;
  let app: Awaited<ReturnType<typeof startIsolatedApp>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let page: Page | undefined;
  let cleanupVerified = false;
  async function shot(name: string) { if(page) await page.screenshot({path:resolve(evidenceDir,`${name}.png`),fullPage:true}); }
  async function check(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push({name,status:'passed'}); console.log(`PASS ${name}`); return true; }
    catch(e: unknown) { const error = e instanceof Error ? e : new Error(String(e)); results.push({name,status:'failed',error:error.stack}); console.error(`FAIL ${name}: ${error.message}`); try { await shot(`${name.replace(/[^a-z0-9]/gi,'-')}-failure`); await writeFile(resolve(evidenceDir,`${name}-failure.txt`),await page!.locator('body').innerText()); } catch {} return false; }
  }
  try {
    server = await createLocalTrainingServer();
    await check('adapter-rejects-missing-and-forged-session',async () => {
      const missing = await fetch('http://127.0.0.1:54399/auth/v1/user');
      assert.equal(missing.status,401);
      const forged = await fetch('http://127.0.0.1:54399/rest/v1/rpc/get_training_context',{method:'POST',headers:{Authorization:'Bearer forged.token.signature','Content-Type':'application/json'},body:'{"p_input":{}}'});
      assert.equal(forged.status,401);
    });
    app = await startIsolatedApp();
    browser = await chromium.launch({headless:true});
    const context = await browser.newContext({viewport:{width:1200,height:900},timezoneId:'America/Montreal'});
    // Fail closed: block any unexpected non-loopback browser traffic.
    await context.route('**/*',route => { const u = new URL(route.request().url()); if(u.hostname === '127.0.0.1' || u.protocol === 'data:') return route.continue(); blocked.push(u.origin); return route.abort(); });
    page = await context.newPage();
    page.on('pageerror',e => errors.push(e.message));
    await check('anonymous-middleware-redirect',async () => {
      for (const path of ['/training','/training/manage']) {
        await page!.goto(`${appURL}${path}`);
        await expect(page!).toHaveURL(/\/login$/);
      }
      await shot('00-login-redirect');
    });
    await context.addCookies(await server.cookies());
    await check('training-navigation',async () => {
      await page!.goto(`${appURL}/training/manage`);
      await expect(page!.getByRole('heading',{name:'Training confirmations',exact:true})).toBeVisible();
      await page!.getByRole('button',{name:'Toggle menu'}).click();
      const nav = page!.getByRole('link',{name:'Training',exact:true}).first();
      await expect(nav).toHaveAttribute('href','/training');
      await shot('01-navigation');
      await nav.click();
      await expect(page!).toHaveURL(`${appURL}/training`);
      await page!.goto(`${appURL}/training/manage`);
    });
    const routeOK = await check('training-context-render',async () => {
      await writeFile(resolve(evidenceDir,'initial-context.json'),JSON.stringify(await server!.rpc('get_training_context'),null,2));
      await expect(page!.getByRole('heading',{name:'Current approved direction',exact:true})).toBeVisible({timeout:10000});
      await shot('01-training-route');
    });
    const activationOK = await check('owner-proposal-and-activation',async () => {
      if(!routeOK) throw new Error('Blocked by real SQL context/render contract failure');
      await page!.getByRole('button',{name:'Proposals',exact:true}).click();
      await page!.getByLabel('Complete revision content').fill(JSON.stringify(server!.content));
      await page!.getByRole('button',{name:'Preview readable proposal'}).click();
      await page!.getByRole('button',{name:'Submit immutable proposal — not activate'}).click();
      await expect(page!.getByLabel('Explicit starting slot')).toBeVisible();
      let c = await server!.rpc('get_training_context');
      assert.equal(c.authority.revision_id,null,'Proposal must not activate');
      assert.equal(c.proposals.length,1);
      await shot('02-proposal');
      await page!.getByLabel('Explicit starting slot').selectOption('alpha');
      await page!.getByLabel('Existing pending intent').selectOption('retain');
      await page!.getByLabel(/I reviewed this exact proposal/).check();
      await page!.getByRole('button',{name:'Activate this exact revision'}).click();
      await expect.poll(async () => (await server!.rpc('get_training_context')).queue.next_slot_key).toBe('alpha');
      c = await server!.rpc('get_training_context');
      assert.equal(c.authority.lifecycle,'active');
      await page!.getByRole('button',{name:'Current',exact:true}).click();
      await expect(page!.getByText(/Authority: active/i)).toBeVisible();
      await shot('03-activated');
    });
    await check('linked-workout-operation-contracts',async () => {
      if(!activationOK) throw new Error('Blocked by activation failure');
      const created = await server!.mutate('materialize_training_session',{target_date:server!.today,activity_kind:'strength',slot_key:'alpha',reason:'Synthetic linked editor contract fixture',revisit_on:server!.tomorrow});
      try {
        const historyBefore: TrainingHistory = await server!.rpc('get_training_history',{session_id:created.session_id});
        const frozen = historyBefore.sessions.find(session => session.id === created.session_id)!.snapshot;
        const readExercises = () => server!.admin(async db => (await db.query<Database['public']['Tables']['workouts_exercises']['Row']>('SELECT * FROM workouts_exercises WHERE workout_id=$1 ORDER BY id',[created.workout_id])).rows);
        const [original] = await readExercises();
        assert(original,'A real linked workout exercise must exist');
        const receipts: {event_id:string; decision_event_id:string; workout_exercise_id:number}[] = [];
        async function submit(operation: string, args: TrainingRecord) {
          const review = (await server!.rpc('get_training_context')).review;
          if (review.review_due) await server!.mutate('record_training_decision', {kind:'bounded_continuation',review_event_ids:review.reasons.map((r: TrainingRecord)=>r.event_id),evidence:{summary:'Synthetic review of repeated editor changes'},reason:'Keep original anchors; inspect again tomorrow',revisit_on:server!.tomorrow});
          await page!.goto(`${appURL}/scheduled/${server!.today}`);
          await page!.getByText('Manage linked intent',{exact:true}).click();
          const editor = page!.locator('details').filter({has:page!.getByText('Manage linked intent',{exact:true})});
          await editor.getByLabel(/^Operation/).selectOption(operation);
          await editor.getByLabel('Exact operation arguments (JSON)').fill(JSON.stringify(args));
          await editor.getByLabel('Reason',{exact:true}).fill(`Synthetic ${operation} regression`);
          await editor.getByLabel('Revisit on',{exact:true}).fill(server!.tomorrow);
          const [response] = await Promise.all([
            page!.waitForResponse(r => r.url().endsWith('/rpc/mutate_training_workout') && r.request().method() === 'POST'),
            // A completed receipt/history verification triggers the fresh context read.
            page!.waitForResponse(r => r.url().endsWith('/rpc/get_training_context') && r.request().method() === 'POST'),
            editor.getByRole('button',{name:'Record accepted linked deviation'}).click(),
          ]);
          assert.equal(response.ok(),true,await response.text());
          const payload = response.request().postDataJSON() as {p_input:{operation:string; args:TrainingRecord}};
          assert.equal(payload.p_input.operation,operation);
          assert.deepEqual(payload.p_input.args,operation === 'create_or_update_workout' || operation === 'add_workout_exercise' ? {...args,date:server!.today} : args);
          const result = await response.json() as {event_id:string; decision_event_id:string; workout_exercise_id:number};
          const history: TrainingHistory = await server!.rpc('get_training_history',{session_id:created.session_id});
          assert(history.events.some(event => event.id === result.event_id),'Exact mutation receipt must be readable');
          const deviation = history.events.find(event => event.id === result.decision_event_id);
          assert.equal(deviation?.kind,'deviation');
          assert.equal((deviation?.payload as TrainingRecord).operation,operation);
          assert.deepEqual(history.sessions.find(session => session.id === created.session_id)!.snapshot,frozen,'Accepted edits must not rewrite frozen intent');
          receipts.push(result);
          return result;
        }
        await submit('update_workout_exercise',{workout_exercise_id:original.id,details:'Synthetic changed details',note:'Synthetic changed note'});
        let exercises = await readExercises();
        assert.equal(exercises[0].details,'Synthetic changed details');
        assert.equal(exercises[0].note,'Synthetic changed note');
        await submit('create_or_update_workout',{name:'Synthetic renamed linked workout'});
        const workout = await server!.admin(async db => (await db.query<{name:string}>('SELECT name FROM workouts WHERE id=$1',[created.workout_id])).rows[0]);
        assert.equal(workout.name,'Synthetic renamed linked workout');
        // Add a second approved anchor row so removing it keeps the required anchor.
        const added = await submit('add_workout_exercise',{exercise_id:server!.exercise,details:'Synthetic removable duplicate'});
        exercises = await readExercises();
        assert.equal(exercises.length,2);
        assert(exercises.some(row => row.id === added.workout_exercise_id));
        await submit('remove_workout_exercise',{workout_exercise_id:added.workout_exercise_id});
        exercises = await readExercises();
        assert.equal(exercises.length,1);
        assert.equal(exercises[0].id,original.id);
        const after = await server!.rpc('get_training_context');
        assert.equal(after.queue.next_slot_key,'alpha');
        assert.equal(after.queue.qualifying_exposures,0);
        await shot('03-linked-operation-contracts');
        await writeFile(resolve(evidenceDir,'linked-operation-receipts.json'),JSON.stringify(receipts,null,2));
      } finally {
        await server!.mutate('record_training_decision',{kind:'cancel_session',session_id:created.session_id,reason:'End synthetic linked editor fixture; preserve history'});
        const cancelled: TrainingHistory = await server!.rpc('get_training_history',{session_id:created.session_id});
        assert(cancelled.events.some(event => event.kind === 'cancel_session' && event.session_id === created.session_id));
        const review = (await server!.rpc('get_training_context')).review;
        if (review.review_due) await server!.mutate('record_training_decision', {kind:'bounded_continuation',review_event_ids:review.reasons.map((r: TrainingRecord)=>r.event_id),evidence:{summary:'Synthetic linked operation review'},reason:'No actual work; supportive decisions remain appropriate',revisit_on:server!.tomorrow});
        await page!.goto(`${appURL}/training/manage`);
        await expect(page!.getByText(/Authority: active/i)).toBeVisible();
      }
    });
    await check('next-day-recovery-and-pending-slot',async () => {
      if(!activationOK) throw new Error('Blocked by activation failure');
      // Synthetic occurrence happened yesterday: today is the next day. Genuine
      // attribution/report RPCs retain original rules and advance the queue once.
      const c = await server!.rpc('get_training_context');
      const occurrence = await server!.mutate('record_training_decision',{kind:'attribute_occurrence',revision_id:c.authority.revision_id,slot_key:'alpha',performed_on:server!.yesterday,set_ids:[],duplicate_checked:true,reason:'Synthetic browser previous-day occurrence'});
      await server!.mutate('record_training_decision',{kind:'confirm_report',session_id:occurrence.session_id,report:{performed_on:server!.yesterday,work:[{exercise_id:server!.exercise,sets:1,reps:5,rir:2}]},duplicate_checked:true,reason:'Synthetic owner work confirmation'});
      const next = await server!.rpc('get_training_context');
      assert.equal(next.queue.next_slot_key,'beta');
      assert.equal(next.activity_eligibility.strength.eligible,false);
      assert.equal(next.activity_eligibility.rest.eligible,true);
      await page!.getByRole('button',{name:'Refresh',exact:true}).click();
      await page!.getByText('Choose an activity within approved scope',{exact:true}).click();
      await page!.getByLabel('Activity',{exact:true}).selectOption('rest');
      await page!.getByLabel('Why this fits today').fill('Synthetic recovery after yesterday; beta remains pending');
      await page!.getByLabel('Revisit on',{exact:true}).fill(server!.tomorrow);
      await page!.getByRole('button',{name:'Save intent, not performed work'}).click();
      await expect.poll(async () => (await server!.rpc('get_training_context')).recommended_today?.activity_kind).toBe('rest');
      const saved = await server!.rpc('get_training_context');
      assert.equal(saved.queue.next_slot_key,'beta');
      assert.equal(saved.queue.qualifying_exposures,1);
      await expect(page!.getByRole('heading',{name:'Strength · Not eligible'})).toBeVisible();
      await expect(page!.getByText('0 actual logged sets · 0 actual cardio records')).toBeVisible();
      await shot('04-next-day-recovery');
      await writeFile(resolve(evidenceDir,'next-day-context.json'),JSON.stringify(saved,null,2));
    });
    await check('supportive-cardio-bounds-and-numeric-payload',async () => {
      if(!activationOK) throw new Error('Blocked by activation failure');
      await page!.goto(`${appURL}/training/manage`);
      await page!.getByText('Choose an activity within approved scope',{exact:true}).click();
      const intent = page!.locator('section').filter({has:page!.getByRole('heading',{name:'Record a dated intent',exact:true})});
      const activity = intent.getByLabel('Activity',{exact:true});
      const duration = intent.getByLabel('Duration (minutes)',{exact:true});
      const intensity = intent.getByLabel('Intensity (1–10)',{exact:true});
      const save = intent.getByRole('button',{name:'Save intent, not performed work'});
      await expect(duration).toHaveCount(0);
      await activity.selectOption('cardio');
      await expect(duration).toHaveValue('');
      await expect(intensity).toHaveValue('');
      await expect(duration).toHaveAttribute('required','');
      await expect(duration).toHaveAttribute('max','30');
      await expect(intensity).toHaveAttribute('required','');
      await expect(intensity).toHaveAttribute('min','1');
      await expect(intensity).toHaveAttribute('max','3');
      await expect(intent.getByText(/Approved maximum: 30 minutes and intensity 3/)).toBeVisible();
      await intent.getByLabel('Why this fits today').fill('Synthetic supportive cardio within approved limits; no resistance credit');
      await intent.getByLabel('Revisit on',{exact:true}).fill(server!.tomorrow);
      const before = await server!.rpc('get_training_context');
      await save.click();
      assert(await duration.evaluate((input: HTMLInputElement) => input.validity.valueMissing));
      await duration.fill('0');
      await intensity.fill('2');
      await save.click();
      await expect(intent.getByRole('alert')).toHaveText('Supportive cardio needs a positive duration and intensity from 1–10, both within the approved bounds.');
      await duration.fill('31');
      await save.click();
      assert(await duration.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow));
      await duration.fill('20.5');
      for (const value of ['0','4','11']) {
        await intensity.fill(value);
        await save.click();
        assert(await intensity.evaluate((input: HTMLInputElement) => !input.validity.valid));
      }
      const unchanged = await server!.rpc('get_training_context');
      assert.deepEqual(unchanged.versions,before.versions,'Missing, nonpositive and out-of-bounds doses must not save intent');
      await intensity.fill('2.5');
      const [response] = await Promise.all([
        page!.waitForResponse(r => r.url().endsWith('/rpc/materialize_training_session') && r.request().method() === 'POST'),
        save.click(),
      ]);
      assert.equal(response.ok(),true,await response.text());
      const payload = response.request().postDataJSON() as {p_input:TrainingRecord};
      assert.equal(payload.p_input.duration_minutes,20.5);
      assert.equal(payload.p_input.intensity,2.5);
      assert.equal('slot_key' in payload.p_input,false);
      const result = await response.json() as {session_id:string};
      await expect(intent.getByText(/Saved and verified/)).toBeVisible();
      await expect(save).toBeEnabled();
      const history: TrainingHistory = await server!.rpc('get_training_history',{session_id:result.session_id});
      const savedIntent = history.sessions.find(session => session.id === result.session_id)!;
      assert.equal(savedIntent.activity_kind,'cardio');
      assert.equal(savedIntent.slot_key,null);
      assert.equal(savedIntent.workout_id,null);
      assert.equal((savedIntent.snapshot.intent as TrainingRecord).duration_minutes,20.5);
      assert.equal((savedIntent.snapshot.intent as TrainingRecord).intensity,2.5);
      const after = await server!.rpc('get_training_context');
      assert.equal(after.queue.next_slot_key,before.queue.next_slot_key);
      assert.equal(after.queue.qualifying_exposures,before.queue.qualifying_exposures);
      await expect(page!.getByText('0 actual logged sets · 0 actual cardio records')).toBeVisible();
      await shot('04-supportive-cardio');
      await writeFile(resolve(evidenceDir,'supportive-cardio-intent.json'),JSON.stringify(savedIntent,null,2));
      // Retained field state must neither show nor leak into other activity payloads.
      for (const kind of ['strength','rest','mobility']) {
        await activity.selectOption(kind);
        await expect(duration).toHaveCount(0);
        await expect(intensity).toHaveCount(0);
      }
      await intent.getByLabel('Why this fits today').fill('Synthetic unloaded mobility without cardio-only arguments');
      const [mobilityResponse] = await Promise.all([
        page!.waitForResponse(r => r.url().endsWith('/rpc/materialize_training_session') && r.request().method() === 'POST'),
        save.click(),
      ]);
      assert.equal(mobilityResponse.ok(),true,await mobilityResponse.text());
      const mobilityPayload = mobilityResponse.request().postDataJSON() as {p_input:TrainingRecord};
      assert.equal(mobilityPayload.p_input.activity_kind,'mobility');
      assert.equal('duration_minutes' in mobilityPayload.p_input,false);
      assert.equal('intensity' in mobilityPayload.p_input,false);
      await expect(intent.getByText(/Saved and verified/)).toBeVisible();
      await expect(save).toBeEnabled();
      const mobilityResult = await mobilityResponse.json() as {session_id:string};
      const mobilityHistory: TrainingHistory = await server!.rpc('get_training_history',{session_id:mobilityResult.session_id});
      assert(mobilityHistory.sessions.some(session => session.id === mobilityResult.session_id && session.activity_kind === 'mobility'));
    });
    await check('immutable-history',async () => {
      if(!activationOK) throw new Error('Blocked by activation failure');
      await page!.getByRole('button',{name:'History',exact:true}).click();
      await expect(page!.getByRole('heading',{name:'Frozen intent & decision history'})).toBeVisible();
      await expect(page!.getByText('End of matching decision history.')).toBeVisible();
      const history = await server!.rpc('get_training_history');
      assert(history.revisions.length >= 1 && history.events.length >= 2);
      await shot('05-history');
      await writeFile(resolve(evidenceDir,'history.json'),JSON.stringify(history,null,2));
    });
    await check('original-logger-prefill-and-save',async () => {
      await server!.admin(async db => { await db.query("INSERT INTO sets(exercise_id,weight,reps,rir,logged_at) VALUES ($1,65,8,2,($2::date-7+time '12:00') AT TIME ZONE 'America/Montreal')",[server!.exercise,server!.today]); });
      await page!.goto(`${appURL}/exercise/${server!.exercise}`);
      await expect(page!.getByRole('heading',{name:'Synthetic Browser Squat'})).toBeVisible();
      await expect(page!.locator('#weight')).toHaveValue('65');
      await expect(page!.locator('#reps')).toHaveValue('8');
      await expect(page!.locator('#rir')).toHaveValue('2');
      await shot('06-logger-prefill');
      await page!.locator('#reps').fill('9');
      await page!.getByRole('button',{name:'Save Set',exact:true}).click();
      await expect(page!.getByText('Set saved! 💪',{exact:true})).toBeVisible();
      const saved = await server!.admin(async db => (await db.query<Database['public']['Tables']['sets']['Row']>('SELECT * FROM sets WHERE exercise_id=$1 ORDER BY id DESC',[server!.exercise])).rows);
      assert.equal(saved.length,2); assert.equal(saved[0].weight,65); assert.equal(saved[0].reps,9); assert.equal(saved[0].rir,2); assert.equal(saved[0].training_session_id,null);
      await shot('07-logger-saved');
      await page!.goto(`${appURL}/training`);
      await expect(page!.getByText('1 logged set',{exact:true})).toHaveCount(2);
      await shot(routeOK ? '08-today-actual-activity' : '08-planning-unavailable-after-save');
    });
    await check('mobile-training-layout',async () => {
      await page!.setViewportSize({width:390,height:844});
      await page!.goto(`${appURL}/training`);
      await expect(page!.getByRole('heading',{name:'Where we’re going',exact:true})).toBeVisible();
      await expect(page!.getByText('Next strength session',{exact:true})).toBeVisible();
      assert.equal(await page!.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Training overview must not overflow mobile width');
      await shot('09-mobile-training');
    });
    await check('logger-during-planning-outage',async () => {
      const outage = '**/rest/v1/rpc/*';
      await page!.route(outage,route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic planning outage'})}));
      try {
        await page!.goto(`${appURL}/exercise/${server!.exercise}?session=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
        await expect(page!.locator('#weight')).toHaveValue('65');
        await page!.locator('#reps').fill('10');
        await page!.getByRole('button',{name:'Save Set',exact:true}).click();
        await expect(page!.getByText('Set saved! 💪',{exact:true})).toBeVisible();
        const row = await server!.admin(async db => (await db.query<{reps:number;training_session_id:null}>('SELECT reps,training_session_id FROM sets ORDER BY id DESC LIMIT 1')).rows[0]);
        assert.equal(row.reps,10); assert.equal(row.training_session_id,null); await shot('09-outage-logger');
      } finally { await page!.unroute(outage); }
    });
    await page.setViewportSize({width:1200,height:900});
    await reviewBrowser(page, async () => {
      await page!.goto('about:blank');
      await server!.close(); server=undefined;
      server=await createLocalTrainingServer();
      await page!.context().clearCookies(); await page!.context().addCookies(await server.cookies());
      return server;
    }, check, shot);
    await page.close();
    // Travel must not relabel athlete-local activity or date-only cardio records.
    const dashboardContext = await browser.newContext({viewport:{width:1200,height:900},timezoneId:'Asia/Tokyo'});
    await dashboardContext.route('**/*',route => { const u = new URL(route.request().url()); if(u.hostname === '127.0.0.1' || u.protocol === 'data:') return route.continue(); blocked.push(u.origin); return route.abort(); });
    page = await dashboardContext.newPage();
    page.on('pageerror',e => errors.push(e.message));
    await simpleDashboard(page, async () => {
      await page!.goto('about:blank');
      await server!.close(); server=undefined;
      server=await createLocalTrainingServer();
      await page!.context().clearCookies(); await page!.context().addCookies(await server.cookies());
      return server;
    }, check, shot);
    await check('logger-without-migration',async () => {
      await writeFile(resolve(evidenceDir,'requests-before-no-migration.json'),JSON.stringify(server!.requests,null,2));
      await server!.close(); server=undefined;
      server=await createLocalTrainingServer({planning:false});
      await page!.context().clearCookies(); await page!.context().addCookies(await server.cookies());
      await page!.goto(`${appURL}/training`); await expect(page!.getByText('Your plan is unavailable right now.',{exact:true})).toBeVisible();
      await page!.goto(`${appURL}/exercise/${server.exercise}`);
      await page!.locator('#weight').fill('55'); await page!.locator('#reps').fill('6');
      await page!.getByRole('button',{name:'Save Set',exact:true}).click();
      await expect(page!.getByText('Set saved! 💪',{exact:true})).toBeVisible();
      const row=await server!.admin(async db => (await db.query<{reps:number;weight:number}>('SELECT reps,weight FROM sets ORDER BY id DESC LIMIT 1')).rows[0]);
      assert.equal(row.reps,6); assert.equal(row.weight,55); await shot('10-unmigrated-logger');
      await page!.goto(`${appURL}/training`);
      await expect(page!.getByText('Your plan is unavailable right now.',{exact:true})).toBeVisible();
      await expect(page!.getByText('1 logged set',{exact:true})).toBeVisible();
      await shot('dashboard-without-migration');
    });
  } catch(e: unknown) { const error = e instanceof Error ? e : new Error(String(e)); results.push({name:'harness',status:'failed',error:error.stack}); console.error(e); }
  finally {
    await browser?.close();
    await app?.close();
    if(server) { await writeFile(resolve(evidenceDir,'requests.json'),JSON.stringify(server.requests,null,2)); await server.close(); }
    try {
      await assert.rejects(fetch(appURL), /fetch failed/);
      await assert.rejects(fetch('http://127.0.0.1:54399'), /fetch failed/);
      cleanupVerified = true;
    } catch (e) { results.push({name:'disposable-listener-cleanup',status:'failed',error:String(e)}); }
    const report = { cleanupVerified, label:'Synthetic LOCAL PGlite + test-only HTTP adapter; not Supabase validation', results, pageErrors:errors, blockedExternalOrigins:blocked, migrations:server?.migrations, screenshots:'Captured, not visually inspected' };
    await writeFile(resolve(evidenceDir,'results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
    if(results.some(r => r.status === 'failed') || errors.length) process.exitCode = 1;
  }
}
void main();

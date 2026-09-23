// TEST ONLY: narrow GoTrue/PostgREST-shaped adapter, not Supabase certification.
// No dotenv, external database, credentials, or application imports.
import { PGlite } from '@electric-sql/pglite';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createProbe } from 'node:net';
import { readFile, readdir, mkdir, cp, symlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createServerClient } from '@supabase/ssr';

// SQL/HTTP fixture payloads are intentionally schema-dynamic; never app types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
type Role = 'authenticated' | 'service_role';

export const owner = '11111111-1111-4111-8111-111111111111';
export const root = resolve(import.meta.dirname, '../..');
export const evidenceDir = resolve(root, '.training-test/evidence/browser');
export const apiURL = 'http://127.0.0.1:54399';
export const appURL = 'http://127.0.0.1:3109';
export const anonKey = 'synthetic-local-anon';
const ident = (s: string) => { if (!/^[a-z_][a-z_0-9]*$/.test(s)) throw new Error('Unsupported identifier'); return `"${s}"`; };

export async function createLocalTrainingServer(options: { port?: number; planning?: boolean } = {}) {
  const db = new PGlite();
  const requests: unknown[] = [];
  let lock = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => { const job = lock.then(fn); lock = job.then(() => {}, () => {}); return job; };
  const query = async (sql: string, params: Json[] = []) => (await db.query<Json>(sql, params)).rows;
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); INSERT INTO auth.users VALUES ('${owner}');`);
  await db.exec((await readFile(resolve(root, 'supabase/schema.sql'), 'utf8')).split('-- Fuzzy duplicate detection')[0]);
  await db.exec('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated,service_role;');
  const migrations = (await readdir(resolve(root, 'supabase/migrations'))).filter(f => f.endsWith('.sql')).sort();
  if (!migrations.length) throw new Error('No SQL migrations');
  if (options.planning !== false) {
    for (const file of migrations) await db.exec(await readFile(resolve(root, 'supabase/migrations', file), 'utf8'));
    await query("INSERT INTO training_plan_state(id,owner_user_id,athlete_timezone) VALUES (1,$1,'America/Montreal')", [owner]);
  }
  const exercise = (await query("INSERT INTO exercises(name,category) VALUES ('Synthetic Browser Squat','strength') RETURNING id"))[0].id;
  async function asRole<T>(role: 'authenticated' | 'service_role', fn: () => Promise<T>) {
    return serial(async () => {
      await db.exec(`RESET ROLE; SET ROLE ${role};`);
      await query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role, sub: role === 'authenticated' ? owner : undefined })]);
      try { return await fn(); } finally { await db.exec('RESET ROLE'); }
    });
  }
  const rpc = (name: string, input: Json = {}, role: Role = 'authenticated') => asRole(role, async () => (await query(`SELECT public.${ident(name)}($1::jsonb) AS result`, [JSON.stringify(input)]))[0].result);
  const today = (await query("SELECT (now() AT TIME ZONE 'America/Montreal')::date::text AS today"))[0].today;
  const shift = async (n: number) => (await query('SELECT ($1::date+$2::int)::text AS d', [today, n]))[0].d;
  const yesterday = await shift(-1), tomorrow = await shift(1), later = await shift(2);
  const content = {
    schema_version: 1,
    macro: { intent: 'Synthetic browser longevity fixture', priorities: [{ capacity: 'strength', mode: 'maintain', success_criteria: 'Keep benchmarks' }], constraints: [], horizon: 'fixture', cardio_recovery_intent: 'low cost' },
    block: { key: 'a', purpose: 'Synthetic browser phase', starts_on: yesterday, expected_until: later, authorized_through: null, phase_profile: { split: 'full_body', emphases: ['strength', 'mobility'], rep_emphasis: 'mixed', laterality_emphasis: 'mixed' } },
    sequence: ['alpha', 'beta'].map(key => ({ key, activity_kind: 'strength', purpose: key, review_scope: 'block', load_tags: ['resistance', 'full_body'], exercises: [{ exercise_id: exercise, details: 'Synthetic fixture only' }], qualification: { kind: 'strength_sets', anchors: [{ exercise_ids: [exercise], min_sets: 1, min_reps: 5, max_rir: 3 }], require_work_set_confirmation: true, admissible_sources: ['logged', 'self_reported'], queue_effect: 'advance', out_of_order: 'hold', continuation_days: 2 } })),
    variation_policy: { comparable: 'anchors', allowed: 'accessories', benefit: 'engagement', review_triggers: 'tolerance', transition_rationale: 'initial fixture', previous_phase_ids: [] },
    recovery_spacing_rules: [{ id: 'full-body', candidate_tags: ['resistance'], preceding_tags: ['resistance'], predicate: 'intervening_non_strength_days', min_days: 1, require_day_confirmation: true }],
    progression_policy: { build: 'authored', maintain: 'hold', reduce: 'fatigue', recalibrate: 'review' },
    review_policy: { review_due_on: later, exposure_threshold: 20, scope: 'block', concern_triggers: ['pain'] },
    delegation: { supportive_activities: ['cardio', 'mobility', 'rest'], supportive_constraints: { cardio_max_minutes: 30, cardio_max_intensity: 3, mobility_unloaded: true }, routine_review: true, bounded_continuation_days: 3, substitutions: true, stop_conditions: ['pain'] },
  };
  async function mutate(name: string, input: Json, role: Role = 'authenticated') {
    const c = await rpc('get_training_context', {}, role);
    return rpc(name, { ...input, expected_state_version: c.versions.state, expected_evidence_version: c.versions.evidence, request_id: randomUUID() }, role);
  }
  const secret = randomBytes(32), refreshToken = randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() };
  function sign(role: Role) {
    const payload = Buffer.from(JSON.stringify({ sub: role === 'authenticated' ? owner : undefined, aud: role, role, iat: now, exp: now + 3600 })).toString('base64url');
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${payload}`;
    return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
  }
  const token = sign('authenticated'), serviceRoleKey = sign('service_role');
  const session = { access_token: token, refresh_token: refreshToken, expires_in: 3600, expires_at: now + 3600, token_type: 'bearer', user };
  function tokenRole(value: string): Role | false {
    const [h,p,s] = value.split('.');
    if (!h || !p || !s) return false;
    const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
    const actual = Buffer.from(s, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    try {
      const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
      if (claims.exp <= Date.now()/1000) return false;
      if (claims.sub === owner && claims.role === 'authenticated') return 'authenticated';
      return claims.role === 'service_role' && claims.sub === undefined ? 'service_role' : false;
    } catch { return false; }
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, apiURL);
    res.setHeader('Access-Control-Allow-Origin', appURL);
    res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,prefer,x-client-info,range,range-unit,x-supabase-api-version');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
    const send = (status: number, body: Json) => { res.statusCode = status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(body)); };
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
      const role = tokenRole((req.headers.authorization || '').replace(/^Bearer /,''));
      if (!role) { send(401, { message: 'Synthetic local session required' }); return; }
      if (url.pathname === '/auth/v1/user') { send(role === 'authenticated' ? 200 : 403, role === 'authenticated' ? user : { message: 'Service role is not an athlete' }); return; }
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ method: req.method, path: url.pathname, query: url.search, role });
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        if (req.method !== 'POST' || Object.keys(body).some(k => k !== 'p_input')) throw new Error('Unsupported RPC envelope');
        send(200, await rpc(url.pathname.split('/').pop()!, body.p_input || {}, role)); return;
      }
      const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
      if (!table || !['sets','exercises','workouts','workouts_exercises','daily_logs','cardio_sessions','breathwork_sessions','training_session_contexts'].includes(table)) throw new Error(`Unsupported path ${url.pathname}`);
      if (!['GET','HEAD','POST','PATCH','DELETE'].includes(req.method!)) throw new Error('Unsupported method');
      const rows = await asRole(role, async () => {
        const params: Json[] = [], where: string[] = [];
        const bind = (value: Json) => { params.push(value); return `$${params.length}`; };
        const select = (url.searchParams.get('select') || '*').replace(/\s/g, '');
        // Support only the two real FK reads used here, never synthesize joins.
        const relation = select.match(/(exercises|workouts)(!inner)?\(([^()]*)\)/);
        const join = relation?.[1];
        if (join && !(join === 'exercises' && ['sets','workouts_exercises'].includes(table) || join === 'workouts' && table === 'workouts_exercises')) throw new Error('Unsupported relationship');
        for (const [key, value] of url.searchParams) {
          if (['select','order','limit','offset'].includes(key) || req.method === 'POST' && key === 'columns') continue;
          const [op,...rest] = value.split('.'); const val = rest.join('.');
          const column = key.startsWith('exercises.') && join ? `e.${ident(key.slice(10))}` : `t.${ident(key)}`;
          if (op === 'in') where.push(`${column} IN (${val.slice(1,-1).split(',').map(v => bind(v)).join(',')})`);
          else if (op === 'is' && val === 'null') where.push(`${column} IS NULL`);
          else { const operator = ({eq:'=',neq:'<>',gte:'>=',lte:'<=',gt:'>',lt:'<',ilike:'ILIKE'} as Record<string,string>)[op]; if (!operator) throw new Error(`Unsupported filter ${op}`); where.push(`${column} ${operator} ${bind(val)}`); }
        }
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        if (req.method === 'POST') {
          const records = Array.isArray(body) ? body : [body];
          const keys = Object.keys(records[0] ?? {});
          if (!keys.length || records.some(row => JSON.stringify(Object.keys(row).sort()) !== JSON.stringify([...keys].sort()))) throw new Error('Unsupported mixed insert columns');
          const columns = url.searchParams.get('columns');
          if (columns && JSON.stringify(columns.split(',').map(k => k.replace(/^"|"$/g, '')).sort()) !== JSON.stringify([...keys].sort())) throw new Error('Unsupported insert columns');
          return query(`INSERT INTO public.${ident(table)} (${keys.map(ident).join(',')}) VALUES ${records.map(row => `(${keys.map(k => bind(row[k])).join(',')})`).join(',')} RETURNING *`,params);
        }
        if (req.method === 'PATCH') return query(`UPDATE public.${ident(table)} t SET ${Object.keys(body).map(k => `${ident(k)}=${bind(body[k])}`).join(',')}${clause} RETURNING *`,params);
        if (req.method === 'DELETE') return query(`DELETE FROM public.${ident(table)} t${clause} RETURNING *`,params);
        const columns = relation ? select.replace(relation[0], '').split(',').filter(Boolean) : select.split(',');
        const projection = columns.map(k => k === '*' ? 't.*' : `t.${ident(k)}`);
        if (relation) {
          const nested = relation[3] === '*' ? 'to_jsonb(e)' : `jsonb_build_object(${relation[3].split(',').map(k => `'${k}',e.${ident(k)}`).join(',')})`;
          projection.push(`CASE WHEN e.id IS NULL THEN NULL ELSE ${nested} END AS ${ident(join!)}`);
        }
        const fields = projection.join(',');
        const from = ` FROM public.${ident(table)} t${join ? ` ${relation![2] ? 'INNER' : 'LEFT'} JOIN public.${ident(join)} e ON e.id=t.${join === 'exercises' ? 'exercise_id' : 'workout_id'}` : ''}${clause}`;
        const count = (await query(`SELECT count(*)::int AS n${from}`,params))[0].n;
        const order = url.searchParams.get('order');
        const orderSQL = order ? ` ORDER BY ${order.split(',').map(v => { const [col,dir] = v.split('.'); return `t.${ident(col)} ${dir === 'desc' ? 'DESC' : 'ASC'}`; }).join(',')}` : '';
        const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 1000);
        if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(limit)) throw new Error('Invalid range');
        const found = await query(`SELECT ${fields}${from}${orderSQL} LIMIT ${limit} OFFSET ${offset}`,params);
        res.setHeader('Content-Range', `${offset}-${offset + found.length - 1}/${count}`);
        return found;
      });
      if (req.headers.accept?.includes('application/vnd.pgrst.object+json')) {
        if (rows.length !== 1) { send(406,{code:'PGRST116',details:`The result contains ${rows.length} rows`,message:'JSON object requested, multiple (or no) rows returned'}); return; }
        send(200, rows[0]);
      } else send(200, rows);
    } catch (error: unknown) { const e = error as Error & {code?: string}; requests.push({ error: e.message, code: e.code, path: url.pathname }); send(400,{code:e.code || 'TEST_ADAPTER_UNSUPPORTED',message:e.message,details:null,hint:null}); }
  });
  try { await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(options.port ?? 54399,'127.0.0.1',ok); }); }
  catch(error) { await db.close(); throw error; }
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected loopback TCP server');
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url, ownerToken: token, serviceRoleKey,
    db, rpc, mutate, exercise, today, yesterday, tomorrow, later, content, requests, migrations,
    admin: <T>(fn: (db: PGlite) => Promise<T>) => serial(fn.bind(null,db)),
    async cookies() {
      const jar: {name:string;value:string}[] = [];
      const client = createServerClient(url,anonKey,{ cookies: { getAll: () => jar, setAll: changes => { for (const c of changes) { const i = jar.findIndex(v => v.name === c.name); if (i >= 0) jar.splice(i,1); jar.push(c); } } } });
      const { error } = await client.auth.setSession(session);
      if (error) throw error;
      return jar.map(c => ({ name:c.name,value:c.value,domain:'127.0.0.1',path:'/',httpOnly:false,secure:false,sameSite:'Lax' as const }));
    },
    async close() { await new Promise<void>(ok => server.close(() => ok())); await db.close(); },
  };
}

export async function startIsolatedApp() {
  // Refuse an occupied port; never reuse or terminate an unrelated listener.
  await new Promise<void>((ok, fail) => {
    const probe = createProbe(); probe.once('error',fail);
    probe.listen(3109,'127.0.0.1',() => probe.close(() => ok()));
  });
  const runtime = resolve(evidenceDir,'runtime');
  await mkdir(runtime,{recursive:true});
  // Copy only explicit build inputs: Next must never discover repository .env files.
  await cp(resolve(root,'.next'),resolve(runtime,'.next'),{recursive:true});
  await writeFile(resolve(runtime,'package.json'),JSON.stringify({private:true}));
  for (const name of ['node_modules','public']) {
    try { await symlink(resolve(root,name),resolve(runtime,name)); } catch (e: unknown) { if((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  }
  const child = spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'start',runtime,'--hostname','127.0.0.1','--port','3109'],{
    cwd:runtime,env:{PATH:process.env.PATH!,HOME:runtime,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:apiURL,NEXT_PUBLIC_SUPABASE_ANON_KEY:anonKey},stdio:['ignore','pipe','pipe'],
  });
  let output = ''; child.stdout.on('data',v => output += v); child.stderr.on('data',v => output += v);
  const close = async () => { if(child.exitCode === null) { child.kill('SIGTERM'); await new Promise<void>(ok => { child.once('exit',() => ok()); setTimeout(() => { child.kill('SIGKILL'); ok(); },5000).unref(); }); } await writeFile(resolve(evidenceDir,'app.log'),output); };
  try {
    for(let i=0;i<100;i++) {
      if(child.exitCode !== null) throw new Error(`App exited: ${output}`);
      try { const r = await fetch(`${appURL}/login`); if(r.ok) return {close}; } catch {}
      await new Promise(ok => setTimeout(ok,100));
    }
    throw new Error(`App did not become ready: ${output}`);
  } catch(e) { await close(); throw e; }
}

import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import dataHandler from '../../api/affairs-data.ts';
import actionHandler from '../../api/affairs-action.ts';

const mode = process.argv[2];
assert.deepEqual(process.argv.slice(2),[mode]);
assert.ok(['--local-handlers','--deployed'].includes(mode));
const live = mode === '--deployed';
const site = 'https://stu.best';
const revision = process.env.EXPECTED_RELEASE_REVISION;
async function verifyRelease() {
  if (!live) return;
  assert.match(revision ?? '',/^[0-9a-f]{40}$/);
  const response = await fetch(site+'/release.json',{redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);
  const manifest = await response.json();
  assert.equal(manifest.revision,revision);
  assert.equal(manifest.environment,'production');
}
await verifyRelease();
const config = JSON.parse(await readFile('deployment.json','utf8'));
assert.equal(config.repository,'LuxArt0317/std_edu_ai');
const env = deploymentEnvironment();
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
assert.equal(new URL(url).origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
assert.ok(key);
if (!live) Object.assign(process.env,{VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:key});
const connection = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
dormitoryConductClientTarget(connection);
const accounts = Array.from({length:3},(_,index)=>{
  const id = randomUUID();
    return {id,email:`tutor-evaluation-qa-${id}@example.invalid`,password:randomBytes(24).toString('base64url')+'Aa1!',google:index!==2};
});
const [own,other] = accounts;
const fixtures = accounts.map(account=>account.id);
const output = 'artifacts/tutor-evaluation-http/'+(live?'production':'local')+'-'+randomUUID();
await mkdir(output,{recursive:true,mode:0o700});
const report = {revision:live?revision:null,fixtures,requests:0,checks:[],cleanupVerified:false};
await writeFile(output+'/result.json',JSON.stringify(report),{mode:0o600});
let lease, stage = 'lease', fixturesCommitted = false, writeInFlight = false, uncertain = false;
const pool = postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const authClient = () => createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{
  fetch(input,init) {
    const dest = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(dest.origin,new URL(url).origin);
    assert.match(dest.pathname,/^\/auth\/v1\/(token|user|logout)$/);
    return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
  },
}});

const scope = {scope:'tutor-evaluation'};
const kind = 'submit_tutor_evaluation';
async function invoke(query,token,body) {
  const method = body ? 'POST' : 'GET';
  const headers = token ? {authorization:'Bearer '+token} : {};
  report.requests++;
  if (live) {
    const path = body ? '/api/affairs-action' : '/api/affairs-data?'+new URLSearchParams(query);
    const response = await fetch(site+path,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(22000)});
    assert.match(response.headers.get('cache-control') ?? '',/no-store/);
    return {status:response.status,value:await response.json()};
  }
  let status,value;
  const outputHeaders = {};
  const response = {status(code){status=code;return response;},json(data){value=data;},setHeader(name,data){outputHeaders[name]=data;}};
  await (body?actionHandler:dataHandler)({method,headers,query,body},response);
  assert.match(outputHeaders['Cache-Control'],/no-store/);
  return {status,value};
}
async function get(token,status=200,query=scope) {
  const response = await invoke(query,token);
  assert.equal(response.status,status,`Expected HTTP ${status}, received ${response.status}.`);
  return response.value;
}
async function mutate(token,kind,payload,status=200) {
  writeInFlight = true;
  const response = await invoke(undefined,token,{kind,payload});
  writeInFlight = false;
  if (response.status >= 500) uncertain = true;
  assert.equal(response.status,status,`Expected HTTP ${status}, received ${response.status}.`);
  return response.value;
}
async function fingerprint(sql) {
  return (await sql`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls,
    (select md5(to_jsonb(u)::text) from auth.users u where lower(email)=lower(${config.supabase.ownerEmail})) as owner,
    (select count(*)::int from public.affairs_tutor_evaluations where user_id<>all(${fixtures}::uuid[])) as other_evaluations,
    exists(select 1 from supabase_migrations.schema_migrations where version='20261114050000') as deployed`)[0];
}
let baseline;
const sessions = [];
try {
  lease = await reserveDormitoryConductLease(pool);
  const {sql} = lease;
  baseline = await fingerprint(sql);
  assert.ok(baseline.deployed && baseline.owner && baseline.migrations===139 && baseline.rls===155);
  stage = 'fixtures';
  await sql.unsafe('begin');
  try {
    for (const {id,email,password,google} of accounts) {
      const providers = google?['email','google']:['email'];
      await sql`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,reauthentication_token,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},
        extensions.crypt(${password},extensions.gen_salt('bf')),now(),'','','','','','',
        ${sql.json({provider:'email',providers})},'{"full_name":"Tutor Evaluation QA"}',now(),now())`;
      for (const provider of providers) {
        await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
          values (${id},${id},${sql.json({sub:id,email,email_verified:true})},${provider},now(),now())`;
      }
    }
    await sql.unsafe('commit');
    fixturesCommitted = true;
  } catch (error) {
    await sql.unsafe('rollback').catch(()=>{});
    throw error;
  }
  for (const account of accounts) {
    const client = authClient();
    const {data,error} = await client.auth.signInWithPassword({email:account.email,password:account.password});
    assert.ok(!error && data.session?.user.id===account.id,error?.code ?? 'Fixture sign-in failed');
    sessions.push({client,token:data.session.access_token});
  }
  const [{token},{token:foreignToken},{token:emailToken}] = sessions;
  stage = 'scope and identity';
  await get(undefined,401);
  await get(emailToken,401);
  await get(token,400,{...scope,user_id:other.id});
  await get(token,400,{...scope,resource:'conversations'});
  assert.deepEqual(await get(token),{userId:own.id,student:null,evaluation:null});
  assert.deepEqual(await get(foreignToken),{userId:other.id,student:null,evaluation:null});
  report.checks.push('exact-scope-guest-and-non-google-denial');
  stage = 'survey validation, save and reload';
  const submission = {request_id:randomUUID(),ratings:[5,4,3,2,1,5,4,3,2,1],comment:' 測試回饋 '};
  await mutate(emailToken,kind,submission,401);
  await mutate(token,kind,{...submission,user_id:other.id},400);
  await mutate(token,kind,{...submission,ratings:[1,2,3]},400);
  const saved = await mutate(token,kind,submission);
  assert.equal(saved.userId,own.id);
  assert.equal(saved.requestId,submission.request_id);
  assert.ok(Number.isFinite(Date.parse(saved.submittedAt)));
  assert.deepEqual(await mutate(token,kind,submission),saved);
  await mutate(token,kind,{...submission,comment:'changed'},409);
  await mutate(token,kind,{...submission,request_id:randomUUID()},409);
  assert.deepEqual(await get(token),{userId:own.id,student:null,evaluation:{
    ratings:submission.ratings,comment:submission.comment,submittedAt:saved.submittedAt,
  }});
  assert.deepEqual(await get(foreignToken),{userId:other.id,student:null,evaluation:null});
  report.checks.push('immutable-submission-retry-and-account-isolation');
  await verifyRelease();
} catch (error) {
  report.failure = {stage,code:error.code ?? error.name,line:error.stack?.match(/tutor-evaluation-http-live\.mjs:(\d+)/)?.[1]};
} finally {
  try {
    if (!writeInFlight && !uncertain && lease && !lease.lost && fixturesCommitted) {
      const {sql} = lease;
      for (const {client} of sessions) await client.auth.signOut({scope:'local'});
      const rows = await sql`select id,email from auth.users where id=any(${fixtures}::uuid[])`;
      assert.equal(rows.length,fixtures.length);
      assert.ok(rows.every(({id,email})=>accounts.some(account=>account.id===id && account.email===email)));
      await sql`delete from auth.users where id=any(${fixtures}::uuid[])`;
      const [left] = await sql`select
        (select count(*)::int from auth.users where id=any(${fixtures}::uuid[])) as users,
        (select count(*)::int from auth.identities where user_id=any(${fixtures}::uuid[])) as identities,
        (select count(*)::int from auth.sessions where user_id=any(${fixtures}::uuid[])) as sessions,
        (select count(*)::int from public.affairs_tutor_evaluations where user_id=any(${fixtures}::uuid[])) as evaluations`;
      assert.ok(Object.values(left).every(value=>value===0));
      assert.deepEqual(await fingerprint(sql),baseline);
      report.cleanupVerified = true;
    }
  } catch (error) {report.cleanupFailure = error.code ?? error.name;}
  try {await lease?.release();} finally {await pool.end({timeout:5});}
  report.status = !report.failure && report.cleanupVerified ? 'passed' : 'failed';
  report.uncertainWrite = writeInFlight || uncertain;
  await writeFile(output+'/result.json',JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({status:report.status,output,requests:report.requests,checks:report.checks,
    cleanupVerified:report.cleanupVerified,failure:report.failure,cleanupFailure:report.cleanupFailure}));
  if (report.status!=='passed') process.exitCode=1;
}

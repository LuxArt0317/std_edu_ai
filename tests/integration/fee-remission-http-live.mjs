import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget, reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import dataHandler from '../../api/affairs-data.ts';
import manageHandler from '../../api/affairs-manage.ts';

const args = process.argv.slice(2);
assert.ok(args.length === 1 && ['--local-handlers','--deployed'].includes(args[0]));
const live = args[0] === '--deployed';
const site = 'https://stu.best';
const release = process.env.EXPECTED_RELEASE_REVISION;
async function verifyRelease() {
  if (!live) return;
  assert.match(release ?? '', /^[0-9a-f]{40}$/);
  const response = await fetch(site+'/release.json', {redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.equal(response.status, 200);
  const manifest = await response.json();
  assert.equal(manifest.revision, release);
  assert.equal(manifest.environment, 'production');
}
await verifyRelease();
const config = JSON.parse(await readFile('deployment.json','utf8'));
assert.equal(config.repository, 'LuxArt0317/std_edu_ai');
const env = deploymentEnvironment();
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
assert.equal(new URL(url).origin, 'https://xiftudmvxphxcjtmfmib.supabase.co');
assert.ok(key);
if (!live) Object.assign(process.env, {VITE_SUPABASE_URL:url, VITE_SUPABASE_PUBLISHABLE_KEY:key});
const connection = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
dormitoryConductClientTarget(connection);
let lease;
const pool = postgres(connection, {max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose()});
const owner = parseEnv(await readFile('.env.owner.local','utf8'));
assert.equal(owner.CRM_ADMIN_EMAIL.toLowerCase(), config.supabase.ownerEmail.toLowerCase());
const scopedFetch = (input, init) => {
  const dest = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(dest.origin, new URL(url).origin);
  assert.match(dest.pathname, /^\/auth\/v1\/(token|user|logout)$/);
  return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
};
const authClient = () => createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:scopedFetch}});
const own = randomUUID(), other = randomUUID(), rowId = randomUUID();
const fixtureIds = [own,other];
const run = randomUUID(), output = `artifacts/fee-remission-http/${live?'production':'local'}-${run}`;
await mkdir(output,{recursive:true,mode:0o700});
const report = {run,fixtureIds,rowId,release:live?release:null,requests:0,checks:[],cleanupVerified:false};
await writeFile(output+'/recovery.json',JSON.stringify(report),{mode:0o600});
let stage = 'database target', fixturesCommitted = false, writing = false, uncertain = false, passed = false;
const ownerClient = authClient();
let ownerSession;
async function invoke(query, token, body) {
  report.requests++;
  if (live) {
    const path = body ? '/api/affairs-manage' : '/api/affairs-data?'+new URLSearchParams(query);
    const response = await fetch(site+path,{method:body?'POST':'GET',redirect:'error',cache:'no-store',
      headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(23000)});
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    return {status:response.status,body:await response.json()};
  }
  let status, result;
  const headers = {};
  const res = {status(code){status=code;return res;},json(value){result=value;},setHeader(name,value){headers[name]=value;}};
  await (body ? manageHandler : dataHandler)({method:body?'POST':'GET',headers:{authorization:token?'Bearer '+token:undefined},query,body},res);
  assert.match(headers['Cache-Control'],/no-store/);
  return {status,body:result};
}
async function get(query, token, status = 200) {
  const result = await invoke(query,token);
  assert.equal(result.status,status);
  return result.body;
}
async function write(kind, payload, token, expected = 200) {
  writing = true;
  try {
    const result = await invoke(undefined,token,{kind,payload});
    writing = false;
    if (result.status >= 500) uncertain = true;
    assert.equal(result.status,expected);
    return result.body;
  } catch (error) {
    if (writing) uncertain = true;
    throw error;
  }
}
const scope = {scope:'fee-remission'}, adminScope = {scope:'fee-remission-admin',user_id:own};
try {
  lease = await reserveDormitoryConductLease(pool);
  const {sql} = lease;
  const [baseline] = await sql`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls,
    exists(select 1 from supabase_migrations.schema_migrations where version='20261114030000') as deployed`;
  assert.deepEqual(baseline,{migrations:137,rls:153,deployed:true});
  const [administrator] = await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id
    where lower(u.email)=lower(${config.supabase.ownerEmail}) and p.role='admin' and u.email_confirmed_at is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
  assert.ok(administrator && !fixtureIds.includes(administrator.id));
  stage = 'fixture accounts';
  // Generate known IDs and commit the temporary users and all their identities together.
  const accounts = fixtureIds.map(id => ({id,email:`fee-remission-qa-${id}@example.invalid`,password:randomBytes(24).toString('base64url')+'Aa1!'}));
  await sql.unsafe('begin');
  try {
    for (const {id,email,password} of accounts) {
      await sql`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,reauthentication_token,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},
        extensions.crypt(${password},extensions.gen_salt('bf')),now(),'','','','','','',
        '{"provider":"email","providers":["email","google"]}','{"full_name":"Fee Remission QA"}',now(),now())`;
      for (const provider of ['email','google']) {
        await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
          values (${id},${id},${sql.json({sub:id,email,email_verified:true})},${provider},now(),now())`;
      }
      await sql`insert into public.affairs_profiles(user_id,email,display_name,role) values (${id},${email},'Fee Remission QA','student')`;
    }
    await sql.unsafe('commit');
    fixturesCommitted = true;
  } catch (error) {
    await sql.unsafe('rollback').catch(() => {});
    throw error;
  }
  stage = 'auth';
  const sessions = [];
  for (const account of accounts) {
    const {data,error} = await authClient().auth.signInWithPassword({email:account.email,password:account.password});
    assert.ok(!error && data.session?.user.id === account.id, error?.code ?? 'Fixture sign-in failed');
    sessions.push(data.session.access_token);
  }
  const signed = await ownerClient.auth.signInWithPassword({email:owner.CRM_ADMIN_EMAIL,password:owner.CRM_ADMIN_PASSWORD});
  assert.ok(!signed.error && signed.data.session?.user.id === administrator.id);
  ownerSession = signed.data.session;
  const [ownToken,otherToken] = sessions, adminToken = ownerSession.access_token;
  stage = 'empty and forbidden reads';
  await get(scope,undefined,401);
  assert.deepEqual(await get(scope,ownToken),{userId:own,records:[]});
  await get(adminScope,ownToken,403);
  await get({...scope,user_id:other},ownToken,400);
  report.checks.push('authenticated-empty-guest-and-selected-account-denial');
  stage = 'audited save and isolated read';
  const payload = {id:rowId,user_id:own,request_id:randomUUID(),expected_version:0,row_order:0,
    academic_year_text:'001',semester_text:'',student_number:null,category_text:'測試',amount_text:'0',check_status_text:null,notes_text:' 原文 '};
  await write('save_fee_remission',payload,ownToken,403);
  const first = await write('save_fee_remission',payload,adminToken);
  assert.deepEqual(first,{id:rowId,kind:'save_fee_remission',version:1});
  assert.deepEqual(await write('save_fee_remission',payload,adminToken),first);
  const {user_id:_user,request_id:_request,expected_version:_version,...cells} = payload;
  const result = {userId:own,records:[{...cells,version:1}]};
  assert.deepEqual(await get(scope,ownToken),result);
  assert.deepEqual(await get(adminScope,adminToken),result);
  assert.deepEqual(await get(scope,otherToken),{userId:other,records:[]});
  report.checks.push('save-replay-literal-history-and-other-account-isolation');
  stage = 'edit and delete';
  const update = {...payload,request_id:randomUUID(),expected_version:1,amount_text:' 001,000 '};
  assert.equal((await write('save_fee_remission',update,adminToken)).version,2);
  assert.equal((await get(scope,ownToken)).records[0].amount_text,' 001,000 ');
  await write('save_fee_remission',{...update,request_id:randomUUID()},adminToken,409);
  const deletion = {id:rowId,user_id:own,request_id:randomUUID(),expected_version:2};
  assert.equal((await write('delete_fee_remission',deletion,adminToken)).version,3);
  assert.deepEqual(await get(scope,ownToken),{userId:own,records:[]});
  assert.equal((await sql`select count(*)::int as n from public.affairs_agent_audit where target_id=${rowId}`)[0].n,3);
  report.checks.push('versioned-edit-stale-denial-and-soft-delete');
  await verifyRelease();
  passed = true;
} catch (error) {
  report.failure = {stage,code:error.code ?? error.name,line:error.stack?.match(/fee-remission-http-live\.mjs:(\d+)/)?.[1]};
  process.exitCode = 1;
} finally {
  try {
    if (ownerSession) await ownerClient.auth.signOut({scope:'local'});
    if (lease && !lease.lost && !uncertain) {
      const {sql} = lease;
      const rows = await sql`select id,email from auth.users where id=any(${fixtureIds}::uuid[])`;
      assert.ok(rows.every(({id,email}) => email === `fee-remission-qa-${id}@example.invalid`));
      await sql`delete from public.affairs_agent_audit where target_id=${rowId} and action_kind in ('save_fee_remission','delete_fee_remission')`;
      await sql`delete from auth.users where id=any(${fixtureIds}::uuid[])`;
      const [clean] = await sql`select (select count(*)::int from auth.users where id=any(${fixtureIds}::uuid[])) as users,
        (select count(*)::int from auth.identities where user_id=any(${fixtureIds}::uuid[])) as identities,
        (select count(*)::int from public.affairs_profiles where user_id=any(${fixtureIds}::uuid[])) as profiles,
        (select count(*)::int from public.affairs_fee_remission where id=${rowId}) as rows,
        (select count(*)::int from private.affairs_fee_remission_operations where user_id=any(${fixtureIds}::uuid[])) as receipts,
        (select count(*)::int from public.affairs_agent_audit where target_id=${rowId}) as audit`;
      assert.ok(Object.values(clean).every(value=>value===0));
      report.cleanupVerified = true;
    }
  } catch (error) { report.cleanupFailure = error.code ?? error.name; process.exitCode = 1; }
  try { await lease?.release(); } finally { await pool.end({timeout:5}); }
  report.status = passed && report.cleanupVerified ? 'passed' : 'failed';
  report.fixturesCommitted = fixturesCommitted;
  report.uncertainWrite = uncertain;
  if (report.status !== 'passed') process.exitCode = 1;
  await writeFile(output+'/recovery.json',JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({output,...report}));
}

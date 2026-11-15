import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { deploymentEnvironment } from '../../scripts/deployment-env.mjs';
import { healthReportBucket } from '../../server/healthExaminationContract.js';
import { dormitoryConductClientTarget, reserveDormitoryConductLease } from './dormitory-conduct-rls-live.mjs';
import dataHandler from '../../api/affairs-data.ts';
import { buildHealthExaminationCases } from '../evaluation/health-examination-cases.mjs';
import { gradeCase } from '../evaluation/grading.mjs';
import { readReply, sourceIdentity } from '../evaluation/run.mjs';
import { createPinnedDeploymentVerifier } from '../evaluation/pinned-deployment.mjs';
import { createTrustedPreviewFetch, isEvaluationPreviewOrigin } from '../evaluation/vercel-preview-transport.mjs';
import { assertConversationRecoveryClear } from './assistant-conversation-http-live.mjs';

const preview=process.argv.length===3&&process.argv[2]==='--assistant-preview';
assert.ok(process.argv.length===2||preview,'Use --assistant-preview for the protected assistant check.');
const revision=process.env.EXPECTED_RELEASE_REVISION;
const site=preview?process.env.APPROVED_PREVIEW_ORIGIN:'https://stu.best';
const rootConfig=JSON.parse(await readFile('deployment.json','utf8'));
assert.equal(rootConfig.repository,'LuxArt0317/std_edu_ai');
assert.equal(rootConfig.supabase.projectRef,'xiftudmvxphxcjtmfmib');
assert.equal(rootConfig.vercel.productionUrl,'https://stu.best');
let transport=fetch,previewPin;
if(preview){
  assert.ok(isEvaluationPreviewOrigin(site)&&/^[a-f0-9]{40}$/u.test(revision??''),'Use the exact approved Preview origin and full revision.');
  const source=await sourceIdentity();
  assert.equal(source.dirty,false);
  assert.equal(source.sourceRevision,revision);
  transport=createTrustedPreviewFetch({origin:site,token:process.env.VERCEL_OIDC_TOKEN});
  previewPin=createPinnedDeploymentVerifier({origin:site,expectedRevision:revision,approvedPreviewOrigin:site,fetchImpl:transport});
  await previewPin.pin();
}

const env = deploymentEnvironment();
const connection = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
assert.equal(new URL(url).origin, 'https://xiftudmvxphxcjtmfmib.supabase.co');
assert.ok(key && serviceKey, 'Client publishable and Storage operator credentials are required.');
Object.assign(process.env, { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key, SUPABASE_SECRET_KEY: serviceKey });

const config=rootConfig;
async function pin() {
  if(previewPin){await previewPin.assertCurrent();return;}
  if (!revision) return;
  assert.match(revision, /^[0-9a-f]{40}$/u);
  const response = await fetch(site + '/release.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  assert.equal((await response.json()).revision, revision);
}
await pin();
function client(accessKey) {
  return createClient(url, accessKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init)=>{
      assert.equal(new URL(input instanceof Request?input.url:input).origin,url);
      return fetch(input,{...init,signal:AbortSignal.timeout(15000),redirect:'error',credentials:'omit'});
    } },
  });
}
const admin = client(serviceKey).storage.from(healthReportBucket);
const users = Array.from({ length: 2 }, () => {
  const id = randomUUID();
  return { id, email: 'health-qa-' + id + '@example.invalid', password: randomBytes(24).toString('base64url') + 'Aa1!', client: client(key) };
});
const [student, other] = users;
const available=randomUUID(),hidden=randomUUID(),missing=randomUUID();
const runId=randomUUID();
const directory='artifacts/assistant-evaluation';
const ledger=directory+'/active-fixtures-'+runId+'.json';
const records=preview?[available,hidden,missing]:[available,hidden];
const pathFor=id=>student.id+'/'+id+'.pdf';
const frozenAvailability=buildHealthExaminationCases().find(row=>row.id==='account:health-examinations-report-available');
const paths = [available, hidden].map(id => student.id + '/' + id + '.pdf');
const content = '%PDF-1.4\n% synthetic test data\n%%EOF\n';
let lease,committed=false,owner,ledgerOpen=false,cleanupVerified=false,assistantProof=null;
let phase='preflight',failure=null,pdfVerified=false;
const interruption=new AbortController();
const interrupt=()=>interruption.abort();
const assertRunning=()=>{if(interruption.signal.aborted)throw new Error('The protected report check was interrupted.');};
async function saveLedger(phase){
  const next=ledger+'.tmp';
  await writeFile(next,JSON.stringify({runId,phase,site,revision,users:users.map(({id,email})=>({id,email})),records,paths})+'\n',{flag:'wx',mode:0o600,flush:true});
  await rename(next,ledger);
  ledgerOpen=true;
}
const pool = postgres(connection, {
  max: 1, connect_timeout: 12, max_lifetime: 0, idle_timeout: 0,
  ssl: { rejectUnauthorized: true, ca: await readFile('supabase/certs/prod-ca-2021.crt', 'utf8') },
  connection: { statement_timeout: 15000 }, onclose: () => lease?.lose(), onnotice: () => {},
});
async function call(query, token, status = 200) {
  const endpoint = new URL('/api/affairs-data?scope=health-examinations' + query, site);
  const headers = token ? { authorization: 'Bearer ' + token } : {};
  if (revision&&(!preview||token)) {
    if(previewPin)await previewPin.assertCurrent();
    const response = await transport(endpoint, { headers, signal: AbortSignal.timeout(15000), redirect: 'error' });
    assert.equal(response.status, status);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    return response.json();
  }
  let code, body;
  const response = { setHeader() {}, status(value) { code = value; return this; }, json(value) { body = value; } };
  await dataHandler({ method: 'GET', headers, query: Object.fromEntries(endpoint.searchParams) }, response);
  assert.equal(code, status);
  return body;
}
async function ownerState(sql) {
  return (await sql`select md5(to_jsonb(u)::text) digest from auth.users u where lower(email)=lower(${config.supabase.ownerEmail})`)[0]?.digest;
}
if(preview){process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);}
try {
  lease = await reserveDormitoryConductLease(pool);
  const { sql } = lease;
  owner=await ownerState(sql);
  assert.ok(owner);
  if(preview){
    await mkdir(directory,{recursive:true,mode:0o700});
    const metadata=await lstat(directory);
    assert.ok(metadata.isDirectory()&&metadata.uid===process.getuid()&&(metadata.mode&0o077)===0);
    await assertConversationRecoveryClear([directory,'artifacts/assistant-conversation-http']);
    await previewPin.assertCurrent();
    const [occupied]=await sql`select
      (select count(*)::int from auth.users where id in ${sql(users.map(user=>user.id))} or email in ${sql(users.map(user=>user.email))}) identities,
      (select count(*)::int from public.affairs_health_examinations where id in ${sql(records)}) records,
      (select count(*)::int from storage.objects where bucket_id=${healthReportBucket} and name in ${sql(records.map(pathFor))}) objects`;
    assert.ok(Object.values(occupied).every(count=>count===0),'The reserved fixture keys must be unused.');
    await saveLedger('reserved');
  }
  assertRunning();
  phase='reserve-synthetic-rows';
  await sql.unsafe('begin');
  try {
    for (const { id, email, password } of users) {
      await sql`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,reauthentication_token,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},
        extensions.crypt(${password},extensions.gen_salt('bf')),now(),'','','','','','',
        '{"provider":"email","providers":["email","google"]}','{"full_name":"Health Inquiry QA"}',now(),now())`;
      for (const provider of ['email', 'google']) await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${sql.json({ sub: id, email, email_verified: true })},${provider},now(),now())`;
      await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${id},${email},'Health Inquiry QA')`;
    }
    await sql`insert into public.affairs_health_examinations
      (id,user_id,examination_code,student_number,student_name,class_label,examined_on,report_available)
      values(${available},${student.id},${preview?'QA HEALTH A-01':'QA-AVAILABLE'},'QA-01','QA Student','QA Class',current_date,true),
        (${hidden},${student.id},${preview?'QA HEALTH A-02':'QA-HIDDEN'},'QA-01','QA Student','QA Class',current_date-1,false)`;
    if(preview)await sql`insert into public.affairs_health_examinations
      (id,user_id,examination_code,student_number,student_name,class_label,examined_on,report_available)
      values(${missing},${student.id},'QA HEALTH A-03','QA-01','QA Student','QA Class',current_date-2,true)`;
    await sql.unsafe('commit');
    committed = true;
  } catch (error) {
    await sql.unsafe('rollback');
    throw error;
  }
  if(preview)await saveLedger('accounts-and-rows');
  phase='authenticate-fixtures';
  const tokens = [];
  for (const account of users) {
    const { data, error } = await account.client.auth.signInWithPassword({ email: account.email, password: account.password });
    assert.ok(!error && data.user?.id === account.id, 'Disposable sign-in failed.');
    tokens.push(data.session.access_token);
  }
  await call('', '', 401);
  await call('&user_id=' + student.id, tokens[1], 400);
  await call('&resource=conversations', tokens[1], 400);
  await call('&page=202', tokens[0], 400);
  assert.deepEqual((await call('', tokens[0])).rows.map(row => row.report_available), records.map(()=>false));
  assert.deepEqual(await call('', tokens[1]), { userId: other.id, total: 0, rows: [] });
  assertRunning();
  phase='upload-reserved-objects';
  if(preview){await previewPin.assertCurrent();await saveLedger('uploading-only-reserved-paths');}
  for (const path of paths) {
    assertRunning();
    await lease.assertHeld();
    const result = await admin.upload(path, Buffer.from(content), { contentType: 'application/pdf', cacheControl: '0', upsert: false });
    assert.ok(!result.error, 'Synthetic PDF upload failed.');
  }
  const saved = await call('', tokens[0]);
  assert.equal(saved.total,records.length);
  assert.deepEqual(saved.rows.map(row=>[row.id,row.report_available]),records.map((id,index)=>[id,index===0]));
  if(preview){
    phase='check-assistant-metadata';
    assertRunning();
    const ticket=await previewPin.beforeRequest();
    const response=await transport(site+'/api/affairs-assistant',{method:'POST',
      headers:{Authorization:'Bearer '+tokens[0],'Content-Type':'application/json',Accept:'text/event-stream'},
      body:JSON.stringify({question:frozenAvailability.question,route:frozenAvailability.route,stream:true,consentedResearchUse:false}),
      signal:AbortSignal.any([interruption.signal,AbortSignal.timeout(65000)])});
    const {body,events}=await readReply(response);
    await previewPin.afterRequest(ticket);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type')??'',/^text\/event-stream/iu);
    assert.ok(response.headers.get('x-assistant-request-id'),'Expected one correlated assistant result.');
    const result=gradeCase(frozenAvailability,{body,events,statusCode:response.status,execution:'live-model',fixtureKey:frozenAvailability.fixtureKey});
    assistantProof={caseId:frozenAvailability.id,passed:result.passed,criteriaFailed:result.failures.map(failure=>failure.id),
      flags:[true,false,false],verification:body.verification?.status,attempts:body.verification?.attempts,
      sourceCount:body.citations?.length??0,pairedReadback:false};
    assert.equal(result.passed,true,'The frozen availability criteria must pass.');
    const visible=JSON.stringify({body,events});
    assert.doesNotMatch(visible,/storage\/v1|signed.?url.{0,8}:|QA Student|QA Class|QA-01|%PDF/iu);
    assert.ok(!visible.includes(student.id)&&!visible.includes(other.id)&&records.every(id=>!visible.includes(id))
      &&tokens.every(token=>!visible.includes(token)),'The reply must expose availability metadata only.');
    assert.deepEqual(await call('',tokens[0]),saved);
    assert.deepEqual(await call('',tokens[1]),{userId:other.id,total:0,rows:[]});
    assistantProof.pairedReadback=true;
  }
  phase='check-private-download';
  assertRunning();
  const report = '&report=' + available;
  await call(report, '', 401);
  await call(report, tokens[1], 404);
  await call('&report=' + hidden, tokens[0], 404);
  if(preview)await call('&report='+missing,tokens[0],404);
  await call('&report=invalid', tokens[0], 400);
  await call(report + '&page=1', tokens[0], 400);
  const capability = await call(report, tokens[0]);
  const signedPath = new URL(capability.url);
  assert.ok(signedPath.origin === url && signedPath.pathname === '/storage/v1/object/sign/' + healthReportBucket + '/' + paths[0],
    'Download capability points at an unexpected object.');
  const mine = await fetch(signedPath, { cache: 'no-store', signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!mine.ok) {
    await mine.body?.cancel();
    throw new Error('Signed PDF response status '+mine.status+'.');
  }
  assert.equal(mine.headers.get('content-type'), 'application/pdf');
  assert.equal(await mine.text(), content);
  pdfVerified=true;
  for (const token of [tokens[0], tokens[1], '']) {
    const denied = await fetch(url + '/storage/v1/object/authenticated/' + healthReportBucket + '/' + paths[0], {
      headers: { apikey: key, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      cache: 'no-store', signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    assert.ok([400, 401, 403, 404].includes(denied.status), 'A denied direct PDF was returned.');
    assert.notEqual(denied.headers.get('content-type'), 'application/pdf');
    await denied.body?.cancel();
  }
  assertRunning();
  await sql`update public.affairs_health_examinations set report_available=false where id=${available} and user_id=${student.id}`;
  await call(report, tokens[0], 404);
  const signed = await student.client.storage.from(healthReportBucket).createSignedUrl(paths[0], 60);
  assert.ok(signed.error && !signed.data, 'Signed URL creation must be denied.');
  await pin();
  if(previewPin){
    const source=await sourceIdentity();
    assert.equal(source.dirty,false);
    assert.equal(source.sourceRevision,revision);
    await previewPin.finish();
  }
} catch(error){
  if(!preview)throw error;
  failure={phase,type:error.name};
} finally {
  try {
    if (committed && lease && !lease.lost) {
      const { sql } = lease;
      try {
        await lease.assertHeld();
        const removed = await admin.remove(paths);
        assert.ok(!removed.error, 'Synthetic Storage cleanup failed.');
        const [files] = await sql`select count(*)::int remaining from storage.objects
          where bucket_id=${healthReportBucket} and name in (${paths[0]},${paths[1]})`;
        assert.equal(files.remaining, 0);
      } finally {
        for (const { id, email, client: auth } of users) {
          await auth.auth.signOut({ scope: 'local' }).catch(() => {});
          const deleted = await sql`delete from auth.users where id=${id} and email=${email} returning id`;
          assert.equal(deleted.length, 1);
        }
      }
      const [remaining] = await sql`select
        (select count(*)::int from auth.users where id in (${student.id},${other.id})) users,
        (select count(*)::int from auth.identities where user_id in (${student.id},${other.id})) identities,
        (select count(*)::int from auth.sessions where user_id in (${student.id},${other.id})) sessions,
        (select count(*)::int from public.affairs_profiles where user_id in (${student.id},${other.id})) profiles,
        (select count(*)::int from public.affairs_health_examinations where user_id in (${student.id},${other.id})) examinations`;
      assert.ok(Object.values(remaining).every(count => count === 0));
      assert.equal(await ownerState(sql), owner);
      cleanupVerified=true;
      if(ledgerOpen)await unlink(ledger);
    }
  } catch(error){
    if(!preview)throw error;
    failure??={phase:'cleanup',type:error.name};
  } finally {
    if(preview){process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);}
    try { if (lease && !lease.lost) await lease.release(); } finally { await pool.end({ timeout: 4 }); }
  }
}
if(preview){
  const passed=!failure&&pdfVerified&&assistantProof?.pairedReadback&&cleanupVerified&&previewPin.status().status==='finished';
  console.log(JSON.stringify({revision,site,status:passed?'passed':'failed',failure,assistant:assistantProof,pdfVerified,cleanupVerified,release:previewPin.status()}));
  if(!passed)process.exitCode=1;
}
else console.log('Actual JWT inquiry, private PDF, guest and other-account denial, and exact fixture cleanup passed.');

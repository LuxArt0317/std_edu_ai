import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,stat,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {DtmSubmissionError,executeDtmSubmissionAction,manageDtmSubmissionReview,loadDtmSubmissionWorkspace,
  createDtmSubmissionDownload,cleanupDtmSubmissionUploads} from '../../server/dtmSubmissions.js';

// Requires the parent's explicit live-test authorization and serialized DB
// lease, AFTER150000 has passed rollback preflight and been applied.
// node tests/integration/dtm-submissions-storage-live.mjs --execute --expected-migrations=N --expected-rls=N
// Optional actual local browser/API acceptance (same fixture/cleanup boundary):
// tsx tests/integration/dtm-submissions-storage-live.mjs --execute --expected-migrations=N --expected-rls=N --browser-origin=http://127.0.0.1:5184
// Production: use --browser-origin=https://stu.best; all browser APIs then use
// deployed HTTP, never working-tree handlers. Default Storage10 checks are unchanged.
// Real bytes use only newly generated fixtures. Never delete storage.objects:
// every object removal, including emergency cleanup, goes through Storage HTTP.
// Owner password/JWTs, signed URLs and file bytes stay in memory. An ignored0600
// recovery manifest records only exact synthetic identifiers and planned emails.
// Owner fingerprint excludes only normal sign-in timestamps; no identity edits.
process.umask(0o077);
const arg=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
let phase='authorization gate';
const counts={passed:false,checks:0,usersCreated:0,uploads:0,uploadedBytes:0,downloads:0,helperCalls:0,
  commitRaceWins:0,cancelRaceWins:0,cleanupFailures:0,usersRemaining:0,objectsRemaining:0,queueRemaining:0,ownerFixtureRowsRemaining:0,ownerUnchanged:false};
const diagnostics=[];
const rpcNames=new Set(['affairs_initialize_account','dtm_manage_record','dtm_submission_action','dtm_submission_cleanup_batch','dtm_submission_cleanup_ack']);
const diagnosticOperations=new Set([...rpcNames,'begin_dtm_submission_upload','commit_dtm_submission_upload','cancel_dtm_submission_upload','save_dtm_submission_review']);
const diagnosticCodes=new Set(['23505','23503','23514','42501','22023','PT409','PGRST116','ERR_ASSERTION','ECONNRESET','ETIMEDOUT','ABORT_ERR']);
class HarnessResponseError extends Error{
  constructor(operation,status,expectedStatus,code){
    super('The fixture response did not match its contract.');this.name='HarnessResponseError';
    this.operation=operation;this.status=status;this.expectedStatus=expectedStatus;this.code=code;
  }
}
function safeDiagnostic(error){
  const value={type:error instanceof HarnessResponseError?'http':error instanceof DtmSubmissionError?'submission':error?.code==='ERR_ASSERTION'?'assertion':'other'};
  if(diagnosticOperations.has(error?.operation))value.operation=error.operation;
  if(Number.isInteger(error?.status)&&error.status>=100&&error.status<=599)value.status=error.status;
  if(Number.isInteger(error?.expectedStatus)&&error.expectedStatus>=100&&error.expectedStatus<=599)value.expectedStatus=error.expectedStatus;
  if(diagnosticCodes.has(error?.code))value.code=error.code;
  if(value.type==='assertion'){
    if(['==','===','!==','deepStrictEqual','strictEqual','notStrictEqual','match','rejects','fail'].includes(error.operator))value.operator=error.operator;
    for(const key of ['actual','expected'])if(error[key]===null||typeof error[key]==='boolean'||typeof error[key]==='number'&&Number.isFinite(error[key]))value[key]=error[key];
  }
  return value;
}
function recordFailure(label,error,race){
  const value={phase,label,...safeDiagnostic(error),...(race?{race}: {})};
  if(diagnostics.length<16)diagnostics.push(value);
  console.error(JSON.stringify({event:'dtm_submission_failure',...value}));
}
async function readRpcResponse(response,expectedStatus,operation){
  // Drain the body before an assertion/cleanup; never print response messages,
  // details, headers, URLs, identifiers, credentials or arbitrary error stacks.
  const text=await response.text();let data;
  try{data=text?JSON.parse(text):null;}catch{data=undefined;}
  if(response.status!==expectedStatus)throw new HarnessResponseError(operation,response.status,expectedStatus,data?.code);
  if(response.status===204)return null;
  assert.notEqual(data,undefined,'Caller-JWT response must be valid JSON.');return data;
}
const expectedRpcStatus=name=>name==='dtm_submission_cleanup_ack'?204:200;
function fixtureCourseCode(ordinal){
  assert.ok(Number.isSafeInteger(ordinal)&&ordinal>=1&&ordinal<=100);
  return 'SYNTHETIC-QA-'+ordinal;
}
const drainMutations=operations=>Promise.allSettled(operations);

async function selfTest(){
  const codes=Array.from({length:100},(_,index)=>fixtureCourseCode(index+1));
  assert.equal(new Set(codes).size,100);assert.ok(codes.every(code=>code.length<=32));
  assert.equal(await readRpcResponse(new Response(null,{status:204}),expectedRpcStatus('dtm_submission_cleanup_ack'),'dtm_submission_cleanup_ack'),null);
  await assert.rejects(()=>readRpcResponse(new Response(null,{status:204}),expectedRpcStatus('dtm_manage_record'),'dtm_manage_record'),error=>{
    assert.deepEqual(safeDiagnostic(error),{type:'http',operation:'dtm_manage_record',status:204,expectedStatus:200});return true;
  });
  const secret='PRIVATE-IDENTIFIER-TOKEN-URL';
  await assert.rejects(()=>readRpcResponse(new Response(JSON.stringify({code:'23505',message:secret,details:secret}),{status:409}),200,'dtm_manage_record'),error=>{
    const diagnostic=safeDiagnostic(error);assert.equal(diagnostic.code,'23505');assert.ok(!JSON.stringify(diagnostic).includes(secret));return true;
  });
  assert.deepEqual(safeDiagnostic({operation:secret,status:secret,code:secret,name:secret,message:secret,cause:secret}),{type:'other'});
  try{assert.equal(secret,'ANOTHER-PRIVATE-VALUE');}catch(error){assert.ok(!JSON.stringify(safeDiagnostic(error)).includes('PRIVATE'));}
  let lateMutationFinished=false;
  const results=await drainMutations([Promise.reject(new DtmSubmissionError('Conflict',409)),Promise.resolve().then(()=>{lateMutationFinished=true;return true;})]);
  assert.ok(lateMutationFinished);assert.deepEqual(results.map(result=>result.status),['rejected','fulfilled']);
  console.log(JSON.stringify({selfTestPassed:true,checks:7,liveRequests:0}));
}

async function main(){
  assert.ok(process.argv.includes('--execute'),'Live mutations require --execute and parent authorization.');
  const browserOrigin=arg('--browser-origin');
  const browserMode=browserOrigin===undefined?null:(await import('./dtm-submissions-browser.mjs')).dtmSubmissionBrowserMode(browserOrigin);
  if(browserMode)counts.browser={passed:false,mode:browserMode,checks:0};
  const expectedMigrations=Number(arg('--expected-migrations')),expectedRls=Number(arg('--expected-rls'));
  assert.ok(Number.isSafeInteger(expectedMigrations)&&expectedMigrations>0&&Number.isSafeInteger(expectedRls)&&expectedRls>0,'Exact deployed migration/RLS counts are required.');
  const deployment=JSON.parse(await readFile('deployment.json','utf8'));
  assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,'xiftudmvxphxcjtmfmib');
  const env=deploymentEnvironment(),project=deployment.supabase.projectRef;
  let origin,target;
  try{origin=new URL(env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL);target=new URL(env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL);}
  catch{throw new Error('Exact client connection configuration is required.');}
  assert.equal(origin.href,`https://${project}.supabase.co/`);
  assert.ok(target.hostname===`db.${project}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(target.username).endsWith('.'+project));
  const url=origin.origin,key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  assert.ok(typeof key==='string'&&key.length>20&&typeof serviceKey==='string'&&serviceKey.length>20);
  const ownerFile=await stat('.env.owner.local');assert.equal(ownerFile.mode&0o077,0,'Owner credential file must remain private.');
  const ownerEnv=parseEnv(await readFile('.env.owner.local','utf8'));
  assert.equal(ownerEnv.CRM_ADMIN_EMAIL?.toLowerCase(),deployment.supabase.ownerEmail.toLowerCase());assert.ok(ownerEnv.CRM_ADMIN_PASSWORD);
  let deadline=Date.now()+(browserOrigin?420000:240000);
  async function boundedFetch(input,init={}){
    const requestUrl=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    assert.equal(requestUrl.origin,url,'Only the exact client project may receive requests.');
    const remaining=deadline-Date.now();assert.ok(remaining>0,'Live test deadline exhausted.');
    const signal=AbortSignal.timeout(Math.min(15000,remaining));
    return fetch(input,{...init,redirect:'error',signal:init.signal?AbortSignal.any([init.signal,signal]):signal});
  }
  const client=accessKey=>createClient(url,accessKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}});
  const service=client(serviceKey),ownerClient=client(key);
  const sql=postgres(target.href,{max:2,connect_timeout:10,idle_timeout:5,
    connection:{application_name:'dtm_submissions_storage_qa',statement_timeout:15000,lock_timeout:5000},
    ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},onnotice:()=>{}});
  const runId=randomUUID(),users=new Map(),plannedEmails=new Set(),paths=new Map(),submissions=new Set(),ownerRequests=new Set();
  const courseIds=new Set(),assignmentIds=new Set(),studentOperations=new Map();
  const output='artifacts/dtm-submissions-storage-live',recoveryPath=output+'/recovery-'+runId+'.json',startedAt=new Date().toISOString();
  let recoveryReady=false,recoveryStatus='prepared',recoveryWrite=Promise.resolve();
  async function persistRecovery(status=recoveryStatus){
    recoveryStatus=status;
    const document=JSON.stringify({version:1,projectRef:project,runId,startedAt,updatedAt:new Date().toISOString(),status,
      plannedEmails:[...plannedEmails],syntheticUsers:[...users].map(([id,value])=>({id,email:value.email,deleted:value.deleted})),
      courseIds:[...courseIds],assignmentIds:[...assignmentIds],submissionIds:[...submissions],
      objectPaths:[...paths].map(([path,userId])=>({path,userId})),studentOperations:[...studentOperations.values()],
      ownerFixtureRequestIds:[...ownerRequests],cleanupVerified:status==='clean',cleanupFailures:counts.cleanupFailures},null,2)+'\n';
    const write=async()=>{
      await mkdir(output,{recursive:true,mode:0o700});
      await writeFile(recoveryPath+'.tmp',document,{mode:0o600,flush:true});
      await rename(recoveryPath+'.tmp',recoveryPath);recoveryReady=true;
    };
    // Serialize atomic replacements; a failed write blocks its following mutation.
    recoveryWrite=recoveryWrite.then(write,write);await recoveryWrite;
  }
  const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  let ownerId,ownerBefore,adminAccount,before,failed=false,lastRace;
  const acting=account=>({...account,requestDeadline:deadline});
  const accountFor=session=>({user:{id:session.user.id},url,key,token:session.access_token});
  const baseline=async()=>(await sql`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
  const fingerprint=async()=>(await sql`select md5((to_jsonb(u)-array['last_sign_in_at','updated_at'])::text) as auth_hash,
    md5(to_jsonb(p)::text) as profile_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(i)-array['last_sign_in_at','updated_at'] order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identity_hash
    from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${ownerId}`)[0];
  function assertFixtureUser(id){assert.ok(users.has(id)&&id!==ownerId,'Mutation must target a synthetic account from this run.');}
  async function remember(account,reservation){
    assertFixtureUser(account.user.id);assert.equal(reservation.path,`${account.user.id}/${reservation.submissionId}/${reservation.uploadId}`);
    assert.ok(reservation.path.split('/').length===3&&reservation.path.split('/').every(part=>uuidPattern.test(part)));
    paths.set(reservation.path,account.user.id);submissions.add(reservation.submissionId);await persistRecovery();return reservation;
  }
  function assertFixturePath(path){
    assert.ok(paths.has(path));assertFixtureUser(paths.get(path));
    const parts=path.split('/');assert.equal(parts.length,3);assert.ok(parts.every(part=>uuidPattern.test(part)));assert.equal(parts[0],paths.get(path));
  }
  async function jsonRequest(account,path,body,{method='POST',expected=200}={}){
    const response=await boundedFetch(url+path,{method,headers:{apikey:key,Authorization:'Bearer '+account.token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const name=path.startsWith('/rest/v1/rpc/')?path.slice('/rest/v1/rpc/'.length):'';
    return readRpcResponse(response,expected,rpcNames.has(name)?name:undefined);
  }
  const rpc=(account,name,body)=>jsonRequest(account,'/rest/v1/rpc/'+name,body,{expected:expectedRpcStatus(name)});
  const action=async(account,kind,payload)=>{
    assertFixtureUser(account.user.id);
    studentOperations.set(account.user.id+':'+payload.request_id,{userId:account.user.id,kind,requestId:payload.request_id,assignmentId:payload.assignment_id,uploadId:payload.upload_id??null});
    await persistRecovery();counts.helperCalls++;
    try{return await executeDtmSubmissionAction(acting(account),kind,payload);}catch(error){if(error instanceof DtmSubmissionError)error.operation=kind;throw error;}
  };
  const workspace=async(account,id)=>{counts.helperCalls++;return loadDtmSubmissionWorkspace(acting(account),id);};
  const denied=(fn,status=403)=>assert.rejects(fn,error=>error instanceof DtmSubmissionError&&error.status===status);
  async function fixture(number){
    const email=`dtm-storage-qa-${runId}-${number}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';
    assert.equal((await sql`select id from auth.users where lower(email)=lower(${email})`).length,0);
    plannedEmails.add(email);await persistRecovery();
    const created=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Synthetic Storage QA',dtm_storage_run:runId}});
    assert.ok(!created.error&&created.data.user,'Synthetic account creation failed.');
    const id=created.data.user.id;assert.notEqual(id,ownerId);users.set(id,{email,account:null,deleted:false});counts.usersCreated++;await persistRecovery();
    await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
      values(${id},${id},${sql.json({sub:id,email,email_verified:true})},'google',now(),now(),now())`;
    const signed=await client(key).auth.signInWithPassword({email,password});assert.ok(!signed.error&&signed.data.session,'Synthetic account sign-in failed.');
    const account=accountFor(signed.data.session);assert.equal(account.user.id,id);users.get(id).account=account;
    // Transient only. persistRecovery explicitly serializes identifiers/email,
    // never the session or account credentials stored in this in-memory map.
    if(browserOrigin)users.get(id).session=signed.data.session;
    await rpc(account,'affairs_initialize_account',{});return account;
  }
  async function assignment(account,label){
    const courseId=randomUUID(),id=randomUUID();assertFixtureUser(account.user.id);
    courseIds.add(courseId);assignmentIds.add(id);await persistRecovery();
    // Existing schema uniquely keys courses by owner/code/term. Every fixture
    // assignment gets its own course, so its code must also be distinct.
    await rpc(account,'dtm_manage_record',{p_kind:'save_dtm_course',p_payload:{id:courseId,code:fixtureCourseCode(courseIds.size),title:'Synthetic Storage Course',term:'Synthetic QA'}});
    await rpc(account,'dtm_manage_record',{p_kind:'save_dtm_assignment',p_payload:{id,course_id:courseId,title:label,details:'Synthetic live acceptance only',due_at:null,status:'open',meeting_id:null}});
    return id;
  }
  async function reserve(account,id,version,bytes,label='synthetic.txt'){
    const payload={assignment_id:id,request_id:randomUUID(),expected_version:version,filename:label,size_bytes:bytes.length,content_type:'text/plain'};
    const value=await remember(account,await action(account,'begin_dtm_submission_upload',payload));return {value,payload};
  }
  async function upload(account,reservation,bytes,{upsert=false,expectSuccess=true}={}){
    assertFixturePath(reservation.path);
    const response=await boundedFetch(url+'/storage/v1/object/dtm-submissions/'+reservation.path,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+account.token,'Content-Type':'text/plain','x-upsert':String(upsert)},body:bytes});
    if(expectSuccess){assert.ok(response.ok,'Synthetic Storage upload failed.');counts.uploads++;counts.uploadedBytes+=bytes.length;}
    else assert.ok(!response.ok,'Unauthorized/immutable Storage upload unexpectedly succeeded.');
    await response.arrayBuffer();
  }
  const commitPayload=(id,reservation,version)=>({assignment_id:id,request_id:randomUUID(),expected_version:version,upload_id:reservation.uploadId});
  async function download(account,id,uploadId,bytes){
    counts.helperCalls++;const capability=await createDtmSubmissionDownload(acting(account),id,uploadId);
    assert.equal(capability.expiresIn,60);const response=await boundedFetch(capability.signedUrl);
    assert.equal(response.status,200);assert.match(response.headers.get('content-disposition')||'',/attachment/i);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);counts.downloads++;
  }
  async function deleteStorage(account,path,privileged=false,expectSuccess=true){
    assertFixturePath(path);
    const response=await boundedFetch(url+'/storage/v1/object/dtm-submissions',{method:'DELETE',headers:{apikey:privileged?serviceKey:key,Authorization:'Bearer '+(privileged?serviceKey:account.token),'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})});
    if(expectSuccess)assert.ok(response.ok,'Fixture Storage API deletion failed.');
    else assert.ok(response.ok||[400,403,404].includes(response.status),'Immutable-file deletion check was unavailable.');
    await response.arrayBuffer();
  }
  async function absentObject(path){
    assertFixturePath(path);
    const response=await boundedFetch(url+'/storage/v1/object/info/dtm-submissions/'+path,{headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey}});
    assert.ok([400,404].includes(response.status),'Fixture object still exists after Storage API cleanup.');await response.arrayBuffer();
    assert.equal((await sql`select id from storage.objects where bucket_id='dtm-submissions' and name=${path}`).length,0);
  }
  async function sweepOwner(account){
    assertFixtureUser(account.user.id);
    for(let pass=0;pass<8;pass++){
      counts.helperCalls++;await cleanupDtmSubmissionUploads(acting(account));
      const [{n}]=await sql`select count(*)::int as n from private.dtm_submission_cleanup where user_id=${account.user.id}`;
      if(n===0)return;
    }throw new Error('Fixture cleanup did not drain within its bound.');
  }
  async function review(account,payload){
    counts.helperCalls++;if(account.user.id===ownerId){ownerRequests.add(payload.request_id);await persistRecovery();}
    return manageDtmSubmissionReview(acting(account),'save_dtm_submission_review',payload);
  }
  async function deleteUser(id){
    assertFixtureUser(id);await persistRecovery();const deleted=await service.auth.admin.deleteUser(id);
    assert.ok(!deleted.error,'Auth provider blocked synthetic account deletion.');users.get(id).deleted=true;await persistRecovery();
    assert.equal((await sql`select id from auth.users where id=${id}`).length,0);
  }
  try{
    phase='schema and owner preflight';before=await baseline();assert.deepEqual(before,{migrations:expectedMigrations,rls_tables:expectedRls});
    assert.ok((await sql`select to_regclass('public.dtm_assignment_submissions') as name`)[0].name,'Apply reviewed150000 before this test.');
    const [bucket]=await sql`select public,file_size_limit from storage.buckets where id='dtm-submissions'`;
    assert.ok(bucket&&!bucket.public&&Number(bucket.file_size_limit)===10485760);
    const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and p.role='admin'
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'Existing verified Google administrator required.');ownerId=owner.id;ownerBefore=await fingerprint();
    // First durable ledger precedes even the normal owner sign-in session write.
    await persistRecovery();
    const signed=await ownerClient.auth.signInWithPassword({email:ownerEnv.CRM_ADMIN_EMAIL,password:ownerEnv.CRM_ADMIN_PASSWORD});
    assert.ok(!signed.error&&signed.data.session,'Existing owner authentication failed.');
    const verified=await ownerClient.auth.getUser(signed.data.session.access_token);assert.ok(!verified.error&&verified.data.user);
    assert.equal(verified.data.user.id,ownerId);assert.equal(verified.data.user.email?.toLowerCase(),deployment.supabase.ownerEmail.toLowerCase());
    assert.ok(verified.data.user.email_confirmed_at);adminAccount=accountFor(signed.data.session);await persistRecovery('running');counts.checks++;

    phase='synthetic accounts and private authorization';
    const first=await fixture(1),second=await fixture(2),id=await assignment(first,'Synthetic primary submission'),otherId=await assignment(second,'Synthetic isolated submission');
    const bytesA=Buffer.from('Synthetic private submission A\n'),bytesB=Buffer.from('Synthetic private submission B\n'),bytesC=Buffer.from('Synthetic private submission C\n');
    const initial=await reserve(first,id,0,bytesA);
    assert.deepEqual(await action(first,'begin_dtm_submission_upload',initial.payload),initial.value);
    await denied(()=>action(first,'begin_dtm_submission_upload',{...initial.payload,filename:'changed.txt'}),409);
    await denied(()=>workspace(second,id));await denied(()=>action(second,'begin_dtm_submission_upload',{...initial.payload,request_id:randomUUID()}));
    await upload(second,initial.value,bytesB,{expectSuccess:false});await upload(first,initial.value,bytesA);
    for(const token of [null,second.token]){
      const response=await boundedFetch(url+'/storage/v1/object/authenticated/dtm-submissions/'+initial.value.path,{headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{})}});
      assert.ok(!response.ok,'Private bytes escaped owner authorization.');await response.arrayBuffer();
    }
    const publicRead=await boundedFetch(url+'/storage/v1/object/public/dtm-submissions/'+initial.value.path);assert.ok(!publicRead.ok);await publicRead.arrayBuffer();counts.checks++;

    phase='actual bytes and concurrent identical save';
    const firstCommit=commitPayload(id,initial.value,0);
    const duplicateResults=await drainMutations([action(first,'commit_dtm_submission_upload',firstCommit),action(first,'commit_dtm_submission_upload',firstCommit)]);
    lastRace={kind:'identical-save',outcomes:duplicateResults.map(result=>result.status==='fulfilled'?{status:result.status}:{status:result.status,...safeDiagnostic(result.reason)})};
    // Drain BOTH mutating requests before any assertion can enter cleanup.
    assert.ok(duplicateResults.every(result=>result.status==='fulfilled'),'Both identical commit requests must complete successfully.');
    const duplicate=duplicateResults.map(result=>result.value);
    assert.deepEqual(duplicate[0],duplicate[1]);assert.equal(duplicate[0].version,1);
    await download(first,id,initial.value.uploadId,bytesA);await denied(()=>createDtmSubmissionDownload(acting(second),id,initial.value.uploadId));
    await upload(first,initial.value,bytesB,{upsert:true,expectSuccess:false});
    await deleteStorage(first,initial.value.path,false,false);await download(first,id,initial.value.uploadId,bytesA);
    assert.equal((await workspace(first,id)).submission.version,1);counts.checks++;

    lastRace=undefined;phase='review authority and archived revision protection';
    const grading={...commitPayload(id,initial.value,0),status:'graded',grade_text:'Synthetic P',feedback:'Synthetic review'};
    await denied(()=>review(first,grading));const reviewed=await review(adminAccount,grading);assert.equal(reviewed.version,1);assert.deepEqual(await review(adminAccount,grading),reviewed);
    await download(adminAccount,id,initial.value.uploadId,bytesA);counts.checks++;

    phase='pending replacement cancellation and cleanup';
    const replacement=await reserve(first,id,1,bytesB);await upload(first,replacement.value,bytesB);
    assert.equal((await workspace(first,id)).submission.current_upload_id,initial.value.uploadId);
    const cancellation=commitPayload(id,replacement.value,1),cancelled=await action(first,'cancel_dtm_submission_upload',cancellation);
    assert.equal(cancelled.cancelled,true);assert.deepEqual(await action(first,'cancel_dtm_submission_upload',cancellation),cancelled);
    await denied(()=>action(first,'commit_dtm_submission_upload',{...cancellation,request_id:randomUUID()}),409);
    await download(first,id,initial.value.uploadId,bytesA);await sweepOwner(first);await absentObject(replacement.value.path);counts.checks++;

    phase='replacement, retired reviews and old receipt stability';
    const third=await reserve(first,id,1,bytesC);await upload(first,third.value,bytesC);
    const thirdSave=await action(first,'commit_dtm_submission_upload',commitPayload(id,third.value,1));assert.equal(thirdSave.version,2);
    await download(first,id,third.value.uploadId,bytesC);await download(adminAccount,id,initial.value.uploadId,bytesA);
    await denied(()=>review(adminAccount,{...grading,request_id:randomUUID(),expected_version:1}),409);
    await deleteStorage(first,initial.value.path,false,false);await download(first,id,initial.value.uploadId,bytesA);
    const fourth=await reserve(first,id,2,bytesB);await upload(first,fourth.value,bytesB);
    await action(first,'commit_dtm_submission_upload',commitPayload(id,fourth.value,2));await sweepOwner(first);await absentObject(third.value.path);
    assert.deepEqual(await action(first,'commit_dtm_submission_upload',firstCommit),duplicate[0]);
    assert.deepEqual(await action(first,'cancel_dtm_submission_upload',cancellation),cancelled);
    const retained=await workspace(first,id);assert.equal(retained.submission.current_upload_id,fourth.value.uploadId);assert.equal(retained.reviews[0].upload_id,initial.value.uploadId);
    await download(first,id,fourth.value.uploadId,bytesB);counts.checks++;

    phase='concurrent save/cancel fixture preparation';
    const raceId=await assignment(first,'Synthetic concurrent submission');let raceVersion=0,expectedBytes=bytesA,currentUpload;
    const base=await reserve(first,raceId,0,bytesA);await upload(first,base.value,bytesA);await action(first,'commit_dtm_submission_upload',commitPayload(raceId,base.value,0));raceVersion=1;currentUpload=base.value.uploadId;
    phase='independent concurrent save versus cancel';
    for(let round=0;round<3;round++){
      const candidateBytes=Buffer.from(`Synthetic race candidate ${round}\n`),candidate=await reserve(first,raceId,raceVersion,candidateBytes);await upload(first,candidate.value,candidateBytes);
      const save=commitPayload(raceId,candidate.value,raceVersion),cancel=commitPayload(raceId,candidate.value,raceVersion);
      const results=await drainMutations([action(first,'commit_dtm_submission_upload',save),action(first,'cancel_dtm_submission_upload',cancel)]);
      lastRace={kind:'save-cancel',round:round+1,outcomes:results.map(result=>result.status==='fulfilled'?{status:result.status}:{status:result.status,...safeDiagnostic(result.reason)})};
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1,'Exactly one atomic transition must win; no ordering is assumed.');
      const loser=results.find(result=>result.status==='rejected');assert.ok(loser.reason instanceof DtmSubmissionError&&loser.reason.status===409);
      if(results[0].status==='fulfilled'){
        counts.commitRaceWins++;raceVersion++;currentUpload=candidate.value.uploadId;expectedBytes=candidateBytes;
        assert.deepEqual(await action(first,'commit_dtm_submission_upload',save),results[0].value);
        await denied(()=>action(first,'cancel_dtm_submission_upload',{...cancel,request_id:randomUUID()}),409);
      }else{
        counts.cancelRaceWins++;assert.deepEqual(await action(first,'cancel_dtm_submission_upload',cancel),results[1].value);
        await denied(()=>action(first,'commit_dtm_submission_upload',{...save,request_id:randomUUID()}),409);
      }
      const state=await workspace(first,raceId);assert.equal(state.submission.version,raceVersion);assert.equal(state.submission.current_upload_id,currentUpload);
      await download(first,raceId,currentUpload,expectedBytes);await sweepOwner(first);
    }assert.equal(counts.commitRaceWins+counts.cancelRaceWins,3);counts.checks++;

    lastRace=undefined;phase='expired actual upload, direct-RPC validation and zero-byte save';
    const expiryId=await assignment(first,'Synthetic expiry submission'),expiring=await reserve(first,expiryId,0,bytesC);await upload(first,expiring.value,bytesC);
    await sql`update private.dtm_submission_uploads set expires_at=clock_timestamp()-interval '1 second' where id=${expiring.value.uploadId} and user_id=${first.user.id}`;
    await denied(()=>action(first,'commit_dtm_submission_upload',commitPayload(expiryId,expiring.value,0)),409);
    await sweepOwner(first);await absentObject(expiring.value.path);
    for(const value of [null,0,-1,101])await jsonRequest(first,'/rest/v1/rpc/dtm_submission_cleanup_batch',{p_limit:value},{expected:403});
    for(const filename of ['\u00a0','\u3000','\ufeff'])await jsonRequest(first,'/rest/v1/rpc/dtm_submission_action',{p_kind:'begin_dtm_submission_upload',p_payload:{...expiring.payload,request_id:randomUUID(),filename}},{expected:400});
    const zero=await reserve(first,expiryId,0,Buffer.alloc(0));await upload(first,zero.value,Buffer.alloc(0));await action(first,'commit_dtm_submission_upload',commitPayload(expiryId,zero.value,0));
    await download(first,expiryId,zero.value.uploadId,Buffer.alloc(0));counts.checks++;

    phase='two-way account isolation';
    const isolated=await reserve(second,otherId,0,bytesC);await upload(second,isolated.value,bytesC);await action(second,'commit_dtm_submission_upload',commitPayload(otherId,isolated.value,0));
    await download(second,otherId,isolated.value.uploadId,bytesC);await denied(()=>workspace(first,otherId));await denied(()=>createDtmSubmissionDownload(acting(first),otherId,isolated.value.uploadId));counts.checks++;

    if(browserOrigin){
      phase=browserMode==='deployed_http'?'optional deployed browser and actual API acceptance':'optional local browser and actual API acceptance';
      const browserAssignmentId=await assignment(first,'Synthetic browser submission');
      const [browserCourse]=await sql`select a.dtm_course_id as id from public.affairs_assignments a join public.affairs_students s on s.id=a.student_id
        where a.id=${browserAssignmentId} and s.user_id=${first.user.id}`;
      assert.ok(browserCourse&&courseIds.has(browserCourse.id));
      const {runDtmSubmissionsBrowser}=await import('./dtm-submissions-browser.mjs');
      counts.browser=await runDtmSubmissionsBrowser({origin:browserOrigin,projectUrl:url,publishableKey:key,
        sessions:[users.get(first.user.id).session,users.get(second.user.id).session],
        assignment:{id:browserAssignmentId,courseId:browserCourse.id,userId:first.user.id,title:'Synthetic browser submission'},deadline,chromePath:env.CHROME_PATH,
        beforeAction:async(userId,kind,payload)=>{
          assertFixtureUser(userId);assert.equal(userId,first.user.id);assert.equal(payload.assignment_id,browserAssignmentId);
          assert.ok(['begin_dtm_submission_upload','commit_dtm_submission_upload','cancel_dtm_submission_upload','save_dtm_submission_review'].includes(kind));
          studentOperations.set(userId+':'+payload.request_id,{userId,kind,requestId:payload.request_id,assignmentId:payload.assignment_id,uploadId:payload.upload_id??null});
          await persistRecovery();
        },
        rememberReservation:async(userId,reservation)=>{
          assert.equal(userId,first.user.id);assert.equal(reservation.assignmentId,browserAssignmentId);return remember(first,reservation);
        },assertFixturePath});
    }

    phase='user deletion with retained bytes and administrator cleanup';
    // An Auth-provider refusal while objects are owned is a real acceptance
    // failure, not bypassed using SQL DELETE auth.users. Finally still cleans.
    await deleteUser(first.user.id);
    const queued=await sql`select object_path from private.dtm_submission_cleanup where user_id=${first.user.id}`;
    assert.ok(queued.some(row=>row.object_path===initial.value.path));assert.ok(queued.some(row=>row.object_path===fourth.value.path));
    assert.equal((await sql`select id from public.dtm_assignment_submissions where user_id=${first.user.id}`).length,0);
    // Do not call a global admin sweep: only exact fixture paths may be removed.
    for(const row of queued){assertFixturePath(row.object_path);await deleteStorage(adminAccount,row.object_path);await rpc(adminAccount,'dtm_submission_cleanup_ack',{p_path:row.object_path});await absentObject(row.object_path);}
    assert.equal((await sql`select object_path from private.dtm_submission_cleanup where user_id=${first.user.id}`).length,0);
    await download(second,otherId,isolated.value.uploadId,bytesC);counts.checks++;
  }catch(error){failed=true;recordFailure('acceptance',error,lastRace);}
  finally{
    deadline=Date.now()+120000;phase='fixture cleanup';
    const clean=async(label,fn)=>{try{await fn();}catch(error){counts.cleanupFailures++;recordFailure(label,error);}};
    // Recover a createUser response lost after the server committed it.
    await clean('fixture discovery',async()=>{
      if(!plannedEmails.size)return;
      const recovered=await sql`select id,email from auth.users where email in ${sql([...plannedEmails])} and raw_user_meta_data->>'dtm_storage_run'=${runId}`;
      assert.ok(recovered.length<=2);
      for(const row of recovered){assert.notEqual(row.id,ownerId);if(!users.has(row.id))users.set(row.id,{email:row.email,account:null,deleted:false});}
      if(users.size){const uploads=await sql`select object_path,user_id,submission_id from private.dtm_submission_uploads where user_id in ${sql([...users.keys()])}`;
        for(const row of uploads){assertFixtureUser(row.user_id);assert.ok(row.object_path.startsWith(row.user_id+'/'));paths.set(row.object_path,row.user_id);submissions.add(row.submission_id);}}
      await persistRecovery('cleanup_incomplete');
    });
    // Emergency cleanup may use service-role Storage API only on minted paths
    // belonging to this run. It cannot turn a failed RLS/race check into a pass.
    for(const path of paths.keys())await clean('fixture bytes',async()=>{await deleteStorage(adminAccount,path,true);await absentObject(path);});
    for(const id of users.keys())await clean('synthetic account',async()=>{if((await sql`select id from auth.users where id=${id}`).length)await deleteUser(id);});
    if(adminAccount)for(const path of paths.keys())await clean('fixture cleanup acknowledgement',()=>rpc(adminAccount,'dtm_submission_cleanup_ack',{p_path:path}));
    await clean('owner operation receipts',async()=>{if(ownerRequests.size)await sql`delete from private.dtm_submission_operations where user_id=${ownerId} and request_id in ${sql([...ownerRequests])}`;});
    await clean('owner fixture audit',async()=>{if(submissions.size)await sql`delete from public.affairs_agent_audit where user_id=${ownerId} and action_kind='save_dtm_submission_review' and target_id in ${sql([...submissions])}`;});
    await clean('remaining fixture verification',async()=>{
      if(users.size){counts.usersRemaining=(await sql`select count(*)::int as n from auth.users where id in ${sql([...users.keys()])}`)[0].n;
        counts.queueRemaining=(await sql`select count(*)::int as n from private.dtm_submission_cleanup where user_id in ${sql([...users.keys()])}`)[0].n;}
      if(paths.size)counts.objectsRemaining=(await sql`select count(*)::int as n from storage.objects where bucket_id='dtm-submissions' and name in ${sql([...paths.keys()])}`)[0].n;
      if(ownerRequests.size)counts.ownerFixtureRowsRemaining+=(await sql`select count(*)::int as n from private.dtm_submission_operations where user_id=${ownerId} and request_id in ${sql([...ownerRequests])}`)[0].n;
      if(submissions.size)counts.ownerFixtureRowsRemaining+=(await sql`select count(*)::int as n from public.affairs_agent_audit where user_id=${ownerId} and action_kind='save_dtm_submission_review' and target_id in ${sql([...submissions])}`)[0].n;
      assert.equal(counts.usersRemaining+counts.objectsRemaining+counts.queueRemaining+counts.ownerFixtureRowsRemaining,0);
    });
    await clean('owner identity verification',async()=>{if(ownerBefore){assert.deepEqual(await fingerprint(),ownerBefore);counts.ownerUnchanged=true;}});
    await clean('schema baseline verification',async()=>{if(before)assert.deepEqual(await baseline(),before);});
    await clean('owner session logout',async()=>{const result=await ownerClient.auth.signOut({scope:'local'});assert.ok(!result.error);});
    await clean('database connection',()=>sql.end({timeout:5}));
    if(recoveryReady)await clean('recovery manifest',()=>persistRecovery(counts.cleanupFailures===0&&(ownerBefore?counts.ownerUnchanged:true)?'clean':'cleanup_incomplete'));
    counts.passed=!failed&&counts.cleanupFailures===0&&counts.ownerUnchanged&&counts.checks===10&&(!browserOrigin||counts.browser?.passed===true);
    if(!counts.passed)process.exitCode=1;
    await mkdir(output,{recursive:true,mode:0o700});
    await writeFile(output+'/diagnostics.json',JSON.stringify(diagnostics,null,2)+'\n',{mode:0o600});
    await writeFile(output+'/result.json',JSON.stringify(counts,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(counts));
  }
}
await (process.argv.includes('--self-test')?selfTest():main()).catch(error=>{process.exitCode=1;recordFailure('harness stopped',error);});

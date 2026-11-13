import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,stat,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright-core';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';
import {createSyllabusSearchClient} from '../../src/services/syllabusSearchClient.ts';

// Catalog writes allow 8s authentication + 12s RPC; metadata has a 17s shared
// deadline. This route has no explicit Vercel maxDuration override. The 30s
// horizon includes transport grace, but never proves that an aborted SQL call
// stopped: an uncertain write also requires its exact durable receipt.
const mutationSettleMs=30000;
const receiptKind=kind=>kind==='syllabus-metadata'?'save_syllabus_search_metadata':kind;
function terminalMutationResponse(operation,response){
  const body=response.body;
  if(response.status===200)return Boolean(body&&Object.keys(body).length===4&&body.id===operation.id&&body.kind===receiptKind(operation.kind)&&body.version===operation.expectedVersion+1&&typeof body.summary==='string');
  // These handler/RPC denials are pre-mutation or transaction-rollback outcomes.
  // A generic 500/503 or malformed response is not evidence of SQL cancellation.
  return [400,401,403,409].includes(response.status)&&Boolean(body&&typeof body.error==='string'&&body.error);
}
async function reconcileUncertainWrites(operations,{readReceipt,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const uncertain=operations.filter(operation=>['pending','uncertain'].includes(operation.state));
  if(!uncertain.length)return;
  for(const operation of uncertain)assert.ok(Number.isFinite(operation.sentAt)&&Number.isInteger(operation.expectedVersion),'A durable send time and version are required.');
  const remaining=Math.max(0,...uncertain.map(operation=>operation.sentAt+mutationSettleMs-now()));
  assert.ok(remaining<=mutationSettleMs,'Invalid mutation settle horizon.');if(remaining)await wait(remaining);
  for(const operation of uncertain){
    const rows=await readReceipt(operation);assert.equal(rows.length,1,'Uncertain write has no terminal receipt; preserve fixtures for recovery.');
    const row=rows[0];assert.equal(row.user_id,operation.actorId);assert.equal(row.request_id,operation.requestId);
    assert.equal(row.kind,receiptKind(operation.kind));assert.equal(row.target_id,operation.id);
    assert.ok(terminalMutationResponse(operation,{status:200,body:row.result}),'Uncertain write receipt does not match its exact target/version.');
    operation.state='reconciled';
  }
}
async function reconcileFixtureCreates(fixtures,{runId,ownerId,lookup,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const uncertain=fixtures.filter(item=>['pending','uncertain'].includes(item.creationState));
  if(!uncertain.length)return;
  for(const item of uncertain)assert.ok(Number.isFinite(item.creationSentAt),'Pending Auth creation must have a durable send time.');
  const remaining=Math.max(0,...uncertain.map(item=>item.creationSentAt+mutationSettleMs-now()));
  assert.ok(remaining<=mutationSettleMs,'Invalid Auth creation settle horizon.');if(remaining)await wait(remaining);
  for(const item of uncertain){
    const rows=await lookup(item);assert.equal(rows.length,1,'Uncertain Auth creation is unresolved; preserve its email/run ledger for recovery.');
    const row=rows[0];assert.equal(row.email,item.email);assert.equal(row.run,runId);
    assert.ok(typeof row.id==='string'&&row.id!==ownerId&&!fixtures.some(other=>other!==item&&other.id===row.id),'Refuse an unrelated or duplicate identity.');
    if(item.id)assert.equal(row.id,item.id);item.id=row.id;item.creationState='created';
  }
}
async function selfTest(){
  const operation={actorId:'actor',requestId:'request',id:'offering',kind:'syllabus-metadata',expectedVersion:2,sentAt:1000,state:'uncertain'};
  const result={id:'offering',kind:'save_syllabus_search_metadata',version:3,summary:'Saved'};
  const receipt={user_id:'actor',request_id:'request',kind:result.kind,target_id:'offering',result};
  for(const status of [400,401,403,409])assert.equal(terminalMutationResponse(operation,{status,body:{error:'Denied'}}),true);
  for(const status of [500,503])assert.equal(terminalMutationResponse(operation,{status,body:{error:'RPC timed out'}}),false);
  assert.equal(terminalMutationResponse(operation,{status:200,body:{...result,version:4}}),false);
  let waits=0,reads=0;const resolved={...operation};
  await reconcileUncertainWrites([resolved],{now:()=>2000,wait:async ms=>{assert.equal(ms,29000);waits++;},readReceipt:async()=>{reads++;return [receipt];}});
  assert.equal(resolved.state,'reconciled');assert.equal(waits,1);assert.equal(reads,1);
  for(const records of [[],[{...receipt,target_id:'other'}],[{...receipt,user_id:'other'}],[{...receipt,result:{...result,version:4}}]]){
    const pending={...operation};await assert.rejects(reconcileUncertainWrites([pending],{now:()=>40000,wait:async()=>{throw new Error('No extra wait');},readReceipt:async()=>records}));assert.equal(pending.state,'uncertain');
  }
  await reconcileUncertainWrites([{...operation,state:'terminal'}],{readReceipt:async()=>{throw new Error('Confirmed requests do not need reconciliation');}});
  const pending={id:null,email:'synthetic@example.invalid',creationState:'uncertain',creationSentAt:1000};
  const account={id:'fixture-account',email:pending.email,run:'synthetic-run'};const recovered={...pending};
  await reconcileFixtureCreates([recovered],{runId:'synthetic-run',ownerId:'protected-owner',now:()=>2000,wait:async ms=>assert.equal(ms,29000),lookup:async()=>[account]});
  assert.equal(recovered.id,account.id);assert.equal(recovered.creationState,'created');
  for(const rows of [[],[{...account,run:'unrelated'}],[{...account,email:'other@example.invalid'}],[{...account,id:'protected-owner'}]]){
    const unresolved={...pending};await assert.rejects(reconcileFixtureCreates([unresolved],{runId:'synthetic-run',ownerId:'protected-owner',now:()=>40000,lookup:async()=>rows}));assert.equal(unresolved.creationState,'uncertain');assert.equal(unresolved.id,null);
  }
  console.log('Syllabus cleanup self-test passed: terminal denials, uncertain 503/Auth creation, bounded waits, exact receipts/markers and fail-closed recovery.');
}
if(process.argv.includes('--self-test')){assert.equal(process.argv.length,3);await selfTest();process.exit(0);}

// PREPARED ONLY: root must authorize the serialized client DB lease before execution.
// NATIVE_ORIGIN is required. Production also requires EXPECTED_RELEASE_REVISION.
// Local mode invokes actual working-tree handlers with real caller JWTs and real
// Supabase HTTP. Production uses deployed HTTP only, never local handler fallback.
// Synthetic catalog rows are globally published local fixtures, NOT student records.
// No model, source-school request, upload, migration application or account repair.
process.umask(0o077);
assert.equal(process.argv.length,2,'No flags or model mode are supported.');
const origin=process.env.NATIVE_ORIGIN;
const local=['http://127.0.0.1:5184','http://localhost:5184'].includes(origin);
assert.ok(local||origin==='https://stu.best','Choose only the exact local server or production origin.');
const deployment=JSON.parse(await readFile('deployment.json','utf8'));
assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.vercel.productionUrl,'https://stu.best');
assert.equal(deployment.supabase.projectRef,'xiftudmvxphxcjtmfmib');
let releaseRevision=null;
if(!local){
  const expected=process.env.EXPECTED_RELEASE_REVISION;assert.match(expected||'',/^[0-9a-f]{40}$/,'Production requires the reviewed exact release SHA.');
  const response=await fetch(origin+'/release.json',{redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);const release=await response.json();
  assert.equal(release.revision,expected);assert.equal(release.environment,'production');assert.equal(release.source,'vercel-git');releaseRevision=expected;
}
// Release/target guards above precede credential loading, Auth clients and all mutations.
const env=deploymentEnvironment();Object.assign(process.env,env);
const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
assert.equal(url,'https://xiftudmvxphxcjtmfmib.supabase.co');
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
let target;try{target=new URL(connection);}catch{throw new Error('Client database connection unavailable.');}
assert.ok(['postgres:','postgresql:'].includes(target.protocol));
assert.ok(target.hostname==='db.xiftudmvxphxcjtmfmib.supabase.co'||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.xiftudmvxphxcjtmfmib'),'Exact client DB required.');
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;assert.ok(key&&serviceKey);
const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
const runDeadline=Date.now()+12*60*1000,overall=AbortSignal.timeout(12*60*1000);let cleaning=false;
function signal(ms){return cleaning?AbortSignal.timeout(ms):AbortSignal.any([overall,AbortSignal.timeout(ms)]);}
function projectFetch(input,init={}){
  const destination=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  assert.equal(destination.origin,url,'Auth/fixture HTTP stays in the exact client project.');
  return fetch(input,{...init,redirect:'error',signal:init.signal?AbortSignal.any([init.signal,signal(20000)]):signal(20000)});
}
const admin=createClient(url,serviceKey,{auth,global:{fetch:projectFetch}});
const sql=postgres(connection,{max:1,connect_timeout:15,connection:{statement_timeout:20000},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const handlers=local?{'/api/affairs-data':(await import('../../api/affairs-data.ts')).default,'/api/affairs-manage':(await import('../../api/affairs-manage.ts')).default}:{};
const runId=randomUUID(),marker='SYLLQA'+runId.slice(0,8),term='Q'+runId.replaceAll('-','').slice(0,10),department='D'+runId.replaceAll('-','').slice(0,10);
const ids=Array.from({length:103},()=>randomUUID()),operations=[],fixtures=[1,2,3].map(number=>({number,id:null,email:`syllabus-live-${randomUUID()}@example.invalid`,google:number<3}));
const output=`artifacts/syllabus-search/${local?'local':'production'}-${runId}`,ledgerPath=output+'/fixture-ledger.json';
const routePath='/school-affairs/services/12-3';
let ownerId,ownerBefore,ownerClient,ownerSession,browser,schemaReady=false,phase='preflight',passed=false,failure=null;
let checks=0,httpCalls=0,browserApiCalls=0,blockedModelCalls=0,blockedOfficialCalls=0,screenshots=0,screenshotBytes=0;
const activeMutations=new Set(),activeBrowserRequests=new Set(),accounts=()=>fixtures.flatMap(item=>item.id?[item.id]:[]);
const fixtureRecord=(index)=>({...newCourseOffering(),term_code:term,term_label:marker+' term',department_code:department,department_name:marker+' unit',
  classification_code:'QA',classification_name:'Synthetic class',admission_code:'QA',admission_name:'Synthetic program',
  course_code:marker+'-'+String(index).padStart(3,'0'),course_name:marker+(index===0?' SQL_% Alpha':' Course '+String(index).padStart(3,'0')),
  instructor:'Synthetic instructor',published:index!==102,syllabus:{...newCourseSyllabus(),objectives:'Synthetic local syllabus acceptance fixture.',meanings:index===0||index===102?[11]:index===1?[1]:[]}});
async function ledger(state='active',cleanupFailures=[]){
  await writeFile(ledgerPath+'.next',JSON.stringify({runId,origin,releaseRevision,state,fixtureAccounts:fixtures,offeringIds:ids,termCode:term,departmentCode:department,marker,ownerId:ownerId??null,ownerFingerprint:ownerBefore??null,operations,cleanupFailures},null,2),{mode:0o600});
  await rename(ledgerPath+'.next',ledgerPath);
}
const fingerprint=async id=>(await sql`select u.id,md5((to_jsonb(u)-array['last_sign_in_at','updated_at'])::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(i)-array['last_sign_in_at','updated_at'] order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
  from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
async function authenticateOwner(){
  const file=await stat('.env.owner.local');assert.ok(file.isFile()&&(file.mode&0o077)===0,'Existing owner credential file must be private.');
  const credentials=parseEnv(await readFile('.env.owner.local','utf8'));
  assert.ok(credentials.CRM_ADMIN_EMAIL?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()&&credentials.CRM_ADMIN_PASSWORD);
  ownerClient=createClient(url,key,{auth,global:{fetch:projectFetch}});
  const signed=await ownerClient.auth.signInWithPassword({email:credentials.CRM_ADMIN_EMAIL,password:credentials.CRM_ADMIN_PASSWORD});ownerSession=signed.data.session;
  assert.ok(!signed.error&&ownerSession,'Existing administrator sign-in failed.');
  const verified=await ownerClient.auth.getUser(ownerSession.access_token),user=verified.data.user;
  assert.ok(!verified.error&&user?.id===ownerId&&user.email?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()&&user.email_confirmed_at&&user.identities?.some(item=>item.provider==='google'),'Actual existing Google/admin caller required.');
}
function queryObject(params){const result={};for(const key of new Set(params.keys())){const values=params.getAll(key);result[key]=values.length===1?values[0]:values;}return result;}
async function invoke(endpoint,{token,method='GET',body}={}){
  if(!cleaning)overall.throwIfAborted();const destination=new URL(endpoint,origin);
  assert.equal(destination.origin,origin);assert.ok(['/api/affairs-data','/api/affairs-manage'].includes(destination.pathname));
  if(token&&token===ownerSession?.access_token){
    assert.equal(destination.pathname,'/api/affairs-manage');assert.equal(method,'POST');assert.ok(['save_course_offering','syllabus-metadata'].includes(body?.kind));
    assert.ok(ids.includes(body?.payload?.id)&&operations.some(op=>op.requestId===body.payload.request_id&&op.actorId===ownerId&&op.id===body.payload.id&&op.kind===body.kind),'Owner JWT restricted to pre-ledgered exact synthetic writes.');
  }
  httpCalls++;
  if(!local){
    const response=await fetch(destination,{method,redirect:'error',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal(25000)});
    return {status:response.status,body:await response.json(),cacheControl:response.headers.get('cache-control')};
  }
  const result={status:200,body:null,cacheControl:null};const response={status(code){result.status=code;return response;},json(value){result.body=value;},setHeader(name,value){if(name.toLowerCase()==='cache-control')result.cacheControl=value;}};
  await handlers[destination.pathname]({method,headers:token?{authorization:'Bearer '+token}:{},query:queryObject(destination.searchParams),body},response);return result;
}
async function request(endpoint,options={}){const result=await invoke(endpoint,options);assert.equal(result.status,options.status??200,`${phase}: API status ${result.status}`);assert.match(result.cacheControl||'',/no-store/);return result.body;}
async function verifyFixture(item){
  assert.ok(item.id&&item.id!==ownerId&&fixtures.includes(item));
  const [row]=await sql`select id,email,raw_user_meta_data->>'syllabus_qa_run' as run from auth.users where id=${item.id}`;
  assert.ok(row?.id===item.id&&row.email===item.email&&row.run===runId,'Refuse a non-fixture identity.');
}
async function fixture(item){
  assert.ok(runDeadline-Date.now()>mutationSettleMs,'Do not start Auth creation near the run deadline.');
  item.creationState='pending';item.creationSentAt=Date.now();await ledger();const password=randomBytes(32).toString('base64url')+'Aa1!';
  try{
    const created=await admin.auth.admin.createUser({email:item.email,password,email_confirm:true,user_metadata:{full_name:'Synthetic Syllabus QA '+item.number,syllabus_qa_run:runId}});
    if(created.data.user){item.id=created.data.user.id;await ledger();}assert.ok(!created.error&&item.id);await verifyFixture(item);item.creationState='created';
  }finally{if(item.creationState==='pending')item.creationState='uncertain';await ledger();}
  if(item.google)await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at) values(${item.id},${item.id},${sql.json({sub:item.id,email:item.email,email_verified:true})},'google',now(),now(),now())`;
  const client=createClient(url,key,{auth,global:{fetch:projectFetch}}),signed=await client.auth.signInWithPassword({email:item.email,password});
  assert.ok(!signed.error&&signed.data.session?.user.id===item.id);const verified=await client.auth.getUser(signed.data.session.access_token);
  assert.ok(!verified.error&&verified.data.user?.id===item.id);return signed.data.session;
}
async function verifyOffering(id){
  assert.ok(ids.includes(id));const rows=await sql`select id,term_code,department_code,course_code,source_mode from public.affairs_course_offerings where id=${id}`;
  for(const row of rows)assert.ok(row.term_code===term&&row.department_code===department&&row.course_code===fixtureRecord(ids.indexOf(id)).course_code&&row.source_mode==='sample','Refuse a non-fixture offering.');
}
async function save(kind,payload,{session=ownerSession,status=200}={}){
  assert.ok(['save_course_offering','syllabus-metadata'].includes(kind)&&ids.includes(payload.id));assert.ok(session?.user.id===ownerId||accounts().includes(session?.user.id));
  await verifyOffering(payload.id);
  if(kind==='save_course_offering')assert.ok(payload.record?.term_code===term&&payload.record.department_code===department&&payload.record.course_code===fixtureRecord(ids.indexOf(payload.id)).course_code);
  assert.ok(runDeadline-Date.now()>mutationSettleMs,'Do not start a mutation near the run deadline.');
  let operation=operations.find(op=>op.actorId===session.user.id&&op.requestId===payload.request_id);
  if(!operation){operation={kind,id:payload.id,requestId:payload.request_id,actorId:session.user.id};operations.push(operation);}
  Object.assign(operation,{expectedVersion:payload.expected_version,sentAt:Date.now(),state:'pending'});await ledger();
  const task=(async()=>{
    const result=await invoke('/api/affairs-manage',{method:'POST',token:session.access_token,body:{kind,payload}});
    operation.state=terminalMutationResponse(operation,result)?'terminal':'uncertain';
    assert.equal(result.status,status,`${phase}: API status ${result.status}`);assert.match(result.cacheControl||'',/no-store/);return result.body;
  })();activeMutations.add(task);
  try{return await task;}finally{activeMutations.delete(task);if(operation.state==='pending')operation.state='uncertain';await ledger();}
}
function clientFor(session){return createSyllabusSearchClient(async()=>({userId:session.user.id,token:session.access_token}),async(input,init)=>{
  const result=await invoke(String(input),{method:init?.method,token:new Headers(init?.headers).get('authorization')?.slice(7),body:init?.body?JSON.parse(String(init.body)):undefined});
  return Response.json(result.body,{status:result.status,headers:{'Cache-Control':result.cacheControl||'no-store'}});
});}
const filters=(patch={})=>({keyword:'',scope:'historical',term,department,themes:[],...patch});
const searchUrl=(patch={})=>'/api/affairs-data?'+new URLSearchParams({scope:'syllabus-search',search_scope:'historical',term,department,...patch});
async function pageFor(session){
  const context=await browser.newContext({viewport:{width:1533,height:1000},locale:'zh-TW',reducedMotion:'reduce'});
  await context.addInitScript(({origin,session})=>{if(window.top===window&&location.origin===origin&&!sessionStorage.getItem('syllabus-live-qa')){localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));sessionStorage.setItem('syllabus-live-qa','1');}},{origin,session});
  await context.route('**/*',async route=>{
    const req=route.request(),destination=new URL(req.url());
    if(destination.hostname==='stu.edu.tw'||destination.hostname.endsWith('.stu.edu.tw')){blockedOfficialCalls++;return route.abort();}
    if(/\/api\/(?:affairs-assistant|research-assistant)/.test(destination.pathname)||destination.hostname==='api.openai.com'){blockedModelCalls++;return route.abort();}
    if(destination.origin===origin&&destination.pathname.startsWith('/api/')){
      browserApiCalls++;
      if(local&&handlers[destination.pathname]){
        const task=invoke(destination.pathname+destination.search,{method:req.method(),token:req.headers().authorization?.slice(7),body:req.postData()?JSON.parse(req.postData()):undefined});
        activeBrowserRequests.add(task);
        try{const result=await task;return await route.fulfill({status:result.status,headers:{'Cache-Control':result.cacheControl||'no-store'},json:result.body});}
        catch(error){if(!cleaning)throw error;}
        finally{activeBrowserRequests.delete(task);}
        return;
      }
    }
    return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',()=>errors.push('page-error'));return {page,context,errors};
}
async function ready(page,count,scope='historical'){
  await page.locator('.syllabus-search-results[aria-busy="false"]').waitFor();
  if(count!==undefined){await page.getByText(`${scope==='current'?'當期':'歷史'}課綱查詢結果計${count}筆`,{exact:true}).waitFor();assert.equal(await page.locator('.syllabus-search-results tbody tr').count(),count);}
  assert.equal(await page.locator('.syllabus-search [role="alert"]').count(),0);
}
async function capture(page,name){const file=output+'/'+name+'.jpg';await page.screenshot({path:file,type:'jpeg',quality:28});screenshotBytes+=(await stat(file)).size;screenshots++;assert.ok(screenshotBytes<200000,'Synthetic screenshots must stay below200KB total.');}

try{
  await mkdir(output,{recursive:true,mode:0o700});await ledger();assert.equal((await stat(ledgerPath)).mode&0o077,0);
  const [baseline]=await sql`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,(select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls`;
  assert.deepEqual(baseline,{migrations:127,rls:144},'Run only after reviewed170000 is applied at the expected baseline.');
  assert.equal((await sql`select count(*)::int as n from supabase_migrations.schema_migrations where version='20261112170000'`)[0].n,1);
  assert.equal((await sql`select relrowsecurity from pg_class where oid='public.affairs_course_offerings'::regclass`)[0].relrowsecurity,true);schemaReady=true;
  const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin' where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
  assert.ok(owner,'Existing protected owner must already be a verified Google administrator.');ownerId=owner.id;ownerBefore=await fingerprint(ownerId);await ledger();await authenticateOwner();
  phase='synthetic callers';const first=await fixture(fixtures[0]),second=await fixture(fixtures[1]),nonGoogle=await fixture(fixtures[2]);
  for(const session of [first,second])assert.equal((await sql`select user_id from public.affairs_profiles where user_id=${session.user.id}`).length,0);
  await request('/api/affairs-data?scope=syllabus-options',{status:401});await request('/api/affairs-data?scope=syllabus-options',{token:nonGoogle.access_token,status:401});
  await request('/api/affairs-data?scope=syllabus-options',{token:first.access_token});
  assert.equal((await sql`select user_id from public.affairs_profiles where user_id=${first.user.id}`).length,0,'Published read must not initialize an account.');checks++;

  phase='actual administrator offering creation';
  const original={id:ids[0],request_id:randomUUID(),expected_version:0,record:fixtureRecord(0)};
  await save('save_course_offering',original,{session:first,status:403});const created=await save('save_course_offering',original);assert.equal(created.version,1);assert.deepEqual(await save('save_course_offering',original),created);
  for(let i=1;i<ids.length;i++)assert.equal((await save('save_course_offering',{id:ids[i],request_id:randomUUID(),expected_version:0,record:fixtureRecord(i)})).version,1);
  const firstClient=clientFor(first),secondClient=clientFor(second);
  assert.equal((await firstClient.search(first.user.id,filters({scope:'current'}))).total,0);
  const metadata={id:ids[0],request_id:randomUUID(),expected_version:1,syllabus_is_current:true,academic_year_text:'0',semester_text:null};
  await save('syllabus-metadata',metadata,{session:first,status:403});const saved=await save('syllabus-metadata',metadata);assert.equal(saved.version,2);assert.deepEqual(await save('syllabus-metadata',metadata),saved);
  await save('syllabus-metadata',{...metadata,id:ids[1],request_id:randomUUID(),syllabus_is_current:false,academic_year_text:null,semester_text:'QA'});
  await save('syllabus-metadata',{...metadata,id:ids[102],request_id:randomUUID()});
  await request('/api/affairs-manage',{method:'POST',body:{kind:'syllabus-metadata',payload:metadata},status:401});checks++;

  phase='complete results and public permissions';
  const all=await firstClient.search(first.user.id,filters());assert.equal(all.total,102);assert.equal(all.rows.length,102);assert.equal(new Set(all.rows.map(row=>row.id)).size,102);
  assert.deepEqual(all.rows.map(row=>row.sequence),Array.from({length:102},(_,i)=>i+1));assert.ok(!all.rows.some(row=>row.id===ids[102]));
  const other=await secondClient.search(second.user.id,filters());assert.deepEqual(other,all,'Published catalog is shared, not account-owned enrollment.');
  assert.equal((await firstClient.search(first.user.id,filters({scope:'current'}))).total,1);
  assert.equal((await firstClient.search(first.user.id,filters({themes:['1','11']}))).total,2);
  assert.equal((await firstClient.search(first.user.id,filters({scope:'current',themes:['1']}))).total,0);
  assert.equal((await firstClient.search(first.user.id,filters({scope:'current',themes:['1','11']}))).total,1);
  assert.equal((await firstClient.search(first.user.id,filters({keyword:'SQL_%'}))).total,1);
  const options=await firstClient.loadOptions(first.user.id);assert.deepEqual(options.terms.find(row=>row.value===term),{value:term,label:marker+' term'});assert.deepEqual(options.departments.find(row=>row.value===department),{value:department,label:marker+' unit'});
  assert.equal((await firstClient.loadDetail(first.user.id,ids[0])).row.course_code,fixtureRecord(0).course_code);assert.deepEqual(await firstClient.loadDetail(first.user.id,ids[102]),{row:null});
  await assert.rejects(firstClient.search(second.user.id,filters()),{status:401});
  for(const suffix of ['&user_id='+second.user.id,'&page_size=101','&themes=27','&term=other'])await request(searchUrl()+suffix,{token:first.access_token,status:400});
  const direct=await projectFetch(url+'/rest/v1/affairs_course_offerings?id=eq.'+ids[102]+'&select=id',{headers:{apikey:key,Authorization:'Bearer '+first.access_token}});assert.equal(direct.status,200);assert.deepEqual(await direct.json(),[]);
  const forbidden=await projectFetch(url+'/rest/v1/affairs_course_offerings?id=eq.'+ids[0],{method:'PATCH',headers:{apikey:key,Authorization:'Bearer '+first.access_token,'Content-Type':'application/json'},body:JSON.stringify({syllabus_is_current:false})});assert.equal(forbidden.status,403);await forbidden.body?.cancel();checks++;

  phase='metadata replay stale and old editor compatibility';
  const update={...metadata,request_id:randomUUID(),expected_version:2,academic_year_text:null,semester_text:'0'};assert.equal((await save('syllabus-metadata',update)).version,3);
  await save('syllabus-metadata',{...update,request_id:randomUUID()},{status:409});await save('syllabus-metadata',{...update,semester_text:'changed reuse'},{status:409});assert.deepEqual(await save('syllabus-metadata',metadata),saved);
  assert.equal((await save('save_course_offering',{...original,request_id:randomUUID(),expected_version:3,record:{...fixtureRecord(0),description:'Synthetic old-editor compatibility change.'}})).version,4);
  const refreshed=await firstClient.search(first.user.id,filters());assert.notEqual(refreshed.revision,all.revision);assert.equal(refreshed.total,102);assert.equal(refreshed.rows[0].academicYearText,null);assert.equal(refreshed.rows[0].semesterText,'0');checks++;

  phase='native browser navigation';for(const session of [first,second])assert.equal((await request('/api/affairs-data',{token:session.access_token})).profile.userId,session.user.id);
  browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const one=await pageFor(first),two=await pageFor(second),page=one.page;
  await page.goto(origin+'/school-affairs/menu/aca/query');await page.locator('[data-program-id="12-3"]').click();await page.waitForURL(origin+routePath);await ready(page);
  assert.ok(await page.getByRole('radio',{name:'當期課程',exact:true}).isChecked());
  await page.getByLabel('學年學期',{exact:true}).selectOption(term);await page.getByLabel('系所',{exact:true}).selectOption(department);
  await page.getByRole('button',{name:'查詢',exact:true}).click();await page.waitForURL(value=>value.searchParams.get('term')===term&&value.searchParams.get('searched')==='1');await ready(page,1,'current');
  for(const value of ['1','11'])await page.locator(`.syllabus-search-themes input[value="${value}"]`).check();
  await page.getByRole('button',{name:'查詢',exact:true}).click();await page.waitForURL(value=>value.searchParams.get('themes')==='1,11');await ready(page,1,'current');
  for(const value of ['1','11']){const checkbox=page.locator(`.syllabus-search-themes input[value="${value}"]`);assert.ok(await checkbox.isChecked());await checkbox.uncheck();}
  await page.getByRole('radio',{name:'歷年課程',exact:true}).check();
  await page.getByRole('button',{name:'查詢',exact:true}).click();await page.waitForURL(value=>value.searchParams.get('search_scope')==='historical'&&!value.searchParams.has('themes'));await ready(page,102);const submitted=new URL(page.url()).search;
  assert.equal(new URLSearchParams(submitted).get('term'),term);assert.equal(new URLSearchParams(submitted).get('search_scope'),'historical');
  assert.equal(await page.locator('.syllabus-search-results thead th').count(),8);
  await page.getByRole('button',{name:'課號',exact:true}).click();await page.getByRole('button',{name:'課號',exact:true}).click();
  assert.equal((await page.locator('.syllabus-search-results tbody tr').first().locator('td').first().innerText()).trim(),'102');
  await page.getByRole('button',{name:'課號',exact:true}).click();await capture(page,'desktop');
  await page.getByRole('button',{name:fixtureRecord(0).course_name+'：'+fixtureRecord(0).course_code+'，開啟課程大綱',exact:true}).click();
  await page.locator('.course-syllabus').waitFor();assert.equal(new URL(page.url()).searchParams.get('syllabus'),ids[0]);assert.ok((await page.locator('.course-syllabus').innerText()).includes('Synthetic local syllabus acceptance fixture.'));
  await page.getByRole('link',{name:'回上頁',exact:true}).click();await ready(page,102);assert.equal(new URL(page.url()).search,submitted);
  await page.reload();await ready(page,102);assert.equal(await page.getByLabel('學年學期',{exact:true}).inputValue(),term);
  for(const width of [390,320]){
    await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile page must remain contained.');
    const region=page.getByRole('region',{name:'課綱查詢結果',exact:true});await region.focus();assert.equal(await region.evaluate(node=>node===document.activeElement),true);
    if(width===390)await capture(page,'mobile390');
  }
  await two.page.goto(origin+routePath+submitted);await ready(two.page,102);
  await two.page.goto(origin+routePath+submitted+'&syllabus='+ids[102]);await two.page.getByText('此課程大綱目前無法提供。',{exact:true}).waitFor();assert.equal(await two.page.locator('.course-syllabus').count(),0);
  assert.deepEqual(one.errors,[]);assert.deepEqual(two.errors,[]);await one.context.close();await two.context.close();
  assert.equal(blockedModelCalls,0);assert.equal(blockedOfficialCalls,0);assert.deepEqual(await fingerprint(ownerId),ownerBefore);checks++;passed=true;
}catch(error){process.exitCode=1;failure={phase,type:error instanceof assert.AssertionError?'AssertionError':error?.name||'Error'};console.error(JSON.stringify({status:'failed',phase,type:failure.type}));}
finally{
  cleaning=true;const cleanupFailures=[];let mutationsSettled=true,fixtureCreatesSettled=true;const clean=async(label,work)=>{try{await work();}catch{cleanupFailures.push(label);}};
  await clean('browser-close',()=>browser?.close());
  await Promise.allSettled([...activeMutations,...activeBrowserRequests]);
  await clean('uncertain-mutation-reconciliation',async()=>{
    try{await reconcileUncertainWrites(operations,{readReceipt:operation=>sql`select user_id,request_id,kind,payload->>'id' as target_id,result from private.affairs_catalog_operations where user_id=${operation.actorId} and request_id=${operation.requestId}`});}
    catch(error){mutationsSettled=false;throw error;}
  });
  await clean('uncertain-auth-creation-reconciliation',async()=>{
    try{await reconcileFixtureCreates(fixtures,{runId,ownerId,lookup:item=>sql`select id,email,raw_user_meta_data->>'syllabus_qa_run' as run from auth.users where email=${item.email}`});await ledger();}
    catch(error){fixtureCreatesSettled=false;throw error;}
  });
  if(schemaReady&&mutationsSettled&&fixtureCreatesSettled)await clean('exact-offerings-receipts-audits',async()=>{
    for(const id of ids)await verifyOffering(id);
    await sql`delete from public.affairs_course_offerings where id=any(${ids}::uuid[]) and term_code=${term} and department_code=${department}`;
    if(operations.length){
      const actors=[ownerId,...accounts()].filter(Boolean),requests=operations.map(op=>op.requestId);
      await sql`delete from private.affairs_catalog_operations where user_id=any(${actors}::uuid[]) and request_id=any(${requests}::uuid[]) and payload->>'id'=any(${ids}::text[]) and kind in ('save_course_offering','save_syllabus_search_metadata')`;
      await sql`delete from public.affairs_agent_audit where user_id=any(${actors}::uuid[]) and target_id=any(${ids}::uuid[]) and action_kind in ('save_course_offering','save_syllabus_search_metadata')`;
    }
  });
  for(const item of fixtures)if(item.id&&mutationsSettled&&fixtureCreatesSettled)await clean('fixture-account-'+item.number,async()=>{
    await verifyFixture(item);for(let attempt=0;attempt<3;attempt++){const deleted=await admin.auth.admin.deleteUser(item.id);if(!deleted.error||(await sql`select id from auth.users where id=${item.id}`).length===0)return;}throw new Error('Fixture deletion failed.');
  });
  if(ownerSession)await clean('owner-local-signout',async()=>{assert.ok(!(await ownerClient.auth.signOut({scope:'local'})).error);});
  await clean('exact-cleanup-verification',async()=>{
    assert.ok(mutationsSettled&&fixtureCreatesSettled,'Unresolved mutation or Auth creation: fixture records remain reserved for recovery.');
    for(const item of fixtures)assert.equal((await sql`select id from auth.users where email=${item.email}`).length,0);
    if(accounts().length)for(const [table,column] of [['auth.users','id'],['auth.identities','user_id'],['public.affairs_profiles','user_id']])assert.equal((await sql`select ${sql(column)} from ${sql(table)} where ${sql(column)}=any(${accounts()}::uuid[])`).length,0);
    if(schemaReady){assert.equal((await sql`select id from public.affairs_course_offerings where id=any(${ids}::uuid[])`).length,0);assert.equal((await sql`select id from public.affairs_agent_audit where target_id=any(${ids}::uuid[])`).length,0);
      if(operations.length)assert.equal((await sql`select request_id from private.affairs_catalog_operations where request_id=any(${operations.map(op=>op.requestId)}::uuid[])`).length,0);}
  });
  if(ownerBefore)await clean('owner-preservation',async()=>{assert.deepEqual(await fingerprint(ownerId),ownerBefore);});
  await clean('database-close',()=>sql.end({timeout:5}));if(cleanupFailures.length)process.exitCode=1;
  await ledger(cleanupFailures.length?'cleanup-required':'cleaned',cleanupFailures);
  const result={passed:passed&&!cleanupFailures.length,mode:local?'actual_jwt_local_handlers':'deployed_http',releaseRevision,checks,httpCalls,browserApiCalls,plannedOfferings:ids.length,plannedUsers:fixtures.length,screenshots,screenshotBytes,blockedModelCalls,blockedOfficialCalls,mutationCleanupReady:mutationsSettled,fixtureCreationCleanupReady:fixtureCreatesSettled,cleanupVerified:cleanupFailures.length===0,cleanupFailureCount:cleanupFailures.length,failure};
  await writeFile(output+'/result.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
}

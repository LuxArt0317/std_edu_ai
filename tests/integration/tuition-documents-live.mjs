import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,stat,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';

// PREPARED acceptance suite: execute only with root's serialized client DB lease.
// Local mode invokes real handlers with real caller JWTs; production uses deployed
// HTTP exclusively. No model, official-school request, PDF, payment or upload.
// --self-test runs before dependency/env/credential loading and cannot connect.
const project='xiftudmvxphxcjtmfmib',settleMs=30000;
const kinds=['save_tuition_settlement','delete_tuition_settlement','save_tuition_document_metadata','delete_tuition_document_metadata'];
const routes={settlement:'/school-affairs/services/49-1',summer:'/school-affairs/services/48-1',extended:'/school-affairs/services/48-2',evening:'/school-affairs/services/48-3'};
const browserReadAllowed=(method,destination)=>method==='GET'&&(destination.pathname==='/api/affairs-data'||destination.pathname==='/api/affairs-conversations'&&destination.search==='');
function localHandlerDestination(destination,method){
  if(destination.pathname!=='/api/affairs-conversations')return destination;
  assert.ok(browserReadAllowed(method,destination),'Only the fresh fixture conversation index may be read.');
  // Mirror vercel.json only for local handler dispatch. Production must request
  // the original /api/affairs-conversations path and exercise the real rewrite.
  return new URL('/api/affairs-data?resource=conversations',destination.origin);
}
function originMode(origin,revision){
  if(['http://127.0.0.1:5184','http://localhost:5184'].includes(origin))return 'actual_jwt_local_handlers';
  assert.equal(origin,'https://stu.best','Explicit exact local5184 or production origin required.');
  assert.match(revision||'',/^[0-9a-f]{40}$/,'Production requires the exact reviewed release revision.');
  return 'deployed_http';
}
function validReceipt(op,value){
  return Boolean(value&&Object.keys(value).length===4&&value.id===op.payload.id&&value.kind===op.kind&&value.version===op.payload.expected_version+1&&typeof value.summary==='string');
}
function terminalResponse(op,response){
  if(response.status===200)return validReceipt(op,response.body);
  // The four explicit validation/auth/conflict outcomes do not commit a mutation.
  // 500/503, transport failure, malformed JSON and timeout remain uncertain.
  return [400,401,403,409].includes(response.status)&&Boolean(response.body&&typeof response.body.error==='string'&&response.body.error);
}
async function settle(items,{now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  for(const item of items)assert.ok(Number.isFinite(item.sentAt),'The ledger must contain the send time.');
  const remaining=Math.max(0,...items.map(item=>item.sentAt+settleMs-now()));
  assert.ok(remaining<=settleMs,'Invalid settlement horizon.');if(remaining)await wait(remaining);
}
async function reconcileWrites(operations,{readReceipt,...clock}){
  const pending=operations.filter(op=>['pending','uncertain'].includes(op.state));await settle(pending,clock);
  for(const op of pending){
    const rows=await readReceipt(op);assert.equal(rows.length,1,'Unresolved write: retain the exact fixtures and recovery ledger.');
    const row=rows[0];assert.equal(row.user_id,op.actorId);assert.equal(row.request_id,op.payload.request_id);assert.equal(row.kind,op.kind);
    assert.deepEqual(row.payload,op.payload);assert.ok(validReceipt(op,row.result),'Receipt target/version mismatch.');op.state='reconciled';
  }
}
async function reconcileCreates(fixtures,{runId,ownerId,lookup,...clock}){
  const pending=fixtures.filter(item=>['pending','uncertain'].includes(item.creationState));
  await settle(pending.map(item=>({sentAt:item.creationSentAt})),clock);
  for(const item of pending){
    const rows=await lookup(item);assert.equal(rows.length,1,'Unresolved Auth create: retain the email/run ledger.');
    const row=rows[0];assert.equal(row.email,item.email);assert.equal(row.run,runId);
    assert.ok(typeof row.id==='string'&&row.id!==ownerId&&!fixtures.some(other=>other!==item&&other.id===row.id),'Unrelated or duplicate identity.');
    if(item.id)assert.equal(row.id,item.id);item.id=row.id;item.creationState='created';
  }
}
async function selfTest(){
  assert.equal(originMode('http://127.0.0.1:5184'),'actual_jwt_local_handlers');assert.equal(originMode('https://stu.best','a'.repeat(40)),'deployed_http');
  for(const value of [undefined,'https://stu.best/','http://stu.best','https://stu.best:443','https://evil.stu.best','https://stu.best@evil.invalid','http://localhost:5185'])assert.throws(()=>originMode(value,'a'.repeat(40)));
  assert.throws(()=>originMode('https://stu.best'));assert.throws(()=>originMode('https://stu.best','short'));
  const conversation=new URL('https://stu.best/api/affairs-conversations');
  assert.ok(browserReadAllowed('GET',conversation));
  assert.equal(localHandlerDestination(conversation,'GET').href,'https://stu.best/api/affairs-data?resource=conversations');
  const rewrite=JSON.parse(await readFile('vercel.json','utf8')).rewrites.find(rule=>rule.source==='/api/affairs-conversations');
  assert.equal(rewrite?.destination,'/api/affairs-data?resource=conversations','The local bridge must match the deployed rewrite.');
  assert.equal(conversation.href,'https://stu.best/api/affairs-conversations','Normalization must not mutate the deployed request URL.');
  const data=new URL('https://stu.best/api/affairs-data?scope=tuition-documents');
  assert.equal(localHandlerDestination(data,'GET'),data);
  for(const method of ['POST','DELETE','PATCH']){assert.equal(browserReadAllowed(method,conversation),false);assert.throws(()=>localHandlerDestination(conversation,method));}
  for(const path of ['/api/affairs-conversations?id=unrelated','/api/affairs-conversations?user_id=unrelated','/api/affairs-conversations/','/api/affairs-manage','/api/affairs-assistant'])assert.equal(browserReadAllowed('GET',new URL(path,conversation)),false);
  const op={actorId:'admin',kind:kinds[0],payload:{id:'record',user_id:'fixture',request_id:'request',expected_version:2},state:'uncertain',sentAt:1000};
  const result={id:'record',kind:kinds[0],version:3,summary:'Saved'};
  const receipt={user_id:'admin',request_id:'request',kind:kinds[0],payload:op.payload,result};
  for(const status of [400,401,403,409])assert.ok(terminalResponse(op,{status,body:{error:'Denied'}}));
  for(const status of [500,503])assert.equal(terminalResponse(op,{status,body:{error:'Timeout'}}),false);
  assert.equal(terminalResponse(op,{status:200,body:{...result,version:4}}),false);
  const recovered={...op};let waits=0;
  await reconcileWrites([recovered],{now:()=>2000,wait:async ms=>{assert.equal(ms,29000);waits++;},readReceipt:async()=>[receipt]});
  assert.equal(recovered.state,'reconciled');assert.equal(waits,1);
  for(const rows of [[],[{...receipt,user_id:'other'}],[{...receipt,result:{...result,id:'other'}}],[{...receipt,payload:{...op.payload,user_id:'other'}}]]){
    const unresolved={...op};await assert.rejects(reconcileWrites([unresolved],{now:()=>40000,readReceipt:async()=>rows}));assert.equal(unresolved.state,'uncertain');
  }
  const item={id:null,email:'synthetic@example.invalid',creationState:'uncertain',creationSentAt:1000},account={id:'fixture',email:item.email,run:'run'};
  const created={...item};await reconcileCreates([created],{runId:'run',ownerId:'owner',now:()=>40000,lookup:async()=>[account]});assert.equal(created.id,'fixture');
  for(const rows of [[],[{...account,run:'other'}],[{...account,email:'other@example.invalid'}],[{...account,id:'owner'}]]){
    const unresolved={...item};await assert.rejects(reconcileCreates([unresolved],{runId:'run',ownerId:'owner',now:()=>40000,lookup:async()=>rows}));assert.equal(unresolved.id,null);
  }
  let deleted=false;
  try{await reconcileWrites([{...op}],{now:()=>40000,readReceipt:async()=>[]});deleted=true;}catch{/* Fail closed; never delete while a write is uncertain. */}
  assert.equal(deleted,false);
  console.log('Tuition offline guards passed: exact origins/revision, read-only conversation rewrite, terminal denials, bounded receipt/Auth reconciliation and retained unresolved fixtures.');
}
if(process.argv.includes('--self-test')){assert.equal(process.argv.length,3);await selfTest();process.exit(0);}
assert.equal(process.argv.length,2,'Only --self-test is supported; live execution requires the root DB lease.');
process.umask(0o077);
const origin=process.env.NATIVE_ORIGIN,mode=originMode(origin,process.env.EXPECTED_RELEASE_REVISION),local=mode==='actual_jwt_local_handlers';
const deployment=JSON.parse(await readFile('deployment.json','utf8'));
assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);assert.equal(deployment.vercel.productionUrl,'https://stu.best');
async function boundedJson(response,signal,maxBytes=4*1024*1024){
  assert.ok(response.body&&Number(response.headers.get('content-length')||0)<=maxBytes,'Unexpected response size.');
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let text='',bytes=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{for(;;){signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();if(part.done)break;bytes+=part.value.byteLength;assert.ok(bytes<=maxBytes,'Response too large.');text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}
  catch(error){void reader.cancel().catch(()=>{});throw error;}finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}
let releaseRevision=null;
if(!local){
  const timeout=AbortSignal.timeout(10000),response=await fetch(origin+'/release.json',{redirect:'error',credentials:'omit',cache:'no-store',signal:timeout});
  assert.equal(response.status,200,'The exact production release must be accessible before credentials are loaded.');
  const release=await boundedJson(response,timeout,8192);assert.equal(release.revision,process.env.EXPECTED_RELEASE_REVISION);assert.equal(release.environment,'production');assert.equal(release.source,'vercel-git');releaseRevision=release.revision;
}
// Exact origin/release guards above run BEFORE resolving any credentials or DB client.
const [{deploymentEnvironment},{createClient},{chromium},{default:postgres}]=await Promise.all([
  import('../../scripts/deployment-env.mjs'),import('@supabase/supabase-js'),import('playwright-core'),import('postgres'),
]);
const env=deploymentEnvironment();Object.assign(process.env,env);
const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;assert.equal(url,`https://${project}.supabase.co`);
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
let target;try{target=new URL(connection);}catch{throw new Error('Client database connection unavailable.');}
assert.ok(['postgres:','postgresql:'].includes(target.protocol)&&
  (target.hostname===`db.${project}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+project)),'Exact client database required.');
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;assert.ok(key&&serviceKey);
const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
const runDeadline=Date.now()+12*60*1000,overall=AbortSignal.timeout(12*60*1000);let cleaning=false;
const signal=ms=>cleaning?AbortSignal.timeout(ms):AbortSignal.any([overall,AbortSignal.timeout(ms)]);
function projectFetch(input,init={}){
  const destination=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(destination.origin,url);
  return fetch(input,{...init,redirect:'error',credentials:'omit',signal:init.signal?AbortSignal.any([init.signal,signal(20000)]):signal(20000)});
}
const admin=createClient(url,serviceKey,{auth,global:{fetch:projectFetch}});
const sql=postgres(connection,{max:1,connect_timeout:15,idle_timeout:5,connection:{statement_timeout:20000},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
// Production never imports either working-tree handler or substitutes browser API calls.
const handlers=local?{'/api/affairs-data':(await import('../../api/affairs-data.ts')).default,'/api/affairs-manage':(await import('../../api/affairs-manage.ts')).default}:{};
const runId=randomUUID(),marker='TUITION-QA-'+runId.slice(0,8),output=`artifacts/tuition-documents/${local?'local':'production'}-${runId}`;
const fixtures=[1,2,3].map(number=>({number,id:null,email:`tuition-live-${randomUUID()}@example.invalid`,google:number<3}));
const targets=[
  ...['null','blank','other','delete'].map((label,index)=>({id:randomUUID(),family:'settlement',fixture:index===2?2:1,label:marker+' '+label})),
  ...['summer','evening','replacement'].map(label=>({id:randomUUID(),family:'metadata',fixture:1,kind:label==='evening'?'evening':'summer'})),
];
const operations=[],successes=new Map(),checks=[],activeRequests=new Set();
const accounts=()=>fixtures.flatMap(item=>item.id?[item.id]:[]),ids=targets.map(item=>item.id),ledgerPath=output+'/fixture-ledger.json';
let ownerId,ownerBefore,ownerClient,ownerSession,browser,schemaReady=false,phase='preflight',passed=false,failure=null;
let httpCalls=0,browserApiCalls=0,blockedOfficialCalls=0,blockedModelCalls=0,blockedOtherCalls=0,downloadEvents=0,screenshotBytes=0,connectionClosed=false;
async function ledger(state='active',cleanupFailures=[]){
  await writeFile(ledgerPath+'.next',JSON.stringify({runId,origin,mode,releaseRevision,state,marker,fixtureAccounts:fixtures,targets,ownerId:ownerId??null,ownerFingerprint:ownerBefore??null,operations,cleanupFailures},null,2),{mode:0o600});await rename(ledgerPath+'.next',ledgerPath);
}
const fingerprint=async id=>(await sql`select u.id,md5((to_jsonb(u)-array['last_sign_in_at','updated_at'])::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(i)-array['last_sign_in_at','updated_at'] order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
  from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
async function authenticateOwner(){
  const file=await stat('.env.owner.local');assert.ok(file.isFile()&&(file.mode&0o077)===0);
  const credentials=parseEnv(await readFile('.env.owner.local','utf8'));assert.ok(credentials.CRM_ADMIN_EMAIL?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()&&credentials.CRM_ADMIN_PASSWORD);
  ownerClient=createClient(url,key,{auth,global:{fetch:projectFetch}});
  const signed=await ownerClient.auth.signInWithPassword({email:credentials.CRM_ADMIN_EMAIL,password:credentials.CRM_ADMIN_PASSWORD});ownerSession=signed.data.session;assert.ok(!signed.error&&ownerSession,'Existing administrator sign-in failed.');
  const verified=await ownerClient.auth.getUser(ownerSession.access_token),user=verified.data.user;
  assert.ok(!verified.error&&user?.id===ownerId&&user.email?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()&&user.email_confirmed_at&&user.identities?.some(item=>item.provider==='google'),'Existing verified Google/admin required.');
}
function queryObject(params){const result={};for(const name of new Set(params.keys())){const values=params.getAll(name);result[name]=values.length===1?values[0]:values;}return result;}
async function invoke(endpoint,{token,method='GET',body}={}){
  if(!cleaning)overall.throwIfAborted();const destination=new URL(endpoint,origin);assert.equal(destination.origin,origin);assert.ok(['/api/affairs-data','/api/affairs-manage','/api/affairs-conversations'].includes(destination.pathname));
  if(destination.pathname==='/api/affairs-conversations')assert.ok(browserReadAllowed(method,destination));
  if(token&&token===ownerSession?.access_token){
    if(method==='GET')assert.ok(destination.pathname==='/api/affairs-data'&&
      (destination.search==='?scope=tuition-documents'||destination.searchParams.get('scope')==='tuition-documents-admin'&&accounts().includes(destination.searchParams.get('user_id'))),'Owner reads never initialize the owner or load a general snapshot.');
    else assert.ok(method==='POST'&&destination.pathname==='/api/affairs-manage'&&kinds.includes(body?.kind)&&ids.includes(body?.payload?.id)&&accounts().includes(body?.payload?.user_id)&&operations.some(op=>op.actorId===ownerId&&op.kind===body.kind&&op.payload.request_id===body.payload.request_id&&op.payload.id===body.payload.id),'Owner writes require an exact pre-ledgered fixture target.');
  }
  httpCalls++;
  if(!local){
    const timeout=signal(25000),response=await fetch(destination,{method,redirect:'error',credentials:'omit',cache:'no-store',headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:timeout});
    return {status:response.status,body:await boundedJson(response,timeout),cacheControl:response.headers.get('cache-control')};
  }
  const result={status:200,body:null,cacheControl:null};const response={status(code){result.status=code;return response;},json(value){result.body=value;},setHeader(name,value){if(name.toLowerCase()==='cache-control')result.cacheControl=value;}};
  const resolved=localHandlerDestination(destination,method);
  await handlers[resolved.pathname]({method,headers:token?{authorization:'Bearer '+token}:{},query:queryObject(resolved.searchParams),body},response);return result;
}
async function request(endpoint,{status=200,...options}={}){const response=await invoke(endpoint,options);assert.equal(response.status,status,`${phase}: API status ${response.status}`);assert.match(response.cacheControl||'',/no-store/);return response.body;}
async function verifyFixture(item){
  assert.ok(fixtures.includes(item)&&item.id&&item.id!==ownerId);const [row]=await sql`select id,email,raw_user_meta_data->>'tuition_qa_run' as run from auth.users where id=${item.id}`;
  assert.ok(row?.id===item.id&&row.email===item.email&&row.run===runId,'Refuse a non-fixture identity.');
}
async function createFixture(item){
  assert.ok(runDeadline-Date.now()>settleMs);item.creationState='pending';item.creationSentAt=Date.now();await ledger();
  const password=randomBytes(32).toString('base64url')+'Aa1!';
  try{const created=await admin.auth.admin.createUser({email:item.email,password,email_confirm:true,user_metadata:{full_name:'Synthetic Tuition QA '+item.number,tuition_qa_run:runId}});
    if(created.data.user){item.id=created.data.user.id;await ledger();}assert.ok(!created.error&&item.id);await verifyFixture(item);item.creationState='created';
  }finally{if(item.creationState==='pending')item.creationState='uncertain';await ledger();}
  if(item.google)await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at) values(${item.id},${item.id},${sql.json({sub:item.id,email:item.email,email_verified:true})},'google',now(),now(),now())`;
  const client=createClient(url,key,{auth,global:{fetch:projectFetch}}),signed=await client.auth.signInWithPassword({email:item.email,password});assert.ok(!signed.error&&signed.data.session?.user.id===item.id);
  const verified=await client.auth.getUser(signed.data.session.access_token);assert.ok(!verified.error&&verified.data.user?.id===item.id);return signed.data.session;
}
async function verifyTarget(item){
  assert.ok(targets.includes(item));const owner=fixtures.find(fixture=>fixture.number===item.fixture);await verifyFixture(owner);
  const table=item.family==='settlement'?'affairs_tuition_settlements':'affairs_tuition_document_metadata';
  const rows=await sql`select * from ${sql('public.'+table)} where id=${item.id}`;
  for(const row of rows){assert.equal(row.user_id,owner.id);assert.equal(row.source_mode,'local_demo');if(item.family==='settlement')assert.equal(row.period_label,item.label);else{assert.equal(row.kind,item.kind);assert.equal(row.issuer,'stu.best');}}
}
async function save(kind,payload,{session=ownerSession,status=200}={}){
  const item=targets.find(target=>target.id===payload.id);assert.ok(item&&kinds.includes(kind)&&accounts().includes(payload.user_id));
  assert.ok(session?.user.id===ownerId||accounts().includes(session?.user.id));await verifyTarget(item);
  if(kind==='save_tuition_settlement')assert.equal(payload.period_label,item.label);
  assert.ok(runDeadline-Date.now()>settleMs,'Do not start a mutation near the run deadline.');
  // Each send has its own record, including reused request IDs with changed bodies.
  const operation={actorId:session.user.id,kind,payload:structuredClone(payload),sentAt:Date.now(),state:'pending'};operations.push(operation);await ledger();
  const task=(async()=>{const response=await invoke('/api/affairs-manage',{method:'POST',token:session.access_token,body:{kind,payload}});
    operation.state=terminalResponse(operation,response)?'terminal':'uncertain';assert.equal(response.status,status,`${phase}: mutation status ${response.status}`);assert.match(response.cacheControl||'',/no-store/);
    if(status===200){assert.ok(validReceipt(operation,response.body));successes.set(operation.actorId+':'+payload.request_id,{...operation,result:response.body});}return response.body;})();
  activeRequests.add(task);try{return await task;}finally{activeRequests.delete(task);if(operation.state==='pending')operation.state='uncertain';await ledger();}
}
const next=payload=>({...payload,request_id:randomUUID()});
const personal=(session)=>request('/api/affairs-data?scope=tuition-documents',{token:session.access_token});
const manager=(userId)=>request('/api/affairs-data?scope=tuition-documents-admin&user_id='+userId,{token:ownerSession.access_token});
async function restRead(table,session,id){
  assert.ok(['affairs_tuition_settlements','affairs_tuition_document_metadata'].includes(table));
  const timeout=signal(20000),response=await projectFetch(url+'/rest/v1/'+table+'?select=id,user_id'+(id?'&id=eq.'+id:''),{headers:{apikey:key,Authorization:'Bearer '+session.access_token},signal:timeout});
  assert.equal(response.status,200);return boundedJson(response,timeout);
}
async function pageFor(session){
  assert.ok(accounts().includes(session.user.id)&&session.user.id!==ownerId);
  const context=await browser.newContext({viewport:{width:1533,height:1000},locale:'zh-TW',reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(({origin,session})=>{if(window.top===window&&location.origin===origin&&!sessionStorage.getItem('tuition-live-qa')){localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));sessionStorage.setItem('tuition-live-qa','1');}},{origin,session});
  await context.route('**/*',async route=>{
    const req=route.request(),destination=new URL(req.url());
    if(destination.hostname==='stu.edu.tw'||destination.hostname.endsWith('.stu.edu.tw')){blockedOfficialCalls++;return route.abort();}
    if(/\/api\/(?:affairs-assistant|research-assistant)/.test(destination.pathname)||destination.hostname==='api.openai.com'){blockedModelCalls++;return route.abort();}
    if(![origin,url].includes(destination.origin)&&!['data:','blob:'].includes(destination.protocol)){blockedOtherCalls++;return route.abort();}
    if(destination.origin===origin&&destination.pathname.startsWith('/api/')){
      browserApiCalls++;assert.ok(browserReadAllowed(req.method(),destination),'Browser permits only account data and the fresh fixture conversation index; writes/model requests remain blocked.');
      if(local){const task=invoke(destination.pathname+destination.search,{method:req.method(),token:req.headers().authorization?.slice(7)});activeRequests.add(task);
        try{const response=await task;await route.fulfill({status:response.status,headers:{'Cache-Control':response.cacheControl||'no-store'},json:response.body});}
        finally{activeRequests.delete(task);}return;}
    }
    return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',()=>errors.push('page-error'));page.on('download',download=>{downloadEvents++;void download.cancel();});return {context,page,errors};
}
async function ready(page){await page.locator('.tuition-main[aria-busy="false"]').waitFor();assert.equal(await page.locator('.tuition-documents [role="alert"]').count(),0);}
async function queryPeriod(page,id,expected){
  await page.getByLabel('歷年結算資料',{exact:true}).selectOption(id);await page.locator('.tuition-query-button').click();
  // A deliberately blank statement has an attached zero-height paragraph.
  await page.locator('.tuition-local-record').waitFor({state:expected===''?'attached':'visible'});await ready(page);assert.equal(await page.locator('.tuition-local-record p').textContent(),expected);
}
async function capture(page,name){const file=output+'/'+name+'.jpg';await page.screenshot({path:file,type:'jpeg',quality:28});const saved=await stat(file);assert.equal(saved.mode&0o077,0);screenshotBytes+=saved.size;assert.ok(screenshotBytes<200000,'Keep synthetic screenshot footprint below200KB.');}

try{
  await mkdir(output,{recursive:true,mode:0o700});await ledger();assert.equal((await stat(output)).mode&0o077,0);assert.equal((await stat(ledgerPath)).mode&0o077,0);
  const [baseline]=await sql`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,(select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls`;
  assert.deepEqual(baseline,{migrations:128,rls:146},'Requires reviewed170000+180000 at the exact baseline.');
  assert.equal((await sql`select count(*)::int as n from supabase_migrations.schema_migrations where version in ('20261112170000','20261112180000')`)[0].n,2);
  for(const table of ['affairs_tuition_settlements','affairs_tuition_document_metadata'])assert.equal((await sql`select relrowsecurity from pg_class where oid=${'public.'+table}::regclass`)[0].relrowsecurity,true);schemaReady=true;
  const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin' where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
  assert.ok(owner,'Existing verified Google administrator required; no owner repair is permitted.');ownerId=owner.id;ownerBefore=await fingerprint(ownerId);await ledger();await authenticateOwner();
  phase='synthetic callers and initialization';const first=await createFixture(fixtures[0]),second=await createFixture(fixtures[1]),nonGoogle=await createFixture(fixtures[2]);
  for(const session of [first,second])assert.equal((await request('/api/affairs-data',{token:session.access_token})).profile.userId,session.user.id);
  assert.deepEqual(await personal(first),{periods:[],settlements:[],documents:[]});
  for(const token of [undefined,nonGoogle.access_token])await request('/api/affairs-data?scope=tuition-documents',{token,status:401});
  await request('/api/affairs-data?scope=tuition-documents&user_id='+second.user.id,{token:first.access_token,status:400});
  await request('/api/affairs-data?scope=tuition-documents-admin&user_id='+first.user.id,{token:second.access_token,status:403});
  checks.push('verified-Google-personal-scope-and-admin-denials');

  phase='actual JWT admin create replay and read';
  const [nullTarget,blankTarget,otherTarget,deleteTarget,summerTarget,eveningTarget,replacementTarget]=targets;
  const settlement=(target,text)=>next({id:target.id,user_id:fixtures.find(item=>item.number===target.fixture).id,expected_version:0,period_label:target.label,statement_text:text,row_order:targets.indexOf(target)});
  const initial=settlement(nullTarget,null),blank=settlement(blankTarget,''),other=settlement(otherTarget,marker+' second-account-only'),temporary=settlement(deleteTarget,'Synthetic disposable statement');
  await save(kinds[0],initial,{session:first,status:403});await request('/api/affairs-manage',{method:'POST',body:{kind:kinds[0],payload:initial},status:401});
  const initialReceipt=await save(kinds[0],initial);assert.deepEqual(await save(kinds[0],initial),initialReceipt);
  for(const payload of [blank,other,temporary])await save(kinds[0],payload);
  const own=await personal(first);assert.equal(own.settlements.length,3);assert.ok(own.settlements.every(row=>row.userId===first.user.id));assert.deepEqual(own.documents,[]);
  assert.equal(own.settlements.find(row=>row.id===initial.id).text,null);assert.equal(own.settlements.find(row=>row.id===blank.id).text,'');
  assert.deepEqual((await personal(second)).settlements.map(row=>row.id),[other.id]);
  assert.ok((await personal(ownerSession)).settlements.every(row=>row.userId===ownerId),'Admin personal API must remain caller-owned.');
  for(const table of ['affairs_tuition_settlements','affairs_tuition_document_metadata']){
    const rows=await restRead(table,first);assert.ok(rows.every(row=>row.user_id===first.user.id));
    assert.deepEqual(await restRead(table,second,initial.id),[]);
  }
  checks.push('real-admin-create-exact-replay-own-cross-account-RLS-and-student-API-write-denial');

  phase='revision conflicts literal data and metadata';
  const edited=next({...initial,expected_version:1,statement_text:'  '+marker+' literal statement 😀  '});await save(kinds[0],edited);
  await save(kinds[0],next(edited),{status:409});await save(kinds[0],{...edited,statement_text:'Changed request reuse'},{status:409});
  await save(kinds[0],next({...edited,expected_version:2,user_id:second.user.id}),{status:403});
  await save(kinds[0],next({...edited,expected_version:2,unapproved:null}),{status:400});
  assert.deepEqual(await save(kinds[0],initial),initialReceipt);
  const metadata=(target)=>next({id:target.id,user_id:first.user.id,expected_version:0,kind:target.kind,period_label:null,note_text:'',status:'metadata_only',issuer:'stu.best'});
  const summer=metadata(summerTarget),evening={...metadata(eveningTarget),period_label:'',note_text:null};
  const summerReceipt=await save(kinds[2],summer);await save(kinds[2],evening);assert.deepEqual(await save(kinds[2],summer),summerReceipt);
  await save(kinds[2],metadata(replacementTarget),{status:409});
  await save(kinds[2],next({...summer,expected_version:1,kind:'evening'}),{status:403});
  await save(kinds[2],next({...summer,expected_version:1,status:'available'}),{status:400});
  const adminRead=await manager(first.user.id);assert.equal(adminRead.documentMetadata.length,2);assert.deepEqual(adminRead.documents,[]);
  const summerRead=adminRead.documentMetadata.find(row=>row.id===summer.id),eveningRead=adminRead.documentMetadata.find(row=>row.id===evening.id);
  assert.equal(summerRead.periodLabel,null);assert.equal(summerRead.noteText,'');assert.equal(eveningRead.periodLabel,'');assert.equal(eveningRead.noteText,null);
  assert.deepEqual(await restRead('affairs_tuition_document_metadata',first,summer.id),[{id:summer.id,user_id:first.user.id}]);
  assert.deepEqual(await restRead('affairs_tuition_document_metadata',second,summer.id),[]);assert.equal(Object.hasOwn(await personal(first),'documentMetadata'),false);
  checks.push('literal-null-blank-preservation-version-conflicts-and-metadata-without-file-capability');

  phase='real native browser routes and metadata cannot print';
  browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const one=await pageFor(first),two=await pageFor(second),page=one.page;
  await page.goto(origin+'/school-affairs/menu/swd/query');const catalog=page.locator('[data-program-id="49-1"]');await catalog.waitFor();
  for(const [id,view] of [['48-1','summer'],['48-2','extended'],['48-3','evening'],['49-1','settlement']])assert.equal(await page.locator(`[data-program-id="${id}"]`).getAttribute('href'),routes[view]);
  await catalog.click();await page.waitForURL(origin+routes.settlement);await ready(page);
  assert.equal(await page.getByLabel('歷年結算資料',{exact:true}).locator('option').count(),4);
  await queryPeriod(page,initial.id,edited.statement_text);await page.reload();await ready(page);await queryPeriod(page,initial.id,edited.statement_text);
  await queryPeriod(page,blank.id,'');
  assert.ok((await page.locator('.tuition-explanation').innerText()).includes('會計室6158000分機1501'));
  assert.equal(await page.locator('.tuition-documents table').count(),0,'Do not invent source settlement columns.');
  await capture(page,'settlement-desktop');
  const nav=page.getByRole('navigation',{name:'學雜費選單',exact:true});
  for(const [view,label] of [['summer','暑修選課繳費查詢'],['extended','延修選課繳費查詢'],['evening','學分學雜費結算繳費查詢']]){
    await nav.getByRole('button',{name:'繳費清單列印',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();await page.waitForURL(origin+routes[view]);await ready(page);
    if(view==='extended'){assert.equal(await page.locator('.tuition-print-button').count(),0);await page.getByText('延修生繳費資料目前無法提供。',{exact:true}).waitFor();}
    else{assert.ok(await page.locator('.tuition-print-button').isDisabled());assert.equal(await page.locator('.tuition-print-information a').getAttribute('href'),'https://get.adobe.com/reader/');}
  }
  await nav.getByRole('button',{name:'查詢',exact:true}).click();await page.getByRole('menuitem',{name:'學分學雜費結算差額明細查詢',exact:true}).click();await page.waitForURL(origin+routes.settlement);await ready(page);
  for(const width of [390,320]){phase='browser mobile '+width+' containment';await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));phase='browser mobile '+width+' keyboard focus';await page.getByLabel('歷年結算資料',{exact:true}).focus();assert.ok(await page.getByLabel('歷年結算資料',{exact:true}).evaluate(node=>node===document.activeElement));if(width===390)await capture(page,'settlement-mobile390');}
  await two.page.goto(origin+routes.settlement);await ready(two.page);assert.equal(await two.page.getByLabel('歷年結算資料',{exact:true}).locator('option').count(),2);await queryPeriod(two.page,other.id,other.statement_text);
  assert.ok(!(await two.page.locator('.tuition-documents').innerText()).includes(nullTarget.label));
  checks.push('catalog49-1-local-navigation48-1-48-2-48-3-reload-phone-and-mobile-no-download');

  phase='clear terminal revoke tombstone and late replay';
  await save(kinds[0],next({...initial,expected_version:2}));assert.equal((await personal(first)).settlements.find(row=>row.id===initial.id).text,null);
  await page.reload();await ready(page);await queryPeriod(page,initial.id,'—');await queryPeriod(page,blank.id,'');
  const revoked=next({...summer,expected_version:1,status:'revoked'});await save(kinds[2],revoked);
  await save(kinds[2],next({...summer,expected_version:2}),{status:400});await save(kinds[2],next(revoked),{status:409});
  assert.equal((await manager(first.user.id)).documentMetadata.find(row=>row.id===summer.id).status,'revoked');
  const deletedStatement=next({id:temporary.id,user_id:first.user.id,expected_version:1}),deletedMetadata=next({id:summer.id,user_id:first.user.id,expected_version:2});
  const deletion=await save(kinds[1],deletedStatement);assert.deepEqual(await save(kinds[1],deletedStatement),deletion);
  await save(kinds[3],deletedMetadata);assert.deepEqual(await save(kinds[2],summer),summerReceipt);assert.equal((await save(kinds[0],temporary)).version,1);
  await save(kinds[2],next({...summer,expected_version:3,status:'revoked'}),{status:409});await save(kinds[0],next({...temporary,expected_version:2}),{status:409});
  await save(kinds[2],metadata(replacementTarget));
  assert.deepEqual((await personal(first)).settlements.map(row=>row.id).sort(),[initial.id,blank.id].sort());
  const finalMetadata=(await manager(first.user.id)).documentMetadata;assert.deepEqual(finalMetadata.map(row=>row.id).sort(),[evening.id,replacementTarget.id].sort());
  for(const table of ['affairs_tuition_settlements','affairs_tuition_document_metadata'])assert.deepEqual(await restRead(table,first,table.endsWith('settlements')?temporary.id:summer.id),[]);
  const tombstones=await sql`select id,version,deleted_at is not null as deleted from public.affairs_tuition_settlements where id=${temporary.id} union all select id,version,deleted_at is not null as deleted from public.affairs_tuition_document_metadata where id=${summer.id}`;
  assert.equal(tombstones.length,2);assert.ok(tombstones.every(row=>row.deleted));
  await page.goto(origin+routes.summer);await ready(page);assert.ok(await page.locator('.tuition-print-button').isDisabled());
  assert.deepEqual(one.errors,[]);assert.deepEqual(two.errors,[]);await one.context.close();await two.context.close();
  checks.push('clear-to-null-terminal-revocation-soft-delete-late-replay-and-reserved-identifiers');
  phase='exact audit receipt and owner preservation';
  assert.equal(successes.size,12,'Replays and rejected operations must not add successful writes.');
  const receipts=await sql`select user_id,request_id,kind,payload,result from private.affairs_tuition_operations where request_id=any(${operations.map(op=>op.payload.request_id)}::uuid[])`;
  assert.equal(receipts.length,successes.size);for(const row of receipts){const op=successes.get(row.user_id+':'+row.request_id);assert.ok(op);assert.equal(row.kind,op.kind);assert.deepEqual(row.payload,op.payload);assert.deepEqual(row.result,op.result);}
  assert.equal((await sql`select count(*)::int as n from public.affairs_agent_audit where target_id=any(${ids}::uuid[])`)[0].n,successes.size);
  assert.deepEqual(await fingerprint(ownerId),ownerBefore);assert.equal(blockedModelCalls,0);assert.equal(blockedOfficialCalls,0);assert.equal(blockedOtherCalls,0);assert.equal(downloadEvents,0);
  checks.push('one-audit-per-successful-request-and-protected-owner-unchanged');passed=true;
}catch(error){process.exitCode=1;failure={phase,type:error instanceof assert.AssertionError?'AssertionError':error?.name||'Error',location:String(error?.stack||'').match(/tuition-documents-live\.mjs:\d+:\d+/)?.[0]??null};console.error(JSON.stringify({status:'failed',...failure}));}
finally{
  cleaning=true;const cleanupFailures=[];let writesSettled=true,createsSettled=true,rowsCleaned=false;
  const clean=async(label,action)=>{try{await action();return true;}catch{cleanupFailures.push(label);return false;}};
  await clean('browser-close',()=>browser?.close());await Promise.allSettled([...activeRequests]);
  // Handler shared deadline17s;30s includes transport grace but does NOT prove SQL
  // cancellation. Missing/mismatched receipt keeps every fixture for recovery.
  await clean('uncertain-write-reconciliation',async()=>{try{await reconcileWrites(operations,{readReceipt:op=>sql`select user_id,request_id,kind,payload,result from private.affairs_tuition_operations where user_id=${op.actorId} and request_id=${op.payload.request_id}`});}catch(error){writesSettled=false;throw error;}});
  await clean('uncertain-auth-creation-reconciliation',async()=>{try{await reconcileCreates(fixtures,{runId,ownerId,lookup:item=>sql`select id,email,raw_user_meta_data->>'tuition_qa_run' as run from auth.users where email=${item.email}`});await ledger();}catch(error){createsSettled=false;throw error;}});
  if(schemaReady&&writesSettled&&createsSettled)rowsCleaned=await clean('exact-records-receipts-audits',async()=>{
    for(const item of targets)if(fixtures.find(fixture=>fixture.number===item.fixture)?.id)await verifyTarget(item);
    await sql.begin(async tx=>{
      for(const item of targets){const owner=fixtures.find(fixture=>fixture.number===item.fixture);if(!owner.id)continue;
        await tx`delete from ${tx('public.'+(item.family==='settlement'?'affairs_tuition_settlements':'affairs_tuition_document_metadata'))} where id=${item.id} and user_id=${owner.id} and source_mode='local_demo'`;}
      for(const op of operations){assert.ok(ids.includes(op.payload.id)&&accounts().includes(op.payload.user_id)&&[ownerId,...accounts()].includes(op.actorId));
        await tx`delete from private.affairs_tuition_operations where user_id=${op.actorId} and request_id=${op.payload.request_id} and kind=${op.kind} and payload->>'id'=${op.payload.id} and payload->>'user_id'=${op.payload.user_id}`;}
      for(const item of targets)await tx`delete from public.affairs_agent_audit where target_id=${item.id} and user_id=any(${[ownerId,...accounts()].filter(Boolean)}::uuid[]) and action_kind=any(${kinds}::text[])`;
    });
  });
  // A failed exact-row cleanup must not cascade away evidence by deleting users.
  if(rowsCleaned&&writesSettled&&createsSettled)for(const item of fixtures)if(item.id)await clean('fixture-account-'+item.number,async()=>{
    await verifyFixture(item);for(let attempt=0;attempt<3;attempt++){const result=await admin.auth.admin.deleteUser(item.id);if(!result.error||(await sql`select id from auth.users where id=${item.id}`).length===0)return;}throw new Error('Fixture account cleanup unresolved.');
  });
  if(ownerSession)await clean('owner-local-signout',async()=>assert.ok(!(await ownerClient.auth.signOut({scope:'local'})).error));
  await clean('exact-cleanup-verification',async()=>{
    assert.ok(writesSettled&&createsSettled,'Unresolved operations require manual recovery from the private ledger.');
    for(const item of fixtures)assert.equal((await sql`select id from auth.users where email=${item.email}`).length,0);
    if(accounts().length)for(const [table,column] of [['auth.users','id'],['auth.identities','user_id'],['public.affairs_profiles','user_id']])assert.equal((await sql`select ${sql(column)} from ${sql(table)} where ${sql(column)}=any(${accounts()}::uuid[])`).length,0);
    if(schemaReady){for(const table of ['affairs_tuition_settlements','affairs_tuition_document_metadata'])assert.equal((await sql`select id from ${sql('public.'+table)} where id=any(${ids}::uuid[])`).length,0);
      assert.equal((await sql`select id from public.affairs_agent_audit where target_id=any(${ids}::uuid[])`).length,0);
      if(operations.length)assert.equal((await sql`select request_id from private.affairs_tuition_operations where request_id=any(${operations.map(op=>op.payload.request_id)}::uuid[])`).length,0);}
  });
  if(ownerBefore)await clean('owner-preservation',async()=>assert.deepEqual(await fingerprint(ownerId),ownerBefore));
  await clean('database-close',async()=>{await sql.end({timeout:5});connectionClosed=true;});if(cleanupFailures.length)process.exitCode=1;
  await ledger(cleanupFailures.length?'cleanup-required':'cleaned',cleanupFailures);
  const result={passed:passed&&!cleanupFailures.length,mode,releaseRevision,checks,httpCalls,browserApiCalls,plannedUsers:fixtures.length,plannedTargets:targets.length,successfulWrites:successes.size,screenshotBytes,blockedModelCalls,blockedOfficialCalls,blockedOtherCalls,downloadEvents,mutationCleanupReady:writesSettled,fixtureCreationCleanupReady:createsSettled,cleanupVerified:cleanupFailures.length===0,cleanupFailures,connectionClosed,failure,limitations:['No administrator browser UI; positive writes use its actual JWT through the selected API transport.','No official issuance, PDF content, payment, model calls or file uploads are tested.']};
  await writeFile(output+'/result.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({...result,artifacts:output}));
}

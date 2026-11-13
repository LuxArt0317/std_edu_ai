import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,opendir,readFile,rename,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual,parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';
import {parseStudentLoanSnapshot,validateStudentLoanPayload} from '../../server/studentLoan.js';

// OFFLINE DRAFT. --execute requires root's serialized DB/release lease.
// Local mode uses actual JWTs + working-tree handlers. Production uses deployed
// HTTP only. Owner authorization is never changed and its JWT never enters a browser.
const project='xiftudmvxphxcjtmfmib',settleMs=30000,path='/school-affairs/services/21-1';
const kinds=['save_student_loan','delete_student_loan'];
export const loanExpectedSchema=Object.freeze({migrations:131,rls:148});
export function loanFixturePayload(target,userId,values={}){
  assert.ok(values&&typeof values==='object'&&!Array.isArray(values)&&[Object.prototype,null].includes(Object.getPrototypeOf(values))&&Object.keys(values).every(key=>['current_application_state','current_application_text','progress_text','history_count','history_text'].includes(key)),'Fixture overrides must not replace owner, ID, receipt, version or run marker.');
  const result={id:target.id,user_id:userId,request_id:randomUUID(),expected_version:0,current_term_label:target.code,current_application_state:'unknown',current_application_text:null,progress_text:null,history_count:null,history_text:null,...values};
  assert.equal(validateStudentLoanPayload(kinds[0],result),null);return result;
}
export const loanAdvisoryLockKey=Object.freeze([23101314,115100]);
/** A lost physical session never silently becomes a new advisory lease. */
export async function loanReserveLease(pool,{onLost=()=>{}}={}){
  const reserved=await pool.reserve();let pid=null,held=false,lost=false,released=false;
  const lose=()=>{if(!released&&!lost){lost=true;held=false;onLost();}};
  async function assertHeld(){
    assert.ok(held&&!lost&&!released,'Loan database lease is unavailable; retain its recovery ledger.');
    try{
      const [row]=await reserved`select pg_backend_pid() as pid,exists(select 1 from pg_catalog.pg_locks
        where pid=pg_backend_pid() and locktype='advisory' and granted and mode='ExclusiveLock'
          and classid=${loanAdvisoryLockKey[0]}::oid and objid=${loanAdvisoryLockKey[1]}::oid and objsubid=2) as held`;
      assert.ok(!lost&&row?.pid===pid&&row.held===true,'Loan database session or its advisory lock changed.');
    }catch(error){lose();throw error;}
  }
  async function withHeld(action){await assertHeld();assert.ok(!lost&&!released);return action();}
  function sql(...args){
    if(!Array.isArray(args[0])||!Object.hasOwn(args[0],'raw'))return reserved(...args);
    return withHeld(()=>reserved(...args));
  }
  sql.json=(...args)=>reserved.json(...args);
  async function transaction(action){
    let began=false;
    // Control statements need the same post-await loss check as data queries.
    try{await withHeld(()=>reserved.unsafe('begin'));began=true;await assertHeld();const result=await action(sql);await withHeld(()=>reserved.unsafe('commit'));return result;}
    catch(error){if(began)try{await reserved.unsafe('rollback');}catch{lose();}throw error;}
  }
  async function release(){
    if(released)return;
    try{const [row]=await withHeld(()=>reserved`select pg_advisory_unlock(${loanAdvisoryLockKey[0]}::int,${loanAdvisoryLockKey[1]}::int) as unlocked`);assert.equal(row?.unlocked,true);held=false;}
    catch(error){lose();throw error;}
    finally{released=true;await reserved.release();}
  }
  try{
    const [row]=await reserved`select pg_backend_pid() as pid,pg_try_advisory_lock(${loanAdvisoryLockKey[0]}::int,${loanAdvisoryLockKey[1]}::int) as held`;
    assert.ok(Number.isInteger(row?.pid)&&row.pid>0&&row.held===true,'Conversation/native acceptance already holds the shared advisory lease.');pid=row.pid;held=true;
    await assertHeld();return {sql,assertHeld,withHeld,transaction,release,lose,get lost(){return lost;}};
  }catch(error){lose();released=true;await reserved.release();throw error;}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const loanLedgerScanLimits=Object.freeze({entries:512,runs:128,fileBytes:512*1024,totalBytes:16*1024*1024});
function cleanedLedger(value,name){
  const object=item=>Boolean(item&&typeof item==='object'&&!Array.isArray(item));
  const identifier=item=>typeof item==='string'&&uuid.test(item);
  assert.ok(object(value)&&identifier(value.runId)&&name.endsWith('-'+value.runId),'Malformed retained loan ledger.');
  assert.equal(value.state,'cleaned','Prior loan run is not cleaned; reconcile its private ledger before starting another run.');
  assert.equal(value.mode,loanOriginMode(value.origin,value.releaseRevision));
  assert.ok(name.startsWith(value.mode==='deployed_http'?'production-':'local-'));
  if(value.mode!=='deployed_http')assert.equal(value.releaseRevision,null);
  assert.equal(value.marker,'LOAN-QA-'+value.runId.slice(0,8));
  assert.ok(value.ownerId===null||identifier(value.ownerId));
  assert.ok(value.ownerFingerprint===null||object(value.ownerFingerprint));
  assert.ok(Array.isArray(value.cleanupFailures)&&value.cleanupFailures.length===0);
  assert.ok(Array.isArray(value.fixtures)&&value.fixtures.length===3&&Array.isArray(value.targets)&&value.targets.length===4&&Array.isArray(value.operations)&&value.operations.length<=128);
  const fixtureIds=new Set(),targetIds=new Set();
  for(const [index,item]of value.fixtures.entries()){
    assert.ok(object(item)&&item.number===index+1&&(item.id===null||identifier(item.id)&&item.id!==value.ownerId));
    assert.ok(typeof item.email==='string'&&/^loan-live-[0-9a-f-]{36}@example\.invalid$/.test(item.email)&&item.google===(index<2));
    if(item.id){assert.ok(!fixtureIds.has(item.id));fixtureIds.add(item.id);}
  }
  for(const item of value.targets){assert.ok(object(item)&&identifier(item.id)&&!targetIds.has(item.id)&&[1,2].includes(item.fixture)&&typeof item.label==='string'&&item.code===value.marker+'-'+item.label);targetIds.add(item.id);}
  for(const op of value.operations)assert.ok(object(op)&&(op.actorId===null||identifier(op.actorId))&&kinds.includes(op.kind)&&object(op.payload)&&targetIds.has(op.payload.id)&&fixtureIds.has(op.payload.user_id)&&identifier(op.payload.request_id)&&Number.isInteger(op.payload.expected_version)&&Number.isFinite(op.sentAt));
  assert.ok(loanCleanupAllowed({operations:value.operations,fixtures:value.fixtures,inflightDrained:true}),'Retained ledger has unresolved operations.');
}
export async function loanAssertNoRetainedLedgers(root='artifacts/student-loan',{io={lstat,opendir,open}}={}){
  let info;try{info=await io.lstat(root);}catch(error){if(error.code==='ENOENT')return {runs:0,files:0,bytes:0};throw error;}
  assert.ok(info.isDirectory()&&!info.isSymbolicLink(),'Loan artifact root must be a real directory.');const directory=await io.opendir(root);
  const counts={runs:0,files:0,bytes:0};let entries=0;
  for await(const entry of directory){
    assert.ok(++entries<=loanLedgerScanLimits.entries,'Loan artifact scan exceeded its entry bound.');
    if(!/^(?:local|production)-/.test(entry.name))continue;
    assert.ok(/^(?:local|production)-[0-9a-f-]{36}$/.test(entry.name)&&uuid.test(entry.name.slice(entry.name.indexOf('-')+1)),'Malformed loan run directory.');
    assert.ok(++counts.runs<=loanLedgerScanLimits.runs,'Loan artifact scan exceeded its run bound.');
    const folder=join(root,entry.name),info=await io.lstat(folder);assert.ok(info.isDirectory()&&!info.isSymbolicLink(),'Loan run directory must not be a symlink.');let files=0;
    for(const suffix of ['fixture-ledger.json','fixture-ledger.json.next']){
      let handle;try{handle=await io.open(join(folder,suffix),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      try{
        const info=await handle.stat();assert.ok(info.isFile()&&info.size>0&&info.size<=loanLedgerScanLimits.fileBytes,'Retained loan ledger is not a bounded regular file.');
        assert.ok(counts.bytes+info.size<=loanLedgerScanLimits.totalBytes,'Loan ledger scan exceeded its total byte bound.');
        const bytes=Buffer.alloc(info.size+1),read=await handle.read(bytes,0,bytes.length,0);assert.equal(read.bytesRead,info.size,'Retained loan ledger changed while reading.');
        counts.bytes+=read.bytesRead;cleanedLedger(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,read.bytesRead))),entry.name);files++;counts.files++;
      }finally{await handle.close();}
    }
    assert.ok(files>0,'Loan run is missing its recovery ledger; inspect it before starting another run.');
  }
  return counts;
}
export function loanOriginMode(origin,revision){
  if(['http://127.0.0.1:5184','http://localhost:5184'].includes(origin))return 'actual_jwt_local_handlers';
  assert.equal(origin,'https://stu.best','Use the exact local5184 or production origin.');
  assert.match(revision||'',/^[0-9a-f]{40}$/,'Production requires an exact reviewed release revision.');return 'deployed_http';
}
export function loanBrowserReadAllowed(method,url){
  if(method!=='GET')return false;
  if(url.pathname==='/api/affairs-conversations')return url.search==='';
  return url.pathname==='/api/affairs-data'&&(url.search===''||url.search==='?scope=student-loan');
}
export function loanLocalDestination(url,method){
  if(url.pathname!=='/api/affairs-conversations')return url;
  assert.ok(loanBrowserReadAllowed(method,url));return new URL('/api/affairs-data?resource=conversations',url.origin);
}
export function loanValidReceipt(op,value){return Boolean(value&&Object.keys(value).length===4&&value.id===op.payload.id&&value.kind===op.kind&&value.version===op.payload.expected_version+1&&typeof value.summary==='string'&&value.summary.length<=200);}
export function loanTerminalResponse(op,response){return response.status===200?loanValidReceipt(op,response.body):[400,401,403,409].includes(response.status)&&Boolean(response.body&&typeof response.body.error==='string'&&response.body.error);}
async function settle(items,{now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  for(const item of items)assert.ok(Number.isFinite(item.sentAt));const remaining=Math.max(0,...items.map(item=>item.sentAt+settleMs-now()));assert.ok(remaining<=settleMs);if(remaining)await wait(remaining);
}
export async function loanReconcileWrites(operations,{readReceipt,...clock}){
  const pending=operations.filter(op=>['pending','uncertain'].includes(op.state));await settle(pending,clock);
  for(const op of pending){const rows=await readReceipt(op);assert.equal(rows.length,1,'Unresolved write: retain fixtures and the private recovery ledger.');const row=rows[0];
    assert.equal(row.user_id,op.actorId);assert.equal(row.request_id,op.payload.request_id);assert.equal(row.kind,op.kind);assert.deepEqual(row.payload,op.payload);assert.ok(loanValidReceipt(op,row.result));op.state='reconciled';}
}
export async function loanReconcileCreates(fixtures,{runId,ownerId,lookup,...clock}){
  const pending=fixtures.filter(item=>['pending','uncertain'].includes(item.creationState));await settle(pending.map(item=>({sentAt:item.creationSentAt})),clock);
  for(const item of pending){const rows=await lookup(item);assert.equal(rows.length,1,'Unresolved Auth create: retain the exact email/run ledger.');const row=rows[0];
    assert.equal(row.email,item.email);assert.equal(row.run,runId);assert.ok(typeof row.id==='string'&&row.id!==ownerId&&!fixtures.some(other=>other!==item&&other.id===row.id));
    if(item.id)assert.equal(row.id,item.id);item.id=row.id;item.creationState='created';}
}
export function loanCleanupAllowed({operations,fixtures,inflightDrained}){
  return inflightDrained===true&&operations.every(op=>['terminal','reconciled'].includes(op.state))&&fixtures.every(item=>!item.creationState||item.creationState==='created');
}
export async function loanOfflineChecks(){
  assert.deepEqual(loanExpectedSchema,{migrations:131,rls:148});assert.deepEqual(loanAdvisoryLockKey,[23101314,115100]);
  assert.equal(loanOriginMode('http://127.0.0.1:5184'),'actual_jwt_local_handlers');assert.equal(loanOriginMode('https://stu.best','a'.repeat(40)),'deployed_http');
  for(const origin of [undefined,'https://stu.best/','http://stu.best','https://evil.stu.best','https://stu.best@evil.invalid','http://localhost:5185'])assert.throws(()=>loanOriginMode(origin,'a'.repeat(40)));
  assert.throws(()=>loanOriginMode('https://stu.best'));
  const conversation=new URL('https://stu.best/api/affairs-conversations');assert.equal(loanLocalDestination(conversation,'GET').href,'https://stu.best/api/affairs-data?resource=conversations');assert.equal(conversation.search,'');
  const rewrite=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8')).rewrites.find(rule=>rule.source==='/api/affairs-conversations');assert.equal(rewrite?.destination,'/api/affairs-data?resource=conversations');
  for(const url of ['/api/affairs-data','/api/affairs-data?scope=student-loan','/api/affairs-conversations'])assert.ok(loanBrowserReadAllowed('GET',new URL(url,conversation)));
  for(const url of ['/api/affairs-data?scope=admin','/api/affairs-data?scope=student-loan&user_id=other','/api/affairs-conversations?id=other','/api/affairs-manage','/api/affairs-assistant'])assert.equal(loanBrowserReadAllowed('GET',new URL(url,conversation)),false);
  assert.equal(loanBrowserReadAllowed('POST',conversation),false);assert.throws(()=>loanLocalDestination(conversation,'POST'));
  const op={actorId:'admin',kind:kinds[0],payload:{id:'record',user_id:'fixture',request_id:'request',expected_version:2},state:'uncertain',sentAt:1000};
  const result={id:'record',kind:kinds[0],version:3,summary:'Saved'},receipt={user_id:'admin',request_id:'request',kind:kinds[0],payload:op.payload,result};
  for(const status of [400,401,403,409])assert.ok(loanTerminalResponse(op,{status,body:{error:'Denied'}}));
  for(const status of [500,503])assert.equal(loanTerminalResponse(op,{status,body:{error:'Timeout'}}),false);
  assert.equal(loanTerminalResponse(op,{status:200,body:{...result,id:'foreign'}}),false);
  const recovered={...op};await loanReconcileWrites([recovered],{now:()=>2000,wait:async ms=>assert.equal(ms,29000),readReceipt:async()=>[receipt]});assert.equal(recovered.state,'reconciled');
  for(const rows of [[],[{...receipt,user_id:'other'}],[{...receipt,result:{...result,version:4}}],[{...receipt,payload:{...op.payload,user_id:'other'}}]]){
    const unresolved={...op};await assert.rejects(loanReconcileWrites([unresolved],{now:()=>40000,readReceipt:async()=>rows}));assert.equal(unresolved.state,'uncertain');}
  const item={id:null,email:'synthetic@example.invalid',creationState:'uncertain',creationSentAt:1000},created={id:'fixture',email:item.email,run:'run'};
  const recoveredUser={...item};await loanReconcileCreates([recoveredUser],{runId:'run',ownerId:'owner',now:()=>40000,lookup:async()=>[created]});assert.equal(recoveredUser.id,'fixture');
  for(const rows of [[],[{...created,id:'owner'}],[{...created,run:'other'}],[{...created,email:'other@example.invalid'}]])await assert.rejects(loanReconcileCreates([{...item}],{runId:'run',ownerId:'owner',now:()=>40000,lookup:async()=>rows}));
  assert.equal(loanCleanupAllowed({operations:[op],fixtures:[recoveredUser],inflightDrained:true}),false);
  assert.equal(loanCleanupAllowed({operations:[recovered],fixtures:[item],inflightDrained:true}),false);
  assert.equal(loanCleanupAllowed({operations:[recovered],fixtures:[recoveredUser],inflightDrained:false}),false);
  assert.ok(loanCleanupAllowed({operations:[recovered],fixtures:[recoveredUser],inflightDrained:true}));
  return {status:'passed',mode:'offline-contracts',databaseConnections:0};
}

async function run(){
  assert.deepEqual(process.argv.slice(2),['--execute'],'Live acceptance requires --execute and root lease; use --self-test offline.');process.umask(0o077);
  const origin=process.env.NATIVE_ORIGIN,mode=loanOriginMode(origin,process.env.EXPECTED_RELEASE_REVISION),local=mode==='actual_jwt_local_handlers';
  const deployment=JSON.parse(await readFile('deployment.json','utf8'));assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);assert.equal(deployment.vercel.productionUrl,'https://stu.best');
  async function boundedJson(response,signal,maxBytes=4*1024*1024){
    assert.ok(response.body&&Number(response.headers.get('content-length')||0)<=maxBytes);const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let text='',bytes=0;
    const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
    try{for(;;){signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();if(part.done)break;bytes+=part.value.byteLength;assert.ok(bytes<=maxBytes);text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}
    catch(error){void reader.cancel().catch(()=>{});throw error;}finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
  }
  let releaseRevision=null;
  if(!local){const timeout=AbortSignal.timeout(10000),response=await fetch(origin+'/release.json',{redirect:'error',credentials:'omit',cache:'no-store',signal:timeout});assert.equal(response.status,200);
    const release=await boundedJson(response,timeout,8192);assert.equal(release.revision,process.env.EXPECTED_RELEASE_REVISION);assert.equal(release.environment,'production');assert.equal(release.source,'vercel-git');releaseRevision=release.revision;}
  // Resolve credentials only after exact origin/release validation. Production
  // never imports working-tree API handlers or substitutes browser responses.
  const [{deploymentEnvironment},{createClient},{chromium},{default:postgres}]=await Promise.all([import('../../scripts/deployment-env.mjs'),import('@supabase/supabase-js'),import('playwright-core'),import('postgres')]);
  const env=deploymentEnvironment();Object.assign(process.env,env);const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;assert.equal(url,`https://${project}.supabase.co`);
  const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;let target;try{target=new URL(connection);}catch{throw new Error('Client DB connection unavailable.');}
  assert.ok(['postgres:','postgresql:'].includes(target.protocol)&&['','5432'].includes(target.port)&&target.pathname==='/postgres'&&(target.hostname===`db.${project}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+project)),'Exact client direct/session-pool connection required for advisory lock.');
  const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY,serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;assert.ok(key&&serviceKey);
  const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},runDeadline=Date.now()+10*60*1000,overall=AbortSignal.timeout(10*60*1000),leaseAbort=new AbortController();let cleaning=false,lease,sql;
  const signal=ms=>AbortSignal.any([leaseAbort.signal,AbortSignal.timeout(ms),...(cleaning?[]:[overall])]);
  const projectFetch=async(input,init={})=>{assert.equal(new URL(typeof input==='string'||input instanceof URL?input:input.url).origin,url);await lease.assertHeld();return fetch(input,{...init,redirect:'error',credentials:'omit',signal:init.signal?AbortSignal.any([init.signal,signal(20000)]):signal(20000)});};
  const admin=createClient(url,serviceKey,{auth,global:{fetch:projectFetch}}),pool=postgres(connection,{max:1,connect_timeout:15,idle_timeout:0,max_lifetime:0,onclose:()=>lease?.lose(),connection:{statement_timeout:20000},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
  const handlers=local?{'/api/affairs-data':(await import('../../api/affairs-data.ts')).default,'/api/affairs-manage':(await import('../../api/affairs-manage.ts')).default}:{};
  const runId=randomUUID(),marker='LOAN-QA-'+runId.slice(0,8),output=`artifacts/student-loan/${local?'local':'production'}-${runId}`,ledgerPath=output+'/fixture-ledger.json';
  const fixtures=[1,2,3].map(number=>({number,id:null,email:`loan-live-${randomUUID()}@example.invalid`,google:number<3}));
  const targets=[{fixture:1,label:'first'},{fixture:1,label:'collision'},{fixture:2,label:'other'},{fixture:1,label:'replacement'}].map(item=>({...item,id:randomUUID(),code:marker+'-'+item.label}));
  const ids=targets.map(item=>item.id),operations=[],successes=new Map(),checks=[],activeRequests=new Set(),accounts=()=>fixtures.flatMap(item=>item.id?[item.id]:[]);
  let ownerId,ownerBefore,ownerClient,ownerSession,browser,schemaReady=false,ledgerReady=false,phase='preflight',passed=false,failure=null;
  let httpCalls=0,browserApiCalls=0,blockedCalls=0,downloadEvents=0;
  async function ledger(state='active',cleanupFailures=[]){await writeFile(ledgerPath+'.next',JSON.stringify({runId,origin,mode,releaseRevision,state,marker,fixtures,targets,ownerId:ownerId??null,ownerFingerprint:ownerBefore??null,operations,cleanupFailures},null,2),{mode:0o600});await rename(ledgerPath+'.next',ledgerPath);}
  const fingerprint=async id=>(await sql`select u.id,md5((to_jsonb(u)-array['last_sign_in_at','updated_at'])::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(i)-array['last_sign_in_at','updated_at'] order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
  async function ownerLogin(){const file=await stat('.env.owner.local');assert.ok(file.isFile()&&(file.mode&0o077)===0);const credentials=parseEnv(await readFile('.env.owner.local','utf8'));
    assert.ok(credentials.CRM_ADMIN_EMAIL?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()&&credentials.CRM_ADMIN_PASSWORD);ownerClient=createClient(url,key,{auth,global:{fetch:projectFetch}});
    const signed=await ownerClient.auth.signInWithPassword({email:credentials.CRM_ADMIN_EMAIL,password:credentials.CRM_ADMIN_PASSWORD});ownerSession=signed.data.session;assert.ok(!signed.error&&ownerSession?.user.id===ownerId);
    const verified=await ownerClient.auth.getUser(ownerSession.access_token);assert.ok(!verified.error&&verified.data.user?.id===ownerId&&verified.data.user.email?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()&&verified.data.user.identities?.some(item=>item.provider==='google'));}
  async function invoke(endpoint,{token,method='GET',body}={}){
    if(!cleaning)overall.throwIfAborted();await lease.assertHeld();const destination=new URL(endpoint,origin);assert.equal(destination.origin,origin);assert.ok(['/api/affairs-data','/api/affairs-manage','/api/affairs-conversations'].includes(destination.pathname));
    if(destination.pathname==='/api/affairs-conversations')assert.ok(loanBrowserReadAllowed(method,destination));
    if(token&&token===ownerSession?.access_token){if(method==='GET')assert.ok(destination.pathname==='/api/affairs-data'&&destination.searchParams.get('scope')==='student-loan-admin'&&accounts().includes(destination.searchParams.get('user_id'))&&[...destination.searchParams.keys()].length===2,'Owner reads are selected fixture admin reads only.');
      else assert.ok(method==='POST'&&destination.pathname==='/api/affairs-manage'&&kinds.includes(body?.kind)&&ids.includes(body?.payload?.id)&&accounts().includes(body?.payload?.user_id)&&operations.some(op=>op.actorId===ownerId&&op.kind===body.kind&&isDeepStrictEqual(op.payload,body.payload)),'Owner writes must be exact pre-ledgered fixture operations.');}
    httpCalls++;
    if(!local){const timeout=signal(25000),response=await fetch(destination,{method,redirect:'error',credentials:'omit',cache:'no-store',headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:timeout});return {status:response.status,body:await boundedJson(response,timeout),cacheControl:response.headers.get('cache-control')};}
    const result={status:200,body:null,cacheControl:null},response={status(code){result.status=code;return response;},json(value){result.body=value;},setHeader(name,value){if(name.toLowerCase()==='cache-control')result.cacheControl=value;}};
    const resolved=loanLocalDestination(destination,method),query={};for(const name of new Set(resolved.searchParams.keys())){const values=resolved.searchParams.getAll(name);query[name]=values.length===1?values[0]:values;}
    await handlers[resolved.pathname]({method,headers:token?{authorization:'Bearer '+token}:{},query,body},response);return result;
  }
  async function request(endpoint,{status=200,...options}={}){const result=await invoke(endpoint,options);assert.equal(result.status,status,`${phase}: API status ${result.status}`);assert.match(result.cacheControl||'',/no-store/);return result.body;}
  async function verifyFixture(item){await lease.assertHeld();assert.ok(fixtures.includes(item)&&item.id&&item.id!==ownerId);const [row]=await sql`select id,email,raw_user_meta_data->>'loan_qa_run' as run from auth.users where id=${item.id}`;assert.ok(row?.id===item.id&&row.email===item.email&&row.run===runId);}
  async function createFixture(item){assert.ok(runDeadline-Date.now()>settleMs);item.creationState='pending';item.creationSentAt=Date.now();await ledger();const password=randomBytes(32).toString('base64url')+'Aa1!';
    try{const created=await admin.auth.admin.createUser({email:item.email,password,email_confirm:true,user_metadata:{full_name:'Synthetic Loan QA '+item.number,loan_qa_run:runId}});if(created.data.user){item.id=created.data.user.id;await ledger();}assert.ok(!created.error&&item.id);await verifyFixture(item);item.creationState='created';}
    finally{if(item.creationState==='pending')item.creationState='uncertain';await ledger();}
    if(item.google){item.identityState='pending';await ledger();await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at) values(${item.id},${item.id},${sql.json({sub:item.id,email:item.email,email_verified:true})},'google',now(),now(),now())`;item.identityState='created';await ledger();}
    const client=createClient(url,key,{auth,global:{fetch:projectFetch}}),signed=await client.auth.signInWithPassword({email:item.email,password});assert.ok(!signed.error&&signed.data.session?.user.id===item.id);return signed.data.session;}
  async function verifyTarget(item){assert.ok(targets.includes(item));const fixture=fixtures.find(row=>row.number===item.fixture);await verifyFixture(fixture);
    const rows=await sql`select id,user_id,source_mode,current_term_label from public.affairs_student_loan where id=${item.id}`;for(const row of rows){assert.equal(row.user_id,fixture.id);assert.equal(row.source_mode,'local_demo');assert.equal(row.current_term_label,item.code);}}
  async function save(kind,payload,{session=ownerSession,status=200}={}){
    const item=targets.find(row=>row.id===payload.id);assert.ok(item&&kinds.includes(kind)&&accounts().includes(payload.user_id));assert.ok(!session||session.user.id===ownerId||accounts().includes(session.user.id));await verifyTarget(item);
    if(kind===kinds[0])assert.equal(payload.current_term_label,item.code);assert.ok(runDeadline-Date.now()>settleMs);
    const op={actorId:session?.user.id??null,kind,payload:structuredClone(payload),sentAt:Date.now(),state:'pending'};operations.push(op);await ledger();
    const task=(async()=>{const result=await invoke('/api/affairs-manage',{method:'POST',token:session?.access_token,body:{kind,payload}});op.state=loanTerminalResponse(op,result)?'terminal':'uncertain';assert.equal(result.status,status,`${phase}: mutation status ${result.status}`);assert.match(result.cacheControl||'',/no-store/);
      if(status===200){assert.ok(loanValidReceipt(op,result.body));successes.set(op.actorId+':'+payload.request_id,{...op,result:result.body});}return result.body;})();
    activeRequests.add(task);try{return await task;}finally{activeRequests.delete(task);if(op.state==='pending')op.state='uncertain';await ledger();}
  }
  const next=payload=>({...payload,request_id:randomUUID()}),personal=async session=>parseStudentLoanSnapshot(await request('/api/affairs-data?scope=student-loan',{token:session.access_token}),session.user.id);
  const manager=async userId=>parseStudentLoanSnapshot(await request('/api/affairs-data?scope=student-loan-admin&user_id='+userId,{token:ownerSession.access_token}),userId);
  async function pageFor(session){assert.ok(accounts().includes(session.user.id)&&session.user.id!==ownerId);const context=await browser.newContext({viewport:{width:1280,height:900},locale:'zh-TW',reducedMotion:'reduce',serviceWorkers:'block'});
    await context.addInitScript(({origin,session})=>{if(window.top===window&&location.origin===origin&&!sessionStorage.getItem('loan-live-qa')){localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));sessionStorage.setItem('loan-live-qa','1');}},{origin,session});
    await context.route('**/*',async route=>{const req=route.request(),destination=new URL(req.url());
      if(leaseAbort.signal.aborted)return route.abort();
      if(![origin,url].includes(destination.origin)&&!['data:','blob:'].includes(destination.protocol)){blockedCalls++;return route.abort();}
      if(destination.origin===url||destination.origin===origin&&destination.pathname.startsWith('/api/'))try{await lease.assertHeld();}catch{return route.abort();}
      if(destination.origin===origin&&destination.pathname.startsWith('/api/')){browserApiCalls++;if(!loanBrowserReadAllowed(req.method(),destination)){blockedCalls++;return route.abort();}
        assert.ok(req.headers().authorization!=='Bearer '+ownerSession.access_token);
        if(local){const task=invoke(destination.pathname+destination.search,{method:req.method(),token:req.headers().authorization?.slice(7)});activeRequests.add(task);
          try{const result=await task;await route.fulfill({status:result.status,headers:{'Cache-Control':result.cacheControl||'no-store'},json:result.body});}finally{activeRequests.delete(task);}return;}}
      return route.continue();});
    const errors=[];context.on('page',page=>{page.setDefaultTimeout(25000);page.on('pageerror',()=>errors.push('page-error'));page.on('download',download=>{downloadEvents++;void download.cancel();});});
    const page=await context.newPage();return {context,page,errors};}
  async function ready(page){await page.locator('.student-loan main[aria-busy="false"]').waitFor();assert.equal(await page.locator('.student-loan [role="alert"]').count(),0);}
  async function notice(page,view){
    if(view==='index'){await page.getByRole('button',{name:'OK',exact:true}).click();await page.waitForURL(origin+path);return;}
    const label=view==='progress'?'1.查詢當期就學貸款進度':/^4\.歷年申請記錄/;
    await page.getByRole('link',{name:label}).click();await page.waitForURL(origin+path+'/'+view);await ready(page);await page.getByRole('dialog').waitFor();
  }
  try{
    lease=await loanReserveLease(pool,{onLost:()=>leaseAbort.abort(new Error('Loan database lease lost.'))});sql=lease.sql;
    await loanAssertNoRetainedLedgers();
    await mkdir('artifacts/student-loan',{recursive:true,mode:0o700});await mkdir(output,{mode:0o700});ledgerReady=true;await ledger();assert.equal((await stat(output)).mode&0o077,0);assert.equal((await stat(ledgerPath)).mode&0o077,0);
    const [baseline]=await sql`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,(select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls`;
    assert.deepEqual(baseline,loanExpectedSchema);assert.equal((await sql`select count(*)::int as n from supabase_migrations.schema_migrations where version in ('20261112200000','20261112210000')`)[0].n,2);
    assert.equal((await sql`select relrowsecurity from pg_class where oid='public.affairs_student_loan'::regclass`)[0].relrowsecurity,true);schemaReady=true;
    assert.equal((await sql`select count(*)::int as n from public.affairs_student_loan where id=any(${ids}::uuid[])`)[0].n,0,'Fixture record IDs must be unused.');
    assert.equal((await sql`select count(*)::int as n from public.affairs_agent_audit where target_id=any(${ids}::uuid[])`)[0].n,0,'Fixture target IDs must have no existing audits.');
    const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin' where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'An existing verified Google administrator is required; no owner repair is permitted.');ownerId=owner.id;ownerBefore=await fingerprint(ownerId);await ledger();await ownerLogin();
    phase='synthetic identities and empty read';const first=await createFixture(fixtures[0]),second=await createFixture(fixtures[1]),nonGoogle=await createFixture(fixtures[2]);
    for(const session of [first,second])assert.equal((await request('/api/affairs-data',{token:session.access_token})).profile.userId,session.user.id);
    assert.deepEqual(await personal(first),{status:'loaded',record:null});for(const token of [undefined,nonGoogle.access_token])await request('/api/affairs-data?scope=student-loan',{token,status:401});
    await request('/api/affairs-data?scope=student-loan&user_id='+second.user.id,{token:first.access_token,status:400});await request('/api/affairs-data?scope=student-loan-admin&user_id='+first.user.id,{token:second.access_token,status:403});
    browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const one=await pageFor(first),two=await pageFor(second);
    await one.page.goto(origin+path);await ready(one.page);assert.match(await one.page.locator('.student-loan-main').innerText(),/目前無法確認站內就學貸款紀錄/);
    assert.doesNotMatch(await one.page.locator('.student-loan-main').innerText(),/尚未申請|記錄\(0\)|沒有歷史/);await notice(one.page,'progress');assert.match(await one.page.locator('.student-loan-notice').textContent(),/無法確認/);await notice(one.page,'index');
    checks.push('verified-google-absent-is-unknown-and-anonymous-nonadmin-denials');
    const [mainTarget,collisionTarget,otherTarget,replacementTarget]=targets;
    const initial=loanFixturePayload(mainTarget,first.user.id),collision=loanFixturePayload(collisionTarget,first.user.id),other=loanFixturePayload(otherTarget,second.user.id,{current_application_state:'recorded',progress_text:marker+' second-account-only',history_count:3,history_text:'Synthetic separate history text'});
    phase='actual administrator singleton API writes';await save(kinds[0],initial,{session:first,status:403});await save(kinds[0],initial,{session:null,status:401});
    const firstReceipt=await save(kinds[0],initial);assert.deepEqual(await save(kinds[0],initial),firstReceipt);await save(kinds[0],other);await save(kinds[0],collision,{status:409});
    let owned=(await personal(first)).record;assert.equal(owned.id,initial.id);assert.equal(owned.currentApplicationState,'unknown');assert.equal(owned.historyCount,null);assert.equal(owned.progressText,null);
    assert.equal((await personal(second)).record.id,other.id);assert.equal((await manager(first.user.id)).record.id,initial.id);
    const rls=await projectFetch(url+'/rest/v1/affairs_student_loan?select=id,user_id&id=eq.'+initial.id,{headers:{apikey:key,Authorization:'Bearer '+second.access_token},signal:signal(20000)});assert.equal(rls.status,200);assert.deepEqual(await boundedJson(rls,signal(20000)),[]);
    const edited=next({...initial,expected_version:1,current_application_state:'recorded',current_application_text:'',progress_text:'  '+marker+' literal progress 😀  ',history_count:0,history_text:''});await save(kinds[0],edited);
    owned=(await personal(first)).record;assert.equal(owned.currentApplicationText,'');assert.equal(owned.progressText,edited.progress_text);assert.equal(owned.historyCount,0);assert.equal(owned.historyText,'');
    await save(kinds[0],next(edited),{status:409});await save(kinds[0],{...edited,history_count:1},{status:409});
    await save(kinds[0],next({...edited,expected_version:2,user_id:second.user.id}),{status:403});await save(kinds[0],next({...edited,expected_version:2,download_url:'https://example.invalid/unapproved'}),{status:400});
    checks.push('actual-jwt-admin-singleton-exact-replay-stale-immutable-owner-and-direct-rls');
    phase='saved literal browser popup navigation and mobile';await one.page.reload();await ready(one.page);await notice(one.page,'progress');assert.equal(await one.page.locator('.student-loan-notice').textContent(),edited.progress_text);await notice(one.page,'index');
    await notice(one.page,'history');assert.equal(await one.page.locator('.student-loan-notice').textContent(),'');await notice(one.page,'index');
    const documentPagePromise=one.context.waitForEvent('page');await one.page.getByRole('link',{name:'2.列印當期就學貸款資料'}).click();const documentPage=await documentPagePromise;
    await documentPage.waitForURL(origin+path+'/document');await ready(documentPage);assert.match(await documentPage.locator('.student-loan-notice').textContent(),/目前無法提供站內就學貸款文件/);
    assert.equal(await documentPage.locator('a[download],iframe,object,input[type="file"]').count(),0);assert.equal(await documentPage.evaluate(()=>window.opener),null);await documentPage.close();
    await one.page.waitForFunction(()=>{const images=[...document.querySelectorAll('.student-loan img')];return images.length>0&&images.every(image=>image.complete&&image.naturalWidth>0);});
    await notice(one.page,'progress');for(const width of [360,320]){
      await one.page.setViewportSize({width,height:900});
      const measure=()=>one.page.getByRole('dialog').evaluate(node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,x:box.x,right:box.right,width:box.width,transform:style.transform,transition:style.transitionDuration};});
      const immediate=await measure();
      await one.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const settled=await measure();
      await writeFile(output+'/viewport-'+width+'.json',JSON.stringify({requestedWidth:width,immediate,settled}),{mode:0o600});
      assert.ok(settled.scroll<=settled.viewport+1,'Settled document remains inside viewport.');
      assert.ok(settled.x>=0&&settled.right<=settled.viewport+1,'Settled loan dialog remains inside viewport.');
    }
    await two.page.goto(origin+path);await ready(two.page);await notice(two.page,'progress');assert.equal(await two.page.locator('.student-loan-notice').textContent(),other.progress_text);assert.ok(!(await two.page.locator('body').innerText()).includes(edited.progress_text.trim()));
    checks.push('literal-popup-history-blank-local-document-notice-two-account-and320-360-containment');
    phase='null versus explicit not-applied and zero history';await save(kinds[0],next({...initial,expected_version:2}));owned=(await personal(first)).record;assert.equal(owned.historyCount,null);assert.equal(owned.currentApplicationText,null);assert.equal(owned.progressText,null);assert.equal(owned.historyText,null);
    await one.page.reload();await ready(one.page);assert.doesNotMatch(await one.page.locator('body').innerText(),/尚未申請|記錄\(0\)|沒有歷史/);
    const negative=next({...initial,expected_version:3,current_application_state:'not_applied',history_count:0});await save(kinds[0],negative);await one.page.reload();await ready(one.page);
    assert.equal(await one.page.locator('.student-loan-notice').textContent(),'本學期'+initial.current_term_label+'，尚未申請就學貸款。');await notice(one.page,'index');await notice(one.page,'history');assert.equal(await one.page.locator('.student-loan-notice').textContent(),'目前沒有歷史申請記錄');
    checks.push('null-clear-remains-unknown-explicit-not-applied-and-history-zero-only');
    phase='soft delete stable receipts and new active ID';const remove=next({id:initial.id,user_id:first.user.id,expected_version:4}),removed=await save(kinds[1],remove);assert.deepEqual(await save(kinds[1],remove),removed);
    assert.deepEqual(await personal(first),{status:'loaded',record:null});assert.equal((await save(kinds[0],initial)).version,1);assert.deepEqual(await personal(first),{status:'loaded',record:null});await save(kinds[0],next({...initial,expected_version:5}),{status:409});
    const tombstone=(await sql`select version,deleted_at is not null as deleted from public.affairs_student_loan where id=${initial.id}`)[0];assert.deepEqual(tombstone,{version:5,deleted:true});
    const replacement=loanFixturePayload(replacementTarget,first.user.id,{progress_text:'  '+marker+' replacement snapshot  '});assert.equal((await save(kinds[0],replacement)).version,1);assert.equal((await personal(first)).record.id,replacement.id);
    assert.deepEqual((await sql`select count(*)::int as total,count(*) filter(where deleted_at is null)::int as active from public.affairs_student_loan where user_id=${first.user.id}`)[0],{total:2,active:1});
    await one.page.reload();await ready(one.page);assert.doesNotMatch(await one.page.locator('body').innerText(),/尚未申請|記錄\(0\)|沒有歷史/);await notice(one.page,'index');await notice(one.page,'progress');assert.equal(await one.page.locator('.student-loan-notice').textContent(),replacement.progress_text);
    // Replace only the disposable browser session; the init script cannot restore the old one.
    await one.page.evaluate(session=>localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session)),second);await one.page.reload();await ready(one.page);assert.equal(await one.page.locator('.student-loan-notice').textContent(),other.progress_text);assert.ok(!(await one.page.locator('body').innerText()).includes(replacement.progress_text.trim()));
    assert.deepEqual(one.errors,[]);assert.deepEqual(two.errors,[]);await one.context.close();await two.context.close();checks.push('terminal-delete-replay-tombstone-new-ID-and-reloaded-session-isolation');
    phase='synthetic Google identity revocation';await verifyFixture(fixtures[1]);fixtures[1].googleRevocation={state:'pending',sentAt:Date.now()};await ledger();
    const revoked=await sql`delete from auth.identities where user_id=${second.user.id} and provider='google' and provider_id=${second.user.id} returning user_id`;assert.equal(revoked.length,1);fixtures[1].googleRevocation.state='revoked';await ledger();
    await request('/api/affairs-data?scope=student-loan',{token:second.access_token,status:401});await save(kinds[0],next({...other,expected_version:1}),{session:second,status:401});
    await request('/api/affairs-data?scope=student-loan-admin&user_id='+first.user.id,{token:first.access_token,status:403});checks.push('fresh-nonadmin403-and-synthetic-google-identity-revocation-not-owner-role-revocation');
    phase='audits and owner preservation';assert.equal(successes.size,7);
    const receipts=await sql`select user_id,request_id,kind,payload,result from private.affairs_student_loan_operations where request_id=any(${operations.map(op=>op.payload.request_id)}::uuid[])`;
    assert.equal(receipts.length,successes.size);for(const receipt of receipts){const op=successes.get(receipt.user_id+':'+receipt.request_id);assert.ok(op);assert.equal(receipt.kind,op.kind);assert.deepEqual(receipt.payload,op.payload);assert.deepEqual(receipt.result,op.result);}
    assert.equal((await sql`select count(*)::int as n from public.affairs_agent_audit where target_id=any(${ids}::uuid[])`)[0].n,successes.size);assert.deepEqual(await fingerprint(ownerId),ownerBefore);
    assert.equal(blockedCalls,0);assert.equal(downloadEvents,0);checks.push('one-audit-per-receipt-and-full-owner-profile-preserved');passed=true;
  }catch(error){process.exitCode=1;failure={phase,type:error instanceof assert.AssertionError?'AssertionError':error?.name||'Error',location:String(error?.stack||'').match(/student-loan-http-live\.mjs:\d+:\d+/)?.[0]??null};console.error(JSON.stringify({status:'failed',...failure}));}
  finally{
    cleaning=true;const cleanupFailures=[];let inflightDrained=false,rowsCleaned=false;
    const clean=async(label,action)=>{try{await action();return true;}catch{cleanupFailures.push(label);return false;}};
    const leasedClean=(label,action)=>clean(label,()=>lease.withHeld(action));
    if(ledgerReady){
    await clean('browser-close',()=>browser?.close());
    await clean('inflight-drain',async()=>{let timer;try{await Promise.race([Promise.allSettled([...activeRequests]),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Requests remain active; retain fixtures.')),35000);})]);inflightDrained=true;}finally{clearTimeout(timer);}});
    if(inflightDrained)await leasedClean('uncertain-write-reconciliation',()=>loanReconcileWrites(operations,{readReceipt:op=>sql`select user_id,request_id,kind,payload,result from private.affairs_student_loan_operations where user_id=${op.actorId} and request_id=${op.payload.request_id}`}));
    await leasedClean('uncertain-auth-create-reconciliation',()=>loanReconcileCreates(fixtures,{runId,ownerId,lookup:item=>sql`select id,email,raw_user_meta_data->>'loan_qa_run' as run from auth.users where email=${item.email}`}));
    const safe=!lease.lost&&loanCleanupAllowed({operations,fixtures,inflightDrained});
    if(schemaReady&&safe)rowsCleaned=await leasedClean('exact-record-receipt-audit-cleanup',async()=>{
      for(const item of targets)if(fixtures.find(fixture=>fixture.number===item.fixture)?.id)await verifyTarget(item);
      await lease.transaction(async tx=>{
        if(operations.length){const receipts=await tx`select user_id,request_id,kind,payload,result from private.affairs_student_loan_operations where request_id=any(${operations.map(op=>op.payload.request_id)}::uuid[])`;
          for(const receipt of receipts){assert.ok(operations.some(op=>op.actorId===receipt.user_id&&op.kind===receipt.kind&&op.payload.request_id===receipt.request_id&&isDeepStrictEqual(op.payload,receipt.payload)&&loanValidReceipt(op,receipt.result)));
            await tx`delete from private.affairs_student_loan_operations where user_id=${receipt.user_id} and request_id=${receipt.request_id} and kind=${receipt.kind} and payload=${tx.json(receipt.payload)}`;}}
        for(const item of targets){const fixture=fixtures.find(row=>row.number===item.fixture);if(!fixture.id)continue;
          await tx`delete from public.affairs_student_loan where id=${item.id} and user_id=${fixture.id} and source_mode='local_demo' and current_term_label=${item.code}`;
          await tx`delete from public.affairs_agent_audit where target_id=${item.id} and user_id=any(${[ownerId,...accounts()].filter(Boolean)}::uuid[]) and action_kind=any(${kinds}::text[])`;}
      });
    });
    if(rowsCleaned&&safe)for(const item of fixtures)if(item.id)await leasedClean('fixture-account-'+item.number,async()=>{await verifyFixture(item);for(let attempt=0;attempt<3;attempt++){const result=await admin.auth.admin.deleteUser(item.id);if(!result.error||(await sql`select id from auth.users where id=${item.id}`).length===0)return;}throw new Error('Fixture deletion unresolved.');});
    if(ownerSession)await leasedClean('owner-local-signout',async()=>assert.ok(!(await ownerClient.auth.signOut({scope:'local'})).error));
    await leasedClean('exact-residue-verification',async()=>{assert.ok(safe,'Unresolved operations must retain the private ledger/fixtures.');for(const item of fixtures)assert.equal((await sql`select id from auth.users where email=${item.email}`).length,0);
      if(accounts().length)for(const [table,column] of [['auth.users','id'],['auth.identities','user_id'],['public.affairs_profiles','user_id']])assert.equal((await sql`select ${sql(column)} from ${sql(table)} where ${sql(column)}=any(${accounts()}::uuid[])`).length,0);
      if(schemaReady){assert.equal((await sql`select id from public.affairs_student_loan where id=any(${ids}::uuid[])`).length,0);assert.equal((await sql`select id from public.affairs_agent_audit where target_id=any(${ids}::uuid[])`).length,0);
        if(operations.length)assert.equal((await sql`select request_id from private.affairs_student_loan_operations where request_id=any(${operations.map(op=>op.payload.request_id)}::uuid[])`).length,0);}});
    if(ownerBefore)await leasedClean('owner-fingerprint',async()=>assert.deepEqual(await fingerprint(ownerId),ownerBefore));
    }
    if(lease)await clean('advisory-release',()=>lease.release());
    if(lease?.lost)cleanupFailures.push('database-lease-lost');
    await clean('database-close',()=>pool.end({timeout:5}));if(cleanupFailures.length)process.exitCode=1;if(ledgerReady)await ledger(cleanupFailures.length?'cleanup-required':'cleaned',cleanupFailures);
    const result={passed:passed&&!cleanupFailures.length,mode,releaseRevision,checks,httpCalls,browserApiCalls,successfulWrites:successes.size,blockedCalls,downloadEvents,cleanupVerified:cleanupFailures.length===0,cleanupFailures,failure,
      limitations:['No live administrator browser; actual owner JWT API writes only.','Synthetic Google identity revocation is not protected-owner role revocation.','No application, approval, payment, official information page, model or file capability tested.']};
    if(ledgerReady)await writeFile(output+'/result.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({...result,artifacts:ledgerReady?output:null}));
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length===3&&process.argv[2]==='--self-test')console.log(JSON.stringify(await loanOfflineChecks()));else await run();
}

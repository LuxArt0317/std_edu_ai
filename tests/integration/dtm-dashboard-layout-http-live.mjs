import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,opendir,readFile,rename,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import {dtmDashboardLayoutDefaults,parseDtmDashboardLayout,validateDtmDashboardLayoutPayload} from '../../server/dtmDashboardLayout.js';
import {dormReserveLease,dormClientTarget,dormAdvisoryLockKey,dormBrowserAuthAllowed} from './dormitory-conduct-http-live.mjs';

// Preparation only. Import and --self-test never load credentials or connect.
// --execute requires root's separate DB/release lease. No owner login, model,
// university, file or real-account write is part of this harness.
const project='xiftudmvxphxcjtmfmib',settleMs=30000;
const kinds=['save_dtm_dashboard_layout','reset_dtm_dashboard_layout'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const layoutHttpExpectedSchema=Object.freeze({migrations:133,rls:150});
export const layoutHttpAdvisoryLockKey=dormAdvisoryLockKey;
export const layoutHttpReserveLease=dormReserveLease;
export const layoutHttpClientTarget=dormClientTarget;
const derivedTables=Object.freeze(['affairs_students','affairs_enrollments','affairs_grade_items','affairs_tasks','dtm_courses','dtm_materials']);
/** postgres Result extends Array; its prototype is not evidence of leaked rows. */
export function layoutHttpAssertNoRows(rows){assert.ok(Array.isArray(rows),'Expected SQL row collection.');assert.equal(rows.length,0,'Cross-account query returned rows.');}
/** One qualified identifier, not the driver's multi-column Builder overload. */
export function layoutHttpDerivedIdentifier(sql,table){assert.ok(derivedTables.includes(table),'Unexpected derived table.');return sql('public.'+table);}
export function layoutHttpDiagnostic(error,stage){
  const names=['Error','AssertionError','PostgresError','TypeError','TimeoutError','AbortError'];
  const codes=['ERR_ASSERTION','42501','42P01','42601','42703','23503','23505','57014','53300','57P01','08006','08003'];
  return {stage:/^[a-z0-9][a-z0-9 -]{0,100}$/i.test(stage)?stage:'unknown-stage',name:names.includes(error?.name)?error.name:'Error',code:codes.includes(error?.code)?error.code:null};
}
export function layoutHttpOptions(args,env={}){
  if(args.length===1&&args[0]==='--self-test')return {selfTest:true};
  assert.deepEqual(args,['--execute'],'Use --self-test offline; --execute requires root lease.');
  const origin=env.NATIVE_ORIGIN,local=['http://127.0.0.1:5184','http://localhost:5184'].includes(origin);
  assert.ok(local||origin==='https://stu.best','Use the exact local5184 or production origin.');
  const revision=local?env.EXPECTED_SOURCE_REVISION:env.EXPECTED_RELEASE_REVISION;
  assert.match(revision||'',/^[0-9a-f]{40}$/,'Pin the reviewed source or production release revision.');
  return {selfTest:false,origin,local,revision,mode:local?'actual_jwt_local_handlers':'deployed_http'};
}
export function layoutHttpFixture(version=0,variant=0,requestId=randomUUID()){
  const blocks=dtmDashboardLayoutDefaults().blocks.map((block,index)=>({...block,visible:variant%2===0||index!==2,
    region:variant===0?'side-pre':index===0?'side-post':index===1?'content':'side-pre',weight:index-variant}));
  const command={kind:kinds[0],payload:{request_id:requestId,expected_version:version,blocks}};
  assert.equal(validateDtmDashboardLayoutPayload(command.kind,command.payload),null);return command;
}
export function layoutHttpValidReceipt(op,value){
  try{
    const result=parseDtmDashboardLayout(value),blocks=op.kind===kinds[0]?op.payload.blocks:dtmDashboardLayoutDefaults().blocks;
    return result.version===op.payload.expected_version+1&&isDeepStrictEqual(result.blocks,blocks);
  }catch{return false;}
}
export function layoutHttpTerminalResponse(op,result){
  return result.status===200?layoutHttpValidReceipt(op,result.body):[400,401,403,409].includes(result.status)&&object(result.body)&&typeof result.body.error==='string'&&Boolean(result.body.error);
}
async function settle(items,{now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  for(const item of items)assert.ok(Number.isFinite(item.sentAt));const remaining=Math.max(0,...items.map(item=>item.sentAt+settleMs-now()));
  assert.ok(remaining<=settleMs);if(remaining)await wait(remaining);
}
export async function layoutHttpReconcileWrites(operations,{readReceipt,...clock}){
  const pending=operations.filter(op=>['pending','uncertain'].includes(op.state));await settle(pending,clock);
  for(const op of pending){
    assert.ok(typeof op.actorId==='string'&&uuid.test(op.actorId),'Uncertain anonymous write must retain its ledger.');
    const rows=await readReceipt(op);assert.equal(rows.length,1,'Unresolved write; retain exact fixture ledger.');const row=rows[0];
    assert.equal(row.user_id,op.actorId);assert.equal(row.request_id,op.payload.request_id);assert.equal(row.kind,op.kind);assert.deepEqual(row.payload,op.payload);
    assert.ok(layoutHttpValidReceipt(op,row.result));op.state='reconciled';op.result=row.result;
  }
}
export async function layoutHttpReconcileCreates(fixtures,{runId,ownerId,lookup,...clock}){
  const pending=fixtures.filter(item=>['pending','uncertain'].includes(item.creationState));await settle(pending.map(item=>({sentAt:item.creationSentAt})),clock);
  for(const item of pending){const rows=await lookup(item);assert.equal(rows.length,1,'Unresolved Auth create; retain exact fixture email/run.');const row=rows[0];
    assert.equal(row.email,item.email);assert.equal(row.run,runId);assert.ok(uuid.test(row.id)&&row.id!==ownerId&&!fixtures.some(other=>other!==item&&other.id===row.id));
    if(item.id)assert.equal(item.id,row.id);item.id=row.id;item.creationState='created';}
}
export function layoutHttpCleanupAllowed({operations,directAttempts,fixtures,inflightDrained,bootstrapReads=[]}){
  return inflightDrained===true&&operations.every(op=>['terminal','reconciled'].includes(op.state))
    &&directAttempts.every(op=>op.state==='denied')&&bootstrapReads.every(op=>op.state==='complete')&&fixtures.every(item=>!item.creationState||item.creationState==='created');
}
/** Every concurrent command is durably recorded before either is dispatched. */
export async function layoutHttpDispatchBatch(commands,{prepare,persist,send}){
  const pending=[];for(const command of commands)pending.push(await prepare(command));await persist();
  return Promise.all(pending.map(op=>send(op)));
}
export function layoutHttpBrowserReadAllowed(method,url){
  if(method!=='GET')return false;
  if(url.pathname==='/api/affairs-conversations')return url.search==='';
  return url.pathname==='/api/affairs-data'&&(url.search===''||url.search==='?scope=dtm-dashboard-layout');
}
export function layoutHttpBrowserWriteAllowed(method,url,body){
  return method==='POST'&&url.pathname==='/api/affairs-action'&&url.search===''&&object(body)&&Object.keys(body).length===2
    &&Object.hasOwn(body,'kind')&&Object.hasOwn(body,'payload')&&validateDtmDashboardLayoutPayload(body.kind,body.payload)===null;
}
export function layoutHttpLocalDestination(url,method){
  if(url.pathname!=='/api/affairs-conversations')return url;
  assert.ok(layoutHttpBrowserReadAllowed(method,url));return new URL('/api/affairs-data?resource=conversations',url.origin);
}
export const layoutHttpLedgerScanLimits=Object.freeze({entries:512,runs:128,fileBytes:512*1024,totalBytes:16*1024*1024});
function cleanedLedger(value,name){
  assert.ok(object(value)&&uuid.test(value.runId)&&name.endsWith('-'+value.runId),'Malformed retained layout ledger.');
  assert.equal(value.state,'cleaned','A previous layout run requires explicit recovery.');
  const options=layoutHttpOptions(['--execute'],{NATIVE_ORIGIN:value.origin,EXPECTED_SOURCE_REVISION:value.revision,EXPECTED_RELEASE_REVISION:value.revision});
  assert.equal(value.mode,options.mode);assert.ok(name.startsWith(options.local?'local-':'production-'));
  assert.equal(value.marker,'DTM-LAYOUT-QA-'+value.runId.slice(0,8));
  assert.equal(value.cleanupVerified,true);assert.equal(value.connectionClosed,true);assert.deepEqual(value.cleanupFailures,[]);
  assert.ok(value.ownerId===null||typeof value.ownerId==='string'&&uuid.test(value.ownerId));
  assert.ok(value.ownerFingerprint===null||object(value.ownerFingerprint));
  assert.ok(Array.isArray(value.fixtures)&&value.fixtures.length===3&&Array.isArray(value.operations)&&value.operations.length<=128&&Array.isArray(value.directAttempts)&&value.directAttempts.length<=8&&Array.isArray(value.bootstrapReads)&&value.bootstrapReads.length<=40);
  const ids=new Set();for(const [index,item]of value.fixtures.entries()){
    assert.ok(object(item)&&item.number===index+1&&item.google===(index<2)&&/^dtm-layout-live-[0-9a-f-]{36}@example\.invalid$/.test(item.email));
    assert.ok(item.id===null||uuid.test(item.id)&&item.id!==value.ownerId&&!ids.has(item.id));if(item.id){assert.equal(item.creationState,'created');assert.equal(item.deletionState,'deleted');ids.add(item.id);}else assert.equal(item.creationState,undefined);
  }
  for(const read of value.bootstrapReads)assert.ok(object(read)&&ids.has(read.actorId)&&Number.isFinite(read.sentAt)&&read.state==='complete');
  for(const op of value.operations){assert.ok(object(op)&&(op.actorId===null||ids.has(op.actorId))&&kinds.includes(op.kind)&&object(op.payload)&&uuid.test(op.payload.request_id)&&Number.isFinite(op.sentAt));
    if(op.state==='reconciled'||op.status===200)assert.ok(layoutHttpValidReceipt(op,op.result));else assert.ok(op.state==='terminal'&&[400,401,403,409].includes(op.status));}
  for(const op of value.directAttempts)assert.ok(object(op)&&ids.has(op.actorId)&&['POST','PATCH','DELETE'].includes(op.method)&&Number.isFinite(op.sentAt));
  assert.ok(layoutHttpCleanupAllowed({...value,inflightDrained:true}),'Retained layout ledger has unresolved work.');
}
export async function layoutHttpAssertNoRetainedLedgers(root='artifacts/dtm-dashboard-layout',{io={lstat,opendir,open}}={}){
  let info;try{info=await io.lstat(root);}catch(error){if(error.code==='ENOENT')return {runs:0,files:0,bytes:0};throw error;}
  assert.ok(info.isDirectory()&&!info.isSymbolicLink());const directory=await io.opendir(root),counts={runs:0,files:0,bytes:0};let entries=0;
  for await(const entry of directory){
    assert.ok(++entries<=layoutHttpLedgerScanLimits.entries);if(!/^(?:local|production)-/.test(entry.name))continue;
    assert.ok(/^(?:local|production)-[0-9a-f-]{36}$/.test(entry.name)&&uuid.test(entry.name.slice(entry.name.indexOf('-')+1)));
    assert.ok(++counts.runs<=layoutHttpLedgerScanLimits.runs);const folder=join(root,entry.name),info=await io.lstat(folder);assert.ok(info.isDirectory()&&!info.isSymbolicLink());let files=0;
    for(const suffix of ['fixture-ledger.json','fixture-ledger.json.next']){
      let handle;try{handle=await io.open(join(folder,suffix),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      try{const info=await handle.stat();assert.ok(info.isFile()&&info.size>0&&info.size<=layoutHttpLedgerScanLimits.fileBytes&&counts.bytes+info.size<=layoutHttpLedgerScanLimits.totalBytes);
        const bytes=Buffer.alloc(info.size+1),read=await handle.read(bytes,0,bytes.length,0);assert.equal(read.bytesRead,info.size);
        cleanedLedger(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,read.bytesRead))),entry.name);counts.bytes+=read.bytesRead;counts.files++;files++;
      }finally{await handle.close();}
    }assert.ok(files>0,'Run directory has no recovery ledger.');
  }return counts;
}
export async function layoutHttpOfflineChecks(){
  assert.deepEqual(layoutHttpExpectedSchema,{migrations:133,rls:150});assert.deepEqual(layoutHttpAdvisoryLockKey,[23101314,115100]);
  assert.deepEqual(layoutHttpOptions(['--self-test']),{selfTest:true});assert.throws(()=>layoutHttpOptions([],{}));
  assert.equal(layoutHttpOptions(['--execute'],{NATIVE_ORIGIN:'https://stu.best',EXPECTED_RELEASE_REVISION:'a'.repeat(40)}).mode,'deployed_http');
  assert.throws(()=>layoutHttpOptions(['--execute'],{NATIVE_ORIGIN:'https://stu.best/',EXPECTED_RELEASE_REVISION:'a'.repeat(40)}));
  for(const kind of kinds){const command=kind===kinds[0]?layoutHttpFixture():{kind,payload:{request_id:randomUUID(),expected_version:0}};
    const op={actorId:randomUUID(),...command,state:'uncertain',sentAt:1000},result={version:1,blocks:command.payload.blocks??dtmDashboardLayoutDefaults().blocks,updatedAt:'2030-01-01T00:00:00.123456Z'};
    assert.ok(layoutHttpTerminalResponse(op,{status:200,body:result}));assert.equal(layoutHttpTerminalResponse(op,{status:200,body:{...result,version:2}}),false);
    assert.equal(layoutHttpTerminalResponse(op,{status:503,body:{error:'unknown'}}),false);
    await layoutHttpReconcileWrites([op],{now:()=>31000,readReceipt:async()=>[{user_id:op.actorId,request_id:op.payload.request_id,kind,payload:op.payload,result}]});assert.equal(op.state,'reconciled');
  }
  const route=new URL('https://stu.best/api/affairs-conversations');assert.equal(layoutHttpLocalDestination(route,'GET').search,'?resource=conversations');assert.equal(route.search,'');
  const rewrite=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8')).rewrites.find(rule=>rule.source==='/api/affairs-conversations');assert.equal(rewrite?.destination,'/api/affairs-data?resource=conversations');
  return {status:'passed',mode:'offline-contracts',databaseConnections:0};
}

async function boundedJson(response,signal,maxBytes=4*1024*1024){
  assert.ok(response.body&&Number(response.headers.get('content-length')||0)<=maxBytes);const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{for(;;){signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();if(part.done)break;bytes+=part.value.byteLength;assert.ok(bytes<=maxBytes);text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}
  catch(error){void reader.cancel().catch(()=>{});throw error;}finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}

// Live main is defined below; no credential or provider access occurs on import.
async function run(){
  const options=layoutHttpOptions(process.argv.slice(2),process.env);assert.equal(options.selfTest,false);process.umask(0o077);
  const {origin,local,revision,mode}=options,deployment=JSON.parse(await readFile('deployment.json','utf8'));
  assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);assert.equal(deployment.vercel.productionUrl,'https://stu.best');
  const sourcePaths=['api/affairs-data.ts','api/affairs-action.ts','server/dtmDashboardLayout.js','src/services/dtmDashboardLayout.ts','src/features/public/dtm/DtmDashboardLayout.tsx','src/features/public/dtm/DigitalMaterials.tsx'];
  const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
  async function releaseGuard(){if(local){assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),revision);return;}
    const timeout=AbortSignal.timeout(10000),response=await fetch(origin+'/release.json',{redirect:'error',credentials:'omit',cache:'no-store',signal:timeout});assert.equal(response.status,200);
    const release=await boundedJson(response,timeout,8192);assert.equal(release.revision,revision);assert.equal(release.environment,'production');assert.equal(release.source,'vercel-git');}
  await releaseGuard();const sourceBefore=local?await sourceHashes():null;
  // Importing this file never reaches credentials. Production never imports handlers.
  const [{deploymentEnvironment},{createClient},{chromium},{default:postgres}]=await Promise.all([import('../../scripts/deployment-env.mjs'),import('@supabase/supabase-js'),import('playwright-core'),import('postgres')]);
  const env=deploymentEnvironment();Object.assign(process.env,env);
  const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;assert.equal(url,`https://${project}.supabase.co`);
  const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;layoutHttpClientTarget(connection);
  const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY,serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;assert.ok(key&&serviceKey);
  const runId=randomUUID(),marker='DTM-LAYOUT-QA-'+runId.slice(0,8),output=`artifacts/dtm-dashboard-layout/${local?'local':'production'}-${runId}`,ledgerPath=output+'/fixture-ledger.json';
  const fixtures=[1,2,3].map(number=>({number,id:null,email:`dtm-layout-live-${randomUUID()}@example.invalid`,google:number<3}));
  const operations=[],directAttempts=[],bootstrapReads=[],checks=[],activeRequests=new Set(),sessions=new Map(),successes=new Map(),accounts=()=>fixtures.flatMap(item=>item.id?[item.id]:[]);
  const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},runDeadline=Date.now()+10*60*1000,overall=AbortSignal.timeout(10*60*1000),leaseAbort=new AbortController();
  let lease,sql,browser,cleaning=false,ledgerReady=false,schemaBefore,ownerId=null,ownerBefore=null,unrelatedBefore=null,phase='preflight',passed=false,failure=null,ledgerQueue=Promise.resolve();
  let httpCalls=0,browserApiCalls=0,blockedCalls=0,downloadEvents=0,browserErrors=0,connectionClosed=false,cleanupVerified=false;const cleanupFailures=[],cleanupDiagnostics=[];
  const signal=ms=>AbortSignal.any([leaseAbort.signal,AbortSignal.timeout(ms),...(cleaning?[]:[overall])]);
  const projectFetch=async(input,init={})=>{assert.equal(new URL(typeof input==='string'||input instanceof URL?input:input.url).origin,url);return lease.withHeld(()=>fetch(input,{...init,redirect:'error',credentials:'omit',signal:init.signal?AbortSignal.any([init.signal,signal(20000)]):signal(20000)}));};
  const admin=createClient(url,serviceKey,{auth,global:{fetch:projectFetch}}),pool=postgres(connection,{max:1,connect_timeout:15,idle_timeout:0,max_lifetime:0,onclose:()=>lease?.lose(),connection:{statement_timeout:20000},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
  const handlers=local?{'/api/affairs-data':(await import('../../api/affairs-data.ts')).default,'/api/affairs-action':(await import('../../api/affairs-action.ts')).default}:null;
  async function ledger(state='active'){
    const contents=JSON.stringify({runId,origin,mode,revision,state,marker,fixtures,ownerId,ownerFingerprint:ownerBefore,operations,directAttempts,bootstrapReads,cleanupVerified,connectionClosed,cleanupFailures,cleanupDiagnostics},null,2);
    assert.ok(Buffer.byteLength(contents)<=layoutHttpLedgerScanLimits.fileBytes);
    // Concurrent responses must not race a shared .next rename.
    ledgerQueue=ledgerQueue.then(async()=>{await writeFile(ledgerPath+'.next',contents,{mode:0o600});await rename(ledgerPath+'.next',ledgerPath);});await ledgerQueue;
  }
  const fingerprint=async id=>(await sql`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb)::text) from public.dtm_dashboard_layouts d where d.user_id=u.id) as layout_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.request_id),'[]'::jsonb)::text) from private.dtm_dashboard_layout_operations o where o.user_id=u.id) as receipt_hash
    from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
  const schemaState=async()=>(await sql`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls,
    (select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.version),'[]'::jsonb)::text) from supabase_migrations.schema_migrations m) as history_hash`)[0];
  const unrelated=async()=>(await sql`select
    (select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.user_id),'[]'::jsonb)::text) from public.dtm_dashboard_layouts d where not(d.user_id=any(${accounts()}::uuid[]))) as layouts,
    (select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.user_id,o.request_id),'[]'::jsonb)::text) from private.dtm_dashboard_layout_operations o where not(o.user_id=any(${accounts()}::uuid[]))) as receipts`)[0];
  function track(task){activeRequests.add(task);task.then(()=>activeRequests.delete(task),()=>activeRequests.delete(task));return task;}
  async function verifyFixture(item){assert.ok(fixtures.includes(item)&&uuid.test(item.id)&&item.id!==ownerId);const [row]=await sql`select id,email,raw_user_meta_data->>'dtm_layout_qa_run' as run from auth.users where id=${item.id}`;assert.deepEqual(row,{id:item.id,email:item.email,run:runId});}
  async function createFixture(item){assert.ok(runDeadline-Date.now()>settleMs);item.creationState='pending';item.creationSentAt=Date.now();await ledger();const password=randomBytes(32).toString('base64url')+'Aa1!';
    try{const created=await admin.auth.admin.createUser({email:item.email,password,email_confirm:true,user_metadata:{full_name:'Synthetic DTM layout QA '+item.number,dtm_layout_qa_run:runId}});if(created.data.user){item.id=created.data.user.id;await ledger();}assert.ok(!created.error&&item.id);await verifyFixture(item);item.creationState='created';}
    finally{if(item.creationState==='pending')item.creationState='uncertain';await ledger();}
    if(item.google){item.identityState='pending';await ledger();await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at) values(${item.id},${item.id},${sql.json({sub:item.id,email:item.email,email_verified:true})},'google',now(),now(),now())`;item.identityState='created';await ledger();}
    const client=createClient(url,key,{auth,global:{fetch:projectFetch}}),signed=await client.auth.signInWithPassword({email:item.email,password});assert.ok(!signed.error&&signed.data.session?.user.id===item.id);sessions.set(item.id,signed.data.session);return signed.data.session;}
  async function invoke(endpoint,{token,actorId,method='GET',body}={}){
    if(!cleaning)overall.throwIfAborted();const destination=new URL(endpoint,origin);assert.equal(destination.origin,origin);assert.ok(['/api/affairs-data','/api/affairs-action','/api/affairs-conversations'].includes(destination.pathname));
    if(token){assert.ok(accounts().includes(actorId)&&actorId!==ownerId);assert.equal(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub,actorId);}
    if(method==='POST')assert.ok(destination.pathname==='/api/affairs-action'&&kinds.includes(body?.kind)&&operations.some(op=>op.actorId===(actorId??null)&&op.kind===body.kind&&isDeepStrictEqual(op.payload,body.payload)),'Every action must be pre-ledgered.');
    if(destination.pathname==='/api/affairs-conversations')assert.ok(layoutHttpBrowserReadAllowed(method,destination));httpCalls++;
    let bootstrap;
    if(method==='GET'&&destination.pathname==='/api/affairs-data'&&destination.search===''){assert.ok(accounts().includes(actorId)&&bootstrapReads.length<40);bootstrap={actorId,sentAt:Date.now(),state:'pending'};bootstrapReads.push(bootstrap);await ledger();}
    const complete=async result=>{if(bootstrap){bootstrap.state=result.status===200&&result.body?.profile?.userId===actorId?'complete':'uncertain';await ledger();}return result;};
    if(!local){const timeout=signal(25000),response=await lease.withHeld(()=>fetch(destination,{method,redirect:'error',credentials:'omit',cache:'no-store',headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:timeout}));return complete({status:response.status,body:await boundedJson(response,timeout),cacheControl:response.headers.get('cache-control')});}
    const result={status:200,body:null,cacheControl:null},response={status(code){result.status=code;return response;},json(value){result.body=value;},setHeader(name,value){if(name.toLowerCase()==='cache-control')result.cacheControl=value;}};
    const resolved=layoutHttpLocalDestination(destination,method),query={};for(const name of new Set(resolved.searchParams.keys())){const values=resolved.searchParams.getAll(name);query[name]=values.length===1?values[0]:values;}
    await lease.withHeld(()=>handlers[resolved.pathname]({method,headers:token?{authorization:'Bearer '+token}:{},query,body},response));return complete(result);
  }
  async function request(endpoint,session,status=200){const result=await track(invoke(endpoint,{token:session?.access_token,actorId:session?.user.id}));assert.equal(result.status,status,`${phase}: read status`);assert.match(result.cacheControl||'',/no-store/);return result.body;}
  const personal=async session=>parseDtmDashboardLayout(await request('/api/affairs-data?scope=dtm-dashboard-layout',session));
  async function prepare(command,actorId){assert.ok(runDeadline-Date.now()>settleMs&&operations.length<128&&(!actorId||accounts().includes(actorId))&&kinds.includes(command.kind));
    const op={actorId:actorId??null,kind:command.kind,payload:structuredClone(command.payload),sentAt:Date.now(),state:'pending'};operations.push(op);return op;}
  async function send(op,token){const task=(async()=>{try{const result=await invoke('/api/affairs-action',{method:'POST',token,actorId:op.actorId,body:{kind:op.kind,payload:op.payload}});op.state=layoutHttpTerminalResponse(op,result)?'terminal':'uncertain';op.status=result.status;
      assert.match(result.cacheControl||'',/no-store/);if(result.status===200){assert.ok(layoutHttpValidReceipt(op,result.body));op.result=result.body;successes.set(op.actorId+':'+op.payload.request_id,op);}return result;
    }finally{if(op.state==='pending')op.state='uncertain';await ledger();}})();return track(task);}
  async function action(session,command,status=200){const op=await prepare(command,session?.user.id);await ledger();const result=await send(op,session?.access_token);assert.equal(result.status,status,`${phase}: action status`);return result.body;}
  const reset=version=>({kind:kinds[1],payload:{request_id:randomUUID(),expected_version:version}});
  const concurrent=(session,commands)=>layoutHttpDispatchBatch(commands,{prepare:command=>prepare(command,session.user.id),persist:()=>ledger(),send:op=>send(op,session.access_token)});
  async function rest(session,method,target,body){assert.ok(accounts().includes(session.user.id)&&target===session.user.id||method==='GET'&&accounts().includes(target));
    const op=method==='GET'?null:{actorId:session.user.id,method,sentAt:Date.now(),state:'pending'};if(op){assert.ok(directAttempts.length<8);directAttempts.push(op);await ledger();}
    try{const timeout=signal(20000),response=await projectFetch(url+'/rest/v1/dtm_dashboard_layouts?select=user_id,version&user_id=eq.'+target,{method,headers:{apikey:key,Authorization:'Bearer '+session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:timeout});
      if(op){assert.ok([401,403].includes(response.status),'Authenticated raw writes must be denied.');op.state='denied';await response.body?.cancel();return;}
      assert.equal(response.status,200);return boundedJson(response,timeout);
    }finally{if(op){if(op.state==='pending')op.state='uncertain';await ledger();}}}
  async function pageFor(session){assert.ok(accounts().includes(session.user.id)&&session.user.id!==ownerId);const context=await browser.newContext({viewport:{width:1280,height:900},locale:'en',reducedMotion:'reduce',serviceWorkers:'block'});
    await context.addInitScript(({origin,session})=>{if(window.top===window&&location.origin===origin&&!sessionStorage.getItem('layout-live-qa')){localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));localStorage.setItem('stu-dtm-language','en');sessionStorage.setItem('layout-live-qa','1');}},{origin,session});
    await context.route('**/*',route=>track((async()=>{const req=route.request(),destination=new URL(req.url());
      if(leaseAbort.signal.aborted)return route.abort();
      if(![origin,url].includes(destination.origin)&&!['data:','blob:'].includes(destination.protocol)){blockedCalls++;return route.abort();}
      if(destination.origin===url){if(!dormBrowserAuthAllowed(req.method(),destination)){blockedCalls++;return route.abort();}return lease.withHeld(()=>route.continue());}
      if(destination.origin===origin&&destination.pathname.startsWith('/api/')){
        browserApiCalls++;const token=req.headers().authorization?.slice(7);let body;try{body=req.postData()?JSON.parse(req.postData()):undefined;}catch{blockedCalls++;return route.abort();}
        if(!layoutHttpBrowserReadAllowed(req.method(),destination)&&!layoutHttpBrowserWriteAllowed(req.method(),destination,body)){blockedCalls++;return route.abort();}
        let result;if(req.method()==='POST'){const op=await prepare(body,session.user.id);await ledger();result=await send(op,token);}
        else result=await invoke(destination.pathname+destination.search,{method:req.method(),token,actorId:session.user.id});
        // In production invoke fetches the real deployed endpoint. Only local
        // mode dispatches reviewed working-tree handlers; neither mode mocks data.
        await route.fulfill({status:result.status,headers:{'Cache-Control':result.cacheControl||'no-store'},json:result.body});return;
      }
      return route.continue();
    })().catch(async()=>{browserErrors++;try{await route.abort();}catch{/* Context may already be closed. */}})));
    context.on('page',page=>{page.setDefaultTimeout(25000);page.on('pageerror',()=>browserErrors++);page.on('download',download=>{downloadEvents++;void download.cancel();});});
    return {context,page:await context.newPage()};
  }
  async function ready(page){await page.getByRole('button',{name:'Customize this page',exact:true}).waitFor();await page.waitForFunction(()=>{const control=[...document.querySelectorAll('.dtm-dashboard-customize button')].find(button=>button.textContent==='Customize this page');return control&&!control.disabled;});assert.equal(await page.locator('.dtm-dashboard-layout [role="alert"]').count(),0);}
  async function blockState(page,expected){await ready(page);const selectors={important:'.dtm-important-information',navigation:'.dtm-navigation',contacts:'.dtm-contacts'},regions={'side-pre':'.dtm-left','side-post':'.dtm-dashboard-right',content:'.dtm-center'};
    await page.waitForFunction(({blocks,selectors,regions})=>blocks.every(block=>{const all=document.querySelectorAll(selectors[block.id]);return block.visible?all.length===1&&document.querySelectorAll(regions[block.region]+' '+selectors[block.id]).length===1:all.length===0;}),{blocks:expected.blocks,selectors,regions});
    for(const block of expected.blocks){const locator=page.locator(selectors[block.id]);assert.equal(await locator.count(),block.visible?1:0);if(block.visible)assert.equal(await page.locator(regions[block.region]+' '+selectors[block.id]).count(),1);}}
  async function clickWrite(page,action){const response=page.waitForResponse(item=>new URL(item.url()).pathname==='/api/affairs-action'&&item.request().method()==='POST');await action();const received=await response;assert.equal(received.status(),200);return parseDtmDashboardLayout(await received.json());}
  async function configure(page,title){await page.getByRole('button',{name:'Customize this page',exact:true}).click();await page.getByLabel(title+' block actions',{exact:true}).click();await page.getByRole('button',{name:'Configure '+title+' block',exact:true}).click();await page.getByRole('button',{name:'On this page',exact:true}).click();}
  // Only initializer-created dependent IDs are retained (never row contents).
  async function derivedInventory(){return (await sql`select
    (select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.affairs_students where user_id=any(${accounts()}::uuid[])) as students,
    (select coalesce(jsonb_agg(e.id order by e.id),'[]'::jsonb) from public.affairs_enrollments e join public.affairs_students s on s.id=e.student_id where s.user_id=any(${accounts()}::uuid[])) as enrollments,
    (select coalesce(jsonb_agg(g.id order by g.id),'[]'::jsonb) from public.affairs_grade_items g join public.affairs_enrollments e on e.id=g.enrollment_id join public.affairs_students s on s.id=e.student_id where s.user_id=any(${accounts()}::uuid[])) as grades,
    (select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.affairs_tasks where user_id=any(${accounts()}::uuid[])) as tasks,
    (select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.dtm_courses where user_id=any(${accounts()}::uuid[])) as courses,
    (select coalesce(jsonb_agg(m.id order by m.id),'[]'::jsonb) from public.dtm_materials m join public.dtm_courses c on c.id=m.course_id where c.user_id=any(${accounts()}::uuid[])) as materials`)[0];}
  async function assertDerivedAbsent(ids){for(const [name,table]of Object.entries({students:'affairs_students',enrollments:'affairs_enrollments',grades:'affairs_grade_items',tasks:'affairs_tasks',courses:'dtm_courses',materials:'dtm_materials'})){
    assert.ok(Array.isArray(ids[name])&&ids[name].length<=100&&ids[name].every(id=>uuid.test(id)));assert.equal((await sql`select count(*)::int as n from ${layoutHttpDerivedIdentifier(sql,table)} where id=any(${ids[name]}::uuid[])`)[0].n,0);}}
  async function receiptProof(){const rows=await sql`select user_id,request_id,kind,payload,result from private.dtm_dashboard_layout_operations where user_id=any(${accounts()}::uuid[]) order by user_id,request_id`;
    assert.equal(rows.length,successes.size);for(const row of rows){const op=successes.get(row.user_id+':'+row.request_id);assert.ok(op);assert.equal(row.kind,op.kind);assert.deepEqual(row.payload,op.payload);assert.deepEqual(row.result,op.result);}return rows;}
  try{
    lease=await layoutHttpReserveLease(pool,{onLost:()=>{leaseAbort.abort(new Error('Layout physical lease lost.'));if(browser)void browser.close().catch(()=>{});}});sql=lease.sql;
    await layoutHttpAssertNoRetainedLedgers();await mkdir('artifacts/dtm-dashboard-layout',{recursive:true,mode:0o700});await mkdir(output,{mode:0o700});ledgerReady=true;await ledger();
    assert.equal((await stat(output)).mode&0o077,0);assert.equal((await stat(ledgerPath)).mode&0o077,0);
    schemaBefore=await schemaState();assert.deepEqual({migrations:schemaBefore.migrations,rls:schemaBefore.rls},layoutHttpExpectedSchema);
    assert.equal((await sql`select count(*)::int as n from supabase_migrations.schema_migrations where version in ('20261112220000','20261113230000')`)[0].n,2);
    const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin' where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'Existing verified Google administrator required; never repair/promote owner.');ownerId=owner.id;ownerBefore=await fingerprint(ownerId);unrelatedBefore=await unrelated();await ledger();
    phase='synthetic identities and default reads';const first=await createFixture(fixtures[0]),second=await createFixture(fixtures[1]),nonGoogle=await createFixture(fixtures[2]);
    for(const session of [first,second])assert.deepEqual(await personal(session),dtmDashboardLayoutDefaults());
    assert.equal((await sql`select count(*)::int as n from public.dtm_dashboard_layouts where user_id=any(${accounts()}::uuid[])`)[0].n,0);
    for(const session of [undefined,nonGoogle]){await request('/api/affairs-data?scope=dtm-dashboard-layout',session,401);await action(session,layoutHttpFixture(),401);}
    for(const suffix of ['&user_id='+second.user.id,'&scope=dtm-dashboard-layout','&unknown=1'])await request('/api/affairs-data?scope=dtm-dashboard-layout'+suffix,first,400);
    await request('/api/affairs-data?scope=dtm-dashboard-layout-admin',first,400);checks.push('successful-absent-read-only-canonical-defaults-strict-own-scope-anonymous-and-nongoogle-denials');
    phase='exact receipts and concurrent CAS';const initial=layoutHttpFixture(0,1),a1=await action(first,initial),b1=await action(second,layoutHttpFixture(0,2,initial.payload.request_id));assert.equal(a1.version,1);assert.equal(b1.version,1);
    assert.deepEqual(await action(first,initial),a1);await action(first,{...initial,payload:{...initial.payload,blocks:dtmDashboardLayoutDefaults().blocks}},409);await action(first,layoutHttpFixture(0,2),409);
    const duplicate=layoutHttpFixture(1,2),duplicates=await concurrent(first,[duplicate,duplicate]);assert.deepEqual(duplicates.map(row=>row.status),[200,200]);assert.deepEqual(duplicates[0].body,duplicates[1].body);assert.equal(duplicates[0].body.version,2);
    const competing=await concurrent(first,[layoutHttpFixture(2,1),layoutHttpFixture(2,3)]);assert.deepEqual(competing.map(row=>row.status).sort(),[200,409]);assert.deepEqual(await personal(first),competing.find(row=>row.status===200).body);
    const mixed=await concurrent(first,[layoutHttpFixture(3,2),reset(3)]);assert.deepEqual(mixed.map(row=>row.status).sort(),[200,409]);assert.deepEqual(await personal(first),mixed.find(row=>row.status===200).body);
    const a5=await action(first,reset(4));assert.equal(a5.version,5);assert.deepEqual(a5.blocks,dtmDashboardLayoutDefaults().blocks);assert.deepEqual(await action(first,initial),a1);assert.deepEqual(await personal(first),a5);
    const a6=await action(first,reset(5));assert.equal(a6.version,6);assert.deepEqual(a6.blocks,dtmDashboardLayoutDefaults().blocks);assert.deepEqual(await personal(second),b1);
    await receiptProof();checks.push('actual-jwt-save-reload-reset-exact-and-late-receipts-owner-scoped-request-id-and-three-real-concurrent-cas-interleavings');
    phase='direct ACL and administrator cannot read another layout';assert.deepEqual(await rest(first,'GET',first.user.id),[{user_id:first.user.id,version:6}]);assert.deepEqual(await rest(second,'GET',first.user.id),[]);assert.deepEqual(await rest(nonGoogle,'GET',first.user.id),[]);
    for(const method of ['POST','PATCH','DELETE'])await rest(first,method,first.user.id,method==='POST'?{user_id:first.user.id,version:7,blocks:dtmDashboardLayoutDefaults().blocks}:method==='PATCH'?{version:7}:undefined);
    await lease.transaction(async tx=>{await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:ownerId,role:'authenticated'})},true)`;await tx`set local role authenticated`;
      try{layoutHttpAssertNoRows(await tx`select user_id from public.dtm_dashboard_layouts where user_id=any(${accounts()}::uuid[])`);}finally{await tx`reset role`;}});
    assert.deepEqual(await personal(first),a6);checks.push('own-select-cross-account-and-nongoogle-rls-raw-write-denials-existing-admin-read-only-no-cross-account-override');
    phase='actual browser persistence';browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const one=await pageFor(first),two=await pageFor(second);
    await one.page.goto(origin+'/dtm/my');await blockState(one.page,a6);await two.page.goto(origin+'/dtm/dashboard');await blockState(two.page,b1);
    await configure(one.page,'Important information');await one.page.getByLabel('Region',{exact:true}).selectOption('side-post');await one.page.getByLabel('Weight',{exact:true}).selectOption('-5');
    const moved=await clickWrite(one.page,()=>one.page.getByRole('button',{name:'Save changes',exact:true}).click());assert.equal(moved.version,7);assert.deepEqual(moved.blocks.find(row=>row.id==='important'),{id:'important',visible:true,region:'side-post',weight:-5});
    await one.page.getByLabel('Contacts block actions',{exact:true}).click();const hidden=await clickWrite(one.page,()=>one.page.getByRole('button',{name:'Hide Contacts block',exact:true}).click());
    await one.page.getByRole('button',{name:'Stop customizing this page',exact:true}).click();await blockState(one.page,hidden);await one.page.goto(origin+'/dtm/dashboard');await blockState(one.page,hidden);assert.deepEqual(await personal(first),hidden);
    await two.page.reload();await blockState(two.page,b1);
    for(const width of [390,320]){await one.page.setViewportSize({width,height:900});await one.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.ok(await one.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await blockState(one.page,hidden);}
    await configure(one.page,'Navigation');assert.ok(await one.page.evaluate(()=>{const box=document.querySelector('.dtm-dashboard-config').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&box.left>=0&&box.right<=innerWidth+1;}));await one.page.getByRole('button',{name:'Cancel',exact:true}).click();
    const restored=await clickWrite(one.page,()=>one.page.getByRole('button',{name:'Reset page to default',exact:true}).click());assert.deepEqual(restored.blocks,dtmDashboardLayoutDefaults().blocks);assert.equal(restored.version,hidden.version+1);
    await one.page.getByRole('button',{name:'Stop customizing this page',exact:true}).click();await one.page.goto(origin+'/dtm/my');await blockState(one.page,restored);assert.deepEqual(await personal(first),restored);
    await two.page.reload();await blockState(two.page,b1);await receiptProof();assert.equal(blockedCalls,0);assert.equal(downloadEvents,0);assert.equal(browserErrors,0);
    checks.push('both-dashboard-aliases-browser-configure-hide-reset-reload-two-account-isolation390-and320-containment');
    await releaseGuard();if(local)assert.deepEqual(await sourceHashes(),sourceBefore);passed=true;
  }catch(error){failure={phase,...layoutHttpDiagnostic(error,phase)};process.exitCode=1;}
  finally{
    cleaning=true;let inflightDrained=false,rowsCleaned=false,derived;
    const clean=async(label,action)=>{try{await action();return true;}catch(error){cleanupFailures.push(label);if(cleanupDiagnostics.length<24)cleanupDiagnostics.push(layoutHttpDiagnostic(error,label));return false;}};
    const leasedClean=(label,action)=>clean(label,()=>lease.withHeld(action));
    if(ledgerReady){
      await clean('browser-close',()=>browser?.close());
      await clean('inflight-drain',async()=>{let timer;try{await Promise.race([Promise.allSettled([...activeRequests]),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Pending operations')),35000);})]);assert.equal(activeRequests.size,0);inflightDrained=true;}finally{clearTimeout(timer);}});
      if(inflightDrained)await leasedClean('uncertain-write-reconciliation',()=>layoutHttpReconcileWrites(operations,{readReceipt:op=>sql`select user_id,request_id,kind,payload,result from private.dtm_dashboard_layout_operations where user_id=${op.actorId} and request_id=${op.payload.request_id}`}));
      await leasedClean('uncertain-auth-create-reconciliation',()=>layoutHttpReconcileCreates(fixtures,{runId,ownerId,lookup:item=>sql`select id,email,raw_user_meta_data->>'dtm_layout_qa_run' as run from auth.users where email=${item.email}`}));
      const safe=!lease.lost&&layoutHttpCleanupAllowed({operations,directAttempts,fixtures,inflightDrained,bootstrapReads});
      if(safe&&accounts().length)rowsCleaned=await leasedClean('exact-layout-and-receipt-cleanup',async()=>{
        for(const item of fixtures)if(item.id)await verifyFixture(item);derived=await derivedInventory();
        // Lost responses can be proven by durable exact receipts. No broad request-ID deletion.
        for(const op of operations)if(op.result)successes.set(op.actorId+':'+op.payload.request_id,op);
        const receipts=await receiptProof();await lease.transaction(async tx=>{
          for(const row of receipts)await tx`delete from private.dtm_dashboard_layout_operations where user_id=${row.user_id} and request_id=${row.request_id}`;
          await tx`delete from public.dtm_dashboard_layouts where user_id=any(${accounts()}::uuid[])`;
        });
      });
      if(safe&&(!accounts().length||rowsCleaned))for(const item of fixtures)if(item.id)await leasedClean('exact-fixture-auth-delete-'+item.number,async()=>{
        await verifyFixture(item);item.deletionState='pending';await ledger();
        for(let attempt=0;attempt<3;attempt++){try{await admin.auth.admin.deleteUser(item.id);}catch{/* Prove absence before deciding whether a retry is needed. */}
          if(!(await sql`select id from auth.users where id=${item.id}`).length){item.deletionState='deleted';await ledger();return;}}
        assert.fail('Exact fixture deletion not verified.');
      });
      if(safe)await leasedClean('exact-residue-proof',async()=>{
        assert.equal((await sql`select count(*)::int as n from auth.users where id=any(${accounts()}::uuid[]) or email=any(${fixtures.map(item=>item.email)}::text[])`)[0].n,0);
        assert.equal((await sql`select count(*)::int as n from auth.identities where user_id=any(${accounts()}::uuid[])`)[0].n,0);
        assert.equal((await sql`select count(*)::int as n from public.affairs_profiles where user_id=any(${accounts()}::uuid[])`)[0].n,0);
        assert.equal((await sql`select count(*)::int as n from public.dtm_dashboard_layouts where user_id=any(${accounts()}::uuid[])`)[0].n,0);
        assert.equal((await sql`select count(*)::int as n from private.dtm_dashboard_layout_operations where user_id=any(${accounts()}::uuid[])`)[0].n,0);if(derived)await assertDerivedAbsent(derived);
      });else cleanupFailures.push('unresolved-fixture-ledger');
      if(ownerBefore)await leasedClean('protected-owner-fingerprint',async()=>assert.deepEqual(await fingerprint(ownerId),ownerBefore));
      if(unrelatedBefore)await leasedClean('unrelated-layouts-and-receipts',async()=>assert.deepEqual(await unrelated(),unrelatedBefore));
      if(schemaBefore)await leasedClean('unchanged-schema-history',async()=>assert.deepEqual(await schemaState(),schemaBefore));
    }
    if(lease)await clean('advisory-release',()=>lease.release());if(lease?.lost)cleanupFailures.push('physical-session-lost');
    connectionClosed=await clean('database-close',()=>pool.end({timeout:5}));cleanupVerified=cleanupFailures.length===0;passed=passed&&cleanupVerified;if(!passed)process.exitCode=1;
    if(ledgerReady)await ledger(cleanupVerified?'cleaned':'cleanup-required');
    const result={passed,mode,revision,sourceHashes:sourceBefore,checks,httpCalls,browserApiCalls,successfulWrites:successes.size,blockedCalls,downloadEvents,browserErrors,cleanupVerified,connectionClosed,cleanupFailures,cleanupDiagnostics,failure,
      limitations:['No owner login or owner browser; administrator cross-account denial uses transaction-local read-only SQL role claims.','Only three built-in layout blocks; no HTML, files, official system, assistant/model, or administrator writes.'],artifacts:ledgerReady?output:null};
    if(ledgerReady)await writeFile(output+'/result.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length===3&&process.argv[2]==='--self-test')console.log(JSON.stringify(await layoutHttpOfflineChecks()));else await run();
}

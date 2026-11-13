import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,opendir,readFile,realpath,rename,stat,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dtmCourseResourceMaxResponseBytes,parseDtmCourseResourceData,validateDtmMaterialTargetUrl} from '../../server/dtmCourseResource.js';
import {dormReserveLease,dormClientTarget} from './dormitory-conduct-http-live.mjs';
import {layoutHttpDiagnostic,layoutHttpReconcileCreates} from './dtm-dashboard-layout-http-live.mjs';

// PREPARED ONLY. Root must authorize --execute under the sole live DB lease.
// Local mode invokes the actual handlers with real fixture JWTs; production
// mode calls the pinned deployed HTTP release. No owner login, browser, model,
// university request, destination fetch, Storage access or schema mutation.
const clientRoot='/Users/winsonbaring/Documents/GitHub/std_edu_ai-luxart0317',project='xiftudmvxphxcjtmfmib';
const kinds=['save_dtm_course','delete_dtm_course','save_dtm_material','delete_dtm_material'];
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const ledgerLimits=Object.freeze({entries:256,runs:64,fileBytes:256*1024,totalBytes:8*1024*1024});
export const resourceHttpExpectedSchema=Object.freeze({migrations:136,rls:152});
export function resourceHttpOptions(args,env={}){
  if(args.length===1&&args[0]==='--self-test')return {selfTest:true};
  assert.deepEqual(args,['--execute'],'Only --self-test is permitted without the root live lease.');
  const origin=env.NATIVE_ORIGIN,local=['http://127.0.0.1:5184','http://localhost:5184'].includes(origin);
  assert.ok(local||origin==='https://stu.best');const revision=local?env.EXPECTED_SOURCE_REVISION:env.EXPECTED_RELEASE_REVISION;
  assert.match(revision||'',/^[0-9a-f]{40}$/);return {selfTest:false,origin,local,revision,mode:local?'actual_jwt_local_handlers':'deployed_http'};
}
export function resourceHttpWriteAllowed(kind,payload,scope){
  if(!kinds.includes(kind)||!payload||typeof payload!=='object'||Array.isArray(payload)||!uuid(payload.id))return false;
  if(kind.endsWith('_course'))return scope.courses.some(row=>row.id===payload.id)&&Object.keys(payload).every(key=>['id','code','title','term'].includes(key));
  return scope.materials.some(row=>row.id===payload.id)&&scope.courses.some(row=>row.id===payload.course_id)
    &&Object.keys(payload).every(key=>['id','course_id','title','kind','summary','source_url','target_url'].includes(key));
}
export function resourceHttpValidReceipt(op,value){
  return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')==='id,imported,kind'
    &&value.id===op.payload.id&&value.kind===op.kind&&value.imported===0);
}
export function resourceHttpTerminal(op,result){
  return result.status===200?resourceHttpValidReceipt(op,result.body):[400,401,403,409].includes(result.status)&&typeof result.body?.error==='string'&&Boolean(result.body.error);
}
export function resourceHttpCleanupAllowed({operations,fixtures,drained}){
  // Legacy dtm_manage_record has no request ID or durable replay receipt.
  // A transport/503 ambiguity must retain the exact ledger for manual recovery.
  return drained===true&&operations.every(op=>op.state==='terminal')&&fixtures.every(item=>!item.creationState||item.creationState==='created');
}
export function resourceHttpDiagnostic(error,stage){
  const result=layoutHttpDiagnostic(error,stage),line=/dtm-course-resource-http-live\.mjs:(\d+):\d+/.exec(error?.stack??'');
  return {...result,...(line?{line:Number(line[1])}:{})};
}
export function resourceHttpCleanedLedger(value,folder){
  assert.ok(value&&uuid(value.runId));const local=folder.startsWith('local-');assert.equal(folder,(local?'local-':'production-')+value.runId);
  const options=resourceHttpOptions(['--execute'],{NATIVE_ORIGIN:value.origin,EXPECTED_SOURCE_REVISION:value.revision,EXPECTED_RELEASE_REVISION:value.revision});
  assert.equal(options.local,local);assert.equal(value.mode,options.mode);assert.equal(value.state,'cleaned');assert.equal(value.cleanupVerified,true);assert.equal(value.connectionClosed,true);assert.deepEqual(value.cleanupFailures,[]);
  assert.ok(value.ownerId===null||uuid(value.ownerId));assert.ok(Array.isArray(value.fixtures)&&value.fixtures.length===3&&Array.isArray(value.operations)&&value.operations.length<=64);
  const ids=new Set();for(const [index,item]of value.fixtures.entries()){
    assert.equal(item.number,index+1);assert.equal(item.google,index<2);assert.match(item.email,/^dtm-resource-http-[0-9a-f-]{36}@example\.invalid$/);
    if(item.id){assert.ok(uuid(item.id)&&item.id!==value.ownerId&&!ids.has(item.id));ids.add(item.id);assert.equal(item.creationState,'created');assert.equal(item.deletionState,'deleted');}
    else{assert.equal(item.id,null);assert.equal(item.creationState,undefined);}
  }
  assert.ok(Array.isArray(value.courses)&&value.courses.length===3&&new Set(value.courses.map(row=>row.id)).size===3);
  for(const [index,row]of value.courses.entries()){assert.ok(uuid(row.id));assert.equal(row.fixture,index===2?2:1);}
  assert.ok(Array.isArray(value.materials)&&value.materials.length===3&&new Set(value.materials.map(row=>row.id)).size===3);
  for(const [index,row]of value.materials.entries()){assert.ok(uuid(row.id));assert.equal(row.courseId,value.courses[index===2?2:0].id);}
  for(const op of value.operations){assert.ok(op.actorId===null||ids.has(op.actorId));assert.ok(Number.isFinite(op.sentAt));assert.equal(op.state,'terminal');assert.ok(resourceHttpWriteAllowed(op.kind,op.payload,value));
    if(op.status===200)assert.ok(resourceHttpValidReceipt(op,op.result));else assert.ok([400,401,403,409].includes(op.status));}
  assert.ok(resourceHttpCleanupAllowed({...value,drained:true}));
}
export async function resourceHttpAssertNoRetainedLedgers(root='artifacts/dtm-course-resource-http',io={lstat,opendir,open}){
  let info;try{info=await io.lstat(root);}catch(error){if(error.code==='ENOENT')return;throw error;}assert.ok(info.isDirectory()&&!info.isSymbolicLink());
  let entries=0,runs=0,bytes=0;
  for await(const entry of await io.opendir(root)){
    assert.ok(++entries<=ledgerLimits.entries);if(!/^(?:local|production)-/.test(entry.name))continue;
    const runId=entry.name.slice(entry.name.indexOf('-')+1);assert.ok(uuid(runId)&&++runs<=ledgerLimits.runs);const directory=join(root,entry.name),folder=await io.lstat(directory);assert.ok(folder.isDirectory()&&!folder.isSymbolicLink());let found=0;
    for(const suffix of ['fixture-ledger.json','fixture-ledger.json.next']){let handle;try{handle=await io.open(join(directory,suffix),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      try{const meta=await handle.stat();assert.ok(meta.isFile()&&meta.size>0&&meta.size<=ledgerLimits.fileBytes&&bytes+meta.size<=ledgerLimits.totalBytes);const buffer=Buffer.alloc(meta.size+1),result=await handle.read(buffer,0,buffer.length,0);assert.equal(result.bytesRead,meta.size);bytes+=meta.size;found++;
        const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,result.bytesRead)));assert.equal(value.runId,runId);resourceHttpCleanedLedger(value,entry.name);
      }finally{await handle.close();}}
    assert.ok(found,'Retained run is missing its recovery ledger.');
  }
}
async function boundedJson(response,signal,maxBytes=dtmCourseResourceMaxResponseBytes){
  assert.ok(response.body&&Number(response.headers.get('content-length')||0)<=maxBytes);const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{for(;;){signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();if(part.done)break;bytes+=part.value.byteLength;assert.ok(bytes<=maxBytes);text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}
  catch(error){void reader.cancel().catch(()=>{});throw error;}finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}
export async function resourceHttpOfflineChecks(){
  assert.deepEqual(resourceHttpOptions(['--self-test']),{selfTest:true});assert.throws(()=>resourceHttpOptions([],{}));assert.throws(()=>resourceHttpOptions(['--execute'],{NATIVE_ORIGIN:'https://stu.best/'}));
  assert.equal(resourceHttpOptions(['--execute'],{NATIVE_ORIGIN:'https://stu.best',EXPECTED_RELEASE_REVISION:'a'.repeat(40)}).mode,'deployed_http');
  dormClientTarget(`postgres://postgres@db.${project}.supabase.co/postgres`);assert.throws(()=>dormClientTarget(`postgres://postgres.${project}@qa.pooler.supabase.com:6543/postgres`));
  const runId=randomUUID(),courses=[1,1,2].map(fixture=>({id:randomUUID(),fixture})),materials=[0,0,2].map(index=>({id:randomUUID(),courseId:courses[index].id}));
  const fixtures=[1,2,3].map(number=>({number,id:null,google:number<3,email:`dtm-resource-http-${randomUUID()}@example.invalid`}));
  const payload={id:materials[0].id,course_id:courses[0].id,title:'Synthetic resource',kind:'page',summary:'',target_url:'https://example.org/resource'};
  const op={actorId:randomUUID(),kind:'save_dtm_material',payload,sentAt:1,state:'pending'};
  assert.ok(resourceHttpWriteAllowed(op.kind,payload,{courses,materials}));assert.equal(resourceHttpWriteAllowed(op.kind,{...payload,id:randomUUID()},{courses,materials}),false);
  assert.equal(resourceHttpWriteAllowed(op.kind,{...payload,course_id:randomUUID()},{courses,materials}),false);assert.equal(resourceHttpWriteAllowed('create_task',payload,{courses,materials}),false);
  assert.equal(resourceHttpWriteAllowed(op.kind,{...payload,user_id:randomUUID()},{courses,materials}),false);
  const receipt={id:payload.id,kind:op.kind,imported:0};assert.ok(resourceHttpTerminal(op,{status:200,body:receipt}));
  assert.equal(resourceHttpTerminal(op,{status:200,body:{...receipt,id:randomUUID()}}),false);assert.equal(resourceHttpTerminal(op,{status:503,body:{error:'Unavailable'}}),false);
  assert.ok(resourceHttpTerminal(op,{status:400,body:{error:'Invalid destination'}}));
  for(const state of ['pending','uncertain'])assert.equal(resourceHttpCleanupAllowed({operations:[{...op,state}],fixtures,drained:true}),false);
  assert.equal(resourceHttpCleanupAllowed({operations:[],fixtures,drained:false}),false);assert.equal(resourceHttpCleanupAllowed({operations:[],fixtures:[{creationState:'uncertain'}],drained:true}),false);
  const clean={runId,origin:'https://stu.best',revision:'a'.repeat(40),mode:'deployed_http',state:'cleaned',cleanupVerified:true,connectionClosed:true,cleanupFailures:[],ownerId:randomUUID(),fixtures,courses,materials,operations:[]};
  resourceHttpCleanedLedger(clean,'production-'+runId);for(const patch of [{state:'active'},{cleanupVerified:false},{connectionClosed:false},{cleanupFailures:['pending']},{origin:'https://other.invalid'},{materials:[]}])assert.throws(()=>resourceHttpCleanedLedger({...clean,...patch},'production-'+runId));
  assert.throws(()=>resourceHttpCleanedLedger({...clean,fixtures:[{...fixtures[0],id:clean.ownerId,creationState:'created',deletionState:'deleted'},...fixtures.slice(1)]},'production-'+runId));
  let mutations=0;const uncertain={...op,state:'uncertain'};if(resourceHttpCleanupAllowed({operations:[uncertain],fixtures,drained:true}))mutations++;assert.equal(mutations,0,'No fabricated receipt permits ambiguous cleanup.');
  assert.deepEqual(resourceHttpDiagnostic({name:'AssertionError',code:'ERR_ASSERTION',message:'SYNTHETIC_SECRET',stack:'Error at dtm-course-resource-http-live.mjs:123:9'},'scope check'),{stage:'scope check',name:'AssertionError',code:'ERR_ASSERTION',line:123});
  for(const target of ['http://example.org','https://localhost','https://127.0.0.1','https://user:password@example.org','https://example.org:8443','javascript:alert(1)','https://example.org/%00'])assert.notEqual(validateDtmMaterialTargetUrl(target),null);
  const source=await readFile(new URL(import.meta.url),'utf8');assert.match(source,/insert into auth\.identities\(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at\) values\([^\n]+,'google',now\(\),now\(\),now\(\)\)/);
  assert.ok(!source.includes("readFile('"+'.env.owner.local'+"'"),'No protected-owner credential acquisition.');
  const stream=new Response(JSON.stringify({text:'文😀'}));assert.deepEqual(await boundedJson(stream,AbortSignal.timeout(1000)),{text:'文😀'});
  await assert.rejects(()=>boundedJson(new Response('x'.repeat(17)),AbortSignal.timeout(1000),16));
  return {status:'passed',mode:'offline-contracts',groups:8,databaseConnections:0};
}

async function run(){
  const options=resourceHttpOptions(process.argv.slice(2),process.env),{origin,local,revision,mode}=options;assert.equal(options.selfTest,false);process.umask(0o077);
  assert.equal(await realpath(process.cwd()),clientRoot);assert.equal(await realpath(fileURLToPath(new URL('../../',import.meta.url))),clientRoot);
  const deployment=JSON.parse(await readFile('deployment.json','utf8'));assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);assert.equal(deployment.vercel.productionUrl,'https://stu.best');
  const nativeFetch=globalThis.fetch,sourcePaths=['api/affairs-data.ts','api/affairs-action.ts','server/affairsWorkspace.js','server/dtmCourseResource.js','server/dtmCourseResource.d.ts','supabase/migrations/20261114020000_dtm_material_targets.sql'];
  const hashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
  async function releaseGuard(){if(local){assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),revision);return;}
    const timeout=AbortSignal.timeout(10000),response=await nativeFetch(origin+'/release.json',{redirect:'error',credentials:'omit',cache:'no-store',signal:timeout});assert.equal(response.status,200);
    const result=await boundedJson(response,timeout,8192);assert.equal(result.revision,revision);assert.equal(result.environment,'production');assert.equal(result.source,'vercel-git');}
  await releaseGuard();const sourceBefore=local?await hashes():null;
  const [{deploymentEnvironment},{createClient},{default:postgres}]=await Promise.all([import('../../scripts/deployment-env.mjs'),import('@supabase/supabase-js'),import('postgres')]);
  const env=deploymentEnvironment();Object.assign(process.env,env);const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;assert.equal(url,`https://${project}.supabase.co`);
  const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;dormClientTarget(connection);
  const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY,serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;assert.ok(key&&serviceKey);
  const runId=randomUUID(),root='artifacts/dtm-course-resource-http',output=root+'/'+(local?'local':'production')+'-'+runId,ledgerPath=output+'/fixture-ledger.json';
  const fixtures=[1,2,3].map(number=>({number,id:null,email:`dtm-resource-http-${randomUUID()}@example.invalid`,google:number<3}));
  const courses=[1,1,2].map((fixture,index)=>({id:randomUUID(),fixture,code:'QA-'+index,title:'Synthetic resource course '+index,term:'Local fixture term'})),courseIds=courses.map(row=>row.id);
  const materials=[0,0,2].map((index,number)=>({id:randomUUID(),courseId:courses[index].id,title:'Synthetic URL material '+number})),materialIds=materials.map(row=>row.id),targets=[...courseIds,...materialIds];
  const operations=[],checks=[],active=new Set(),accounts=()=>fixtures.flatMap(item=>item.id?[item.id]:[]),clients=new Map();
  const overall=AbortSignal.timeout(8*60000),leaseAbort=new AbortController(),cleanupAbort=new AbortController(),auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
  let lease,sql,cleaning=false,ownerId=null,ownerBefore=null,schemaBefore,unrelatedBefore,ledgerReady=false,queue=Promise.resolve(),passed=false,phase='preflight',failure=null,httpCalls=0,cleanupVerified=false,connectionClosed=false;
  const cleanupFailures=[],cleanupDiagnostics=[],signal=ms=>AbortSignal.any([leaseAbort.signal,AbortSignal.timeout(ms),cleaning?cleanupAbort.signal:overall]);
  const projectFetch=(input,init={})=>{const destination=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(destination.origin,url);return lease.withHeld(()=>nativeFetch(input,{...init,redirect:'error',credentials:'omit',signal:init.signal?AbortSignal.any([init.signal,signal(20000)]):signal(20000)}));};
  const admin=createClient(url,serviceKey,{auth,global:{fetch:projectFetch}}),pool=postgres(connection,{max:1,max_lifetime:0,idle_timeout:0,connect_timeout:15,onclose:()=>lease?.lose(),connection:{statement_timeout:20000},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
  const track=task=>{active.add(task);task.then(()=>active.delete(task),()=>active.delete(task));return task;};
  async function ledger(state='active'){
    const contents=JSON.stringify({runId,origin,revision,mode,state,fixtures,courses,materials,ownerId,ownerFingerprint:ownerBefore,schemaFingerprint:schemaBefore,unrelatedFingerprint:unrelatedBefore,operations,cleanupVerified,connectionClosed,cleanupFailures,cleanupDiagnostics},null,2);assert.ok(Buffer.byteLength(contents)<=ledgerLimits.fileBytes);
    queue=queue.then(async()=>{const handle=await open(ledgerPath+'.next','w',0o600);try{await handle.writeFile(contents);await handle.sync();}finally{await handle.close();}await rename(ledgerPath+'.next',ledgerPath);
      const directory=await open(output,'r');try{await directory.sync();}finally{await directory.close();}});await queue;
  }
  const fingerprint=async id=>(await sql`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identity_hash
    from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
  const schema=async()=>(await sql`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls,
    (select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.version),'[]'::jsonb)::text) from supabase_migrations.schema_migrations m) as history_hash,
    md5(pg_get_functiondef('public.dtm_manage_record(text,jsonb)'::regprocedure)) as mutation_hash,
    md5(pg_get_functiondef('private.dtm_material_target_url_valid(text)'::regprocedure)) as validator_hash`)[0];
  const unrelated=async()=>(await sql`select
    (select md5(coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]'::jsonb)::text) from public.dtm_grade_items g) as legacy_grades,
    (select md5(coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]'::jsonb)::text) from public.dtm_grade_reports g) as literal_reports,
    (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text) from public.affairs_assignments a) as assignments,
    (select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb)::text) from public.dtm_materials m where not(m.id=any(${materialIds}::uuid[]))) as materials,
    (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb)::text) from public.dtm_courses c where not(c.id=any(${courseIds}::uuid[]))) as courses,
    (select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb)::text) from public.dtm_meetings m) as meetings,
    (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb)::text) from public.dtm_course_contents c) as contents,
    (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text) from public.affairs_agent_audit a where not(a.target_id=any(${targets}::uuid[])) or a.target_id is null) as audit`)[0];
  async function verifyFixture(item){assert.ok(fixtures.includes(item)&&uuid(item.id)&&item.id!==ownerId);const [row]=await sql`select id,email,raw_user_meta_data->>'dtm_resource_qa_run' as run from auth.users where id=${item.id}`;assert.deepEqual(row,{id:item.id,email:item.email,run:runId});}
  async function createFixture(item){overall.throwIfAborted();item.creationState='pending';item.creationSentAt=Date.now();await ledger();const password=randomBytes(32).toString('base64url')+'Aa1!';
    try{const result=await admin.auth.admin.createUser({email:item.email,password,email_confirm:true,user_metadata:{full_name:'Synthetic Resource QA '+item.number,dtm_resource_qa_run:runId}});if(result.data.user){item.id=result.data.user.id;await ledger();}assert.ok(!result.error&&item.id);await verifyFixture(item);item.creationState='created';}
    finally{if(item.creationState==='pending')item.creationState='uncertain';await ledger();}
    item.setupState='pending';await ledger();await lease.transaction(async tx=>{await verifyFixture(item);if(item.google)await tx`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at) values(${item.id},${item.id},${tx.json({sub:item.id,email:item.email,email_verified:true})},'google',now(),now(),now())`;
      await tx`insert into public.affairs_profiles(user_id,email,display_name,role) values(${item.id},${item.email},'Synthetic Resource QA','student')`;});item.setupState='complete';await ledger();
    const client=createClient(url,key,{auth,global:{fetch:projectFetch}});clients.set(item.id,client);const signed=await client.auth.signInWithPassword({email:item.email,password});assert.ok(!signed.error&&signed.data.session?.user.id===item.id);
    const verified=await client.auth.getUser(signed.data.session.access_token);assert.ok(!verified.error&&verified.data.user?.id===item.id);assert.equal(verified.data.user.identities.some(row=>row.provider==='google'),item.google);return signed.data.session;
  }
  let handlers;
  async function invoke(endpoint,{session,method='GET',body}={}){
    if(!cleaning)overall.throwIfAborted();const destination=new URL(endpoint,origin);assert.equal(destination.origin,origin);assert.ok(['/api/affairs-data','/api/affairs-action'].includes(destination.pathname));
    const actorId=session?.user.id??null,token=session?.access_token;if(session){assert.ok(accounts().includes(actorId)&&actorId!==ownerId);assert.equal(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub,actorId);}
    if(destination.pathname==='/api/affairs-action'&&method==='POST')assert.ok(operations.some(op=>op.actorId===actorId&&op.kind===body?.kind&&isDeepStrictEqual(op.payload,body?.payload)));
    else if(destination.pathname==='/api/affairs-data')assert.ok(destination.searchParams.getAll('scope').every(value=>value.startsWith('dtm-course-resource'))&&destination.searchParams.has('scope'));
    else assert.equal(method,'GET');
    httpCalls++;if(!local){const timeout=signal(25000),response=await lease.withHeld(()=>nativeFetch(destination,{method,redirect:'error',credentials:'omit',cache:'no-store',headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:timeout}));return {status:response.status,body:await boundedJson(response,timeout),cacheControl:response.headers.get('cache-control')};}
    const result={status:200,body:null,cacheControl:null},response={status(code){result.status=code;return response;},json(value){result.body=value;},setHeader(name,value){if(name.toLowerCase()==='cache-control')result.cacheControl=value;}},query={};
    for(const key of new Set(destination.searchParams.keys())){const values=destination.searchParams.getAll(key);query[key]=values.length===1?values[0]:values;}
    await lease.withHeld(()=>handlers[destination.pathname]({method,headers:token?{authorization:'Bearer '+token}:{},query,body},response));return result;
  }
  const request=async(endpoint,session,status=200,method='GET')=>{const result=await track(invoke(endpoint,{session,method}));assert.equal(result.status,status,phase+' read');assert.match(result.cacheControl||'',/no-store/);return result.body;};
  const endpoint=(courseId,materialId)=>'/api/affairs-data?scope=dtm-course-resource&course_id='+courseId+'&material_id='+materialId;
  const load=async(session,courseId,materialId)=>parseDtmCourseResourceData(await request(endpoint(courseId,materialId),session),session.user.id,courseId,materialId);
  async function action(kind,payload,{session,status=200}={}){
    assert.ok(operations.length<64&&resourceHttpWriteAllowed(kind,payload,{courses,materials}));const op={actorId:session?.user.id??null,kind,payload:structuredClone(payload),sentAt:Date.now(),state:'pending'};operations.push(op);await ledger();
    const result=await track((async()=>{try{const result=await invoke('/api/affairs-action',{method:'POST',session,body:{kind,payload}});op.status=result.status;op.state=resourceHttpTerminal(op,result)?'terminal':'uncertain';if(result.status===200&&resourceHttpValidReceipt(op,result.body))op.result=result.body;assert.match(result.cacheControl||'',/no-store/);return result;}
      finally{if(op.state==='pending')op.state='uncertain';await ledger();}})());assert.equal(result.status,status,phase+' mutation');return result.body;
  }
  async function auditProof(){const rows=await sql`select user_id,action_kind,target_id from public.affairs_agent_audit where target_id=any(${targets}::uuid[]) or user_id=any(${accounts()}::uuid[])`;
    const key=row=>row.user_id+':'+row.action_kind+':'+row.target_id,expected=operations.filter(op=>op.status===200&&op.state==='terminal').map(op=>({user_id:op.actorId,action_kind:op.kind,target_id:op.payload.id}));
    assert.deepEqual(Array.from(rows,key).sort(),expected.map(key).sort());return rows;}
  try{
    lease=await dormReserveLease(pool,{onLost:()=>leaseAbort.abort(Error('Physical resource lease lost.'))});sql=lease.sql;
    await resourceHttpAssertNoRetainedLedgers(root);assert.equal(execFileSync('git',['check-ignore',ledgerPath],{encoding:'utf8'}).trim(),ledgerPath);await mkdir(root,{recursive:true,mode:0o700});await mkdir(output,{mode:0o700});ledgerReady=true;await ledger();assert.equal((await stat(output)).mode&0o077,0);assert.equal((await stat(ledgerPath)).mode&0o077,0);
    schemaBefore=await schema();assert.deepEqual({migrations:schemaBefore.migrations,rls:schemaBefore.rls},resourceHttpExpectedSchema);
    assert.equal((await sql`select count(*)::int as n from supabase_migrations.schema_migrations where version in ('20261114010000','20261114020000')`)[0].n,2);
    assert.equal((await sql`select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='dtm_materials' and column_name='target_url' and is_nullable='YES'`)[0].n,1);
    assert.equal((await sql`select count(*)::int as n from pg_class where oid in ('public.dtm_courses'::regclass,'public.dtm_materials'::regclass) and relrowsecurity`)[0].n,2);
    const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin' where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'Existing protected administrator required; no repair/promotion.');ownerId=owner.id;ownerBefore=await fingerprint(ownerId);unrelatedBefore=await unrelated();await ledger();
    assert.equal((await sql`select id from public.dtm_courses where id=any(${courseIds}::uuid[]) union all select id from public.dtm_materials where id=any(${materialIds}::uuid[]) union all select id from public.affairs_agent_audit where target_id=any(${targets}::uuid[])`).length,0);
    assert.equal((await sql`select id from auth.users where email=any(${fixtures.map(item=>item.email)}::text[])`).length,0);
    if(local){globalThis.fetch=(input,init={})=>{const destination=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(destination.origin,url);
      assert.ok(['/auth/v1/user','/rest/v1/rpc/dtm_course_content_access','/rest/v1/dtm_courses','/rest/v1/rpc/dtm_manage_record'].includes(destination.pathname));return projectFetch(input,init);};
      handlers={'/api/affairs-data':(await import('../../api/affairs-data.ts')).default,'/api/affairs-action':(await import('../../api/affairs-action.ts')).default};}
    phase='fixture identities';const first=await createFixture(fixtures[0]),second=await createFixture(fixtures[1]),nonGoogle=await createFixture(fixtures[2]);
    phase='course and material creation';for(const course of courses)await action('save_dtm_course',{id:course.id,code:course.code,title:course.title,term:course.term},{session:course.fixture===1?first:second});
    const base=index=>({id:materials[index].id,course_id:materials[index].courseId,title:materials[index].title,kind:'page',summary:'Synthetic literal summary'});
    const target='https://example.org/resource?part=1#section',provenance='https://dtm.stu.edu.tw/mod/url/view.php?id=123';
    await action('save_dtm_material',{...base(0),target_url:target,source_url:provenance},{session:first});await action('save_dtm_material',base(1),{session:first});await action('save_dtm_material',{...base(2),target_url:'https://example.org/foreign'},{session:second});
    const initial=await load(first,courses[0].id,materials[0].id);assert.equal(initial.material.targetUrl,target);assert.equal(initial.material.sourceUrl,provenance);assert.equal(initial.course.userId,first.user.id);assert.equal(initial.material.userId,first.user.id);
    assert.equal((await load(first,courses[0].id,materials[1].id)).material.targetUrl,null);assert.equal((await load(first,courses[1].id,materials[0].id)).material,null);
    assert.equal((await load(first,courses[0].id,materials[2].id)).material,null);checks.push('Own course/material exact read, source provenance distinct, missing target and mismatched material are explicit.');
    phase='URL edit and legacy payload preservation';const next='https://EXAMPLE.ORG:443/second?q=literal%20space#part';await action('save_dtm_material',{...base(0),target_url:next,source_url:provenance},{session:first});
    assert.equal((await load(first,courses[0].id,materials[0].id)).material.targetUrl,next);
    await action('save_dtm_material',{...base(0),title:'Synthetic legacy editor rename',source_url:provenance},{session:first});const omitted=await load(first,courses[0].id,materials[0].id);assert.equal(omitted.material.targetUrl,next);assert.equal(omitted.material.title,'Synthetic legacy editor rename');
    await action('save_dtm_material',{...base(0),target_url:null},{session:first});assert.equal((await load(first,courses[0].id,materials[0].id)).material.targetUrl,null);
    await action('save_dtm_material',{...base(0),target_url:target},{session:first});await action('save_dtm_material',{...base(0),target_url:''},{session:first});assert.equal((await load(first,courses[0].id,materials[0].id)).material.targetUrl,null);
    await action('save_dtm_material',{...base(0),target_url:target},{session:first});const beforeRepeat=await load(first,courses[0].id,materials[0].id);await action('save_dtm_material',{...base(0),target_url:target},{session:first});assert.deepEqual(await load(first,courses[0].id,materials[0].id),beforeRepeat);
    checks.push('Literal edit, omitted destination preserves, explicit null/blank clears, repeated save preserves row state under existing audited semantics.');
    phase='unsafe destination rejection';for(const unsafe of ['http://example.org','https://localhost','https://127.0.0.1','https://user:password@example.org','https://example.org:8443','javascript:alert(1)','https://example.org/%00']){
      await action('save_dtm_material',{...base(0),target_url:unsafe},{session:first,status:400});assert.deepEqual(await load(first,courses[0].id,materials[0].id),beforeRepeat);}
    checks.push('Unsafe schemes, credentials, IP/local hosts, custom ports and encoded controls rejected atomically.');
    phase='identity and selector boundaries';const ownEndpoint=endpoint(courses[0].id,materials[0].id);
    await request(ownEndpoint,undefined,401);await request(ownEndpoint,nonGoogle,401);await request(ownEndpoint,second,403);
    await action('save_dtm_material',{...base(0),target_url:target},{session:second,status:403});await action('delete_dtm_material',{id:materials[0].id,course_id:courses[0].id},{session:second,status:403});
    await action('save_dtm_material',{...base(0),target_url:target},{session:nonGoogle,status:401});await action('save_dtm_material',{...base(0),target_url:target},{status:401});
    await action('save_dtm_material',{...base(0),course_id:courses[1].id,target_url:target},{session:first,status:403});
    assert.deepEqual(await load(first,courses[0].id,materials[0].id),beforeRepeat);assert.equal((await load(second,courses[2].id,materials[2].id)).material.targetUrl,'https://example.org/foreign');
    for(const bad of [ownEndpoint+'&course_id='+courses[1].id,ownEndpoint+'&material_id='+materials[1].id,ownEndpoint+'&scope=dtm-course-resource',ownEndpoint+'&user_id='+second.user.id,ownEndpoint+'&resource=conversations',ownEndpoint+'&extra=1',ownEndpoint.replace(courses[0].id,'invalid'),ownEndpoint.replace('scope=dtm-course-resource','scope=dtm-course-resource-admin')])await request(bad,first,400);
    await request('/api/affairs-data?scope=dtm-course-resource',first,400);await request(ownEndpoint,first,405,'POST');await request('/api/affairs-action',first,405);
    checks.push('Anonymous, non-Google, cross-account, wrong-course mutation, selector duplication/extra keys and wrong HTTP methods fail closed.');
    phase='delete persistence and unchanged unrelated records';await action('delete_dtm_material',{id:materials[0].id,course_id:courses[0].id},{session:first});assert.equal((await load(first,courses[0].id,materials[0].id)).material,null);
    await action('delete_dtm_course',{id:courses[1].id},{session:first});await request(endpoint(courses[1].id,materials[0].id),first,403);await auditProof();
    assert.deepEqual(await fingerprint(ownerId),ownerBefore);assert.deepEqual(await unrelated(),unrelatedBefore);await releaseGuard();if(local)assert.deepEqual(await hashes(),sourceBefore);
    checks.push('Delete persisted, exact legacy audit multiplicity and protected-owner/unrelated records preserved.');passed=true;
  }catch(error){failure=resourceHttpDiagnostic(error,phase);}
  finally{
    cleaning=true;let drained=false,rowsVerified=false;const cleanupTimer=setTimeout(()=>{cleanupAbort.abort(Error('Cleanup deadline exceeded.'));lease?.lose();void pool.end({timeout:1}).catch(()=>{});},120000);
    const clean=async(label,task)=>{try{await task();return true;}catch(error){cleanupFailures.push(label);if(cleanupDiagnostics.length<16)cleanupDiagnostics.push(resourceHttpDiagnostic(error,label));return false;}};
    const held=(label,task)=>clean(label,()=>lease.withHeld(task));
    if(ledgerReady){
      await clean('inflight-drain',async()=>{let timer;try{await Promise.race([Promise.allSettled([...active]),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Undrained operations')),35000);})]);assert.equal(active.size,0);drained=true;}finally{clearTimeout(timer);}});
      if(drained)await held('uncertain-auth-reconciliation',()=>layoutHttpReconcileCreates(fixtures,{runId,ownerId,lookup:item=>sql`select id,email,raw_user_meta_data->>'dtm_resource_qa_run' as run from auth.users where email=${item.email}`}));
      const safe=lease&&!lease.lost&&resourceHttpCleanupAllowed({operations,fixtures,drained});
      if(safe)rowsVerified=await held('exact-fixture-scope-proof',async()=>{for(const item of fixtures)if(item.id)await verifyFixture(item);await auditProof();
        const rows=await sql`select id,user_id,source_mode from public.dtm_courses where id=any(${courseIds}::uuid[]) or user_id=any(${accounts()}::uuid[])`;
        for(const row of rows){const planned=courses.find(course=>course.id===row.id);assert.ok(planned&&fixtures[planned.fixture-1].id===row.user_id);assert.equal(row.source_mode,'personal');}
        const mats=await sql`select m.id,m.course_id,m.source_mode,c.user_id from public.dtm_materials m join public.dtm_courses c on c.id=m.course_id where m.id=any(${materialIds}::uuid[]) or c.user_id=any(${accounts()}::uuid[])`;
        for(const row of mats){const planned=materials.find(material=>material.id===row.id);assert.ok(planned&&planned.courseId===row.course_id);assert.equal(row.user_id,fixtures[row.course_id===courses[2].id?1:0].id);assert.equal(row.source_mode,'personal');}
        assert.equal((await sql`select id from public.affairs_students where user_id=any(${accounts()}::uuid[])`).length,0,'No initialization or generated academic fixtures are expected.');
      });
      if(safe&&rowsVerified)for(const item of fixtures)if(item.id)await held('exact-auth-delete-'+item.number,async()=>{await verifyFixture(item);item.deletionState='pending';await ledger();
        const client=clients.get(item.id);if(client)assert.ok(!(await client.auth.signOut({scope:'local'})).error);
        for(let attempt=0;attempt<3;attempt++){try{await admin.auth.admin.deleteUser(item.id);}catch{/* Exact absence determines completion. */}if(!(await sql`select id from auth.users where id=${item.id}`).length){item.deletionState='deleted';await ledger();return;}}assert.fail('Fixture deletion unresolved.');});
      if(safe&&rowsVerified)await held('exact-residue-proof',async()=>{
        assert.equal((await sql`select id from auth.users where id=any(${accounts()}::uuid[]) or email=any(${fixtures.map(item=>item.email)}::text[])`).length,0);
        assert.equal((await sql`select user_id from auth.identities where user_id=any(${accounts()}::uuid[])`).length,0);assert.equal((await sql`select user_id from public.affairs_profiles where user_id=any(${accounts()}::uuid[])`).length,0);
        assert.equal((await sql`select id from public.dtm_courses where id=any(${courseIds}::uuid[]) or user_id=any(${accounts()}::uuid[])`).length,0);
        assert.equal((await sql`select id from public.dtm_materials where id=any(${materialIds}::uuid[]) or course_id=any(${courseIds}::uuid[])`).length,0);
        assert.equal((await sql`select id from public.affairs_agent_audit where target_id=any(${targets}::uuid[]) or user_id=any(${accounts()}::uuid[])`).length,0);
      });else cleanupFailures.push('unresolved-recovery-ledger');
      if(ownerBefore)await held('protected-owner-fingerprint',async()=>assert.deepEqual(await fingerprint(ownerId),ownerBefore));if(unrelatedBefore)await held('unrelated-records-and-legacy',async()=>assert.deepEqual(await unrelated(),unrelatedBefore));
      if(schemaBefore)await held('unchanged-schema-history',async()=>assert.deepEqual(await schema(),schemaBefore));
    }
    globalThis.fetch=nativeFetch;if(lease)await clean('lease-release',()=>lease.release());if(lease?.lost)cleanupFailures.push('physical-session-lost');connectionClosed=await clean('database-close',()=>pool.end({timeout:5}));clearTimeout(cleanupTimer);cleanupVerified=ledgerReady&&cleanupFailures.length===0;
    if(ledgerReady)await ledger(cleanupVerified?'cleaned':'cleanup-required');
    const result={passed:passed&&cleanupVerified,mode,revision,checks,httpCalls,successfulWrites:operations.filter(op=>op.status===200&&op.state==='terminal').length,cleanupVerified,connectionClosed,cleanupFailures,cleanupDiagnostics,failure,sourceHashes:sourceBefore,
      limitations:['Actual JWT API acceptance; no browser, model, official destination or Storage requests.','No protected-owner login or owner-data writes; only exact synthetic accounts are authenticated or deleted.','Legacy material save has no request receipt/CAS: uncertain writes retain the ledger and block automatic cleanup; repeated successful saves produce distinct audit entries.'],artifacts:ledgerReady?output:null};
    if(ledgerReady)await writeFile(output+'/result.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length===3&&process.argv[2]==='--self-test')console.log(JSON.stringify(await resourceHttpOfflineChecks()));else await run();
}

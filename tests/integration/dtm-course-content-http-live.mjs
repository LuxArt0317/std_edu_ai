import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,opendir,readFile,rename,stat,writeFile,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {isDeepStrictEqual,parseEnv} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dtmCourseContentMaxResponseBytes,parseDtmCourseContentData,parseDtmCourseContentReceipt,parseDtmCourseContentCoursesData,parseDtmCourseContentAssignmentData,validateDtmCourseContentPayload} from '../../server/dtmCourseContent.js';
import {gradeHttpDispatchBatch as contentHttpDispatchBatch,gradeHttpCleanupAllowed as contentHttpCleanupAllowed} from './dtm-grade-report-http-live.mjs';
import {dormReserveLease,dormClientTarget} from './dormitory-conduct-http-live.mjs';
import {layoutHttpDiagnostic,layoutHttpReconcileCreates} from './dtm-dashboard-layout-http-live.mjs';

// PREPARED ONLY. Root must authorize --execute with its sole live lease after
// migration application and review. Import/--self-test never loads credentials.
// Local mode invokes actual handlers with actual JWTs; production uses deployed
// HTTP. No browser, university, model, Storage, owner repair or owner data write.
const clientRoot='/Users/winsonbaring/Documents/GitHub/std_edu_ai-luxart0317',project='xiftudmvxphxcjtmfmib';
const saveKind='save_dtm_course_content',deleteKind='delete_dtm_course_content',kinds=[saveKind,deleteKind],settleMs=30000;
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export const contentHttpExpectedSchema=Object.freeze({migrations:135,rls:152});
export function contentHttpOptions(args,env={}){
  if(args.length===1&&args[0]==='--self-test')return {selfTest:true};
  assert.deepEqual(args,['--execute'],'Only --self-test is permitted without the root live lease.');
  const origin=env.NATIVE_ORIGIN,local=['http://127.0.0.1:5184','http://localhost:5184'].includes(origin);
  assert.ok(local||origin==='https://stu.best');const revision=local?env.EXPECTED_SOURCE_REVISION:env.EXPECTED_RELEASE_REVISION;
  assert.match(revision||'',/^[0-9a-f]{40}$/);return {selfTest:false,origin,local,revision,mode:local?'actual_jwt_local_handlers':'deployed_http'};
}
export function contentHttpFixture(id,userId,courseId,references=[],requestId=randomUUID()){
  return {id,user_id:userId,course_id:courseId,request_id:requestId,expected_version:0,content:{references}};
}
export function contentHttpValidReceipt(op,value){try{parseDtmCourseContentReceipt(value,op.kind,op.payload);return true;}catch{return false;}}
export function contentHttpTerminal(op,result){return result.status===200?contentHttpValidReceipt(op,result.body):[400,401,403,409].includes(result.status)&&typeof result.body?.error==='string'&&Boolean(result.body.error);}
export async function contentHttpReconcileWrites(operations,{readReceipt,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const pending=operations.filter(op=>['pending','uncertain'].includes(op.state));
  for(const op of pending)assert.ok(Number.isFinite(op.sentAt));const delay=Math.max(0,...pending.map(op=>op.sentAt+settleMs-now()));assert.ok(delay<=settleMs);if(delay)await wait(delay);
  for(const op of pending){assert.ok(uuid(op.actorId),'Uncertain anonymous operation requires recovery, never guessed absence.');
    const rows=await readReceipt(op);assert.equal(rows.length,1,'Uncertain operation has no exact durable receipt.');const row=rows[0];
    assert.equal(row.actor_id,op.actorId);assert.equal(row.user_id,op.payload.user_id);assert.equal(row.course_id,op.payload.course_id);assert.equal(row.request_id,op.payload.request_id);
    assert.equal(row.kind,op.kind);assert.deepEqual(row.payload,op.payload);assert.ok(contentHttpValidReceipt(op,row.result));op.result=row.result;op.state='reconciled';}
}
export {contentHttpDispatchBatch,contentHttpCleanupAllowed};
export function contentHttpOwnerRequestAllowed(endpoint,method,body,{fixtures,courses,targets,activityIds=[],materialIds=[],operations,ownerId}){
  const url=new URL(endpoint,'https://stu.best'),ids=fixtures.flatMap(item=>item.id?[item.id]:[]),scope=url.searchParams.get('scope');
  if([...url.searchParams.keys()].some(key=>url.searchParams.getAll(key).length!==1))return false;
  if(method==='GET'){
    if(url.pathname!=='/api/affairs-data'||!['dtm-course-content-admin','dtm-course-content-courses-admin'].includes(scope)||!ids.includes(url.searchParams.get('user_id')))return false;
    if(scope==='dtm-course-content-courses-admin')return [...url.searchParams.keys()].every(key=>['scope','user_id','after_id'].includes(key))&&(!url.searchParams.has('after_id')||courses.some(row=>row.id===url.searchParams.get('after_id')));
    return courses.some(row=>row.id===url.searchParams.get('course_id'))&&[...url.searchParams.keys()].every(key=>['scope','user_id','course_id','after_kind','after_id'].includes(key))
      &&url.searchParams.has('after_kind')===url.searchParams.has('after_id')&&(!url.searchParams.has('after_id')||(url.searchParams.get('after_kind')==='assignment'?activityIds:url.searchParams.get('after_kind')==='material'?materialIds:[]).includes(url.searchParams.get('after_id')));
  }
  return method==='POST'&&url.pathname==='/api/affairs-manage'&&url.search===''&&kinds.includes(body?.kind)&&targets.includes(body?.payload?.id)
    &&ids.includes(body?.payload?.user_id)&&courses.some(row=>row.id===body?.payload?.course_id)
    &&(body.kind!==saveKind||body.payload.content.references.every(ref=>(ref.kind==='assignment'?activityIds:materialIds).includes(ref.id)))
    &&operations.some(op=>op.actorId===ownerId&&op.kind===body.kind&&isDeepStrictEqual(op.payload,body.payload));
}
const ledgerLimits=Object.freeze({entries:256,runs:64,fileBytes:512*1024,totalBytes:8*1024*1024});
export function contentHttpCleanedLedger(value,folder){
  assert.ok(value&&uuid(value.runId));const local=folder.startsWith('local-');assert.equal(folder,(local?'local-':'production-')+value.runId);
  const options=contentHttpOptions(['--execute'],{NATIVE_ORIGIN:value.origin,EXPECTED_SOURCE_REVISION:value.revision,EXPECTED_RELEASE_REVISION:value.revision});
  assert.equal(options.local,local);assert.equal(value.mode,options.mode);assert.equal(value.state,'cleaned');assert.equal(value.cleanupVerified,true);assert.equal(value.connectionClosed,true);assert.deepEqual(value.cleanupFailures,[]);
  assert.ok(value.ownerId===null||uuid(value.ownerId));assert.ok(Array.isArray(value.fixtures)&&value.fixtures.length===3&&Array.isArray(value.operations)&&value.operations.length<=100);
  const seen=new Set();for(const [index,item]of value.fixtures.entries()){
    assert.equal(item.number,index+1);assert.equal(item.google,index<2);assert.match(item.email,/^dtm-content-http-[0-9a-f-]{36}@example\.invalid$/);
    if(item.id){assert.ok(uuid(item.id)&&item.id!==value.ownerId&&!seen.has(item.id));seen.add(item.id);assert.equal(item.creationState,'created');assert.equal(item.deletionState,'deleted');}
    else{assert.equal(item.id,null);assert.equal(item.creationState,undefined);}
  }
  assert.ok(Array.isArray(value.courses)&&value.courses.length===103&&new Set(value.courses.map(row=>row.id)).size===103);
  for(const [index,row]of value.courses.entries()){assert.ok(uuid(row.id));assert.equal(row.fixture,index===102?2:1);}
  assert.ok(uuid(value.programId)&&Array.isArray(value.studentIds)&&value.studentIds.length===2&&value.studentIds.every(uuid)&&new Set(value.studentIds).size===2);
  assert.ok(Array.isArray(value.activityIds)&&value.activityIds.length===105&&value.activityIds.every(uuid)&&new Set(value.activityIds).size===105);
  assert.ok(Array.isArray(value.materialIds)&&value.materialIds.length===2&&value.materialIds.every(uuid)&&new Set(value.materialIds).size===2&&Array.isArray(value.activityEdits)&&value.activityEdits.length<=5);
  assert.ok(value.derivedFixtureRows&&['enrollments','charges','assignments'].every(key=>Array.isArray(value.derivedFixtureRows[key])&&value.derivedFixtureRows[key].length<=1000&&value.derivedFixtureRows[key].every(uuid)&&new Set(value.derivedFixtureRows[key]).size===value.derivedFixtureRows[key].length));
  assert.ok(Array.isArray(value.targets)&&value.targets.length===5&&value.targets.every(uuid)&&new Set(value.targets).size===5&&uuid(value.legacyId));
  for(const op of value.operations){assert.ok(op.actorId===null||op.actorId===value.ownerId||seen.has(op.actorId));assert.ok(Number.isFinite(op.sentAt));assert.equal(validateDtmCourseContentPayload(op.kind,op.payload),null);
    assert.ok(value.targets.includes(op.payload.id)&&seen.has(op.payload.user_id)&&value.courses.some(row=>row.id===op.payload.course_id));
    if(op.kind===saveKind)assert.ok(op.payload.content.references.every(ref=>(ref.kind==='assignment'?value.activityIds:value.materialIds).includes(ref.id)));
    if(op.state==='reconciled'||op.status===200)assert.ok(contentHttpValidReceipt(op,op.result));else assert.ok(op.state==='terminal'&&[400,401,403,409].includes(op.status));
  }
  assert.ok(contentHttpCleanupAllowed({...value,drained:true}));
}
export async function contentHttpAssertNoRetainedLedgers(root='artifacts/dtm-course-content-http',io={lstat,opendir,open}){
  let info;try{info=await io.lstat(root);}catch(error){if(error.code==='ENOENT')return;throw error;}assert.ok(info.isDirectory()&&!info.isSymbolicLink());
  let entries=0,runs=0,bytes=0;
  for await(const entry of await io.opendir(root)){
    assert.ok(++entries<=ledgerLimits.entries);if(!/^(?:local|production)-/.test(entry.name))continue;
    const runId=entry.name.slice(entry.name.indexOf('-')+1);assert.ok(uuid(runId)&&++runs<=ledgerLimits.runs);const directory=join(root,entry.name),folder=await io.lstat(directory);assert.ok(folder.isDirectory()&&!folder.isSymbolicLink());let found=0;
    for(const suffix of ['fixture-ledger.json','fixture-ledger.json.next']){let handle;try{handle=await io.open(join(directory,suffix),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      try{const stat=await handle.stat();assert.ok(stat.isFile()&&stat.size>0&&stat.size<=ledgerLimits.fileBytes&&bytes+stat.size<=ledgerLimits.totalBytes);const buffer=Buffer.alloc(stat.size+1),result=await handle.read(buffer,0,buffer.length,0);assert.equal(result.bytesRead,stat.size);bytes+=stat.size;found++;
        const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,result.bytesRead)));assert.equal(value.runId,runId);contentHttpCleanedLedger(value,entry.name);
      }finally{await handle.close();}}
    assert.ok(found,'Retained run is missing its exact recovery ledger.');
  }
}
async function boundedJson(response,signal,maxBytes=dtmCourseContentMaxResponseBytes){
  assert.ok(response.body&&Number(response.headers.get('content-length')||0)<=maxBytes);const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{for(;;){signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();if(part.done)break;bytes+=part.value.byteLength;assert.ok(bytes<=maxBytes);text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}
  catch(error){void reader.cancel().catch(()=>{});throw error;}finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}
export async function contentHttpOfflineChecks(){
  assert.deepEqual(contentHttpOptions(['--self-test']),{selfTest:true});assert.throws(()=>contentHttpOptions([],{}));assert.throws(()=>contentHttpOptions(['--execute'],{NATIVE_ORIGIN:'https://stu.best/'}));
  assert.equal(contentHttpOptions(['--execute'],{NATIVE_ORIGIN:'https://stu.best',EXPECTED_RELEASE_REVISION:'a'.repeat(40)}).mode,'deployed_http');
  dormClientTarget(`postgres://postgres@db.${project}.supabase.co/postgres`);assert.throws(()=>dormClientTarget(`postgres://postgres.${project}@qa.pooler.supabase.com:6543/postgres`));
  const actor=randomUUID(),userId=randomUUID(),courseId=randomUUID(),payload=contentHttpFixture(randomUUID(),userId,courseId),op={actorId:actor,kind:saveKind,payload,state:'uncertain',sentAt:1000};
  assert.equal(validateDtmCourseContentPayload(saveKind,payload),null);const receipt={id:payload.id,userId,courseId,kind:saveKind,version:1,summary:'Saved local course placement.'};
  assert.ok(contentHttpTerminal(op,{status:200,body:receipt}));assert.equal(contentHttpTerminal(op,{status:200,body:{...receipt,userId:actor}}),false);assert.equal(contentHttpTerminal(op,{status:503,body:{error:'unavailable'}}),false);
  assert.equal(contentHttpCleanupAllowed({operations:[op],fixtures:[],drained:true}),false);
  await contentHttpReconcileWrites([op],{now:()=>31000,readReceipt:async()=>[{actor_id:actor,user_id:userId,course_id:courseId,request_id:payload.request_id,kind:saveKind,payload,result:receipt}]});assert.equal(op.state,'reconciled');
  await assert.rejects(contentHttpReconcileWrites([{...op,state:'uncertain'}],{now:()=>31000,readReceipt:async()=>[]}));
  await assert.rejects(contentHttpReconcileWrites([{...op,state:'uncertain'}],{now:()=>31000,readReceipt:async()=>[{actor_id:userId,user_id:userId,course_id:courseId,request_id:payload.request_id,kind:saveKind,payload,result:receipt}]}));
  let persisted=false,finished=false;const settled=await contentHttpDispatchBatch([1,2],{prepare:async x=>x,persist:async()=>{persisted=true;},send:async x=>{assert.ok(persisted);if(x===1)throw Error('synthetic');await new Promise(resolve=>setTimeout(resolve,1));finished=true;return x;}});
  assert.equal(finished,true);assert.deepEqual(settled.map(row=>row.status),['rejected','fulfilled']);
  const scope={fixtures:[{id:userId}],courses:[{id:courseId}],targets:[payload.id],activityIds:[],materialIds:[],operations:[op],ownerId:actor};
  assert.ok(contentHttpOwnerRequestAllowed('/api/affairs-manage','POST',{kind:saveKind,payload},scope));assert.equal(contentHttpOwnerRequestAllowed('/api/affairs-data','GET',undefined,scope),false);
  assert.equal(contentHttpOwnerRequestAllowed('/api/affairs-manage','POST',{kind:saveKind,payload:{...payload,user_id:actor}},scope),false);
  assert.ok(contentHttpOwnerRequestAllowed('/api/affairs-data?scope=dtm-course-content-admin&user_id='+userId+'&course_id='+courseId,'GET',undefined,scope));
  const ownActivity=randomUUID(),foreign=randomUUID(),scopeWithActivity={...scope,activityIds:[ownActivity]};
  const paging='/api/affairs-data?scope=dtm-course-content-admin&user_id='+userId+'&course_id='+courseId+'&after_kind=assignment&after_id='+ownActivity;
  assert.ok(contentHttpOwnerRequestAllowed(paging,'GET',undefined,scopeWithActivity));assert.equal(contentHttpOwnerRequestAllowed(paging.replace(ownActivity,foreign),'GET',undefined,scopeWithActivity),false);
  assert.equal(contentHttpOwnerRequestAllowed(paging+'&user_id='+actor,'GET',undefined,scopeWithActivity),false);
  const command={...payload,content:{references:[{kind:'assignment',id:ownActivity,section:'quizzes'}]}},ownedOperation={...op,payload:command};
  assert.ok(contentHttpOwnerRequestAllowed('/api/affairs-manage','POST',{kind:saveKind,payload:command},{...scopeWithActivity,operations:[ownedOperation]}));
  assert.equal(contentHttpOwnerRequestAllowed('/api/affairs-manage','POST',{kind:saveKind,payload:{...command,content:{references:[{kind:'assignment',id:foreign,section:'quizzes'}]}}},{...scopeWithActivity,operations:[ownedOperation]}),false);
  const runId=randomUUID(),ledger={runId,origin:'https://stu.best',revision:'a'.repeat(40),mode:'deployed_http',state:'cleaned',cleanupVerified:true,connectionClosed:true,cleanupFailures:[],ownerId:actor,
    fixtures:[1,2,3].map(number=>({number,id:null,google:number<3,email:`dtm-content-http-${randomUUID()}@example.invalid`})),courses:Array.from({length:103},(_,index)=>({id:randomUUID(),fixture:index===102?2:1})),targets:Array.from({length:5},()=>randomUUID()),legacyId:randomUUID(),programId:randomUUID(),studentIds:[randomUUID(),randomUUID()],activityIds:Array.from({length:105},()=>randomUUID()),materialIds:[randomUUID(),randomUUID()],derivedFixtureRows:{enrollments:[],charges:[],assignments:[]},activityEdits:[],operations:[]};
  contentHttpCleanedLedger(ledger,'production-'+runId);for(const patch of [{state:'active'},{cleanupVerified:false},{connectionClosed:false},{cleanupFailures:['unresolved']},{origin:'https://other.invalid'},{targets:[]}])assert.throws(()=>contentHttpCleanedLedger({...ledger,...patch},'production-'+runId));
  assert.throws(()=>contentHttpCleanedLedger({...ledger,fixtures:[{...ledger.fixtures[0],id:actor,creationState:'created',deletionState:'deleted'},...ledger.fixtures.slice(1)]},'production-'+runId));
  // Unlike SQL-only rollback fixtures, GoTrue reads these identities during
  // both sign-in and deletion. Its timestamp fields must be initialized.
  const source=await readFile(new URL(import.meta.url),'utf8');
  assert.match(source,/insert into auth\.identities\(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at\) values\([^\n]+,'google',now\(\),now\(\),now\(\)\)/);
  return {status:'passed',mode:'offline-contracts',checks:10,databaseConnections:0};
}

async function run(){
  const options=contentHttpOptions(process.argv.slice(2),process.env),{origin,local,revision,mode}=options;assert.equal(options.selfTest,false);process.umask(0o077);
  assert.equal(await realpath(process.cwd()),clientRoot);assert.equal(await realpath(fileURLToPath(new URL('../../',import.meta.url))),clientRoot);
  const deployment=JSON.parse(await readFile('deployment.json','utf8'));assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);assert.equal(deployment.vercel.productionUrl,'https://stu.best');
  const nativeFetch=globalThis.fetch,sourcePaths=['api/affairs-data.ts','api/affairs-manage.ts','server/dtmCourseContent.js','server/dtmCourseContent.d.ts','supabase/migrations/20261114010000_dtm_course_content.sql'];
  const hashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
  async function releaseGuard(){if(local){assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),revision);return;}
    const timeout=AbortSignal.timeout(10000),response=await nativeFetch(origin+'/release.json',{redirect:'error',credentials:'omit',cache:'no-store',signal:timeout});assert.equal(response.status,200);
    const result=await boundedJson(response,timeout,8192);assert.equal(result.revision,revision);assert.equal(result.environment,'production');assert.equal(result.source,'vercel-git');}
  await releaseGuard();const sourceBefore=local?await hashes():null;
  const [{deploymentEnvironment},{createClient},{default:postgres}]=await Promise.all([import('../../scripts/deployment-env.mjs'),import('@supabase/supabase-js'),import('postgres')]);
  const env=deploymentEnvironment();Object.assign(process.env,env);const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;assert.equal(url,`https://${project}.supabase.co`);
  const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;dormClientTarget(connection);
  const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY,serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;assert.ok(key&&serviceKey);
  const runId=randomUUID(),root='artifacts/dtm-course-content-http',output=root+'/'+(local?'local':'production')+'-'+runId,ledgerPath=output+'/fixture-ledger.json';
  const fixtures=[1,2,3].map(number=>({number,id:null,email:`dtm-content-http-${randomUUID()}@example.invalid`,google:number<3}));
  const courseIds=Array.from({length:103},()=>randomUUID()).sort(),courses=courseIds.map((id,index)=>({id,fixture:index===102?2:1,code:'QA-'+index,title:'Synthetic content course '+index,term:'Local fixture term'}));
  const targets=Array.from({length:5},()=>randomUUID()),legacyId=randomUUID(),programId=randomUUID(),studentIds=[randomUUID(),randomUUID()],activityIds=Array.from({length:105},()=>randomUUID()).sort(),materialIds=[activityIds[0],randomUUID()],derivedFixtureRows={enrollments:[],charges:[],assignments:[]},activityEdits=[],operations=[],checks=[],active=new Set(),sessions=new Map(),successes=new Map(),accounts=()=>fixtures.flatMap(item=>item.id?[item.id]:[]);
  const runDeadline=Date.now()+8*60000,overall=AbortSignal.timeout(8*60000),leaseAbort=new AbortController(),auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
  let lease,sql,cleaning=false,ownerId=null,ownerBefore=null,ownerSession,ownerClient,schemaBefore,unrelatedBefore,ledgerReady=false,queue=Promise.resolve(),passed=false,phase='preflight',failure=null,httpCalls=0,cleanupVerified=false,connectionClosed=false;
  const cleanupFailures=[],cleanupDiagnostics=[],signal=ms=>AbortSignal.any([leaseAbort.signal,AbortSignal.timeout(ms),...(cleaning?[]:[overall])]);
  const projectFetch=(input,init={})=>{const destination=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(destination.origin,url);return lease.withHeld(()=>nativeFetch(input,{...init,redirect:'error',credentials:'omit',signal:init.signal?AbortSignal.any([init.signal,signal(20000)]):signal(20000)}));};
  const admin=createClient(url,serviceKey,{auth,global:{fetch:projectFetch}}),pool=postgres(connection,{max:1,max_lifetime:0,idle_timeout:0,connect_timeout:15,onclose:()=>lease?.lose(),connection:{statement_timeout:20000},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
  const handlers=local?{'/api/affairs-data':(await import('../../api/affairs-data.ts')).default,'/api/affairs-manage':(await import('../../api/affairs-manage.ts')).default}:null;
  const track=task=>{active.add(task);task.then(()=>active.delete(task),()=>active.delete(task));return task;};
  async function ledger(state='active'){
    const contents=JSON.stringify({runId,origin,revision,mode,state,fixtures,courses,targets,legacyId,programId,studentIds,activityIds,materialIds,derivedFixtureRows,activityEdits,ownerId,ownerFingerprint:ownerBefore,operations,cleanupVerified,connectionClosed,cleanupFailures,cleanupDiagnostics},null,2);assert.ok(Buffer.byteLength(contents)<=ledgerLimits.fileBytes);
    queue=queue.then(async()=>{const handle=await open(ledgerPath+'.next','w',0o600);try{await handle.writeFile(contents);await handle.sync();}finally{await handle.close();}await rename(ledgerPath+'.next',ledgerPath);});await queue;
  }
  const fingerprint=async id=>(await sql`select u.id,md5((to_jsonb(u)-array['last_sign_in_at','updated_at'])::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(i)-array['last_sign_in_at','updated_at'] order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identity_hash
    from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
  const schema=async()=>(await sql`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls,
    (select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.version),'[]'::jsonb)::text) from supabase_migrations.schema_migrations m) as history_hash`)[0];
  const unrelated=async()=>(await sql`select
    (select md5(coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]'::jsonb)::text) from public.dtm_grade_items g where g.id<>${legacyId}) as legacy,
    (select md5(coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]'::jsonb)::text) from public.dtm_grade_reports g) as literal_reports,
    (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text) from public.affairs_programs p where p.id<>${programId}) as programs,
    (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text) from public.affairs_assignments a where not(a.id=any(${activityIds}::uuid[])) and not(a.student_id=any(${studentIds}::uuid[]))) as assignments,
    (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb)::text) from public.affairs_enrollments e where not(e.student_id=any(${studentIds}::uuid[]))) as enrollments,
    (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb)::text) from public.affairs_charges c where not(c.student_id=any(${studentIds}::uuid[]))) as charges,
    (select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb)::text) from public.dtm_materials m where not(m.id=any(${materialIds}::uuid[]))) as materials,
    (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb)::text) from public.dtm_courses c where not(c.id=any(${courseIds}::uuid[]))) as courses,
    (select md5(coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]'::jsonb)::text) from public.dtm_course_contents g where not(g.id=any(${targets}::uuid[]))) as contents,
    (select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.actor_id,o.request_id),'[]'::jsonb)::text) from private.dtm_course_content_operations o where not(o.course_id=any(${courseIds}::uuid[]))) as receipts,
    (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text) from public.affairs_agent_audit a where not(a.target_id=any(${targets}::uuid[])) or a.target_id is null) as audit`)[0];
  async function verifyFixture(item){assert.ok(fixtures.includes(item)&&uuid(item.id)&&item.id!==ownerId);const [row]=await sql`select id,email,raw_user_meta_data->>'dtm_content_qa_run' as run from auth.users where id=${item.id}`;assert.deepEqual(row,{id:item.id,email:item.email,run:runId});}
  async function captureDerived(){
    // Student insertion intentionally invokes the existing sample-record trigger.
    // These IDs are recovered only through pre-ledgered, verified fixture students.
    const students=await sql`select id,user_id from public.affairs_students where id=any(${studentIds}::uuid[])`;
    for(const row of students){const index=studentIds.indexOf(row.id);assert.ok(index>=0&&fixtures[index].id===row.user_id);await verifyFixture(fixtures[index]);}
    const enrollments=await sql`select id,student_id,source_mode from public.affairs_enrollments where student_id=any(${studentIds}::uuid[]) order by id limit 1001`;
    const charges=await sql`select id,student_id,source_mode from public.affairs_charges where student_id=any(${studentIds}::uuid[]) order by id limit 1001`;
    const assignments=await sql`select a.id,a.student_id,a.source_mode,a.dtm_course_id,e.student_id as enrollment_owner from public.affairs_assignments a left join public.affairs_enrollments e on e.id=a.enrollment_id where a.student_id=any(${studentIds}::uuid[]) and not(a.id=any(${activityIds}::uuid[])) order by a.id limit 1001`;
    for(const [key,rows]of Object.entries({enrollments,charges,assignments})){
      assert.ok(rows.length<=1000);for(const row of rows){assert.ok(studentIds.includes(row.student_id));assert.equal(row.source_mode,'sample');if(key==='assignments'){assert.equal(row.dtm_course_id,null);assert.equal(row.enrollment_owner,row.student_id);}}
      const ids=Array.from(rows,row=>row.id);if(derivedFixtureRows[key].length)assert.deepEqual(ids,derivedFixtureRows[key]);else derivedFixtureRows[key]=ids;
    }
    await ledger();
  }
  async function ownerLogin(){const info=await lstat('.env.owner.local');assert.ok(info.isFile()&&!info.isSymbolicLink()&&(info.mode&0o077)===0);const credentials=parseEnv(await readFile('.env.owner.local','utf8'));
    assert.equal(credentials.CRM_ADMIN_EMAIL?.toLowerCase(),deployment.supabase.ownerEmail.toLowerCase());assert.ok(credentials.CRM_ADMIN_PASSWORD);ownerClient=createClient(url,key,{auth,global:{fetch:projectFetch}});
    const signed=await ownerClient.auth.signInWithPassword({email:credentials.CRM_ADMIN_EMAIL,password:credentials.CRM_ADMIN_PASSWORD});assert.ok(!signed.error&&signed.data.session?.user.id===ownerId);ownerSession=signed.data.session;
    const verified=await ownerClient.auth.getUser(ownerSession.access_token);assert.ok(!verified.error&&verified.data.user?.id===ownerId&&verified.data.user.email?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()&&verified.data.user.identities?.some(row=>row.provider==='google'));}
  async function createFixture(item){assert.ok(runDeadline-Date.now()>settleMs);item.creationState='pending';item.creationSentAt=Date.now();await ledger();const password=randomBytes(32).toString('base64url')+'Aa1!';
    try{const result=await admin.auth.admin.createUser({email:item.email,password,email_confirm:true,user_metadata:{full_name:'Synthetic Course Content QA '+item.number,dtm_content_qa_run:runId}});if(result.data.user){item.id=result.data.user.id;await ledger();}assert.ok(!result.error&&item.id);await verifyFixture(item);item.creationState='created';}
    finally{if(item.creationState==='pending')item.creationState='uncertain';await ledger();}
    item.setupState='pending';await ledger();await lease.transaction(async tx=>{await verifyFixture(item);if(item.google)await tx`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at) values(${item.id},${item.id},${tx.json({sub:item.id,email:item.email,email_verified:true})},'google',now(),now(),now())`;
      await tx`insert into public.affairs_profiles(user_id,email,display_name,role) values(${item.id},${item.email},'Synthetic Course Content QA','student')`;});item.setupState='complete';await ledger();
    const client=createClient(url,key,{auth,global:{fetch:projectFetch}}),signed=await client.auth.signInWithPassword({email:item.email,password});assert.ok(!signed.error&&signed.data.session?.user.id===item.id);sessions.set(item.id,signed.data.session);return signed.data.session;
  }
  async function invoke(endpoint,{session,method='GET',body}={}){
    if(!cleaning)overall.throwIfAborted();const destination=new URL(endpoint,origin);assert.equal(destination.origin,origin);assert.ok(['/api/affairs-data','/api/affairs-manage'].includes(destination.pathname));
    const actorId=session?.user.id??null,token=session?.access_token;if(session){assert.ok(actorId===ownerId||accounts().includes(actorId));assert.equal(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub,actorId);}
    if(actorId===ownerId)assert.ok(contentHttpOwnerRequestAllowed(endpoint,method,body,{fixtures,courses,targets,activityIds,materialIds,operations,ownerId}));
    if(method==='POST')assert.ok(destination.pathname==='/api/affairs-manage'&&operations.some(op=>op.actorId===actorId&&op.kind===body?.kind&&isDeepStrictEqual(op.payload,body?.payload)));
    else assert.ok(destination.pathname==='/api/affairs-data'&&destination.searchParams.get('scope')?.startsWith('dtm-course-content'));
    httpCalls++;if(!local){const timeout=signal(25000),response=await lease.withHeld(()=>nativeFetch(destination,{method,redirect:'error',credentials:'omit',cache:'no-store',headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:timeout}));return {status:response.status,body:await boundedJson(response,timeout),cacheControl:response.headers.get('cache-control')};}
    const result={status:200,body:null,cacheControl:null},response={status(code){result.status=code;return response;},json(value){result.body=value;},setHeader(name,value){if(name.toLowerCase()==='cache-control')result.cacheControl=value;}},query={};
    for(const key of new Set(destination.searchParams.keys())){const values=destination.searchParams.getAll(key);query[key]=values.length===1?values[0]:values;}
    await lease.withHeld(()=>handlers[destination.pathname]({method,headers:token?{authorization:'Bearer '+token}:{},query,body},response));return result;
  }
  const request=async(endpoint,session,status=200)=>{const result=await track(invoke(endpoint,{session}));assert.equal(result.status,status,phase+' read');assert.match(result.cacheControl||'',/no-store/);return result.body;};
  const cursorQuery=cursor=>cursor?'&after_kind='+cursor.kind+'&after_id='+cursor.id:'';
  const personal=async(session,courseId,cursor)=>parseDtmCourseContentData(await request('/api/affairs-data?scope=dtm-course-content&course_id='+courseId+cursorQuery(cursor),session),session.user.id,courseId,cursor);
  const manager=async(userId,courseId,cursor)=>parseDtmCourseContentData(await request('/api/affairs-data?scope=dtm-course-content-admin&user_id='+userId+'&course_id='+courseId+cursorQuery(cursor),ownerSession),userId,courseId,cursor);
  const detail=async(session,courseId,assignmentId)=>parseDtmCourseContentAssignmentData(await request('/api/affairs-data?scope=dtm-course-content-assignment&course_id='+courseId+'&assignment_id='+assignmentId,session),session.user.id,courseId,assignmentId);
  async function complete(session,courseId){const first=await personal(session,courseId),activities=[...first.activities];let cursor=first.nextCursor;const seen=new Set();
    while(cursor){const key=cursor.kind+':'+cursor.id;assert.ok(!seen.has(key));seen.add(key);const next=await personal(session,courseId,cursor);assert.equal(next.revision,first.revision);assert.equal(next.total,first.total);assert.deepEqual(next.content,first.content);activities.push(...next.activities);cursor=next.nextCursor;}
    assert.equal(activities.length,first.total);assert.equal(new Set(activities.map(row=>row.kind+':'+row.id)).size,activities.length);return {...first,activities,nextCursor:null};
  }
  async function prepare(command,session){assert.ok(runDeadline-Date.now()>settleMs&&operations.length<100);assert.equal(validateDtmCourseContentPayload(command.kind,command.payload),null);
    assert.ok(targets.includes(command.payload.id)&&accounts().includes(command.payload.user_id)&&courseIds.includes(command.payload.course_id));if(command.kind===saveKind)for(const ref of command.payload.content.references)assert.ok((ref.kind==='assignment'?activityIds:materialIds).includes(ref.id));const op={actorId:session?.user.id??null,...structuredClone(command),sentAt:Date.now(),state:'pending'};operations.push(op);return op;}
  async function send(op,session){return track((async()=>{try{const result=await invoke('/api/affairs-manage',{method:'POST',session,body:{kind:op.kind,payload:op.payload}});op.status=result.status;op.state=contentHttpTerminal(op,result)?'terminal':'uncertain';
    assert.match(result.cacheControl||'',/no-store/);if(result.status===200){assert.ok(contentHttpValidReceipt(op,result.body));op.result=result.body;successes.set(op.actorId+':'+op.payload.request_id,op);}return result;
  }finally{if(op.state==='pending')op.state='uncertain';await ledger();}})());}
  async function action(kind,payload,{session=ownerSession,status=200}={}){const op=await prepare({kind,payload},session);await ledger();const result=await send(op,session);assert.equal(result.status,status,phase+' mutation');return result.body;}
  async function concurrent(commands){const settled=await contentHttpDispatchBatch(commands,{prepare:command=>prepare(command,ownerSession),persist:()=>ledger(),send:op=>send(op,ownerSession)});assert.ok(settled.every(row=>row.status==='fulfilled'));return settled.map(row=>row.value);}
  async function receiptProof(){const rows=await sql`select actor_id,user_id,course_id,request_id,kind,payload,result from private.dtm_course_content_operations where course_id=any(${courseIds}::uuid[])`;
    assert.equal(rows.length,successes.size);for(const row of rows){const op=successes.get(row.actor_id+':'+row.request_id);assert.ok(op);assert.equal(row.user_id,op.payload.user_id);assert.equal(row.course_id,op.payload.course_id);assert.equal(row.kind,op.kind);assert.deepEqual(row.payload,op.payload);assert.deepEqual(row.result,op.result);}return rows;}
  try{
    lease=await dormReserveLease(pool,{onLost:()=>leaseAbort.abort(Error('Physical course-content lease lost.'))});sql=lease.sql;
    await contentHttpAssertNoRetainedLedgers(root);assert.equal(execFileSync('git',['check-ignore',ledgerPath],{encoding:'utf8'}).trim(),ledgerPath);await mkdir(root,{recursive:true,mode:0o700});await mkdir(output,{mode:0o700});ledgerReady=true;await ledger();assert.equal((await stat(output)).mode&0o077,0);assert.equal((await stat(ledgerPath)).mode&0o077,0);
    schemaBefore=await schema();assert.deepEqual({migrations:schemaBefore.migrations,rls:schemaBefore.rls},contentHttpExpectedSchema);
    assert.equal((await sql`select count(*)::int as n from supabase_migrations.schema_migrations where version in ('20261114000000','20261114010000')`)[0].n,2);
    assert.equal((await sql`select relrowsecurity from pg_class where oid='public.dtm_course_contents'::regclass`)[0].relrowsecurity,true);
    const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin' where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'Existing protected administrator required; no repair/promotion.');ownerId=owner.id;ownerBefore=await fingerprint(ownerId);unrelatedBefore=await unrelated();await ledger();
    for(const query of [()=>sql`select id from public.affairs_programs where id=${programId}`,()=>sql`select id from public.affairs_students where id=any(${studentIds}::uuid[])`,()=>sql`select id from public.affairs_assignments where id=any(${activityIds}::uuid[])`,()=>sql`select id from public.dtm_materials where id=any(${materialIds}::uuid[])`,()=>sql`select id from public.dtm_courses where id=any(${courseIds}::uuid[])`,()=>sql`select id from public.dtm_course_contents where id=any(${targets}::uuid[])`,()=>sql`select id from public.affairs_agent_audit where target_id=any(${targets}::uuid[])`,()=>sql`select id from public.dtm_grade_items where id=${legacyId}`])assert.equal((await query()).length,0);
    // Handler internals may contact only this Supabase project while the same
    // physical lease is held. Production never imports or substitutes handlers.
    if(local)globalThis.fetch=(input,init={})=>{const destination=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(destination.origin,url);
      assert.ok(destination.pathname==='/auth/v1/user'||/^\/rest\/v1\/(?:rpc\/dtm_course_content_access|rpc\/dtm_grade_report_courses_admin|rpc\/dtm_course_content_read|rpc\/dtm_course_content_admin|rpc\/dtm_course_content_assignment|rpc\/dtm_manage_course_content)$/.test(destination.pathname));return projectFetch(input,init);};
    phase='fixture identities';await ownerLogin();const first=await createFixture(fixtures[0]),second=await createFixture(fixtures[1]),nonGoogle=await createFixture(fixtures[2]);
    phase='fixture courses and activities';for(const item of fixtures)await verifyFixture(item);
    await lease.transaction(async tx=>{const rows=courses.map(row=>({...row,user_id:fixtures[row.fixture-1].id}));await tx`insert into public.dtm_courses(id,user_id,code,title,term,source_mode) select id,user_id,code,title,term,'personal' from jsonb_to_recordset(${tx.json(rows)}::jsonb) as c(id uuid,user_id uuid,code text,title text,term text)`;
      await tx`insert into public.affairs_programs(id,code,name,department) values(${programId},${'QA-'+programId},'Synthetic content program','Synthetic department')`;
      for(let index=0;index<2;index++)await tx`insert into public.affairs_students(id,user_id,student_number,full_name,program_id,year_level) values(${studentIds[index]},${fixtures[index].id},${'QA-'+fixtures[index].id},'Synthetic Content QA',${programId},1)`;
      const activityRows=activityIds.slice(0,104).map((id,index)=>({id,student_id:studentIds[index===103?1:0],course_id:courseIds[index===103?102:index===102?1:0],title:'Synthetic activity '+index}));
      await tx`insert into public.affairs_assignments(id,student_id,dtm_course_id,title,source_mode) select id,student_id,course_id,title,'personal' from jsonb_to_recordset(${tx.json(activityRows)}::jsonb) as a(id uuid,student_id uuid,course_id uuid,title text)`;
      await tx`insert into public.dtm_materials(id,course_id,title,kind,summary,position,source_mode) values(${materialIds[0]},${courseIds[0]},'Synthetic page material','page','',1,'personal'),(${materialIds[1]},${courseIds[102]},'Synthetic foreign material','page','',2,'personal')`;
      await tx`insert into public.dtm_grade_items(id,course_id,label,score,maximum) values(${legacyId},${courseIds[0]},'Synthetic unchanged legacy tracker',66,100)`;});
    await captureDerived();
    phase='strict own and admin reads';const empty=await personal(first,courseIds[0]);assert.equal(empty.content,null);assert.equal(empty.total,103);assert.equal((await manager(first.user.id,courseIds[0])).content,null);
    const all=await complete(first,courseIds[0]);assert.deepEqual(all.activities.map(row=>row.kind+':'+row.id),[...activityIds.slice(0,102).map(id=>'assignment:'+id),'material:'+materialIds[0]]);
    const coursePage=parseDtmCourseContentCoursesData(await request('/api/affairs-data?scope=dtm-course-content-courses-admin&user_id='+first.user.id,ownerSession),first.user.id);
    const courseNext=parseDtmCourseContentCoursesData(await request('/api/affairs-data?scope=dtm-course-content-courses-admin&user_id='+first.user.id+'&after_id='+coursePage.nextCursor,ownerSession),first.user.id,coursePage.nextCursor);
    assert.deepEqual([...coursePage.courses,...courseNext.courses].map(row=>row.id),courseIds.slice(0,102));assert.equal(courseNext.nextCursor,null);assert.equal((await manager(first.user.id,courseIds[101])).total,0);
    const adminPage=await manager(first.user.id,courseIds[0]);assert.equal((await manager(first.user.id,courseIds[0],adminPage.nextCursor)).activities.length,3);
    for(const session of [undefined,nonGoogle])await request('/api/affairs-data?scope=dtm-course-content&course_id='+courseIds[0],session,401);
    await request('/api/affairs-data?scope=dtm-course-content&course_id='+courseIds[0],second,403);
    await request('/api/affairs-data?scope=dtm-course-content-admin&user_id='+first.user.id+'&course_id='+courseIds[0],second,403);
    await request('/api/affairs-data?scope=dtm-course-content-courses-admin&user_id='+first.user.id,first,403);
    for(const suffix of ['&user_id='+second.user.id,'&course_id='+courseIds[1],'&scope=dtm-course-content','&after_kind=assignment','&after_id='+activityIds[0]])await request('/api/affairs-data?scope=dtm-course-content&course_id='+courseIds[0]+suffix,first,400);
    assert.equal((await detail(first,courseIds[0],activityIds[101])).assignment.id,activityIds[101]);
    for(const id of [activityIds[102],activityIds[103],randomUUID()])assert.deepEqual(await detail(first,courseIds[0],id),{assignment:null});
    await request('/api/affairs-data?scope=dtm-course-content-assignment&course_id='+courseIds[0]+'&assignment_id='+activityIds[101],second,403);
    checks.push('actual-jwt-own-and-admin103-activity102-course-pages-exact-assignment-without-generic-snapshot-and-auth-boundaries');
    phase='explicit placement and ownership';const references=[{kind:'assignment',id:activityIds[0],section:'quizzes'},{kind:'material',id:materialIds[0],section:'materials'},{kind:'assignment',id:activityIds[1],section:'assignments'}];
    const initial=contentHttpFixture(targets[0],first.user.id,courseIds[0],references);
    for(const [session,status]of [[first,403],[second,403],[nonGoogle,401],[null,401]])await action(saveKind,initial,{session,status});
    const firstReceipt=await action(saveKind,initial);assert.deepEqual(await action(saveKind,initial),firstReceipt);
    const other=contentHttpFixture(targets[1],second.user.id,courseIds[102],[{kind:'assignment',id:activityIds[103],section:'quizzes'}]);await action(saveKind,other);
    for(const load of [()=>personal(first,courseIds[0]),()=>manager(first.user.id,courseIds[0])]){const content=(await load()).content;assert.equal(content.version,1);assert.deepEqual(content.references,initial.content.references);}
    assert.deepEqual((await personal(second,courseIds[102])).content.references,other.content.references);
    const next=payload=>({...payload,request_id:randomUUID()});
    for(const ref of [{kind:'assignment',id:activityIds[102],section:'assignments'},{kind:'assignment',id:activityIds[103],section:'assignments'},{kind:'material',id:materialIds[1],section:'materials'}])await action(saveKind,next({...initial,expected_version:1,content:{references:[ref]}}),{status:409});
    checks.push('ordered-backing-table-references-quiz-section-independent-type-and-same-owner-other-course-rejection');
    phase='full inventory revisions and stale references';const before=await personal(first,courseIds[0]);
    activityEdits.push({kind:'update-assignment-details',id:activityIds[101],state:'pending'});await ledger();await sql`update public.affairs_assignments set details='Synthetic offpage change' where id=${activityIds[101]} and dtm_course_id=${courseIds[0]} and student_id=${studentIds[0]}`;activityEdits.at(-1).state='complete';await ledger();
    const afterOffpage=await personal(first,courseIds[0]);assert.notEqual(afterOffpage.revision,before.revision);assert.deepEqual(afterOffpage.activities,before.activities);
    activityEdits.push({kind:'delete-assignment',id:activityIds[0],state:'pending'},{kind:'move-material',id:materialIds[0],courseId:courseIds[102],state:'pending'},{kind:'add-assignment',id:activityIds[104],state:'pending'});await ledger();
    await lease.transaction(async tx=>{await tx`delete from public.affairs_assignments where id=${activityIds[0]} and dtm_course_id=${courseIds[0]} and student_id=${studentIds[0]}`;
      await tx`update public.dtm_materials set course_id=${courseIds[102]} where id=${materialIds[0]} and course_id=${courseIds[0]}`;
      await tx`insert into public.affairs_assignments(id,student_id,dtm_course_id,title,source_mode) values(${activityIds[104]},${studentIds[0]},${courseIds[0]},'Synthetic new unplaced activity','personal')`;});
    for(const edit of activityEdits)edit.state='complete';await ledger();const stale=await complete(first,courseIds[0]);assert.equal(stale.unavailableReferenceCount,2);assert.equal(stale.total,102);
    assert.deepEqual(stale.content.references,references);assert.ok(stale.activities.some(row=>row.id===activityIds[104]));assert.ok(stale.activities.every(row=>row.kind==='assignment'&&row.id!==activityIds[0]));
    assert.notEqual(stale.revision,afterOffpage.revision);assert.deepEqual(await detail(first,courseIds[0],activityIds[0]),{assignment:null});
    assert.deepEqual(await action(saveKind,initial),firstReceipt);await action(saveKind,next({...initial,expected_version:1}),{status:409});
    checks.push('full-revision-offpage-edit-deleted-and-foreign-moved-targets-inert-new-unplaced-retained-and-exact-late-replay');
    phase='version retries and real concurrency';const changed=next({...initial,expected_version:1,content:{references:[references[2]]}});
    const duplicate=await concurrent([{kind:saveKind,payload:changed},{kind:saveKind,payload:changed}]);assert.deepEqual(duplicate.map(row=>row.status),[200,200]);assert.deepEqual(duplicate[0].body,duplicate[1].body);
    await action(saveKind,next(changed),{status:409});await action(saveKind,{...changed,content:{references:[]}},{status:409});
    await action(saveKind,next({...changed,user_id:second.user.id,course_id:courseIds[102],expected_version:2}),{status:403});
    const candidates=['assignments','quizzes'].map(section=>({kind:saveKind,payload:next({...changed,expected_version:2,content:{references:[{...references[2],section}]}})})),raced=await concurrent(candidates);
    assert.deepEqual(raced.map(row=>row.status).sort(),[200,409]);const winner=raced.findIndex(row=>row.status===200);assert.deepEqual((await personal(first,courseIds[0])).content.references,candidates[winner].payload.content.references);
    const remove={id:initial.id,user_id:first.user.id,course_id:courseIds[0],request_id:randomUUID(),expected_version:3},mixed=await concurrent([{kind:deleteKind,payload:remove},{kind:saveKind,payload:next({...changed,expected_version:3})}]);
    assert.deepEqual(mixed.map(row=>row.status).sort(),[200,409]);if(mixed[0].status!==200)await action(deleteKind,next({...remove,expected_version:4}));
    const reset=await personal(first,courseIds[0]);assert.equal(reset.content,null);assert.equal(reset.total,102);assert.deepEqual(await action(saveKind,initial),firstReceipt);await action(saveKind,next(initial),{status:409});
    const replacement=contentHttpFixture(targets[3],first.user.id,courseIds[0]);await action(saveKind,replacement);assert.equal((await personal(first,courseIds[0])).content.id,replacement.id);
    checks.push('concurrent-duplicate-request-cas-and-save-delete-races-tombstone-and-new-id-replacement');
    phase='audit and preservation';await receiptProof();assert.equal((await sql`select count(*)::int as n from public.affairs_agent_audit where user_id=${ownerId} and target_id=any(${targets}::uuid[])`)[0].n,successes.size);
    assert.deepEqual((await sql`select score::text as score,maximum::text as maximum from public.dtm_grade_items where id=${legacyId}`)[0],{score:'66.00',maximum:'100.00'});assert.deepEqual(await fingerprint(ownerId),ownerBefore);assert.deepEqual(await unrelated(),unrelatedBefore);
    await releaseGuard();if(local)assert.deepEqual(await hashes(),sourceBefore);checks.push('one-audit-per-receipt-legacy-tracker-protected-owner-unrelated-records-and-release-preserved');passed=true;
  }catch(error){failure=layoutHttpDiagnostic(error,phase);}
  finally{
    cleaning=true;let drained=false,rowsCleaned=false;
    const clean=async(label,task)=>{try{await task();return true;}catch(error){cleanupFailures.push(label);if(cleanupDiagnostics.length<16)cleanupDiagnostics.push(layoutHttpDiagnostic(error,label));return false;}};
    const held=(label,task)=>clean(label,()=>lease.withHeld(task));
    if(ledgerReady){
      await clean('inflight-drain',async()=>{let timer;try{await Promise.race([Promise.allSettled([...active]),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Undrained operations')),35000);})]);assert.equal(active.size,0);drained=true;}finally{clearTimeout(timer);}});
      if(drained)await held('uncertain-write-reconciliation',()=>contentHttpReconcileWrites(operations,{readReceipt:op=>sql`select actor_id,user_id,course_id,request_id,kind,payload,result from private.dtm_course_content_operations where actor_id=${op.actorId} and request_id=${op.payload.request_id}`}));
      await held('uncertain-auth-reconciliation',()=>layoutHttpReconcileCreates(fixtures,{runId,ownerId,lookup:item=>sql`select id,email,raw_user_meta_data->>'dtm_content_qa_run' as run from auth.users where email=${item.email}`}));
      const safe=lease&&!lease.lost&&contentHttpCleanupAllowed({operations,fixtures,drained});
      if(safe&&accounts().length)rowsCleaned=await held('exact-content-course-cleanup',async()=>{
        for(const item of fixtures)if(item.id)await verifyFixture(item);await captureDerived();for(const op of operations)if(op.result)successes.set(op.actorId+':'+op.payload.request_id,op);const receipts=await receiptProof();
        const persisted=await sql`select id,user_id,course_id from public.dtm_course_contents where id=any(${targets}::uuid[]) or user_id=any(${accounts()}::uuid[])`;
        for(const row of persisted)assert.ok(targets.includes(row.id)&&accounts().includes(row.user_id)&&courseIds.includes(row.course_id));
        const ownedCourses=await sql`select id,user_id from public.dtm_courses where id=any(${courseIds}::uuid[]) or user_id=any(${accounts()}::uuid[])`;
        for(const row of ownedCourses){const planned=courses.find(course=>course.id===row.id);assert.ok(planned&&fixtures[planned.fixture-1].id===row.user_id);}
        const ownedAssignments=await sql`select a.id,a.dtm_course_id,s.user_id from public.affairs_assignments a join public.affairs_students s on s.id=a.student_id where a.id=any(${activityIds}::uuid[]) or a.dtm_course_id=any(${courseIds}::uuid[])`;
        for(const row of ownedAssignments){const index=activityIds.indexOf(row.id);assert.ok(index>=0);assert.equal(row.user_id,fixtures[index===103?1:0].id);assert.equal(row.dtm_course_id,courseIds[index===103?102:index===102?1:0]);}
        const ownedMaterials=await sql`select m.id,m.course_id,c.user_id from public.dtm_materials m join public.dtm_courses c on c.id=m.course_id where m.id=any(${materialIds}::uuid[]) or m.course_id=any(${courseIds}::uuid[])`;
        for(const row of ownedMaterials){assert.ok(materialIds.includes(row.id));const allowed=row.id===materialIds[0]?[courseIds[0],courseIds[102]]:[courseIds[102]];assert.ok(allowed.includes(row.course_id));assert.equal(row.user_id,fixtures[row.course_id===courseIds[102]?1:0].id);}
        const ownedStudents=await sql`select id,user_id,program_id from public.affairs_students where id=any(${studentIds}::uuid[]) or user_id=any(${accounts()}::uuid[])`;
        for(const row of ownedStudents){const index=studentIds.indexOf(row.id);assert.ok(index>=0);assert.equal(row.user_id,fixtures[index].id);assert.equal(row.program_id,programId);}
        await lease.transaction(async tx=>{for(const row of receipts)await tx`delete from private.dtm_course_content_operations where actor_id=${row.actor_id} and request_id=${row.request_id} and course_id=${row.course_id}`;
          await tx`delete from public.affairs_agent_audit where user_id=${ownerId} and target_id=any(${targets}::uuid[]) and action_kind=any(${kinds}::text[])`;
          await tx`delete from public.dtm_courses where id=any(${courseIds}::uuid[]) and user_id=any(${accounts()}::uuid[])`;});
      });
      if(safe&&(!accounts().length||rowsCleaned))for(const item of fixtures)if(item.id)await held('exact-auth-delete-'+item.number,async()=>{await verifyFixture(item);item.deletionState='pending';await ledger();
        for(let attempt=0;attempt<3;attempt++){try{await admin.auth.admin.deleteUser(item.id);}catch{/* Exact absence decides whether retry is required. */}if(!(await sql`select id from auth.users where id=${item.id}`).length){item.deletionState='deleted';await ledger();return;}}assert.fail('Fixture deletion unresolved.');});
      if(safe)await held('exact-residue-proof',async()=>{
        assert.equal((await sql`select id from auth.users where id=any(${accounts()}::uuid[]) or email=any(${fixtures.map(item=>item.email)}::text[])`).length,0);
        assert.equal((await sql`select user_id from auth.identities where user_id=any(${accounts()}::uuid[])`).length,0);assert.equal((await sql`select user_id from public.affairs_profiles where user_id=any(${accounts()}::uuid[])`).length,0);
        assert.equal((await sql`select id from public.affairs_students where id=any(${studentIds}::uuid[]) or user_id=any(${accounts()}::uuid[])`).length,0);
        assert.equal((await sql`select id from public.affairs_enrollments where student_id=any(${studentIds}::uuid[]) or id=any(${derivedFixtureRows.enrollments}::uuid[])`).length,0);assert.equal((await sql`select id from public.affairs_charges where student_id=any(${studentIds}::uuid[]) or id=any(${derivedFixtureRows.charges}::uuid[])`).length,0);
        assert.equal((await sql`select id from public.affairs_assignments where student_id=any(${studentIds}::uuid[]) or id=any(${derivedFixtureRows.assignments}::uuid[])`).length,0);
        assert.equal((await sql`select id from public.affairs_assignments where id=any(${activityIds}::uuid[])`).length,0);assert.equal((await sql`select id from public.dtm_materials where id=any(${materialIds}::uuid[])`).length,0);
        const programs=await sql`select id,code from public.affairs_programs where id=${programId}`;if(programs.length){assert.equal(programs.length,1);assert.deepEqual(programs[0],{id:programId,code:'QA-'+programId});assert.equal((await sql`select id from public.affairs_students where program_id=${programId}`).length,0);await sql`delete from public.affairs_programs where id=${programId} and code=${'QA-'+programId}`;}
        assert.equal((await sql`select id from public.affairs_programs where id=${programId}`).length,0);
        assert.equal((await sql`select id from public.dtm_courses where id=any(${courseIds}::uuid[])`).length,0);assert.equal((await sql`select id from public.dtm_grade_items where id=${legacyId}`).length,0);
        assert.equal((await sql`select id from public.dtm_course_contents where id=any(${targets}::uuid[]) or user_id=any(${accounts()}::uuid[])`).length,0);
        assert.equal((await sql`select request_id from private.dtm_course_content_operations where course_id=any(${courseIds}::uuid[]) or user_id=any(${accounts()}::uuid[])`).length,0);
        assert.equal((await sql`select id from public.affairs_agent_audit where target_id=any(${targets}::uuid[])`).length,0);
      });else cleanupFailures.push('unresolved-recovery-ledger');
      if(ownerSession)await held('owner-local-signout',async()=>assert.ok(!(await ownerClient.auth.signOut({scope:'local'})).error));
      if(ownerBefore)await held('protected-owner-fingerprint',async()=>assert.deepEqual(await fingerprint(ownerId),ownerBefore));if(unrelatedBefore)await held('unrelated-records-and-legacy',async()=>assert.deepEqual(await unrelated(),unrelatedBefore));
      if(schemaBefore)await held('unchanged-schema-history',async()=>assert.deepEqual(await schema(),schemaBefore));
    }
    globalThis.fetch=nativeFetch;if(lease)await clean('lease-release',()=>lease.release());if(lease?.lost)cleanupFailures.push('physical-session-lost');connectionClosed=await clean('database-close',()=>pool.end({timeout:5}));cleanupVerified=ledgerReady&&cleanupFailures.length===0;
    if(ledgerReady)await ledger(cleanupVerified?'cleaned':'cleanup-required');
    const result={passed:passed&&cleanupVerified,mode,revision,checks,httpCalls,successfulWrites:successes.size,cleanupVerified,connectionClosed,cleanupFailures,cleanupDiagnostics,failure,sourceHashes:sourceBefore,
      limitations:['Actual-JWT API acceptance; no browser/model/official requests.','Existing protected owner used only for verified admin requests against synthetic targets; volatile Auth login timestamps excluded from owner fingerprint.','Fixtures use privileged exact-ID setup; content writes and persistence reads use real caller JWT handlers or deployed HTTP.'],artifacts:ledgerReady?output:null};
    if(ledgerReady)await writeFile(output+'/result.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length===3&&process.argv[2]==='--self-test')console.log(JSON.stringify(await contentHttpOfflineChecks()));else await run();
}

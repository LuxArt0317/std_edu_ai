import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,opendir,readFile,rename,stat,writeFile,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {isDeepStrictEqual,parseEnv} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dtmGradeReportMaxResponseBytes,parseDtmGradeReportData,parseDtmGradeReportReceipt,parseDtmGradeReportCoursesData,parseDtmGradeReportOverviewData,validateDtmGradeReportPayload} from '../../server/dtmGradeReport.js';
import {dormReserveLease,dormClientTarget} from './dormitory-conduct-http-live.mjs';
import {layoutHttpDiagnostic,layoutHttpReconcileCreates} from './dtm-dashboard-layout-http-live.mjs';

// PREPARED ONLY. Root must authorize --execute with its sole live lease after
// migration application and review. Import/--self-test never loads credentials.
// Local mode invokes actual handlers with actual JWTs; production uses deployed
// HTTP. No browser, university, model, Storage, owner repair or owner data write.
const clientRoot='/Users/winsonbaring/Documents/GitHub/std_edu_ai-luxart0317',project='xiftudmvxphxcjtmfmib';
const saveKind='save_dtm_grade_report',deleteKind='delete_dtm_grade_report',kinds=[saveKind,deleteKind],settleMs=30000;
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export const gradeHttpExpectedSchema=Object.freeze({migrations:134,rls:151});
export function gradeHttpOptions(args,env={}){
  if(args.length===1&&args[0]==='--self-test')return {selfTest:true};
  assert.deepEqual(args,['--execute'],'Only --self-test is permitted without the root live lease.');
  const origin=env.NATIVE_ORIGIN,local=['http://127.0.0.1:5184','http://localhost:5184'].includes(origin);
  assert.ok(local||origin==='https://stu.best');const revision=local?env.EXPECTED_SOURCE_REVISION:env.EXPECTED_RELEASE_REVISION;
  assert.match(revision||'',/^[0-9a-f]{40}$/);return {selfTest:false,origin,local,revision,mode:local?'actual_jwt_local_handlers':'deployed_http'};
}
const cells=()=>({score:null,maximum:null,gradeText:null,rangeText:null,percentageText:null,weightText:null,weightNote:null,rankText:null,feedbackText:null,contributionText:null});
export function gradeHttpFixture(id,userId,courseId,requestId=randomUUID()){
  return {id,user_id:userId,course_id:courseId,request_id:requestId,expected_version:0,report:{items:[
    {...cells(),id:randomUUID(),label:'Synthetic literal assessment',activityKind:'assignment',score:0,maximum:100,gradeText:null,rangeText:'0–100',weightText:'0.00 %',weightNote:'(empty)',feedbackText:''},
    {...cells(),id:randomUUID(),label:'Synthetic independent assessment',activityKind:null,gradeText:'Literal grade',percentageText:'uncomputed'}],total:{...cells(),gradeText:'0'}}};
}
export function gradeHttpValidReceipt(op,value){try{parseDtmGradeReportReceipt(value,op.kind,op.payload);return true;}catch{return false;}}
export function gradeHttpTerminal(op,result){return result.status===200?gradeHttpValidReceipt(op,result.body):[400,401,403,409].includes(result.status)&&typeof result.body?.error==='string'&&Boolean(result.body.error);}
export async function gradeHttpReconcileWrites(operations,{readReceipt,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const pending=operations.filter(op=>['pending','uncertain'].includes(op.state));
  for(const op of pending)assert.ok(Number.isFinite(op.sentAt));const delay=Math.max(0,...pending.map(op=>op.sentAt+settleMs-now()));assert.ok(delay<=settleMs);if(delay)await wait(delay);
  for(const op of pending){assert.ok(uuid(op.actorId),'Uncertain anonymous operation requires recovery, never guessed absence.');
    const rows=await readReceipt(op);assert.equal(rows.length,1,'Uncertain operation has no exact durable receipt.');const row=rows[0];
    assert.equal(row.actor_id,op.actorId);assert.equal(row.user_id,op.payload.user_id);assert.equal(row.course_id,op.payload.course_id);assert.equal(row.request_id,op.payload.request_id);
    assert.equal(row.kind,op.kind);assert.deepEqual(row.payload,op.payload);assert.ok(gradeHttpValidReceipt(op,row.result));op.result=row.result;op.state='reconciled';}
}
export function gradeHttpCleanupAllowed({operations,fixtures,drained}){return drained===true&&operations.every(op=>['terminal','reconciled'].includes(op.state))&&fixtures.every(item=>!item.creationState||item.creationState==='created');}
/** Persist every command before dispatch; drain every promise before assertions. */
export async function gradeHttpDispatchBatch(commands,{prepare,persist,send}){
  const operations=[];for(const command of commands)operations.push(await prepare(command));await persist();
  return Promise.allSettled(operations.map(op=>Promise.resolve().then(()=>send(op))));
}
export function gradeHttpOwnerRequestAllowed(endpoint,method,body,{fixtures,courses,targets,operations,ownerId}){
  const url=new URL(endpoint,'https://stu.best'),ids=fixtures.flatMap(item=>item.id?[item.id]:[]);
  if(method==='GET')return url.pathname==='/api/affairs-data'&&['dtm-grade-report-admin','dtm-grade-report-courses-admin'].includes(url.searchParams.get('scope'))
    &&ids.includes(url.searchParams.get('user_id'))&&[...url.searchParams.keys()].every(key=>['scope','user_id','course_id','after_id'].includes(key))
    &&(!url.searchParams.has('course_id')||courses.some(row=>row.id===url.searchParams.get('course_id')))
    &&(!url.searchParams.has('after_id')||courses.some(row=>row.id===url.searchParams.get('after_id')));
  return method==='POST'&&url.pathname==='/api/affairs-manage'&&url.search===''&&kinds.includes(body?.kind)&&targets.includes(body?.payload?.id)
    &&ids.includes(body?.payload?.user_id)&&courses.some(row=>row.id===body?.payload?.course_id)
    &&operations.some(op=>op.actorId===ownerId&&op.kind===body.kind&&isDeepStrictEqual(op.payload,body.payload));
}
const ledgerLimits=Object.freeze({entries:256,runs:64,fileBytes:512*1024,totalBytes:8*1024*1024});
export function gradeHttpCleanedLedger(value,folder){
  assert.ok(value&&uuid(value.runId));const local=folder.startsWith('local-');assert.equal(folder,(local?'local-':'production-')+value.runId);
  const options=gradeHttpOptions(['--execute'],{NATIVE_ORIGIN:value.origin,EXPECTED_SOURCE_REVISION:value.revision,EXPECTED_RELEASE_REVISION:value.revision});
  assert.equal(options.local,local);assert.equal(value.mode,options.mode);assert.equal(value.state,'cleaned');assert.equal(value.cleanupVerified,true);assert.equal(value.connectionClosed,true);assert.deepEqual(value.cleanupFailures,[]);
  assert.ok(value.ownerId===null||uuid(value.ownerId));assert.ok(Array.isArray(value.fixtures)&&value.fixtures.length===3&&Array.isArray(value.operations)&&value.operations.length<=100);
  const seen=new Set();for(const [index,item]of value.fixtures.entries()){
    assert.equal(item.number,index+1);assert.equal(item.google,index<2);assert.match(item.email,/^dtm-grade-http-[0-9a-f-]{36}@example\.invalid$/);
    if(item.id){assert.ok(uuid(item.id)&&item.id!==value.ownerId&&!seen.has(item.id));seen.add(item.id);assert.equal(item.creationState,'created');assert.equal(item.deletionState,'deleted');}
    else{assert.equal(item.id,null);assert.equal(item.creationState,undefined);}
  }
  assert.ok(Array.isArray(value.courses)&&value.courses.length===103&&new Set(value.courses.map(row=>row.id)).size===103);
  for(const [index,row]of value.courses.entries()){assert.ok(uuid(row.id));assert.equal(row.fixture,index===102?2:1);}
  assert.ok(Array.isArray(value.targets)&&value.targets.length===5&&value.targets.every(uuid)&&new Set(value.targets).size===5&&uuid(value.legacyId));
  for(const op of value.operations){assert.ok(op.actorId===null||op.actorId===value.ownerId||seen.has(op.actorId));assert.ok(Number.isFinite(op.sentAt));assert.equal(validateDtmGradeReportPayload(op.kind,op.payload),null);
    assert.ok(value.targets.includes(op.payload.id)&&seen.has(op.payload.user_id)&&value.courses.some(row=>row.id===op.payload.course_id));
    if(op.state==='reconciled'||op.status===200)assert.ok(gradeHttpValidReceipt(op,op.result));else assert.ok(op.state==='terminal'&&[400,401,403,409].includes(op.status));
  }
  assert.ok(gradeHttpCleanupAllowed({...value,drained:true}));
}
export async function gradeHttpAssertNoRetainedLedgers(root='artifacts/dtm-grade-report-http',io={lstat,opendir,open}){
  let info;try{info=await io.lstat(root);}catch(error){if(error.code==='ENOENT')return;throw error;}assert.ok(info.isDirectory()&&!info.isSymbolicLink());
  let entries=0,runs=0,bytes=0;
  for await(const entry of await io.opendir(root)){
    assert.ok(++entries<=ledgerLimits.entries);if(!/^(?:local|production)-/.test(entry.name))continue;
    const runId=entry.name.slice(entry.name.indexOf('-')+1);assert.ok(uuid(runId)&&++runs<=ledgerLimits.runs);const directory=join(root,entry.name),folder=await io.lstat(directory);assert.ok(folder.isDirectory()&&!folder.isSymbolicLink());let found=0;
    for(const suffix of ['fixture-ledger.json','fixture-ledger.json.next']){let handle;try{handle=await io.open(join(directory,suffix),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      try{const stat=await handle.stat();assert.ok(stat.isFile()&&stat.size>0&&stat.size<=ledgerLimits.fileBytes&&bytes+stat.size<=ledgerLimits.totalBytes);const buffer=Buffer.alloc(stat.size+1),result=await handle.read(buffer,0,buffer.length,0);assert.equal(result.bytesRead,stat.size);bytes+=stat.size;found++;
        const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,result.bytesRead)));assert.equal(value.runId,runId);gradeHttpCleanedLedger(value,entry.name);
      }finally{await handle.close();}}
    assert.ok(found,'Retained run is missing its exact recovery ledger.');
  }
}
async function boundedJson(response,signal,maxBytes=dtmGradeReportMaxResponseBytes){
  assert.ok(response.body&&Number(response.headers.get('content-length')||0)<=maxBytes);const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{for(;;){signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();if(part.done)break;bytes+=part.value.byteLength;assert.ok(bytes<=maxBytes);text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}
  catch(error){void reader.cancel().catch(()=>{});throw error;}finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}
export async function gradeHttpOfflineChecks(){
  assert.deepEqual(gradeHttpOptions(['--self-test']),{selfTest:true});assert.throws(()=>gradeHttpOptions([],{}));assert.throws(()=>gradeHttpOptions(['--execute'],{NATIVE_ORIGIN:'https://stu.best/'}));
  assert.equal(gradeHttpOptions(['--execute'],{NATIVE_ORIGIN:'https://stu.best',EXPECTED_RELEASE_REVISION:'a'.repeat(40)}).mode,'deployed_http');
  dormClientTarget(`postgres://postgres@db.${project}.supabase.co/postgres`);assert.throws(()=>dormClientTarget(`postgres://postgres.${project}@qa.pooler.supabase.com:6543/postgres`));
  const actor=randomUUID(),userId=randomUUID(),courseId=randomUUID(),payload=gradeHttpFixture(randomUUID(),userId,courseId),op={actorId:actor,kind:saveKind,payload,state:'uncertain',sentAt:1000};
  assert.equal(validateDtmGradeReportPayload(saveKind,payload),null);const receipt={id:payload.id,userId,courseId,kind:saveKind,version:1,summary:'Saved local literal report.'};
  assert.ok(gradeHttpTerminal(op,{status:200,body:receipt}));assert.equal(gradeHttpTerminal(op,{status:200,body:{...receipt,userId:actor}}),false);assert.equal(gradeHttpTerminal(op,{status:503,body:{error:'unavailable'}}),false);
  assert.equal(gradeHttpCleanupAllowed({operations:[op],fixtures:[],drained:true}),false);
  await gradeHttpReconcileWrites([op],{now:()=>31000,readReceipt:async()=>[{actor_id:actor,user_id:userId,course_id:courseId,request_id:payload.request_id,kind:saveKind,payload,result:receipt}]});assert.equal(op.state,'reconciled');
  await assert.rejects(gradeHttpReconcileWrites([{...op,state:'uncertain'}],{now:()=>31000,readReceipt:async()=>[]}));
  await assert.rejects(gradeHttpReconcileWrites([{...op,state:'uncertain'}],{now:()=>31000,readReceipt:async()=>[{actor_id:userId,user_id:userId,course_id:courseId,request_id:payload.request_id,kind:saveKind,payload,result:receipt}]}));
  let persisted=false,finished=false;const settled=await gradeHttpDispatchBatch([1,2],{prepare:async x=>x,persist:async()=>{persisted=true;},send:async x=>{assert.ok(persisted);if(x===1)throw Error('synthetic');await new Promise(resolve=>setTimeout(resolve,1));finished=true;return x;}});
  assert.equal(finished,true);assert.deepEqual(settled.map(row=>row.status),['rejected','fulfilled']);
  const scope={fixtures:[{id:userId}],courses:[{id:courseId}],targets:[payload.id],operations:[op],ownerId:actor};
  assert.ok(gradeHttpOwnerRequestAllowed('/api/affairs-manage','POST',{kind:saveKind,payload},scope));assert.equal(gradeHttpOwnerRequestAllowed('/api/affairs-data','GET',undefined,scope),false);
  assert.equal(gradeHttpOwnerRequestAllowed('/api/affairs-manage','POST',{kind:saveKind,payload:{...payload,user_id:actor}},scope),false);
  assert.ok(gradeHttpOwnerRequestAllowed('/api/affairs-data?scope=dtm-grade-report-admin&user_id='+userId+'&course_id='+courseId,'GET',undefined,scope));
  const runId=randomUUID(),ledger={runId,origin:'https://stu.best',revision:'a'.repeat(40),mode:'deployed_http',state:'cleaned',cleanupVerified:true,connectionClosed:true,cleanupFailures:[],ownerId:actor,
    fixtures:[1,2,3].map(number=>({number,id:null,google:number<3,email:`dtm-grade-http-${randomUUID()}@example.invalid`})),courses:Array.from({length:103},(_,index)=>({id:randomUUID(),fixture:index===102?2:1})),targets:Array.from({length:5},()=>randomUUID()),legacyId:randomUUID(),operations:[]};
  gradeHttpCleanedLedger(ledger,'production-'+runId);for(const patch of [{state:'active'},{cleanupVerified:false},{connectionClosed:false},{cleanupFailures:['unresolved']},{origin:'https://other.invalid'},{targets:[]}])assert.throws(()=>gradeHttpCleanedLedger({...ledger,...patch},'production-'+runId));
  assert.throws(()=>gradeHttpCleanedLedger({...ledger,fixtures:[{...ledger.fixtures[0],id:actor,creationState:'created',deletionState:'deleted'},...ledger.fixtures.slice(1)]},'production-'+runId));
  // Unlike SQL-only rollback fixtures, GoTrue reads these identities during
  // both sign-in and deletion. Its timestamp fields must be initialized.
  const source=await readFile(new URL(import.meta.url),'utf8');
  assert.match(source,/insert into auth\.identities\(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at\) values\([^\n]+,'google',now\(\),now\(\),now\(\)\)/);
  return {status:'passed',mode:'offline-contracts',checks:9,databaseConnections:0};
}

async function run(){
  const options=gradeHttpOptions(process.argv.slice(2),process.env),{origin,local,revision,mode}=options;assert.equal(options.selfTest,false);process.umask(0o077);
  assert.equal(await realpath(process.cwd()),clientRoot);assert.equal(await realpath(fileURLToPath(new URL('../../',import.meta.url))),clientRoot);
  const deployment=JSON.parse(await readFile('deployment.json','utf8'));assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);assert.equal(deployment.vercel.productionUrl,'https://stu.best');
  const nativeFetch=globalThis.fetch,sourcePaths=['api/affairs-data.ts','api/affairs-manage.ts','server/dtmGradeReport.js','server/dtmGradeReport.d.ts','supabase/migrations/20261114000000_dtm_grade_reports.sql'];
  const hashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
  async function releaseGuard(){if(local){assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),revision);return;}
    const timeout=AbortSignal.timeout(10000),response=await nativeFetch(origin+'/release.json',{redirect:'error',credentials:'omit',cache:'no-store',signal:timeout});assert.equal(response.status,200);
    const result=await boundedJson(response,timeout,8192);assert.equal(result.revision,revision);assert.equal(result.environment,'production');assert.equal(result.source,'vercel-git');}
  await releaseGuard();const sourceBefore=local?await hashes():null;
  const [{deploymentEnvironment},{createClient},{default:postgres}]=await Promise.all([import('../../scripts/deployment-env.mjs'),import('@supabase/supabase-js'),import('postgres')]);
  const env=deploymentEnvironment();Object.assign(process.env,env);const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;assert.equal(url,`https://${project}.supabase.co`);
  const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;dormClientTarget(connection);
  const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY,serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;assert.ok(key&&serviceKey);
  const runId=randomUUID(),root='artifacts/dtm-grade-report-http',output=root+'/'+(local?'local':'production')+'-'+runId,ledgerPath=output+'/fixture-ledger.json';
  const fixtures=[1,2,3].map(number=>({number,id:null,email:`dtm-grade-http-${randomUUID()}@example.invalid`,google:number<3}));
  const courseIds=Array.from({length:103},()=>randomUUID()).sort(),courses=courseIds.map((id,index)=>({id,fixture:index===102?2:1,code:'QA-'+index,title:'Synthetic grade course '+index,term:'Local fixture term'}));
  const targets=Array.from({length:5},()=>randomUUID()),legacyId=randomUUID(),operations=[],checks=[],active=new Set(),sessions=new Map(),successes=new Map(),accounts=()=>fixtures.flatMap(item=>item.id?[item.id]:[]);
  const runDeadline=Date.now()+8*60000,overall=AbortSignal.timeout(8*60000),leaseAbort=new AbortController(),auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
  let lease,sql,cleaning=false,ownerId=null,ownerBefore=null,ownerSession,ownerClient,schemaBefore,unrelatedBefore,ledgerReady=false,queue=Promise.resolve(),passed=false,phase='preflight',failure=null,httpCalls=0,cleanupVerified=false,connectionClosed=false;
  const cleanupFailures=[],cleanupDiagnostics=[],signal=ms=>AbortSignal.any([leaseAbort.signal,AbortSignal.timeout(ms),...(cleaning?[]:[overall])]);
  const projectFetch=(input,init={})=>{const destination=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(destination.origin,url);return lease.withHeld(()=>nativeFetch(input,{...init,redirect:'error',credentials:'omit',signal:init.signal?AbortSignal.any([init.signal,signal(20000)]):signal(20000)}));};
  const admin=createClient(url,serviceKey,{auth,global:{fetch:projectFetch}}),pool=postgres(connection,{max:1,max_lifetime:0,idle_timeout:0,connect_timeout:15,onclose:()=>lease?.lose(),connection:{statement_timeout:20000},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
  const handlers=local?{'/api/affairs-data':(await import('../../api/affairs-data.ts')).default,'/api/affairs-manage':(await import('../../api/affairs-manage.ts')).default}:null;
  const track=task=>{active.add(task);task.then(()=>active.delete(task),()=>active.delete(task));return task;};
  async function ledger(state='active'){
    const contents=JSON.stringify({runId,origin,revision,mode,state,fixtures,courses,targets,legacyId,ownerId,ownerFingerprint:ownerBefore,operations,cleanupVerified,connectionClosed,cleanupFailures,cleanupDiagnostics},null,2);assert.ok(Buffer.byteLength(contents)<=ledgerLimits.fileBytes);
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
    (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb)::text) from public.dtm_courses c where not(c.id=any(${courseIds}::uuid[]))) as courses,
    (select md5(coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]'::jsonb)::text) from public.dtm_grade_reports g where not(g.id=any(${targets}::uuid[]))) as reports,
    (select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.actor_id,o.request_id),'[]'::jsonb)::text) from private.dtm_grade_report_operations o where not(o.course_id=any(${courseIds}::uuid[]))) as receipts,
    (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text) from public.affairs_agent_audit a where not(a.target_id=any(${targets}::uuid[])) or a.target_id is null) as audit`)[0];
  async function verifyFixture(item){assert.ok(fixtures.includes(item)&&uuid(item.id)&&item.id!==ownerId);const [row]=await sql`select id,email,raw_user_meta_data->>'dtm_grade_qa_run' as run from auth.users where id=${item.id}`;assert.deepEqual(row,{id:item.id,email:item.email,run:runId});}
  async function ownerLogin(){const info=await lstat('.env.owner.local');assert.ok(info.isFile()&&!info.isSymbolicLink()&&(info.mode&0o077)===0);const credentials=parseEnv(await readFile('.env.owner.local','utf8'));
    assert.equal(credentials.CRM_ADMIN_EMAIL?.toLowerCase(),deployment.supabase.ownerEmail.toLowerCase());assert.ok(credentials.CRM_ADMIN_PASSWORD);ownerClient=createClient(url,key,{auth,global:{fetch:projectFetch}});
    const signed=await ownerClient.auth.signInWithPassword({email:credentials.CRM_ADMIN_EMAIL,password:credentials.CRM_ADMIN_PASSWORD});assert.ok(!signed.error&&signed.data.session?.user.id===ownerId);ownerSession=signed.data.session;
    const verified=await ownerClient.auth.getUser(ownerSession.access_token);assert.ok(!verified.error&&verified.data.user?.id===ownerId&&verified.data.user.email?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()&&verified.data.user.identities?.some(row=>row.provider==='google'));}
  async function createFixture(item){assert.ok(runDeadline-Date.now()>settleMs);item.creationState='pending';item.creationSentAt=Date.now();await ledger();const password=randomBytes(32).toString('base64url')+'Aa1!';
    try{const result=await admin.auth.admin.createUser({email:item.email,password,email_confirm:true,user_metadata:{full_name:'Synthetic Grade Report QA '+item.number,dtm_grade_qa_run:runId}});if(result.data.user){item.id=result.data.user.id;await ledger();}assert.ok(!result.error&&item.id);await verifyFixture(item);item.creationState='created';}
    finally{if(item.creationState==='pending')item.creationState='uncertain';await ledger();}
    item.setupState='pending';await ledger();await lease.transaction(async tx=>{await verifyFixture(item);if(item.google)await tx`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at) values(${item.id},${item.id},${tx.json({sub:item.id,email:item.email,email_verified:true})},'google',now(),now(),now())`;
      await tx`insert into public.affairs_profiles(user_id,email,display_name,role) values(${item.id},${item.email},'Synthetic Grade Report QA','student')`;});item.setupState='complete';await ledger();
    const client=createClient(url,key,{auth,global:{fetch:projectFetch}}),signed=await client.auth.signInWithPassword({email:item.email,password});assert.ok(!signed.error&&signed.data.session?.user.id===item.id);sessions.set(item.id,signed.data.session);return signed.data.session;
  }
  async function invoke(endpoint,{session,method='GET',body}={}){
    if(!cleaning)overall.throwIfAborted();const destination=new URL(endpoint,origin);assert.equal(destination.origin,origin);assert.ok(['/api/affairs-data','/api/affairs-manage'].includes(destination.pathname));
    const actorId=session?.user.id??null,token=session?.access_token;if(session){assert.ok(actorId===ownerId||accounts().includes(actorId));assert.equal(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub,actorId);}
    if(actorId===ownerId)assert.ok(gradeHttpOwnerRequestAllowed(endpoint,method,body,{fixtures,courses,targets,operations,ownerId}));
    if(method==='POST')assert.ok(destination.pathname==='/api/affairs-manage'&&operations.some(op=>op.actorId===actorId&&op.kind===body?.kind&&isDeepStrictEqual(op.payload,body?.payload)));
    else assert.ok(destination.pathname==='/api/affairs-data'&&destination.searchParams.get('scope')?.startsWith('dtm-grade-report'));
    httpCalls++;if(!local){const timeout=signal(25000),response=await lease.withHeld(()=>nativeFetch(destination,{method,redirect:'error',credentials:'omit',cache:'no-store',headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:timeout}));return {status:response.status,body:await boundedJson(response,timeout),cacheControl:response.headers.get('cache-control')};}
    const result={status:200,body:null,cacheControl:null},response={status(code){result.status=code;return response;},json(value){result.body=value;},setHeader(name,value){if(name.toLowerCase()==='cache-control')result.cacheControl=value;}},query={};
    for(const key of new Set(destination.searchParams.keys())){const values=destination.searchParams.getAll(key);query[key]=values.length===1?values[0]:values;}
    await lease.withHeld(()=>handlers[destination.pathname]({method,headers:token?{authorization:'Bearer '+token}:{},query,body},response));return result;
  }
  const request=async(endpoint,session,status=200)=>{const result=await track(invoke(endpoint,{session}));assert.equal(result.status,status,phase+' read');assert.match(result.cacheControl||'',/no-store/);return result.body;};
  const personal=async(session,courseId)=>parseDtmGradeReportData(await request('/api/affairs-data?scope=dtm-grade-report&course_id='+courseId,session),session.user.id,courseId);
  const manager=async(userId,courseId)=>parseDtmGradeReportData(await request('/api/affairs-data?scope=dtm-grade-report-admin&user_id='+userId+'&course_id='+courseId,ownerSession),userId,courseId);
  async function prepare(command,session){assert.ok(runDeadline-Date.now()>settleMs&&operations.length<100);assert.equal(validateDtmGradeReportPayload(command.kind,command.payload),null);
    assert.ok(targets.includes(command.payload.id)&&accounts().includes(command.payload.user_id)&&courseIds.includes(command.payload.course_id));const op={actorId:session?.user.id??null,...structuredClone(command),sentAt:Date.now(),state:'pending'};operations.push(op);return op;}
  async function send(op,session){return track((async()=>{try{const result=await invoke('/api/affairs-manage',{method:'POST',session,body:{kind:op.kind,payload:op.payload}});op.status=result.status;op.state=gradeHttpTerminal(op,result)?'terminal':'uncertain';
    assert.match(result.cacheControl||'',/no-store/);if(result.status===200){assert.ok(gradeHttpValidReceipt(op,result.body));op.result=result.body;successes.set(op.actorId+':'+op.payload.request_id,op);}return result;
  }finally{if(op.state==='pending')op.state='uncertain';await ledger();}})());}
  async function action(kind,payload,{session=ownerSession,status=200}={}){const op=await prepare({kind,payload},session);await ledger();const result=await send(op,session);assert.equal(result.status,status,phase+' mutation');return result.body;}
  async function concurrent(commands){const settled=await gradeHttpDispatchBatch(commands,{prepare:command=>prepare(command,ownerSession),persist:()=>ledger(),send:op=>send(op,ownerSession)});assert.ok(settled.every(row=>row.status==='fulfilled'));return settled.map(row=>row.value);}
  async function receiptProof(){const rows=await sql`select actor_id,user_id,course_id,request_id,kind,payload,result from private.dtm_grade_report_operations where course_id=any(${courseIds}::uuid[])`;
    assert.equal(rows.length,successes.size);for(const row of rows){const op=successes.get(row.actor_id+':'+row.request_id);assert.ok(op);assert.equal(row.user_id,op.payload.user_id);assert.equal(row.course_id,op.payload.course_id);assert.equal(row.kind,op.kind);assert.deepEqual(row.payload,op.payload);assert.deepEqual(row.result,op.result);}return rows;}
  try{
    lease=await dormReserveLease(pool,{onLost:()=>leaseAbort.abort(Error('Physical grade-report lease lost.'))});sql=lease.sql;
    await gradeHttpAssertNoRetainedLedgers(root);assert.equal(execFileSync('git',['check-ignore',ledgerPath],{encoding:'utf8'}).trim(),ledgerPath);await mkdir(root,{recursive:true,mode:0o700});await mkdir(output,{mode:0o700});ledgerReady=true;await ledger();assert.equal((await stat(output)).mode&0o077,0);assert.equal((await stat(ledgerPath)).mode&0o077,0);
    schemaBefore=await schema();assert.deepEqual({migrations:schemaBefore.migrations,rls:schemaBefore.rls},gradeHttpExpectedSchema);
    assert.equal((await sql`select count(*)::int as n from supabase_migrations.schema_migrations where version in ('20261113230000','20261114000000')`)[0].n,2);
    assert.equal((await sql`select relrowsecurity from pg_class where oid='public.dtm_grade_reports'::regclass`)[0].relrowsecurity,true);
    const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin' where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'Existing protected administrator required; no repair/promotion.');ownerId=owner.id;ownerBefore=await fingerprint(ownerId);unrelatedBefore=await unrelated();await ledger();
    for(const query of [()=>sql`select id from public.dtm_courses where id=any(${courseIds}::uuid[])`,()=>sql`select id from public.dtm_grade_reports where id=any(${targets}::uuid[])`,()=>sql`select id from public.affairs_agent_audit where target_id=any(${targets}::uuid[])`,()=>sql`select id from public.dtm_grade_items where id=${legacyId}`])assert.equal((await query()).length,0);
    // Handler internals may contact only this Supabase project while the same
    // physical lease is held. Production never imports or substitutes handlers.
    if(local)globalThis.fetch=(input,init={})=>{const destination=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(destination.origin,url);
      assert.ok(destination.pathname==='/auth/v1/user'||/^\/rest\/v1\/(?:dtm_courses|dtm_grade_reports|rpc\/dtm_grade_report_access|rpc\/dtm_grade_report_courses_admin|rpc\/dtm_grade_report_overview|rpc\/dtm_manage_grade_report)$/.test(destination.pathname));return projectFetch(input,init);};
    phase='fixture identities';await ownerLogin();const first=await createFixture(fixtures[0]),second=await createFixture(fixtures[1]),nonGoogle=await createFixture(fixtures[2]);
    phase='fixture courses';for(const item of fixtures)await verifyFixture(item);
    await lease.transaction(async tx=>{const rows=courses.map(row=>({...row,user_id:fixtures[row.fixture-1].id}));await tx`insert into public.dtm_courses(id,user_id,code,title,term,source_mode) select id,user_id,code,title,term,'personal' from jsonb_to_recordset(${tx.json(rows)}::jsonb) as c(id uuid,user_id uuid,code text,title text,term text)`;
      await tx`insert into public.dtm_grade_items(id,course_id,label,score,maximum) values(${legacyId},${courseIds[0]},'Synthetic unchanged legacy tracker',66,100)`;});
    phase='strict own and admin reads';assert.deepEqual(await personal(first,courseIds[0]),{report:null});assert.deepEqual(await manager(first.user.id,courseIds[0]),{report:null});
    const coursePage=parseDtmGradeReportCoursesData(await request('/api/affairs-data?scope=dtm-grade-report-courses-admin&user_id='+first.user.id,ownerSession),first.user.id);
    assert.equal(coursePage.courses.length,100);assert.equal(coursePage.nextCursor,courseIds[99]);
    const courseNext=parseDtmGradeReportCoursesData(await request('/api/affairs-data?scope=dtm-grade-report-courses-admin&user_id='+first.user.id+'&after_id='+coursePage.nextCursor,ownerSession),first.user.id,coursePage.nextCursor);
    assert.deepEqual([...coursePage.courses,...courseNext.courses].map(row=>row.id),courseIds.slice(0,102));assert.equal(courseNext.nextCursor,null);assert.deepEqual(await manager(first.user.id,courseIds[101]),{report:null});
    for(const session of [undefined,nonGoogle])await request('/api/affairs-data?scope=dtm-grade-report&course_id='+courseIds[0],session,401);
    await request('/api/affairs-data?scope=dtm-grade-report&course_id='+courseIds[0],second,403);
    await request('/api/affairs-data?scope=dtm-grade-report-admin&user_id='+first.user.id+'&course_id='+courseIds[0],second,403);
    await request('/api/affairs-data?scope=dtm-grade-report-courses-admin&user_id='+first.user.id,first,403);
    for(const suffix of ['&user_id='+second.user.id,'&course_id='+courseIds[1],'&scope=dtm-grade-report'])await request('/api/affairs-data?scope=dtm-grade-report&course_id='+courseIds[0]+suffix,first,400);
    checks.push('actual-jwt-own-absence-personal-course-admin-paging102-exact-course-and-cross-account-auth-denials');
    phase='literal create and isolated overview';const initial=gradeHttpFixture(targets[0],first.user.id,courseIds[0]);
    for(const [session,status]of [[first,403],[second,403],[nonGoogle,401],[null,401]])await action(saveKind,initial,{session,status});
    const firstReceipt=await action(saveKind,initial);assert.deepEqual(await action(saveKind,initial),firstReceipt);
    const other=gradeHttpFixture(targets[1],second.user.id,courseIds[102]);other.report.total.gradeText='Other literal';await action(saveKind,other);
    const blank=gradeHttpFixture(targets[2],first.user.id,courseIds[1]);blank.report={items:[],total:{...cells(),gradeText:''}};await action(saveKind,blank);
    for(const load of [()=>personal(first,courseIds[0]),()=>manager(first.user.id,courseIds[0])]){const report=(await load()).report;assert.equal(report.version,1);assert.deepEqual({items:report.items,total:report.total},initial.report);}
    const overview=parseDtmGradeReportOverviewData(await request('/api/affairs-data?scope=dtm-grade-report-overview',first),first.user.id);
    assert.equal(overview.courses[0].gradeText,'0');assert.equal(overview.courses[1].gradeText,'');assert.equal(overview.courses[2].gradeText,null);
    const overviewNext=parseDtmGradeReportOverviewData(await request('/api/affairs-data?scope=dtm-grade-report-overview&after_id='+overview.nextCursor,first),first.user.id,overview.nextCursor);
    assert.deepEqual([...overview.courses,...overviewNext.courses].map(row=>row.id),courseIds.slice(0,102));assert.equal(overviewNext.nextCursor,null);
    const secondOverview=parseDtmGradeReportOverviewData(await request('/api/affairs-data?scope=dtm-grade-report-overview',second),second.user.id);assert.deepEqual(secondOverview.courses.map(row=>[row.id,row.gradeText]),[[courseIds[102],'Other literal']]);
    await request('/api/affairs-data?scope=dtm-grade-report-overview&user_id='+second.user.id,first,400);
    checks.push('literal-null-blank-zero-independent-total-ordered-items-and-owner-overview102-no-fanout');
    phase='version retries and real concurrency';const next=payload=>({...payload,request_id:randomUUID()}),changed=next({...initial,expected_version:1,report:{items:[...initial.report.items].reverse(),total:{...cells(),gradeText:'Literal total only'}}});
    const duplicate=await concurrent([{kind:saveKind,payload:changed},{kind:saveKind,payload:changed}]);assert.deepEqual(duplicate.map(row=>row.status),[200,200]);assert.deepEqual(duplicate[0].body,duplicate[1].body);
    await action(saveKind,next(changed),{status:409});await action(saveKind,{...changed,report:initial.report},{status:409});assert.deepEqual(await action(saveKind,initial),firstReceipt);
    await action(saveKind,next({...changed,user_id:second.user.id,course_id:courseIds[102],expected_version:2}),{status:403});
    const candidates=['Race A','Race B'].map(gradeText=>({kind:saveKind,payload:next({...changed,expected_version:2,report:{items:[],total:{...cells(),gradeText}}})})),raced=await concurrent(candidates);
    assert.deepEqual(raced.map(row=>row.status).sort(),[200,409]);const winner=raced.findIndex(row=>row.status===200);assert.deepEqual((await personal(first,courseIds[0])).report.total,candidates[winner].payload.report.total);
    const remove={id:initial.id,user_id:first.user.id,course_id:courseIds[0],request_id:randomUUID(),expected_version:3},mixed=await concurrent([{kind:deleteKind,payload:remove},{kind:saveKind,payload:next({...initial,expected_version:3})}]);
    assert.deepEqual(mixed.map(row=>row.status).sort(),[200,409]);if(mixed[0].status!==200)await action(deleteKind,next({...remove,expected_version:4}));
    assert.deepEqual(await personal(first,courseIds[0]),{report:null});assert.deepEqual(await action(saveKind,initial),firstReceipt);await action(saveKind,next(initial),{status:409});
    const replacement=gradeHttpFixture(targets[3],first.user.id,courseIds[0]);replacement.report={items:[],total:null};await action(saveKind,replacement);assert.equal((await personal(first,courseIds[0])).report.id,replacement.id);
    checks.push('exact-late-replay-two-concurrent-duplicate-cas-save-delete-races-tombstone-and-new-id-replacement');
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
      if(drained)await held('uncertain-write-reconciliation',()=>gradeHttpReconcileWrites(operations,{readReceipt:op=>sql`select actor_id,user_id,course_id,request_id,kind,payload,result from private.dtm_grade_report_operations where actor_id=${op.actorId} and request_id=${op.payload.request_id}`}));
      await held('uncertain-auth-reconciliation',()=>layoutHttpReconcileCreates(fixtures,{runId,ownerId,lookup:item=>sql`select id,email,raw_user_meta_data->>'dtm_grade_qa_run' as run from auth.users where email=${item.email}`}));
      const safe=lease&&!lease.lost&&gradeHttpCleanupAllowed({operations,fixtures,drained});
      if(safe&&accounts().length)rowsCleaned=await held('exact-report-course-cleanup',async()=>{
        for(const item of fixtures)if(item.id)await verifyFixture(item);for(const op of operations)if(op.result)successes.set(op.actorId+':'+op.payload.request_id,op);const receipts=await receiptProof();
        const persisted=await sql`select id,user_id,course_id from public.dtm_grade_reports where id=any(${targets}::uuid[]) or user_id=any(${accounts()}::uuid[])`;
        for(const row of persisted)assert.ok(targets.includes(row.id)&&accounts().includes(row.user_id)&&courseIds.includes(row.course_id));
        const ownedCourses=await sql`select id,user_id from public.dtm_courses where id=any(${courseIds}::uuid[]) or user_id=any(${accounts()}::uuid[])`;
        for(const row of ownedCourses){const planned=courses.find(course=>course.id===row.id);assert.ok(planned&&fixtures[planned.fixture-1].id===row.user_id);}
        await lease.transaction(async tx=>{for(const row of receipts)await tx`delete from private.dtm_grade_report_operations where actor_id=${row.actor_id} and request_id=${row.request_id} and course_id=${row.course_id}`;
          await tx`delete from public.affairs_agent_audit where user_id=${ownerId} and target_id=any(${targets}::uuid[]) and action_kind=any(${kinds}::text[])`;
          await tx`delete from public.dtm_courses where id=any(${courseIds}::uuid[]) and user_id=any(${accounts()}::uuid[])`;});
      });
      if(safe&&(!accounts().length||rowsCleaned))for(const item of fixtures)if(item.id)await held('exact-auth-delete-'+item.number,async()=>{await verifyFixture(item);item.deletionState='pending';await ledger();
        for(let attempt=0;attempt<3;attempt++){try{await admin.auth.admin.deleteUser(item.id);}catch{/* Exact absence decides whether retry is required. */}if(!(await sql`select id from auth.users where id=${item.id}`).length){item.deletionState='deleted';await ledger();return;}}assert.fail('Fixture deletion unresolved.');});
      if(safe)await held('exact-residue-proof',async()=>{
        assert.equal((await sql`select id from auth.users where id=any(${accounts()}::uuid[]) or email=any(${fixtures.map(item=>item.email)}::text[])`).length,0);
        assert.equal((await sql`select user_id from auth.identities where user_id=any(${accounts()}::uuid[])`).length,0);assert.equal((await sql`select user_id from public.affairs_profiles where user_id=any(${accounts()}::uuid[])`).length,0);
        assert.equal((await sql`select id from public.dtm_courses where id=any(${courseIds}::uuid[])`).length,0);assert.equal((await sql`select id from public.dtm_grade_items where id=${legacyId}`).length,0);
        assert.equal((await sql`select id from public.dtm_grade_reports where id=any(${targets}::uuid[]) or user_id=any(${accounts()}::uuid[])`).length,0);
        assert.equal((await sql`select request_id from private.dtm_grade_report_operations where course_id=any(${courseIds}::uuid[]) or user_id=any(${accounts()}::uuid[])`).length,0);
        assert.equal((await sql`select id from public.affairs_agent_audit where target_id=any(${targets}::uuid[])`).length,0);
      });else cleanupFailures.push('unresolved-recovery-ledger');
      if(ownerSession)await held('owner-local-signout',async()=>assert.ok(!(await ownerClient.auth.signOut({scope:'local'})).error));
      if(ownerBefore)await held('protected-owner-fingerprint',async()=>assert.deepEqual(await fingerprint(ownerId),ownerBefore));if(unrelatedBefore)await held('unrelated-records-and-legacy',async()=>assert.deepEqual(await unrelated(),unrelatedBefore));
      if(schemaBefore)await held('unchanged-schema-history',async()=>assert.deepEqual(await schema(),schemaBefore));
    }
    globalThis.fetch=nativeFetch;if(lease)await clean('lease-release',()=>lease.release());if(lease?.lost)cleanupFailures.push('physical-session-lost');connectionClosed=await clean('database-close',()=>pool.end({timeout:5}));cleanupVerified=ledgerReady&&cleanupFailures.length===0;
    if(ledgerReady)await ledger(cleanupVerified?'cleaned':'cleanup-required');
    const result={passed:passed&&cleanupVerified,mode,revision,checks,httpCalls,successfulWrites:successes.size,cleanupVerified,connectionClosed,cleanupFailures,cleanupDiagnostics,failure,sourceHashes:sourceBefore,
      limitations:['Prepared actual-JWT API acceptance; no browser/model/official requests.','Existing protected owner used only for verified admin requests against synthetic targets; volatile Auth login timestamps excluded from owner fingerprint.','Fixtures use privileged exact-ID setup; report writes and persistence reads use real caller JWT handlers or deployed HTTP.'],artifacts:ledgerReady?output:null};
    if(ledgerReady)await writeFile(output+'/result.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length===3&&process.argv[2]==='--self-test')console.log(JSON.stringify(await gradeHttpOfflineChecks()));else await run();
}

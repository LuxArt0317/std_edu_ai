import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
const modulePath='../integration/dtm-dashboard-layout-http-live.mjs';
const h=await import(modulePath);
const defaults=()=>({version:0,blocks:[{id:'important',visible:true,region:'side-pre',weight:-1},{id:'navigation',visible:true,region:'side-pre',weight:0},{id:'contacts',visible:true,region:'side-pre',weight:1}],updatedAt:null});
function operation(){return {actorId:randomUUID(),...h.layoutHttpFixture(2,1),state:'uncertain',sentAt:1000};}
function result(op:ReturnType<typeof operation>){return {version:op.payload.expected_version+1,blocks:op.payload.blocks??defaults().blocks,updatedAt:'2030-01-01T00:00:00.123456Z'};}
function receipt(op:ReturnType<typeof operation>){return {user_id:op.actorId,request_id:op.payload.request_id,kind:op.kind,payload:op.payload,result:result(op)};}
function cleanLedger(){const runId=randomUUID();return {runId,origin:'http://127.0.0.1:5184',mode:'actual_jwt_local_handlers',revision:'a'.repeat(40),state:'cleaned',marker:'DTM-LAYOUT-QA-'+runId.slice(0,8),cleanupVerified:true,connectionClosed:true,cleanupFailures:[],ownerId:null,ownerFingerprint:null,
  fixtures:[1,2,3].map(number=>({number,id:null,email:`dtm-layout-live-${randomUUID()}@example.invalid`,google:number<3})),operations:[],directAttempts:[],bootstrapReads:[]};}
async function withLedgers(action:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'layout-http-contract-'));try{await action(root);}finally{await rm(root,{recursive:true,force:true});}}
async function put(root:string,value=cleanLedger(),suffix='fixture-ledger.json'){const dir=join(root,'local-'+value.runId);await mkdir(dir,{recursive:true});const file=join(dir,suffix);await writeFile(file,JSON.stringify(value));return {dir,file};}

test('offline import and self-test require no credentials or provider calls',async()=>{const saved=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('No offline network');};try{assert.deepEqual(await h.layoutHttpOfflineChecks(),{status:'passed',mode:'offline-contracts',databaseConnections:0});}finally{globalThis.fetch=saved;}});
test('entry requires execute, exact client origin and a reviewed local or deployed revision',()=>{
  assert.deepEqual(h.layoutHttpOptions(['--self-test']),{selfTest:true});assert.deepEqual(h.layoutHttpExpectedSchema,{migrations:133,rls:150});assert.ok(Object.isFrozen(h.layoutHttpExpectedSchema));assert.deepEqual(h.layoutHttpAdvisoryLockKey,[23101314,115100]);
  for(const args of [[],['--execute','--force'],['--self-test','--execute']])assert.throws(()=>h.layoutHttpOptions(args));
  for(const origin of ['',undefined,'https://stu.best/','https://evil.stu.best','https://stu.best@invalid.example','http://127.0.0.1:5185'])assert.throws(()=>h.layoutHttpOptions(['--execute'],{NATIVE_ORIGIN:origin,EXPECTED_RELEASE_REVISION:'a'.repeat(40),EXPECTED_SOURCE_REVISION:'a'.repeat(40)}));
  for(const origin of ['http://127.0.0.1:5184','http://localhost:5184','https://stu.best']){assert.throws(()=>h.layoutHttpOptions(['--execute'],{NATIVE_ORIGIN:origin}));assert.equal(h.layoutHttpOptions(['--execute'],{NATIVE_ORIGIN:origin,EXPECTED_SOURCE_REVISION:'a'.repeat(40),EXPECTED_RELEASE_REVISION:'b'.repeat(40)}).local,origin.startsWith('http:'));}
});
test('physical connection target rejects transaction pools and alternate credentials',()=>{
  h.layoutHttpClientTarget('postgres://postgres@db.xiftudmvxphxcjtmfmib.supabase.co/postgres');h.layoutHttpClientTarget('postgres://postgres.xiftudmvxphxcjtmfmib@qa.pooler.supabase.com:5432/postgres');
  for(const target of ['postgres://postgres@db.other.supabase.co/postgres','postgres://other@db.xiftudmvxphxcjtmfmib.supabase.co/postgres','postgres://postgres.xiftudmvxphxcjtmfmib@qa.pooler.supabase.com:6543/postgres','postgres://postgres@db.xiftudmvxphxcjtmfmib.supabase.co/postgres?host=evil'])assert.throws(()=>h.layoutHttpClientTarget(target));
});
test('receipt requires exact aggregate result including array order and microseconds',()=>{
  const op=operation(),valid=result(op);assert.ok(h.layoutHttpValidReceipt(op,valid));assert.equal(valid.updatedAt,'2030-01-01T00:00:00.123456Z');
  for(const invalid of [{...valid,version:2},{...valid,blocks:[...valid.blocks].reverse()},{...valid,updatedAt:null},{...valid,blocks:valid.blocks.slice(0,2)},{...valid,extra:true}])assert.equal(h.layoutHttpValidReceipt(op,invalid),false);
  const reset={...op,kind:'reset_dtm_dashboard_layout',payload:{request_id:randomUUID(),expected_version:2}};assert.ok(h.layoutHttpValidReceipt(reset,{...valid,blocks:defaults().blocks}));assert.equal(h.layoutHttpValidReceipt(reset,valid),false);
});
test('unavailable and malformed responses remain uncertain, not terminal',()=>{const op=operation();for(const status of [400,401,403,409])assert.ok(h.layoutHttpTerminalResponse(op,{status,body:{error:'Denied'}}));for(const status of [200,400,401,403,409,500,503])assert.equal(h.layoutHttpTerminalResponse(op,{status,body:{}}),false);assert.equal(h.layoutHttpTerminalResponse(op,{status:503,body:{error:'Timeout'}}),false);});
test('uncertain reconciliation waits for server settlement and exact matching durable receipt',async()=>{
  const op=operation(),calls:string[]=[];await h.layoutHttpReconcileWrites([op],{now:()=>2000,wait:async(ms:number)=>{assert.equal(ms,29000);calls.push('settle');},readReceipt:async()=>{calls.push('read');return [receipt(op)];}});assert.deepEqual(calls,['settle','read']);assert.equal(op.state,'reconciled');
  for(const mutate of [(row:ReturnType<typeof receipt>)=>({...row,user_id:randomUUID()}),(row:ReturnType<typeof receipt>)=>({...row,request_id:randomUUID()}),(row:ReturnType<typeof receipt>)=>({...row,kind:'reset_dtm_dashboard_layout'}),(row:ReturnType<typeof receipt>)=>({...row,payload:{...row.payload,expected_version:1}}),(row:ReturnType<typeof receipt>)=>({...row,result:{...row.result,version:99}})]){const item=operation();await assert.rejects(h.layoutHttpReconcileWrites([item],{now:()=>31000,readReceipt:async()=>[mutate(receipt(item))]}));assert.equal(item.state,'uncertain');}
  for(const rows of [[],[receipt(operation()),receipt(operation())]])await assert.rejects(h.layoutHttpReconcileWrites([operation()],{now:()=>31000,readReceipt:async()=>rows}));
  await assert.rejects(h.layoutHttpReconcileWrites([{...operation(),actorId:null}],{now:()=>31000,readReceipt:async()=>[]}));
});
test('Auth uncertain outcome only recovers exact fixture email/run, never owner or duplicate account',async()=>{
  const ownerId=randomUUID(),runId=randomUUID(),base={id:null,email:'dtm-layout-live-'+randomUUID()+'@example.invalid',creationState:'uncertain',creationSentAt:1000};const row={id:randomUUID(),email:base.email,run:runId};
  const item={...base};await h.layoutHttpReconcileCreates([item],{ownerId,runId,now:()=>31000,lookup:async()=>[row]});assert.equal(item.id,row.id);
  for(const rows of [[],[{...row,id:ownerId}],[{...row,email:'foreign@example.invalid'}],[{...row,run:randomUUID()}],[row,row]])await assert.rejects(h.layoutHttpReconcileCreates([{...base}],{ownerId,runId,now:()=>31000,lookup:async()=>rows}));
  await assert.rejects(h.layoutHttpReconcileCreates([{...base},{id:row.id}],{ownerId,runId,now:()=>31000,lookup:async()=>[row]}));
});
test('cleanup requires drained requests, settled creates/writes and denied raw write attempts',()=>{const clean={operations:[{state:'terminal'},{state:'reconciled'}],fixtures:[{creationState:'created'}],directAttempts:[{state:'denied'}],inflightDrained:true};assert.ok(h.layoutHttpCleanupAllowed(clean));for(const changed of [{inflightDrained:false},{operations:[{state:'uncertain'}]},{fixtures:[{creationState:'pending'}]},{directAttempts:[{state:'pending'}]},{directAttempts:[{state:'uncertain'}]},{bootstrapReads:[{state:'pending'}]},{bootstrapReads:[{state:'uncertain'}]}])assert.equal(h.layoutHttpCleanupAllowed({...clean,...changed}),false);});
test('both concurrent commands are persisted before dispatch, and actually overlap',async()=>{
  const events:string[]=[],commands=[h.layoutHttpFixture(),h.layoutHttpFixture()];let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let dispatched=0;
  const pending=h.layoutHttpDispatchBatch(commands,{prepare:async(command:unknown)=>{events.push('prepare');return command;},persist:async()=>{events.push('durable');},send:async()=>{events.push('send');if(++dispatched===2)release();await gate;return dispatched;}});
  assert.deepEqual(await pending,[2,2]);assert.deepEqual(events,['prepare','prepare','durable','send','send']);
  let sent=false;await assert.rejects(h.layoutHttpDispatchBatch(commands,{prepare:async(command:unknown)=>command,persist:async()=>{throw new Error('Disk full');},send:async()=>{sent=true;}}));assert.equal(sent,false);
});
test('browser gate permits only bootstrap, layout, conversation reads and exact layout actions',()=>{
  const url=(path:string)=>new URL(path,'https://stu.best');for(const path of ['/api/affairs-data','/api/affairs-data?scope=dtm-dashboard-layout','/api/affairs-conversations'])assert.ok(h.layoutHttpBrowserReadAllowed('GET',url(path)));
  for(const path of ['/api/affairs-data?scope=admin','/api/affairs-data?scope=dtm-dashboard-layout&user_id='+randomUUID(),'/api/affairs-conversations?id=other','/api/affairs-assistant','/api/affairs-manage'])assert.equal(h.layoutHttpBrowserReadAllowed('GET',url(path)),false);
  assert.ok(h.layoutHttpBrowserWriteAllowed('POST',url('/api/affairs-action'),h.layoutHttpFixture()));for(const method of ['GET','PATCH','DELETE'])assert.equal(h.layoutHttpBrowserWriteAllowed(method,url('/api/affairs-action'),h.layoutHttpFixture()),false);
  for(const body of [{kind:'create_dtm_course',payload:{}},{...h.layoutHttpFixture(),user_id:randomUUID()},{kind:'reset_dtm_dashboard_layout',payload:{request_id:randomUUID(),expected_version:0,blocks:defaults().blocks}}])assert.equal(h.layoutHttpBrowserWriteAllowed('POST',url('/api/affairs-action'),body),false);
  const conversation=url('/api/affairs-conversations');assert.equal(h.layoutHttpLocalDestination(conversation,'GET').search,'?resource=conversations');assert.equal(conversation.search,'');assert.throws(()=>h.layoutHttpLocalDestination(conversation,'POST'));
});
test('clean retained ledgers permit restart, while active or cleanup-required ledgers block',async()=>withLedgers(async root=>{const value=cleanLedger(),{file}=await put(root,value);assert.deepEqual(await h.layoutHttpAssertNoRetainedLedgers(root),{runs:1,files:1,bytes:Buffer.byteLength(JSON.stringify(value))});for(const state of ['active','cleanup-required']){await writeFile(file,JSON.stringify({...value,state}));await assert.rejects(h.layoutHttpAssertNoRetainedLedgers(root));}}));
test('pending .next, malformed, unreadable and absent recovery ledger all block',async()=>withLedgers(async root=>{const value=cleanLedger(),{dir,file}=await put(root,value);await writeFile(file+'.next',JSON.stringify({...value,state:'active'}));await assert.rejects(h.layoutHttpAssertNoRetainedLedgers(root));await rm(file+'.next');
  for(const text of ['{',JSON.stringify({...value,cleanupVerified:false}),JSON.stringify({...value,connectionClosed:false}),JSON.stringify({...value,cleanupFailures:['lost']})]){await writeFile(file,text);await assert.rejects(h.layoutHttpAssertNoRetainedLedgers(root));}
  await rm(file);await assert.rejects(h.layoutHttpAssertNoRetainedLedgers(root));await rm(dir,{recursive:true});
}));
test('ledger scanner never follows symlinks or reads oversized files',async()=>withLedgers(async root=>{const value=cleanLedger(),{dir,file}=await put(root,value);await rm(file);await symlink('/dev/null',file);await assert.rejects(h.layoutHttpAssertNoRetainedLedgers(root));await rm(file);await writeFile(file,' '.repeat(h.layoutHttpLedgerScanLimits.fileBytes+1));await assert.rejects(h.layoutHttpAssertNoRetainedLedgers(root));await rm(dir,{recursive:true});}));
test('ledger scanner detects unknown actors, duplicate fixture IDs and unsupported operations',async()=>withLedgers(async root=>{const value=cleanLedger(),{file}=await put(root,value),id=randomUUID();const fixtures=value.fixtures.map(item=>({...item,id,creationState:'created'}));for(const patch of [{fixtures},{operations:[operation()]},{directAttempts:[{actorId:randomUUID(),method:'PATCH',state:'denied',sentAt:1000}]}]){await writeFile(file,JSON.stringify({...value,...patch}));await assert.rejects(h.layoutHttpAssertNoRetainedLedgers(root));}}));
test('live wiring keeps production HTTP, no owner credentials, exact cleanup and real concurrency',async()=>{const source=await readFile(new URL('../integration/dtm-dashboard-layout-http-live.mjs',import.meta.url),'utf8');
  assert.match(source,/const handlers=local\?/);assert.match(source,/if\(!local\).*fetch\(destination/s);assert.doesNotMatch(source,/\.env\.owner|CRM_ADMIN_PASSWORD|ownerSession|ownerLogin/);assert.match(source,/layoutHttpDispatchBatch\(commands/);assert.match(source,/await receiptProof\(\)/);assert.match(source,/delete from private\.dtm_dashboard_layout_operations where user_id=\$\{row\.user_id\} and request_id=\$\{row\.request_id\}/);assert.match(source,/await assertDerivedAbsent\(derived\)/);assert.match(source,/await fingerprint\(ownerId\),ownerBefore/);
  assert.doesNotMatch(source,/pool\.begin|delete from storage\.|\/api\/affairs-assistant['"]/);assert.match(source,/\/dtm\/my/);assert.match(source,/\/dtm\/dashboard/);assert.match(source,/for\(const width of \[390,320\]\)/);
});

test('empty installed postgres Result passes exact privacy row count while any row fails',async()=>{
  const driverResultPath='../../node_modules/postgres/src/result.js';
  const {default:Result}=await import(driverResultPath);
  const empty=new Result();assert.throws(()=>assert.deepEqual(empty,[]));
  assert.equal(empty.length,0);h.layoutHttpAssertNoRows(empty);h.layoutHttpAssertNoRows([]);
  const leaked=new Result();leaked.push({user_id:randomUUID()});assert.throws(()=>h.layoutHttpAssertNoRows(leaked));
  for(const value of [null,{}, {length:0},undefined])assert.throws(()=>h.layoutHttpAssertNoRows(value));
});
test('installed postgres helper compiles each permitted table as one qualified identifier offline',async()=>{
  const {default:postgres}=await import('postgres');
  const driverBuildPath='../../node_modules/postgres/src/build.js';
  const {build}=await import(driverBuildPath);
  // Creating a lazy client and synchronous identifiers opens no socket. No
  // Query is awaited; build is the installed driver's pure SQL compiler.
  const sql=postgres({host:'127.0.0.1',port:1,username:'offline',password:'offline',database:'offline',max:1,fetch_types:false});
  const compile=(value:unknown)=>build({tagged:true,strings:['select count(*)::int as n from ',' where id=any(ARRAY[]::uuid[])'],args:[value]},{transform:{column:{}},infer:true}).text;
  try{
    assert.equal(compile(sql('public','affairs_students')),'select count(*)::int as n from "public","affairs_students" where id=any(ARRAY[]::uuid[])');
    for(const table of ['affairs_students','affairs_enrollments','affairs_grade_items','affairs_tasks','dtm_courses','dtm_materials']){
      assert.equal(compile(h.layoutHttpDerivedIdentifier(sql,table)),`select count(*)::int as n from "public"."${table}" where id=any(ARRAY[]::uuid[])`);
    }
    for(const table of ['auth.users','affairs_profiles','public.affairs_students','affairs_students;delete','',null])assert.throws(()=>h.layoutHttpDerivedIdentifier(sql,table));
  }finally{await sql.end({timeout:0});}
});
test('diagnostics expose only bounded stage, allowlisted error name and code',()=>{
  const secret='sensitive fixture or SQL statement';
  assert.deepEqual(h.layoutHttpDiagnostic({name:'PostgresError',code:'42P01',message:secret,query:secret,detail:secret},'exact-residue-proof'),{stage:'exact-residue-proof',name:'PostgresError',code:'42P01'});
  assert.deepEqual(h.layoutHttpDiagnostic({name:secret,code:secret,message:secret},'unsafe\n'+secret),{stage:'unknown-stage',name:'Error',code:null});
  assert.deepEqual(h.layoutHttpDiagnostic({name:'AssertionError',code:'ERR_ASSERTION',expected:secret,actual:secret},'direct ACL'),{stage:'direct ACL',name:'AssertionError',code:'ERR_ASSERTION'});
});

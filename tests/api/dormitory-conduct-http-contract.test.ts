import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,mkdir,mkdtemp,opendir,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

// Variable import keeps this pure offline harness outside the API compilation
// project. Importing it must not resolve credentials or run its live main.
const modulePath='../integration/dormitory-conduct-http-live.mjs';
const harness=await import(modulePath);
const op={actorId:'synthetic-admin',kind:'save_dormitory_conduct',payload:{id:'synthetic-record',user_id:'synthetic-student',request_id:'synthetic-request',expected_version:1},state:'uncertain',sentAt:1000};
const result={id:op.payload.id,kind:op.kind,version:2,summary:'Synthetic literal receipt'};
const receipt={user_id:op.actorId,request_id:op.payload.request_id,kind:op.kind,payload:op.payload,result};
function mockLeasePool(){
  const state={pid:71,held:true,closed:false,reserves:0,releases:0,acquisitions:0,probe:null as null|(()=>Promise<{pid:number;held:boolean}[]>)},calls:string[]=[];
  const reserved=Object.assign(async(strings:TemplateStringsArray,..._values:unknown[])=>{
    const query=strings.join('?');calls.push(query);
    if(state.closed)throw new Error('Synthetic reserved session closed');
    if(query.includes('pg_try_advisory_lock')){state.acquisitions++;return [{pid:state.pid,held:state.held}];}
    if(query.includes('pg_advisory_unlock')){const unlocked=state.held;state.held=false;return [{unlocked}];}
    if(query.includes('pg_catalog.pg_locks'))return state.probe?state.probe():[{pid:state.pid,held:state.held}];
    if(query==='delete exact synthetic row')return [];
    throw new Error('Unexpected lease query');
  },{unsafe:async(command:string)=>{calls.push(command);if(state.closed)throw new Error('Synthetic reserved session closed');},release:async()=>{state.releases++;}});
  const pool={reserve:async()=>{state.reserves++;return reserved;},begin:()=>{throw new Error('Pool transactions must never replace the reserved session.');}};
  return {pool,reserved,state,calls};
}
function cleanLedger(production=false){
  const runId=randomUUID(),marker='DORM-QA-'+runId.slice(0,8);
  return {runId,origin:production?'https://stu.best':'http://127.0.0.1:5184',mode:production?'deployed_http':'actual_jwt_local_handlers',releaseRevision:production?'a'.repeat(40):null,state:'cleaned',marker,
    fixtures:[1,2,3].map(number=>({number,id:null,email:`dorm-live-${randomUUID()}@example.invalid`,google:number<3})),
    targets:['first','collision','other','replacement'].map((label,index)=>({fixture:index===2?2:1,label,id:randomUUID(),code:marker+'-'+label})),ownerId:null,ownerFingerprint:null,operations:[],cleanupFailures:[]};
}
async function withLedgers(action:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'dorm-ledger-contract-'));try{await action(root);}finally{await rm(root,{recursive:true,force:true});}}
async function putLedger(root:string,value=cleanLedger(),suffix='fixture-ledger.json'){
  const folder=join(root,(value.mode==='deployed_http'?'production-':'local-')+value.runId);await mkdir(folder,{recursive:true});const file=join(folder,suffix);await writeFile(file,JSON.stringify(value));return {folder,file,value};
}

test('dorm acceptance offline entry validates guards without resolving a live transport',async()=>{
  const saved=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Offline contracts must not perform HTTP.');};
  try{assert.deepEqual(await harness.dormOfflineChecks(),{status:'passed',mode:'offline-contracts',databaseConnections:0});}finally{globalThis.fetch=saved;}
});

test('dorm fixtures require explicit unknown or empty and cannot replace fixed ownership',()=>{
  assert.deepEqual(harness.dormExpectedSchema,{migrations:132,rls:149});assert.ok(Object.isFrozen(harness.dormExpectedSchema));
  const target={id:randomUUID(),code:'DORM-QA-synthetic-first'},userId=randomUUID(),unknown=harness.dormFixturePayload(target,userId);
  assert.deepEqual(Object.keys(unknown).sort(),['expected_version','id','request_id','result','user_id']);
  assert.equal(unknown.id,target.id);assert.equal(unknown.user_id,userId);assert.equal(unknown.expected_version,0);assert.equal(unknown.result,'unknown');
  const empty=harness.dormFixturePayload(target,userId,{result:'empty'});assert.equal(empty.result,'empty');assert.notEqual(unknown.request_id,empty.request_id);
  for(const value of [{user_id:randomUUID()},{id:randomUUID()},{expected_version:1},{request_id:randomUUID()},{result:null},{result:''},{result:'populated'},{result:0},{rows:[]},{download_url:'private'}])assert.throws(()=>harness.dormFixturePayload(target,userId,value));
});

test('only exact local origins or revision-pinned production are selectable',()=>{
  assert.equal(harness.dormOriginMode('http://127.0.0.1:5184'),'actual_jwt_local_handlers');
  assert.equal(harness.dormOriginMode('http://localhost:5184'),'actual_jwt_local_handlers');
  assert.equal(harness.dormOriginMode('https://stu.best','a'.repeat(40)),'deployed_http');
  for(const origin of ['https://stu.best/','https://stu.best:443','https://stu.best@evil.invalid','https://stu.best.evil.invalid','http://127.0.0.1:5185'])assert.throws(()=>harness.dormOriginMode(origin,'a'.repeat(40)));
  assert.throws(()=>harness.dormOriginMode('https://stu.best','not-a-revision'));
});

test('database targeting rejects transaction pooling, alternate identities and connection overrides',()=>{
  harness.dormClientTarget('postgres://postgres@db.xiftudmvxphxcjtmfmib.supabase.co/postgres');
  harness.dormClientTarget('postgres://postgres.xiftudmvxphxcjtmfmib@qa.pooler.supabase.com:5432/postgres?sslmode=require');
  for(const value of ['postgres://other@db.xiftudmvxphxcjtmfmib.supabase.co/postgres','postgres://postgres.other@qa.pooler.supabase.com/postgres',
    'postgres://postgres.xiftudmvxphxcjtmfmib@qa.pooler.supabase.com:6543/postgres','postgres://postgres@db.xiftudmvxphxcjtmfmib.supabase.co/other',
    'postgres://postgres@db.xiftudmvxphxcjtmfmib.supabase.co/postgres?host=other.invalid','postgres://postgres@db.xiftudmvxphxcjtmfmib.supabase.co/postgres?sslmode=disable'])assert.throws(()=>harness.dormClientTarget(value));
});

test('student browser gates allow own source and startup reads but no admin, model or mutation endpoint',()=>{
  for(const path of ['/api/affairs-data','/api/affairs-data?scope=dormitory-conduct','/api/affairs-conversations'])assert.ok(harness.dormBrowserReadAllowed('GET',new URL(path,'https://stu.best')));
  for(const path of ['/api/affairs-data?scope=admin','/api/affairs-data?scope=dormitory-conduct-admin&user_id=other','/api/affairs-data?scope=dormitory-conduct&scope=admin','/api/affairs-assistant','/api/affairs-manage','/api/affairs-conversations?user_id=other'])assert.equal(harness.dormBrowserReadAllowed('GET',new URL(path,'https://stu.best')),false);
  for(const method of ['POST','PATCH','DELETE'])assert.equal(harness.dormBrowserReadAllowed(method,new URL('/api/affairs-data','https://stu.best')),false);
  const original=new URL('https://stu.best/api/affairs-conversations');assert.equal(harness.dormLocalDestination(original,'GET').search,'?resource=conversations');assert.equal(original.search,'');
});

test('browser Supabase access is limited to its disposable account authentication paths',()=>{
  const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
  for(const [method,path]of [['GET','/auth/v1/user'],['POST','/auth/v1/token?grant_type=refresh_token'],['POST','/auth/v1/logout?scope=local']])assert.ok(harness.dormBrowserAuthAllowed(method,new URL(path,origin)));
  for(const [method,path]of [['POST','/rest/v1/rpc/affairs_manage_dormitory_conduct'],['GET','/rest/v1/affairs_dormitory_conduct'],['POST','/auth/v1/admin/users'],['POST','/auth/v1/token?grant_type=password'],['GET','/auth/v1/user?user_id=other']])assert.equal(harness.dormBrowserAuthAllowed(method,new URL(path,origin)),false);
});

test('only exact durable receipts or explicit validation/permission/conflict results settle a write',()=>{
  assert.ok(harness.dormTerminalResponse(op,{status:200,body:result}));
  for(const patch of [{id:'other'},{version:3},{kind:'delete_dormitory_conduct'},{extra:true},{summary:'x'.repeat(201)}])assert.equal(harness.dormTerminalResponse(op,{status:200,body:{...result,...patch}}),false);
  for(const status of [400,401,403,409])assert.ok(harness.dormTerminalResponse(op,{status,body:{error:'Synthetic denial'}}));
  for(const status of [200,500,503,504])assert.equal(harness.dormTerminalResponse(op,{status,body:{error:'Uncertain'}}),false);
  assert.ok(harness.dormValidReceipt(op,{...result,summary:'😀'.repeat(200)}));
  for(const summary of ['😀'.repeat(201),'\0','\ud800','\udfff'])assert.equal(harness.dormValidReceipt(op,{...result,summary}),false);
});

test('uncertain operations reconcile exact actor/request/kind/payload and retain fixtures for missing or mismatched receipts',async()=>{
  const recovered={...op};let waited=0;
  await harness.dormReconcileWrites([recovered],{now:()=>2000,wait:async(ms:number)=>{waited=ms;},readReceipt:async()=>[receipt]});assert.equal(waited,29000);assert.equal(recovered.state,'reconciled');
  for(const rows of [[],[{...receipt,user_id:'other'}],[{...receipt,request_id:'other'}],[{...receipt,kind:'delete_dormitory_conduct'}],[{...receipt,payload:{...op.payload,expected_version:0}}]]){
    const unresolved={...op};await assert.rejects(harness.dormReconcileWrites([unresolved],{now:()=>40000,readReceipt:async()=>rows}));assert.equal(unresolved.state,'uncertain');
    assert.equal(harness.dormCleanupAllowed({operations:[unresolved],fixtures:[],inflightDrained:true}),false);
  }
});

test('Auth reconciliation refuses protected or unrelated identities and active requests block destructive cleanup',async()=>{
  const pending={id:null,email:'synthetic@example.invalid',creationState:'uncertain',creationSentAt:1000},created={id:'synthetic-student',email:pending.email,run:'synthetic-run'};
  for(const rows of [[],[{...created,id:'protected-owner'}],[{...created,run:'other-run'}],[{...created,email:'other@example.invalid'}]]){
    const copy={...pending};await assert.rejects(harness.dormReconcileCreates([copy],{runId:'synthetic-run',ownerId:'protected-owner',now:()=>40000,lookup:async()=>rows}));assert.equal(copy.id,null);
  }
  const copy={...pending};await harness.dormReconcileCreates([copy],{runId:'synthetic-run',ownerId:'protected-owner',now:()=>40000,lookup:async()=>[created]});assert.equal(copy.creationState,'created');
  assert.equal(harness.dormCleanupAllowed({operations:[{...op,state:'terminal'}],fixtures:[copy],inflightDrained:false}),false);
  assert.equal(harness.dormCleanupAllowed({operations:[],fixtures:[pending],inflightDrained:true}),false);
  assert.ok(harness.dormCleanupAllowed({operations:[{...op,state:'reconciled'}],fixtures:[copy],inflightDrained:true}));
});

test('advisory lock and cleanup transaction use one physical reserved session through release',async()=>{
  const fake=mockLeasePool(),lease=await harness.dormReserveLease(fake.pool);
  assert.notEqual(lease.sql,fake.reserved);assert.equal(fake.state.reserves,1);assert.equal(fake.state.acquisitions,1);
  assert.equal(await lease.transaction(async(sql:unknown)=>{assert.equal(sql,lease.sql);fake.calls.push('exact cleanup');await lease.sql`delete exact synthetic row`;return 'verified';}),'verified');
  assert.deepEqual(fake.calls.filter(item=>['begin','exact cleanup','commit','rollback'].includes(item)),['begin','exact cleanup','commit']);
  await lease.release();await lease.release();assert.equal(fake.state.releases,1);assert.equal(fake.state.held,false);
  assert.equal(fake.state.reserves,1);assert.equal(fake.state.acquisitions,1);
  await assert.rejects(lease.withHeld(()=>assert.fail('Released lease must not authorize cleanup.')));
});

test('session loss, PID drift and missing lock stop new cleanup and never reacquire a pool session',async()=>{
  for(const failure of ['closed','pid','lock','onclose']){
    const fake=mockLeasePool(),aborted=new AbortController();let losses=0,mutations=0;
    const lease=await harness.dormReserveLease(fake.pool,{onLost:()=>{losses++;aborted.abort();}});
    if(failure==='closed')fake.state.closed=true;
    else if(failure==='pid')fake.state.pid++;
    else if(failure==='lock')fake.state.held=false;
    else lease.lose();
    await assert.rejects(lease.withHeld(()=>{mutations++;}));assert.ok(lease.lost);assert.ok(aborted.signal.aborted);assert.equal(losses,1);
    // A pool could now be healthy on a different session: that must not heal this lease.
    fake.state.closed=false;fake.state.pid=71;fake.state.held=true;
    await assert.rejects(lease.transaction(()=>{mutations++;}));await assert.rejects(lease.withHeld(()=>{mutations++;}));
    await assert.rejects(lease.sql`delete exact synthetic row`);assert.equal(fake.calls.includes('delete exact synthetic row'),false);
    await assert.rejects(lease.release());assert.equal(mutations,0);assert.equal(fake.state.reserves,1);assert.equal(fake.state.acquisitions,1);assert.equal(fake.state.releases,1);
    assert.equal(fake.calls.some(item=>item.includes('pg_advisory_unlock')),false);assert.equal(fake.calls.includes('begin'),false);
  }
});

test('busy acquisition releases its reservation before any fixture or cleanup action',async()=>{
  const fake=mockLeasePool();fake.state.held=false;
  await assert.rejects(harness.dormReserveLease(fake.pool));assert.equal(fake.state.releases,1);assert.equal(fake.state.reserves,1);
  assert.equal(fake.calls.length,1);assert.equal(fake.calls.some(item=>item.includes('pg_advisory_unlock')),false);
});

test('onclose during a successful in-flight lock probe cannot authorize cleanup from that stale result',async()=>{
  const fake=mockLeasePool(),reserve=fake.pool.reserve;let duringProbe:(()=>void)|undefined,mutations=0;
  fake.pool.reserve=async()=>{
    const raw=await reserve();return Object.assign((strings:TemplateStringsArray,...values:unknown[])=>{
      const result=raw(strings,...values);if(strings.join('?').includes('pg_catalog.pg_locks'))duringProbe?.();return result;
    },{unsafe:raw.unsafe,release:raw.release});
  };
  const lease=await harness.dormReserveLease(fake.pool);duringProbe=()=>lease.lose();
  await assert.rejects(lease.withHeld(()=>{mutations++;}));assert.equal(mutations,0);assert.ok(lease.lost);
  await assert.rejects(lease.sql`delete exact synthetic row`);assert.equal(fake.calls.includes('delete exact synthetic row'),false);
  await assert.rejects(lease.release());assert.equal(fake.state.reserves,1);assert.equal(fake.state.acquisitions,1);assert.equal(fake.state.releases,1);
});

for(const stage of ['begin','commit'])test(`lease loss after a valid probe blocks transaction ${stage} dispatch`,async()=>{
  const fake=mockLeasePool();let losses=0,actions=0;
  const lease=await harness.dormReserveLease(fake.pool,{onLost:()=>{losses++;}});
  const loseAfterProbe=()=>{fake.state.probe=async()=>[{pid:71,get held(){
    // The probe validates successfully, then onclose runs before its caller resumes.
    queueMicrotask(()=>lease.lose());return true;
  }}];};
  if(stage==='begin')loseAfterProbe();
  await assert.rejects(lease.transaction(async()=>{actions++;if(stage==='commit')loseAfterProbe();}));
  assert.equal(losses,1);assert.ok(lease.lost);assert.equal(actions,stage==='begin'?0:1);
  assert.deepEqual(fake.calls.filter(item=>['begin','commit','rollback'].includes(item)),stage==='begin'?[]:['begin','rollback']);
  await assert.rejects(lease.sql`delete exact synthetic row`);assert.equal(fake.calls.includes('delete exact synthetic row'),false);
  await assert.rejects(lease.release());assert.equal(fake.state.reserves,1);assert.equal(fake.state.acquisitions,1);assert.equal(fake.state.releases,1);
});

test('lease loss after a valid release probe prevents unlock but releases the reservation once',async()=>{
  const fake=mockLeasePool();let losses=0;
  const lease=await harness.dormReserveLease(fake.pool,{onLost:()=>{losses++;}});
  fake.state.probe=async()=>[{pid:71,get held(){queueMicrotask(()=>lease.lose());return true;}}];
  await assert.rejects(lease.release());assert.ok(lease.lost);assert.equal(losses,1);
  assert.equal(fake.calls.some(query=>query.includes('pg_advisory_unlock')),false);
  await lease.release();assert.equal(fake.state.releases,1);assert.equal(fake.state.reserves,1);assert.equal(fake.state.acquisitions,1);
});

test('failed cleanup rolls back on the reserved session and a lost session never commits',async()=>{
  const fake=mockLeasePool(),lease=await harness.dormReserveLease(fake.pool);
  await assert.rejects(lease.transaction(async()=>{throw new Error('Synthetic cleanup assertion');}),/cleanup assertion/);
  assert.deepEqual(fake.calls.filter(item=>['begin','commit','rollback'].includes(item)),['begin','rollback']);assert.equal(lease.lost,false);
  fake.calls.length=0;
  await assert.rejects(lease.transaction(async()=>{fake.state.closed=true;lease.lose();}));
  assert.deepEqual(fake.calls.filter(item=>['begin','commit','rollback'].includes(item)),['begin','rollback']);assert.ok(lease.lost);
  await assert.rejects(lease.release());assert.equal(fake.state.releases,1);
});

test('retained-ledger preflight checks both origins and both ledger names without mutating artifacts',async()=>{
  assert.deepEqual(harness.dormAdvisoryLockKey,[23101314,115100]);assert.ok(Object.isFrozen(harness.dormAdvisoryLockKey));
  await withLedgers(async root=>{
    assert.deepEqual(await harness.dormAssertNoRetainedLedgers(join(root,'absent')),{runs:0,files:0,bytes:0});
    const first=await putLedger(root),second=await putLedger(root,cleanLedger(true));await putLedger(root,second.value,'fixture-ledger.json.next');
    const result=await harness.dormAssertNoRetainedLedgers(root);assert.equal(result.runs,2);assert.equal(result.files,3);assert.ok(result.bytes>0);
    for(const state of ['active','cleanup-required','unknown']){
      await writeFile(first.file,JSON.stringify({...first.value,state}));await assert.rejects(harness.dormAssertNoRetainedLedgers(root));
    }
    await writeFile(first.file,JSON.stringify(first.value));await putLedger(root,{...second.value,state:'active'},'fixture-ledger.json.next');
    await assert.rejects(harness.dormAssertNoRetainedLedgers(root),'A cleaned primary ledger must not hide an unfinished temporary ledger.');
  });
});

test('malformed, missing, unreadable and symlinked dorm ledgers fail closed',async()=>{
  await withLedgers(async root=>{
    const {folder,file,value}=await putLedger(root);
    for(const content of ['{','null',JSON.stringify({state:'cleaned'}),JSON.stringify({...value,runId:randomUUID()}),JSON.stringify({...value,operations:[op]})]){
      await writeFile(file,content);await assert.rejects(harness.dormAssertNoRetainedLedgers(root));
    }
    await writeFile(file,JSON.stringify(value));
    await assert.rejects(harness.dormAssertNoRetainedLedgers(root,{io:{lstat,opendir,open:async()=>{throw Object.assign(new Error('Synthetic unreadable file'),{code:'EACCES'});}}}),{code:'EACCES'});
    await rm(file);await assert.rejects(harness.dormAssertNoRetainedLedgers(root));
    await symlink(join(root,'elsewhere'),file);await assert.rejects(harness.dormAssertNoRetainedLedgers(root));
    await rm(file);await mkdir(file);await assert.rejects(harness.dormAssertNoRetainedLedgers(root));
    await rm(folder,{recursive:true});await symlink(root,folder);await assert.rejects(harness.dormAssertNoRetainedLedgers(root));
  });
});

test('ledger preflight bounds individual and cumulative bytes, directory entries and run count',async()=>{
  await withLedgers(async root=>{
    const {file}=await putLedger(root);await writeFile(file,Buffer.alloc(harness.dormLedgerScanLimits.fileBytes+1));await assert.rejects(harness.dormAssertNoRetainedLedgers(root));
  });
  const directoryInfo={isDirectory:()=>true,isSymbolicLink:()=>false};
  const unread=async()=>{throw new Error('Should not read a ledger for ignored entries.');};
  const ignored=async function*(){for(let i=0;i<=harness.dormLedgerScanLimits.entries;i++)yield{name:'ignored-'+i};};
  await assert.rejects(harness.dormAssertNoRetainedLedgers('synthetic',{io:{lstat:async()=>directoryInfo,opendir:async()=>ignored(),open:unread}}),/entry bound/);
  const ledgers=Array.from({length:harness.dormLedgerScanLimits.runs+1},()=>cleanLedger());
  const entries=async function*(){for(const item of ledgers)yield{name:'local-'+item.runId};};
  await assert.rejects(harness.dormAssertNoRetainedLedgers('synthetic',{io:{lstat:async()=>directoryInfo,opendir:async()=>entries(),open:async(file:string)=>{
    if(file.endsWith('.next'))throw Object.assign(new Error('Absent'),{code:'ENOENT'});
    const value=ledgers.find(item=>file.includes(item.runId)),bytes=Buffer.from(JSON.stringify(value));return {stat:async()=>({isFile:()=>true,size:bytes.length}),read:async(buffer:Buffer)=>({bytesRead:bytes.copy(buffer)}),close:async()=>{}};
  }}}),/run bound/);
  await assert.rejects(harness.dormAssertNoRetainedLedgers('synthetic',{io:{lstat:async()=>directoryInfo,opendir:async()=>entries(),open:async(file:string)=>{
    if(file.endsWith('.next'))throw Object.assign(new Error('Absent'),{code:'ENOENT'});
    const value=ledgers.find(item=>file.includes(item.runId)),bytes=Buffer.alloc(harness.dormLedgerScanLimits.fileBytes,32);bytes.write(JSON.stringify(value));return {stat:async()=>({isFile:()=>true,size:bytes.length}),read:async(buffer:Buffer)=>({bytesRead:bytes.copy(buffer)}),close:async()=>{}};
  }}}),/total byte bound/);
});

test('shared advisory acquisition and retained-ledger scan precede this run ledger and owner sign-in',async()=>{
  const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../integration/dormitory-conduct-http-live.mjs',import.meta.url),'utf8');
  const acquire=source.indexOf('lease=await dormReserveLease(pool,'),scan=source.indexOf('await dormAssertNoRetainedLedgers();'),create=source.indexOf('await mkdir(output,{mode:0o700})'),login=source.indexOf('await ownerLogin();');
  assert.ok(acquire>=0&&acquire<scan&&scan<create&&create<login);assert.ok(source.includes('pg_advisory_unlock(${dormAdvisoryLockKey[0]}::int,${dormAdvisoryLockKey[1]}::int)'));
  assert.ok(source.includes('max_lifetime:0,onclose:()=>lease?.lose()'));assert.ok(source.includes('const leasedClean=(label,action)=>clean(label,()=>lease.withHeld(action));'));
  assert.ok(source.includes('const safe=!lease.lost&&dormCleanupAllowed'));assert.ok(source.includes("ledger(cleanupFailures.length?'cleanup-required':'cleaned',cleanupFailures)"));
  assert.ok(source.includes("if(lease?.lost)cleanupFailures.push('database-lease-lost')"));assert.equal(source.includes('sql.begin('),false);assert.equal(source.includes('pool.begin('),false);
  assert.ok(source.indexOf("clean('advisory-release'")<source.indexOf("clean('database-close'"));
  assert.ok(source.includes("version in ('20261112210000','20261112220000')"));
  assert.ok(source.indexOf("fetch(origin+'/release.json'")<source.indexOf('const env=deploymentEnvironment()'));
  assert.ok(source.includes("const handlers=local?{'/api/affairs-data':"));
  assert.ok(source.includes('await lease.withHeld(()=>fetch(destination,'));
  assert.ok(source.includes('return lease.withHeld(()=>fetch(input,'));
  assert.ok(source.includes('return await lease.withHeld(()=>route.continue())'));
  assert.ok(source.includes("onLost:()=>leaseAbort.abort("));
  assert.ok(source.includes('operations.push(op);await ledger();'));
  assert.ok(source.includes("item.creationState='pending';item.creationSentAt=Date.now();await ledger();"));
  assert.ok(source.includes("assert.equal(successes.size,6)"));
  assert.ok(source.includes('if(schemaBefore)await leasedClean'));
  assert.ok(source.includes("for(const width of [390,320])"));
  assert.equal(source.includes('current_term_label'),false);
});

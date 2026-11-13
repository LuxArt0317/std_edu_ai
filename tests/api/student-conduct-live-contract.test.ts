import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,mkdir,mkdtemp,opendir,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

// Variable import keeps this pure offline harness outside the API compilation
// project. Importing it must not resolve credentials or run its live main.
const modulePath='../integration/student-conduct-http-live.mjs';
const harness=await import(modulePath);
const op={actorId:'synthetic-admin',kind:'save_student_conduct',payload:{id:'synthetic-record',user_id:'synthetic-student',request_id:'synthetic-request',expected_version:1},state:'uncertain',sentAt:1000};
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
  const runId=randomUUID(),marker='CONDUCT-QA-'+runId.slice(0,8);
  return {runId,origin:production?'https://stu.best':'http://127.0.0.1:5184',mode:production?'deployed_http':'actual_jwt_local_handlers',releaseRevision:production?'a'.repeat(40):null,state:'cleaned',marker,
    fixtures:[1,2,3].map(number=>({number,id:null,email:`conduct-live-${randomUUID()}@example.invalid`,google:number<3})),
    targets:['first','blank','other','delete'].map((label,index)=>({fixture:index===2?2:1,label,id:randomUUID(),code:marker+'-'+label})),ownerId:null,ownerFingerprint:null,operations:[],cleanupFailures:[]};
}
async function withLedgers(action:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'conduct-ledger-contract-'));try{await action(root);}finally{await rm(root,{recursive:true,force:true});}}
async function putLedger(root:string,value=cleanLedger(),suffix='fixture-ledger.json'){
  const folder=join(root,(value.mode==='deployed_http'?'production-':'local-')+value.runId);await mkdir(folder,{recursive:true});const file=join(folder,suffix);await writeFile(file,JSON.stringify(value));return {folder,file,value};
}

test('conduct acceptance offline entry validates guards without resolving a live transport',async()=>{
  const saved=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Offline contracts must not perform HTTP.');};
  try{assert.deepEqual(await harness.conductOfflineChecks(),{status:'passed',mode:'offline-contracts',databaseConnections:0});}finally{globalThis.fetch=saved;}
});

test('only exact local origins or revision-pinned production are selectable',()=>{
  assert.equal(harness.conductOriginMode('http://127.0.0.1:5184'),'actual_jwt_local_handlers');
  assert.equal(harness.conductOriginMode('http://localhost:5184'),'actual_jwt_local_handlers');
  assert.equal(harness.conductOriginMode('https://stu.best','a'.repeat(40)),'deployed_http');
  for(const origin of ['https://stu.best/','https://stu.best:443','https://stu.best@evil.invalid','https://stu.best.evil.invalid','http://127.0.0.1:5185'])assert.throws(()=>harness.conductOriginMode(origin,'a'.repeat(40)));
  assert.throws(()=>harness.conductOriginMode('https://stu.best','not-a-revision'));
});

test('student browser gates allow own source and startup reads but no admin, model or mutation endpoint',()=>{
  for(const path of ['/api/affairs-data','/api/affairs-data?scope=student-conduct','/api/affairs-conversations'])assert.ok(harness.conductBrowserReadAllowed('GET',new URL(path,'https://stu.best')));
  for(const path of ['/api/affairs-data?scope=admin','/api/affairs-data?scope=student-conduct-admin&user_id=other','/api/affairs-data?scope=student-conduct&scope=admin','/api/affairs-assistant','/api/affairs-manage','/api/affairs-conversations?user_id=other'])assert.equal(harness.conductBrowserReadAllowed('GET',new URL(path,'https://stu.best')),false);
  for(const method of ['POST','PATCH','DELETE'])assert.equal(harness.conductBrowserReadAllowed(method,new URL('/api/affairs-data','https://stu.best')),false);
  const original=new URL('https://stu.best/api/affairs-conversations');assert.equal(harness.conductLocalDestination(original,'GET').search,'?resource=conversations');assert.equal(original.search,'');
});

test('only exact durable receipts or explicit validation/permission/conflict results settle a write',()=>{
  assert.ok(harness.conductTerminalResponse(op,{status:200,body:result}));
  for(const patch of [{id:'other'},{version:3},{kind:'delete_student_conduct'},{extra:true},{summary:'x'.repeat(201)}])assert.equal(harness.conductTerminalResponse(op,{status:200,body:{...result,...patch}}),false);
  for(const status of [400,401,403,409])assert.ok(harness.conductTerminalResponse(op,{status,body:{error:'Synthetic denial'}}));
  for(const status of [200,500,503,504])assert.equal(harness.conductTerminalResponse(op,{status,body:{error:'Uncertain'}}),false);
});

test('uncertain operations reconcile exact actor/request/kind/payload and retain fixtures for missing or mismatched receipts',async()=>{
  const recovered={...op};let waited=0;
  await harness.conductReconcileWrites([recovered],{now:()=>2000,wait:async(ms:number)=>{waited=ms;},readReceipt:async()=>[receipt]});assert.equal(waited,29000);assert.equal(recovered.state,'reconciled');
  for(const rows of [[],[{...receipt,user_id:'other'}],[{...receipt,request_id:'other'}],[{...receipt,kind:'delete_student_conduct'}],[{...receipt,payload:{...op.payload,expected_version:0}}]]){
    const unresolved={...op};await assert.rejects(harness.conductReconcileWrites([unresolved],{now:()=>40000,readReceipt:async()=>rows}));assert.equal(unresolved.state,'uncertain');
    assert.equal(harness.conductCleanupAllowed({operations:[unresolved],fixtures:[],inflightDrained:true}),false);
  }
});

test('Auth reconciliation refuses protected or unrelated identities and active requests block destructive cleanup',async()=>{
  const pending={id:null,email:'synthetic@example.invalid',creationState:'uncertain',creationSentAt:1000},created={id:'synthetic-student',email:pending.email,run:'synthetic-run'};
  for(const rows of [[],[{...created,id:'protected-owner'}],[{...created,run:'other-run'}],[{...created,email:'other@example.invalid'}]]){
    const copy={...pending};await assert.rejects(harness.conductReconcileCreates([copy],{runId:'synthetic-run',ownerId:'protected-owner',now:()=>40000,lookup:async()=>rows}));assert.equal(copy.id,null);
  }
  const copy={...pending};await harness.conductReconcileCreates([copy],{runId:'synthetic-run',ownerId:'protected-owner',now:()=>40000,lookup:async()=>[created]});assert.equal(copy.creationState,'created');
  assert.equal(harness.conductCleanupAllowed({operations:[{...op,state:'terminal'}],fixtures:[copy],inflightDrained:false}),false);
  assert.equal(harness.conductCleanupAllowed({operations:[],fixtures:[pending],inflightDrained:true}),false);
  assert.ok(harness.conductCleanupAllowed({operations:[{...op,state:'reconciled'}],fixtures:[copy],inflightDrained:true}));
});

test('advisory lock and cleanup transaction use one physical reserved session through release',async()=>{
  const fake=mockLeasePool(),lease=await harness.conductReserveLease(fake.pool);
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
    const lease=await harness.conductReserveLease(fake.pool,{onLost:()=>{losses++;aborted.abort();}});
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
  await assert.rejects(harness.conductReserveLease(fake.pool));assert.equal(fake.state.releases,1);assert.equal(fake.state.reserves,1);
  assert.equal(fake.calls.length,1);assert.equal(fake.calls.some(item=>item.includes('pg_advisory_unlock')),false);
});

test('a stale successful in-flight lock probe cannot dispatch cleanup after onclose',async()=>{
  const fake=mockLeasePool();let losses=0,mutations=0,resolveProbe!:(rows:{pid:number;held:boolean}[])=>void,entered!:()=>void;
  const lease=await harness.conductReserveLease(fake.pool,{onLost:()=>{losses++;}}),waiting=new Promise<void>(resolve=>{entered=resolve;});
  fake.state.probe=()=>{entered();return new Promise(resolve=>{resolveProbe=resolve;});};
  const operation=lease.withHeld(()=>{mutations++;});await waiting;lease.lose();resolveProbe([{pid:71,held:true}]);
  await assert.rejects(operation);assert.equal(mutations,0);assert.equal(losses,1);assert.ok(lease.lost);
  await assert.rejects(lease.sql`delete exact synthetic row`);assert.equal(fake.calls.includes('delete exact synthetic row'),false);
  await assert.rejects(lease.release());assert.equal(fake.state.reserves,1);assert.equal(fake.state.acquisitions,1);assert.equal(fake.state.releases,1);
});

for(const stage of ['begin','commit'])test(`lease loss after a valid probe blocks transaction ${stage} dispatch`,async()=>{
  const fake=mockLeasePool();let losses=0,actions=0;
  const lease=await harness.conductReserveLease(fake.pool,{onLost:()=>{losses++;}});
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
  const lease=await harness.conductReserveLease(fake.pool,{onLost:()=>{losses++;}});
  fake.state.probe=async()=>[{pid:71,get held(){queueMicrotask(()=>lease.lose());return true;}}];
  await assert.rejects(lease.release());assert.ok(lease.lost);assert.equal(losses,1);
  assert.equal(fake.calls.some(query=>query.includes('pg_advisory_unlock')),false);
  await lease.release();assert.equal(fake.state.releases,1);assert.equal(fake.state.reserves,1);assert.equal(fake.state.acquisitions,1);
});

test('failed cleanup rolls back on the reserved session and a lost session never commits',async()=>{
  const fake=mockLeasePool(),lease=await harness.conductReserveLease(fake.pool);
  await assert.rejects(lease.transaction(async()=>{throw new Error('Synthetic cleanup assertion');}),/cleanup assertion/);
  assert.deepEqual(fake.calls.filter(item=>['begin','commit','rollback'].includes(item)),['begin','rollback']);assert.equal(lease.lost,false);
  fake.calls.length=0;
  await assert.rejects(lease.transaction(async()=>{fake.state.closed=true;lease.lose();}));
  assert.deepEqual(fake.calls.filter(item=>['begin','commit','rollback'].includes(item)),['begin','rollback']);assert.ok(lease.lost);
  await assert.rejects(lease.release());assert.equal(fake.state.releases,1);
});

test('overflow diagnostics are bounded geometry and exclude identity, contents and capabilities',()=>{
  const style={display:'block',visibility:'visible',overflowX:'visible',position:'static'};
  const parent={tagName:'DIV',classList:['student-conduct-table-scroll'],style:{...style,overflowX:'auto'},parentElement:null,
    getBoundingClientRect:()=>({left:10,right:300,top:100,bottom:300,width:290,height:200})};
  const nodes=Array.from({length:100},()=>({tagName:'TD',classList:['student-conduct-data','PRIVATE-TOKEN'],style,parentElement:parent,
    getBoundingClientRect:()=>({left:600,right:850,top:150,bottom:180,width:250,height:30}),
    get textContent(){throw new Error('Must not read synthetic private text');},get value(){throw new Error('Must not read form values');},get href(){throw new Error('Must not read capabilities');}}));
  const diagnostic=runInNewContext('('+harness.conductOverflowGeometry.toString()+')()',{
    document:{documentElement:{scrollWidth:900},body:{scrollWidth:900},querySelectorAll:()=>nodes},innerWidth:320,innerHeight:900,
    getComputedStyle:(node:{style:typeof style})=>node.style,
  });
  assert.equal(diagnostic.overflow.length,40);assert.ok(diagnostic.scanned<=41);assert.equal(diagnostic.documentWidth,900);
  assert.equal(diagnostic.overflow[0].clip.overflowX,'auto');assert.equal(diagnostic.overflow[0].clip.right,300);
  const text=JSON.stringify(diagnostic);assert.ok(Buffer.byteLength(text)<24000);assert.doesNotMatch(text,/PRIVATE|textContent|href|value|token|cookie|header/i);
});

test('retained-ledger preflight checks both origins and both ledger names without mutating artifacts',async()=>{
  assert.deepEqual(harness.conductAdvisoryLockKey,[23101314,115100]);assert.ok(Object.isFrozen(harness.conductAdvisoryLockKey));
  await withLedgers(async root=>{
    assert.deepEqual(await harness.conductAssertNoRetainedLedgers(join(root,'absent')),{runs:0,files:0,bytes:0});
    const first=await putLedger(root),second=await putLedger(root,cleanLedger(true));await putLedger(root,second.value,'fixture-ledger.json.next');
    const result=await harness.conductAssertNoRetainedLedgers(root);assert.equal(result.runs,2);assert.equal(result.files,3);assert.ok(result.bytes>0);
    for(const state of ['active','cleanup-required','unknown']){
      await writeFile(first.file,JSON.stringify({...first.value,state}));await assert.rejects(harness.conductAssertNoRetainedLedgers(root));
    }
    await writeFile(first.file,JSON.stringify(first.value));await putLedger(root,{...second.value,state:'active'},'fixture-ledger.json.next');
    await assert.rejects(harness.conductAssertNoRetainedLedgers(root),'A cleaned primary ledger must not hide an unfinished temporary ledger.');
  });
});

test('malformed, missing, unreadable and symlinked conduct ledgers fail closed',async()=>{
  await withLedgers(async root=>{
    const {folder,file,value}=await putLedger(root);
    for(const content of ['{','null',JSON.stringify({state:'cleaned'}),JSON.stringify({...value,runId:randomUUID()}),JSON.stringify({...value,operations:[op]})]){
      await writeFile(file,content);await assert.rejects(harness.conductAssertNoRetainedLedgers(root));
    }
    await writeFile(file,JSON.stringify(value));
    await assert.rejects(harness.conductAssertNoRetainedLedgers(root,{io:{lstat,opendir,open:async()=>{throw Object.assign(new Error('Synthetic unreadable file'),{code:'EACCES'});}}}),{code:'EACCES'});
    await rm(file);await assert.rejects(harness.conductAssertNoRetainedLedgers(root));
    await symlink(join(root,'elsewhere'),file);await assert.rejects(harness.conductAssertNoRetainedLedgers(root));
    await rm(file);await mkdir(file);await assert.rejects(harness.conductAssertNoRetainedLedgers(root));
    await rm(folder,{recursive:true});await symlink(root,folder);await assert.rejects(harness.conductAssertNoRetainedLedgers(root));
  });
});

test('ledger preflight bounds individual and cumulative bytes, directory entries and run count',async()=>{
  await withLedgers(async root=>{
    const {file}=await putLedger(root);await writeFile(file,Buffer.alloc(harness.conductLedgerScanLimits.fileBytes+1));await assert.rejects(harness.conductAssertNoRetainedLedgers(root));
  });
  const directoryInfo={isDirectory:()=>true,isSymbolicLink:()=>false};
  const unread=async()=>{throw new Error('Should not read a ledger for ignored entries.');};
  const ignored=async function*(){for(let i=0;i<=harness.conductLedgerScanLimits.entries;i++)yield{name:'ignored-'+i};};
  await assert.rejects(harness.conductAssertNoRetainedLedgers('synthetic',{io:{lstat:async()=>directoryInfo,opendir:async()=>ignored(),open:unread}}),/entry bound/);
  const ledgers=Array.from({length:harness.conductLedgerScanLimits.runs+1},()=>cleanLedger());
  const entries=async function*(){for(const item of ledgers)yield{name:'local-'+item.runId};};
  await assert.rejects(harness.conductAssertNoRetainedLedgers('synthetic',{io:{lstat:async()=>directoryInfo,opendir:async()=>entries(),open:async(file:string)=>{
    if(file.endsWith('.next'))throw Object.assign(new Error('Absent'),{code:'ENOENT'});
    const value=ledgers.find(item=>file.includes(item.runId)),bytes=Buffer.from(JSON.stringify(value));return {stat:async()=>({isFile:()=>true,size:bytes.length}),read:async(buffer:Buffer)=>({bytesRead:bytes.copy(buffer)}),close:async()=>{}};
  }}}),/run bound/);
  await assert.rejects(harness.conductAssertNoRetainedLedgers('synthetic',{io:{lstat:async()=>directoryInfo,opendir:async()=>entries(),open:async(file:string)=>{
    if(file.endsWith('.next'))throw Object.assign(new Error('Absent'),{code:'ENOENT'});
    const value=ledgers.find(item=>file.includes(item.runId)),bytes=Buffer.alloc(harness.conductLedgerScanLimits.fileBytes,32);bytes.write(JSON.stringify(value));return {stat:async()=>({isFile:()=>true,size:bytes.length}),read:async(buffer:Buffer)=>({bytesRead:bytes.copy(buffer)}),close:async()=>{}};
  }}}),/total byte bound/);
});

test('shared advisory acquisition and retained-ledger scan precede this run ledger and owner sign-in',async()=>{
  const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../integration/student-conduct-http-live.mjs',import.meta.url),'utf8');
  const acquire=source.indexOf('lease=await conductReserveLease(pool,'),scan=source.indexOf('await conductAssertNoRetainedLedgers();'),create=source.indexOf('await mkdir(output,{mode:0o700})'),login=source.indexOf('await ownerLogin();');
  assert.ok(acquire>=0&&acquire<scan&&scan<create&&create<login);assert.ok(source.includes('pg_advisory_unlock(${conductAdvisoryLockKey[0]}::int,${conductAdvisoryLockKey[1]}::int)'));
  assert.ok(source.includes('max_lifetime:0,onclose:()=>lease?.lose()'));assert.ok(source.includes('const leasedClean=(label,action)=>clean(label,()=>lease.withHeld(action));'));
  assert.ok(source.includes('const safe=!lease.lost&&conductCleanupAllowed'));assert.ok(source.includes("ledger(cleanupFailures.length?'cleanup-required':'cleaned',cleanupFailures)"));
  assert.ok(source.includes("if(lease?.lost)cleanupFailures.push('database-lease-lost')"));assert.equal(source.includes('sql.begin('),false);assert.equal(source.includes('pool.begin('),false);
  assert.ok(source.indexOf("clean('advisory-release'")<source.indexOf("clean('database-close'"));
});

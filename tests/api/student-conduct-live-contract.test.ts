import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,mkdir,mkdtemp,opendir,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

// Variable import keeps this pure offline harness outside the API compilation
// project. Importing it must not resolve credentials or run its live main.
const modulePath='../integration/student-conduct-http-live.mjs';
const harness=await import(modulePath);
const op={actorId:'synthetic-admin',kind:'save_student_conduct',payload:{id:'synthetic-record',user_id:'synthetic-student',request_id:'synthetic-request',expected_version:1},state:'uncertain',sentAt:1000};
const result={id:op.payload.id,kind:op.kind,version:2,summary:'Synthetic literal receipt'};
const receipt={user_id:op.actorId,request_id:op.payload.request_id,kind:op.kind,payload:op.payload,result};
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
  const acquire=source.indexOf('locked=(await sql`select pg_try_advisory_lock(${conductAdvisoryLockKey[0]}::int,${conductAdvisoryLockKey[1]}::int)'),scan=source.indexOf('await conductAssertNoRetainedLedgers();'),create=source.indexOf('await mkdir(output,{mode:0o700})'),login=source.indexOf('await ownerLogin();');
  assert.ok(acquire>=0&&acquire<scan&&scan<create&&create<login);assert.ok(source.includes('pg_advisory_unlock(${conductAdvisoryLockKey[0]}::int,${conductAdvisoryLockKey[1]}::int)'));
});

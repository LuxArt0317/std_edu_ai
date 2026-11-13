import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {dtmDashboardLayoutDefaults,dtmDashboardLayoutPayloadBytes,validateDtmDashboardLayoutPayload} from '../../server/dtmDashboardLayout.js';

const modulePath='../integration/dtm-dashboard-layout-rls-live.mjs';
let blockedLoads=0,networkCalls=0;
const originalFetch=globalThis.fetch;
const hook=registerHooks({resolve(specifier,context,next){
  if(specifier==='postgres'||specifier.includes('deployment-env.mjs')){blockedLoads++;throw new Error('Live initialization forbidden during offline import.');}
  return next(specifier,context);
}});
globalThis.fetch=async()=>{networkCalls++;throw new Error('No network allowed in preflight contracts.');};
let harness:Record<string,any>,offline:Record<string,unknown>;
try{harness=await import(modulePath);offline=await harness.dashboardLayoutOfflineChecks();}
finally{hook.deregister();globalThis.fetch=originalFetch;}

test('import and self-test never resolve live credentials, initialize a DB client or use HTTP',()=>{
  assert.equal(blockedLoads,0);assert.equal(networkCalls,0);assert.equal(offline.status,'passed');assert.equal(offline.databaseConnections,0);
  assert.ok(Number(offline.contractCases)>60);assert.deepEqual(harness.dashboardLayoutExpectedSchema,{migrations:132,rls_tables:149});
  assert.ok(Object.isFrozen(harness.dashboardLayoutExpectedSchema));assert.deepEqual(harness.dashboardLayoutAdvisoryLockKey,[23101314,115100]);
});

test('only explicit rollback preflight with the exact current baseline is executable',()=>{
  assert.deepEqual(harness.dashboardLayoutCliOptions(['--self-test']),{selfTest:true});
  assert.deepEqual(harness.dashboardLayoutCliOptions(['--execute','--preflight','--expected-migrations=132','--expected-rls=149']),{selfTest:false});
  for(const args of [[],['--execute'],['--preflight'],['--self-test','--execute'],
    ['--execute','--preflight','--expected-migrations=131','--expected-rls=149'],
    ['--execute','--preflight','--expected-migrations=132','--expected-rls=150'],
    ['--execute','--execute','--expected-migrations=132','--expected-rls=149'],
    ['--execute','--preflight','--expected-migrations=132','--expected-rls=149','--commit']])assert.throws(()=>harness.dashboardLayoutCliOptions(args));
});

test('database targets reject another project, transaction pooling and connection overrides',()=>{
  const project='xiftudmvxphxcjtmfmib';
  for(const url of [`postgres://postgres@db.${project}.supabase.co/postgres`,`postgres://postgres.${project}@qa.pooler.supabase.com:5432/postgres?sslmode=verify-full`])harness.dashboardLayoutClientTarget(url);
  for(const url of [`postgres://postgres@db.other.supabase.co/postgres`,`postgres://wrong@db.${project}.supabase.co/postgres`,
    `postgres://postgres.${project}@qa.pooler.supabase.com:6543/postgres`,`postgres://postgres@db.${project}.supabase.co/other`,
    `postgres://postgres@db.${project}.supabase.co/postgres?host=other.invalid`,`postgres://postgres@db.${project}.supabase.co/postgres?sslmode=disable`])assert.throws(()=>harness.dashboardLayoutClientTarget(url));
});

test('validation matrix independently identifies valid bounds and rejects ownership or unsupported block fields',()=>{
  const fixture=harness.dashboardLayoutFixture();assert.deepEqual(fixture.blocks.map((row:{id:string})=>row.id),['contacts','important','navigation']);
  assert.equal(fixture.blocks[0].visible,false);assert.deepEqual(fixture.blocks.map((row:{weight:number})=>row.weight),[10,-10,0]);
  const matrix=harness.dashboardLayoutValidationCases(fixture);
  for(const entry of matrix)assert.equal(validateDtmDashboardLayoutPayload(entry.kind,entry.value)===null,entry.valid);
  for(const field of ['user_id','id','source_mode'])assert.ok(matrix.some((entry:{valid:boolean;value:object})=>!entry.valid&&entry.value&&Object.hasOwn(entry.value,field)));
  for(const value of [null,'false',1])assert.notEqual(validateDtmDashboardLayoutPayload('save_dtm_dashboard_layout',{
    ...fixture,blocks:fixture.blocks.map((row:object,index:number)=>index===0?{...row,visible:value}:row),
  }),null);
  const sparse=[...fixture.blocks];delete sparse[1];assert.notEqual(validateDtmDashboardLayoutPayload('save_dtm_dashboard_layout',{...fixture,blocks:sparse}),null);
  const hidden={...fixture};Object.defineProperty(hidden,'secret',{value:'must reject',enumerable:false});assert.notEqual(validateDtmDashboardLayoutPayload('save_dtm_dashboard_layout',hidden),null);
});

test('raw numeric scale reaches both PostgreSQL byte boundaries without changing semantic values',()=>{
  const fixture=harness.dashboardLayoutFixture();
  for(const bytes of [2048,2049]){
    const raw=harness.dashboardLayoutNumericBoundary(fixture,bytes);
    assert.deepEqual(JSON.parse(raw),fixture);assert.match(raw,/"expected_version":0\.0+/);
    assert.equal(dtmDashboardLayoutPayloadBytes(fixture)+raw.length-JSON.stringify(fixture).length,bytes);
  }
  for(const bytes of [1024,1025]){
    const raw=harness.dashboardLayoutBlocksBoundary(fixture,bytes);
    assert.deepEqual(JSON.parse(raw),fixture);assert.match(raw,/"weight":0\.0+/);
    assert.equal(dtmDashboardLayoutPayloadBytes(fixture.blocks)+raw.length-JSON.stringify(fixture).length,bytes);
  }
  assert.throws(()=>harness.dashboardLayoutNumericBoundary({...fixture,expected_version:1}));
});

test('receipt checks preserve literal false, equal weights, array order and monotonic reset versions',()=>{
  const payload=harness.dashboardLayoutFixture(),updatedAt='2026-11-13T02:00:00Z';
  const first={version:1,blocks:structuredClone(payload.blocks),updatedAt};assert.deepEqual(harness.dashboardLayoutCheckedReceipt('save_dtm_dashboard_layout',payload,first),first);
  const reset={request_id:randomUUID(),expected_version:2},result={version:3,blocks:dtmDashboardLayoutDefaults().blocks,updatedAt};
  assert.deepEqual(harness.dashboardLayoutCheckedReceipt('reset_dtm_dashboard_layout',reset,result),result);
  for(const invalid of [{...first,version:0},{...first,blocks:[...first.blocks].reverse()},{...first,blocks:first.blocks.map((row:object)=>({...row,visible:true}))},{...first,updatedAt:null},{...first,ownerId:'unexpected'}])
    assert.throws(()=>harness.dashboardLayoutCheckedReceipt('save_dtm_dashboard_layout',payload,invalid));
  assert.throws(()=>harness.dashboardLayoutCheckedReceipt('reset_dtm_dashboard_layout',reset,{...result,version:0,updatedAt:null}));
});

test('write actor guard allows only generated fixture users and explicit anonymous-negative cases',()=>{
  const users=[randomUUID(),randomUUID(),randomUUID()];for(const actor of [...users,null])harness.dashboardLayoutFixtureActor(actor,users);
  for(const actor of [randomUUID(),undefined,''])assert.throws(()=>harness.dashboardLayoutFixtureActor(actor,users));
});

function fakePool(){
  const calls:string[]=[],state={pid:71,held:true,writes:0,reserves:0,releases:0},savepoints=new Map<string,number>();
  let before=0,duringProbe:(()=>void)|undefined;
  const reserved=Object.assign(async(strings:TemplateStringsArray)=>{
    const text=strings.join('?');calls.push(text);
    if(text.includes('pg_try_advisory_lock'))return [{pid:state.pid,held:state.held}];
    if(text.includes('pg_catalog.pg_locks')){const rows=[{pid:state.pid,held:state.held}];duringProbe?.();return rows;}
    if(text.includes('pg_advisory_unlock')){const held=state.held;state.held=false;return [{unlocked:held}];}
    if(text==='synthetic write')state.writes++;return [];
  },{json:(value:unknown)=>value,unsafe:async(text:string)=>{
    calls.push(text);if(text==='begin')before=state.writes;else if(text==='rollback')state.writes=before;
    else if(text==='commit')assert.fail('Rollback-only harness must never commit.');
    else if(text.startsWith('savepoint '))savepoints.set(text.slice(10),state.writes);
    else if(text.startsWith('rollback to savepoint '))state.writes=savepoints.get(text.slice(22))!;
    else if(text.startsWith('release savepoint '))savepoints.delete(text.slice(18));return [];
  },release:async()=>{state.releases++;calls.push('release');}});
  return {pool:{reserve:async()=>{state.reserves++;return reserved;}},state,calls,setProbe:(callback:()=>void)=>{duringProbe=callback;}};
}

test('the reused reserved lease rolls back fixture work and releases exactly once without commit',async()=>{
  const existingPath='../integration/dormitory-conduct-rls-live.mjs',existing=await import(existingPath);
  assert.equal(harness.reserveDashboardLayoutLease,existing.reserveDormitoryConductLease);
  const fake=fakePool(),lease=await harness.reserveDashboardLayoutLease(fake.pool);
  await lease.rollbackOnly(async(tx:any)=>{await tx`synthetic write`;assert.equal(fake.state.writes,1);});
  assert.equal(fake.state.writes,0);assert.deepEqual(fake.calls.filter(text=>['begin','commit','rollback'].includes(text)),['begin','rollback']);
  await lease.release();await lease.release();assert.equal(fake.state.reserves,1);assert.equal(fake.state.releases,1);
});

test('post-probe lease loss prevents BEGIN and advisory unlock instead of reacquiring a session',async()=>{
  for(const operation of ['begin','unlock']){
    const fake=fakePool(),lease=await harness.reserveDashboardLayoutLease(fake.pool);let entered=false;
    fake.setProbe(()=>queueMicrotask(()=>queueMicrotask(()=>lease.lose())));
    if(operation==='begin')await assert.rejects(lease.rollbackOnly(()=>{entered=true;}));else await assert.rejects(lease.release());
    assert.equal(entered,false);assert.equal(fake.calls.includes('begin'),false);assert.equal(fake.calls.some(text=>text.includes('pg_advisory_unlock')),false);
    assert.equal(lease.lost,true);if(operation==='begin')await assert.rejects(lease.release());assert.equal(fake.state.reserves,1);assert.equal(fake.state.releases,1);
  }
});

test('prepared main retains exact fixture-only SQL, raw JSON text casts and rollback restoration guards',async()=>{
  const source=await readFile(new URL('../integration/dtm-dashboard-layout-rls-live.mjs',import.meta.url),'utf8');
  assert.match(source,/max_lifetime:0,idle_timeout:0/);assert.match(source,/onclose:\(\)=>lease\?\.lose\(\)/);
  assert.match(source,/await lease\.rollbackOnly\(/);assert.doesNotMatch(source,/pool\.begin\(|sql\.begin\(|\.unsafe\('commit'\)/);
  assert.match(source,/\$\{raw\}::text::jsonb/);assert.match(source,/dashboardLayoutFixtureActor\(actor,users\)/);
  assert.match(source,/await unrelated\(tx\),otherBefore/);assert.match(source,/await fingerprint\(owner\.id\),ownerBefore/);
  assert.match(source,/await schema\(sql\),schemaBefore/);assert.match(source,/await history\(sql\),historyBefore/);
  assert.ok(source.indexOf('await lease.release()')<source.indexOf('await pool.end('));
  assert.match(source,/await lease\.release\(\);\}catch\{cleanupVerified=false;/);
  assert.doesNotMatch(source,/affairs_initialize_account|dtm_initialize_account|\.env\.owner|update public\.affairs_profiles|update auth\.users/);
  const cleanup=source.slice(source.indexOf('  finally{\n    try{if(lease)'));assert.doesNotMatch(cleanup,/delete from/i);
  assert.match(source,/sequential stale operations only/);
});

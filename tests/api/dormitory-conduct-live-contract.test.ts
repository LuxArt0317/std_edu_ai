import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {dormitoryConductPayloadBytes,validateDormitoryConductPayload} from '../../server/dormitoryConduct.js';

// Importing this prepared harness must never resolve credentials or connect.
const modulePath='../integration/dormitory-conduct-rls-live.mjs';
const harness=await import(modulePath);
function fakePool(){
  const calls:string[]=[],state={pid:71,held:true,closed:false,reserves:0,releases:0,acquisitions:0,inTransaction:false,aborted:false,writes:0};
  let before=0;const savepoints=new Map<string,number>();let duringProbe:(()=>void)|undefined;
  const sqlError=(code:string)=>Object.assign(new Error('Synthetic database condition'),{code});
  const reserved=Object.assign(async(strings:TemplateStringsArray,..._values:unknown[])=>{
    const text=strings.join('?');calls.push(text);if(state.closed)throw sqlError('CONNECTION_CLOSED');if(state.aborted)throw sqlError('25P02');
    if(text.includes('pg_try_advisory_lock')){state.acquisitions++;return [{pid:state.pid,held:state.held}];}
    if(text.includes('pg_catalog.pg_locks')){const result=[{pid:state.pid,held:state.held}];duringProbe?.();return result;}
    if(text.includes('pg_advisory_unlock')){const unlocked=state.held;state.held=false;return [{unlocked}];}
    if(text==='write synthetic fixture'){state.writes++;return [];}
    if(text==='reject synthetic SQL'){state.aborted=true;throw sqlError('42501');}
    return [];
  },{
    json:(value:unknown)=>value,
    unsafe:async(text:string)=>{
      calls.push(text);if(state.closed)throw sqlError('CONNECTION_CLOSED');
      if(text==='rollback'){state.writes=before;state.inTransaction=false;state.aborted=false;savepoints.clear();return [];}
      if(text.startsWith('rollback to savepoint ')){const name=text.slice('rollback to savepoint '.length);assert.ok(savepoints.has(name));state.writes=savepoints.get(name)!;state.aborted=false;return [];}
      if(state.aborted)throw sqlError('25P02');
      if(text==='begin'){assert.equal(state.inTransaction,false);before=state.writes;state.inTransaction=true;return [];}
      if(text.startsWith('savepoint ')){assert.ok(state.inTransaction);savepoints.set(text.slice('savepoint '.length),state.writes);return [];}
      if(text.startsWith('release savepoint ')){assert.ok(savepoints.delete(text.slice('release savepoint '.length)));return [];}
      if(text==='commit')assert.fail('The rollback harness must never commit.');return [];
    },
    release:async()=>{calls.push('reserved release');state.releases++;}
  });
  const pool={reserve:async()=>{state.reserves++;return reserved;},end:async()=>{calls.push('pool end');}};
  return {pool,state,calls,setDuringProbe:(callback:()=>void)=>{duringProbe=callback;}};
}

test('offline entry validates the future baseline and never opens a live transport',async()=>{
  const saved=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Offline contracts must not perform HTTP.');};
  try{const result=await harness.dormitoryConductOfflineChecks();assert.equal(result.status,'passed');assert.equal(result.databaseConnections,0);assert.ok(result.contractCases>50);}
  finally{globalThis.fetch=saved;}
  assert.deepEqual(harness.dormitoryConductExpectedSchema,{migrations:131,rls_tables:148});assert.ok(Object.isFrozen(harness.dormitoryConductExpectedSchema));
  assert.deepEqual(harness.dormitoryConductAdvisoryLockKey,[23101314,115100]);assert.ok(Object.isFrozen(harness.dormitoryConductAdvisoryLockKey));
});

test('explicit execution, preflight, counts and exact direct/session database target are all required',()=>{
  assert.deepEqual(harness.dormitoryConductCliOptions(['--self-test']),{selfTest:true});
  for(const args of [[],['--execute'],['--self-test','--execute'],['--execute','--preflight','--expected-migrations=130','--expected-rls=147'],
    ['--execute','--preflight','--expected-migrations=131','--expected-rls=149'],['--execute','--execute','--expected-migrations=131','--expected-rls=148']])assert.throws(()=>harness.dormitoryConductCliOptions(args));
  for(const url of ['postgres://postgres@db.other.supabase.co/postgres','postgres://postgres.other@qa.pooler.supabase.com/postgres',
    'postgres://postgres.xiftudmvxphxcjtmfmib@qa.pooler.supabase.com:6543/postgres','postgres://postgres@db.xiftudmvxphxcjtmfmib.supabase.co/postgres?host=other.invalid',
    'postgres://postgres@db.xiftudmvxphxcjtmfmib.supabase.co/other'])assert.throws(()=>harness.dormitoryConductClientTarget(url));
});

test('fixture matrix preserves explicit unknown/empty and probes numeric encoding bytes without new fields',()=>{
  const fixture=harness.dormitoryConductFixture(randomUUID(),randomUUID(),randomUUID());assert.equal(fixture.result,'unknown');
  const matrix=harness.dormitoryConductValidationCases(fixture);for(const row of matrix)assert.equal(validateDormitoryConductPayload(row.kind,row.value)===null,row.valid);
  for(const bytes of [1024,1025]){
    const raw=harness.dormitoryConductNumericBoundary(fixture,bytes);assert.deepEqual(JSON.parse(raw),fixture);
    const extra=raw.length-JSON.stringify(fixture).length;assert.equal(dormitoryConductPayloadBytes(fixture)+extra,bytes);
    assert.match(raw,/"expected_version":0\.0+/);
  }
  assert.ok(matrix.some((row:{valid:boolean;value:{result?:string}})=>row.valid&&row.value.result==='empty'));
});

test('successful lifecycle always rolls back on the single reserved physical session and releases before close',async()=>{
  const fake=fakePool(),lease=await harness.reserveDormitoryConductLease(fake.pool);
  const result=await lease.rollbackOnly(async(tx:typeof lease.sql)=>{await tx`write synthetic fixture`;assert.equal(fake.state.writes,1);return 'checked';});
  assert.equal(result,'checked');assert.equal(fake.state.writes,0);assert.equal(fake.state.inTransaction,false);
  assert.deepEqual(fake.calls.filter(value=>['begin','commit','rollback'].includes(value)),['begin','rollback']);
  await lease.release();await fake.pool.end();assert.equal(fake.state.reserves,1);assert.equal(fake.state.acquisitions,1);assert.equal(fake.state.releases,1);
  assert.ok(fake.calls.indexOf('reserved release')<fake.calls.indexOf('pool end'));await lease.release();assert.equal(fake.state.releases,1);
  await assert.rejects(lease.withHeld(()=>assert.fail('Released lease cannot authorize work.')));
});

test('ordinary test failure restores prior transaction state and never commits',async()=>{
  const fake=fakePool(),lease=await harness.reserveDormitoryConductLease(fake.pool);fake.state.writes=3;
  await assert.rejects(lease.rollbackOnly(async(tx:typeof lease.sql)=>{await tx`write synthetic fixture`;throw new Error('Synthetic assertion');}),/Synthetic assertion/);
  assert.equal(fake.state.writes,3);assert.equal(fake.state.inTransaction,false);assert.equal(lease.lost,false);
  assert.deepEqual(fake.calls.filter(value=>['begin','commit','rollback'].includes(value)),['begin','rollback']);await lease.release();
});

test('expected SQL denial rolls back its aborted savepoint before probing the shared lock again',async()=>{
  const fake=fakePool(),lease=await harness.reserveDormitoryConductLease(fake.pool);
  await lease.rollbackOnly(async(tx:typeof lease.sql)=>{
    await tx`write synthetic fixture`;
    await assert.rejects(tx.savepoint(async(inner:typeof lease.sql)=>{await inner`write synthetic fixture`;await inner`reject synthetic SQL`;}),{code:'42501'});
    assert.equal(fake.state.writes,1);assert.equal(fake.state.aborted,false);assert.equal(lease.lost,false);
    await tx`write synthetic fixture`;assert.equal(fake.state.writes,2);
  });
  const denial=fake.calls.indexOf('reject synthetic SQL');assert.match(fake.calls[denial+1],/^rollback to savepoint dormitory_qa_1$/);
  assert.equal(fake.state.writes,0);await lease.release();
});

test('PID drift, missing lock and closed physical session stop all writes and never acquire a replacement',async()=>{
  for(const failure of ['pid','lock','closed','onclose']){
    const fake=fakePool();let losses=0,actions=0;const lease=await harness.reserveDormitoryConductLease(fake.pool,{onLost:()=>{losses++;}});
    if(failure==='pid')fake.state.pid++;else if(failure==='lock')fake.state.held=false;else if(failure==='closed')fake.state.closed=true;else lease.lose();
    await assert.rejects(lease.withHeld(()=>{actions++;}));assert.ok(lease.lost);assert.equal(losses,1);
    fake.state.closed=false;fake.state.pid=71;fake.state.held=true;
    await assert.rejects(lease.rollbackOnly(()=>{actions++;}));await assert.rejects(lease.sql`write synthetic fixture`);assert.equal(actions,0);assert.equal(fake.state.writes,0);
    await assert.rejects(lease.release());assert.equal(fake.state.reserves,1);assert.equal(fake.state.acquisitions,1);assert.equal(fake.state.releases,1);
    assert.equal(fake.calls.some(value=>value.includes('pg_advisory_unlock')),false);
  }
});

test('onclose during a stale successful probe cannot authorize an async write',async()=>{
  const fake=fakePool(),lease=await harness.reserveDormitoryConductLease(fake.pool);let writes=0;
  fake.setDuringProbe(()=>lease.lose());await assert.rejects(lease.withHeld(()=>{writes++;}));assert.equal(writes,0);assert.ok(lease.lost);
  await assert.rejects(lease.sql`write synthetic fixture`);assert.equal(fake.state.writes,0);await assert.rejects(lease.release());
});

// The first microtask runs before assertHeld resumes; the second runs after its
// successful probe check but before the awaiting control operation resumes.
function loseAfterSuccessfulProbe(fake:ReturnType<typeof fakePool>,lease:{lose:()=>void}){
  fake.setDuringProbe(()=>queueMicrotask(()=>queueMicrotask(()=>lease.lose())));
}

test('queued lease loss after the BEGIN probe prevents the control statement and transaction callback',async()=>{
  const fake=fakePool(),lease=await harness.reserveDormitoryConductLease(fake.pool);let entered=false;
  loseAfterSuccessfulProbe(fake,lease);
  await assert.rejects(lease.rollbackOnly(()=>{entered=true;}));
  assert.equal(entered,false);assert.equal(fake.calls.includes('begin'),false);assert.equal(fake.state.inTransaction,false);
  assert.ok(lease.lost);await assert.rejects(lease.release());assert.equal(fake.state.releases,1);
});

test('queued lease loss after the SAVEPOINT probe cannot create a savepoint or invoke its callback',async()=>{
  const fake=fakePool(),lease=await harness.reserveDormitoryConductLease(fake.pool);let entered=false;
  await assert.rejects(lease.rollbackOnly(async(tx:typeof lease.sql)=>{
    loseAfterSuccessfulProbe(fake,lease);await tx.savepoint(()=>{entered=true;});
  }));
  assert.equal(entered,false);assert.equal(fake.calls.some(value=>value.startsWith('savepoint ')),false);
  assert.ok(lease.lost);await assert.rejects(lease.release());assert.equal(fake.state.releases,1);
});

test('queued lease loss after the successful savepoint RELEASE probe prevents release',async()=>{
  const fake=fakePool(),lease=await harness.reserveDormitoryConductLease(fake.pool);
  await assert.rejects(lease.rollbackOnly(async(tx:typeof lease.sql)=>{
    await tx.savepoint(()=>{loseAfterSuccessfulProbe(fake,lease);return 'checked';});
  }));
  assert.ok(fake.calls.includes('savepoint dormitory_qa_1'));
  assert.equal(fake.calls.some(value=>value.startsWith('release savepoint ')),false);
  assert.ok(lease.lost);await assert.rejects(lease.release());assert.equal(fake.state.releases,1);
});

test('queued lease loss after savepoint recovery prevents its RELEASE and never reports success',async()=>{
  const fake=fakePool(),lease=await harness.reserveDormitoryConductLease(fake.pool);
  await assert.rejects(lease.rollbackOnly(async(tx:typeof lease.sql)=>{
    await tx.savepoint(async(inner:typeof lease.sql)=>{
      try{await inner`reject synthetic SQL`;}
      catch(error){loseAfterSuccessfulProbe(fake,lease);throw error;}
    });
  }));
  assert.ok(fake.calls.includes('rollback to savepoint dormitory_qa_1'));
  assert.equal(fake.state.aborted,false);assert.equal(fake.calls.some(value=>value.startsWith('release savepoint ')),false);
  assert.ok(lease.lost);await assert.rejects(lease.release());assert.equal(fake.state.releases,1);
});

test('queued lease loss after the unlock probe cannot issue advisory unlock and still releases the reservation once',async()=>{
  const fake=fakePool(),lease=await harness.reserveDormitoryConductLease(fake.pool);
  loseAfterSuccessfulProbe(fake,lease);
  await assert.rejects(lease.release());
  assert.equal(fake.calls.some(value=>value.includes('pg_advisory_unlock')),false);
  assert.ok(lease.lost);assert.equal(fake.state.reserves,1);assert.equal(fake.state.acquisitions,1);assert.equal(fake.state.releases,1);
  await lease.release();assert.equal(fake.state.releases,1);
});

test('physical loss during a transaction reports failure without commit or a new session',async()=>{
  const fake=fakePool(),lease=await harness.reserveDormitoryConductLease(fake.pool);
  await assert.rejects(lease.rollbackOnly(async(tx:typeof lease.sql)=>{await tx`write synthetic fixture`;fake.state.closed=true;lease.lose();}));
  assert.ok(lease.lost);assert.equal(fake.calls.includes('commit'),false);assert.equal(fake.state.reserves,1);
  await assert.rejects(lease.release());assert.equal(fake.state.releases,1);
});

test('busy acquisition releases its reservation before any transaction starts',async()=>{
  const fake=fakePool();fake.state.held=false;await assert.rejects(harness.reserveDormitoryConductLease(fake.pool));
  assert.equal(fake.state.reserves,1);assert.equal(fake.state.releases,1);assert.equal(fake.calls.includes('begin'),false);assert.equal(fake.state.writes,0);
});

test('prepared main retains exact target, dependency, rollback and owner safeguards without a commit path',async()=>{
  const source=await readFile(new URL('../integration/dormitory-conduct-rls-live.mjs',import.meta.url),'utf8');
  assert.match(source,/max_lifetime:0,idle_timeout:0/);assert.match(source,/onclose:\(\)=>lease\?\.lose\(\)/);
  assert.match(source,/await lease\.rollbackOnly\(/);assert.doesNotMatch(source,/pool\.begin\(|sql\.begin\(|reserved\.unsafe\('commit'\)/);
  assert.match(source,/prerequisite='20261112210000'/);assert.match(source,/version='20261112220000'/);
  assert.match(source,/targets\.includes\(payload\.id\)&&users\.includes\(payload\.user_id\)/);
  assert.match(source,/\$\{raw\}::text::jsonb/);assert.match(source,/await fingerprint\(administrator\.id\),ownerBefore/);
  assert.match(source,/await schema\(sql\),schemaBefore/);assert.match(source,/await history\(sql\),historyBefore/);
  assert.ok(source.indexOf('await lease.release()')<source.indexOf('await pool.end('));
  assert.match(source,/await lease\.release\(\);\}catch\{cleanupVerified=false;/);
  assert.doesNotMatch(source,/delete from (?:auth\.users|public\.affairs_profiles|private\.affairs_dormitory_conduct_operations)/i);
  const cleanupStart=source.indexOf('  finally{\n    try{\n      if(lease)');assert.ok(cleanupStart>0);
  assert.doesNotMatch(source.slice(cleanupStart),/delete from/i);
  assert.match(source,/await denied\(tx,s=>s`delete from public\.affairs_dormitory_conduct/);
});

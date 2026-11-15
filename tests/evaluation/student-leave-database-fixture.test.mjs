import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,mkdtemp,readFile,realpath,rm} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import postgres from 'postgres';
import {runStudentLeaveDataPreflight} from './live-fixtures.mjs';
import {createStudentLeaveDatabaseFixture} from './student-leave-database-fixture.mjs';
import {openStudentLeaveFixtureJournal} from './student-leave-fixture-journal.mjs';
import {studentLeaveJournalBinding} from './student-leave-fixture-lifecycle.mjs';
import {buildStudentLeaveFixturePlan,leaveFixtureFamilies,leaveFixtureTables} from './student-leave-fixture-plan.mjs';

const {forms,reviews,audit}=leaveFixtureTables;
const runId='31900000-0000-4000-8000-000000000001';
const owner=(last,email)=>({id:'31900000-0000-4000-8000-00000000000'+last,email,runMarker:runId});
const ownerA=owner(2,'leave-a@example.invalid');
const ownerB=owner(3,'leave-b@example.invalid');
const protectedOwner=owner(4,'protected-local@example.invalid');
const binding={
  runId,owners:{A:ownerA,B:ownerB},projectRef:'xiftudmvxphxcjtmfmib',origin:'https://stdedu-abc123def-v1-d286.vercel.app',
  sourceRevision:'a'.repeat(40),suiteHash:'b'.repeat(64),
};
const journalBinding=studentLeaveJournalBinding(binding);
const plans=Object.fromEntries(leaveFixtureFamilies.map(family=>[family,buildStudentLeaveFixturePlan({binding,family})]));
const publishableKey='TEST_PUBLISHABLE_KEY';
const jwtValue=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=id=>jwtValue({alg:'none'})+'.'+jwtValue({sub:id,role:'authenticated'})+'.fixturesignature';
const lease=async value=>sameBinding(value);
const sameBinding=value=>JSON.stringify(value)===JSON.stringify(journalBinding);

test('the data mount rejects aliased or production targets and requires explicit dependencies',()=>{
  const construct=origin=>createStudentLeaveDatabaseFixture({binding:{...binding,origin},sql:{unsafe(){assert.fail();}},
    assertLease:lease,assertCurrentRelease:lease,assertProtectedOwner:lease,journal:{read(){},compareAndSet(){}},publishableKey,
    getCaller(){assert.fail();},fetchImpl(){assert.fail();}});
  assert.throws(()=>construct('https://stdedu-branch-alias-v1-d286.vercel.app'),{code:'invalid_dependencies'});
  assert.throws(()=>construct('https://stu.best'),{code:'invalid_binding'});
  assert.equal(construct(binding.origin).status().requestObservationsMounted,false);
  assert.throws(()=>createStudentLeaveDatabaseFixture({binding}),{code:'invalid_dependencies'});
});

test('data setup refuses missing leases before contact and never counts as hosted acceptance',async()=>{
  const fixture=createStudentLeaveDatabaseFixture({binding,publishableKey,
    sql:{unsafe(){assert.fail('A missing lease must be rejected before SQL');}},
    assertLease:async()=>false,assertCurrentRelease:lease,assertProtectedOwner:lease,
    journal:{read:async()=>null,compareAndSet(){assert.fail();}},
    getCaller(){assert.fail();},fetchImpl(){assert.fail();}});
  await assert.rejects(fixture.transition(plans.ordinary),{code:'lease_unavailable'});
  assert.equal(fixture.status().requestObservationsMounted,false);
  assert.equal(fixture.status().liveAcceptance,false);
});

test('the operator entry refuses aliases and malformed revisions before provider access',async t=>{
  t.mock.method(globalThis,'fetch',()=>assert.fail('The invalid target must stop before provider access'));
  await assert.rejects(runStudentLeaveDataPreflight({origin:'https://stu.best',sourceRevision:binding.sourceRevision}),{code:'fixture-config'});
  await assert.rejects(runStudentLeaveDataPreflight({origin:binding.origin,sourceRevision:'branch-head'}),{code:'fixture-config'});
});

const socket=process.env.STU_LEAVE_TEST_PG_SOCKET;
const migration=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');

test('fresh PostgreSQL validates the journaled SQL, own/crossed RLS probes and cleanup', {skip:!socket,timeout:30000},async t=>{
  assert.match(socket,/^\/private\/var\/tmp\/stu100-leave-data-pg\.[A-Za-z0-9]{6}\/socket$/u);
  const socketDir=await lstat(socket);
  assert.equal(await realpath(socket),socket);
  assert.equal(socketDir.uid,process.getuid());
  assert.equal(socketDir.mode&0o777,0o700);
  assert.ok((await lstat(join(socket,'.s.PGSQL.5432'))).isSocket());
  const connect=database=>postgres({host:socket,user:'postgres',database,port:5432,max:1,ssl:false,connect_timeout:3,
    onnotice:()=>{},connection:{application_name:'stu-leave-local-test',statement_timeout:4500}});
  const root=connect('postgres');
  const database='leave_fixture_'+randomUUID().replaceAll('-','');
  // Only a generated scratch database can be created on the explicit socket.
  await root.unsafe('create database '+database);
  const sql=connect(database),caller=connect(database);
  const directory=await mkdtemp(join(socket,'journal-'));
  t.after(async()=>{
    await Promise.all([sql.end(),caller.end()]);
    await root.unsafe('drop database '+database);
    await root.end();
    await rm(directory,{recursive:true,force:true});
  });
  await sql.unsafe(`do $$begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end$$;
    create schema auth;create schema private;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(provider_id text,user_id uuid references auth.users on delete cascade,identity_data jsonb,provider text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,private to authenticated;`);
  for(const name of ['20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
    '20261106010000_affairs_academic_records.sql','20261112010000_student_workspace.sql','20261112020000_leave_application_fields.sql'])
    await sql.unsafe(await migration(name));
  for(const row of [ownerA,ownerB,protectedOwner]){
    await sql`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
      (${row.id},${row.email},now(),${sql.json({assistant_evaluation_run:row===protectedOwner?'production-like-control':runId})})`;
    await sql`insert into auth.identities(provider_id,user_id,identity_data,provider) values
      (${row.id},${row.id},${sql.json({email:row.email,email_verified:true})},'google')`;
    await sql`insert into public.affairs_profiles(user_id,email,display_name,role) values
      (${row.id},${row.email},'Local fixture',${row===protectedOwner?'admin':'student'})`;
  }
  const unrelatedForm=await sql`insert into public.affairs_service_records(user_id,service_key,record_type,title,status,starts_on,ends_on,leave_category,periods)
    values(${protectedOwner.id},'leave','leave','Unrelated record','filed','2026-11-09','2026-11-10','personal','1') returning id`;
  const readControl=()=>sql`select id,user_id,title from public.affairs_service_records where id=${unrelatedForm[0].id}`;
  const originalControl=Array.from(await readControl());
  const requests=[];
  const visible={
    [forms]:'id,user_id,service_key,record_type,starts_on,ends_on,status,leave_category,periods,review_request_id',
    [reviews]:'id,user_id,request_type,status',
  };
  async function localRlsRead(url,request){
    assert.equal(url.origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
    assert.equal(request.redirect,'error');
    assert.equal(request.headers.apikey,publishableKey);
    assert.equal(request.headers.Prefer,'count=exact');
    const table=url.pathname.split('/').at(-1);
    assert.ok(Object.hasOwn(visible,table));
    assert.equal(url.searchParams.get('select'),visible[table]);
    assert.equal(url.searchParams.get('order'),'id.asc');
    assert.equal(url.searchParams.get('limit'),'80');
    const callerId=JSON.parse(Buffer.from(request.headers.Authorization.split('.')[1],'base64url')).sub;
    const targetId=url.searchParams.get('user_id').slice(3);
    const ids=url.searchParams.get('id')?.slice(4,-1).split(',')??[];
    assert.equal(ids.length>0,callerId!==targetId);
    const predicate=table===forms?"service_key='leave' and record_type='leave'":"request_type='general'";
    const projection=visible[table].replace(/starts_on|ends_on/gu,field=>field+'::text as '+field);
    const rows=await caller.begin(async tx=>{
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${callerId},true)`;
      return tx.unsafe('select '+projection+' from public.'+table+' where user_id=$1::uuid and '+predicate
        +' and ($2::uuid[] = \'{}\' or id=any($2::uuid[])) order by id limit 80',[targetId,ids]);
    });
    requests.push({callerId,targetId,table,rows:rows.length});
    return Response.json(Array.from(rows),{headers:{'Content-Range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
  }
  async function countOwned(table){
    assert.ok(Object.values(leaveFixtureTables).includes(table));
    return (await sql.unsafe('select count(*)::int as n from public.'+table+' where user_id=any($1::uuid[])',[[ownerA.id,ownerB.id]]))[0].n;
  }
  async function acquireLocalLease(connection){
    const [lock]=await connection.unsafe('select pg_try_advisory_lock(23101314,115100) as held');
    assert.equal(lock.held,true);
    return async given=>sameBinding(given)&&(await connection.unsafe(
      'select 1 from pg_locks where locktype=\'advisory\' and pid=pg_backend_pid() and classid=23101314 and objid=115100 and objsubid=2 and granted')).length===1;
  }
  let uncertainCommit=false,wrongCaller=false;
  async function fixture(connection,localLease,journalDirectory){
    const heldSql={async unsafe(text,parameters=[]){
      const result=await connection.unsafe(text,parameters);
      if(text==='commit'&&uncertainCommit){uncertainCommit=false;throw new Error('controlled lost receipt');}
      return result;
    }};
    return createStudentLeaveDatabaseFixture({binding,sql:heldSql,publishableKey,
      assertLease:localLease,assertCurrentRelease:lease,assertProtectedOwner:lease,
      journal:await openStudentLeaveFixtureJournal({directory:journalDirectory,binding:journalBinding}),fetchImpl:localRlsRead,
      getCaller:async id=>({id,token:token(wrongCaller?protectedOwner.id:id)})});
  }
  const reserved=await sql.reserve();
  const localLease=await acquireLocalLease(reserved);
  try{
    const initial=await fixture(reserved,localLease,directory);
    const first=await initial.transition(plans.ordinary);
    assert.equal(first.ownerAndCrossedReads,8);
    assert.deepEqual(requests.filter(row=>row.callerId!==row.targetId).map(row=>row.rows),[0,0,0,0]);
    assert.ok(requests.filter(row=>row.callerId===row.targetId).every(row=>row.rows>0));
    assert.equal((await initial.verifyUnchanged()).rowDigest,first.rowDigest);
    for(const family of leaveFixtureFamilies.slice(1)){
      const configured=await initial.transition(plans[family]);
      assert.equal(configured.ownerAndCrossedReads,8);
      assert.deepEqual(await initial.verifyUnchanged(),configured);
    }
    assert.equal(requests.length,128);
    wrongCaller=true;
    await assert.rejects(initial.verifyUnchanged(),{code:'identity_mismatch'});
    assert.equal(requests.length,128,'wrong caller is rejected before HTTP transport dispatch');
    wrongCaller=false;
    const ready=await fixture(reserved,localLease,directory);
    await ready.reopenForCleanup();
    assert.equal((await ready.cleanup()).cleaned,true);
  }finally{await reserved.unsafe('select pg_advisory_unlock(23101314,115100)');reserved.release();}
  assert.equal(await countOwned(forms),0);
  assert.equal(await countOwned(reviews),0);
  assert.equal(await countOwned(audit),0);
  assert.deepEqual(Array.from(await readControl()),originalControl);

  await rm(directory,{recursive:true});
  const secondDirectory=await mkdtemp(join(socket,'journal-'));
  t.after(()=>rm(secondDirectory,{recursive:true,force:true}));
  const secondSql=await sql.reserve();
  const secondLease=await acquireLocalLease(secondSql);
  try{
    const operation=await fixture(secondSql,secondLease,secondDirectory);
    await operation.transition(plans.archive);
    uncertainCommit=true;
    await assert.rejects(operation.transition(plans.sibling),{code:'transaction_uncertain'});
    const recovered=await fixture(secondSql,secondLease,secondDirectory);
    await recovered.reopenForCleanup();
    assert.equal((await recovered.cleanup()).cleaned,true);
  }finally{await secondSql.unsafe('select pg_advisory_unlock(23101314,115100)');secondSql.release();}
  assert.equal(await countOwned(forms),0);
  assert.equal(await countOwned(reviews),0);
  assert.deepEqual(Array.from(await readControl()),originalControl);
});

import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {adjustmentTerm} from '../../server/courseAdjustmentContract.js';

const mode=process.argv[2];
assert.deepEqual(process.argv.slice(2),[mode]);
assert.ok(['--rollback-preflight','--deployed'].includes(mode));
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config=JSON.parse(await readFile('deployment.json','utf8'));
const ddl=await readFile('supabase/migrations/20261114110000_course_withdrawal.sql','utf8');
const students=Array.from({length:3},()=>randomUUID()),[own,other,nonGoogle]=students;
const [course,excluded,foreign,otherPhase,oldTerm]=Array.from({length:5},()=>randomUUID());
const term=adjustmentTerm();
const {academicYear:year,semester}=term;
const action={course_id:course,operation:'withdraw',expected_version:1,request_id:randomUUID()};
const instant=Date.now();
const windowPayload={academic_year:year,semester,opens_at:new Date(instant-3600000).toISOString(),
  closes_at:new Date(instant+3600000).toISOString(),expected_version:0,request_id:randomUUID()};
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const read=async q=>(await q`select public.affairs_read_course_withdrawal() as result`)[0].result;
const readAdmin=async q=>(await q`select public.affairs_read_course_withdrawal(${year},${semester}) as result`)[0].result;
const write=async (q,kind,payload)=>(await q`select public.affairs_write_course_withdrawal(${kind},${q.json(payload)}) as result`)[0].result;
const save=(q,payload)=>write(q,'change_course_withdrawal',payload);
const setWindow=(q,payload)=>write(q,'set_course_withdrawal_window',payload);
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,id,role='authenticated') {
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
const fingerprint=async q=>(await q`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${config.supabase.ownerEmail})) as owner,
  (select count(*)::int from auth.users where id=any(${students}::uuid[])) as fixtures,
  to_regclass('public.affairs_course_withdrawal_windows') is null as absent`)[0];
try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.ok(before.owner&&before.fixtures===0);
  assert.equal(before.absent,mode==='--rollback-preflight');
  await lease.rollbackOnly(async q=>{
    if(before.absent)await q.unsafe(ddl);
    const [owner]=await q`select id from auth.users where lower(email)=lower(${config.supabase.ownerEmail})`;
    await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      select ${'qa-'+randomUUID()},${owner.id},${q.json({sub:owner.id,email_verified:true})},'google',now(),now()
      where not exists(select 1 from auth.identities where user_id=${owner.id} and provider='google')`;
    await q`insert into public.affairs_profiles(user_id,email,display_name,role) values
      (${owner.id},${config.supabase.ownerEmail},'QA owner','admin') on conflict(user_id) do update set role='admin'`;
    for(const id of students){
      const email='course-withdrawal-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
      await q`insert into public.affairs_profiles(user_id,email,display_name) values(${id},${email},'QA student')`;
    }
    for(const [id,user,recordYear,phase,remark] of [
      [course,own,year,'withdrawal',null],[excluded,own,year,'withdrawal','A'],
      [foreign,other,year,'withdrawal',null],[otherPhase,own,year,'add_drop',null],[oldTerm,own,year-1,'withdrawal',null],
    ])await q`insert into public.affairs_course_selection_records
      (id,user_id,academic_year,semester,selection_phase,term_course_code,course_title,credits,remark_text,row_order,timetable_included)
      values(${id},${user},${recordYear},${semester},${phase},'QA-101','Test course',3,${remark},0,false)`;
    // Make this test independent of any real window. The change is rolled back.
    await q`delete from public.affairs_course_withdrawal_windows where academic_year=${year} and semester=${semester}`;
    await as(q,'','anon');
    await deny(q,read,'42501');await deny(q,s=>save(s,action),'42501');
    await as(q,nonGoogle);await deny(q,read,'42501');
    await as(q,own);
    assert.equal((await read(q)).state,'unconfigured');
    assert.deepEqual((await read(q)).courses.map(row=>row.id).sort(),[course,excluded].sort());
    await deny(q,readAdmin,'42501');
    await deny(q,s=>setWindow(s,windowPayload),'42501');
    await deny(q,s=>save(s,action),'PT409');
    await deny(q,s=>s`update public.affairs_course_selection_records set remark_text='Y(W)' where id=${course}`,'42501');
    await as(q,owner.id);
    const firstWindow=await setWindow(q,windowPayload);
    assert.equal(firstWindow.window.version,1);
    assert.deepEqual(await setWindow(q,windowPayload),firstWindow);
    assert.deepEqual((await readAdmin(q)).courses,[]);
    await deny(q,s=>setWindow(s,{...windowPayload,request_id:randomUUID()}),'PT409');
    await as(q,own);
    assert.equal((await read(q)).state,'open');
    for(const invalid of [foreign,otherPhase,oldTerm])await deny(q,s=>save(s,{...action,course_id:invalid}),'42501');
    await deny(q,s=>save(s,{...action,course_id:excluded}),'PT409');
    const receipt=await save(q,action);
    assert.equal(receipt.remark,'Y(W)');assert.equal(receipt.version,2);
    assert.deepEqual(await save(q,action),receipt);
    assert.equal((await read(q)).courses.find(row=>row.id===course).remark_text,'Y(W)');
    await deny(q,s=>save(s,{...action,operation:'restore'}),'PT409');
    await deny(q,s=>save(s,{...action,request_id:randomUUID()}),'PT409');
    const restore={...action,expected_version:2,operation:'restore',request_id:randomUUID()};
    assert.equal((await save(q,restore)).remark,null);
    assert.equal((await read(q)).courses.find(row=>row.id===course).version,3);
    await as(q,other);
    assert.deepEqual((await read(q)).courses.map(row=>row.id),[foreign]);
    await deny(q,s=>save(s,action),'42501');
    await as(q,owner.id);
    const closed={...windowPayload,opens_at:new Date(instant-7200000).toISOString(),closes_at:new Date(instant-3600000).toISOString(),
      expected_version:1,request_id:randomUUID()};
    assert.equal((await setWindow(q,closed)).window.version,2);
    assert.equal((await readAdmin(q)).state,'closed');
    await as(q,own);
    await deny(q,s=>save(s,{...action,expected_version:3,request_id:randomUUID()}),'PT409');
    assert.deepEqual(await save(q,restore),{userId:own,requestId:restore.request_id,courseId:course,version:3,remark:null});
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Exact-client rollback passed: student isolation, admin window, current phase and term, withdrawal/restore, replay, closed window and cleanup.');
}finally{
  try{await lease?.release();}finally{await pool.end({timeout:5});}
}

import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {studentProfileDetails as details} from './helpers/student-profile-fixture.mjs';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--rollback-preflight','--deployed'].includes(mode)&&!extra.length);
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config=JSON.parse(await readFile('deployment.json','utf8'));
const ddl=await readFile('supabase/migrations/20261114210000_student_profile_confirmation.sql','utf8');
const students=Array.from({length:3},()=>randomUUID()),[own,other,nonGoogle]=students;
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const fingerprint=async q=>(await q`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${config.supabase.ownerEmail})) as owner,
  (select count(*)::int from auth.users where id=any(${students}::uuid[])) as fixtures,
  to_regclass('public.affairs_student_profiles') is null as absent,
  to_regclass('private.affairs_student_profile_receipts') is null as receipts_absent`)[0];
const read=async (q,target=null,status=false)=>(await q`select public.affairs_read_student_profile(${target}::uuid,${status}) as result`)[0].result;
const change=async (q,op,payload)=>(await q`select public.affairs_change_student_profile(${op},${q.json(payload)}) as result`)[0].result;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,account,role='authenticated') {
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${account},true)`;
}
try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.ok(before.owner&&before.fixtures===0);
  assert.equal(before.absent,mode==='--rollback-preflight');
  assert.equal(before.receipts_absent,before.absent);
  await lease.rollbackOnly(async q=>{
    if(before.absent)await q.unsafe(ddl);
    const [owner]=await q`select id from auth.users where lower(email)=lower(${config.supabase.ownerEmail})`;
    assert.ok(owner?.id);
    await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      select ${'qa-'+randomUUID()},${owner.id},${q.json({sub:owner.id,email_verified:true})},'google',now(),now()
      where not exists(select 1 from auth.identities where user_id=${owner.id} and provider='google')`;
    await q`insert into public.affairs_profiles(user_id,email,display_name,role)
      values (${owner.id},${config.supabase.ownerEmail},'QA owner','admin')
      on conflict(user_id) do update set role='admin'`;
    for(const id of students){
      const email='profile-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values (${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
      await q`insert into public.affairs_profiles(user_id,email,display_name) values(${id},${email},'QA student')`;
    }
    const save={user_id:own,record:details,expected_version:0,request_id:randomUUID()};
    const confirm={updated_mobile:'0912345678',confirmed:true,expected_version:1,request_id:randomUUID()};
    await as(q,'','anon');
    await deny(q,s=>read(s),'42501');
    await deny(q,s=>change(s,'confirm',confirm),'42501');
    await as(q,nonGoogle);
    await deny(q,s=>read(s),'42501');
    await deny(q,s=>change(s,'confirm',confirm),'42501');
    await as(q,own);
    assert.deepEqual(await read(q),{userId:own,record:null});
    assert.deepEqual(await read(q,null,true),{userId:own,recordExists:false,confirmedAt:null});
    await deny(q,s=>change(s,'confirm',confirm),'PT404');
    await deny(q,s=>read(s,other),'42501');
    await deny(q,s=>change(s,'save',save),'42501');
    await deny(q,s=>s`select * from public.affairs_student_profiles`,'42501');
    await as(q,owner.id);
    await deny(q,s=>change(s,'save',{...save,record:{...details,identity_last_four:'A123456789'}}),'23514');
    await deny(q,s=>change(s,'save',{...save,record:{...details,identity_number:'A123456789'}}),'22023');
    const first=await change(q,'save',save);
    assert.deepEqual(first,{userId:own,version:1,confirmedAt:null});
    assert.deepEqual(await change(q,'save',save),first);
    await deny(q,s=>read(s,own,true),'22023');
    assert.deepEqual((await read(q,own)).record,{...details,user_id:own,version:1,confirmed_at:null,updated_mobile:null});
    await as(q,other);
    assert.deepEqual(await read(q),{userId:other,record:null});
    await deny(q,s=>read(s,own),'42501');
    await as(q,own);
    await deny(q,s=>change(s,'confirm',{...confirm,updated_mobile:'---'}),'22023');
    await deny(q,s=>change(s,'confirm',{...confirm,confirmed:false}),'22023');
    await deny(q,s=>change(s,'confirm',{...confirm,user_id:other}),'22023');
    const result=await change(q,'confirm',confirm);
    assert.equal(result.version,2);
    assert.equal(result.userId,own);
    assert.ok(Number.isFinite(Date.parse(result.confirmedAt)));
    assert.deepEqual(await change(q,'confirm',confirm),result);
    await deny(q,s=>change(s,'confirm',{...confirm,updated_mobile:null}),'PT409');
    assert.deepEqual(await read(q,null,true),{userId:own,recordExists:true,confirmedAt:result.confirmedAt});
    await as(q,owner.id);
    const update={...save,record:{...details,contact_phone:'070000000'},request_id:randomUUID()};
    await deny(q,s=>change(s,'save',update),'PT409');
    assert.deepEqual(await change(q,'save',{...update,expected_version:2}),{userId:own,version:3,confirmedAt:null});
    const saved=(await read(q,own)).record;
    assert.equal(saved.updated_mobile,confirm.updated_mobile);
    assert.equal(saved.contact_phone,update.record.contact_phone);
    await q.unsafe('reset role');
    const receipts=await q`select actor,operation,result,length(payload_digest) as bytes
      from private.affairs_student_profile_receipts where target=${own}`;
    assert.equal(receipts.length,3);
    assert.equal(receipts.filter(row=>row.actor===own&&row.operation==='confirm').length,1);
    assert.ok(receipts.every(row=>row.bytes===32&&Object.keys(row.result).length===3));
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Student profile rollback passed authorization, masked identity, revisions, retries, status privacy and fixture cleanup.');
}finally{
  try{await lease?.release();}finally{await pool.end({timeout:5});}
}

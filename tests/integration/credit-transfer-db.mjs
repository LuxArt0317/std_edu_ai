import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

const mode=process.argv[2];
assert.deepEqual(process.argv.slice(2),[mode]);
assert.ok(['--rollback-preflight','--deployed'].includes(mode));
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config=JSON.parse(await readFile('deployment.json','utf8'));
const ddl=await readFile('supabase/migrations/20261114120000_credit_transfer.sql','utf8');
const students=Array.from({length:3},()=>randomUUID()),[own,other,nonGoogle]=students;
const draft={id:randomUUID(),reason:'external_transfer',previous_school:'QA Previous School',
  courses:[{previous_title:'Prior Programming',previous_credits:3,requested_title:'Programming',requested_credits:3,course_kind:'required'},
    {previous_title:'Prior Algebra',previous_credits:2.5,requested_title:'Algebra',requested_credits:3,course_kind:'elective'}],
  expected_version:0,request_id:randomUUID()};
const payload=(expected_version)=>({id:draft.id,expected_version,request_id:randomUUID()});
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const read=q=>q`select user_id,status,decisions,version from public.affairs_credit_transfer_applications where id=${draft.id}`;
const write=async(q,kind,body)=>(await q`select public.affairs_change_credit_transfer(${kind},${q.json(body)}) as row`)[0].row;
const save=(q,body)=>write(q,'save_credit_transfer',body);
const submit=(q,body)=>write(q,'submit_credit_transfer',body);
const review=(q,body)=>write(q,'review_credit_transfer',body);
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,id,role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
const fingerprint=async q=>(await q`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${config.supabase.ownerEmail})) as owner,
  (select count(*)::int from auth.users where id=any(${students}::uuid[])) as fixtures,
  to_regclass('public.affairs_credit_transfer_applications') is null as absent`)[0];
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
    await q`insert into public.affairs_profiles(user_id,email,display_name,role)
      values(${owner.id},${config.supabase.ownerEmail},'QA owner','admin') on conflict(user_id) do update set role='admin'`;
    for(const id of students){
      const email='credit-transfer-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
    }
    await as(q,'','anon');
    await deny(q,read,'42501');
    await deny(q,s=>save(s,draft),'42501');
    await as(q,nonGoogle);
    await deny(q,s=>save(s,draft),'42501');
    await as(q,own);
    assert.equal((await read(q)).length,0);
    await deny(q,s=>save(s,{...draft,courses:[{...draft.courses[0],previous_credits:'3'}]}),'22023');
    const row=await save(q,draft);
    assert.equal(row.status,'draft');assert.equal(row.user_id,own);
    assert.equal((await q`select user_id from public.affairs_profiles where user_id=${own}`).length,1);
    assert.deepEqual(await save(q,draft),row);
    await deny(q,s=>save(s,{...draft,previous_school:'Different'}),'PT409');
    await deny(q,s=>save(s,{...draft,id:randomUUID(),request_id:randomUUID()}),'PT409');
    const updated=await save(q,{...draft,...payload(1),previous_school:'Edited Previous School'});
    assert.equal(updated.version,2);
    await deny(q,s=>submit(s,payload(1)),'PT409');
    await deny(q,s=>review(s,{...payload(2),decisions:['transferred','waived']}),'42501');
    const submitAction=payload(2),submitted=await submit(q,submitAction);
    assert.equal(submitted.status,'submitted');
    assert.deepEqual(await submit(q,submitAction),submitted);
    await deny(q,s=>save(s,{...draft,...payload(3)}),'PT409');
    await deny(q,s=>s`update public.affairs_credit_transfer_applications set version=99 where id=${draft.id}`,'42501');
    await as(q,other);
    assert.equal((await read(q)).length,0);
    await deny(q,s=>submit(s,payload(3)),'42501');
    await as(q,owner.id);
    assert.equal((await read(q))[0].status,'submitted');
    await deny(q,s=>review(s,{...payload(3),decisions:['waived']}),'22023');
    const reviewAction={...payload(3),decisions:['transferred','waived']};
    const reviewed=await review(q,reviewAction);
    assert.equal(reviewed.status,'reviewed');assert.equal(reviewed.version,4);
    assert.deepEqual(reviewed.decisions,reviewAction.decisions);
    assert.deepEqual(await review(q,reviewAction),reviewed);
    await as(q,own);
    assert.equal((await read(q))[0].status,'reviewed');
    await as(q,nonGoogle);
    assert.equal((await read(q)).length,0);
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Exact-client rollback passed: draft, versioned edit, submit, per-course review, role and account isolation, replay and cleanup.');
}finally{
  try{await lease?.release();}finally{await pool.end({timeout:5});}
}

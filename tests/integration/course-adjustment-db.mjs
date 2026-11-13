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
const ddl=await readFile('supabase/migrations/20261114100000_course_adjustment.sql','utf8');
const students=Array.from({length:3},()=>randomUUID());
const [own,other,nonGoogle]=students;
const action={user_id:own,phase:'add_drop',academic_year:115,semester:1,decision:'eligible',expected_version:0,request_id:randomUUID()};
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const fingerprint=async q=>(await q`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${config.supabase.ownerEmail})) as owner,
  (select count(*)::int from auth.users where id=any(${students}::uuid[])) as fixtures,
  to_regclass('public.affairs_course_adjustment_eligibility') is null as absent`)[0];
const read=q=>q`select user_id,decision,version from public.affairs_course_adjustment_eligibility where user_id=any(${students}::uuid[])`;
const save=async (q,payload)=>(await q`select public.affairs_set_course_adjustment_eligibility(${q.json(payload)}) as result`)[0].result;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,account,role='authenticated') {
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${account},true)`;
}
try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.ok(before.owner && before.fixtures===0);
  assert.equal(before.absent,mode==='--rollback-preflight');
  await lease.rollbackOnly(async q=>{
    if(before.absent)await q.unsafe(ddl);
    const [owner]=await q`select id from auth.users where lower(email)=lower(${config.supabase.ownerEmail})`;
    assert.ok(owner?.id);
    // Simulate the owner profile and linked identity only inside this rollback transaction.
    await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      select ${'qa-'+randomUUID()},${owner.id},${q.json({sub:owner.id,email_verified:true})},'google',now(),now()
      where not exists(select 1 from auth.identities where user_id=${owner.id} and provider='google')`;
    await q`insert into public.affairs_profiles(user_id,email,display_name,role)
      values (${owner.id},${config.supabase.ownerEmail},'QA owner','admin')
      on conflict(user_id) do update set role='admin'`;
    for(const id of students){
      const email='course-adjustment-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values (${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
      await q`insert into public.affairs_profiles(user_id,email,display_name) values(${id},${email},'QA student')`;
    }
    await as(q,'','anon');
    const [notice]=await q`select rules_en,selection_notes,fee_notes from public.affairs_late_add_notice`;
    assert.equal(notice.rules_en.length,2);
    assert.equal(notice.selection_notes.length,4);
    assert.equal(notice.fee_notes.length,3);
    await deny(q,s=>read(s),'42501');
    await deny(q,s=>save(s,action),'42501');
    await as(q,own);
    assert.equal((await read(q)).length,0);
    await deny(q,s=>save(s,action),'42501');
    await as(q,owner.id);
    const first=await save(q,action);
    assert.equal(first.user_id,own);assert.equal(first.decision,'eligible');assert.equal(first.version,1);
    assert.deepEqual(await save(q,action),first);
    await deny(q,s=>save(s,{...action,decision:'ineligible'}),'PT409');
    await deny(q,s=>save(s,{...action,request_id:randomUUID()}),'PT409');
    await deny(q,s=>save(s,{...action,semester:3,request_id:randomUUID()}),'22023');
    const next={...action,decision:'ineligible',expected_version:1,request_id:randomUUID()};
    assert.equal((await save(q,next)).version,2);
    assert.equal((await save(q,{...action,phase:'late_add',request_id:randomUUID()})).version,1);
    await as(q,own);
    assert.deepEqual((await read(q)).map(row=>row.decision).sort(),['eligible','ineligible']);
    await deny(q,s=>s`update public.affairs_course_adjustment_eligibility set decision='eligible'`,'42501');
    await as(q,other);
    assert.equal((await read(q)).length,0);
    await as(q,nonGoogle);
    assert.equal((await read(q)).length,0);
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Exact-client rollback verified role isolation, public rules, manager decisions, phase isolation, durable retries, stale writes and cleanup.');
}finally{
  try{await lease?.release();}finally{await pool.end({timeout:5});}
}

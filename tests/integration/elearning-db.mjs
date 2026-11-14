import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--rollback-preflight','--deployed'].includes(mode)&&!extra.length);
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const deployment=JSON.parse(await readFile('deployment.json','utf8'));
const ddl=await readFile('supabase/migrations/20261115010000_remote_learning.sql','utf8');
const accounts=Array.from({length:3},()=>randomUUID()),[student,other,nonGoogle]=accounts;
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
async function state(q){
  return (await q`select
    (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${deployment.supabase.ownerEmail})) as owner,
    (select count(*)::int from auth.users where id=any(${accounts}::uuid[])) as fixtures,
    to_regclass('public.elearning_enrollments') is null as absent`)[0];
}
async function as(q,account,role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${account},true)`;
}
const read=async q=>(await q`select public.elearning_workspace() as response`)[0].response;
const join=async(q,id)=>(await q`select public.elearning_join(${id}) as response`)[0].response;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);

try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await state(lease.sql);
  assert.ok(before.owner&&before.fixtures===0);
  assert.equal(before.absent,mode==='--rollback-preflight');
  await lease.rollbackOnly(async q=>{
    if(before.absent)await q.unsafe(ddl);
    for(const id of accounts){
      const email='elearning-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
    }
    await as(q,'','anon');
    await deny(q,read,'42501');
    await deny(q,s=>join(s,9718),'42501');
    await as(q,nonGoogle);
    assert.equal(await read(q),null);
    await deny(q,s=>join(s,9718),'42501');
    await as(q,student);
    await deny(q,s=>s`select * from public.elearning_enrollments`,'42501');
    await deny(q,s=>s`insert into public.elearning_enrollments(user_id,course_id) values(${other},9718)`,'42501');
    const catalog=await read(q);
    assert.equal(catalog.userId,student);
    assert.equal(catalog.categories.length,34);
    assert.equal(catalog.courses.length,20);
    assert.equal(catalog.notices.length,20);
    assert.deepEqual(catalog.enrollments,[]);
    assert.ok(catalog.notices.find(row=>row.id===325504).local_body.includes('TronClass'));
    await deny(q,s=>join(s,10582),'PT404');
    await deny(q,s=>join(s,null),'PT404');
    const receipt=await join(q,9718);
    assert.equal(receipt.courseId,9718);
    assert.ok(Number.isFinite(Date.parse(receipt.joinedAt)));
    assert.deepEqual(await join(q,9718),receipt);
    assert.deepEqual((await read(q)).enrollments,[receipt]);
    await as(q,other);
    assert.deepEqual((await read(q)).enrollments,[]);
    await as(q,student);
    assert.deepEqual((await read(q)).enrollments,[receipt]);
    await q.unsafe('reset role');
    assert.equal((await q`select count(*)::int as n from public.dtm_courses where user_id=any(${accounts}::uuid[])`)[0].n,0);
  });
  assert.deepEqual(await state(lease.sql),before);
  console.log('Remote-learning catalog, private enrollment, repeat requests, DTM separation and exact rollback verified.');
}finally{
  try{if(lease&&!lease.lost)await lease.release();}finally{await pool.end({timeout:3});}
}

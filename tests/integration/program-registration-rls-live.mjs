import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

assert.deepEqual(process.argv.slice(2),['--rollback-preflight']);
const connection = deploymentEnvironment().POSTGRES_URL_NON_POOLING || deploymentEnvironment().POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config = JSON.parse(await readFile('deployment.json','utf8'));
assert.equal(config.repository,'LuxArt0317/std_edu_ai');
const ddl = await readFile('supabase/migrations/20261114070000_interdisciplinary_registrations.sql','utf8');
const accounts = [randomUUID(),randomUUID(),randomUUID()];
const [own,other,nonGoogle] = accounts;
const operation = {program_code:'PU002',request_id:randomUUID(),operation:'register',expected_version:0};
const withdraw = {...operation,request_id:randomUUID(),operation:'withdraw',expected_version:1};
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const fingerprint=async sql=>(await sql`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${config.supabase.ownerEmail})) as owner,
  (select count(*)::int from auth.users where id=any(${accounts}::uuid[])) as fixtures,
  to_regclass('public.affairs_interdisciplinary_registrations') is null as absent`)[0];

const read=q=>q`select user_id,program_code,withdrawn_year,version from public.affairs_interdisciplinary_registrations`;
const save=async (q,payload)=>(await q`select public.affairs_change_interdisciplinary_registration(${q.json(payload)}) as result`)[0].result;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,account,role='authenticated') {
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${account},true)`;
}
try {
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.equal(before.migrations,140);
  assert.ok(before.owner && before.absent && before.fixtures===0);
  await lease.rollbackOnly(async q=>{
    await q.unsafe(ddl);
    for (const id of accounts) {
      const email='program-registration-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if (id!==nonGoogle) await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values (${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
    }
    await as(q,own);
    assert.equal((await read(q)).length,0);
    await deny(q,s=>save(s,{...operation,user_id:other}),'22023');
    await deny(q,s=>save(s,{...operation,program_code:'PU999'}),'22023');
    const first=await save(q,operation);
    assert.deepEqual(first,{userId:own,requestId:operation.request_id,programCode:'PU002',version:1});
    assert.deepEqual(await save(q,operation),first);
    await deny(q,s=>save(s,{...operation,program_code:'PU007'}),'PT409');
    await deny(q,s=>save(s,{...operation,request_id:randomUUID()}),'PT409');
    await deny(q,s=>s`update public.affairs_interdisciplinary_registrations set version=4`,'42501');
    const dropped=await save(q,withdraw);
    assert.equal(dropped.version,2);
    assert.deepEqual(await save(q,withdraw),dropped);
    assert.deepEqual(await save(q,operation),first);
    await deny(q,s=>save(s,{...withdraw,request_id:randomUUID()}),'PT409');
    const [row]=await read(q);
    assert.equal(row.version,2);
    assert.ok(row.withdrawn_year);
    await as(q,other);
    assert.equal((await read(q)).length,0);
    await deny(q,s=>save(s,withdraw),'PT409');
    await as(q,nonGoogle);
    assert.equal((await read(q)).length,0);
    await deny(q,s=>save(s,operation),'42501');
    await as(q,'','anon');
    await deny(q,s=>read(s),'42501');
    await deny(q,s=>save(s,operation),'42501');
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Registration validation, replay, stale writes, RLS and exact rollback passed.');
} finally {
  try{await lease?.release();}finally{await pool.end({timeout:5});}
}

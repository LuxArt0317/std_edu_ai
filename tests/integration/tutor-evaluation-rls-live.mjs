import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget, reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

assert.deepEqual(process.argv.slice(2), ['--rollback-preflight']);
const config = JSON.parse(await readFile('deployment.json','utf8'));
assert.equal(config.repository, 'LuxArt0317/std_edu_ai');
const env = deploymentEnvironment();
const connection = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
dormitoryConductClientTarget(connection);
const ddl = await readFile('supabase/migrations/20261114050000_tutor_evaluations.sql','utf8');
let lease;
const pool = postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const one=randomUUID(), two=randomUUID(), nonGoogle=randomUUID();
const fixtures=[one,two,nonGoogle];
const draft = {request_id:randomUUID(),ratings:[5,4,3,2,1,5,4,3,2,1],comment:' 問卷測試 '};
async function fingerprint(sql) {
  return (await sql`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select md5(jsonb_agg(to_jsonb(m) order by version)::text) from supabase_migrations.schema_migrations m) as history,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls,
    (select md5(to_jsonb(u)::text) from auth.users u where lower(email)=lower(${config.supabase.ownerEmail})) as owner_hash,
    (select count(*)::int from auth.users where id=any(${fixtures}::uuid[])) as fixtures,
    to_regclass('public.affairs_tutor_evaluations') is null
      and to_regprocedure('public.affairs_read_tutor_evaluation()') is null
      and to_regprocedure('public.affairs_submit_tutor_evaluation(jsonb)') is null as absent`)[0];
}
async function as(q,userId,anonymous=false) {
  await q.unsafe(anonymous?'set local role anon':'set local role authenticated');
  await q`select set_config('request.jwt.claim.sub',${userId},true)`;
}
const read = async q => (await q`select public.affairs_read_tutor_evaluation() as data`)[0].data;
const save = async (q,payload) => (await q`select public.affairs_submit_tutor_evaluation(${q.json(payload)}) as data`)[0].data;
const deny = (q,task,code) => assert.rejects(q.savepoint(task),error=>error.code===code);
const checks=[];
let stage='database';
try {
  lease=await reserveDormitoryConductLease(pool);
  const {sql}=lease,before=await fingerprint(sql);
  assert.equal(before.migrations,138);
  assert.equal(before.rls,154);
  assert.ok(before.absent && before.owner_hash && before.fixtures===0);
  let failure;
  try {
    await lease.rollbackOnly(async q=>{
      stage='migration and fixtures';
      await q.unsafe("set local lock_timeout='8s'");
      for (const userId of fixtures) {
        const email=`tutor-evaluation-qa-${userId}@example.invalid`;
        await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
          values ('00000000-0000-0000-0000-000000000000',${userId},'authenticated','authenticated',${email},now(),now(),now())`;
        if (userId!==nonGoogle) await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
          values (${userId},${userId},${q.json({sub:userId,email,email_verified:true})},'google',now(),now())`;
      }
      await q.unsafe(ddl);
      stage='validation and replay';
      await as(q,one);
      assert.deepEqual(await read(q),{userId:one,student:null,evaluation:null});
      for (const payload of [
        {...draft,user_id:two},{...draft,ratings:[1,2,3]},{...draft,ratings:[0,...draft.ratings.slice(1)]},
        {...draft,ratings:['1',...draft.ratings.slice(1)]},{...draft,ratings:[null,...draft.ratings.slice(1)]},
        {...draft,comment:'文'.repeat(4001)},
      ]) await deny(q,s=>save(s,payload),'22023');
      const receipt = await save(q,draft);
      assert.equal(receipt.userId,one);
      assert.equal(receipt.requestId,draft.request_id);
      assert.deepEqual(await save(q,draft),receipt);
      assert.deepEqual((await read(q)).evaluation,{ratings:draft.ratings,comment:draft.comment,submittedAt:receipt.submittedAt});
      await deny(q,s=>save(s,{...draft,comment:'Changed payload'}),'PT409');
      await deny(q,s=>save(s,{...draft,request_id:randomUUID()}),'PT409');
      await deny(q,s=>s`update public.affairs_tutor_evaluations set comment='changed' where user_id=${one}`,'42501');
      checks.push('ratings-validation-and-immutable-replay');
      stage='owner isolation and auth';
      await as(q,two);
      assert.deepEqual(await read(q),{userId:two,student:null,evaluation:null});
      assert.equal((await q`select user_id from public.affairs_tutor_evaluations where user_id=${one}`).length,0);
      await as(q,nonGoogle);
      await deny(q,s=>read(s),'42501');
      await deny(q,s=>save(s,draft),'42501');
      await as(q,'',true);
      await deny(q,s=>read(s),'42501');
      checks.push('owner-isolation-and-auth');
    });
  } catch(error){failure=error;}
  assert.deepEqual(await fingerprint(sql),before);
  if(failure)throw failure;
  console.log(JSON.stringify({status:'passed',checks,exactRollback:true}));
} catch(error) {
  console.error(JSON.stringify({status:'failed',stage,code:error.code??error.name,line:error.stack?.match(/tutor-evaluation-rls-live\.mjs:(\d+)/)?.[1]}));
  process.exitCode=1;
} finally {try{await lease?.release();}finally{await pool.end({timeout:5});}}

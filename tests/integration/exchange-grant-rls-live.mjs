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
const ddl = await readFile('supabase/migrations/20261114040000_exchange_grant_drafts.sql','utf8');
let lease;
const pool = postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const one=randomUUID(), two=randomUUID(), nonGoogle=randomUUID(), id=randomUUID();
const fixtures=[one,two,nonGoogle];
const draft = {id,request_id:randomUUID(),expected_version:0,department:'系所 QA',activity_category:'研討會',
  starts_on:'2026-12-02',ends_on:'2026-12-03',activity_name:'活動 QA',activity_location:'高雄',topic:'研究題目',region:'南區',lodging:false};
async function fingerprint(sql) {
  return (await sql`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select md5(jsonb_agg(to_jsonb(m) order by version)::text) from supabase_migrations.schema_migrations m) as history,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls,
    (select md5(to_jsonb(u)::text) from auth.users u where lower(email)=lower(${config.supabase.ownerEmail})) as owner_hash,
    (select count(*)::int from auth.users where id=any(${fixtures}::uuid[])) as fixtures,
    to_regclass('public.affairs_exchange_grant_drafts') is null and to_regclass('private.affairs_exchange_grant_requests') is null
      and to_regprocedure('public.affairs_read_exchange_grants()') is null
      and to_regprocedure('public.affairs_manage_exchange_grant(text,jsonb)') is null as absent`)[0];
}
async function as(q,userId,anonymous=false) {
  await q.unsafe(anonymous?'set local role anon':'set local role authenticated');
  await q`select set_config('request.jwt.claim.sub',${userId},true)`;
}
const read = async q => (await q`select public.affairs_read_exchange_grants() as data`)[0].data;
const save = async (q,kind,payload) => (await q`select public.affairs_manage_exchange_grant(${kind},${q.json(payload)}) as data`)[0].data;
const deny = (q,task,code) => assert.rejects(q.savepoint(task),error=>error.code===code);
const checks=[];
let stage='database';
try {
  lease=await reserveDormitoryConductLease(pool);
  const {sql}=lease,before=await fingerprint(sql);
  assert.equal(before.migrations,137);
  assert.equal(before.rls,153);
  assert.ok(before.absent && before.owner_hash && before.fixtures===0);
  let failure;
  try {
    await lease.rollbackOnly(async q=>{
      stage='migration and synthetic identities';
      await q.unsafe("set local lock_timeout='8s'");
      for(const userId of fixtures){
        const email=`grant-qa-${userId}@example.invalid`;
        await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
          values ('00000000-0000-0000-0000-000000000000',${userId},'authenticated','authenticated',${email},now(),now(),now())`;
        if(userId!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
          values (${userId},${userId},${q.json({sub:userId,email,email_verified:true})},'google',now(),now())`;
      }
      await q.unsafe(ddl);
      stage='draft save, validation and replay';
      await as(q,one);
      assert.deepEqual(await read(q),{userId:one,records:[]});
      const first=await save(q,'save_exchange_grant_draft',draft);
      assert.deepEqual(first,{id,kind:'save_exchange_grant_draft',version:1});
      assert.deepEqual(await save(q,'save_exchange_grant_draft',draft),first);
      await deny(q,s=>save(s,'save_exchange_grant_draft',{...draft,activity_name:'different payload'}),'PT409');
      await deny(q,s=>save(s,'save_exchange_grant_draft',{...draft,id:randomUUID(),request_id:randomUUID(),starts_on:'2026-02-30'}),'22023');
      await deny(q,s=>save(s,'save_exchange_grant_draft',{...draft,id:randomUUID(),request_id:randomUUID(),ends_on:'2026-12-01'}),'22023');
      await deny(q,s=>save(s,'save_exchange_grant_draft',{...draft,user_id:two}),'22023');
      assert.equal((await read(q)).records[0].lodging,false);
      checks.push('draft-validates-persists-and-replays');
      stage='isolation';
      await as(q,two);
      assert.deepEqual(await read(q),{userId:two,records:[]});
      await deny(q,s=>save(s,'save_exchange_grant_report',{id,request_id:randomUUID(),expected_version:1,report_text:'Foreign attempt'}),'PT409');
      await deny(q,s=>save(s,'save_exchange_grant_draft',{...draft,request_id:randomUUID()}),'PT409');
      await deny(q,s=>s`update public.affairs_exchange_grant_drafts set topic='foreign' where id=${id}`,'42501');
      await as(q,nonGoogle);
      await deny(q,s=>read(s),'42501');
      await as(q,'',true);
      await deny(q,s=>read(s),'42501');
      checks.push('account-and-auth-isolation');
      stage='report and versioned delete';
      await as(q,one);
      const report={id,request_id:randomUUID(),expected_version:1,report_text:' 心得 QA\n第二行 '};
      const written=await save(q,'save_exchange_grant_report',report);
      assert.equal(written.version,2);
      assert.deepEqual(await save(q,'save_exchange_grant_report',report),written);
      assert.equal((await read(q)).records[0].report_text,report.report_text);
      await deny(q,s=>save(s,'save_exchange_grant_report',{...report,request_id:randomUUID()}),'PT409');
      assert.equal((await save(q,'delete_exchange_grant_draft',{id,request_id:randomUUID(),expected_version:2})).version,3);
      assert.deepEqual(await read(q),{userId:one,records:[]});
      await q.unsafe('reset role');
      assert.equal((await q`select count(*)::int as n from private.affairs_exchange_grant_requests where user_id=${one}`)[0].n,3);
      checks.push('report-version-conflict-and-deletion');
    });
  } catch(error){failure=error;}
  assert.deepEqual(await fingerprint(sql),before);
  if(failure)throw failure;
  console.log(JSON.stringify({status:'passed',checks,exactRollback:true}));
} catch(error) {
  console.error(JSON.stringify({status:'failed',stage,code:error.code??error.name,line:error.stack?.match(/exchange-grant-rls-live\.mjs:(\d+)/)?.[1]}));
  process.exitCode=1;
} finally {try{await lease?.release();}finally{await pool.end({timeout:5});}}

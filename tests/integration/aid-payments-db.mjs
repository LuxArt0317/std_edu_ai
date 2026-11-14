import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--preflight','--deployed'].includes(mode)&&!extra.length);
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config=JSON.parse(await readFile('deployment.json','utf8'));
const [a,b,c]=Array.from({length:3},()=>randomUUID());
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const state=async sql=>(await sql`select
  to_regprocedure('public.affairs_read_aid_payments(text,integer,boolean)') is not null installed,
  (select count(*)::int from auth.users where id in (${a},${b},${c})) fixtures,
  (select count(*)::int from supabase_migrations.schema_migrations) migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${config.supabase.ownerEmail})) owner`)[0];
const read=async(q,view='claims',offset=0,summary=false)=>(await q`select public.affairs_read_aid_payments(${view},${offset},${summary}) as data`)[0].data;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,id,role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await state(lease.sql);
  assert.ok(before.owner&&before.fixtures===0);
  assert.equal(before.installed,mode==='--deployed');
  await lease.rollbackOnly(async q=>{
    if(!before.installed)await q.unsafe(await readFile('supabase/migrations/20261115050000_student_aid_payments.sql','utf8'));
    for(const id of [a,b,c]){
      const email='aid-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==c)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
    }
    await q`insert into public.affairs_aid_payment_claims(user_id,position,reason,amount)
      select ${a},n,'QA claim '||n,0 from generate_series(1,26) n`;
    await q`insert into public.affairs_aid_salary_records(user_id,position,appointment_type,bank_last4,net)
      values(${a},1,'QA payroll','0012',50.20),(${b},1,'Foreign QA payroll',null,0)`;
    await deny(q,s=>s`update public.affairs_aid_salary_records set bank_last4='1234567890' where user_id=${a}`,'23514');
    await as(q,'','anon');
    await deny(q,read,'42501');
    await as(q,c);
    await deny(q,read,'42501');
    await as(q,a);
    await deny(q,s=>s`select * from public.affairs_aid_salary_records`,'42501');
    await deny(q,s=>read(s,'claims',1),'22023');
    assert.deepEqual(await read(q,'salary',0,true),{userId:a,view:'salary',total:1,rows:[]});
    assert.equal((await read(q)).rows.length,25);
    const last=await read(q,'claims',25);
    assert.equal(last.total,26);
    assert.equal(last.rows[0].reason,'QA claim 26');
    assert.equal(last.rows[0].amount,0);
    assert.equal(last.rows[0].approval_status,null);
    const own=(await read(q,'salary')).rows[0];
    assert.equal(own.bank_last4,'0012');
    assert.equal(own.net,50.2);
    assert.equal(Object.hasOwn(own,'user_id'),false);
    await as(q,b);
    assert.deepEqual(await read(q),{userId:b,view:'claims',total:0,rows:[]});
    assert.equal((await read(q,'salary')).rows[0].appointment_type,'Foreign QA payroll');
  });
  assert.deepEqual(await state(lease.sql),before);
  console.log('Aid claims and salary permissions, caller isolation, masks, pagination, and exact rollback verified.');
}finally{
  try{if(lease&&!lease.lost)await lease.release();}finally{await pool.end({timeout:4});}
}

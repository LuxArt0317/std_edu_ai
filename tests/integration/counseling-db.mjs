import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {counselingConsentVersion} from '../../server/counselingContract.js';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--rollback-preflight','--deployed'].includes(mode)&&!extra.length);
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config=JSON.parse(await readFile('deployment.json','utf8'));
const ddl=await readFile('supabase/migrations/20261115000000_counseling_appointments.sql','utf8');
const accounts=Array.from({length:4},()=>randomUUID()),[student,other,coordinator,nonGoogle]=accounts;
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const fingerprint=async q=>(await q`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${config.supabase.ownerEmail})) as owner,
  (select count(*)::int from auth.users where id=any(${accounts}::uuid[])) as fixtures,
  to_regclass('public.affairs_counseling_appointments') is null as absent`)[0];
const read=async(q,view)=>(await q`select public.affairs_read_counseling(${view}) as result`)[0].result;
const change=async(q,op,payload)=>(await q`select public.affairs_change_counseling(${op},${q.json(payload)}) as result`)[0].result;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,account,role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${account},true)`;
}

try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.ok(before.owner&&before.fixtures===0);
  assert.equal(before.absent,mode==='--rollback-preflight');
  await lease.rollbackOnly(async q=>{
    if(before.absent)await q.unsafe(ddl);
    const [owner]=await q`select id from auth.users where lower(email)=lower(${config.supabase.ownerEmail})`;
    assert.ok(owner?.id);
    await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      select ${'qa-'+randomUUID()},${owner.id},${q.json({sub:owner.id,email_verified:true})},'google',now(),now()
      where not exists(select 1 from auth.identities where user_id=${owner.id} and provider='google')`;
    await q`insert into public.affairs_profiles(user_id,email,display_name,role)
      values(${owner.id},${config.supabase.ownerEmail},'QA owner','admin')
      on conflict(user_id) do update set role='admin'`;
    for(const id of accounts){
      const email='counseling-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
    }
    const [dates]=await q`select ((now() at time zone 'Asia/Taipei')::date+1)::text as preferred,
      to_char(now() at time zone 'UTC'+interval '2 days','YYYY-MM-DD"T"HH24:MI:SS"Z"') as scheduled`;
    const preference={request_id:randomUUID(),kind:'assessment',preferred_on:dates.preferred,
      preferred_period:'morning',consent_version:counselingConsentVersion};
    const grant={request_id:randomUUID(),user_id:coordinator,enabled:true};
    await as(q,'','anon');
    await deny(q,s=>read(s,'mine'),'42501');
    await deny(q,s=>change(s,'request',preference),'42501');
    await as(q,nonGoogle);
    await deny(q,s=>read(s,'mine'),'42501');
    await as(q,student);
    await deny(q,s=>read(s,'queue'),'42501');
    await deny(q,s=>read(s,'access'),'42501');
    await deny(q,s=>change(s,'access',grant),'42501');
    await deny(q,s=>s`select * from public.affairs_counseling_appointments`,'42501');
    if(before.absent){
      assert.equal((await read(q,'mine')).available,false);
      await deny(q,s=>change(s,'request',preference),'PT409');
    }
    await as(q,owner.id);
    await deny(q,s=>read(s,'queue'),'42501');
    await deny(q,s=>change(s,'access',{...grant,user_id:nonGoogle}),'PT404');
    assert.deepEqual(await change(q,'access',grant),{userId:coordinator,enabled:true});
    assert.ok((await read(q,'access')).rows.includes(coordinator));
    await as(q,student);
    await deny(q,s=>change(s,'request',{...preference,consent_version:'old'}),'22023');
    await deny(q,s=>change(s,'request',{...preference,preferred_on:'2000-01-01'}),'22023');
    await deny(q,s=>change(s,'request',{...preference,notes:'unexpected'}),'22023');
    const request=await change(q,'request',preference);
    assert.deepEqual(request,{id:request.id,version:1,status:'requested'});
    assert.deepEqual(await change(q,'request',preference),request);
    await deny(q,s=>change(s,'request',{...preference,kind:'counseling'}),'PT409');
    await deny(q,s=>change(s,'request',{...preference,request_id:randomUUID()}),'PT409');
    const own=(await read(q,'mine')).rows;
    assert.equal(own.length,1);
    assert.equal(own[0].id,request.id);
    assert.ok(!Object.hasOwn(own[0],'contact_email'));
    await as(q,other);
    assert.deepEqual((await read(q,'mine')).rows,[]);
    const cancel={request_id:randomUUID(),id:request.id,expected_version:1};
    await deny(q,s=>change(s,'cancel',cancel),'PT404');
    const review={...cancel,request_id:randomUUID(),status:'scheduled',scheduled_at:dates.scheduled};
    await deny(q,s=>change(s,'review',review),'42501');
    await as(q,coordinator);
    const queued=(await read(q,'queue')).rows.find(row=>row.id===request.id);
    assert.equal(queued?.contact_email,'counseling-qa-'+student+'@example.invalid');
    assert.equal(queued?.preferred_period,'morning');
    await deny(q,s=>change(s,'review',{...review,scheduled_at:'2000-01-01T00:00Z'}),'22023');
    assert.deepEqual(await change(q,'review',review),{id:request.id,version:2,status:'scheduled'});
    assert.deepEqual(await change(q,'review',review),{id:request.id,version:2,status:'scheduled'});
    await as(q,student);
    await deny(q,s=>change(s,'cancel',cancel),'PT409');
    assert.equal(new Date((await read(q,'mine')).rows[0].scheduled_at).toISOString(),new Date(dates.scheduled).toISOString());
    assert.deepEqual(await change(q,'cancel',{...cancel,expected_version:2}),{id:request.id,version:3,status:'cancelled'});
    await as(q,coordinator);
    assert.equal((await read(q,'queue')).rows.some(row=>row.id===request.id),false);
    await as(q,owner.id);
    await change(q,'access',{...grant,request_id:randomUUID(),enabled:false});
    await as(q,coordinator);
    await deny(q,s=>read(s,'queue'),'42501');
    await deny(q,s=>change(s,'review',review),'42501');
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Counseling persistence, writer permissions, version checks, replay, and exact rollback verified.');
}finally{
  try{if(lease&&!lease.lost)await lease.release();}finally{await pool.end({timeout:3});}
}

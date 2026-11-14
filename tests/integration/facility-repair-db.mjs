import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

const mode=process.argv[2];
assert.ok(['--rollback-preflight','--deployed'].includes(mode));
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config=JSON.parse(await readFile('deployment.json','utf8'));
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},connection:{statement_timeout:15000},onnotice:()=>{}});
const identities=[randomUUID(),randomUUID(),randomUUID()];
const [student,other,unlinked]=identities;
const submit={request_id:randomUUID(),building:'QA building',location:'QA floor',item:'Light',description:'QA description',confirmed:true};
const action=(q,kind,payload)=>q`select public.affairs_change_facility_repair(${kind},${q.json(payload)}) as result`.then(rows=>rows[0].result);
const read=(q,{manage=false,id=null,page=0,status=''}={})=>q`select public.affairs_read_facility_repairs(${manage},${id},${page},${status}) as result`.then(rows=>rows[0].result);
const fail=(q,code,run)=>assert.rejects(q.savepoint(run),error=>error.code===code);
async function as(q,id='',role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
let lease;
try{
  lease=await reserveDormitoryConductLease(pool);
  await lease.rollbackOnly(async q=>{
    if(mode==='--rollback-preflight')await q.unsafe(await readFile('supabase/migrations/20261114180000_facility_repairs.sql','utf8'));
    const [owner]=await q`select id from auth.users where lower(email)=lower(${config.supabase.ownerEmail})`;
    assert.ok(owner);
    await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      select ${'qa-'+randomUUID()},${owner.id},${q.json({sub:owner.id,email_verified:true})},'google',now(),now()
      where not exists(select 1 from auth.identities where user_id=${owner.id} and provider='google')`;
    await q`insert into public.affairs_profiles(user_id,email,display_name,role)
      values(${owner.id},${config.supabase.ownerEmail},'QA owner','admin') on conflict(user_id) do update set role='admin'`;
    for(const id of identities){
      const email='repair-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==unlinked)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
    }
    await as(q,'','anon');
    await fail(q,'42501',read);
    await as(q,unlinked);
    await fail(q,'42501',read);
    await as(q,student);
    await fail(q,'42501',s=>read(s,{manage:true}));
    await fail(q,'42501',s=>s`select * from public.affairs_facility_repairs`);
    await fail(q,'22023',s=>action(s,'submit_facility_repair',{...submit,confirmed:false}));
    await fail(q,'22023',s=>action(s,'submit_facility_repair',{...submit,building:'x'.repeat(101)}));
    const first=await action(q,'submit_facility_repair',submit);
    assert.equal(first.status,'submitted');
    assert.deepEqual(await action(q,'submit_facility_repair',submit),first);
    await fail(q,'PT409',s=>action(s,'submit_facility_repair',{...submit,item:'Changed'}));
    const review={request_id:randomUUID(),id:first.id,version:1,status:'in_progress',note:'QA started'};
    await fail(q,'42501',s=>action(s,'review_facility_repair',review));
    await as(q,other);
    assert.deepEqual((await read(q)).rows,[]);
    await fail(q,'PT404',s=>read(s,{id:first.id}));
    const cancel={request_id:randomUUID(),id:first.id,version:1};
    await fail(q,'PT404',s=>action(s,'cancel_facility_repair',cancel));
    await as(q,owner.id);
    assert.ok((await read(q,{manage:true,status:'submitted'})).rows.some(row=>row.id===first.id));
    const started=await action(q,'review_facility_repair',review);
    assert.equal(started.version,2);
    assert.deepEqual(await action(q,'review_facility_repair',review),started);
    await fail(q,'PT409',s=>action(s,'review_facility_repair',{...review,request_id:randomUUID(),status:'resolved'}));
    const resolved=await action(q,'review_facility_repair',{...review,request_id:randomUUID(),version:2,status:'resolved'});
    assert.equal(resolved.status,'resolved');
    const reopened=await action(q,'review_facility_repair',{...review,request_id:randomUUID(),version:3});
    assert.equal(reopened.status,'in_progress');
    await as(q,student);
    assert.deepEqual((await read(q,{id:first.id})).events.map(event=>event.status),['submitted','in_progress','resolved','in_progress']);
    const [event]= (await read(q,{id:first.id})).events;
    assert.deepEqual(Object.keys(event).sort(),['note','occurred_at','status','version']);
    await fail(q,'PT409',s=>action(s,'cancel_facility_repair',{...cancel,version:4}));
    const second=await action(q,'submit_facility_repair',{...submit,request_id:randomUUID()});
    const cancelled=await action(q,'cancel_facility_repair',{...cancel,id:second.id});
    assert.equal(cancelled.status,'cancelled');
    assert.deepEqual((await read(q,{status:'cancelled'})).rows.map(row=>row.id),[second.id]);
    assert.deepEqual((await read(q,{page:1})).rows,[]);
  });
  const [after]=await lease.sql`select (select count(*) from auth.users where id=any(${identities}::uuid[]))::int as test_users,
    to_regclass('public.affairs_facility_repairs') is null as absent`;
  assert.equal(after.test_users,0);
  assert.equal(after.absent,mode==='--rollback-preflight');
  console.log('Facility repair rollback passed: restricted reads, confirmation, replay, review, stale versions, history, cancellation and cleanup.');
}finally{if(lease)await lease.release();await pool.end();}

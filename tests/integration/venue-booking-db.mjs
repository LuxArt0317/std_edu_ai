import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {moveVenueDate,venueWeek} from '../../src/features/public/affairs/venueContract.js';

const mode=process.argv[2];
assert.ok(['--rollback-preflight','--deployed'].includes(mode));
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config=JSON.parse(await readFile('deployment.json','utf8'));
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},connection:{statement_timeout:15000},onnotice:()=>{}});
const identities=[randomUUID(),randomUUID(),randomUUID()];
const [student,other,unlinked]=identities;
const room='Q'+randomUUID().replaceAll('-','').slice(0,8).toUpperCase();
const week=moveVenueDate(venueWeek(),7),day=week;
const action=(q,kind,payload)=>q`select public.affairs_change_venue_request(${kind},${q.json(payload)}) as result`.then(rows=>rows[0].result);
const read=(q,manage=false)=>q`select public.affairs_read_venue_requests(${manage}) as result`.then(rows=>rows[0].result);
const approval=(q)=>q`select public.affairs_venue_approved_slots(${room},${week}) as result`.then(rows=>rows[0].result);
const fail=(q,code,run)=>assert.rejects(q.savepoint(run),error=>error.code===code);
async function as(q,id='',role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
let lease;
try{
  lease=await reserveDormitoryConductLease(pool);
  await lease.rollbackOnly(async q=>{
    if(mode==='--rollback-preflight')await q.unsafe(await readFile('supabase/migrations/20261114170000_venue_booking.sql','utf8'));
    const [owner]=await q`select id from auth.users where lower(email)=lower(${config.supabase.ownerEmail})`;
    assert.ok(owner);
    await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      select ${'qa-'+randomUUID()},${owner.id},${q.json({sub:owner.id,email_verified:true})},'google',now(),now()
      where not exists(select 1 from auth.identities where user_id=${owner.id} and provider='google')`;
    await q`insert into public.affairs_profiles(user_id,email,display_name,role)
      values(${owner.id},${config.supabase.ownerEmail},'QA owner','admin') on conflict(user_id) do update set role='admin'`;
    for(const id of identities){
      const email='venue-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==unlinked)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
    }
    await q`insert into public.affairs_venue_weeks(venue,week,label,description,occupied)
      values(${room},${week},'QA venue','',array['T12'])`;
    const submit={request_id:randomUUID(),venue:room,booking_date:day,period:'1',purpose:'Test purpose',confirmed:true};
    await as(q,'','anon');
    assert.deepEqual(await approval(q),[]);
    await fail(q,'42501',read);
    await as(q,unlinked);
    await fail(q,'42501',read);
    await as(q,student);
    await fail(q,'42501',s=>read(s,true));
    await fail(q,'22023',s=>action(s,'submit_venue_request',{...submit,confirmed:false}));
    await fail(q,'PT409',s=>action(s,'submit_venue_request',{...submit,period:'2'}));
    const first=await action(q,'submit_venue_request',submit);
    assert.equal(first.status,'submitted');
    assert.deepEqual(await action(q,'submit_venue_request',submit),first);
    await fail(q,'PT409',s=>action(s,'submit_venue_request',{...submit,purpose:'Changed'}));
    await fail(q,'PT409',s=>action(s,'submit_venue_request',{...submit,request_id:randomUUID()}));
    const review={request_id:randomUUID(),id:first.id,version:1,status:'approved',note:'Reviewed in QA'};
    await fail(q,'42501',s=>action(s,'review_venue_request',review));
    await as(q,other);
    assert.deepEqual(await read(q),[]);
    await fail(q,'PT404',s=>action(s,'cancel_venue_request',{request_id:randomUUID(),id:first.id,version:1}));
    const second=await action(q,'submit_venue_request',{...submit,request_id:randomUUID()});
    await as(q,owner.id);
    const waiting=await read(q,true);
    assert.ok(waiting.some(row=>row.id===first.id)&&waiting.some(row=>row.id===second.id));
    assert.equal((await action(q,'review_venue_request',review)).version,2);
    assert.deepEqual(await approval(q),['T11']);
    await fail(q,'PT409',s=>action(s,'review_venue_request',{...review,id:second.id,request_id:randomUUID()}));
    await as(q,student);
    assert.deepEqual((await read(q)).map(row=>row.status),['approved']);
    const cancelled=await action(q,'cancel_venue_request',{request_id:randomUUID(),id:first.id,version:2});
    assert.equal(cancelled.status,'cancelled');
    assert.deepEqual(await approval(q),[]);
    await as(q,owner.id);
    assert.equal((await action(q,'review_venue_request',{...review,id:second.id,status:'declined',request_id:randomUUID()})).status,'declined');
  });
  const [after]=await lease.sql`select (select count(*) from auth.users where id=any(${identities}::uuid[]))::int as test_users,
    to_regclass('public.affairs_venue_requests') is null as absent`;
  assert.equal(after.test_users,0);
  assert.equal(after.absent,mode==='--rollback-preflight');
  console.log('Venue rollback passed: exact scope, read privacy, confirmation, occupied slots, replay, competing approvals, cancellation and cleanup.');
}finally{if(lease)await lease.release();await pool.end();}

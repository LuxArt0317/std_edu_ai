import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { deploymentEnvironment } from '../../scripts/deployment-env.mjs';
import { dormitoryConductClientTarget, reserveDormitoryConductLease } from './dormitory-conduct-rls-live.mjs';

const [mode,...rest]=process.argv.slice(2);
assert.ok(['--preflight','--deployed'].includes(mode)&&!rest.length);
const env=deploymentEnvironment(), connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const deploy=JSON.parse(await readFile('deployment.json','utf8'));
const [student,peer,unlinked,club,equipment,activity,unpublished]=Array.from({length:7},()=>randomUUID());
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const fingerprint=async q=>(await q`select
  to_regclass('public.affairs_club_equipment_requests') is not null installed,
  (select count(*)::int from auth.users where id in (${student},${peer},${unlinked})) users,
  (select count(*)::int from supabase_migrations.schema_migrations) migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${deploy.supabase.ownerEmail})) owner`)[0];
const read=async(q,view,month=null)=>(await q`select public.affairs_read_club_services(${view},${month}) data`)[0].data;
const write=async(q,op,payload)=>(await q`select public.affairs_change_club_equipment(${op},${q.json(payload)}) data`)[0].data;
const denied=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,id,role='authenticated') {
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}

try {
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.ok(before.owner && !before.users);
  assert.equal(before.installed,mode==='--deployed');
  await lease.rollbackOnly(async q=>{
    if(!before.installed)await q.unsafe(await readFile('supabase/migrations/20261115070000_student_club_services.sql','utf8'));
    const [owner]=await q`select id from auth.users where lower(email)=lower(${deploy.supabase.ownerEmail})`;
    assert.ok(owner.id);
    await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      select ${'qa-'+randomUUID()},${owner.id},${q.json({sub:owner.id,email_verified:true})},'google',now(),now()
      where not exists(select 1 from auth.identities where user_id=${owner.id} and provider='google')`;
    await q`insert into public.affairs_profiles(user_id,email,display_name,role)
      values(${owner.id},${deploy.supabase.ownerEmail},'QA owner','admin')
      on conflict(user_id) do update set role='admin'`;
    for(const id of [student,peer,unlinked]){
      const email='club-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==unlinked)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
      await q`insert into public.affairs_profiles(user_id,email,display_name) values(${id},${email},'QA')`;
      await q`insert into public.affairs_student_profiles(user_id,student_number,name_zh,version)
        values(${id},${'QA-'+id.slice(0,8)},'QA Student',1)`;
    }
    await q`insert into public.affairs_clubs(id,name) values(${club},${'QA Club '+club})`;
    await q`insert into public.affairs_club_memberships(club_id,user_id) values(${club},${student}),(${club},${peer})`;
    await q`insert into public.affairs_club_equipment(id,category,label) values(${equipment},'A01','QA Audio')`;
    const [dates]=await q`select
      to_char(date_trunc('month',now() at time zone 'Asia/Taipei'),'YYYY-MM-DD') as selection_month,
      to_char(date_trunc('week',now() at time zone 'Asia/Taipei')+interval '14 days','YYYY-MM-DD') pickup,
      to_char(date_trunc('week',now() at time zone 'Asia/Taipei')+interval '15 days','YYYY-MM-DD') due,
      to_char(date_trunc('week',now() at time zone 'Asia/Taipei')+interval '16 days','YYYY-MM-DD') closure`;
    await q`insert into public.affairs_club_equipment_closures(day) values(${dates.closure})`;
    await q`insert into public.affairs_club_activities(id,club_id,title,category,starts_at,ends_at,published)
      select a.id,${club},'QA Activity','lecture',${dates.selection_month}::date::timestamp at time zone 'Asia/Taipei',
        (${dates.selection_month}::date::timestamp+interval '3 hours') at time zone 'Asia/Taipei',a.visible
      from(values(${activity}::uuid,true),(${unpublished}::uuid,false)) a(id,visible)`;
    const input={request_id:randomUUID(),club_id:club,phone:'0912000000',pickup_on:dates.pickup,return_on:dates.due,
      items:[equipment],purpose:'meeting',other_purpose:''};
    await as(q,'','anon');
    await denied(q,s=>read(s,'activities',dates.selection_month),'42501');
    await denied(q,s=>write(s,'submit',input),'42501');
    await as(q,unlinked);
    await denied(q,s=>read(s,'equipment'),'42501');
    await as(q,student);
    await denied(q,s=>read(s,'review'),'42501');
    await denied(q,s=>s`select * from public.affairs_club_equipment_requests`,'42501');
    const events=await read(q,'activities',dates.selection_month);
    assert.ok(events.rows.some(row=>row.id===activity));
    assert.ok(events.rows.every(row=>row.id!==unpublished));
    assert.equal(events.student,null);
    assert.deepEqual((await read(q,'equipment')).equipment.filter(row=>row.id===equipment),[{id:equipment,category:'A01',label:'QA Audio'}]);
    await denied(q,s=>write(s,'submit',{...input,return_on:dates.closure}),'22023');
    await denied(q,s=>write(s,'submit',{...input,pickup_on:'2000-01-01'}),'22023');
    await denied(q,s=>write(s,'submit',{...input,items:[equipment,equipment]}),'22023');
    await denied(q,s=>write(s,'submit',{...input,user_id:peer}),'22023');
    await denied(q,s=>write(s,'submit',{...input,club_id:randomUUID()}),'PT409');

    const created=await write(q,'submit',input);
    assert.equal(created.status,'submitted');
    assert.deepEqual(await write(q,'submit',input),created);
    await denied(q,s=>write(s,'submit',{...input,phone:'0912000001'}),'PT409');
    const edit={...input,id:created.id,expected_version:1,request_id:randomUUID(),phone:'0912000002'};
    await as(q,peer);
    assert.deepEqual((await read(q,'equipment')).rows,[]);
    await denied(q,s=>write(s,'edit',edit),'PT404');
    await denied(q,s=>write(s,'submit',{...input,request_id:randomUUID()}),'PT409');
    await as(q,student);
    const edited=await write(q,'edit',edit);
    assert.deepEqual(edited,{id:created.id,version:2,status:'submitted'});
    assert.equal((await read(q,'equipment')).rows[0].phone,edit.phone);
    await denied(q,s=>write(s,'cancel',{id:created.id,expected_version:1,request_id:randomUUID()}),'PT409');
    const review={id:created.id,expected_version:2,request_id:randomUUID(),status:'approved',collateral:'QA collateral'};
    await denied(q,s=>write(s,'review',review),'42501');
    await as(q,owner.id);
    assert.ok((await read(q,'review')).rows.some(row=>row.id===created.id));
    const approved=await write(q,'review',review);
    assert.deepEqual(approved,{id:created.id,version:3,status:'approved'});
    await as(q,student);
    await denied(q,s=>write(s,'cancel',{id:created.id,expected_version:3,request_id:randomUUID()}),'PT409');
    await as(q,owner.id);
    await denied(q,s=>write(s,'review',{...review,expected_version:3,request_id:randomUUID(),status:'returned'}),'22023');
    await q.unsafe('reset role');
    await q`update public.affairs_club_equipment_requests set pickup_on=current_date-1 where id=${created.id}`;
    await as(q,owner.id);
    const returned=await write(q,'review',{...review,expected_version:3,request_id:randomUUID(),status:'returned'});
    assert.equal(returned.status,'returned');
    await as(q,peer);
    const resubmit=await write(q,'submit',{...input,request_id:randomUUID()});
    const cancelled=await write(q,'cancel',{id:resubmit.id,expected_version:1,request_id:randomUUID()});
    assert.equal(cancelled.status,'cancelled');
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Club calendar, owner isolation, equipment validation, conflict handling, authenticated actions, and exact rollback passed.');
} finally {
  try{if(lease&&!lease.lost)await lease.release();}finally{await pool.end({timeout:4});}
}

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { deploymentEnvironment } from '../../scripts/deployment-env.mjs';
import { dormitoryConductClientTarget, reserveDormitoryConductLease } from './dormitory-conduct-rls-live.mjs';
import { validClubOfficerWorkspace } from '../../server/clubOfficerContract.js';

const [mode,...rest]=process.argv.slice(2);
assert.ok(['--preflight','--deployed'].includes(mode)&&!rest.length);
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const cfg=JSON.parse(await readFile('deployment.json','utf8'));
const [officer,peer,ordinary,club,foreign]=Array.from({length:5},()=>randomUUID());
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const fingerprint=async q=>(await q`select
  to_regclass('public.affairs_club_applications') is not null installed,
  (select count(*)::int from auth.users where id in (${officer},${peer},${ordinary})) fixtures,
  (select count(*)::int from public.affairs_clubs where id in (${club},${foreign})) clubs,
  (select count(*)::int from supabase_migrations.schema_migrations) migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${cfg.supabase.ownerEmail})) owner`)[0];
const read=async(q,view,clubId=null)=>(await q`select public.affairs_read_club_officer(${view},${clubId}) data`)[0].data;
const change=async(q,op,payload)=>(await q`select public.affairs_change_club_officer(${op},${q.json(payload)}) data`)[0].data;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),reason=>reason.code===code);
async function as(q,id,role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.ok(before.owner&&!before.fixtures&&!before.clubs);
  assert.equal(before.installed,mode==='--deployed');
  await lease.rollbackOnly(async q=>{
    if(!before.installed)await q.unsafe(await readFile('supabase/migrations/20261115080000_club_officer_records.sql','utf8'));
    const [owner]=await q`select id from auth.users where lower(email)=lower(${cfg.supabase.ownerEmail})`;
    assert.ok(owner.id);
    await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      select ${'qa-'+randomUUID()},${owner.id},${q.json({sub:owner.id,email_verified:true})},'google',now(),now()
      where not exists(select 1 from auth.identities where user_id=${owner.id} and provider='google')`;
    await q`insert into public.affairs_profiles(user_id,email,display_name,role)
      values(${owner.id},${cfg.supabase.ownerEmail},'QA owner','admin') on conflict(user_id) do update set role='admin'`;
    for(const id of [officer,peer,ordinary]){
      const email='club-officer-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
      await q`insert into public.affairs_profiles(user_id,email,display_name) values(${id},${email},'QA')`;
      await q`insert into public.affairs_student_profiles(user_id,student_number,name_zh,version)
        values(${id},${'QA-'+id.slice(0,8)},'QA Student',1)`;
    }
    await q`insert into public.affairs_clubs(id,name,lead_name,advisor,academic_year,term)
      values(${club},${'QA own '+club},'QA Lead','QA Advisor',115,1),(${foreign},${'QA other '+foreign},null,'',null,null)`;
    await q`insert into public.affairs_club_memberships(club_id,user_id,officer)
      values(${club},${officer},true),(${foreign},${peer},true),(${club},${ordinary},false)`;
    const [dates]=await q`select to_char((now() at time zone 'Asia/Taipei')+interval '6 days','YYYY-MM-DD') as activity_date`;
    const application={club_id:club,title:'QA Activity',organizer:'QA Club',co_organizer:'',starts_at:dates.activity_date+'T09:00+08:00',
      ends_at:dates.activity_date+'T11:00+08:00',hours:'2',location:'QA Room',advisor:'',advisor_phone:'',coordinator:'QA Lead',
      coordinator_phone:'0912000000',area:'campus',campus_location:'QA Room',offsite_location:'',natures:['meeting'],audiences:['students'],
      sdgs:['4'],education:['life'],education_other:''};
    const operation={request_id:randomUUID(),application};

    await as(q,'','anon');
    await deny(q,s=>read(s,'applications'),'42501');
    await as(q,ordinary);
    assert.deepEqual((await read(q,'applications')).rows,[]);
    await deny(q,s=>change(s,'submit',operation),'42501');
    await deny(q,s=>s`select * from public.affairs_club_applications`,'42501');
    await as(q,officer);
    await deny(q,s=>read(s,'members',foreign),'PT404');
    await deny(q,s=>read(s,'review'),'42501');
    await deny(q,s=>change(s,'submit',{...operation,application:{...application,natures:['meeting','meeting']}}),'22023');
    await deny(q,s=>change(s,'submit',{...operation,application:{...application,hours:'3'}}),'22023');
    const profiles=await read(q,'profiles');
    assert.ok(validClubOfficerWorkspace(profiles,officer,'profiles'));
    assert.equal(profiles.rows[0].lead_name,'QA Lead');
    const members=await read(q,'members',club);
    assert.ok(validClubOfficerWorkspace(members,officer,'members'));
    assert.equal(members.rows.length,2);

    const created=await change(q,'submit',operation);
    assert.equal(created.status,'submitted');
    assert.deepEqual(await change(q,'submit',operation),created);
    await deny(q,s=>change(s,'submit',{...operation,application:{...application,title:'Changed'}}),'PT409');
    const edit={id:created.id,expected_version:1,request_id:randomUUID(),application:{...application,title:'QA Updated'}};
    await as(q,peer);
    assert.deepEqual((await read(q,'applications')).rows,[]);
    await deny(q,s=>change(s,'edit',edit),'PT404');
    await as(q,officer);
    assert.equal((await change(q,'edit',edit)).version,2);
    const saved=await read(q,'applications');
    assert.ok(validClubOfficerWorkspace(saved,officer,'applications'));
    assert.equal(saved.rows[0].title,'QA Updated');
    const review={id:created.id,expected_version:2,request_id:randomUUID(),status:'approved',category:'lecture',note:'QA review'};
    await deny(q,s=>change(s,'review',review),'42501');
    await as(q,owner.id);
    assert.ok((await read(q,'review')).rows.some(row=>row.id===created.id));
    const approved=await change(q,'review',review);
    assert.equal(approved.status,'approved');
    assert.deepEqual(await change(q,'review',review),approved);
    await as(q,officer);
    const completion=await read(q,'completion');
    assert.equal(completion.rows[0].status,'approved');
    const calendar=(await q`select public.affairs_read_club_services('activities',date_trunc('month',${dates.activity_date}::date)::date) data`)[0].data;
    assert.equal(calendar.rows.filter(row=>row.title==='QA Updated').length,1);
    const finish={id:created.id,expected_version:3,request_id:randomUUID(),note:'QA completion'};
    await deny(q,s=>change(s,'complete',finish),'22023');
    await q.unsafe('reset role');
    await q`update public.affairs_club_applications set starts_at=now()-interval '4 hours',ends_at=now()-interval '1 hour' where id=${created.id}`;
    await q`insert into public.affairs_club_attendance(application_id,student_id) values(${created.id},${ordinary})`;
    await as(q,officer);
    assert.equal((await change(q,'complete',finish)).status,'completed');
    const attendance=await read(q,'participation',club);
    assert.ok(validClubOfficerWorkspace(attendance,officer,'participation'));
    assert.equal(attendance.rows[0].title,'QA Updated');
    const next=await change(q,'submit',{...operation,request_id:randomUUID()});
    assert.equal((await change(q,'withdraw',{id:next.id,expected_version:1,request_id:randomUUID()})).status,'withdrawn');
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Club officer roles, scoped reads, application edits, review/calendar publication, completion, attendance and rollback passed.');
} finally {
  try{if(lease&&!lease.lost)await lease.release();}finally{await pool.end({timeout:4});}
}

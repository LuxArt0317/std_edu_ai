import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { deploymentEnvironment } from '../../scripts/deployment-env.mjs';
import { dormitoryConductClientTarget, reserveDormitoryConductLease } from './dormitory-conduct-rls-live.mjs';

const [mode,...rest]=process.argv.slice(2);
assert.ok(['--preflight','--deployed'].includes(mode)&&!rest.length);
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const cfg=JSON.parse(await readFile('deployment.json','utf8'));
const [student,peer,unprovisioned,club,foreign]=Array.from({length:5},()=>randomUUID());
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const fingerprint=async q=>(await q`select
  to_regclass('public.affairs_club_applications') is not null installed,
  to_regclass('private.affairs_club_foundations') is not null workflow_installed,
  (select count(*)::int from auth.users where id in (${student},${peer},${unprovisioned})) fixtures,
  (select count(*)::int from public.affairs_clubs where id in (${club},${foreign})) clubs,
  (select count(*)::int from supabase_migrations.schema_migrations) migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${cfg.supabase.ownerEmail})) owner`)[0];

const ddl=await readFile('supabase/migrations/20261115100000_club_student_workflows.sql','utf8');
const read=async(q,view,search='',page=1)=>(await q`select public.affairs_read_club_student(${view},${search},${page}) data`)[0].data;
const change=async(q,operation,payload)=>(await q`select public.affairs_change_club_foundation(${operation},${q.json(payload)}) data`)[0].data;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),reason=>reason.code===code);
async function as(q,id,role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.ok(before.owner&&before.installed&&!before.fixtures&&!before.clubs);
  assert.equal(before.workflow_installed,mode==='--deployed');
  await lease.rollbackOnly(async q=>{
    if(!before.workflow_installed)await q.unsafe(ddl);
    const [owner]=await q`select id from auth.users where lower(email)=lower(${cfg.supabase.ownerEmail})`;
    assert.ok(owner.id);
    await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      select ${'qa-'+randomUUID()},${owner.id},${q.json({sub:owner.id,email_verified:true})},'google',now(),now()
      where not exists(select 1 from auth.identities where user_id=${owner.id} and provider='google')`;
    await q`insert into public.affairs_profiles(user_id,email,display_name,role)
      values(${owner.id},${cfg.supabase.ownerEmail},'QA owner','admin') on conflict(user_id) do update set role='admin'`;
    for(const id of [student,peer,unprovisioned]){
      const email='club-student-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
      await q`insert into public.affairs_profiles(user_id,email,display_name) values(${id},${email},'QA')`;
      if(id!==unprovisioned)await q`insert into public.affairs_student_profiles(user_id,student_number,name_zh,version)
        values(${id},${'QA-'+id.slice(0,8)},'QA Student',1)`;
    }
    await q`insert into public.affairs_clubs(id,name,lead_name,advisor,academic_year,term)
      values(${club},${'QA own '+club},'QA Lead','QA Advisor',115,1),(${foreign},${'QA other '+foreign},null,'',null,null)`;
    await q`insert into public.affairs_club_memberships(club_id,user_id,officer)
      values(${club},${student},false),(${foreign},${peer},true)`;

    const [activity]=await q`insert into public.affairs_club_applications
      (club_id,applicant_id,title,organizer,starts_at,ends_at,hours,location,details,status)
      values (${club},${student},'QA attended','QA',now()-interval '2 days',now()-interval '2 days'+interval '1 hour',
        1,'QA Room','{}','approved') returning id`;
    await q`insert into public.affairs_club_attendance(application_id,student_id) values(${activity.id},${student})`;
    await q`insert into public.affairs_club_activities(club_id,title,category,starts_at,ends_at,published)
      values(${club},${'QA visible '+club},'lecture',now(),now()+interval '1 hour',true),
      (${club},${'QA hidden '+club},'lecture',now(),now()+interval '1 hour',false)`;
    await q`insert into public.affairs_clubs(name)
      select ${'Pagination '+club+' '}||lpad(n::text,2,'0') from generate_series(1,26) n`;
    const submit={name:'QA Foundation '+club,description:'A sample club proposal with activities.',request_id:randomUUID()};
    await as(q,unprovisioned);
    assert.equal((await read(q,'foundation')).eligible,false);
    await deny(q,s=>change(s,'submit',submit),'42501');
    await as(q,student);
    assert.equal((await read(q,'foundation')).eligible,true);
    assert.equal((await read(q,'directory','QA OWN '+club)).rows[0].id,club);
    assert.deepEqual((await read(q,'directory','Pagination '+club)).rows.map(r=>r.name.slice(-2)),
      Array.from({length:25},(_,i)=>String(i+1).padStart(2,'0')));
    assert.equal((await read(q,'directory','Pagination '+club)).hasMore,true);
    assert.equal((await read(q,'directory','Pagination '+club,2)).rows[0].name.slice(-2),'26');
    assert.equal((await read(q,'directory','%')).rows.some(r=>r.id===club),false);
    assert.deepEqual((await read(q,'activity-search',club)).rows.map(r=>r.title),['QA visible '+club]);
    assert.equal((await read(q,'my-attendance')).rows[0].id,activity.id);
    assert.deepEqual((await read(q,'my-memberships')).rows.map(r=>r.id),[club]);
    await deny(q,s=>read(s,'my-attendance','other'),'22023');
    await deny(q,s=>read(s,'foundation/review'),'42501');
    await deny(q,s=>s`select * from private.affairs_club_foundations`,'42501');
    const created=await change(q,'submit',submit);
    assert.deepEqual(await change(q,'submit',submit),created);
    await deny(q,s=>change(s,'submit',{...submit,description:'Changed without a new key'}),'PT409');
    await deny(q,s=>change(s,'submit',{...submit,name:submit.name.toLowerCase(),request_id:randomUUID()}),'PT409');
    assert.equal((await read(q,'foundation')).rows[0].student_name,null);
    await as(q,peer);
    assert.deepEqual((await read(q,'my-memberships')).rows.map(r=>r.id),[foreign]);
    assert.deepEqual((await read(q,'my-attendance')).rows,[]);
    assert.deepEqual((await read(q,'foundation')).rows,[]);
    const target={id:created.id,expected_version:1,request_id:randomUUID()};
    await deny(q,s=>change(s,'withdraw',target),'PT404');
    await deny(q,s=>change(s,'review',{...target,status:'approved',note:''}),'42501');
    await as(q,owner.id);
    const queue=await read(q,'foundation/review');
    assert.equal(queue.rows.find(r=>r.id===created.id)?.student_name,'QA Student');
    await deny(q,s=>change(s,'review',{...target,status:'declined',note:''}),'22023');
    assert.equal((await change(q,'review',{...target,status:'approved',note:'QA approved'})).status,'approved');
    await as(q,student);
    const approved=(await read(q,'foundation')).rows.find(r=>r.id===created.id);
    assert.equal(approved.status,'approved');
    assert.equal(approved.review_note,'QA approved');
    assert.equal((await read(q,'my-memberships')).rows.find(r=>r.id===approved.club_id)?.role_label,'社團負責人');
    assert.ok((await read(q,'directory',submit.name)).rows.some(r=>r.id===approved.club_id));
    await deny(q,s=>change(s,'withdraw',{...target,request_id:randomUUID()}),'PT409');
    const second=await change(q,'submit',{...submit,request_id:randomUUID(),name:'Second '+club});
    assert.equal((await change(q,'withdraw',{id:second.id,expected_version:1,request_id:randomUUID()})).status,'withdrawn');
    await as(q,'','anon');
    await deny(q,s=>read(s,'directory'),'42501');
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Club search, paging, student isolation, foundation replay, administrative approval, withdrawal and exact rollback passed.');
} finally {
  try{if(lease&&!lease.lost)await lease.release();}finally{await pool.end({timeout:4});}
}

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
const [officer,peer,ordinary,club,foreign]=Array.from({length:5},()=>randomUUID());
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const fingerprint=async q=>(await q`select
  to_regclass('public.affairs_club_applications') is not null installed,
  to_regclass('private.affairs_club_activity_documents') is not null docs_installed,
  (select count(*)::int from auth.users where id in (${officer},${peer},${ordinary})) fixtures,
  (select count(*)::int from public.affairs_clubs where id in (${club},${foreign})) clubs,
  (select count(*)::int from supabase_migrations.schema_migrations) migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${cfg.supabase.ownerEmail})) owner`)[0];
const change=async(q,op,payload)=>(await q`select public.affairs_change_club_officer(${op},${q.json(payload)}) data`)[0].data;
const documents=async(q,application,download=null)=>(await q`select public.affairs_read_club_activity_documents(${application},${download}) data`)[0].data;
const documentChange=async(q,operation,payload)=>(await q`select public.affairs_write_club_activity_document(${operation},${q.json(payload)}) data`)[0].data;
const documentDdl=await readFile('supabase/migrations/20261115090000_club_activity_attachments.sql','utf8');
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),reason=>reason.code===code);
async function as(q,id,role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.ok(before.owner&&!before.fixtures&&!before.clubs);
  assert.equal(before.docs_installed,mode==='--deployed');
  await lease.rollbackOnly(async q=>{
    if(!before.installed)await q.unsafe(await readFile('supabase/migrations/20261115080000_club_officer_records.sql','utf8'));
    if(!before.docs_installed)await q.unsafe(documentDdl);
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

    await as(q,officer);
    const created=await change(q,'submit',operation);
    const id=created.id;
    const base={application_id:id,application_version:1,kind:'proposal',expected_version:0,request_id:randomUUID()};
    const sample=Buffer.from('%PDF-1.4\n% synthetic application\n%%EOF\n');
    const upload={...base,filename:'企劃.pdf',content:sample.toString('base64')};
    const empty=await documents(q,id);
    assert.equal(empty.applicationVersion,1);
    assert.deepEqual(empty.rows.map(row=>[row.kind,row.editable,row.filename]),[['proposal',true,null],['closeout',false,null]]);
    await deny(q,s=>documentChange(s,'upload',{...upload,filename:'../x.pdf'}),'22023');
    await deny(q,s=>documentChange(s,'upload',{...upload,filename:'folder\\x.pdf'}),'22023');
    await deny(q,s=>documentChange(s,'upload',{...upload,content:Buffer.from('not a PDF').toString('base64')}),'22023');
    await deny(q,s=>documentChange(s,'upload',{...upload,kind:'closeout'}),'PT409');
    await deny(q,s=>s`select * from private.affairs_club_activity_documents`,'42501');
    const first=await documentChange(q,'upload',upload);
    assert.deepEqual(first,{applicationId:id,filename:'企劃.pdf',kind:'proposal',version:1});
    assert.deepEqual(await documentChange(q,'upload',upload),first);
    await deny(q,s=>documentChange(s,'upload',{...upload,filename:'different.pdf'}),'PT409');
    const metadata=await documents(q,id);
    assert.equal(metadata.applicationVersion,2);
    assert.equal(metadata.rows[0].size,sample.length);
    assert.ok(!('content' in metadata.rows[0]));
    assert.deepEqual(Buffer.from((await documents(q,id,'proposal')).file.content,'base64'),sample);
    await as(q,peer);
    await deny(q,s=>documents(s,id),'PT404');
    await deny(q,s=>documents(s,id,'proposal'),'PT404');
    await deny(q,s=>documentChange(s,'upload',upload),'PT404');
    await as(q,ordinary);
    await deny(q,s=>documents(s,id,'proposal'),'PT404');
    await as(q,'','anon');
    await deny(q,s=>documents(s,id,'proposal'),'42501');
    await as(q,officer);
    await deny(q,s=>documentChange(s,'remove',{...base,request_id:randomUUID()}),'PT409');
    const remove={...base,application_version:2,expected_version:1,request_id:randomUUID()};
    assert.equal((await documentChange(q,'remove',remove)).filename,null);
    await deny(q,s=>documents(s,id,'proposal'),'PT404');
    const replacement={...upload,application_version:3,expected_version:2,request_id:randomUUID(),filename:'replacement.pdf'};
    assert.equal((await documentChange(q,'upload',replacement)).version,3);
    await as(q,owner.id);
    assert.equal((await documents(q,id,'proposal')).file.filename,'replacement.pdf');
    const review={id,expected_version:1,request_id:randomUUID(),status:'approved',category:'lecture',note:''};
    await deny(q,s=>change(s,'review',review),'PT409');
    await change(q,'review',{...review,expected_version:4});
    await as(q,officer);
    assert.equal((await documents(q,id)).rows[0].editable,false);
    await deny(q,s=>documentChange(s,'upload',{...replacement,application_version:5,expected_version:3,request_id:randomUUID()}),'PT409');
    await q.unsafe('reset role');
    await q`update public.affairs_club_applications set starts_at=now()-interval '4 hours',ends_at=now()-interval '1 hour' where id=${id}`;
    await as(q,officer);
    const closeout={...upload,application_version:5,expected_version:0,kind:'closeout',request_id:randomUUID(),filename:'closeout.pdf'};
    assert.equal((await documentChange(q,'upload',closeout)).version,1);
    await change(q,'complete',{id,expected_version:6,request_id:randomUUID(),note:'QA completion'});
    assert.equal((await documents(q,id)).rows[1].editable,false);
    assert.deepEqual(Buffer.from((await documents(q,id,'closeout')).file.content,'base64'),sample);

  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Club attachment ownership, PDF checks, retry, removal, review version, closeout and rollback passed.');
} finally {
  try{if(lease&&!lease.lost)await lease.release();}finally{await pool.end({timeout:4});}
}

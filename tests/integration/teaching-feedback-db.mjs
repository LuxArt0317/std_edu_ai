import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

const mode=process.argv[2];
assert.deepEqual(process.argv.slice(2),[mode]);
assert.ok(['--rollback-preflight','--deployed'].includes(mode));
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config=JSON.parse(await readFile('deployment.json','utf8'));
const ddl=await readFile('supabase/migrations/20261114140000_teaching_feedback.sql','utf8');
const students=Array.from({length:7},()=>randomUUID()),[own,other,nonGoogle,...respondents]=students;
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const read=async(q,scope,term=null,survey=null,section=null)=>(await q`select public.affairs_read_teaching_feedback(${scope},${term},${survey},${section}) as data`)[0].data;
const write=async(q,kind,body)=>(await q`select public.affairs_change_teaching_feedback(${kind},${q.json(body)}) as result`)[0].result;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,id,role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
const fingerprint=async q=>(await q`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${config.supabase.ownerEmail})) as owner,
  (select count(*)::int from auth.users where id=any(${students}::uuid[])) as fixtures,
  to_regclass('public.affairs_teaching_surveys') is null as absent`)[0];
try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.ok(before.owner&&before.fixtures===0);
  assert.equal(before.absent,mode==='--rollback-preflight');
  await lease.rollbackOnly(async q=>{
    if(before.absent)await q.unsafe(ddl);
    const [owner]=await q`select id from auth.users where lower(email)=lower(${config.supabase.ownerEmail})`;
    await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      select ${'qa-'+randomUUID()},${owner.id},${q.json({sub:owner.id,email_verified:true})},'google',now(),now()
      where not exists(select 1 from auth.identities where user_id=${owner.id} and provider='google')`;
    await q`insert into public.affairs_profiles(user_id,email,display_name,role)
      values(${owner.id},${config.supabase.ownerEmail},'QA owner','admin') on conflict(user_id) do update set role='admin'`;
    for(const id of students){
      const email='teaching-feedback-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
    }
    const term=randomUUID(),section=randomUUID(),sparseSection=randomUUID();
    const [source]=await q`select id from public.affairs_courses order by id limit 1`;
    await q`insert into public.affairs_terms(id,code,label,starts_on,ends_on)
      values(${term},${'QA-'+term},'QA term',(now() at time zone 'Asia/Taipei')::date-1,(now() at time zone 'Asia/Taipei')::date+1)`;
    for(const [id,code] of [[section,'QA-A'],[sparseSection,'QA-B']]){
      await q`insert into public.affairs_sections(id,course_id,term_id,section_code,instructor,weekday,starts_at,ends_at,room)
        values(${id},${source.id},${term},${code},'QA instructor',1,'09:00','10:00','QA room')`;
    }
    for(const user of [own,...respondents]){
      const [program]=await q`select id from public.affairs_programs where code='SAMPLE-GEN'`;
      await q`insert into public.affairs_profiles(user_id,email,display_name)
        select id,email,'QA Student' from auth.users where id=${user} on conflict(user_id) do nothing`;
      await q`insert into public.affairs_students(user_id,student_number,full_name,program_id,year_level)
        values(${user},${'QA-'+user},'QA Student',${program.id},1)`;
      await q.unsafe('reset role');
      for(const id of user===own?[section,sparseSection]:[section]){
        await q`insert into public.affairs_enrollments(student_id,section_id)
          select id,${id} from public.affairs_students where user_id=${user} on conflict(student_id,section_id) do nothing`;
      }
    }
    const now=Date.now(),iso=offset=>new Date(now+offset).toISOString();
    const settings={term_id:term,phase:'final',expected_version:0,opens_at:iso(-300000),closes_at:iso(300000),questions:['Clarity','Materials']};
    await as(q,'','anon');
    await deny(q,s=>read(s,'survey'),'42501');
    await as(q,nonGoogle);
    await deny(q,s=>read(s,'immediate'),'42501');
    await as(q,other);
    await deny(q,s=>read(s,'manage',term),'42501');
    await deny(q,s=>write(s,'save_teaching_survey',settings),'42501');
    await as(q,owner.id);
    await deny(q,s=>write(s,'save_teaching_survey',{...settings,questions:['One','One']}),'22023');
    const survey=await write(q,'save_teaching_survey',settings);
    assert.equal(survey.version,1);
    assert.deepEqual(await write(q,'save_teaching_survey',settings),survey);
    const release={survey_id:survey.id,expected_version:1,confirm_release:true,grades_published:true};
    await deny(q,s=>write(s,'release_teaching_survey',release),'PT409');
    assert.deepEqual((await read(q,'manage',term)).results,[]);
    const immediate={section_id:section,request_id:randomUUID(),comment:'QA comment for staff'};
    const response={section_id:section,survey_id:survey.id,version:1,request_id:randomUUID(),ratings:[4,5],comment:'QA survey comment'};
    await as(q,other);
    assert.equal((await read(q,'survey')).surveys.length,0);
    await deny(q,s=>write(s,'submit_teaching_survey',response),'42501');
    await deny(q,s=>write(s,'submit_teaching_feedback',immediate),'42501');
    await as(q,own);
    const visible=(await read(q,'survey')).surveys.find(row=>row.id===survey.id);
    assert.equal(visible.state,'open');
    assert.equal(visible.courses.length,2);
    await deny(q,s=>write(s,'submit_teaching_survey',{...response,ratings:[4]}),'22023');
    const completed=await write(q,'submit_teaching_survey',response);
    assert.deepEqual(completed,{surveyId:survey.id,sectionId:section,completed:true});
    assert.deepEqual(await write(q,'submit_teaching_survey',response),completed);
    await deny(q,s=>write(s,'submit_teaching_survey',{...response,request_id:randomUUID()}),'PT409');
    await write(q,'submit_teaching_survey',{...response,section_id:sparseSection,request_id:randomUUID()});
    const saved=await write(q,'submit_teaching_feedback',immediate);
    assert.equal(saved.comment,immediate.comment);
    assert.deepEqual(await write(q,'submit_teaching_feedback',immediate),saved);
    await deny(q,s=>write(s,'submit_teaching_feedback',{...immediate,comment:'Different comment'}),'PT409');
    await deny(q,s=>s`select * from private.affairs_teaching_survey_results`,'42501');
    for(const user of respondents){
      await as(q,user);
      assert.deepEqual((await read(q,'immediate')).feedback,[]);
      await write(q,'submit_teaching_survey',{...response,request_id:randomUUID(),ratings:[2,3]});
    }
    await as(q,owner.id);
    const queue=(await read(q,'manage',term)).feedback.find(row=>row.id===saved.id);
    assert.ok(queue&&!Object.hasOwn(queue,'userId')&&queue.status==='submitted');
    assert.equal((await write(q,'review_teaching_feedback',{feedback_id:saved.id})).status,'reviewed');
    await deny(q,s=>write(s,'save_teaching_survey',{...settings,expected_version:1,questions:['Different']}),'PT409');
    await write(q,'save_teaching_survey',{...settings,expected_version:1,closes_at:iso(-1000)});
    await deny(q,s=>write(s,'release_teaching_survey',{...release,expected_version:2,grades_published:false}),'22023');
    await write(q,'release_teaching_survey',{...release,expected_version:2});
    const results=(await read(q,'manage',term)).results;
    assert.equal(results.length,1);
    assert.equal(results[0].count,5);
    assert.deepEqual(results[0].averages,[2.4,3.4]);
    assert.deepEqual(results[0].comments,[]);
    assert.equal((await read(q,'manage',term,survey.id,section)).results[0].comments.length,5);
    assert.deepEqual((await read(q,'manage',term,survey.id,sparseSection)).results,[]);
    await as(q,own);
    assert.equal((await read(q,'immediate')).feedback.find(row=>row.id===saved.id).status,'reviewed');
    assert.deepEqual((await read(q,'survey')).results,[]);
    assert.deepEqual(await write(q,'submit_teaching_survey',response),completed);
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Teaching feedback rollback passed: ownership, survey windows, anonymous result separation, small group suppression, receipt replay and review.');
}finally{
  try{await lease?.release();}finally{await pool.end({timeout:5});}
}

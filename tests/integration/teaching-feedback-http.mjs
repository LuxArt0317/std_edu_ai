import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {teachingFeedbackPaths} from '../../server/teachingFeedbackContract.js';
import dataHandler from '../../api/affairs-data.ts';
import actionHandler from '../../api/affairs-action.ts';
import managerHandler from '../../api/affairs-manage.ts';

assert.deepEqual(process.argv.slice(2),['--verify-client']);
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
assert.equal(new URL(url).origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
assert.ok(key);
Object.assign(process.env,{VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:key});
const site='https://stu.best',revision=process.env.EXPECTED_RELEASE_REVISION;
const checkRevision=async()=>{
  if(!revision)return;
  assert.match(revision,/^[0-9a-f]{40}$/u);
  const response=await fetch(site+'/release.json',{signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,revision);
};
await checkRevision();
const rows=Array.from({length:2},()=>({
  id:randomUUID(),email:'teaching-feedback-qa-'+randomUUID()+'@example.invalid',password:randomBytes(24).toString('base64url')+'Aa1!',
}));
const [student]=rows,term=randomUUID(),section=randomUUID(),survey=randomUUID(),ids=rows.map(row=>row.id),sessions=[];
let lease,committed=false;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
async function call(path,token,status=200,body){
  const endpoint=new URL(path,site);
  const headers={...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})};
  const method=body?'POST':'GET';
  if(revision){
    const response=await fetch(endpoint,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),redirect:'error'});
    assert.equal(response.status,status);
    return response.json();
  }
  let code,result;
  const response={status(value){code=value;return response;},json(value){result=value;},setHeader(){}};
  const handler=endpoint.pathname==='/api/affairs-data'?dataHandler:endpoint.pathname==='/api/affairs-action'?actionHandler:managerHandler;
  await handler({method,query:Object.fromEntries(endpoint.searchParams),headers,body},response);
  assert.equal(code,status);
  return result;
}
try{
  lease=await reserveDormitoryConductLease(pool);
  const {sql}=lease;
  const [before]=await sql`select count(*)::int as fixtures from auth.users where id=any(${ids}::uuid[])`;
  assert.equal(before.fixtures,0);
  await sql.unsafe('begin');
  try{
    for(const row of rows){
      await sql`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,reauthentication_token,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${row.id},'authenticated','authenticated',${row.email},
        extensions.crypt(${row.password},extensions.gen_salt('bf')),now(),'','','','','','',
        '{"provider":"email","providers":["email","google"]}','{"full_name":"Teaching Feedback QA"}',now(),now())`;
      for(const provider of ['email','google'])await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${row.id},${row.id},${sql.json({sub:row.id,email:row.email,email_verified:true})},${provider},now(),now())`;
      await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${row.id},${row.email},'Teaching Feedback QA')`;
    }
    const [source]=await sql`select id from public.affairs_courses where code='SAMP101'`;
    await sql`insert into public.affairs_terms(id,code,label,starts_on,ends_on)
      values(${term},${'QA-'+term},'Teaching Feedback QA Term',(now() at time zone 'Asia/Taipei')::date-1,(now() at time zone 'Asia/Taipei')::date+1)`;
    await sql`insert into public.affairs_sections(id,course_id,term_id,section_code,instructor,weekday,starts_at,ends_at,room)
      values(${section},${source.id},${term},'QA','QA instructor',1,'09:00','10:00','QA room')`;
    await sql`insert into public.affairs_teaching_surveys(id,term_id,phase,opens_at,closes_at,questions)
      values(${survey},${term},'midterm',now()-interval '1 day',now()+interval '1 day',array['Clarity','Resources'])`;
    await sql.unsafe('commit');
    committed=true;
  }catch(error){await sql.unsafe('rollback');throw error;}
  for(const row of rows){
    const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{
      fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000),redirect:'error'}),
    }});
    const {data,error}=await client.auth.signInWithPassword({email:row.email,password:row.password});
    assert.ok(!error && data.user?.id===row.id,'Disposable sign-in failed.');
    sessions.push({client,token:data.session.access_token});
  }
  const [a,b]=sessions.map(session=>session.token);
  const path='/api/affairs-data?scope=teaching-feedback&view=';
  const action='/api/affairs-action',manager='/api/affairs-manage';
  await call(path+'survey',undefined,401);
  assert.equal((await call(path+'survey',a)).surveys.length,0);
  await call(path+'manage&term='+term,b,403);
  await call(path+'survey&term='+term,a,400);
  await call(path+'survey&user_id='+student.id,b,400);
  await call(path+'manage&section='+section,a,400);
  const submit={kind:'submit_teaching_survey',payload:{section_id:section,survey_id:survey,version:1,request_id:randomUUID(),ratings:[4,5],comment:'QA survey comment'}};
  const immediate={kind:'submit_teaching_feedback',payload:{section_id:section,request_id:randomUUID(),comment:'QA private feedback'}};
  await call(action,b,403,submit);
  await call(action,b,403,immediate);
  // The enrollment is restricted to the disposable student and disposable section.
  await sql.unsafe('begin');
  try{
    const [program]=await sql`select id from public.affairs_programs order by id limit 1`;
    const [record]=await sql`insert into public.affairs_students(user_id,student_number,full_name,program_id,year_level)
      values(${student.id},${'QA-'+student.id},'Teaching Feedback QA',${program.id},1) returning id`;
    await sql`insert into public.affairs_enrollments(student_id,section_id) values(${record.id},${section})`;
    await sql.unsafe('commit');
  }catch(error){await sql.unsafe('rollback');throw error;}
  const visible=(await call(path+'survey',a)).surveys.find(row=>row.id===survey);
  assert.equal(visible.courses[0].completed,false);
  const receipt=await call(action,a,200,submit);
  assert.deepEqual(receipt,{surveyId:survey,sectionId:section,completed:true});
  assert.deepEqual(await call(action,a,200,submit),receipt);
  await call(action,a,409,{...submit,payload:{...submit.payload,request_id:randomUUID()}});
  const saved=await call(action,a,200,immediate);
  assert.equal(saved.comment,immediate.payload.comment);
  assert.deepEqual(await call(action,a,200,immediate),saved);
  assert.deepEqual((await call(path+'immediate',a)).feedback,[saved]);
  assert.deepEqual((await call(path+'immediate',b)).feedback,[]);
  await call(manager,a,403,{kind:'review_teaching_feedback',payload:{feedback_id:saved.id}});
  const answer=await call(path+'survey&answer=en',a);
  assert.match(answer.answer,/1\/1 completed/u);
  assert.equal(answer.citations[0].url,teachingFeedbackPaths.survey);
  const feedbackAnswer=await call(path+'immediate&answer=zh',a);
  assert.match(feedbackAnswer.answer,/已送出/u);
  assert.ok(!feedbackAnswer.answer.includes(immediate.payload.comment));
  assert.match((await call(path+'survey&answer=en',b)).answer,/no stu.best teaching evaluations/u);
  await checkRevision();
}finally{
  await cleanup();
}
async function cleanup(){
  try{
    if(committed && lease && !lease.lost){
      const {sql}=lease;
      for(const {client} of sessions)await client.auth.signOut({scope:'local'}).catch(()=>{});
      const fixtures=await sql`select id,email from auth.users where id=any(${ids}::uuid[])`;
      assert.equal(fixtures.length,ids.length);
      assert.ok(fixtures.every(item=>rows.some(row=>row.id===item.id&&row.email===item.email)));
      await sql.unsafe('begin');
      try{
        await sql`delete from private.affairs_teaching_survey_results where survey_id=${survey} and section_id=${section}`;
        await sql`delete from auth.users where id=any(${ids}::uuid[])`;
        await sql`delete from public.affairs_teaching_surveys where id=${survey} and term_id=${term}`;
        await sql`delete from public.affairs_sections where id=${section} and term_id=${term}`;
        await sql`delete from public.affairs_terms where id=${term} and code=${'QA-'+term}`;
        await sql.unsafe('commit');
      }catch(error){await sql.unsafe('rollback').catch(()=>{});throw error;}
      const [left]=await sql`select
        (select count(*)::int from auth.users where id=any(${ids}::uuid[])) as users,
        (select count(*)::int from auth.sessions where user_id=any(${ids}::uuid[])) as sessions,
        (select count(*)::int from auth.identities where user_id=any(${ids}::uuid[])) as identities,
        (select count(*)::int from public.affairs_profiles where user_id=any(${ids}::uuid[])) as profiles,
        (select count(*)::int from public.affairs_teaching_feedback where user_id=any(${ids}::uuid[])) as feedback,
        (select count(*)::int from private.affairs_teaching_survey_completions where user_id=any(${ids}::uuid[])) as completions,
        (select count(*)::int from private.affairs_teaching_survey_results where survey_id=${survey}) as results,
        (select count(*)::int from public.affairs_terms where id=${term}) as terms,
        (select count(*)::int from public.affairs_teaching_surveys where id=${survey}) as surveys,
        (select count(*)::int from public.affairs_sections where id=${section}) as sections`;
      assert.ok(Object.values(left).every(count=>count===0));
    }
  }finally{
    try{await lease?.release();}finally{await pool.end({timeout:5});}
  }
}
console.log('Twenty actual-JWT teaching-feedback API requests passed. Disposable accounts, course and records were removed.');

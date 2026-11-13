import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {adjustmentTerm} from '../../server/courseAdjustmentContract.js';
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
  id:randomUUID(),email:'course-withdrawal-qa-'+randomUUID()+'@example.invalid',password:randomBytes(24).toString('base64url')+'Aa1!',
}));
const [student]=rows,ids=rows.map(row=>row.id),term=adjustmentTerm(),sessions=[],courseId=randomUUID();
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
        '{"provider":"email","providers":["email","google"]}','{"full_name":"Course Withdrawal QA"}',now(),now())`;
      for(const provider of ['email','google'])await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${row.id},${row.id},${sql.json({sub:row.id,email:row.email,email_verified:true})},${provider},now(),now())`;
      await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${row.id},${row.email},'Course Withdrawal QA')`;
    }
    await sql`insert into public.affairs_course_selection_records
      (id,user_id,academic_year,semester,selection_phase,term_course_code,course_title,credits,remark_text,row_order,timetable_included)
      values(${courseId},${student.id},${term.academicYear},${term.semester},'withdrawal','WITHDRAWAL-QA','Temporary verification course',3,'Y(W)',0,false)`;
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
  const path='/api/affairs-data?scope=course-withdrawal';
  await call(path,undefined,401);
  assert.equal((await call(path,a)).courses[0].id,courseId);
  assert.deepEqual((await call(path,b)).courses,[]);
  await call(path+'&user_id='+student.id,b,400);
  await call(path+'-admin&year='+term.academicYear+'&semester='+term.semester,b,403);
  const answer=await call(path+'&answer=records&lang=en',a);
  assert.match(answer.answer,/1 saved course withdrawal/u);
  assert.match(answer.answer,/WITHDRAWAL-QA/u);
  assert.equal(answer.citations[0].url,'/school-affairs/services/6-4');
  const missing=await call(path+'&answer=records&lang=en',b);
  assert.match(missing.answer,/No course withdrawals are saved/u);
  assert.doesNotMatch(missing.answer,/WITHDRAWAL-QA/u);
  const action={kind:'change_course_withdrawal',payload:{course_id:courseId,operation:'restore',expected_version:1,request_id:randomUUID()}};
  await call('/api/affairs-action',undefined,401,action);
  await call('/api/affairs-action',b,403,action);
  await call('/api/affairs-action',a,400,{...action,payload:{...action.payload,user_id:student.id}});
  await call('/api/affairs-manage',b,403,{kind:'set_course_withdrawal_window',payload:{
    academic_year:term.academicYear,semester:term.semester,opens_at:'2026-11-13T02:00:00.000Z',closes_at:'2026-11-16T02:00:00.000Z',
    expected_version:0,request_id:randomUUID(),
  }});
  await checkRevision();
}finally{
  try{
    if(committed && lease && !lease.lost){
      const {sql}=lease;
      for(const {client} of sessions)await client.auth.signOut({scope:'local'}).catch(()=>{});
      const fixtures=await sql`select id,email from auth.users where id=any(${ids}::uuid[])`;
      assert.equal(fixtures.length,ids.length);
      assert.ok(fixtures.every(item=>rows.some(row=>row.id===item.id&&row.email===item.email)));
      await sql`delete from auth.users where id=any(${ids}::uuid[])`;
      const [left]=await sql`select
        (select count(*)::int from auth.users where id=any(${ids}::uuid[])) as users,
        (select count(*)::int from auth.sessions where user_id=any(${ids}::uuid[])) as sessions,
        (select count(*)::int from auth.identities where user_id=any(${ids}::uuid[])) as identities,
        (select count(*)::int from public.affairs_profiles where user_id=any(${ids}::uuid[])) as profiles,
        (select count(*)::int from public.affairs_course_selection_records where user_id=any(${ids}::uuid[])) as courses`;
      assert.ok(Object.values(left).every(count=>count===0));
    }
  }finally{
    try{await lease?.release();}finally{await pool.end({timeout:5});}
  }
}
console.log('Eleven real-account withdrawal API checks passed. Disposable identities, sessions, profiles and course records were removed.');

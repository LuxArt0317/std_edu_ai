import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {earlyGraduationPath,earlyGraduationScope} from '../../server/earlyGraduationContract.js';
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
  id:randomUUID(),email:'early-graduation-qa-'+randomUUID()+'@example.invalid',password:randomBytes(24).toString('base64url')+'Aa1!',
}));
const [student]=rows,ids=rows.map(row=>row.id),sessions=[];
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
        '{"provider":"email","providers":["email","google"]}','{"full_name":"Early Graduation QA"}',now(),now())`;
      for(const provider of ['email','google'])await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${row.id},${row.id},${sql.json({sub:row.id,email:row.email,email_verified:true})},${provider},now(),now())`;
      await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${row.id},${row.email},'Early Graduation QA')`;
    }
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
  const path='/api/affairs-data?scope='+earlyGraduationScope;
  const action='/api/affairs-action',manager='/api/affairs-manage';
  await call(path,undefined,401);
  const initial=await call(path,a);
  assert.equal(initial.userId,student.id);
  assert.deepEqual(initial.records,[]);
  assert.equal(initial.candidate,null);
  const {academicYear,semester}=initial;
  await call(path+'&user_id='+student.id,b,400);
  await call(path+'-admin&year='+academicYear+'&semester='+semester+'&user_id='+student.id,b,403);
  await call(path+'-unknown',a,400);
  const payload={academic_year:academicYear,semester,expected_version:0,request_id:randomUUID()};
  const submission={kind:'submit_early_graduation',payload:{...payload,candidate_version:1}};
  await call(action,a,409,submission);
  await call(action,b,400,{...submission,payload:{...submission.payload,user_id:student.id}});
  await call(manager,a,403,{kind:'set_graduation_candidate',payload:{...payload,user_id:student.id,
    study_track:'Bachelor',department:'Early Graduation QA',student_number:'QA-CANDIDATE',graduation_year:academicYear,
    graduation_semester:semester,eligibility:'eligible'}});
  await sql.unsafe('begin');
  try{
    const q=sql;
    await q`insert into public.affairs_early_graduation_candidates
      values(${student.id},${academicYear},${semester},'Bachelor','Early Graduation QA','QA-CANDIDATE',${academicYear},${semester},'eligible',1)`;
    await q`insert into public.affairs_early_graduation_applications
      values(${student.id},${academicYear},${semester},'Bachelor','Early Graduation QA','QA-APPLICATION',${academicYear},${semester},now(),'approved',2)`;
    await sql.unsafe('commit');
  }catch(error){await sql.unsafe('rollback');throw error;}
  const updated=await call(path,a);
  assert.equal(updated.candidate.student_number,'QA-CANDIDATE');
  assert.equal(updated.records.length,1);
  assert.equal(updated.records[0].student_number,'QA-APPLICATION');
  assert.equal(updated.records[0].status,'approved');
  const isolated=await call(path,b);
  assert.equal(isolated.candidate,null);
  assert.deepEqual(isolated.records,[]);
  await call(action,a,409,{kind:'cancel_early_graduation',payload:{...payload,expected_version:2}});
  const answer=await call(path+'&answer=en',a);
  assert.match(answer.answer,/Approved on stu.best/u);
  assert.equal(answer.citations[0].url,earlyGraduationPath);
  assert.equal(answer.grounding.source,'account');
  assert.match((await call(path+'&answer=zh',a)).answer,/站內通過/u);
  assert.match((await call(path+'&answer=en',b)).answer,/No early graduation application/u);
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
        (select count(*)::int from public.affairs_early_graduation_applications where user_id=any(${ids}::uuid[])) as applications,
        (select count(*)::int from public.affairs_early_graduation_candidates where user_id=any(${ids}::uuid[])) as candidates,
        (select count(*)::int from private.affairs_early_graduation_receipts where actor=any(${ids}::uuid[])) as receipts`;
      assert.ok(Object.values(left).every(count=>count===0));
    }
  }finally{
    try{await lease?.release();}finally{await pool.end({timeout:5});}
  }
}
console.log('Fourteen actual-JWT early graduation API requests passed. Disposable accounts and records were removed.');

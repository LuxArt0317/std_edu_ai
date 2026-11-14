import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import dataHandler from '../../api/affairs-data.ts';
import actionHandler from '../../api/affairs-action.ts';
import { deploymentEnvironment } from '../../scripts/deployment-env.mjs';
import manageHandler from '../../api/affairs-manage.ts';
import { clubStudentScope } from '../../server/clubStudentContract.js';
import { dormitoryConductClientTarget, reserveDormitoryConductLease } from './dormitory-conduct-rls-live.mjs';

const env=deploymentEnvironment(), connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
assert.equal(new URL(url).origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
assert.ok(key);
Object.assign(process.env,{VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:key});
const config=JSON.parse(await readFile('deployment.json','utf8'));
const revision=process.env.EXPECTED_RELEASE_REVISION, site='https://stu.best';
const [club,otherClub]=[randomUUID(),randomUUID()];
const users=Array.from({length:2},()=>{
  const id=randomUUID();
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{
    fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000),redirect:'error'}),
  }});
  return {id,email:'club-qa-'+id+'@example.invalid',password:randomBytes(24).toString('base64url')+'Aa1!',client};
});
const [student,other]=users;
async function pin() {
  if(!revision)return;
  assert.match(revision,/^[a-f0-9]{40}$/u);
  const response=await fetch(site+'/release.json',{signal:AbortSignal.timeout(10000),cache:'no-store'});
  assert.equal((await response.json()).revision,revision);
}
await pin();
let lease,committed=false;
const pool=postgres(connection,{max:1,max_lifetime:0,connect_timeout:12,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});

const readPath='/api/affairs-data?scope='+clubStudentScope;
async function request(path,token,status,body) {
  const endpoint=new URL(path,site);
  const method=body?'POST':'GET';
  const headers={...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})};
  if(revision){
    const response=await fetch(endpoint,{method,headers,body:body&&JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(16000)});
    assert.equal(response.status,status);
    assert.match(response.headers.get('cache-control')??'',/no-store/);
    return response.json();
  }
  let code=200,value;
  const responseHeaders=new Headers();
  const response={setHeader(name,input){responseHeaders.set(name,input);},status(input){code=input;return this;},json(input){value=input;}};
  const handler=endpoint.pathname.endsWith('affairs-manage')?manageHandler:body?actionHandler:dataHandler;
  await handler({method,headers,query:Object.fromEntries(endpoint.searchParams),body},response);
  assert.equal(code,status,typeof value?.error==='string'?value.error:undefined);
  assert.match(responseHeaders.get('cache-control')??'',/no-store/);
  return value;
}
const get=(view,token,status=200,query='')=>request(readPath+'&view='+view+query,token,status);
const act=(kind,payload,token,status=200)=>request(
  kind==='review_club_foundation'?'/api/affairs-manage':'/api/affairs-action',token,status,{kind,payload});
const ownerState=async sql=>(await sql`select md5(to_jsonb(u)::text) digest from auth.users u where lower(email)=lower(${config.supabase.ownerEmail})`)[0]?.digest;
async function cleanupFixtures(sql) {
  await sql.unsafe('begin');
  try {
    for(const {id,email} of users)
      assert.equal((await sql`delete from auth.users where id=${id} and email=${email} returning id`).length,1);
    assert.equal((await sql`delete from public.affairs_clubs where id in (${club},${otherClub}) returning id`).length,2);
    const [left]=await sql`select
      (select count(*)::int from auth.sessions where user_id in (${student.id},${other.id})) sessions,
      (select count(*)::int from public.affairs_club_memberships where club_id in (${club},${otherClub})) memberships,
      (select count(*)::int from private.affairs_club_foundations where applicant_id in (${student.id},${other.id})) applications,
      (select count(*)::int from private.affairs_club_officer_operations where actor in (${student.id},${other.id})) operations`;
    assert.ok(Object.values(left).every(value=>value===0));
    await sql.unsafe('commit');
  } catch (error) {
    await sql.unsafe('rollback');
    throw error;
  }
}
try {
  lease=await reserveDormitoryConductLease(pool);
  const {sql}=lease;
  const owner=await ownerState(sql);
  assert.ok(owner);
  await sql.unsafe('begin');
  try{
    for(const {id,email,password} of users){
      await sql`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,reauthentication_token,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},
          extensions.crypt(${password},extensions.gen_salt('bf')),now(),'','','','','','',
          '{"provider":"email","providers":["email","google"]}','{"full_name":"Club QA"}',now(),now())`;
      for(const provider of ['email','google'])await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${sql.json({sub:id,email,email_verified:true})},${provider},now(),now())`;
      await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${id},${email},'Club QA')`;
      await sql`insert into public.affairs_student_profiles(user_id,student_number,name_zh,version)
        values (${id},${'QA-'+id.slice(0,8)},'Club QA Student',1)`;
    }
    await sql`insert into public.affairs_clubs(id,name) values(${club},${'QA Club '+club}),(${otherClub},${'QA Club '+otherClub})`;
    await sql`insert into public.affairs_club_memberships(user_id,club_id) values(${student.id},${club}),(${other.id},${otherClub})`;
    await sql.unsafe('commit');
    committed=true;
  }catch(error){await sql.unsafe('rollback');throw error;}

  const tokens=[];
  for(const account of users){
    const {data,error}=await account.client.auth.signInWithPassword({email:account.email,password:account.password});
    assert.ok(!error&&data.user?.id===account.id,'Disposable sign-in failed.');
    tokens.push(data.session.access_token);
  }
  const [mine,peer]=tokens;

  await get('directory','',401);
  await get('foundation',peer,400,'&user_id='+student.id);
  await get('foundation/review',peer,403);
  assert.deepEqual((await get('directory',mine,200,'&q='+club)).rows.map(row=>row.id),[club]);
  assert.deepEqual((await get('my-memberships',mine)).rows.map(row=>row.id),[club]);
  assert.deepEqual((await get('my-memberships',peer)).rows.map(row=>row.id),[otherClub]);
  const submit={name:'QA Foundation '+club,description:'A sample club proposal with activities.',request_id:randomUUID()};
  const created=await act('submit_club_foundation',submit,mine);
  assert.deepEqual(await act('submit_club_foundation',submit,mine),created);
  assert.deepEqual((await get('foundation',peer)).rows,[]);
  assert.equal((await get('foundation',mine)).rows[0].id,created.id);
  const target={id:created.id,expected_version:1,request_id:randomUUID()};
  await act('withdraw_club_foundation',target,peer,404);
  await act('review_club_foundation',{...target,status:'approved',note:''},peer,403);
  assert.equal((await act('withdraw_club_foundation',target,mine)).status,'withdrawn');
  assert.equal((await get('foundation',mine)).rows[0].status,'withdrawn');
  await pin();
  assert.equal(await ownerState(sql),owner);
} finally {
  try{
    if(committed&&lease&&!lease.lost){
      for(const account of users)await account.client.auth.signOut({scope:'local'}).catch(()=>{});
      await cleanupFixtures(lease.sql);
    }
  }finally{
    try{if(lease&&!lease.lost)await lease.release();}finally{await pool.end({timeout:4});}
  }
}
console.log('Real JWT club search, own memberships, foundation submit/retry/withdraw, review denial and exact cleanup passed.');

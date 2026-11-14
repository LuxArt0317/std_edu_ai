import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {studentProfilePath} from '../../server/studentProfileContract.js';
import {studentProfileDetails as details} from './helpers/student-profile-fixture.mjs';
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
  id:randomUUID(),email:'profile-qa-'+randomUUID()+'@example.invalid',password:randomBytes(24).toString('base64url')+'Aa1!',
}));
const ids=rows.map(row=>row.id),sessions=[];
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
  const [baseline]=await sql`select count(*)::int as profiles from public.affairs_student_profiles where user_id=any(${ids}::uuid[])`;
  assert.equal(baseline.profiles,0);
  await sql.unsafe('begin');
  try{
    for(const row of rows){
      await sql`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,reauthentication_token,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${row.id},'authenticated','authenticated',${row.email},
        extensions.crypt(${row.password},extensions.gen_salt('bf')),now(),'','','','','','',
        '{"provider":"email","providers":["email","google"]}','{"full_name":"Student Profile QA"}',now(),now())`;
      for(const provider of ['email','google'])await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${row.id},${row.id},${sql.json({sub:row.id,email:row.email,email_verified:true})},${provider},now(),now())`;
      await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${row.id},${row.email},'Student Profile QA')`;
    }
    await sql`insert into public.affairs_student_profiles ${sql({...details,user_id:ids[0],version:1})}`;
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
  const path='/api/affairs-data?scope=student-profile&view=';
  const action='/api/affairs-action',manager='/api/affairs-manage';
  await call(path+'mine',undefined,401);
  await call(path+'mine&user_id='+ids[0],b,400);
  await call(path+'manage&user_id='+ids[0],b,403);
  await call(path+'mine&answer=en&resource=conversations',a,400);
  const mine=await call(path+'mine',a);
  assert.equal(mine.userId,ids[0]);
  assert.equal(mine.record.version,1);
  assert.equal(mine.record.identity_last_four,details.identity_last_four);
  assert.equal(mine.record.registered_address,details.registered_address);
  assert.deepEqual(await call(path+'mine',b),{userId:ids[1],record:null});
  assert.match((await call(path+'mine&answer=en',a)).answer,/awaiting confirmation/u);
  assert.match((await call(path+'mine&answer=en',b)).answer,/no student profile/u);
  const confirm={kind:'confirm_student_profile',payload:{updated_mobile:'0912345678',confirmed:true,expected_version:1,request_id:randomUUID()}};
  await call(action,a,400,{...confirm,payload:{...confirm.payload,confirmed:false}});
  await call(action,b,404,confirm);
  await call(manager,a,403,{kind:'save_student_profile',payload:{user_id:ids[1],record:details,expected_version:0,request_id:randomUUID()}});
  const result=await call(action,a,200,confirm);
  assert.equal(result.userId,ids[0]);
  assert.equal(result.version,2);
  assert.ok(Number.isFinite(Date.parse(result.confirmedAt)));
  assert.deepEqual(await call(action,a,200,confirm),result);
  await call(action,a,409,{...confirm,payload:{...confirm.payload,updated_mobile:null}});
  const saved=await call(path+'mine',a);
  assert.equal(saved.record.updated_mobile,confirm.payload.updated_mobile);
  assert.equal(saved.record.confirmed_at,result.confirmedAt);
  const answer=await call(path+'mine&answer=en',a);
  assert.equal(answer.grounding.source,'account');
  assert.match(answer.answer,/has been confirmed/u);
  assert.equal(answer.citations[0].url,studentProfilePath);
  for(const value of [details.registered_address,details.student_number,confirm.payload.updated_mobile,details.identity_last_four]){
    assert.equal(JSON.stringify(answer).includes(value),false);
  }
  const chinese=await call(path+'mine&answer=zh',a);
  assert.match(chinese.answer,/已確認/u);
  const [receipt]=await sql`select count(*)::int as total from private.affairs_student_profile_receipts where actor=${ids[0]}`;
  assert.equal(receipt.total,1);
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
        await sql`delete from auth.users where id=any(${ids}::uuid[])`;
        await sql.unsafe('commit');
      }catch(error){await sql.unsafe('rollback').catch(()=>{});throw error;}
      const [left]=await sql`select
        (select count(*)::int from auth.users where id=any(${ids}::uuid[])) as users,
        (select count(*)::int from auth.sessions where user_id=any(${ids}::uuid[])) as sessions,
        (select count(*)::int from auth.identities where user_id=any(${ids}::uuid[])) as identities,
        (select count(*)::int from public.affairs_profiles where user_id=any(${ids}::uuid[])) as profiles,
        (select count(*)::int from public.affairs_student_profiles where user_id=any(${ids}::uuid[])) as student_profiles,
        (select count(*)::int from private.affairs_student_profile_receipts where actor=any(${ids}::uuid[]) or target=any(${ids}::uuid[])) as receipts`;
      assert.ok(Object.values(left).every(count=>count===0));
    }
  }finally{
    try{await lease?.release();}finally{await pool.end({timeout:5});}
  }
}
console.log('Actual-JWT student profile HTTP verification passed. Disposable accounts, profiles and receipts were removed.');

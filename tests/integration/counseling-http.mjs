import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {counselingScope,counselingConsentVersion} from '../../server/counselingContract.js';
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
const rows=Array.from({length:3},()=>({
  id:randomUUID(),email:'counseling-qa-'+randomUUID()+'@example.invalid',password:randomBytes(24).toString('base64url')+'Aa1!',
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
    assert.equal(response.status,status,method+' '+endpoint.pathname);
    return response.json();
  }
  let code,result;
  const response={status(value){code=value;return response;},json(value){result=value;},setHeader(){}};
  const handler=endpoint.pathname==='/api/affairs-data'?dataHandler:endpoint.pathname==='/api/affairs-action'?actionHandler:managerHandler;
  await handler({method,query:Object.fromEntries(endpoint.searchParams),headers,body},response);
  assert.equal(code,status,method+' '+endpoint.pathname);
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
        '{"provider":"email","providers":["email","google"]}','{"full_name":"Counseling QA"}',now(),now())`;
      for(const provider of ['email','google'])await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${row.id},${row.id},${sql.json({sub:row.id,email:row.email,email_verified:true})},${provider},now(),now())`;
      await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${row.id},${row.email},'Counseling QA')`;
    }
    // Only grant a synthetic coordinator when no real coordinator or appointment exists.
    await sql`lock table private.affairs_counseling_coordinators in share row exclusive mode`;
    const [baseline]=await sql`select (select count(*)::int from private.affairs_counseling_coordinators) as coordinators,
      (select count(*)::int from public.affairs_counseling_appointments) as appointments`;
    assert.deepEqual(baseline,{coordinators:0,appointments:0},'Requires an unused counseling queue.');
    if(!revision)await sql`insert into private.affairs_counseling_coordinators(user_id) values(${ids[2]})`;
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
  const [student,other,coordinator]=sessions.map(item=>item.token);
  const path='/api/affairs-data?scope='+counselingScope+'&view=';
  const request=(token,kind,payload,code=200)=>call('/api/affairs-action',token,code,{kind:'counseling_'+kind,payload});
  const manage=(token,kind,payload,code=200)=>call('/api/affairs-manage',token,code,{kind:'counseling_'+kind,payload});
  await call(path+'mine','',401);
  await call(path+'mine&user_id='+ids[1],student,400);
  await call(path+'queue',student,403);
  await call(path+'access',coordinator,403);
  if(revision){
    // Keep booking unavailable to real visitors during production QA.
    assert.deepEqual(await call(path+'mine',student),{userId:ids[0],rows:[],canCoordinate:false,available:false});
    assert.deepEqual(await call(path+'mine',other),{userId:ids[1],rows:[],canCoordinate:false,available:false});
    await call(path+'queue',coordinator,403);
    const preferred_on=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    await request(student,'request',{kind:'counseling',preferred_on,preferred_period:'afternoon',
      consent_version:counselingConsentVersion,request_id:randomUUID()},409);
  }else{
    const available=await call(path+'mine',student);
    assert.deepEqual(available,{userId:ids[0],rows:[],canCoordinate:false,available:true});
    const time=new Date(Date.now()+4*86400000);
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
    const draft={kind:'counseling',preferred_on:date,preferred_period:'afternoon',consent_version:counselingConsentVersion,request_id:randomUUID()};
    await request(student,'request',{...draft,consent_version:'previous'},400);
    await request(student,'request',{...draft,private_notes:'Unexpected input'},400);
    const first=await request(student,'request',draft);
    assert.deepEqual(first,{id:first.id,version:1,status:'requested'});
    assert.deepEqual(await request(student,'request',draft),first);
    await request(student,'request',{...draft,kind:'assessment'},409);
    assert.deepEqual((await call(path+'mine',other)).rows,[]);
    const cancel={id:first.id,expected_version:1,request_id:randomUUID()};
    await request(other,'cancel',cancel,404);
    const queue=await call(path+'queue',coordinator);
    assert.equal(queue.rows.length,1);
    assert.equal(queue.rows[0].id,first.id);
    assert.equal(queue.rows[0].contact_email,rows[0].email);
    const review={...cancel,request_id:randomUUID(),status:'scheduled',scheduled_at:time.toISOString()};
    await manage(student,'review',review,403);
    const scheduled=await manage(coordinator,'review',review);
    assert.deepEqual(scheduled,{id:first.id,version:2,status:'scheduled'});
    assert.deepEqual(await manage(coordinator,'review',review),scheduled);
    const saved=(await call(path+'mine',student)).rows[0];
    assert.equal(new Date(saved.scheduled_at).toISOString(),time.toISOString());
    assert.equal(Object.hasOwn(saved,'contact_email'),false);
    await request(student,'cancel',cancel,409);
    assert.deepEqual(await request(student,'cancel',{...cancel,expected_version:2}),{id:first.id,version:3,status:'cancelled'});
    assert.deepEqual((await call(path+'queue',coordinator)).rows,[]);
    assert.equal((await call(path+'mine',student)).rows[0].status,'cancelled');
  }
  await checkRevision();
}finally{
  try{
    if(committed&&lease&&!lease.lost){
      for(const {client} of sessions)await client.auth.signOut({scope:'local'}).catch(()=>{});
      const {sql}=lease;
      const found=await sql`select id,email from auth.users where id=any(${ids}::uuid[])`;
      assert.equal(found.length,ids.length);
      assert.ok(found.every(item=>rows.some(row=>row.id===item.id&&row.email===item.email)));
      await sql`delete from auth.users where id=any(${ids}::uuid[])`;
      const [left]=await sql`select
        (select count(*)::int from auth.users where id=any(${ids}::uuid[])) as users,
        (select count(*)::int from auth.sessions where user_id=any(${ids}::uuid[])) as sessions,
        (select count(*)::int from auth.identities where user_id=any(${ids}::uuid[])) as identities,
        (select count(*)::int from public.affairs_profiles where user_id=any(${ids}::uuid[])) as profiles,
        (select count(*)::int from public.affairs_counseling_appointments where user_id=any(${ids}::uuid[])) as appointments,
        (select count(*)::int from private.affairs_counseling_coordinators where user_id=any(${ids}::uuid[])) as grants,
        (select count(*)::int from private.affairs_counseling_operations where actor=any(${ids}::uuid[])) as receipts`;
      assert.ok(Object.values(left).every(count=>count===0));
    }
  }finally{
    try{await lease?.release();}finally{await pool.end({timeout:5});}
  }
}
console.log(revision
  ?'Production actual-JWT authorization and disabled booking passed. Disposable fixtures removed.'
  :'Actual-JWT counseling saves, caller and coordinator isolation, scheduling, cancellation, and exact fixture cleanup passed.');

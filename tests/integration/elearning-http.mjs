import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {elearningScope,elearningCatalogScope,elearningOutlineScope} from '../../server/elearningContract.js';
import dataHandler from '../../api/affairs-data.ts';
import actionHandler from '../../api/affairs-action.ts';

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
  id:randomUUID(),email:'elearning-qa-'+randomUUID()+'@example.invalid',password:randomBytes(24).toString('base64url')+'Aa1!',
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
  const handler=endpoint.pathname==='/api/affairs-data'?dataHandler:actionHandler;
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
        '{"provider":"email","providers":["email","google"]}','{"full_name":"Remote Learning QA"}',now(),now())`;
      for(const provider of ['email','google'])await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${row.id},${row.id},${sql.json({sub:row.id,email:row.email,email_verified:true})},${provider},now(),now())`;
      await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${row.id},${row.email},'Remote Learning QA')`;
    }
    await sql`insert into public.elearning_course_access(course_id,user_id) values(9408,${ids[0]}),(9098,${ids[0]})`;
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
  const [student,other]=sessions.map(item=>item.token);
  const path='/api/affairs-data?scope='+elearningScope;
  const join=(token,id,code=200)=>call('/api/affairs-action',token,code,{kind:'elearning_join',payload:{course_id:id}});
  await call(path,'',401);
  await call(path+'&user_id='+ids[1],student,400);
  const first=await call(path,student);
  assert.equal(first.userId,ids[0]);
  assert.equal(first.courses.length,20);
  assert.equal(first.categories.length,43);
  const catalog='/api/affairs-data?scope='+elearningCatalogScope;
  await call(catalog,'',401);
  await call(catalog+'&user_id='+ids[1],student,400);
  await call(catalog+'&page=1001',student,400);
  await call(catalog+'&course=9718&category=41',student,400);
  const firstPage=await call(catalog+'&category=28',student);
  const lastPage=await call(catalog+'&category=28&page=46',student);
  assert.equal(firstPage.total,907);
  assert.equal(firstPage.userId,ids[0]);
  assert.equal(firstPage.courses.length,20);
  assert.equal(lastPage.courses.length,7);
  assert.equal((await call(catalog+'&category=49',student)).total,0);
  assert.equal((await call(catalog+'&course=10891',student)).courses[0].category_id,18);
  assert.equal((await call(catalog+'&category=18&term='+encodeURIComponent('教育訓練影片 2025'),student)).courses[0].id,10891);
  assert.equal((await call(catalog+'&page=2',other)).total,3291);
  const outline='/api/affairs-data?scope='+elearningOutlineScope+'&course=9408';
  await call(outline,'',401);
  await call(outline+'&user_id='+ids[0],other,400);
  await call(outline.replace('9408','0'),student,400);
  assert.deepEqual(await call(outline,other),{userId:ids[1],courseId:9408,sections:[]});
  const protectedOutline=await call(outline,student);
  assert.equal(protectedOutline.userId,ids[0]);
  assert.deepEqual(protectedOutline.sections[0].activities.map(activity=>activity.id),[293399,293395,293396,293397,293398]);
  const secondOutline=await call(outline.replace('9408','9098'),student);
  assert.deepEqual(secondOutline.sections.map(section=>section.activities.length),[11,1]);
  assert.equal(first.notices.length,20);
  assert.deepEqual(first.enrollments,[]);
  await join('',9718,401);
  await join(student,'9718',400);
  await join(student,10582,404);
  const [one,two]=await Promise.all([join(student,9718),join(student,9718)]);
  assert.equal(one.courseId,9718);
  assert.ok(Number.isFinite(Date.parse(one.joinedAt)));
  assert.deepEqual(two,one);
  assert.deepEqual((await call(path,student)).enrollments,[one]);
  assert.deepEqual((await call(path,other)).enrollments,[]);
  assert.equal((await sql`select count(*)::int as n from public.dtm_courses where user_id=any(${ids}::uuid[])`)[0].n,0);
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
        (select count(*)::int from public.elearning_enrollments where user_id=any(${ids}::uuid[])) as enrollments,
        (select count(*)::int from public.elearning_course_access where user_id=any(${ids}::uuid[])) as course_access`;
      assert.ok(Object.values(left).every(count=>count===0));
    }
  }finally{
    try{await lease?.release();}finally{await pool.end({timeout:5});}
  }
}
console.log('Actual-JWT remote-learning enrollments, concurrent replay, account isolation, and exact fixture cleanup passed.');

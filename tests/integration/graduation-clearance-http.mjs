import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {clearancePaths} from '../../server/graduationClearanceContract.js';
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
  id:randomUUID(),email:'graduation-clearance-qa-'+randomUUID()+'@example.invalid',password:randomBytes(24).toString('base64url')+'Aa1!',
}));
const [student]=rows,term=randomUUID(),ids=rows.map(row=>row.id),sessions=[];
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
        '{"provider":"email","providers":["email","google"]}','{"full_name":"Graduation Clearance QA"}',now(),now())`;
      for(const provider of ['email','google'])await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${row.id},${row.id},${sql.json({sub:row.id,email:row.email,email_verified:true})},${provider},now(),now())`;
      await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${row.id},${row.email},'Graduation Clearance QA')`;
    }
    await sql`insert into public.affairs_terms(id,code,label,starts_on,ends_on)
      values(${term},${'QA-'+term},'Clearance QA Term',current_date-1,current_date+1)`;
    await sql`insert into public.affairs_clearance_periods(term_id,opens_at,closes_at)
      values(${term},now()-interval '1 day',now()+interval '1 day')`;
    await sql`insert into public.affairs_clearance_candidates(term_id,user_id,track,international)
      values(${term},${student.id},'graduate',true)`;
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
  const path='/api/affairs-data?scope=graduation-clearance&view=';
  const action='/api/affairs-action',manager='/api/affairs-manage';
  await call(path+'student',undefined,401);
  assert.equal((await call(path+'student',b)).periods.length,0);
  await call(path+'manage&term='+term+'&user_id='+student.id,b,403);
  await call(path+'student&term='+term,a,400);
  await call(path+'student&user_id='+student.id,b,400);
  await call(path+'manage&user_id='+student.id,a,400);
  const submit={kind:'submit_graduation_clearance',payload:{term_id:term,period_version:1,candidate_version:1,request_id:randomUUID(),acknowledged:true}};
  await call(action,b,403,submit);
  await call(action,a,400,{...submit,payload:{...submit.payload,acknowledged:false}});
  const visible=await call(path+'student',a);
  assert.equal(visible.periods.find(row=>row.termId===term)?.state,'open');
  assert.deepEqual(visible.applications,[]);
  const saved=await call(action,a,200,submit);
  assert.equal(saved.termId,term);
  assert.deepEqual(await call(action,a,200,submit),saved);
  await call(action,a,409,{...submit,payload:{...submit.payload,request_id:randomUUID()}});
  assert.deepEqual((await call(path+'student',b)).applications,[]);
  const result=(await call(path+'student',a)).applications[0];
  assert.equal(result.id,saved.id);
  assert.equal(result.reviews.length,8);
  assert.ok(result.reviews.every(row=>row.status==='pending'));
  await call(manager,a,403,{kind:'review_clearance_office',payload:{application_id:saved.id,office:'library',decision:'cleared',note:'',expected_version:1,request_id:randomUUID()}});
  await sql`update public.affairs_clearance_reviews set status='action_required',note='QA private note',reviewed_at=clock_timestamp(),version=2
    where application_id=${saved.id} and office='library'`;
  const updated=(await call(path+'student',a)).applications[0].reviews.find(row=>row.office==='library');
  assert.equal(updated.note,'QA private note');
  const answer=await call(path+'student&answer=en',a);
  assert.match(answer.answer,/Library circulation · Action required/u);
  assert.ok(!answer.answer.includes(updated.note));
  assert.equal(answer.citations[0].url,clearancePaths.status);
  assert.match((await call(path+'student&answer=zh',a)).answer,/圖書館典閱組 · 待補辦/u);
  assert.match((await call(path+'student&answer=en',b)).answer,/no submitted graduation clearance/u);
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
        await sql`delete from public.affairs_clearance_periods where term_id=${term}`;
        await sql`delete from public.affairs_terms where id=${term} and code=${'QA-'+term}`;
        await sql.unsafe('commit');
      }catch(error){await sql.unsafe('rollback').catch(()=>{});throw error;}
      const [left]=await sql`select
        (select count(*)::int from auth.users where id=any(${ids}::uuid[])) as users,
        (select count(*)::int from auth.sessions where user_id=any(${ids}::uuid[])) as sessions,
        (select count(*)::int from auth.identities where user_id=any(${ids}::uuid[])) as identities,
        (select count(*)::int from public.affairs_profiles where user_id=any(${ids}::uuid[])) as profiles,
        (select count(*)::int from public.affairs_clearance_applications where term_id=${term}) as applications,
        (select count(*)::int from public.affairs_clearance_candidates where term_id=${term}) as candidates,
        (select count(*)::int from public.affairs_clearance_periods where term_id=${term}) as periods,
        (select count(*)::int from public.affairs_terms where id=${term}) as terms,
        (select count(*)::int from private.affairs_clearance_receipts where actor=any(${ids}::uuid[])) as receipts`;
      assert.ok(Object.values(left).every(count=>count===0));
    }
  }finally{
    try{await lease?.release();}finally{await pool.end({timeout:5});}
  }
}
console.log('Nineteen actual-JWT graduation clearance requests passed. Disposable accounts, term and clearance records were removed.');

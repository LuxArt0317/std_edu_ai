import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import dataHandler from '../../api/affairs-data.ts';

const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
assert.equal(new URL(url).origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
assert.ok(key);
Object.assign(process.env,{VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:key});
const revision=process.env.EXPECTED_RELEASE_REVISION,site='https://stu.best';
const config=JSON.parse(await readFile('deployment.json','utf8'));
async function pin(){
  if(!revision)return;
  assert.match(revision,/^[0-9a-f]{40}$/u);
  const response=await fetch(site+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,revision);
}
await pin();
const id=randomUUID(),email='aid-qa-'+id+'@example.invalid',password=randomBytes(24).toString('base64url')+'Aa1!';
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{
  fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000),redirect:'error'}),
}});
let lease,committed=false,owner;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const path='/api/affairs-data?scope=aid-payments';
async function call(query,token,status=200){
  const endpoint=new URL(path+query,site),headers=token?{authorization:'Bearer '+token}:{};
  if(revision){
    const response=await fetch(endpoint,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
    assert.equal(response.status,status);
    return response.json();
  }
  let code,body;
  const response={setHeader(){},status(value){code=value;return this;},json(value){body=value;}};
  await dataHandler({method:'GET',headers,query:Object.fromEntries(endpoint.searchParams)},response);
  assert.equal(code,status);
  return body;
}
async function ownerState(sql){
  return (await sql`select md5(to_jsonb(u)::text) as digest from auth.users u where lower(email)=lower(${config.supabase.ownerEmail})`)[0]?.digest;
}
try{
  lease=await reserveDormitoryConductLease(pool);
  const {sql}=lease;
  owner=await ownerState(sql);
  assert.ok(owner);
  await sql.unsafe('begin');
  try{
    await sql`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,reauthentication_token,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},
      extensions.crypt(${password},extensions.gen_salt('bf')),now(),'','','','','','',
      '{"provider":"email","providers":["email","google"]}','{"full_name":"Aid Payments QA"}',now(),now())`;
    for(const provider of ['email','google'])await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      values(${id},${id},${sql.json({sub:id,email,email_verified:true})},${provider},now(),now())`;
    await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${id},${email},'Aid Payments QA')`;
    await sql`insert into public.affairs_aid_payment_claims(user_id,position,reason,amount)
      select ${id},n,'QA claim '||n,0 from generate_series(1,26) n`;
    await sql`insert into public.affairs_aid_salary_records(user_id,position,appointment_type,bank_last4,net)
      values(${id},1,'QA payroll','0012',50.20)`;
    await sql.unsafe('commit');
    committed=true;
  }catch(error){await sql.unsafe('rollback');throw error;}
  const {data,error}=await client.auth.signInWithPassword({email,password});
  assert.ok(!error&&data.user?.id===id,'Disposable sign-in failed.');
  const token=data.session.access_token;
  await call('&view=claims','',401);
  await call('&view=salary&user_id='+randomUUID(),token,400);
  await call('&view=salary&page=2&summary=1',token,400);
  const claims=await call('&view=claims&page=2',token);
  assert.equal(claims.userId,id);
  assert.equal(claims.total,26);
  assert.equal(claims.rows.length,1);
  assert.equal(claims.rows[0].reason,'QA claim 26');
  assert.equal(claims.rows[0].amount,0);
  const salary=await call('&view=salary',token);
  assert.equal(salary.rows[0].bank_last4,'0012');
  assert.equal(salary.rows[0].net,50.2);
  assert.equal(Object.hasOwn(salary.rows[0],'user_id'),false);
  assert.deepEqual(await call('&view=salary&summary=1',token),{userId:id,view:'salary',total:1,rows:[]});
  await pin();
}finally{
  try{
    if(committed&&lease&&!lease.lost){
      await client.auth.signOut({scope:'local'}).catch(()=>{});
      const {sql}=lease;
      const deleted=await sql`delete from auth.users where id=${id} and email=${email} returning id`;
      assert.equal(deleted.length,1);
      const [remaining]=await sql`select
        (select count(*)::int from auth.users where id=${id}) users,
        (select count(*)::int from auth.identities where user_id=${id}) identities,
        (select count(*)::int from auth.sessions where user_id=${id}) sessions,
        (select count(*)::int from public.affairs_profiles where user_id=${id}) profiles,
        (select count(*)::int from public.affairs_aid_payment_claims where user_id=${id}) claims,
        (select count(*)::int from public.affairs_aid_salary_records where user_id=${id}) salary`;
      assert.ok(Object.values(remaining).every(count=>count===0));
      assert.equal(await ownerState(sql),owner);
    }
  }finally{
    try{await lease?.release();}finally{await pool.end({timeout:4});}
  }
}
console.log('Actual-JWT aid inquiry, masked payroll, count-only reads and exact fixture cleanup passed.');

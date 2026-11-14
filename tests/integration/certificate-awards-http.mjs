import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {certificateAwardPath,certificateProofBucket} from '../../server/certificateAwardsContract.js';
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
  id:randomUUID(),email:'certificate-award-qa-'+randomUUID()+'@example.invalid',password:randomBytes(24).toString('base64url')+'Aa1!',
}));
const ids=rows.map(row=>row.id),sessions=[],paths=[];
const serviceKey=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(serviceKey,'Scoped fixture cleanup requires the client Storage key.');
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
        '{"provider":"email","providers":["email","google"]}','{"full_name":"Certificate Award QA"}',now(),now())`;
      for(const provider of ['email','google'])await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${row.id},${row.id},${sql.json({sub:row.id,email:row.email,email_verified:true})},${provider},now(),now())`;
      await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${row.id},${row.email},'Certificate Award QA')`;
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
  const path='/api/affairs-data?scope=certificate-awards&view=',action='/api/affairs-action',manage='/api/affairs-manage';
  const [student,other]=sessions;
  const rpc=(token,op,payload,status=200)=>call(action,token,status,{kind:'certificate_award_'+op,payload});
  await call(path+'mine',undefined,401);
  await call(path+'mine&user_id='+ids[0],b,400);
  await call(path+'manage&user_id='+ids[0],b,403);
  await call(path+'mine&answer=en&resource=conversations',a,400);
  const catalog=await call(path+'catalog',a);
  assert.ok(catalog.rows.length>=30);
  assert.equal(catalog.rows[0].code,'3345');
  assert.deepEqual((await call(path+'catalog&code=3345',a)).rows,[catalog.rows[0]]);
  assert.equal((await call(path+'mine',a)).identity.studentNumber,details.student_number);
  assert.equal((await call(path+'mine',b)).identity,null);
  const draft={id:null,expected_version:0,certificate_code:'3345',obtained_on:'2026-01-10',phone:'0900000000',
    teacher_code:'',wants_award:false,request_id:randomUUID()};
  const receipt=await rpc(a,'draft',draft);
  assert.equal(receipt.status,'draft');
  assert.deepEqual(await rpc(a,'draft',draft),receipt);
  const selector={id:receipt.id,expected_version:receipt.version};
  const bytes=Buffer.from('%PDF-1.4\n%%EOF\n');
  const reserve={...selector,filename:'qa-proof.pdf',size_bytes:bytes.length,content_type:'application/pdf',request_id:randomUUID()};
  const file=await rpc(a,'reserve',reserve);
  assert.equal(file.path,ids[0]+'/'+receipt.id+'/'+file.fileId);
  paths.push(file.path);
  const attach={...selector,file_id:file.fileId,request_id:randomUUID()};
  await rpc(a,'attach',attach,409);
  await call(path+'mine&id='+receipt.id,b,404);
  assert.ok((await other.client.storage.from(certificateProofBucket).upload(file.path,bytes,{contentType:'application/pdf'})).error);
  const inserted=await student.client.storage.from(certificateProofBucket).upload(file.path,bytes,{contentType:'application/pdf'});
  assert.equal(inserted.error,null);
  assert.ok((await student.client.storage.from(certificateProofBucket).upload(file.path,bytes,{contentType:'application/pdf',upsert:true})).error);
  assert.equal((await rpc(a,'attach',attach)).fileId,file.fileId);
  const owned=await student.client.storage.from(certificateProofBucket).download(file.path);
  assert.equal(owned.error,null);
  assert.deepEqual(Buffer.from(await owned.data.arrayBuffer()),bytes);
  assert.ok((await other.client.storage.from(certificateProofBucket).download(file.path)).error);
  const publicResponse=await fetch(url+'/storage/v1/object/public/'+certificateProofBucket+'/'+file.path,{signal:AbortSignal.timeout(10000)});
  assert.equal(publicResponse.ok,false);
  void publicResponse.body?.cancel().catch(()=>{});
  const submitted=await rpc(a,'submit',{...selector,request_id:randomUUID()});
  assert.equal(submitted.status,'submitted');
  const remove=await student.client.storage.from(certificateProofBucket).remove([file.path]);
  assert.ok(remove.error||remove.data.length===0);
  assert.equal((await student.client.storage.from(certificateProofBucket).download(file.path)).error,null);
  await call(manage,a,403,{kind:'certificate_award_review',payload:{id:receipt.id,user_id:ids[0],expected_version:2,status:'approved',
    application_fee:null,award_amount:null,review_note:'',request_id:randomUUID()}});
  const answer=await call(path+'mine&answer=en',a);
  assert.equal(answer.grounding.source,'account');
  assert.match(answer.answer,/Submitted/u);
  assert.equal(answer.citations[0].url,certificateAwardPath);
  for(const value of [draft.phone,details.student_number,file.path,reserve.filename]){
    assert.equal(JSON.stringify(answer).includes(value),false);
  }
  assert.match((await call(path+'mine&answer=en',b)).answer,/no saved certificate applications/u);
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
      if(paths.length){
        assert.ok(paths.every(path=>path.startsWith(ids[0]+'/')&&path.split('/').length===3));
        const cleanupClient=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false},global:{
          fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000),redirect:'error'}),
        }});
        const removed=await cleanupClient.storage.from(certificateProofBucket).remove(paths);
        assert.equal(removed.error,null,'Remove fixture bytes using Storage before deleting account metadata.');
        assert.equal((await sql`select count(*)::int as n from storage.objects where bucket_id=${certificateProofBucket} and name=any(${paths}::text[])`)[0].n,0);
      }
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
        (select count(*)::int from public.affairs_certificate_applications where user_id=any(${ids}::uuid[])) as applications,
        (select count(*)::int from private.affairs_certificate_files where user_id=any(${ids}::uuid[])) as files,
        (select count(*)::int from private.affairs_certificate_receipts where actor=any(${ids}::uuid[])) as receipts`;
      assert.ok(Object.values(left).every(count=>count===0));
    }
  }finally{
    try{await lease?.release();}finally{await pool.end({timeout:5});}
  }
}
console.log('Actual-JWT certificate award HTTP and Storage verification passed. Disposable accounts, proof bytes and records were removed.');

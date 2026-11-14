import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
import {studentProfileDetails as details} from './helpers/student-profile-fixture.mjs';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--rollback-preflight','--deployed'].includes(mode)&&!extra.length);
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config=JSON.parse(await readFile('deployment.json','utf8'));
const ddl=await readFile('supabase/migrations/20261114230000_certificate_awards.sql','utf8');
const students=Array.from({length:3},()=>randomUUID()),[own,other,nonGoogle]=students;
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const fingerprint=async q=>(await q`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${config.supabase.ownerEmail})) as owner,
  (select count(*)::int from auth.users where id=any(${students}::uuid[])) as fixtures,
  to_regclass('public.affairs_certificate_applications') is null as absent,
  (select count(*)::int from storage.buckets where id='affairs-certificate-proofs') as bucket`)[0];
const read=async (q,target=null,id=null,status=false)=>(await q`select public.affairs_read_certificate_awards(${target}::uuid,${id}::uuid,${status}) as result`)[0].result;
const change=async (q,op,payload)=>(await q`select public.affairs_change_certificate_award(${op},${q.json(payload)}) as result`)[0].result;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,account,role='authenticated') {
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${account},true)`;
}
try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.ok(before.owner&&before.fixtures===0);
  assert.equal(before.absent,mode==='--rollback-preflight');
  assert.equal(before.bucket,before.absent?0:1);
  await lease.rollbackOnly(async q=>{
    if(before.absent)await q.unsafe(ddl);
    const [owner]=await q`select id from auth.users where lower(email)=lower(${config.supabase.ownerEmail})`;
    assert.ok(owner?.id);
    await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      select ${'qa-'+randomUUID()},${owner.id},${q.json({sub:owner.id,email_verified:true})},'google',now(),now()
      where not exists(select 1 from auth.identities where user_id=${owner.id} and provider='google')`;
    await q`insert into public.affairs_profiles(user_id,email,display_name,role)
      values (${owner.id},${config.supabase.ownerEmail},'QA owner','admin')
      on conflict(user_id) do update set role='admin'`;
    for(const id of students){
      const email='profile-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values (${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
      await q`insert into public.affairs_profiles(user_id,email,display_name) values(${id},${email},'QA student')`;
    }
    await q`insert into public.affairs_student_profiles ${q({...details,user_id:own,version:1})}`;
    const draft={id:null,expected_version:0,certificate_code:'3345',obtained_on:'2026-01-10',phone:'0900000000',
      teacher_code:'',wants_award:true,request_id:randomUUID()};
    const payout={user_id:own,bank:'QA Bank',branch:'QA Branch',account_last_four:'1234',note:'Reconciled',request_id:randomUUID()};
    await as(q,'','anon');
    await deny(q,s=>read(s),'42501');
    await deny(q,s=>change(s,'draft',draft),'42501');
    await as(q,nonGoogle);
    await deny(q,s=>read(s),'42501');
    await as(q,own);
    await deny(q,s=>change(s,'payout',payout),'42501');
    await deny(q,s=>s`select * from public.affairs_certificate_payout_profiles`,'42501');
    await deny(q,s=>read(s,other),'42501');
    const [catalog]=await q`select public.affairs_certificate_catalog_search('','','','',0) as result`;
    assert.equal(catalog.result.rows.length,30);
    assert.equal(catalog.result.rows[0].code,'3345');
    const [search]=await q`select public.affairs_certificate_catalog_search('','TOEIC','CEF C1','ETS',0) as result`;
    assert.ok(search.result.total>0&&search.result.rows.every(row=>row.name.includes('TOEIC')&&row.level.includes('C1')));
    assert.deepEqual((await read(q)).identity,{studentNumber:details.student_number,name:details.name_zh});
    await deny(q,s=>change(s,'draft',{...draft,user_id:other}),'22023');
    const first=await change(q,'draft',draft);
    assert.equal(first.version,1);
    assert.deepEqual(await change(q,'draft',draft),first);
    await deny(q,s=>change(s,'draft',{...draft,request_id:randomUUID()}),'PT409');
    const selector={id:first.id,expected_version:1};
    const reserve={...selector,filename:'private-proof.pdf',size_bytes:12,content_type:'application/pdf',request_id:randomUUID()};
    await deny(q,s=>change(s,'submit',{...selector,request_id:randomUUID()}),'PT409');
    const upload=await change(q,'reserve',reserve);
    assert.equal(upload.path,own+'/'+first.id+'/'+upload.fileId);
    assert.deepEqual(await change(q,'reserve',reserve),upload);
    const attach={...selector,file_id:upload.fileId,request_id:randomUUID()};
    await deny(q,s=>change(s,'attach',attach),'PT409');
    await as(q,other);
    await deny(q,s=>read(s,null,first.id),'PT404');
    await deny(q,s=>change(s,'attach',attach),'PT404');
    await deny(q,s=>s`insert into storage.objects(bucket_id,name,metadata) values('affairs-certificate-proofs',${upload.path},'{}')`,'42501');
    await as(q,own);
    await q`insert into storage.objects(bucket_id,name,owner_id,metadata)
      values('affairs-certificate-proofs',${upload.path},${own},${q.json({size:12,mimetype:'application/pdf'})})`;
    assert.equal((await change(q,'attach',attach)).fileId,upload.fileId);
    await deny(q,s=>change(s,'submit',{...selector,request_id:randomUUID()}),'PT409');
    const proof=await read(q,null,first.id);
    assert.equal(proof.files[0].attached,true);
    const status=await read(q,null,null,true);
    assert.deepEqual(Object.keys(status.rows[0]).sort(),['award_amount','id','name','status','updated_at','wants_award']);
    assert.equal(JSON.stringify(status).includes('0900000000'),false);
    await as(q,owner.id);
    assert.deepEqual(await change(q,'payout',payout),{userId:own,saved:true});
    assert.equal((await read(q,own,first.id)).payout.account_last_four,'1234');
    assert.equal((await q`select id from storage.objects where bucket_id='affairs-certificate-proofs' and name=${upload.path}`).length,1);
    await as(q,own);
    const submit={...selector,request_id:randomUUID()};
    const submitted=await change(q,'submit',submit);
    assert.equal(submitted.version,2);
    assert.equal(submitted.status,'submitted');
    assert.deepEqual(await change(q,'submit',submit),submitted);
    await deny(q,s=>change(s,'detach',{...selector,expected_version:2,file_id:upload.fileId,request_id:randomUUID()}),'PT409');
    assert.equal((await q`select private.affairs_certificate_object_access(${upload.path},'delete') as allowed`)[0].allowed,false);
    await as(q,owner.id);
    const review={id:first.id,user_id:own,expected_version:2,status:'approved',review_note:'',application_fee:600,award_amount:500,request_id:randomUUID()};
    assert.equal((await change(q,'review',review)).status,'approved');
    await as(q,other);
    assert.deepEqual((await read(q)).rows,[]);
    assert.equal((await q`select id from storage.objects where bucket_id='affairs-certificate-proofs' and name=${upload.path}`).length,0);
    await as(q,own);
    assert.equal((await read(q,null,null,true)).rows[0].award_amount,500);
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Certificate awards rollback passed catalog, account isolation, proof RLS, payout verification, review and cleanup.');
}finally{
  try{await lease?.release();}finally{await pool.end({timeout:5});}
}

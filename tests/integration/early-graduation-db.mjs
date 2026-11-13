import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

const mode=process.argv[2];
assert.deepEqual(process.argv.slice(2),[mode]);
assert.ok(['--rollback-preflight','--deployed'].includes(mode));
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config=JSON.parse(await readFile('deployment.json','utf8'));
const ddl=await readFile('supabase/migrations/20261114130000_early_graduation.sql','utf8');
const students=Array.from({length:4},()=>randomUUID()),[own,other,nonGoogle,reviewStudent]=students;
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const read=async(q,year=null,semester=null,student=null)=>(await q`
  select public.affairs_read_early_graduation(${year},${semester},${student}) as data`)[0].data;
const write=async(q,kind,body)=>(await q`select public.affairs_change_early_graduation(${kind},${q.json(body)}) as row`)[0].row;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,id,role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
const fingerprint=async q=>(await q`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${config.supabase.ownerEmail})) as owner,
  (select count(*)::int from auth.users where id=any(${students}::uuid[])) as fixtures,
  to_regclass('public.affairs_early_graduation_applications') is null as absent`)[0];
try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.ok(before.owner&&before.fixtures===0);
  assert.equal(before.absent,mode==='--rollback-preflight');
  await lease.rollbackOnly(async q=>{
    if(before.absent)await q.unsafe(ddl);
    const [owner]=await q`select id from auth.users where lower(email)=lower(${config.supabase.ownerEmail})`;
    await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      select ${'qa-'+randomUUID()},${owner.id},${q.json({sub:owner.id,email_verified:true})},'google',now(),now()
      where not exists(select 1 from auth.identities where user_id=${owner.id} and provider='google')`;
    await q`insert into public.affairs_profiles(user_id,email,display_name,role)
      values(${owner.id},${config.supabase.ownerEmail},'QA owner','admin') on conflict(user_id) do update set role='admin'`;
    for(const id of students){
      const email='early-graduation-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
    }
    await as(q,'','anon');
    await deny(q,read,'42501');
    await as(q,nonGoogle);
    await deny(q,read,'42501');
    await as(q,own);
    const initial=await read(q);
    const {academicYear,semester}=initial;
    const payload=(expected_version=0)=>({academic_year:academicYear,semester,expected_version,request_id:randomUUID()});
    const submit=(candidate_version=1)=>({...payload(),candidate_version});
    const candidate=(user_id)=>({...payload(),user_id,study_track:'Bachelor',department:'QA Department',
      student_number:'QA-'+user_id.slice(0,8),graduation_year:academicYear,graduation_semester:semester,eligibility:'eligible'});
    const now=Date.now(),iso=offset=>new Date(now+offset).toISOString();
    assert.deepEqual(initial.records,[]);
    assert.equal(initial.candidate,null);
    await deny(q,s=>read(s,academicYear,semester,other),'42501');
    await deny(q,s=>write(s,'set_graduation_candidate',candidate(own)),'42501');
    await deny(q,s=>s`select * from public.affairs_early_graduation_candidates`,'42501');
    await as(q,owner.id);
    const admin=await read(q,academicYear,semester);
    assert.equal(admin.userId,null);
    const initialWindowVersion=admin.window?.version??0;
    await deny(q,s=>write(s,'set_graduation_window',{...payload(initialWindowVersion),opens_at:iso(90000),closes_at:iso(0)}),'22023');
    const open={...payload(initialWindowVersion),opens_at:iso(-120000),closes_at:iso(120000)};
    const window=await write(q,'set_graduation_window',open);
    assert.equal(window.version,initialWindowVersion+1);
    assert.deepEqual(await write(q,'set_graduation_window',open),window);
    await deny(q,s=>write(s,'set_graduation_window',{...open,closes_at:iso(121000)}),'PT409');
    for(const id of [own,reviewStudent]){
      await as(q,id);
      await q`select public.affairs_initialize_account()`;
      await deny(q,s=>write(s,'submit_early_graduation',submit()),'PT409');
      await as(q,owner.id);
      const details=candidate(id);
      await deny(q,s=>write(s,'set_graduation_candidate',{...details,graduation_year:academicYear-1}),'22023');
      assert.equal((await write(q,'set_graduation_candidate',details)).version,1);
      assert.equal((await read(q,academicYear,semester,id)).candidate.user_id,id);
      await as(q,id);
      await deny(q,s=>write(s,'submit_early_graduation',{...submit(),user_id:other}),'22023');
      await deny(q,s=>write(s,'submit_early_graduation',submit(2)),'PT409');
      const request=submit(),application=await write(q,'submit_early_graduation',request);
      assert.equal(application.user_id,id);
      assert.equal(application.status,'submitted');
      assert.deepEqual(await write(q,'submit_early_graduation',request),application);
      assert.deepEqual((await read(q)).records,[application]);
    }
    await as(q,other);
    assert.deepEqual((await read(q)).records,[]);
    await deny(q,s=>write(s,'cancel_early_graduation',payload(1)),'PT409');
    await as(q,own);
    await deny(q,s=>write(s,'review_early_graduation',{...payload(1),user_id:own,decision:'approved'}),'42501');
    const cancellation=payload(1);
    const cancelled=await write(q,'cancel_early_graduation',cancellation);
    assert.equal(cancelled.status,'cancelled');
    assert.equal(cancelled.version,2);
    await deny(q,s=>write(s,'submit_early_graduation',submit()),'PT409');
    await as(q,owner.id);
    await write(q,'set_graduation_window',{...payload(window.version),opens_at:iso(-120000),closes_at:iso(-60000)});
    const review={...payload(1),user_id:reviewStudent,decision:'approved'};
    const approved=await write(q,'review_early_graduation',review);
    assert.equal(approved.status,'approved');
    assert.deepEqual(await write(q,'review_early_graduation',review),approved);
    await as(q,own);
    assert.deepEqual(await write(q,'cancel_early_graduation',cancellation),cancelled);
    await deny(q,s=>write(s,'cancel_early_graduation',payload(2)),'PT409');
    await as(q,reviewStudent);
    assert.deepEqual((await read(q)).records,[approved]);
    assert.equal((await read(q)).state,'closed');
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Exact-client rollback passed: application window, eligibility, submission, cancellation, review, replay, account isolation and cleanup.');
}finally{
  try{await lease?.release();}finally{await pool.end({timeout:5});}
}

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
const ddl=await readFile('supabase/migrations/20261114150000_graduation_clearance.sql','utf8');
const students=Array.from({length:4},()=>randomUUID()),[own,other,nonGoogle,reviewStudent]=students;
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const read=async(q,view='student',term=null,student=null)=>(await q`
  select public.affairs_read_graduation_clearance(${view},${term},${student}) as data`)[0].data;
const write=async(q,kind,body)=>(await q`select public.affairs_change_graduation_clearance(${kind},${q.json(body)}) as row`)[0].row;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,id,role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
const fingerprint=async q=>(await q`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${config.supabase.ownerEmail})) as owner,
  (select count(*)::int from auth.users where id=any(${students}::uuid[])) as fixtures,
  to_regclass('public.affairs_clearance_applications') is null as absent`)[0];
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
      const email='graduation-clearance-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
    }
    const term=randomUUID();
    await q`insert into public.affairs_terms(id,code,label,starts_on,ends_on)
      values(${term},${'QA-'+term},'Clearance QA term',current_date-1,current_date+1)`;
    await q`insert into public.affairs_profiles(user_id,email,display_name)
      select id,email,'QA candidate' from auth.users where id=any(${[own,reviewStudent]}::uuid[]) on conflict(user_id) do nothing`;
    const now=Date.now(),iso=offset=>new Date(now+offset).toISOString();
    const keyed=body=>({...body,request_id:randomUUID()});
    const period=keyed({term_id:term,opens_at:iso(-300000),closes_at:iso(300000),expected_version:0});
    const candidate=keyed({term_id:term,user_id:own,track:'graduate',international:true,expected_version:0});
    const submit=keyed({term_id:term,period_version:1,candidate_version:1,acknowledged:true});
    await as(q,'','anon');await deny(q,read,'42501');
    await as(q,nonGoogle);await deny(q,read,'42501');
    await as(q,other);
    assert.deepEqual((await read(q)).periods,[]);
    await deny(q,s=>read(s,'manage',term,own),'42501');
    await deny(q,s=>write(s,'set_clearance_period',period),'42501');
    await as(q,owner.id);
    assert.equal((await write(q,'set_clearance_period',period)).version,1);
    assert.equal((await write(q,'set_clearance_period',period)).version,1);
    await deny(q,s=>write(s,'set_clearance_period',keyed(period)),'PT409');
    assert.equal((await write(q,'set_clearance_candidate',candidate)).version,1);
    await write(q,'set_clearance_candidate',keyed({...candidate,user_id:reviewStudent,track:'undergraduate',international:false}));
    const manager=await read(q,'manage',term,own);
    assert.equal(manager.periods[0].candidate.track,'graduate');
    assert.equal(manager.targetId,own);
    await as(q,other);
    await deny(q,s=>write(s,'submit_graduation_clearance',submit),'42501');
    await as(q,own);
    await deny(q,s=>read(s,'student',term,other),'22023');
    await deny(q,s=>write(s,'submit_graduation_clearance',{...submit,acknowledged:false}),'22023');
    await deny(q,s=>write(s,'submit_graduation_clearance',{...submit,period_version:2}),'PT409');
    await deny(q,s=>write(s,'submit_graduation_clearance',{...submit,user_id:other}),'22023');
    assert.equal((await read(q)).periods[0].candidate.international,true);
    const first=await write(q,'submit_graduation_clearance',submit);
    assert.deepEqual(await write(q,'submit_graduation_clearance',submit),first);
    await deny(q,s=>write(s,'submit_graduation_clearance',keyed(submit)),'PT409');
    assert.equal((await read(q)).applications[0].reviews.length,8);
    const review=keyed({application_id:first.id,office:'library',decision:'action_required',note:'Return the borrowed item',expected_version:1});
    await deny(q,s=>write(s,'review_clearance_office',review),'42501');
    await deny(q,s=>s`select * from public.affairs_clearance_reviews`,'42501');
    await as(q,reviewStudent);
    assert.deepEqual((await read(q)).applications,[]);
    await write(q,'submit_graduation_clearance',keyed(submit));
    assert.equal((await read(q)).applications[0].reviews.length,5);
    await as(q,owner.id);
    await deny(q,s=>write(s,'set_clearance_candidate',keyed({...candidate,expected_version:1})),'PT409');
    await deny(q,s=>write(s,'review_clearance_office',{...review,note:''}),'22023');
    const decision=await write(q,'review_clearance_office',review);
    assert.deepEqual(await write(q,'review_clearance_office',review),decision);
    await deny(q,s=>write(s,'review_clearance_office',keyed(review)),'PT409');
    const second=keyed({...review,decision:'cleared',expected_version:2,note:''});
    await write(q,'review_clearance_office',second);
    await as(q,own);
    const saved=(await read(q)).applications[0];
    assert.equal(saved.reviews.find(row=>row.office==='library').status,'cleared');
    assert.equal(saved.reviews.filter(row=>row.status==='pending').length,7);
    await as(q,other);
    assert.deepEqual((await read(q)).applications,[]);
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Graduation clearance rollback passed: term window, applicant restrictions, applicable offices, versioned review, retry, and isolation.');
}finally{
  try{await lease?.release();}finally{await pool.end({timeout:5});}
}

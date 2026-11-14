import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--rollback-preflight','--deployed','--catalog-preflight','--catalog-deployed','--outline-preflight','--outline-deployed'].includes(mode)&&!extra.length);
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const deployment=JSON.parse(await readFile('deployment.json','utf8'));
const expansion=await readFile('supabase/migrations/20261115020000_elearning_catalog.sql','utf8');
const outlineMigration=await readFile('supabase/migrations/20261115030000_elearning_course_outlines.sql','utf8');
const ddl=await readFile('supabase/migrations/20261115010000_remote_learning.sql','utf8');
const accounts=Array.from({length:3},()=>randomUUID()),[student,other,nonGoogle]=accounts;
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
async function state(q){
  return (await q`select
    (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${deployment.supabase.ownerEmail})) as owner,
    (select count(*)::int from auth.users where id=any(${accounts}::uuid[])) as fixtures,
    to_regclass('public.elearning_enrollments') is null as absent`)[0];
}
async function as(q,account,role='authenticated'){
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${account},true)`;
}
const read=async q=>(await q`select public.elearning_workspace() as response`)[0].response;
const join=async(q,id)=>(await q`select public.elearning_join(${id}) as response`)[0].response;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);

try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await state(lease.sql);
  const outlineMode=mode.startsWith('--outline-');
  const catalogMode=mode.startsWith('--catalog-')||outlineMode;
  const observe=async q=>(await q`select
    count(*)::int as courses,
    (select count(*)::int from public.elearning_categories) as categories,
    (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.user_id,e.course_id)::text,'')) from public.elearning_enrollments e) as enrollments,
    (select to_regprocedure('public.elearning_catalog(integer,text,integer,integer)') is not null) as expanded
    from public.elearning_courses`)[0];
  const beforeCatalog=catalogMode?await observe(lease.sql):null;
  if(catalogMode)assert.equal(beforeCatalog.expanded,mode==='--catalog-deployed'||outlineMode);
  const outlineInstalled=async q=>(await q`select to_regprocedure('public.elearning_course_outline(integer)') is not null as present`)[0].present;
  if(outlineMode)assert.equal(await outlineInstalled(lease.sql),mode==='--outline-deployed');
  assert.ok(before.owner&&before.fixtures===0);
  assert.equal(before.absent,mode==='--rollback-preflight');
  await lease.rollbackOnly(async q=>{
    if(before.absent)await q.unsafe(ddl);
    if(mode==='--catalog-preflight')await q.unsafe(expansion);
    if(mode==='--outline-preflight')await q.unsafe(outlineMigration);
    for(const id of accounts){
      const email='elearning-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
    }
    const find=async (q,category=null,term='',page=1,course=null)=>
      (await q`select public.elearning_catalog(${category}::integer,${term},${page}::integer,${course}::integer) as response`)[0].response;
    const outline=async(q,id)=>(await q`select public.elearning_course_outline(${id}::integer) as response`)[0].response;
    await as(q,'','anon');
    if(outlineMode)await deny(q,s=>outline(s,9408),'42501');
    await deny(q,read,'42501');
    if(catalogMode)await deny(q,find,'42501');
    await deny(q,s=>join(s,9718),'42501');
    await as(q,nonGoogle);
    if(outlineMode)await deny(q,s=>outline(s,9408),'42501');
    assert.equal(await read(q),null);
    if(catalogMode)await deny(q,find,'42501');
    await deny(q,s=>join(s,9718),'42501');
    await as(q,student);
    await deny(q,s=>s`select * from public.elearning_enrollments`,'42501');
    await deny(q,s=>s`insert into public.elearning_enrollments(user_id,course_id) values(${other},9718)`,'42501');
    const catalog=await read(q);
    assert.equal(catalog.userId,student);
    assert.equal(catalog.categories.length,catalogMode?43:34);
    assert.equal(catalog.courses.length,20);
    assert.equal(catalog.notices.length,20);
    assert.deepEqual(catalog.enrollments,[]);
    assert.ok(catalog.notices.find(row=>row.id===325504).local_body.includes('TronClass'));
    if(outlineMode){
      await deny(q,s=>outline(s,null),'22023');
      await deny(q,s=>s`select * from public.elearning_activities`,'42501');
      await deny(q,s=>s`insert into public.elearning_course_access(course_id,user_id) values(9408,${student})`,'42501');
      assert.deepEqual(await outline(q,9408),{userId:student,courseId:9408,sections:[]});
      await q.unsafe('reset role');
      await q`insert into public.elearning_course_access(course_id,user_id) values(9408,${student}),(9098,${student})`;
      await as(q,student);
      const first=await outline(q,9408),second=await outline(q,9098);
      assert.deepEqual(first.sections.map(s=>s.activities.map(a=>a.id)),[[293399,293395,293396,293397,293398]]);
      assert.deepEqual(second.sections.map(s=>[s.title,s.activities.length]),[['課程主題',11],['課程回饋',1]]);
      await as(q,other);
      assert.deepEqual(await outline(q,9408),{userId:other,courseId:9408,sections:[]});
      await as(q,student);
    }
    if(catalogMode){
      const all=await find(q);
      assert.equal(all.userId,student);
      assert.equal(all.courses.length,20);
      assert.equal(all.total,3291);
      const firstPage=await find(q,28),lastPage=await find(q,28,'',46);
      assert.equal(firstPage.total,907);
      assert.equal(firstPage.courses.length,20);
      assert.equal(lastPage.courses.length,7);
      assert.ok(lastPage.courses.every(row=>row.category_id===28&&!row.self_enroll));
      assert.equal(new Set([...firstPage.courses,...lastPage.courses].map(row=>row.id)).size,27);
      assert.deepEqual((await find(q,28,'',47)).courses,[]);
      assert.equal((await find(q,49)).total,0);
      const named=await find(q,18,'教育訓練影片 2025');
      assert.equal(named.courses[0].id,10891);
      assert.deepEqual((await find(q,null,'％')).courses,[]);
      const detail=await find(q,null,'',1,9718);
      assert.equal(detail.total,1);
      assert.equal(detail.courses[0].self_enroll,true);
      await deny(q,s=>find(s,null,'',0),'22023');
      await deny(q,s=>find(s,41,'',1,9718),'22023');
    }
    await deny(q,s=>join(s,10582),'PT404');
    await deny(q,s=>join(s,null),'PT404');
    const receipt=await join(q,9718);
    assert.equal(receipt.courseId,9718);
    assert.ok(Number.isFinite(Date.parse(receipt.joinedAt)));
    assert.deepEqual(await join(q,9718),receipt);
    assert.deepEqual((await read(q)).enrollments,[receipt]);
    await as(q,other);
    assert.deepEqual((await read(q)).enrollments,[]);
    await as(q,student);
    assert.deepEqual((await read(q)).enrollments,[receipt]);
    await q.unsafe('reset role');
    assert.equal((await q`select count(*)::int as n from public.dtm_courses where user_id=any(${accounts}::uuid[])`)[0].n,0);
  });
  assert.deepEqual(await state(lease.sql),before);
  if(catalogMode)assert.deepEqual(await observe(lease.sql),beforeCatalog);
  if(outlineMode)assert.equal(await outlineInstalled(lease.sql),mode==='--outline-deployed');
  console.log('Remote-learning catalog, private enrollment, repeat requests, DTM separation and exact rollback verified.');
}finally{
  try{if(lease&&!lease.lost)await lease.release();}finally{await pool.end({timeout:3});}
}

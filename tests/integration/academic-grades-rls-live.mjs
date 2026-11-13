import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';

const env=deploymentEnvironment(),deployment=JSON.parse(await readFile('deployment.json','utf8'));
const connection=env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
let target;
try{target=new URL(connection);}catch{throw new Error('The client database connection is unavailable.');}
const project=deployment.supabase.projectRef;
assert.equal(project,'xiftudmvxphxcjtmfmib','Use only the client checkout.');
assert.ok(target.hostname===`db.${project}.supabase.co` || target.hostname.endsWith('.pooler.supabase.com') && target.username.endsWith('.'+project),'Use only the exact client database.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const preflight=process.argv.includes('--preflight'),rollback=Symbol('rollback academic-grade fixtures');
const one=randomUUID(),two=randomUUID(),tables=['affairs_academic_grade_records','affairs_academic_term_summaries','affairs_academic_rankings','affairs_academic_metadata'];
const role=async(tx,id,initialize=false)=>{
  await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${id},true)`;
  if(initialize)await tx`select public.affairs_initialize_account()`;
};
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const save=async(tx,kind,payload)=>(await tx`select public.affairs_manage_academic_grades(${kind},${tx.json(payload)}) as result`)[0].result;
const operation=payload=>({...payload,request_id:randomUUID()});
const baseline=async tx=>(await tx`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select count(*)::int from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
let rolledBack=false,before;
try{
  before=await baseline(sql);
  if(preflight)assert.deepEqual(before,{migrations:121,rls_tables:132},'Review the client baseline before draft preflight.');
  await sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='8s'");await tx.unsafe("set local statement_timeout='20s'");
    if(preflight)await tx.unsafe(await readFile('supabase/migrations/20261112110000_academic_grade_records.sql','utf8'));
    // Use the existing verified administrator. Never initialize or mutate the
    // real owner's auth identity, profile, student record, or authorization.
    const [owner]=await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
      (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
      from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'An existing verified Google administrator is required; this test will not create or alter one.');
    for(const id of [one,two]){
      const email='academic-grade-qa-'+id+'@example.invalid';
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),
          '{"provider":"google","providers":["google"]}','{"full_name":"Synthetic Academic Grade QA"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider)
        values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
    }
    await role(tx,one,true);await role(tx,two,true);await role(tx,owner.id);
    const shared={user_id:one,expected_version:0,academic_year:115,semester:1};
    const fixtures=[
      {kind:'save_academic_grade_record',table:tables[0],payload:{...shared,record_kind:'transcript',course_title:'Synthetic transcript',category_text:'LOCAL-CATEGORY',module_name:'Synthetic module',required_elective_text:'選修',credits:0,grade_text:'棄選',row_order:0},
        edit:{course_title:'Synthetic transcript revised',category_text:null,module_name:'',required_elective_text:null,credits:null,grade_text:'0'},invalid:{course_code:null},unique:false},
      {kind:'save_academic_grade_record',table:tables[0],payload:{...shared,record_kind:'warning',course_code:'LOCAL-WARN',course_title:'Synthetic warning',credits:null,grade_text:'P',remark_text:'Synthetic remark',row_order:1},
        edit:{grade_text:'F',credits:0,remark_text:null},invalid:{category_text:null},unique:false},
      {kind:'save_academic_term_summary',table:tables[1],payload:{...shared,summary_kind:'transcript',earned_credits:7.25,average_grade_text:'0.00'},
        edit:{earned_credits:null,average_grade_text:''},invalid:{passed_credits:null},unique:true},
      {kind:'save_academic_term_summary',table:tables[1],payload:{...shared,summary_kind:'warning',attempted_credits:24,passed_credits:0,failed_credits:null},
        edit:{attempted_credits:null,passed_credits:null,failed_credits:0},invalid:{earned_credits:null},unique:true},
      {kind:'save_academic_ranking',table:tables[2],payload:{...shared,department_ranking_text:'2 / 40 (5.00%)',class_ranking_text:'0'},
        edit:{department_ranking_text:null,class_ranking_text:'Synthetic literal rank'},invalid:{grade_text:null},unique:true},
      {kind:'save_academic_metadata',table:tables[3],payload:{user_id:one,expected_version:0,class_label:'Synthetic class',english_requirement_text:'Synthetic display status'},
        edit:{class_label:null,english_requirement_text:''},invalid:{academic_year:115},unique:true},
    ].map(fixture=>({...fixture,payload:operation({...fixture.payload,id:randomUUID()}),foreignId:randomUUID()}));
    const exemplar=fixtures[0];
    await denied(tx,point=>save(point,null,exemplar.payload),'22023');
    for(const patch of [{id:null},{user_id:7},{request_id:'bad'},{expected_version:-1},{academic_year:0},{academic_year:10000},{semester:0},{semester:4},
      {record_kind:'current'},{course_title:''},{course_title:'x'.repeat(161)},{course_title:{private_identity:'DO-NOT-STORE'}},
      {category_text:'x'.repeat(161)},{module_name:'x'.repeat(161)},{required_elective_text:'x'.repeat(31)},
      {credits:-1},{credits:1000},{credits:'NaN'},{credits:'Infinity'},{credits:'3.456'},{credits:''},{credits:true},{grade_text:0},
      {grade_text:'x'.repeat(81)},{row_order:-1},{row_order:1000000},{row_order:1.5},{course_title:'x'.repeat(8001)}]){
      await denied(tx,point=>save(point,exemplar.kind,{...operation(exemplar.payload),...patch}),'22023');
    }
    for(const fixture of fixtures){
      const payload=fixture.payload;
      await denied(tx,point=>save(point,fixture.kind,{...payload,private_identity:'DO-NOT-STORE'}),'22023');
      await denied(tx,point=>save(point,fixture.kind,{...payload,...fixture.invalid}),'22023');
      await denied(tx,point=>save(point,fixture.kind,{...payload,user_id:randomUUID()}));
      const first=await save(tx,fixture.kind,payload);assert.equal(first.version,1);assert.deepEqual(await save(tx,fixture.kind,payload),first);
      await denied(tx,point=>save(point,fixture.kind,operation(payload)),'PT409');
      const [initial]=await tx`select * from ${tx('public.'+fixture.table)} where id=${payload.id}`;
      assert.equal(initial.user_id,one);assert.equal(initial.source_mode,'local_demo');
      for(const field of ['credits','earned_credits','attempted_credits','passed_credits','failed_credits'])if(field in payload)
        assert.equal(initial[field]===null?null:Number(initial[field]),payload[field]);
      for(const field of ['grade_text','average_grade_text','department_ranking_text','class_ranking_text','english_requirement_text'])if(field in payload)
        assert.equal(initial[field],payload[field]);
      const edit=operation({...payload,...fixture.edit,expected_version:1});
      assert.equal((await save(tx,fixture.kind,edit)).version,2);assert.deepEqual(await save(tx,fixture.kind,payload),first,'Late replay must not overwrite a newer version.');
      const [after]=await tx`select * from ${tx('public.'+fixture.table)} where id=${payload.id}`;
      assert.equal(after.version,2);
      for(const [field,value] of Object.entries(fixture.edit))assert.equal(after[field]===null?null:typeof value==='number'?Number(after[field]):after[field],value===''?null:value);
      await denied(tx,point=>save(point,fixture.kind,{...edit,expected_version:2}),'PT409');
      await denied(tx,point=>save(point,fixture.kind,operation({...edit,expected_version:1})),'PT409');
      await denied(tx,point=>save(point,fixture.kind,operation({...edit,expected_version:2,user_id:two})));
      if(fixture.unique)await denied(tx,point=>save(point,fixture.kind,operation({...payload,id:randomUUID()})),'PT409');
      await save(tx,fixture.kind,operation({...payload,id:fixture.foreignId,user_id:two}));
      await denied(tx,point=>point`update ${point('public.'+fixture.table)} set version=99 where id=${payload.id}`);
    }
    // A valid payload for the other subview cannot repurpose an existing row ID.
    await denied(tx,point=>save(point,'save_academic_grade_record',operation({...fixtures[1].payload,id:fixtures[0].payload.id,expected_version:2})),'22023');
    await denied(tx,point=>save(point,'save_academic_term_summary',operation({...fixtures[3].payload,id:fixtures[2].payload.id,expected_version:2})),'22023');
    for(const [fixture,patch] of [[fixtures[2],{earned_credits:10000}],[fixtures[2],{average_grade_text:0}],
      [fixtures[3],{attempted_credits:'NaN'}],[fixtures[3],{passed_credits:-1}],[fixtures[3],{failed_credits:1.111}],
      [fixtures[4],{department_ranking_text:'x'.repeat(161)}],[fixtures[5],{class_label:'x'.repeat(81)}],[fixtures[5],{english_requirement_text:'x'.repeat(301)}]])
      await denied(tx,point=>save(point,fixture.kind,operation({...fixture.payload,...patch,expected_version:2})),'22023');
    await role(tx,one);
    for(const fixture of fixtures){
      const visible=await tx`select id from ${tx('public.'+fixture.table)} where id in (${fixture.payload.id},${fixture.foreignId})`;
      assert.deepEqual(visible.map(row=>row.id),[fixture.payload.id]);
      await denied(tx,point=>save(point,fixture.kind,operation({...fixture.payload,expected_version:2})));
      await denied(tx,point=>point`update ${point('public.'+fixture.table)} set version=99 where id=${fixture.payload.id}`);
      await denied(tx,point=>point`delete from ${point('public.'+fixture.table)} where id=${fixture.payload.id}`);
      await denied(tx,point=>point`insert into ${point('public.'+fixture.table)}(id,user_id) values(${randomUUID()},${one})`);
    }
    await denied(tx,point=>point`select request_id from private.affairs_academic_grade_operations`);
    await role(tx,two);
    for(const fixture of fixtures){
      const visible=await tx`select id from ${tx('public.'+fixture.table)} where id in (${fixture.payload.id},${fixture.foreignId})`;
      assert.deepEqual(visible.map(row=>row.id),[fixture.foreignId]);
    }
    await role(tx,owner.id);
    for(const fixture of fixtures)assert.equal((await tx`select id from ${tx('public.'+fixture.table)} where id in (${fixture.payload.id},${fixture.foreignId})`).length,2);
    await denied(tx,point=>point`select request_id from private.affairs_academic_grade_operations`);
    await tx.unsafe('set local role anon');await tx`select set_config('request.jwt.claim.sub','',true)`;
    for(const table of tables)await denied(tx,point=>point`select id from ${point('public.'+table)}`);
    await denied(tx,point=>save(point,exemplar.kind,exemplar.payload));await tx.unsafe('reset role');
    for(const fixture of fixtures){
      const [audit]=await tx`select count(*)::int as n from public.affairs_agent_audit where target_id=${fixture.payload.id} and action_kind=${fixture.kind}`;
      const [receipts]=await tx`select count(*)::int as n from private.affairs_academic_grade_operations where payload->>'id'=${fixture.payload.id}`;
      assert.equal(audit.n,2);assert.equal(receipts.n,2);
    }
    assert.equal((await tx`select request_id from private.affairs_academic_grade_operations where payload::text like '%DO-NOT-STORE%'`).length,0);
    const [ownerAfter]=await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
      (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
      from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${owner.id}`;
    assert.deepEqual(ownerAfter,owner,'Existing owner auth, identities and profile must remain unchanged.');
    throw rollback;
  });
}catch(error){if(error!==rollback)throw error;rolledBack=true;}
finally{
  try{
    if(rolledBack){
      assert.equal((await sql`select id from auth.users where id in (${one},${two})`).length,0,'Synthetic accounts must have rolled back.');
      if(preflight)for(const table of tables)assert.equal((await sql`select to_regclass(${'public.'+table}) as name`)[0].name,null,'Draft tables must have rolled back.');
      assert.deepEqual(await baseline(sql),before,'Migration and public RLS counts must be restored.');
      console.log(`Academic grades passed: baseline ${before.migrations} migrations/${before.rls_tables} public RLS tables; four owner-scoped collections, literal values and null/zero, strict per-kind fields/ranges, immutable owner/kind, exact/late receipts, stale and uniqueness conflicts, direct/student/anonymous denial, exact audit counts, private receipt denial and unchanged owner identity. Draft migration and synthetic fixtures rolled back.`);
    }
  }finally{await sql.end({timeout:5});}
}

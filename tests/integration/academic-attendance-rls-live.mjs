import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {academicAttendancePayloadBytes,validateAcademicAttendancePayload} from '../../server/academicAttendance.js';

// Requires the serialized client database lease. All fixture changes roll back;
// --preflight also rolls back this draft migration and verifies the baseline.
const preflight=process.argv.includes('--preflight');
const argument=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const expectedMigrations=Number(argument('--expected-migrations')),expectedRls=Number(argument('--expected-rls'));
if(preflight)assert.ok(Number.isInteger(expectedMigrations) && expectedMigrations>0 && Number.isInteger(expectedRls) && expectedRls>0,
  'Preflight requires reviewed --expected-migrations=N --expected-rls=N counts.');
const deployment=JSON.parse(await readFile('deployment.json','utf8')),env=deploymentEnvironment();
const connection=env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
let target;
try{target=new URL(connection);}catch{throw new Error('The client database connection is unavailable.');}
const project=deployment.supabase.projectRef;
assert.equal(project,'xiftudmvxphxcjtmfmib','Use only the client checkout.');
assert.ok(target.hostname===`db.${project}.supabase.co` || target.hostname.endsWith('.pooler.supabase.com') && target.username.endsWith('.'+project),
  'Use only the exact client database.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const one=randomUUID(),two=randomUUID(),tables=['affairs_academic_attendance_statistics','affairs_academic_attendance_details','affairs_academic_attendance_metadata'];
const rollback=Symbol('rollback attendance fixtures');
const role=async(tx,id,initialize=false)=>{
  await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${id},true)`;
  if(initialize)await tx`select public.affairs_initialize_account()`;
};
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const save=async(tx,kind,payload)=>(await tx`select public.affairs_manage_academic_attendance(${kind},${tx.json(payload)}) as result`)[0].result;
const operation=payload=>({...payload,request_id:randomUUID()});
const baseline=async tx=>(await tx`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select count(*)::int from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
const ownerFingerprint=async(tx,id)=>(await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
  from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
const common={user_id:one,expected_version:0},term={academic_year:115,semester:1,course_code:'LOCAL-ATTEND-QA',course_title:'Synthetic attendance course',row_order:0};
const fixtures=[
  {kind:'save_academic_attendance_statistic',table:tables[0],payload:{...common,...term,student_number:null,student_name:null,total_teaching_hours:54,
    current_teaching_weeks:7.5,current_teaching_hours:22.5,absence_hours:0,unexcused_absence_hours:null},
    edit:{student_name:'',absence_hours:null,unexcused_absence_hours:0},unique:true,forbidden:{teacher_name:null}},
  {kind:'save_academic_attendance_detail',table:tables[1],payload:{...common,...term,teacher_name:'Synthetic teacher',absence_type_text:'Synthetic literal category',
    course_date:'2026-11-13',period_text:'A–B',roll_called_at:'2026-11-13T08:30:00.123456+08:00'},
    edit:{teacher_name:'',absence_type_text:null,course_date:null,period_text:'',roll_called_at:null},unique:false,forbidden:{absence_hours:null}},
  {kind:'save_academic_attendance_metadata',table:tables[2],payload:{...common,current_academic_year:115,current_semester:1},
    edit:{current_academic_year:null,current_semester:null},unique:true,forbidden:{academic_year:115}},
].map(fixture=>({...fixture,payload:operation({...fixture.payload,id:randomUUID()}),foreignId:randomUUID()}));
let before,owner,rolledBack=false;
try{
  before=await baseline(sql);
  if(preflight)assert.deepEqual(before,{migrations:expectedMigrations,rls_tables:expectedRls},'Review the client baseline before draft preflight.');
  await sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='8s'");await tx.unsafe("set local statement_timeout='20s'");
    if(preflight){
      for(const table of tables)assert.equal((await tx`select to_regclass(${'public.'+table}) as name`)[0].name,null);
      await tx.unsafe(await readFile('supabase/migrations/20261112140000_academic_attendance.sql','utf8'));
      assert.equal((await baseline(tx)).rls_tables,before.rls_tables+3);
    }
    const [administrator]=await tx`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator,'An existing verified Google administrator is required; this test never creates or alters one.');
    owner=await ownerFingerprint(tx,administrator.id);
    for(const id of [one,two]){
      const email=`academic-attendance-qa-${id}@example.invalid`;
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),
          '{"provider":"google","providers":["google"]}','{"full_name":"Synthetic Attendance QA"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider)
        values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
    }
    const invalid=[];
    for(const kind of ['__proto__','constructor','prototype','toString','valueOf','hasOwnProperty','unknown_kind','',null])
      invalid.push({kind,payload:fixtures[0].payload,label:`unsupported operation kind: ${String(kind)}`});
    for(const fixture of fixtures){
      for(const key of Object.keys(fixture.payload)){
        const payload={...fixture.payload};delete payload[key];invalid.push({kind:fixture.kind,payload,label:`missing ${key}`});
      }
      for(const patch of [{privateIdentity:'DO-NOT-STORE'},fixture.forbidden,{source_mode:'official'},{expected_version:'0'},{expected_version:-1},{request_id:'bad'},{user_id:null}])
        invalid.push({kind:fixture.kind,payload:{...fixture.payload,...patch},label:'unsupported or invalid envelope'});
    }
    for(const patch of [{absence_hours:-1},{absence_hours:10000},{absence_hours:0.001},{absence_hours:'0'},{current_teaching_weeks:true},{semester:12},
      {academic_year:10000},{row_order:1.5},{student_number:'x'.repeat(81)},{student_name:'x'.repeat(161)},{course_title:' \t\n\u00a0'},{course_title:'x'.repeat(8001)}])
      invalid.push({kind:fixtures[0].kind,payload:{...fixtures[0].payload,...patch},label:'invalid statistic'});
    for(const patch of [{course_date:'2026-02-29'},{course_date:'1900-02-29'},{course_date:'2026-04-31'},{course_date:'0000-01-01'},
      {course_date:'2026-11-13T00:00:00Z'},{roll_called_at:'2026-02-29T00:00:00Z'},{roll_called_at:'2026-11-13T24:00:00Z'},
      {roll_called_at:'2026-11-13T00:00:00'},{roll_called_at:'2026-11-13T00:00:00+16:00'},{period_text:'x'.repeat(81)},{teacher_name:'x'.repeat(161)}])
      invalid.push({kind:fixtures[1].kind,payload:{...fixtures[1].payload,...patch},label:'invalid detail date or text'});
    for(const patch of [{current_academic_year:null},{current_semester:null},{current_academic_year:0},{current_semester:12}])
      invalid.push({kind:fixtures[2].kind,payload:{...fixtures[2].payload,...patch},label:'invalid current term pair'});
    const valid=fixtures.map(fixture=>({kind:fixture.kind,payload:fixture.payload}));
    valid.push({kind:fixtures[1].kind,payload:{...fixtures[1].payload,course_title:'😀'.repeat(160),course_date:'2024-02-29',roll_called_at:'2024-02-29T23:59:59.123456Z'}});
    valid.push({kind:fixtures[0].kind,payload:{...fixtures[0].payload,absence_hours:9999.99}});
    valid.push({kind:fixtures[2].kind,payload:{...fixtures[2].payload,current_academic_year:null,current_semester:null}});
    for(const fixture of valid){
      assert.equal(validateAcademicAttendancePayload(fixture.kind,fixture.payload),null);
      assert.equal((await tx`select private.affairs_attendance_payload_valid(${fixture.kind},${tx.json(fixture.payload)}) as ok`)[0].ok,true);
      assert.equal((await tx`select octet_length(${tx.json(fixture.payload)}::jsonb::text) as bytes`)[0].bytes,academicAttendancePayloadBytes(fixture.payload));
    }
    for(const fixture of invalid){
      assert.ok(validateAcademicAttendancePayload(fixture.kind,fixture.payload),fixture.label);
      assert.equal((await tx`select private.affairs_attendance_payload_valid(${fixture.kind},${tx.json(fixture.payload)}) as ok`)[0].ok,false,fixture.label);
    }
    await role(tx,one,true);await role(tx,two,true);await role(tx,owner.id);
    for(const fixture of invalid)await denied(tx,point=>save(point,fixture.kind,fixture.payload),'22023');
    await denied(tx,point=>save(point,null,fixtures[0].payload),'22023');
    for(const fixture of fixtures){
      const payload=fixture.payload;
      await denied(tx,point=>save(point,fixture.kind,operation({...payload,user_id:randomUUID()})));
      const first=await save(tx,fixture.kind,payload);assert.equal(first.version,1);assert.deepEqual(await save(tx,fixture.kind,payload),first);
      await denied(tx,point=>save(point,fixture.kind,operation(payload)),'PT409');
      const [initial]=await tx`select to_jsonb(r) as record from ${tx('public.'+fixture.table)} r where id=${payload.id}`;
      assert.equal(initial.record.user_id,one);assert.equal(initial.record.source_mode,'local_demo');
      for(const [field,value] of Object.entries(payload)){
        if(['request_id','expected_version'].includes(field))continue;
        if(field==='roll_called_at' && value!==null){
          assert.equal(new Date(initial.record[field]).toISOString(),new Date(value).toISOString());
          assert.match(initial.record[field],/\.123456(?:[+-]|Z)/,'PostgreSQL must retain all six microsecond digits.');
        }
        else assert.equal(initial.record[field],value);
      }
      const edit=operation({...payload,...fixture.edit,expected_version:1});assert.equal((await save(tx,fixture.kind,edit)).version,2);
      assert.deepEqual(await save(tx,fixture.kind,payload),first,'Late replay must not overwrite newer attendance data.');
      const [after]=await tx`select to_jsonb(r) as record from ${tx('public.'+fixture.table)} r where id=${payload.id}`;
      assert.equal(after.record.version,2);for(const [field,value] of Object.entries(fixture.edit))assert.equal(after.record[field],value);
      await denied(tx,point=>save(point,fixture.kind,{...edit,expected_version:2}),'PT409');
      await denied(tx,point=>save(point,fixture.kind,operation(edit)),'PT409');
      await denied(tx,point=>save(point,fixture.kind,operation({...edit,expected_version:2,user_id:two})));
      if(fixture.unique)await denied(tx,point=>save(point,fixture.kind,operation({...payload,id:randomUUID()})),'PT409');
      await save(tx,fixture.kind,operation({...payload,id:fixture.foreignId,user_id:two}));
      await denied(tx,point=>point`update ${point('public.'+fixture.table)} set version=99 where id=${payload.id}`);
    }
    // Same date/period can have separate explicit roll-call records; statistics
    // remain unchanged and are never recalculated from these details.
    const duplicateDetail=operation({...fixtures[1].payload,id:randomUUID()});await save(tx,fixtures[1].kind,duplicateDetail);
    const olderStatistic=operation({...fixtures[0].payload,id:randomUUID(),academic_year:114});await save(tx,fixtures[0].kind,olderStatistic);
    await role(tx,one);
    assert.deepEqual((await tx`select id from public.affairs_academic_attendance_statistics where user_id=${one} order by academic_year desc,semester desc,row_order,id limit 1`).map(row=>row.id),[fixtures[0].payload.id]);
    assert.deepEqual((await tx`select id from public.affairs_academic_attendance_statistics where user_id=${one} order by academic_year desc,semester desc,row_order,id offset 1 limit 1`).map(row=>row.id),[olderStatistic.id]);
    const [unchanged]=await tx`select absence_hours,unexcused_absence_hours from public.affairs_academic_attendance_statistics where id=${fixtures[0].payload.id}`;
    assert.equal(unchanged.absence_hours,null);assert.equal(Number(unchanged.unexcused_absence_hours),0);
    for(const [account,mine,foreign] of [[one,'payload','foreignId'],[two,'foreignId','payload']]){
      await role(tx,account);
      for(const fixture of fixtures){
        const ownId=mine==='payload'?fixture.payload.id:fixture.foreignId,otherId=foreign==='payload'?fixture.payload.id:fixture.foreignId;
        assert.deepEqual((await tx`select id from ${tx('public.'+fixture.table)} where id in (${ownId},${otherId})`).map(row=>row.id),[ownId]);
        await denied(tx,point=>save(point,fixture.kind,operation({...fixture.payload,expected_version:2})));
        await denied(tx,point=>point`update ${point('public.'+fixture.table)} set version=99 where id=${ownId}`);
        await denied(tx,point=>point`delete from ${point('public.'+fixture.table)} where id=${ownId}`);
        await denied(tx,point=>point`insert into ${point('public.'+fixture.table)}(id,user_id) values(${randomUUID()},${account})`);
      }
      await denied(tx,point=>point`select request_id from private.affairs_academic_attendance_operations`);
    }
    await role(tx,owner.id);
    for(const fixture of fixtures)assert.equal((await tx`select id from ${tx('public.'+fixture.table)} where id in (${fixture.payload.id},${fixture.foreignId})`).length,2);
    await denied(tx,point=>point`select request_id from private.affairs_academic_attendance_operations`);
    await tx.unsafe('set local role anon');await tx`select set_config('request.jwt.claim.sub','',true)`;
    for(const table of tables)await denied(tx,point=>point`select id from ${point('public.'+table)}`);
    await denied(tx,point=>save(point,fixtures[0].kind,fixtures[0].payload));await tx.unsafe('reset role');
    for(const fixture of fixtures){
      assert.equal((await tx`select count(*)::int as n from public.affairs_agent_audit where target_id=${fixture.payload.id} and action_kind=${fixture.kind}`)[0].n,2);
      assert.equal((await tx`select count(*)::int as n from private.affairs_academic_attendance_operations where payload->>'id'=${fixture.payload.id}`)[0].n,2);
    }
    assert.equal((await tx`select count(*)::int as n from private.affairs_academic_attendance_operations where payload::text like '%DO-NOT-STORE%'`)[0].n,0);
    assert.deepEqual(await ownerFingerprint(tx,owner.id),owner,'Existing owner auth/profile/provider identities must remain unchanged.');
    throw rollback;
  });
}catch(error){if(error!==rollback)throw error;rolledBack=true;}
finally{
  try{
    if(rolledBack){
      assert.equal((await sql`select id from auth.users where id in (${one},${two})`).length,0);
      assert.equal((await sql`select user_id from public.affairs_profiles where user_id in (${one},${two})`).length,0);
      if(preflight){for(const table of tables)assert.equal((await sql`select to_regclass(${'public.'+table}) as name`)[0].name,null);
        assert.equal((await sql`select to_regclass('private.affairs_academic_attendance_operations') as name`)[0].name,null);}
      assert.deepEqual(await baseline(sql),before);assert.deepEqual(await ownerFingerprint(sql,owner.id),owner);
      console.log(`Academic attendance passed: restored ${before.migrations} migrations/${before.rls_tables} public RLS tables; JS/SQL field/date/number parity, literal null/zero/blank values, explicit current-term clearing, independent details/statistics, scoped ordered reads, immutable owner, exact/late receipts, stale/uniqueness conflicts, private receipts, audit counts and direct/student/anonymous denial. Draft DDL and synthetic fixtures rolled back; existing owner unchanged. Parallel requests are not exercised by this single-connection test.`);
    }
  }finally{await sql.end({timeout:5});}
}

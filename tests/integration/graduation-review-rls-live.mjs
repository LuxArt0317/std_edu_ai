import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {graduationReviewPayloadBytes,validateGraduationReviewContent} from '../../server/graduationReview.js';

// Run only with the serialized client database test lease. --preflight applies
// the draft inside this transaction, then rolls back the DDL and every fixture.
const preflight=process.argv.includes('--preflight');
const argument=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const expectedMigrations=Number(argument('--expected-migrations')),expectedRls=Number(argument('--expected-rls'));
if(preflight)assert.ok(Number.isInteger(expectedMigrations) && expectedMigrations>0 && Number.isInteger(expectedRls) && expectedRls>0,
  'Preflight requires the reviewed --expected-migrations=N --expected-rls=N baseline.');
const env=deploymentEnvironment(),deployment=JSON.parse(await readFile('deployment.json','utf8'));
const connection=env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
let target;
try{target=new URL(connection);}catch{throw new Error('The client database connection is unavailable.');}
const project=deployment.supabase.projectRef;
assert.equal(project,'xiftudmvxphxcjtmfmib','Use only the client checkout.');
assert.ok(target.hostname===`db.${project}.supabase.co` || target.hostname.endsWith('.pooler.supabase.com') && target.username.endsWith('.'+project),
  'Use only the exact client database.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const one=randomUUID(),two=randomUUID(),kind='save_graduation_review',rollback=Symbol('rollback graduation-review fixtures');
const role=async(tx,id,initialize=false)=>{
  await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${id},true)`;
  if(initialize)await tx`select public.affairs_initialize_account()`;
};
const save=async(tx,payload,operationKind=kind)=>(await tx`select public.affairs_manage_graduation_review(${operationKind},${tx.json(payload)}) as result`)[0].result;
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const operation=payload=>({...payload,request_id:randomUUID()});
const baseline=async tx=>(await tx`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select count(*)::int from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
const ownerFingerprint=async(tx,id)=>(await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
  from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
const status=()=>({text:null,indicator:null});
const course=id=>({id,sequenceText:'1',title:'Synthetic local course',credits:0,requiredElectiveText:null,yearText:null,transferText:null});
const report=()=>({reportedAt:'2026-11-13T00:00:00+08:00',
  identity:{studentNumber:null,studentName:null,departmentName:null,yearText:null,enrollmentStatusText:null,curriculumCohortText:null,doubleMajorText:null,minorText:null},
  educationProgram:status(),foreignLanguageCompletion:status(),englishRequirement:{text:'Synthetic display only',indicator:'attention'},
  graduationReview:{text:'Synthetic reference, no eligibility calculation',indicator:null,note:null},
  languageRequirements:[{id:'language-one',label:'Synthetic language',status:status(),requiredCredits:12,matchedCredits:0,missingCredits:null}],
  categories:[{id:'category-one',label:'Synthetic category',requiredElectiveText:null,requiredCredits:20,completedCredits:7.25,matchedCredits:0,excludedCredits:null,
    status:status(),detailSubtotalCredits:99,requirements:[{id:'requirement-one',sequenceText:'1',title:'Synthetic required course',moduleText:null,credits:3,
      requiredElectiveText:null,yearText:null,transferText:null,indicator:null,matchedCourses:[course('matched-one')]}]}],
  otherCourses:[course('other-one')]});
const nestedTargets=value=>[value,value.identity,value.educationProgram,value.graduationReview,value.languageRequirements[0],value.languageRequirements[0].status,
  value.categories[0],value.categories[0].status,value.categories[0].requirements[0],value.categories[0].requirements[0].matchedCourses[0],value.otherCourses[0]];
const malformed=[];
const invalid=(label,mutate)=>{const value=report();mutate(value);malformed.push({label,value});};
for(let index=0;index<nestedTargets(report()).length;index++){
  invalid(`unknown key at depth ${index}`,value=>{nestedTargets(value)[index].privateIdentity='DO-NOT-STORE';});
  invalid(`missing key at depth ${index}`,value=>{const nested=nestedTargets(value)[index];delete nested[Object.keys(nested)[0]];});
}
for(const value of [-1,1000.01,0.001,1.111,'0','NaN','Infinity',false,{}])invalid(`invalid credit ${String(value)}`,item=>{item.otherCourses[0].credits=value;});
for(const value of ['2026-02-29T00:00:00Z','1900-02-29T00:00:00Z','2026-04-31T00:00:00Z','0000-01-01T00:00:00Z',
  '2026-01-01T00:00:00','2026-01-01T24:00:00Z','2026-01-01T00:00:00+16:00',''])invalid(`invalid timestamp ${value}`,item=>{item.reportedAt=value;});
for(const value of ['', ' \t\n\u00a0','x'.repeat(161)])invalid('invalid required title',item=>{item.otherCourses[0].title=value;});
for(const [key,limit] of [['sequenceText',30],['requiredElectiveText',30],['yearText',30],['transferText',80]])
  invalid(`overlong ${key}`,item=>{item.otherCourses[0][key]='x'.repeat(limit+1);});
invalid('overlong note',item=>{item.graduationReview.note='x'.repeat(1001);});
invalid('unknown indicator',item=>{item.graduationReview.indicator='eligible';});
invalid('duplicate IDs',item=>{item.otherCourses.push({...item.otherCourses[0]});});
invalid('bad ID',item=>{item.categories[0].id='bad id';});
invalid('language limit',item=>{item.languageRequirements=Array.from({length:101},(_,i)=>({...item.languageRequirements[0],id:`l${i}`}));});
invalid('category limit',item=>{item.categories=Array.from({length:101},(_,i)=>({...item.categories[0],id:`c${i}`,requirements:[]}));});
invalid('combined row limit',item=>{item.otherCourses=Array.from({length:999},(_,i)=>course(`r${i}`));});
let before,owner,rolledBack=false;
try{
  before=await baseline(sql);
  if(preflight)assert.deepEqual(before,{migrations:expectedMigrations,rls_tables:expectedRls},'Review the current client baseline before draft preflight.');
  await sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='8s'");await tx.unsafe("set local statement_timeout='20s'");
    if(preflight){
      assert.equal((await tx`select to_regclass('public.affairs_graduation_reviews') as name`)[0].name,null,'Draft table must not already exist.');
      await tx.unsafe(await readFile('supabase/migrations/20261112130000_graduation_review.sql','utf8'));
      assert.equal((await baseline(tx)).rls_tables,before.rls_tables+1);
    }
    const [administrator]=await tx`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator,'An existing verified Google administrator is required; this test never creates or alters one.');
    owner=await ownerFingerprint(tx,administrator.id);
    // These identities exist only inside the rollback transaction. Real account
    // metadata, profiles, roles and provider identities are never initialized.
    for(const id of [one,two]){
      const email=`graduation-review-qa-${id}@example.invalid`;
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),
          '{"provider":"google","providers":["google"]}','{"full_name":"Synthetic Graduation Review QA"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider)
        values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
    }
    // Cross-check browser validator with the actual SQL validator, including
    // code-point length and strict nested key handling, before authenticated RPCs.
    const valid=[report(),{...report(),reportedAt:null},{...report(),reportedAt:'2024-02-29T23:59:59.123456Z'}];
    valid[1].otherCourses[0].title='😀'.repeat(160);valid[1].otherCourses[0].credits=1000;valid[1].graduationReview.note='';
    for(const value of valid){
      assert.equal(validateGraduationReviewContent(value),null);
      assert.equal((await tx`select private.affairs_graduation_report_valid(${tx.json(value)}) as ok`)[0].ok,true);
      assert.equal((await tx`select octet_length(${tx.json(value)}::jsonb::text) as bytes`)[0].bytes,graduationReviewPayloadBytes(value));
    }
    for(const {label,value} of malformed){
      assert.ok(validateGraduationReviewContent(value),label);
      assert.equal((await tx`select private.affairs_graduation_report_valid(${tx.json(value)}) as ok`)[0].ok,false,label);
    }
    await role(tx,one,true);await role(tx,two,true);await role(tx,owner.id);
    const payload=operation({id:randomUUID(),user_id:one,report_kind:'academic_services',expected_version:0,report:report()});
    for(const patch of [{id:null},{user_id:7},{request_id:'bad'},{expected_version:-1},{expected_version:1.5},{expected_version:1000000000},
      {source_mode:'official'},{privateIdentity:'DO-NOT-STORE'}])await denied(tx,point=>save(point,{...payload,...patch}),'22023');
    for(const report_kind of [null,'','modern','academic-services','Academic_services','LEGACY',' legacy','legacy ',0,true,[],{}])
      await denied(tx,point=>save(point,{...payload,report_kind}),'22023');
    const missingKind={...payload};delete missingKind.report_kind;
    await denied(tx,point=>save(point,missingKind),'22023');
    await denied(tx,point=>save(point,payload,null),'22023');
    await denied(tx,point=>save(point,operation({...payload,user_id:randomUUID()})));
    for(const {value} of malformed)await denied(tx,point=>save(point,operation({...payload,report:value})),'22023');
    const first=await save(tx,payload);assert.equal(first.version,1);assert.equal(first.report_kind,'academic_services');assert.deepEqual(await save(tx,payload),first);
    await denied(tx,point=>save(point,operation(payload)),'PT409');
    await denied(tx,point=>save(point,{...payload,report_kind:'legacy'}),'PT409','A request ID cannot be replayed across report kinds.');
    await denied(tx,point=>save(point,operation({...payload,report_kind:'legacy',expected_version:1})),'22023');
    const [initial]=await tx`select * from public.affairs_graduation_reviews where id=${payload.id}`;
    assert.equal(initial.user_id,one);assert.equal(initial.report_kind,'academic_services');assert.equal(initial.source_mode,'local_demo');assert.deepEqual(initial.report,payload.report);
    // Even privileged writes cannot change identity, before any legacy slot is occupied.
    await tx.unsafe('reset role');
    await denied(tx,point=>point`update public.affairs_graduation_reviews set report_kind='legacy' where id=${payload.id}`,'22023');
    await denied(tx,point=>point`update public.affairs_graduation_reviews set user_id=${two} where id=${payload.id}`,'22023');
    await role(tx,owner.id);
    const legacyReport=report();legacyReport.graduationReview.text='Synthetic legacy report, independently maintained';legacyReport.categories[0].detailSubtotalCredits=0;
    const legacy=operation({...payload,id:randomUUID(),report_kind:'legacy',report:legacyReport});
    const legacyFirst=await save(tx,legacy);assert.equal(legacyFirst.version,1);assert.equal(legacyFirst.report_kind,'legacy');
    assert.deepEqual(await save(tx,legacy),legacyFirst);
    await denied(tx,point=>save(point,{...legacy,report_kind:'academic_services'}),'PT409');
    await denied(tx,point=>save(point,operation({...legacy,report_kind:'academic_services',expected_version:1})),'22023');
    await denied(tx,point=>save(point,operation(legacy)),'PT409');
    await denied(tx,point=>save(point,operation({...legacy,id:randomUUID()})),'PT409');
    const updated=report();updated.reportedAt=null;updated.otherCourses[0].credits=null;updated.graduationReview.note='';updated.languageRequirements[0].missingCredits=0;
    const edit=operation({...payload,expected_version:1,report:updated});assert.equal((await save(tx,edit)).version,2);
    assert.deepEqual(await save(tx,payload),first,'Late replay returns the original receipt without reverting the report.');
    const [after]=await tx`select * from public.affairs_graduation_reviews where id=${payload.id}`;
    assert.equal(after.version,2);assert.deepEqual(after.report,updated);
    const [legacyAfterModernEdit]=await tx`select * from public.affairs_graduation_reviews where id=${legacy.id}`;
    assert.equal(legacyAfterModernEdit.version,1);assert.deepEqual(legacyAfterModernEdit.report,legacyReport);
    const legacyUpdated=structuredClone(legacyReport);legacyUpdated.graduationReview.note='Synthetic legacy note';
    const legacyEdit=operation({...legacy,expected_version:1,report:legacyUpdated});
    assert.equal((await save(tx,legacyEdit)).version,2);assert.deepEqual(await save(tx,legacy),legacyFirst);
    assert.equal((await tx`select version from public.affairs_graduation_reviews where id=${legacy.id}`)[0].version,2);
    assert.deepEqual((await tx`select report from public.affairs_graduation_reviews where id=${payload.id}`)[0].report,updated);
    await denied(tx,point=>save(point,{...edit,expected_version:2}),'PT409');
    await denied(tx,point=>save(point,operation(edit)),'PT409');
    await denied(tx,point=>save(point,operation({...edit,user_id:two,expected_version:2})));
    await denied(tx,point=>save(point,operation({...payload,id:randomUUID()})),'PT409');
    const foreign=operation({...payload,id:randomUUID(),user_id:two});await save(tx,foreign);
    await denied(tx,point=>save(point,operation({...foreign,report_kind:'legacy',expected_version:1})),'22023');
    // Exact full-envelope byte boundary is tested in a nested rollback so it
    // cannot change the main receipt/audit assertions or add fixture records.
    const boundary=operation({...edit,expected_version:2,report:report()});boundary.report.graduationReview.note='';
    let remaining=131072-graduationReviewPayloadBytes(boundary);
    while(remaining>1000){boundary.report.otherCourses.push({...course(`boundary-${boundary.report.otherCourses.length}`),title:'x'.repeat(160)});remaining=131072-graduationReviewPayloadBytes(boundary);}
    assert.ok(remaining>=0);boundary.report.graduationReview.note='x'.repeat(remaining);
    assert.equal(validateGraduationReviewContent(boundary.report),null);
    assert.equal(graduationReviewPayloadBytes(boundary),131072);
    assert.equal((await tx`select octet_length(${tx.json(boundary)}::jsonb::text) as bytes`)[0].bytes,131072);
    const isolated=Symbol('rollback boundary save');
    try{await tx.savepoint(async point=>{assert.equal((await save(point,boundary)).version,3);throw isolated;});}catch(error){if(error!==isolated)throw error;}
    const tooLarge=structuredClone(boundary);tooLarge.report.graduationReview.note+='x';assert.equal(graduationReviewPayloadBytes(tooLarge),131073);
    await denied(tx,point=>save(point,tooLarge),'22023');
    // Authenticated administrators read both owners but cannot bypass the RPC.
    assert.equal((await tx`select id from public.affairs_graduation_reviews where id in (${payload.id},${legacy.id},${foreign.id})`).length,3);
    await denied(tx,point=>point`update public.affairs_graduation_reviews set version=99 where id=${payload.id}`);
    await denied(tx,point=>point`select request_id from private.affairs_graduation_review_operations`);
    for(const [account,ownIds] of [[one,[payload.id,legacy.id]],[two,[foreign.id]]]){
      await role(tx,account);
      assert.deepEqual((await tx`select id from public.affairs_graduation_reviews where id in (${payload.id},${legacy.id},${foreign.id}) order by id`).map(row=>row.id),[...ownIds].sort());
      const ownId=ownIds[0];
      await denied(tx,point=>save(point,operation({...edit,expected_version:2})));
      await denied(tx,point=>point`update public.affairs_graduation_reviews set version=99 where id=${ownId}`);
      await denied(tx,point=>point`delete from public.affairs_graduation_reviews where id=${ownId}`);
      await denied(tx,point=>point`insert into public.affairs_graduation_reviews(id,user_id,report_kind,report) values(${randomUUID()},${account},'legacy',${point.json(report())})`);
      await denied(tx,point=>point`select request_id from private.affairs_graduation_review_operations`);
    }
    await tx.unsafe('set local role anon');await tx`select set_config('request.jwt.claim.sub','',true)`;
    await denied(tx,point=>point`select id from public.affairs_graduation_reviews`);
    await denied(tx,point=>save(point,payload));await tx.unsafe('reset role');
    assert.equal((await tx`select count(*)::int as n from public.affairs_agent_audit where target_id=${payload.id} and action_kind=${kind}`)[0].n,2);
    assert.equal((await tx`select count(*)::int as n from private.affairs_graduation_review_operations where payload->>'id'=${payload.id}`)[0].n,2);
    assert.equal((await tx`select count(*)::int as n from public.affairs_agent_audit where target_id=${legacy.id} and action_kind=${kind}`)[0].n,2);
    assert.equal((await tx`select count(*)::int as n from private.affairs_graduation_review_operations where payload->>'id'=${legacy.id}`)[0].n,2);
    assert.equal((await tx`select count(*)::int as n from private.affairs_graduation_review_operations where payload::text like '%DO-NOT-STORE%'`)[0].n,0);
    assert.deepEqual(await ownerFingerprint(tx,owner.id),owner,'Real owner auth/profile/provider identities must remain unchanged.');
    throw rollback;
  });
}catch(error){if(error!==rollback)throw error;rolledBack=true;}
finally{
  try{
    if(rolledBack){
      assert.equal((await sql`select id from auth.users where id in (${one},${two})`).length,0);
      assert.equal((await sql`select user_id from public.affairs_profiles where user_id in (${one},${two})`).length,0);
      if(preflight){
        assert.equal((await sql`select to_regclass('public.affairs_graduation_reviews') as name`)[0].name,null);
        assert.equal((await sql`select to_regclass('private.affairs_graduation_review_operations') as name`)[0].name,null);
      }
      assert.deepEqual(await baseline(sql),before);assert.deepEqual(await ownerFingerprint(sql,owner.id),owner);
      console.log(`Graduation review passed: restored ${before.migrations} migrations/${before.rls_tables} public RLS tables; strict recursive JS/SQL validation, literal null/zero, exact 131072-byte envelope, immutable owner/kind, one report per owner/kind, independent dual reports, kind-aware version/replay/stale conflicts, private receipts, exact audit counts, own/admin/anonymous access and direct-write denial. Existing owner unchanged; draft DDL and synthetic fixtures rolled back. Parallel requests are not exercised by this single-connection test.`);
    }
  }finally{await sql.end({timeout:5});}
}

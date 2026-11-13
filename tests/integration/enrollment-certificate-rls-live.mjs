import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {enrollmentCertificatePayloadBytes,validateEnrollmentCertificatePayload} from '../../server/enrollmentCertificate.js';

// PREPARED, NOT EXECUTED. Requires root's serialized client DB lease.
// Every fixture mutation rolls back; --preflight also rolls back migration160000.
// This tests DB permissions/receipts only, never actual document content or delivery.
const preflight=process.argv.includes('--preflight');
const argument=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const expectedMigrations=Number(argument('--expected-migrations')),expectedRls=Number(argument('--expected-rls'));
if(preflight)assert.ok(Number.isInteger(expectedMigrations)&&expectedMigrations>0&&Number.isInteger(expectedRls)&&expectedRls>0,'Preflight requires reviewed --expected-migrations=N --expected-rls=N.');
const deployment=JSON.parse(await readFile('deployment.json','utf8')),env=deploymentEnvironment();
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
let target;try{target=new URL(connection);}catch{throw new Error('The client database connection is unavailable.');}
const project=deployment.supabase.projectRef;assert.equal(project,'xiftudmvxphxcjtmfmib');
assert.ok(target.hostname===`db.${project}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+project),'Use only the exact client database.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const one=randomUUID(),two=randomUUID(),recordId=randomUUID(),otherId=randomUUID(),documentId=randomUUID();
const tables=['affairs_enrollment_certificate_assessments','affairs_enrollment_certificate_documents'];
const assessmentKind='save_enrollment_certificate_assessment',documentKind='save_enrollment_certificate_document';
const rollback=Symbol('rollback certificate fixtures');
const role=async(tx,id,initialize=false)=>{await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${id},true)`;if(initialize)await tx`select public.affairs_initialize_account()`;};
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const save=async(tx,kind,payload)=>(await tx`select public.affairs_manage_enrollment_certificate(${kind},${tx.json(payload)}) as result`)[0].result;
const next=payload=>({...payload,request_id:randomUUID()});
const baseline=async tx=>(await tx`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select count(*)::int from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
const fingerprint=async(tx,id)=>(await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
  from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
const assessment=next({id:recordId,user_id:one,expected_version:0,academic_year:130,semester:1,has_pending_fees:'N',status:'blocked',result_text:'Synthetic local assessment',
  assessed_at:null,student_number:'LOCAL-CERT-QA',student_name:'Synthetic student',department_name:null,year_text:'',class_label:null});
const document=next({id:documentId,user_id:one,expected_version:0,assessment_id:recordId,assessment_version:1,issuer:'stu.best',purpose:'local_enrollment_reference',status:'metadata_only',verified_at:null,expires_at:null});
let before,owner,rolledBack=false;
try{
  before=await baseline(sql);
  if(preflight)assert.deepEqual(before,{migrations:expectedMigrations,rls_tables:expectedRls});
  await sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='8s'");await tx.unsafe("set local statement_timeout='20s'");
    if(preflight){
      for(const table of tables)assert.equal((await tx`select to_regclass(${'public.'+table}) as name`)[0].name,null);
      await tx.unsafe(await readFile('supabase/migrations/20261112160000_enrollment_certificate.sql','utf8'));
      assert.equal((await baseline(tx)).rls_tables,before.rls_tables+2);
    }
    const [administrator]=await tx`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator,'An existing verified Google administrator is required; this test never creates or changes one.');
    owner=await fingerprint(tx,administrator.id);
    for(const id of [one,two]){
      const email=`certificate-qa-${id}@example.invalid`;
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),
          '{"provider":"google","providers":["google"]}','{"full_name":"Synthetic Certificate QA"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
      await role(tx,id,true);await tx.unsafe('reset role');
    }
    const invalid=[];
    for(const kind of [null,'','__proto__','constructor','unknown_kind'])invalid.push({kind,payload:assessment});
    for(const [kind,fixture] of [[assessmentKind,assessment],[documentKind,document]]){
      for(const key of Object.keys(fixture)){const payload={...fixture};delete payload[key];invalid.push({kind,payload});}
      for(const patch of [{url:'PRIVATE-DO-NOT-STORE'},{storage_path:'private/path'},{signed_url:'private-capability'},{expected_version:null},{expected_version:'0'},
        {expected_version:999999999},{expected_version:-1},{source_mode:'official'},{user_id:null},{request_id:'bad'}])invalid.push({kind,payload:{...fixture,...patch}});
    }
    for(const patch of [{academic_year:0},{academic_year:10000},{academic_year:'130'},{semester:4},{has_pending_fees:true},{status:'official_eligible'},
      {student_name:'x'.repeat(161)},{result_text:'x'.repeat(501)},{year_text:'x'.repeat(31)},
      {assessed_at:'0000-01-01T00:00:00Z'},{assessed_at:'2026-02-29T00:00:00Z'},{assessed_at:'2026-04-31T00:00:00Z'},
      {assessed_at:'2026-01-01T24:00:00Z'},{assessed_at:'2026-01-01T00:00:00'},{assessed_at:'2026-01-01T00:00:00+16:00'}])invalid.push({kind:assessmentKind,payload:{...assessment,...patch}});
    for(const patch of [{status:'available'},{verified_at:'2020-01-01T00:00:00Z'},{issuer:'University'},{purpose:'official_certificate'},
      {assessment_version:0},{assessment_version:'1'},{expires_at:'2026-02-29T00:00:00Z'}])invalid.push({kind:documentKind,payload:{...document,...patch}});
    const valid=[{kind:assessmentKind,payload:assessment},{kind:documentKind,payload:document},
      {kind:assessmentKind,payload:{...assessment,academic_year:null,semester:null,has_pending_fees:null,status:'unknown',result_text:null,student_name:''}},
      {kind:assessmentKind,payload:{...assessment,student_name:'😀'.repeat(160),assessed_at:'2024-02-29T23:59:59.123456+08:00'}},
      {kind:documentKind,payload:{...document,status:'revoked',expires_at:'2030-01-01T00:00:00Z'}}];
    for(const fixture of valid){
      assert.equal(validateEnrollmentCertificatePayload(fixture.kind,fixture.payload),null);
      assert.equal((await tx`select private.affairs_certificate_payload_valid(${fixture.kind},${tx.json(fixture.payload)}) as ok`)[0].ok,true);
      assert.equal((await tx`select octet_length(${tx.json(fixture.payload)}::jsonb::text) as bytes`)[0].bytes,enrollmentCertificatePayloadBytes(fixture.payload));
    }
    for(const fixture of invalid){
      assert.ok(validateEnrollmentCertificatePayload(fixture.kind,fixture.payload));
      assert.equal((await tx`select private.affairs_certificate_payload_valid(${fixture.kind},${tx.json(fixture.payload)}) as ok`)[0].ok,false);
    }
    await role(tx,administrator.id);
    assert.deepEqual((await tx`select public.affairs_enrollment_certificate_access() as result`)[0].result,{userId:administrator.id,canManage:true});
    for(const fixture of invalid)await denied(tx,t=>save(t,fixture.kind,fixture.payload),'22023');
    const first=await save(tx,assessmentKind,assessment);assert.equal(first.version,1);
    assert.deepEqual(await save(tx,assessmentKind,assessment),first);
    const docFirst=await save(tx,documentKind,document);assert.equal(docFirst.version,1);
    assert.deepEqual(await save(tx,documentKind,document),docFirst);
    await save(tx,assessmentKind,next({...assessment,id:otherId,user_id:two}));
    await denied(tx,t=>save(t,assessmentKind,next({...assessment,id:randomUUID()})),'PT409');
    await denied(tx,t=>save(t,documentKind,next({...document,id:randomUUID()})),'PT409');
    await denied(tx,t=>save(t,documentKind,next({...document,id:randomUUID(),user_id:two})));
    const updated=next({...assessment,expected_version:1,academic_year:null,semester:null,has_pending_fees:null,status:'unknown',result_text:'',student_number:null,student_name:null});
    assert.equal((await save(tx,assessmentKind,updated)).version,2);
    assert.deepEqual(await save(tx,assessmentKind,assessment),first,'Late retry returns original receipt after a later edit.');
    await denied(tx,t=>save(t,assessmentKind,{...assessment,result_text:'changed reuse'}),'PT409');
    await denied(tx,t=>save(t,assessmentKind,next({...updated,expected_version:1})),'PT409');
    await denied(tx,t=>save(t,assessmentKind,next({...updated,user_id:two,expected_version:2})));
    await denied(tx,t=>save(t,documentKind,next({...document,expected_version:1})),'PT409');
    await denied(tx,t=>save(t,documentKind,next({...document,expected_version:1,assessment_version:2})));
    const revoked=next({...document,expected_version:1,status:'revoked'});assert.equal((await save(tx,documentKind,revoked)).version,2);
    assert.deepEqual(await save(tx,documentKind,document),docFirst,'Late document retry remains stable after revocation.');
    await role(tx,one);
    assert.deepEqual((await tx`select public.affairs_enrollment_certificate_access() as result`)[0].result,{userId:one,canManage:false});
    assert.equal((await tx`select count(*)::int as count from public.affairs_enrollment_certificate_assessments`)[0].count,1);
    assert.equal((await tx`select count(*)::int as count from public.affairs_enrollment_certificate_documents`)[0].count,1);
    assert.equal((await tx`select count(*)::int as count from public.affairs_enrollment_certificate_assessments where user_id=${two}`)[0].count,0);
    const [stored]=await tx`select academic_year,semester,has_pending_fees,status,result_text,version from public.affairs_enrollment_certificate_assessments where id=${recordId}`;
    assert.deepEqual(stored,{academic_year:null,semester:null,has_pending_fees:null,status:'unknown',result_text:'',version:2});
    const [storedDocument]=await tx`select status,verified_at,assessment_version,version from public.affairs_enrollment_certificate_documents where id=${documentId}`;
    assert.deepEqual(storedDocument,{status:'revoked',verified_at:null,assessment_version:1,version:2});
    await denied(tx,t=>save(t,assessmentKind,next({...updated,expected_version:2})));
    await denied(tx,t=>t`insert into public.affairs_enrollment_certificate_assessments(id,user_id,status) values(${randomUUID()},${one},'blocked')`);
    await denied(tx,t=>t`update public.affairs_enrollment_certificate_assessments set status='local_eligible' where id=${recordId}`);
    await denied(tx,t=>t`delete from public.affairs_enrollment_certificate_documents where id=${documentId}`);
    await denied(tx,t=>t`select * from private.affairs_enrollment_certificate_operations`);
    await role(tx,two);
    assert.equal((await tx`select count(*)::int as count from public.affairs_enrollment_certificate_assessments where id=${recordId}`)[0].count,0);
    assert.equal((await tx`select count(*)::int as count from public.affairs_enrollment_certificate_documents`)[0].count,0);
    await tx.unsafe('set local role anon');await denied(tx,t=>t`select * from public.affairs_enrollment_certificate_assessments`);
    await denied(tx,t=>t`select public.affairs_enrollment_certificate_access()`);
    await denied(tx,t=>save(t,assessmentKind,next(assessment)));
    await tx.unsafe('reset role');
    assert.equal((await tx`select count(*)::int as count from private.affairs_enrollment_certificate_operations where user_id=${administrator.id} and payload->>'id' in (${recordId},${otherId},${documentId})`)[0].count,5);
    assert.equal((await tx`select count(*)::int as count from public.affairs_agent_audit where user_id=${administrator.id} and target_id in (${recordId},${otherId},${documentId})`)[0].count,5);
    assert.deepEqual(await fingerprint(tx,administrator.id),owner,'Existing administrator remains entirely unchanged.');
    throw rollback;
  });
}catch(error){if(error===rollback)rolledBack=true;else throw error;}
finally{await sql.end();}
assert.ok(rolledBack,'All fixtures and optional migration must roll back.');
// Open a fresh read-only connection to verify rollback left no fixture or schema changes.
const check=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
try{
  assert.deepEqual(await baseline(check),before);
  assert.equal((await check`select count(*)::int as count from auth.users where id in (${one},${two})`)[0].count,0);
  if(preflight)for(const table of tables)assert.equal((await check`select to_regclass(${'public.'+table}) as name`)[0].name,null);
  assert.deepEqual(await fingerprint(check,owner.id),owner);
}finally{await check.end();}
console.log(JSON.stringify({status:'passed',mode:preflight?'rollback_preflight':'rollback_regression',checks:['strict payload and byte parity','own/cross/anonymous reads','direct writes denied','admin save and immutable owner/linkage','version conflicts and durable late retries','metadata never activates documents','exact rollback and unchanged existing owner']}));

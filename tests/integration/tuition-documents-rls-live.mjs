import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {tuitionDocumentPayloadBytes,validateTuitionDocumentPayload} from '../../server/tuitionDocuments.js';

// PREPARED ONLY: root must grant the serialized DB lease before execution.
// One transaction rolls back every fixture, receipt/audit and (with --preflight) only migration180000.
// This verifies database contracts, not actual JWT/API/UI/Storage/PDF delivery.
const argument=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const preflight=process.argv.includes('--preflight');
assert.ok(process.argv.includes('--execute'),'Requires explicit --execute and root DB lease; no connection was opened.');
const expectedMigrations=Number(argument('--expected-migrations')),expectedRls=Number(argument('--expected-rls'));
assert.ok(Number.isInteger(expectedMigrations)&&expectedMigrations>0&&Number.isInteger(expectedRls)&&expectedRls>0,'Supply the reviewed exact --expected-migrations=N --expected-rls=N baseline.');
const deployment=JSON.parse(await readFile('deployment.json','utf8')),env=deploymentEnvironment();
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
let target;try{target=new URL(connection);}catch{throw new Error('The client database connection is unavailable.');}
const project=deployment.supabase.projectRef;assert.equal(project,'xiftudmvxphxcjtmfmib');
assert.ok(target.hostname===`db.${project}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+project),'Use only the exact client database.');
const sql=postgres(connection,{max:1,connect_timeout:10,idle_timeout:5,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const one=randomUUID(),two=randomUUID(),nonGoogle=randomUUID(),recordId=randomUUID(),otherId=randomUUID(),documentId=randomUUID(),replacementId=randomUUID();
const fixtures=[one,two,nonGoogle],targets=[recordId,otherId,documentId,replacementId];
const tables=['affairs_tuition_settlements','affairs_tuition_document_metadata'],successfulRequests=new Set(),checks=[];
const rollback=Symbol('tuition rollback');
const baseline=async tx=>(await tx`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select count(*)::int from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
const fingerprint=async(tx,id)=>(await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
  from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
const role=async(tx,id,initialize=false)=>{
  await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${id},true)`;
  if(initialize){assert.ok([one,two].includes(id),'Only disposable synthetic students may be initialized.');await tx`select public.affairs_initialize_account()`;}
};
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const save=async(tx,kind,payload)=>{
  const result=(await tx`select public.affairs_manage_tuition_documents(${kind},${tx.json(payload)}) as result`)[0].result;
  assert.equal(result.id,payload.id);assert.equal(result.kind,kind);assert.equal(result.version,payload.expected_version+1);successfulRequests.add(payload.request_id);return result;
};
const next=payload=>({...payload,request_id:randomUUID()});
const settlement=next({id:recordId,user_id:one,expected_version:0,period_label:' Synthetic local period ',statement_text:null,row_order:0});
const document=next({id:documentId,user_id:one,expected_version:0,kind:'summer',period_label:null,note_text:'',status:'metadata_only',issuer:'stu.best'});
let before,administrator,ownerBefore,rolledBack=false;const tablePresence=new Map();
try{
  before=await baseline(sql);assert.deepEqual(before,{migrations:expectedMigrations,rls_tables:expectedRls});
  for(const table of tables)tablePresence.set(table,(await sql`select to_regclass(${'public.'+table}) as name`)[0].name);
  await sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='8s'");await tx.unsafe("set local statement_timeout='20s'");
    if(preflight){
      for(const table of tables)assert.equal((await tx`select to_regclass(${'public.'+table}) as name`)[0].name,null);
      await tx.unsafe(await readFile('supabase/migrations/20261112180000_tuition_documents.sql','utf8'));
      assert.deepEqual(await baseline(tx),{migrations:before.migrations,rls_tables:before.rls_tables+2});
    }else for(const table of tables)assert.notEqual((await tx`select to_regclass(${'public.'+table}) as name`)[0].name,null);
    [administrator]=await tx`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator,'An existing verified Google administrator is required; no owner identity/profile will be created or changed.');
    ownerBefore=await fingerprint(tx,administrator.id);
    for(const id of fixtures){
      const google=id!==nonGoogle,email=`tuition-qa-${id}@example.invalid`;
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),
          ${tx.json(google?{provider:'google',providers:['google']}:{provider:'email',providers:['email']})},'{"full_name":"Synthetic Tuition QA"}',now(),now())`;
      if(google){await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;await role(tx,id,true);await tx.unsafe('reset role');}
    }
    const deleted={id:recordId,user_id:one,request_id:randomUUID(),expected_version:1};
    const valid=[['save_tuition_settlement',settlement],['save_tuition_settlement',{...settlement,statement_text:'',row_order:10000}],
      ['save_tuition_settlement',{...settlement,period_label:'😀'.repeat(160),statement_text:'界'.repeat(4000)}],
      ['save_tuition_settlement',{...settlement,statement_text:'\u0001'.repeat(4000)}],
      ['save_tuition_document_metadata',document],['save_tuition_document_metadata',{...document,status:'revoked',kind:'evening',period_label:'',note_text:null}],
      ['delete_tuition_settlement',deleted],['delete_tuition_document_metadata',{...deleted,id:documentId}]];
    const invalid=[];
    for(const kind of [null,'','constructor','__proto__','toString','unknown'])invalid.push([kind,settlement]);
    for(const [kind,fixture] of [['save_tuition_settlement',settlement],['save_tuition_document_metadata',document],['delete_tuition_settlement',deleted],['delete_tuition_document_metadata',{...deleted,id:documentId}]]){
      for(const key of Object.keys(fixture)){const value={...fixture};delete value[key];invalid.push([kind,value]);}
      for(const patch of [{extra:null},{signed_url:'PRIVATE-DO-NOT-STORE'},{storage_path:'private/path'},{source_mode:'official'},{user_id:null},{id:'bad'},{request_id:7},{expected_version:null},{expected_version:'1'},{expected_version:-1},{expected_version:999999999}])invalid.push([kind,{...fixture,...patch}]);
    }
    for(const patch of [{period_label:''},{period_label:' \n\t\u3000\u00a0\ufeff'},{period_label:null},{period_label:'x'.repeat(161)},{statement_text:'界'.repeat(4001)},{statement_text:0},{row_order:-1},{row_order:10001},{row_order:0.5},{row_order:'0'},{amount:100}])invalid.push(['save_tuition_settlement',{...settlement,...patch}]);
    for(const patch of [{kind:'extended'},{kind:'settlement'},{status:'available'},{status:'issued'},{status:'verified_local_file'},{issuer:'University'},{verified_at:'2030-01-01T00:00:00Z'},{note_text:'x'.repeat(1001)}])invalid.push(['save_tuition_document_metadata',{...document,...patch}]);
    invalid.push(['delete_tuition_settlement',{...deleted,expected_version:0}]);
    for(const [kind,value] of valid){assert.equal(validateTuitionDocumentPayload(kind,value),null);assert.equal((await tx`select private.affairs_tuition_payload_valid(${kind},${tx.json(value)}) as valid`)[0].valid,true);assert.equal((await tx`select octet_length(${tx.json(value)}::jsonb::text) as bytes`)[0].bytes,tuitionDocumentPayloadBytes(value));}
    for(const [kind,value] of invalid){assert.ok(validateTuitionDocumentPayload(kind,value));assert.equal((await tx`select private.affairs_tuition_payload_valid(${kind},${tx.json(value)}) as valid`)[0].valid,false);}
    checks.push('strict-js-sql-parity-and-jsonb-byte-limits');

    await role(tx,administrator.id);assert.deepEqual((await tx`select public.affairs_tuition_access() as result`)[0].result,{userId:administrator.id,canManage:true});
    const first=await save(tx,'save_tuition_settlement',settlement);assert.deepEqual(await save(tx,'save_tuition_settlement',settlement),first);
    await denied(tx,s=>save(s,'save_tuition_settlement',{...settlement,statement_text:'changed retry'}),'PT409');
    const second=next({...settlement,id:otherId,user_id:two,period_label:'Other synthetic local period'});await save(tx,'save_tuition_settlement',second);
    await denied(tx,s=>save(s,'save_tuition_settlement',next({...settlement,user_id:two,expected_version:1})));
    await denied(tx,s=>save(s,'save_tuition_settlement',next(settlement)),'PT409');
    await denied(tx,s=>save(s,'save_tuition_settlement',next({...settlement,expected_version:1,signed_url:'PRIVATE-DO-NOT-STORE'})),'22023');
    assert.equal((await tx`select statement_text from public.affairs_tuition_settlements where id=${recordId}`)[0].statement_text,null);
    await role(tx,one);assert.deepEqual((await tx`select id from public.affairs_tuition_settlements order by id`).map(row=>row.id),[recordId]);
    assert.deepEqual((await tx`select public.affairs_tuition_access() as result`)[0].result,{userId:one,canManage:false});
    await denied(tx,s=>save(s,'save_tuition_settlement',next({...settlement,expected_version:1})));
    await denied(tx,s=>s`update public.affairs_tuition_settlements set statement_text='not allowed' where id=${recordId}`);
    await denied(tx,s=>s`delete from public.affairs_tuition_settlements where id=${recordId}`);
    await denied(tx,s=>s`insert into public.affairs_tuition_settlements(id,user_id,period_label,row_order) values(${randomUUID()},${one},'not allowed',0)`);
    await denied(tx,s=>s`select * from private.affairs_tuition_operations`);
    await role(tx,two);assert.deepEqual((await tx`select id from public.affairs_tuition_settlements order by id`).map(row=>row.id),[otherId]);
    await role(tx,nonGoogle);assert.equal((await tx`select * from public.affairs_tuition_settlements`).length,0);await denied(tx,s=>s`select public.affairs_tuition_access()`);await denied(tx,s=>save(s,'save_tuition_settlement',next(settlement)));
    await tx.unsafe('set local role anon');await denied(tx,s=>s`select * from public.affairs_tuition_settlements`);await denied(tx,s=>s`select public.affairs_tuition_access()`);
    checks.push('two-owner-google-and-anonymous-isolation-direct-write-denials');

    await role(tx,administrator.id);
    const edited=next({...settlement,expected_version:1,statement_text:'',row_order:0});await save(tx,'save_tuition_settlement',edited);
    const literal=(await tx`select period_label,statement_text,row_order,source_mode,version from public.affairs_tuition_settlements where id=${recordId}`)[0];
    assert.deepEqual(literal,{period_label:' Synthetic local period ',statement_text:'',row_order:0,source_mode:'local_demo',version:2});
    const metadataReceipt=await save(tx,'save_tuition_document_metadata',document);assert.deepEqual(await save(tx,'save_tuition_document_metadata',document),metadataReceipt);
    await denied(tx,s=>save(s,'save_tuition_document_metadata',next({...document,id:replacementId})),'PT409');
    await denied(tx,s=>save(s,'save_tuition_document_metadata',next({...document,expected_version:1,user_id:two})));
    await denied(tx,s=>save(s,'save_tuition_document_metadata',next({...document,expected_version:1,kind:'evening'})));
    await role(tx,one);assert.deepEqual((await tx`select id,status from public.affairs_tuition_document_metadata`).map(row=>[row.id,row.status]),[[documentId,'metadata_only']]);
    await denied(tx,s=>s`update public.affairs_tuition_document_metadata set status='revoked' where id=${documentId}`);
    await role(tx,two);assert.equal((await tx`select * from public.affairs_tuition_document_metadata`).length,0);
    await role(tx,administrator.id);
    await save(tx,'save_tuition_document_metadata',next({...document,expected_version:1,status:'revoked'}));
    await denied(tx,s=>save(s,'save_tuition_document_metadata',next({...document,expected_version:2})),'22023');
    const deleteMetadata=next({id:documentId,user_id:one,expected_version:2});const deletedMetadata=await save(tx,'delete_tuition_document_metadata',deleteMetadata);assert.deepEqual(await save(tx,'delete_tuition_document_metadata',deleteMetadata),deletedMetadata);
    await denied(tx,s=>save(s,'save_tuition_document_metadata',next({...document,expected_version:3,status:'revoked'})),'PT409');
    await save(tx,'save_tuition_document_metadata',next({...document,id:replacementId}));
    checks.push('immutable-document-kind-terminal-revocation-and-replacement');

    const deleteStatement=next({id:recordId,user_id:one,expected_version:2});const deletionReceipt=await save(tx,'delete_tuition_settlement',deleteStatement);assert.deepEqual(await save(tx,'delete_tuition_settlement',deleteStatement),deletionReceipt);
    assert.deepEqual(await save(tx,'save_tuition_settlement',settlement),first,'Old exact receipt must not resurrect a deleted record.');
    await denied(tx,s=>save(s,'save_tuition_settlement',next({...settlement,expected_version:3})),'PT409');
    await denied(tx,s=>save(s,'delete_tuition_settlement',next({...deleteStatement,expected_version:3})),'PT409');
    await role(tx,one);assert.equal((await tx`select * from public.affairs_tuition_settlements`).length,0);assert.deepEqual((await tx`select id from public.affairs_tuition_document_metadata`).map(row=>row.id),[replacementId]);
    await tx.unsafe('reset role');
    assert.equal((await tx`select version,deleted_at is not null as deleted from public.affairs_tuition_settlements where id=${recordId}`)[0].deleted,true);
    await denied(tx,s=>s`update public.affairs_tuition_settlements set deleted_at=null where id=${recordId}`,'PT409');
    await denied(tx,s=>s`update public.affairs_tuition_settlements set user_id=${one} where id=${otherId}`);
    await denied(tx,s=>s`update public.affairs_tuition_document_metadata set kind='evening' where id=${replacementId}`);
    checks.push('versioned-tombstones-replay-after-delete-no-id-reuse');
    const receipts=await tx`select request_id,payload from private.affairs_tuition_operations where user_id=${administrator.id} and request_id in ${tx([...successfulRequests])}`;
    assert.equal(receipts.length,successfulRequests.size);assert.equal(successfulRequests.size,8);assert.ok(receipts.every(row=>!Object.hasOwn(row.payload,'signed_url')));
    assert.equal((await tx`select count(*)::int as count from public.affairs_agent_audit where user_id=${administrator.id} and target_id in ${tx(targets)}`)[0].count,successfulRequests.size);
    assert.deepEqual(await fingerprint(tx,administrator.id),ownerBefore);checks.push('one-audit-per-durable-receipt-owner-auth-profile-unchanged');
    throw rollback;
  });
}catch(error){if(error===rollback)rolledBack=true;else throw error;}
finally{
  try{
    if(before){assert.deepEqual(await baseline(sql),before);for(const id of fixtures){assert.equal((await sql`select count(*)::int as count from auth.users where id=${id}`)[0].count,0);assert.equal((await sql`select count(*)::int as count from auth.identities where user_id=${id}`)[0].count,0);assert.equal((await sql`select count(*)::int as count from public.affairs_profiles where user_id=${id}`)[0].count,0);}
      assert.equal((await sql`select count(*)::int as count from public.affairs_agent_audit where target_id in ${sql(targets)}`)[0].count,0);
      for(const [table,presence] of tablePresence)assert.equal((await sql`select to_regclass(${'public.'+table}) as name`)[0].name,presence);
      if(!preflight){for(const table of tables)if(tablePresence.get(table))assert.equal((await sql.unsafe(`select count(*)::int as count from public.${table} where id=any($1::uuid[])`,[targets]))[0].count,0);if(administrator&&successfulRequests.size)assert.equal((await sql`select count(*)::int as count from private.affairs_tuition_operations where user_id=${administrator.id} and request_id in ${sql([...successfulRequests])}`)[0].count,0);}
      if(administrator&&ownerBefore)assert.deepEqual(await fingerprint(sql,administrator.id),ownerBefore);
    }
  }finally{await sql.end({timeout:5});}
}
assert.ok(rolledBack,'A successful run must end in the deliberate transaction rollback.');
console.log(JSON.stringify({status:'passed',mode:preflight?'rollback-only-migration-preflight':'rollback-only-postapply',checks,baseline:before,cleanup:'exact synthetic users, profiles, identities, receipts, audits and rows rolled back; existing owner unchanged',capabilities:'No JWT/API/Storage/PDF delivery verification.'}));

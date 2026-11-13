import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {studentConductPayloadBytes,studentConductTextLimits,validateStudentConductPayload} from '../../server/studentConduct.js';

// PREPARED ONLY. Root must grant the serialized client DB lease before execution.
// --self-test is offline: no environment/credential read or DB module is loaded.
// The only live mode requires --execute --preflight --expected-migrations=129
// --expected-rls=146. It applies ONLY draft200000 inside one rolled-back transaction.
// No actual JWT, HTTP, browser, model, certificate or parallel-request claim.
const project='xiftudmvxphxcjtmfmib',version='20261112200000',prerequisite='20261112190000';
const expected={migrations:129,rls_tables:146};
const migration='supabase/migrations/20261112200000_student_conduct.sql';
const table='affairs_student_conduct',operations='affairs_student_conduct_operations';
const procedures=['public.affairs_student_conduct_access()','public.affairs_manage_student_conduct(text,jsonb)',
  'private.affairs_student_conduct_identity_guard()','private.affairs_student_conduct_fields(text)','private.affairs_student_conduct_payload_valid(text,jsonb)'];
function options(args){
  if(args.length===1&&args[0]==='--self-test')return {selfTest:true};
  assert.equal(new Set(args).size,args.length,'Duplicate flags are not permitted.');
  const approved=['--execute','--preflight','--expected-migrations=129','--expected-rls=146'];
  assert.ok(args.length===approved.length&&approved.every(flag=>args.includes(flag)),
    'Requires root DB lease and exact --execute --preflight --expected-migrations=129 --expected-rls=146; no connection opened.');
  return {selfTest:false};
}
function clientTarget(connection){
  let target;try{target=new URL(connection);}catch{throw new Error('The client database connection is unavailable.');}
  assert.ok(['postgres:','postgresql:'].includes(target.protocol)&&target.pathname==='/postgres'
    &&(target.hostname===`db.${project}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+project)),
  'Use only the exact client database.');
}
const literal=(id,user_id,request_id)=>({id,user_id,request_id,expected_version:0,
  occurred_on_text:' unparsed local date ',student_number:null,student_name:'',academic_year_text:'001',semester_text:'暑期（原文）',year_level_text:null,
  reason_text:'Synthetic conduct row only',conduct_code:'LOCAL-QA',conduct_name:'Literal local category',quantity_text:'0',void_status_text:null,row_order:0});
function byteBoundary(payload){
  const value={...payload};for(const [field,limit] of Object.entries(studentConductTextLimits))value[field]='\u0001'.repeat(limit);
  let text=value.reason_text,replaced=0;
  while(studentConductPayloadBytes(value)>16000){text='x'.repeat(++replaced)+'\u0001'.repeat(2000-replaced);value.reason_text=text;}
  const remainder=16000-studentConductPayloadBytes(value);
  value.reason_text=['','é','界','😀','é😀'][remainder]+text.slice(remainder===4?2:remainder?1:0);
  return value;
}
function offlineChecks(){
  assert.deepEqual(options(['--self-test']),{selfTest:true});
  assert.deepEqual(options(['--execute','--preflight','--expected-migrations=129','--expected-rls=146']),{selfTest:false});
  for(const args of [[],['--execute'],['--preflight'],['--self-test','--execute'],['--execute','--preflight','--expected-migrations=128','--expected-rls=146'],
    ['--execute','--preflight','--expected-migrations=129','--expected-rls=147'],['--execute','--apply','--expected-migrations=129','--expected-rls=146'],['--self-test','--self-test']])assert.throws(()=>options(args));
  for(const url of [`postgres://postgres@db.${project}.supabase.co/postgres`,`postgresql://postgres.${project}@qa.pooler.supabase.com/postgres`])clientTarget(url);
  for(const url of ['postgres://postgres@db.other.supabase.co/postgres','postgres://postgres.other@qa.pooler.supabase.com/postgres',
    `https://db.${project}.supabase.co/postgres`,`postgres://postgres@db.${project}.supabase.co/other`,`postgres://postgres.${project}@qa.pooler.supabase.com.invalid/postgres`])assert.throws(()=>clientTarget(url));
  const fixture=literal(randomUUID(),randomUUID(),randomUUID()),boundary=byteBoundary(fixture);
  assert.equal(validateStudentConductPayload('save_student_conduct',fixture),null);assert.equal(studentConductPayloadBytes(boundary),16000);
  assert.equal(validateStudentConductPayload('save_student_conduct',boundary),null);
  assert.ok(validateStudentConductPayload('save_student_conduct',{...boundary,reason_text:boundary.reason_text.replace('x','é')}));
  assert.ok(validateStudentConductPayload('save_student_conduct',Object.create(fixture)));
  assert.ok(validateStudentConductPayload('constructor',fixture));
  console.log(JSON.stringify({status:'passed',mode:'offline-guards',baseline:expected,databaseConnections:0}));
}

async function preflight(){
  const deployment=JSON.parse(await readFile('deployment.json','utf8'));
  assert.equal(deployment.repository.toLowerCase(),'luxart0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);
  const {deploymentEnvironment}=await import('../../scripts/deployment-env.mjs'),env=deploymentEnvironment();
  const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;clientTarget(connection);
  const {default:postgres}=await import('postgres');
  const sql=postgres(connection,{max:1,connect_timeout:10,idle_timeout:5,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
  const one=randomUUID(),two=randomUUID(),nonGoogle=randomUUID(),recordId=randomUUID(),otherId=randomUUID(),nonGoogleId=randomUUID(),overflowId=randomUUID();
  // Every inserted ID is allocated before its first SQL operation. All fixtures
  // exist only in this transaction; there is no fallback cleanup DELETE.
  const users=[one,two,nonGoogle],capIds=Array.from({length:1000},()=>randomUUID()),targets=[recordId,otherId,nonGoogleId,overflowId,...capIds];
  const requestIds=new Set(),checks=[],rollback=Symbol('student conduct rollback');
  let before,historyBefore,administrator,ownerBefore,rolledBack=false,started=false;
  const baseline=async tx=>(await tx`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
  const history=async tx=>(await tx`select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.version),'[]'::jsonb)::text) as hash from supabase_migrations.schema_migrations m`)[0].hash;
  const fingerprint=async(tx,id)=>(await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
    from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
  const absentObjects=async tx=>{
    for(const name of ['public.'+table,'private.'+operations])assert.equal((await tx`select to_regclass(${name}) as name`)[0].name,null);
    for(const name of procedures)assert.equal((await tx`select to_regprocedure(${name}) as name`)[0].name,null);
  };
  const role=async(tx,id)=>{await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${id},true)`;};
  const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
  const next=payload=>({...payload,request_id:randomUUID()});
  const save=async(tx,kind,payload)=>{
    assert.ok(targets.includes(payload.id)&&users.includes(payload.user_id),'Writes are limited to this exact disposable fixture ledger.');
    const result=(await tx`select public.affairs_manage_student_conduct(${kind},${tx.json(payload)}) as result`)[0].result;
    assert.deepEqual(Object.keys(result).sort(),['id','kind','summary','version']);assert.equal(result.id,payload.id);assert.equal(result.kind,kind);assert.equal(result.version,payload.expected_version+1);
    requestIds.add(payload.request_id);return result;
  };
  const original=literal(recordId,one,randomUUID());
  try{
    before=await baseline(sql);assert.deepEqual(before,expected,'Only the reviewed future129/146 baseline is accepted.');historyBefore=await history(sql);
    assert.equal((await sql`select count(*)::int as count from supabase_migrations.schema_migrations where version=${prerequisite}`)[0].count,1,'Migration190000 must already be applied by its owner.');
    assert.equal((await sql`select count(*)::int as count from supabase_migrations.schema_migrations where version=${version}`)[0].count,0);
    await absentObjects(sql);
    [administrator]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator,'An existing verified Google administrator is required; no real owner identity/profile will be created or changed.');
    ownerBefore=await fingerprint(sql,administrator.id);assert.ok(!users.includes(administrator.id));
    assert.equal((await sql`select count(*)::int as count from auth.users where id in ${sql(users)}`)[0].count,0);
    assert.equal((await sql`select count(*)::int as count from public.affairs_agent_audit where target_id in ${sql(targets)}`)[0].count,0);
    await sql.begin(async tx=>{
      started=true;await tx.unsafe("set local lock_timeout='8s'");await tx.unsafe("set local statement_timeout='20s'");await tx.unsafe("set local idle_in_transaction_session_timeout='30s'");
      await tx.unsafe(await readFile(migration,'utf8'));assert.deepEqual(await baseline(tx),{migrations:129,rls_tables:147});
      assert.equal(await history(tx),historyBefore,'Draft DDL must not modify migration history.');
      for(const userId of users){
        const google=userId!==nonGoogle,email=`conduct-qa-${userId}@example.invalid`;
        await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
          values('00000000-0000-0000-0000-000000000000',${userId},'authenticated','authenticated',${email},now(),
          ${tx.json(google?{provider:'google',providers:['google']}:{provider:'email',providers:['email']})},'{"full_name":"Synthetic Conduct QA"}',now(),now())`;
        if(google)await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${userId},${userId},${tx.json({sub:userId,email,email_verified:true})},'google')`;
        // Explicit synthetic profiles avoid seeding unrelated sample enrollment/task data.
        await tx`insert into public.affairs_profiles(user_id,email,display_name,role) values(${userId},${email},'Synthetic Conduct QA','student')`;
      }
      const deletion={id:recordId,user_id:one,request_id:randomUUID(),expected_version:1},boundary=byteBoundary(original);
      const valid=[['save_student_conduct',original],['save_student_conduct',boundary],['delete_student_conduct',deletion]];
      const invalid=[];
      for(const field of Object.keys(studentConductTextLimits)){
        valid.push(['save_student_conduct',{...original,[field]:null}],['save_student_conduct',{...original,[field]:''}],['save_student_conduct',{...original,[field]:'😀'.repeat(studentConductTextLimits[field])}]);
        invalid.push(['save_student_conduct',{...original,[field]:0}],['save_student_conduct',{...original,[field]:'x'.repeat(studentConductTextLimits[field]+1)}]);
      }
      invalid.push(['save_student_conduct',{...boundary,reason_text:boundary.reason_text.replace('x','é')}]);
      for(const kind of [null,'','constructor','__proto__','toString','unknown'])invalid.push([kind,original]);
      for(const [kind,value] of [['save_student_conduct',original],['delete_student_conduct',deletion]]){
        for(const field of Object.keys(value)){const missing={...value};delete missing[field];invalid.push([kind,missing]);}
        for(const patch of [{extra:null},{signed_url:'DO-NOT-STORE'},{certificate_status:'issued'},{source_mode:'official'},{user_id:null},{id:'bad'},{expected_version:null},{expected_version:'1'},{expected_version:-1},{expected_version:999999999}])invalid.push([kind,{...value,...patch}]);
      }
      for(const patch of [{row_order:-1},{row_order:10001},{row_order:0.5},{row_order:'0'},{quantity:0}])invalid.push(['save_student_conduct',{...original,...patch}]);
      invalid.push(['delete_student_conduct',{...deletion,expected_version:0}],['save_student_conduct',Object.create(original)]);
      for(const [kind,value] of valid){assert.equal(validateStudentConductPayload(kind,value),null);assert.equal((await tx`select private.affairs_student_conduct_payload_valid(${kind},${tx.json(value)}) as valid`)[0].valid,true);
        assert.equal((await tx`select octet_length(${tx.json(value)}::jsonb::text) as bytes`)[0].bytes,studentConductPayloadBytes(value));}
      for(const [kind,value] of invalid){assert.ok(validateStudentConductPayload(kind,value));assert.equal((await tx`select private.affairs_student_conduct_payload_valid(${kind},${tx.json(value)}) as valid`)[0].valid,false);}
      for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await tx`select has_table_privilege('authenticated',${'public.'+table},${privilege}) as allowed`)[0].allowed,false);
      assert.equal((await tx`select has_table_privilege('authenticated',${'public.'+table},'SELECT') as allowed`)[0].allowed,true);
      assert.equal((await tx`select has_table_privilege('anon',${'public.'+table},'SELECT') as allowed`)[0].allowed,false);
      for(const signature of procedures){assert.equal((await tx`select has_function_privilege('authenticated',${signature},'EXECUTE') as allowed`)[0].allowed,signature.startsWith('public.'));
        assert.equal((await tx`select has_function_privilege('anon',${signature},'EXECUTE') as allowed`)[0].allowed,false);}
      checks.push('strict-js-sql-parity-exact16000-byte-boundary-and-acls');

      await role(tx,administrator.id);assert.deepEqual((await tx`select public.affairs_student_conduct_access() as result`)[0].result,{userId:administrator.id,canManage:true});
      const first=await save(tx,'save_student_conduct',original);assert.deepEqual(await save(tx,'save_student_conduct',original),first);
      await save(tx,'save_student_conduct',next({...original,id:otherId,user_id:two}));await save(tx,'save_student_conduct',next({...original,id:nonGoogleId,user_id:nonGoogle}));
      assert.equal((await tx`select count(*)::int as count from public.affairs_student_conduct`)[0].count,3);
      await denied(tx,s=>save(s,'save_student_conduct',{...original,reason_text:'changed retry'}),'PT409');
      await denied(tx,s=>save(s,'delete_student_conduct',{...deletion,request_id:original.request_id}),'PT409');
      await denied(tx,s=>save(s,'save_student_conduct',next(original)),'PT409');
      await denied(tx,s=>save(s,'save_student_conduct',next({...original,user_id:two,expected_version:1})));
      await denied(tx,s=>save(s,'delete_student_conduct',next({...deletion,user_id:two})));
      await denied(tx,s=>save(s,'save_student_conduct',next({...original,expected_version:1,signed_url:'DO-NOT-STORE'})),'22023');
      await denied(tx,s=>s`update public.affairs_student_conduct set quantity_text='not allowed' where id=${recordId}`);
      await role(tx,one);assert.deepEqual((await tx`select id from public.affairs_student_conduct`).map(row=>row.id),[recordId]);
      assert.deepEqual((await tx`select public.affairs_student_conduct_access() as result`)[0].result,{userId:one,canManage:false});
      assert.equal((await tx`select count(*)::int as count from public.affairs_student_conduct where user_id=${two}`)[0].count,0);
      for(const kind of ['save_student_conduct','delete_student_conduct'])await denied(tx,s=>save(s,kind,kind.startsWith('save')?next({...original,expected_version:1}):next(deletion)));
      await denied(tx,s=>s`insert into public.affairs_student_conduct(id,user_id,row_order) values(${overflowId},${one},0)`);
      await denied(tx,s=>s`update public.affairs_student_conduct set reason_text='not allowed' where id=${recordId}`);
      await denied(tx,s=>s`delete from public.affairs_student_conduct where id=${recordId}`);
      await denied(tx,s=>s`select * from private.affairs_student_conduct_operations`);
      await role(tx,two);assert.deepEqual((await tx`select id from public.affairs_student_conduct`).map(row=>row.id),[otherId]);
      await role(tx,nonGoogle);assert.equal((await tx`select * from public.affairs_student_conduct`).length,0);
      await denied(tx,s=>s`select public.affairs_student_conduct_access()`);await denied(tx,s=>save(s,'save_student_conduct',next({...original,id:nonGoogleId,user_id:nonGoogle,expected_version:1})));
      await tx.unsafe('set local role anon');await denied(tx,s=>s`select * from public.affairs_student_conduct`);await denied(tx,s=>s`select public.affairs_student_conduct_access()`);
      await denied(tx,s=>save(s,'save_student_conduct',next(original)));checks.push('own-cross-admin-nongoogle-anonymous-and-direct-write-isolation');

      await role(tx,administrator.id);
      const edit=next({...original,expected_version:1,reason_text:'',quantity_text:'0',void_status_text:' literal status ',row_order:0});
      const edited=await save(tx,'save_student_conduct',edit);assert.deepEqual(await save(tx,'save_student_conduct',edit),edited);
      await denied(tx,s=>save(s,'save_student_conduct',next(edit)),'PT409');
      assert.deepEqual((await tx`select occurred_on_text,student_number,student_name,academic_year_text,reason_text,quantity_text,void_status_text,row_order,source_mode,version from public.affairs_student_conduct where id=${recordId}`)[0],
        {occurred_on_text:' unparsed local date ',student_number:null,student_name:'',academic_year_text:'001',reason_text:'',quantity_text:'0',void_status_text:' literal status ',row_order:0,source_mode:'local_demo',version:2});
      await save(tx,'save_student_conduct',next({...edit,expected_version:2,quantity_text:null}));
      assert.equal((await tx`select quantity_text from public.affairs_student_conduct where id=${recordId}`)[0].quantity_text,null);
      const remove=next({...deletion,expected_version:3}),removed=await save(tx,'delete_student_conduct',remove);
      assert.deepEqual(await save(tx,'delete_student_conduct',remove),removed);assert.deepEqual(await save(tx,'save_student_conduct',original),first);
      await denied(tx,s=>save(s,'save_student_conduct',next({...original,expected_version:4})),'PT409');
      await denied(tx,s=>save(s,'save_student_conduct',next(original)),'PT409');
      await denied(tx,s=>save(s,'delete_student_conduct',next({...remove,expected_version:4})),'PT409');
      await role(tx,one);assert.equal((await tx`select * from public.affairs_student_conduct`).length,0);
      await tx.unsafe('reset role');assert.deepEqual((await tx`select version,deleted_at is not null as deleted from public.affairs_student_conduct where id=${recordId}`)[0],{version:4,deleted:true});
      await denied(tx,s=>s`update public.affairs_student_conduct set deleted_at=null where id=${recordId}`,'PT409');
      await denied(tx,s=>s`update public.affairs_student_conduct set user_id=${one} where id=${otherId}`);
      await denied(tx,s=>s`update public.affairs_student_conduct set id=${overflowId} where id=${otherId}`);
      await denied(tx,s=>s`update public.affairs_student_conduct set created_at=created_at+interval '1 second' where id=${otherId}`);
      await denied(tx,s=>s`update public.affairs_student_conduct set source_mode='official' where id=${otherId}`);
      checks.push('literal-null-blank-zero-stale-retry-immutable-owner-and-reserved-tombstones');

      await tx`insert into public.affairs_student_conduct(id,user_id,row_order) select value,${one},ordinal-1 from unnest(${capIds}::uuid[]) with ordinality cap(value,ordinal)`;
      await role(tx,administrator.id);const overflow=next({...original,id:overflowId});
      await denied(tx,s=>save(s,'save_student_conduct',overflow),'22023');
      await save(tx,'save_student_conduct',next({...original,id:capIds[1],expected_version:1}));
      await save(tx,'delete_student_conduct',next({id:capIds[0],user_id:one,expected_version:1}));await save(tx,'save_student_conduct',overflow);
      assert.equal((await tx`select count(*)::int as count from public.affairs_student_conduct where user_id=${one}`)[0].count,1000);
      await tx.unsafe('reset role');checks.push('active1000-row-limit-update-and-replacement-after-tombstone');
      const receipts=await tx`select request_id,payload from private.affairs_student_conduct_operations where user_id=${administrator.id} and request_id in ${tx([...requestIds])}`;
      assert.equal(requestIds.size,9);assert.equal(receipts.length,requestIds.size);assert.ok(receipts.every(row=>!Object.hasOwn(row.payload,'signed_url')));
      assert.equal((await tx`select count(*)::int as count from public.affairs_agent_audit where user_id=${administrator.id} and target_id in ${tx(targets)}`)[0].count,requestIds.size);
      assert.deepEqual(await fingerprint(tx,administrator.id),ownerBefore);checks.push('one-audit-per-exact-receipt-and-full-existing-owner-fingerprint');
      throw rollback;
    });
  }catch(error){if(error===rollback)rolledBack=true;else throw error;}
  finally{
    try{
      if(before){assert.deepEqual(await baseline(sql),before);if(historyBefore)assert.equal(await history(sql),historyBefore);}
      if(started){
        await absentObjects(sql);
        for(const userId of users){assert.equal((await sql`select count(*)::int as count from auth.users where id=${userId}`)[0].count,0);
          assert.equal((await sql`select count(*)::int as count from auth.identities where user_id=${userId}`)[0].count,0);
          assert.equal((await sql`select count(*)::int as count from public.affairs_profiles where user_id=${userId}`)[0].count,0);}
        assert.equal((await sql`select count(*)::int as count from public.affairs_agent_audit where target_id in ${sql(targets)}`)[0].count,0);
      }
      if(administrator&&ownerBefore)assert.deepEqual(await fingerprint(sql,administrator.id),ownerBefore);
    }finally{await sql.end({timeout:5});}
  }
  assert.ok(rolledBack,'Success requires the deliberate full transaction rollback.');
  console.log(JSON.stringify({status:'passed',mode:'rollback-only-migration-preflight',checks,baseline:before,
    cleanup:'Exact synthetic auth/profile/identity, conduct rows, receipts/audits and draft DDL rolled back; full existing owner fingerprint unchanged.',
    limitations:'No actual JWT/API/UI, certificate delivery or true parallel-request execution.'}));
}

if(options(process.argv.slice(2)).selfTest)offlineChecks();else await preflight();

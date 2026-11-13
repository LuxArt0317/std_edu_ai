import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {studentLoanApplicationStates,studentLoanPayloadBytes,studentLoanTextLimits,validateStudentLoanPayload} from '../../server/studentLoan.js';

// PREPARED ONLY: root must first grant the serialized client DB lease.
// --self-test opens zero DB connections and reads no credentials/environment.
// Example after Conduct200000: --execute --preflight --expected-migrations=130 --expected-rls=147
// Counts are explicit assertions, never inferred authorization. This applies ONLY
// draft210000 inside a deliberately rolled-back transaction, with no history insert.
// SQL claim-role checks are not actual JWT/API/browser/model acceptance. Held
// advisory locks and stale competing operations are checked; parallel RPCs are not.
const project='xiftudmvxphxcjtmfmib',version='20261112210000',prerequisite='20261112200000';
const migration='supabase/migrations/20261112210000_student_loan.sql',table='affairs_student_loan',operations='affairs_student_loan_operations';
const procedures=['public.affairs_student_loan_access()','public.affairs_manage_student_loan(text,jsonb)',
  'private.affairs_student_loan_identity_guard()','private.affairs_student_loan_fields(text)','private.affairs_student_loan_payload_valid(text,jsonb)'];
let phase='cli-validation',diagnostic=null,connectionsOpened=0,connectionClosed=true,cleanupVerified=false;
// Diagnostics contain only fixed code labels, bounded case positions, counts and
// booleans. Never capture payloads, identifiers, credentials or provider errors.
const validityDiagnostic=(index,expected,actual)=>({caseIndex:index,expectedValid:expected,actualValid:actual===true,actualIsBoolean:typeof actual==='boolean'});
const countDiagnostic=(index,expected,actual)=>({caseIndex:index,expectedBytes:expected,...(Number.isFinite(actual)?{actualBytes:actual}:{}),actualIsNumber:Number.isFinite(actual)});
async function assertInvalidJsonScalar(action,index){
  let rejected=false,sqlState,result;
  try{result=await action();}catch(error){rejected=true;if(typeof error?.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code))sqlState=error.code;}
  const returned=result?.[0]?.valid;
  diagnostic={caseIndex:index,rejected,...(sqlState?{sqlState}:{}),...(!rejected?{returnedIsBoolean:typeof returned==='boolean',...(typeof returned==='boolean'?{returnedValid:returned}:{})}:{})};
  assert.equal(rejected,true,'Invalid JSON scalar must be rejected before validator execution.');
  assert.ok(['22P02','22P05'].includes(sqlState),'Require the actual invalid JSON/Unicode SQLSTATE.');
}
function options(args){
  if(args.length===1&&args[0]==='--self-test')return {selfTest:true};
  assert.equal(new Set(args).size,args.length,'Duplicate flags are not permitted.');
  assert.ok(args.length===4&&args.includes('--execute')&&args.includes('--preflight'),'Require --execute --preflight and both exact expected counts; no connection opened.');
  const expected={};
  for(const [flag,key] of [['expected-migrations','migrations'],['expected-rls','rls_tables']]){
    const matches=args.filter(arg=>arg.startsWith('--'+flag+'='));assert.equal(matches.length,1,'Provide each expected count exactly once.');
    const value=matches[0].slice(flag.length+3);assert.match(value,/^[1-9]\d{0,5}$/,'Expected counts must be explicit positive integers.');expected[key]=Number(value);
  }
  return {selfTest:false,expected};
}
function clientTarget(connection){
  let target;try{target=new URL(connection);}catch{throw new Error('The client database connection is unavailable.');}
  const direct=target.hostname===`db.${project}.supabase.co`&&target.username==='postgres';
  const pooler=target.hostname.endsWith('.pooler.supabase.com')&&target.username===`postgres.${project}`;
  assert.ok(['postgres:','postgresql:'].includes(target.protocol)&&target.pathname==='/postgres'&&(direct||pooler)
    &&['','5432','6543'].includes(target.port)&&!target.hash,'Use only the exact client database.');
  for(const [key,value] of target.searchParams)assert.ok(key==='sslmode'&&['require','verify-ca','verify-full'].includes(value)||key==='pgbouncer'&&value==='true','Unsupported connection override.');
}
const literal=(id,user_id,request_id)=>({id,user_id,request_id,expected_version:0,current_term_label:' Synthetic term ',
  current_application_state:'unknown',current_application_text:null,progress_text:'',history_count:null,history_text:'  '});
function byteBoundary(payload){
  const value={...payload};for(const [field,limit] of Object.entries(studentLoanTextLimits))value[field]='\u0001'.repeat(limit);
  let text=value.current_application_text,replaced=0;
  while(studentLoanPayloadBytes(value)>32000){text='x'.repeat(++replaced)+'\u0001'.repeat(2000-replaced);value.current_application_text=text;}
  const remainder=32000-studentLoanPayloadBytes(value);
  value.current_application_text=['','é','界','😀','é😀'][remainder]+text.slice(remainder===4?2:remainder?1:0);
  return value;
}
function cases(original){
  const deletion={id:original.id,user_id:original.user_id,request_id:randomUUID(),expected_version:1},boundary=byteBoundary(original);
  const valid=[['save_student_loan',original],['save_student_loan',boundary],['delete_student_loan',deletion]],invalid=[];
  for(const [field,limit] of Object.entries(studentLoanTextLimits)){
    for(const value of [null,'','  ','😀'.repeat(limit),'𠮷'.repeat(limit)])valid.push(['save_student_loan',{...original,[field]:value}]);
    for(const value of [0,false,[],{},'😀'.repeat(limit+1)])invalid.push(['save_student_loan',{...original,[field]:value}]);
  }
  for(const state of studentLoanApplicationStates)for(const count of [null,0,1000000])valid.push(['save_student_loan',{...original,current_application_state:state,history_count:count}]);
  for(const kind of [null,'','constructor','__proto__','toString','other'])invalid.push([kind,original]);
  for(const [kind,value] of [['save_student_loan',original],['delete_student_loan',deletion]]){
    valid.push([kind,{...value,expected_version:999999998}]);
    for(const field of Object.keys(value)){const missing={...value};delete missing[field];invalid.push([kind,missing]);}
    for(const patch of [{extra:null},{signed_url:'DO-NOT-STORE'},{approved:true},{amount:0},{source_mode:'official'},{user_id:null},{id:'bad'},
      {request_id:'ABCDEF00-0000-4000-8000-000000000001'},{expected_version:null},{expected_version:'1'},{expected_version:-1},{expected_version:0.5},{expected_version:999999999}])invalid.push([kind,{...value,...patch}]);
  }
  for(const count of [-1,1000001,'0',0.1,false])invalid.push(['save_student_loan',{...original,history_count:count}]);
  for(const state of [null,'','applied','approved','UNKNOWN',0,{}])invalid.push(['save_student_loan',{...original,current_application_state:state}]);
  invalid.push(['save_student_loan',{...boundary,current_application_text:boundary.current_application_text.replace('x','é')}],
    ['delete_student_loan',{...deletion,expected_version:0}],['save_student_loan',{}],['save_student_loan',null],['save_student_loan',[]]);
  return [...valid.map(([kind,value])=>({kind,value,valid:true})),...invalid.map(([kind,value])=>({kind,value,valid:false}))];
}
async function offlineChecks(){
  assert.deepEqual(options(['--self-test']),{selfTest:true});
  for(const [migrations,rls] of [[130,147],[129,146]])assert.deepEqual(options(['--execute','--preflight',`--expected-migrations=${migrations}`,`--expected-rls=${rls}`]),{selfTest:false,expected:{migrations,rls_tables:rls}});
  for(const args of [[],['--execute'],['--preflight'],['--self-test','--execute'],['--self-test','--self-test'],
    ['--execute','--preflight','--expected-migrations=0','--expected-rls=147'],['--execute','--preflight','--expected-migrations=130','--expected-rls=01'],
    ['--execute','--preflight','--expected-migrations=130','--expected-migrations=131'],['--execute','--apply','--expected-migrations=130','--expected-rls=147']])assert.throws(()=>options(args));
  for(const url of [`postgres://postgres@db.${project}.supabase.co/postgres`,`postgresql://postgres.${project}@qa.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true`])clientTarget(url);
  for(const url of ['postgres://postgres@db.other.supabase.co/postgres','postgres://postgres.other@qa.pooler.supabase.com/postgres',
    `https://db.${project}.supabase.co/postgres`,`postgres://postgres@db.${project}.supabase.co/other`,`postgres://postgres.${project}@qa.pooler.supabase.com.invalid/postgres`,
    `postgres://prefix.postgres.${project}@qa.pooler.supabase.com/postgres`,`postgres://postgres@db.${project}.supabase.co/postgres?host=other.invalid`])assert.throws(()=>clientTarget(url));
  const fixture=literal(randomUUID(),randomUUID(),randomUUID()),matrix=cases(fixture),boundary=byteBoundary(fixture);
  for(const entry of matrix)assert.equal(validateStudentLoanPayload(entry.kind,entry.value)===null,entry.valid);
  assert.equal(studentLoanPayloadBytes(boundary),32000);assert.equal(studentLoanPayloadBytes({...boundary,current_application_text:boundary.current_application_text.replace('x','é')}),32001);
  for(const value of ['\0','\ud800','\udfff'])assert.ok(validateStudentLoanPayload('save_student_loan',{...fixture,progress_text:value}));
  assert.ok(validateStudentLoanPayload('save_student_loan',Object.create(fixture)));
  assert.deepEqual(validityDiagnostic(4,true,null),{caseIndex:4,expectedValid:true,actualValid:false,actualIsBoolean:false});
  assert.deepEqual(countDiagnostic(1,32000,'DO-NOT-LOG'),{caseIndex:1,expectedBytes:32000,actualIsNumber:false});
  await assertInvalidJsonScalar(async()=>{throw {code:'22P05',message:'DO-NOT-LOG'};},0);assert.deepEqual(diagnostic,{caseIndex:0,rejected:true,sqlState:'22P05'});
  for(const valid of [false,true]){
    await assert.rejects(assertInvalidJsonScalar(async()=>[{valid}],1));assert.deepEqual(diagnostic,{caseIndex:1,rejected:false,returnedIsBoolean:true,returnedValid:valid});
  }
  await assert.rejects(assertInvalidJsonScalar(async()=>{throw {code:'PRIVATE value',message:'DO-NOT-LOG'};},2));assert.deepEqual(diagnostic,{caseIndex:2,rejected:true});
  await assert.rejects(assertInvalidJsonScalar(async()=>{throw {code:'42501'};},3));assert.deepEqual(diagnostic,{caseIndex:3,rejected:true,sqlState:'42501'});
  // Installed postgres4 serializes a described JSONB parameter with stringify.
  // A raw JSON string must bind as text first; otherwise it becomes a JSON string
  // value, the invalid Unicode escape stays escaped, and the validator returns false.
  const {Types}=await import('../../node_modules/postgres/src/types.js'),types=Types();
  const raw='{"progress_text":"\\u0000","expected_version":1.0}';
  assert.equal(JSON.parse(types.serializer(3802)(raw)),raw);assert.equal(types.serializer(25)(raw),raw);
  assert.equal(typeof JSON.parse(types.serializer(25)(raw)),'object');diagnostic=null;
  const sql=await readFile(migration,'utf8');assert.match(sql,/expected:=\(\(p_payload->>'expected_version'\)::numeric\)::integer/);
  assert.match(sql,/\(\(p_payload->>'history_count'\)::numeric\)::integer/);assert.equal(connectionsOpened,0);
  const source=await readFile(new URL(import.meta.url),'utf8');
  assert.match(source,/affairs_manage_student_loan\(\$\{kind\},\$\{rawJson\}::text::jsonb\)/);
  assert.match(source,/affairs_student_loan_payload_valid\('save_student_loan',\$\{text\}::text::jsonb\)/);
  console.log(JSON.stringify({status:'passed',mode:'offline-guards',contractCases:matrix.length,databaseConnections:connectionsOpened,exampleBaseline:{migrations:130,rls_tables:147}}));
}

async function preflight(expected){
  phase='local-config-validation';const deployment=JSON.parse(await readFile('deployment.json','utf8'));
  assert.equal(deployment.repository.toLowerCase(),'luxart0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);
  const {deploymentEnvironment}=await import('../../scripts/deployment-env.mjs'),env=deploymentEnvironment();
  const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;clientTarget(connection);
  const migrationSql=await readFile(migration,'utf8');
  const {default:postgres}=await import('postgres');
  const sql=postgres(connection,{max:1,connect_timeout:10,idle_timeout:5,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
  connectionsOpened++;connectionClosed=false;
  const one=randomUUID(),two=randomUUID(),nonGoogle=randomUUID(),recordId=randomUUID(),otherId=randomUUID(),nonGoogleId=randomUUID(),replacementId=randomUUID(),spareId=randomUUID();
  // Allocate the exact fixture ledger before the first operation. No cleanup
  // DELETE, provider API or mutation of an existing account exists in this file.
  const users=[one,two,nonGoogle],targets=[recordId,otherId,nonGoogleId,replacementId,spareId];
  const attempts=[],accepted=new Map(),checks=[],rollback=Symbol('student loan deliberate rollback');
  let before,historyBefore,schemaBefore,administrator,ownerBefore,started=false,rolledBack=false;
  const baseline=async tx=>(await tx`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
  const history=async tx=>(await tx`select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.version),'[]'::jsonb)::text) as hash from supabase_migrations.schema_migrations m`)[0].hash;
  const schema=async tx=>(await tx`select md5(jsonb_build_object(
    'relations',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relowner,c.relacl,c.reloptions) order by n.nspname,c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
    'columns',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','private') and a.attnum>0 and not a.attisdropped),
    'constraints',(select jsonb_agg(jsonb_build_array(n.nspname,c.conname,c.conrelid,c.confrelid,pg_get_constraintdef(c.oid)) order by n.nspname,c.conrelid,c.conname) from pg_catalog.pg_constraint c join pg_catalog.pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','private')),
    'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by n.nspname,c.relname) from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
    'policies',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by n.nspname,c.relname,p.polname) from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
    'functions',(select jsonb_agg(jsonb_build_array(n.nspname,p.oid::regprocedure::text,p.proowner,p.proacl,pg_get_functiondef(p.oid)) order by n.nspname,p.oid::regprocedure::text) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind in ('f','p')),
    'triggers',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by n.nspname,c.relname,t.tgname) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and not t.tgisinternal)
  )::text) as hash`)[0].hash;
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
  const save=async(tx,kind,payload,rawJson=JSON.stringify(payload))=>{
    assert.ok(targets.includes(payload.id)&&users.includes(payload.user_id),'Every write must target an exact synthetic ledger entry.');
    assert.deepEqual(JSON.parse(rawJson),payload);attempts.push({kind,payload:{...payload}});
    const result=(await tx`select public.affairs_manage_student_loan(${kind},${rawJson}::text::jsonb) as result`)[0].result;
    assert.deepEqual(Object.keys(result).sort(),['id','kind','summary','version']);assert.equal(result.id,payload.id);assert.equal(result.kind,kind);assert.equal(result.version,payload.expected_version+1);
    const prior=accepted.get(payload.request_id);if(prior)assert.deepEqual(prior,{kind,payload,result});else accepted.set(payload.request_id,{kind,payload:{...payload},result});return result;
  };
  const original=literal(recordId,one,randomUUID());
  try{
    phase='baseline-and-protected-owner';before=await baseline(sql);assert.deepEqual(before,expected,'Actual database counts must match the explicitly approved baseline.');
    historyBefore=await history(sql);schemaBefore=await schema(sql);
    assert.equal((await sql`select count(*)::int as count from supabase_migrations.schema_migrations where version=${prerequisite}`)[0].count,1,'Conduct200000 must already be permanently applied.');
    assert.equal((await sql`select count(*)::int as count from supabase_migrations.schema_migrations where version=${version}`)[0].count,0);await absentObjects(sql);
    [administrator]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator,'Require the existing verified Google administrator; no existing identity/profile may be created or changed.');
    ownerBefore=await fingerprint(sql,administrator.id);assert.ok(!users.includes(administrator.id));
    assert.equal((await sql`select count(*)::int as count from auth.users where id in ${sql(users)}`)[0].count,0);
    assert.equal((await sql`select count(*)::int as count from public.affairs_agent_audit where target_id in ${sql(targets)}`)[0].count,0);
    await sql.begin(async tx=>{
      started=true;phase='draft-ddl';await tx.unsafe("set local lock_timeout='8s'");await tx.unsafe("set local statement_timeout='20s'");await tx.unsafe("set local idle_in_transaction_session_timeout='30s'");
      await tx.unsafe(migrationSql);assert.deepEqual(await baseline(tx),{migrations:expected.migrations,rls_tables:expected.rls_tables+1});assert.equal(await history(tx),historyBefore);
      for(const userId of users){
        const google=userId!==nonGoogle,email=`loan-qa-${userId}@example.invalid`;
        await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
          values('00000000-0000-0000-0000-000000000000',${userId},'authenticated','authenticated',${email},now(),
          ${tx.json(google?{provider:'google',providers:['google']}:{provider:'email',providers:['email']})},'{"full_name":"Synthetic Loan QA"}',now(),now())`;
        if(google)await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${userId},${userId},${tx.json({sub:userId,email,email_verified:true})},'google')`;
        await tx`insert into public.affairs_profiles(user_id,email,display_name,role) values(${userId},${email},'Synthetic Loan QA','student')`;
      }
      phase='strict-validation-query';diagnostic=null;const matrix=cases(original);
      const parity=await tx`select item.ordinal::int as ordinal,private.affairs_student_loan_payload_valid(item.value->>'kind',item.value->'value') as valid,
        octet_length((item.value->'value')::text) as bytes from jsonb_array_elements(${tx.json(matrix)}::jsonb) with ordinality item(value,ordinal) order by ordinal`;
      phase='strict-validation-cardinality';diagnostic={expectedCount:matrix.length,actualCount:parity.length};assert.equal(parity.length,matrix.length);
      for(const [index,entry] of matrix.entries()){
        phase='strict-validation-js-case-'+index;const jsValid=validateStudentLoanPayload(entry.kind,entry.value)===null;diagnostic=validityDiagnostic(index,entry.valid,jsValid);assert.equal(jsValid,entry.valid);
        phase='strict-validation-sql-case-'+index;diagnostic=validityDiagnostic(index,entry.valid,parity[index].valid);assert.equal(parity[index].valid,entry.valid);
        if(entry.valid){const bytes=studentLoanPayloadBytes(entry.value);phase='strict-validation-byte-count-case-'+index;diagnostic=countDiagnostic(index,bytes,parity[index].bytes);assert.equal(parity[index].bytes,bytes);}
      }
      for(const [index,invalidText] of ['\\u0000','\\ud800','\\udfff'].entries()){
        phase='strict-invalid-scalar-'+['nul','unpaired-high-surrogate','unpaired-low-surrogate'][index];diagnostic={caseIndex:index};
        const text=JSON.stringify({...original,progress_text:'REPLACE'}).replace('"REPLACE"','"'+invalidText+'"');
        await assertInvalidJsonScalar(()=>tx.savepoint(s=>s`select private.affairs_student_loan_payload_valid('save_student_loan',${text}::text::jsonb) as valid`),index);
      }
      for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE']){
        phase='strict-acl-authenticated-table-'+privilege.toLowerCase();diagnostic=null;
        const allowed=(await tx`select has_table_privilege('authenticated',${'public.'+table},${privilege}) as allowed`)[0].allowed;
        diagnostic={expectedAllowed:false,actualAllowed:allowed===true,actualIsBoolean:typeof allowed==='boolean'};assert.equal(allowed,false);
      }
      phase='strict-acl-authenticated-table-select';diagnostic=null;let allowed=(await tx`select has_table_privilege('authenticated',${'public.'+table},'SELECT') as allowed`)[0].allowed;
      diagnostic={expectedAllowed:true,actualAllowed:allowed===true,actualIsBoolean:typeof allowed==='boolean'};assert.equal(allowed,true);
      phase='strict-acl-anon-table-select';diagnostic=null;allowed=(await tx`select has_table_privilege('anon',${'public.'+table},'SELECT') as allowed`)[0].allowed;
      diagnostic={expectedAllowed:false,actualAllowed:allowed===true,actualIsBoolean:typeof allowed==='boolean'};assert.equal(allowed,false);
      for(const [index,signature] of procedures.entries()){
        const label=['access','manage','identity-guard','fields','payload-validator'][index];
        phase='strict-acl-authenticated-function-'+label;diagnostic=null;allowed=(await tx`select has_function_privilege('authenticated',${signature},'EXECUTE') as allowed`)[0].allowed;
        diagnostic={caseIndex:index,expectedAllowed:signature.startsWith('public.'),actualAllowed:allowed===true,actualIsBoolean:typeof allowed==='boolean'};assert.equal(allowed,signature.startsWith('public.'));
        phase='strict-acl-anon-function-'+label;diagnostic=null;allowed=(await tx`select has_function_privilege('anon',${signature},'EXECUTE') as allowed`)[0].allowed;
        diagnostic={caseIndex:index,expectedAllowed:false,actualAllowed:allowed===true,actualIsBoolean:typeof allowed==='boolean'};assert.equal(allowed,false);
      }
      diagnostic=null;
      checks.push('strict-js-sql-parity-codepoints-null-scalars-exact32000-byte-boundary-and-acls');

      phase='create-singleton-replay-and-access';await role(tx,administrator.id);
      assert.deepEqual((await tx`select public.affairs_student_loan_access() as result`)[0].result,{userId:administrator.id,canManage:true});
      const first=await save(tx,'save_student_loan',original);assert.deepEqual(await save(tx,'save_student_loan',original),first);
      await save(tx,'save_student_loan',next({...original,id:otherId,user_id:two}));await save(tx,'save_student_loan',next({...original,id:nonGoogleId,user_id:nonGoogle}));
      assert.equal((await tx`select count(*)::int as count from public.affairs_student_loan`)[0].count,3);
      await denied(tx,s=>save(s,'save_student_loan',next({...original,id:replacementId})),'PT409');
      await denied(tx,s=>save(s,'save_student_loan',{...original,history_text:'changed request'}),'PT409');
      await denied(tx,s=>save(s,'delete_student_loan',{id:recordId,user_id:one,request_id:original.request_id,expected_version:1}),'PT409');
      await denied(tx,s=>save(s,'save_student_loan',next(original)),'PT409');
      await denied(tx,s=>save(s,'save_student_loan',next({...original,user_id:two,expected_version:1})));
      await denied(tx,s=>save(s,'delete_student_loan',{id:recordId,user_id:two,request_id:randomUUID(),expected_version:1}));
      await denied(tx,s=>save(s,'save_student_loan',next({...original,expected_version:1,signed_url:'DO-NOT-STORE'})),'22023');
      await denied(tx,s=>s`update public.affairs_student_loan set progress_text='not allowed' where id=${recordId}`);
      await role(tx,one);assert.deepEqual((await tx`select id from public.affairs_student_loan`).map(row=>row.id),[recordId]);
      assert.deepEqual((await tx`select public.affairs_student_loan_access() as result`)[0].result,{userId:one,canManage:false});
      assert.equal((await tx`select count(*)::int as count from public.affairs_student_loan where user_id=${two}`)[0].count,0);
      await denied(tx,s=>save(s,'save_student_loan',next({...original,expected_version:1})));
      await denied(tx,s=>save(s,'delete_student_loan',{id:recordId,user_id:one,request_id:randomUUID(),expected_version:1}));
      await denied(tx,s=>s`insert into public.affairs_student_loan(id,user_id,current_application_state) values(${spareId},${one},'unknown')`);
      await denied(tx,s=>s`update public.affairs_student_loan set progress_text='not allowed' where id=${recordId}`);
      await denied(tx,s=>s`delete from public.affairs_student_loan where id=${recordId}`);await denied(tx,s=>s`select * from private.affairs_student_loan_operations`);
      await role(tx,two);assert.deepEqual((await tx`select id from public.affairs_student_loan`).map(row=>row.id),[otherId]);
      await role(tx,nonGoogle);assert.equal((await tx`select * from public.affairs_student_loan`).length,0);
      await denied(tx,s=>s`select public.affairs_student_loan_access()`);await denied(tx,s=>save(s,'save_student_loan',next({...original,id:nonGoogleId,user_id:nonGoogle,expected_version:1})));
      await tx.unsafe('set local role anon');await denied(tx,s=>s`select * from public.affairs_student_loan`);await denied(tx,s=>s`select public.affairs_student_loan_access()`);
      await denied(tx,s=>save(s,'save_student_loan',next(original)));checks.push('own-cross-admin-nongoogle-anonymous-direct-write-isolation-and-active-singleton');

      phase='literal-edit-boundary-and-stale';await role(tx,administrator.id);
      const edit=next({...original,expected_version:1,current_term_label:null,current_application_state:'recorded',current_application_text:'',progress_text:' literal progress ',history_count:0});
      const rawEdit=JSON.stringify(edit).replace('"expected_version":1','"expected_version":1.0').replace('"history_count":0','"history_count":0.0');
      const edited=await save(tx,'save_student_loan',edit,rawEdit);assert.deepEqual(await save(tx,'save_student_loan',edit),edited);
      await denied(tx,s=>save(s,'save_student_loan',next(edit)),'PT409');
      assert.deepEqual((await tx`select current_term_label,current_application_state,current_application_text,progress_text,history_count,history_text,source_mode,version from public.affairs_student_loan where id=${recordId}`)[0],
        {current_term_label:null,current_application_state:'recorded',current_application_text:'',progress_text:' literal progress ',history_count:0,history_text:'  ',source_mode:'local_demo',version:2});
      await save(tx,'save_student_loan',next({...edit,expected_version:2,history_count:null}));assert.equal((await tx`select history_count from public.affairs_student_loan where id=${recordId}`)[0].history_count,null);
      const boundary=byteBoundary(next({...original,id:otherId,user_id:two,expected_version:1}));
      assert.equal(studentLoanPayloadBytes(boundary),32000);await save(tx,'save_student_loan',boundary);
      const over=next({...boundary,expected_version:2,current_application_text:boundary.current_application_text.replace('x','é')});assert.equal(studentLoanPayloadBytes(over),32001);
      await denied(tx,s=>save(s,'save_student_loan',over),'22023');
      await save(tx,'save_student_loan',next({...original,id:otherId,user_id:two,expected_version:2,current_application_state:'not_applied',history_count:0}));
      await tx.unsafe('reset role');
      // An actual held-lock check, not a claim that two RPCs executed in parallel.
      for(const key of ['loan:actor:'+administrator.id,'loan:owner:'+one,'loan:record:'+recordId]){
        const [{held}]=await tx`with key as (select pg_catalog.hashtextextended(${key},0) as value)
          select exists(select 1 from pg_catalog.pg_locks l,key where l.pid=pg_backend_pid() and l.locktype='advisory' and l.granted and l.mode='ExclusiveLock'
            and l.objsubid=1 and l.classid::bigint=((key.value>>32)&4294967295::bigint) and l.objid::bigint=(key.value&4294967295::bigint)) as held`;
        assert.equal(held,true,'Successful writes must retain each expected transaction advisory lock.');
      }
      checks.push('literal-null-blank-zero-numeric1dot0-parity-bounded-writes-stale-version-and-held-advisory-locks');

      phase='tombstone-and-new-id-replacement';await role(tx,administrator.id);
      const remove={id:recordId,user_id:one,request_id:randomUUID(),expected_version:3},removed=await save(tx,'delete_student_loan',remove);
      assert.deepEqual(await save(tx,'delete_student_loan',remove),removed);assert.deepEqual(await save(tx,'save_student_loan',original),first);
      for(const expectedVersion of [0,4])await denied(tx,s=>save(s,'save_student_loan',next({...original,expected_version:expectedVersion})),'PT409');
      await denied(tx,s=>save(s,'delete_student_loan',next({...remove,expected_version:4})),'PT409');
      await role(tx,one);assert.equal((await tx`select * from public.affairs_student_loan`).length,0);
      await role(tx,administrator.id);const replacement=next({...original,id:replacementId}),replaced=await save(tx,'save_student_loan',replacement);
      assert.equal(replaced.version,1);assert.deepEqual(await save(tx,'save_student_loan',original),first);assert.deepEqual(await save(tx,'delete_student_loan',remove),removed);
      await denied(tx,s=>save(s,'save_student_loan',next({...original,id:spareId})),'PT409');
      await role(tx,one);assert.deepEqual((await tx`select id from public.affairs_student_loan`).map(row=>row.id),[replacementId]);
      await tx.unsafe('reset role');assert.deepEqual((await tx`select version,deleted_at is not null as deleted from public.affairs_student_loan where id=${recordId}`)[0],{version:4,deleted:true});
      await denied(tx,s=>s`update public.affairs_student_loan set deleted_at=null where id=${recordId}`,'PT409');
      for(const action of [s=>s`update public.affairs_student_loan set user_id=${one} where id=${otherId}`,s=>s`update public.affairs_student_loan set id=${spareId} where id=${otherId}`,
        s=>s`update public.affairs_student_loan set created_at=created_at+interval '1 second' where id=${otherId}`,s=>s`update public.affairs_student_loan set source_mode='official' where id=${otherId}`])await denied(tx,action);
      await denied(tx,s=>s`insert into public.affairs_student_loan(id,user_id,current_application_state) values(${spareId},${one},'unknown')`,'23505');
      checks.push('terminal-tombstones-immutable-owner-provenance-new-id-replacement-and-late-original-receipts');

      phase='exact-receipts-audit-owner';const receipts=await tx`select request_id,kind,payload,result from private.affairs_student_loan_operations where user_id=${administrator.id}`;
      assert.equal(accepted.size,9);assert.equal(receipts.length,accepted.size);
      for(const receipt of receipts){const entry=accepted.get(receipt.request_id);assert.ok(entry);assert.deepEqual({kind:receipt.kind,payload:receipt.payload,result:receipt.result},entry);}
      assert.ok(attempts.length>accepted.size);assert.ok(receipts.every(row=>!Object.hasOwn(row.payload,'signed_url')));
      assert.equal((await tx`select count(*)::int as count from public.affairs_agent_audit where user_id=${administrator.id} and target_id in ${tx(targets)}`)[0].count,accepted.size);
      assert.deepEqual(await fingerprint(tx,administrator.id),ownerBefore);checks.push('exact-success-only-receipts-audits-and-full-protected-owner-fingerprint');
      throw rollback;
    });
  }catch(error){if(error===rollback)rolledBack=true;else throw error;}
  finally{
    const previousPhase=phase,previousDiagnostic=diagnostic;phase='rollback-verification';diagnostic=null;
    try{
      if(before)assert.deepEqual(await baseline(sql),before);if(historyBefore)assert.equal(await history(sql),historyBefore);if(schemaBefore)assert.equal(await schema(sql),schemaBefore);
      if(started){
        await absentObjects(sql);
        for(const userId of users){assert.equal((await sql`select count(*)::int as count from auth.users where id=${userId}`)[0].count,0);
          assert.equal((await sql`select count(*)::int as count from auth.identities where user_id=${userId}`)[0].count,0);
          assert.equal((await sql`select count(*)::int as count from public.affairs_profiles where user_id=${userId}`)[0].count,0);}
        assert.equal((await sql`select count(*)::int as count from public.affairs_agent_audit where target_id in ${sql(targets)}`)[0].count,0);
      }
      if(administrator&&ownerBefore)assert.deepEqual(await fingerprint(sql,administrator.id),ownerBefore);
      cleanupVerified=started&&Boolean(schemaBefore)&&Boolean(ownerBefore);
    }finally{await sql.end({timeout:5});connectionClosed=true;}
    phase=previousPhase;diagnostic=previousDiagnostic;
  }
  assert.ok(rolledBack&&cleanupVerified,'Success requires deliberate rollback plus exact restoration checks.');phase='complete';
  console.log(JSON.stringify({status:'passed',mode:'rollback-only-migration-preflight',baseline:before,checks,
    fixtureCounts:{users:users.length,recordIds:targets.length,successfulRequests:accepted.size},cleanupVerified,connectionClosed,
    cleanup:'Draft DDL, exact fixtures and audits removed by rollback; public/private catalog fingerprint, migration history and complete protected owner fingerprint restored.',
    limitations:'No actual JWT/API/UI/model or parallel RPC execution; this checks claim roles, held advisory locks and stale competing operations.'}));
}

try{const config=options(process.argv.slice(2));if(config.selfTest)await offlineChecks();else await preflight(config.expected);}
catch(error){
  const code=typeof error?.code==='string'&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:'CHECK_FAILED';
  // Never emit connection strings, query parameters, protected owner rows or raw
  // provider errors. Phase and SQL/assertion code are sufficient to locate failure.
  console.error(JSON.stringify({status:'failed',phase,code,diagnostic,cleanupVerified,connectionClosed}));process.exitCode=1;
}

import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {dtmDashboardLayoutDefaults,dtmDashboardLayoutPayloadBytes,dtmDashboardLayoutMaxPayloadBytes,parseDtmDashboardLayout,validateDtmDashboardLayoutPayload} from '../../server/dtmDashboardLayout.js';
import {reserveDormitoryConductLease,dormitoryConductClientTarget,dormitoryConductAdvisoryLockKey} from './dormitory-conduct-rls-live.mjs';

// Prepared only: importing or --self-test reads no credentials and opens no DB.
// Root must hold the serialized DB lease before explicit --execute --preflight.
// All DDL, fixture users and commands run in one transaction that rolls back.
export const dashboardLayoutExpectedSchema=Object.freeze({migrations:132,rls_tables:149});
export const dashboardLayoutAdvisoryLockKey=dormitoryConductAdvisoryLockKey;
export const reserveDashboardLayoutLease=reserveDormitoryConductLease;
export const dashboardLayoutClientTarget=dormitoryConductClientTarget;
const project='xiftudmvxphxcjtmfmib',version='20261113230000',prerequisite='20261112220000';
const migration='supabase/migrations/20261113230000_dtm_dashboard_layout.sql';
const table='public.dtm_dashboard_layouts',operations='private.dtm_dashboard_layout_operations';
const saveKind='save_dtm_dashboard_layout',resetKind='reset_dtm_dashboard_layout';
const procedures=['public.affairs_save_dtm_dashboard_layout(text,jsonb)','private.dtm_dashboard_layout_blocks_valid(jsonb)',
  'private.dtm_dashboard_layout_payload_valid(text,jsonb)','private.dtm_dashboard_default_blocks()','private.dtm_dashboard_layout_identity_guard()'];

export function dashboardLayoutCliOptions(args){
  if(args.length===1&&args[0]==='--self-test')return {selfTest:true};
  const flags=['--execute','--preflight','--expected-migrations=132','--expected-rls=149'];
  assert.ok(args.length===4&&new Set(args).size===4&&flags.every(flag=>args.includes(flag)),
    'Require the root DB lease and --execute --preflight --expected-migrations=132 --expected-rls=149.');
  return {selfTest:false};
}
export function dashboardLayoutFixture(requestId=randomUUID()){
  return {request_id:requestId,expected_version:0,blocks:[
    {id:'contacts',visible:false,region:'content',weight:10},
    {id:'important',visible:true,region:'side-post',weight:-10},
    {id:'navigation',visible:true,region:'side-pre',weight:0},
  ]};
}
export function dashboardLayoutValidationCases(original=dashboardLayoutFixture()){
  const reset={request_id:original.request_id,expected_version:0};
  const valid=[[saveKind,original],[resetKind,reset]],invalid=[];
  for(const [kind,payload] of [[saveKind,original],[resetKind,reset]]){
    valid.push([kind,{...payload,expected_version:999999998}]);
    for(const key of Object.keys(payload)){const value={...payload};delete value[key];invalid.push([kind,value]);}
    for(const patch of [{id:randomUUID()},{user_id:randomUUID()},{source_mode:'official'},{extra:null},{request_id:null},
      {request_id:'ABCDEF00-0000-4000-8000-000000000001'},{expected_version:null},{expected_version:'0'},
      {expected_version:-1},{expected_version:0.5},{expected_version:999999999}])invalid.push([kind,{...payload,...patch}]);
  }
  for(const region of ['side-pre','side-post','content'])for(const visible of [false,true]){
    valid.push([saveKind,{...original,blocks:original.blocks.map(row=>({...row,region,visible,weight:0}))}]);
  }
  valid.push([saveKind,{...original,blocks:[...original.blocks].reverse()}]);
  for(const blocks of [null,{},[],original.blocks.slice(0,2),[...original.blocks,original.blocks[0]],
    [original.blocks[0],original.blocks[0],original.blocks[2]]])invalid.push([saveKind,{...original,blocks}]);
  for(const key of ['id','visible','region','weight']){
    const blocks=structuredClone(original.blocks);delete blocks[0][key];invalid.push([saveKind,{...original,blocks}]);
  }
  for(const patch of [{id:'html'},{id:''},{id:'重要'},{id:'\ud800'},{visible:1},{visible:'false'},{visible:null},
    {region:'left'},{region:''},{region:null},{weight:-11},{weight:11},{weight:0.1},{weight:'0'},{weight:null},{title:'Synthetic'},{html:'<script>synthetic</script>'}]){
    const blocks=structuredClone(original.blocks);Object.assign(blocks[0],patch);invalid.push([saveKind,{...original,blocks}]);
  }
  for(const kind of [null,'','constructor','__proto__','toString','other'])invalid.push([kind,original]);
  for(const value of [null,[],{},false,'layout'])invalid.push([saveKind,value]);
  invalid.push([resetKind,{...reset,blocks:original.blocks}]);
  // A lone surrogate cannot be represented in PostgreSQL JSONB. Its direct cast
  // rejection is checked separately, not embedded in the parity matrix.
  return [...valid.map(([kind,value])=>({kind,value,valid:true})),...invalid.filter(([,value])=>
    !value?.blocks?.some?.(row=>row?.id==='\ud800')).map(([kind,value])=>({kind,value,valid:false}))];
}
/** Preserve numeric scale in raw JSON to exercise PostgreSQL's exact byte cap. */
export function dashboardLayoutNumericBoundary(payload,bytes=dtmDashboardLayoutMaxPayloadBytes){
  assert.equal(payload.expected_version,0);assert.equal(validateDtmDashboardLayoutPayload(saveKind,payload),null);
  const zeros=bytes-dtmDashboardLayoutPayloadBytes(payload)-1;assert.ok(Number.isSafeInteger(zeros)&&zeros>0);
  const raw=JSON.stringify(payload).replace('"expected_version":0','"expected_version":0.'+'0'.repeat(zeros));
  assert.deepEqual(JSON.parse(raw),payload);return raw;
}
export function dashboardLayoutBlocksBoundary(payload,bytes=1024){
  const zeros=bytes-dtmDashboardLayoutPayloadBytes(payload.blocks)-1;assert.ok(Number.isSafeInteger(zeros)&&zeros>0);
  const raw=JSON.stringify(payload).replace('"weight":0','"weight":0.'+'0'.repeat(zeros));
  assert.deepEqual(JSON.parse(raw),payload);return raw;
}
export function dashboardLayoutFixtureActor(actor,users){
  assert.ok(users.includes(actor)||actor===null,'Only synthetic users may invoke layout writes.');
}
export function dashboardLayoutCheckedReceipt(kind,payload,value){
  const parsed=parseDtmDashboardLayout(value);
  assert.equal(parsed.version,payload.expected_version+1);
  assert.deepEqual(parsed.blocks,kind===saveKind?payload.blocks:dtmDashboardLayoutDefaults().blocks);
  return parsed;
}
export async function dashboardLayoutOfflineChecks(){
  assert.deepEqual(dashboardLayoutCliOptions(['--self-test']),{selfTest:true});
  dashboardLayoutCliOptions(['--execute','--preflight','--expected-migrations=132','--expected-rls=149']);
  for(const args of [[],['--execute'],['--self-test','--execute'],['--execute','--preflight','--expected-migrations=131','--expected-rls=149']])assert.throws(()=>dashboardLayoutCliOptions(args));
  dashboardLayoutClientTarget(`postgres://postgres@db.${project}.supabase.co/postgres`);
  dashboardLayoutClientTarget(`postgres://postgres.${project}@qa.pooler.supabase.com:5432/postgres?sslmode=require`);
  for(const url of ['postgres://postgres@db.other.supabase.co/postgres',`postgres://postgres.${project}@qa.pooler.supabase.com:6543/postgres`,
    `postgres://postgres@db.${project}.supabase.co/postgres?host=other.invalid`])assert.throws(()=>dashboardLayoutClientTarget(url));
  const fixture=dashboardLayoutFixture(),matrix=dashboardLayoutValidationCases(fixture);
  for(const entry of matrix)assert.equal(validateDtmDashboardLayoutPayload(entry.kind,entry.value)===null,entry.valid);
  for(const bytes of [2048,2049])assert.deepEqual(JSON.parse(dashboardLayoutNumericBoundary(fixture,bytes)),fixture);
  for(const bytes of [1024,1025])assert.deepEqual(JSON.parse(dashboardLayoutBlocksBoundary(fixture,bytes)),fixture);
  const {Types}=await import('../../node_modules/postgres/src/types.js'),types=Types(),raw=dashboardLayoutNumericBoundary(fixture);
  assert.equal(types.serializer(25)(raw),raw);assert.equal(typeof JSON.parse(types.serializer(3802)(raw)),'string');
  return {status:'passed',mode:'offline-contracts',contractCases:matrix.length,databaseConnections:0};
}

async function preflight(){
  let phase='local-config',diagnostic=null,lease,pool,sql,before,historyBefore,schemaBefore,owner,ownerBefore;
  let started=false,rolledBack=false,cleanupVerified=false,connectionClosed=true,failure=null,actor=null;
  const users=Array.from({length:3},()=>randomUUID()),[one,two,nonGoogle]=users;
  const courseIds=Array.from({length:2},()=>randomUUID()),materialIds=Array.from({length:2},()=>randomUUID());
  const accepted=new Map(),attempts=[],checks=[];
  const baseline=async q=>(await q`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
  const history=async q=>(await q`select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.version),'[]'::jsonb)::text) as hash from supabase_migrations.schema_migrations m`)[0].hash;
  const schema=async q=>(await q`select md5(jsonb_build_object(
    'relations',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relowner,c.relacl,c.reloptions) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
    'columns',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','private') and a.attnum>0 and not a.attisdropped),
    'constraints',(select jsonb_agg(jsonb_build_array(n.nspname,c.conname,c.conrelid,c.confrelid,pg_get_constraintdef(c.oid)) order by n.nspname,c.conrelid,c.conname) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','private')),
    'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by n.nspname,c.relname) from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
    'policies',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by n.nspname,c.relname,p.polname) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
    'functions',(select jsonb_agg(jsonb_build_array(n.nspname,p.oid::regprocedure::text,p.proowner,p.proacl,pg_get_functiondef(p.oid)) order by n.nspname,p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind in ('f','p')),
    'triggers',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and not t.tgisinternal)
  )::text) as hash`)[0].hash;
  const fingerprint=async id=>(await sql`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
    from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
  const unrelated=async q=>(await q`select md5(jsonb_build_object(
    'profiles',(select jsonb_agg(to_jsonb(p) order by p.user_id) from public.affairs_profiles p where p.user_id=any(${users}::uuid[])),
    'students',(select jsonb_agg(to_jsonb(s) order by s.id) from public.affairs_students s where s.user_id=any(${users}::uuid[])),
    'courses',(select jsonb_agg(to_jsonb(c) order by c.id) from public.dtm_courses c where c.user_id=any(${users}::uuid[])),
    'materials',(select jsonb_agg(to_jsonb(m) order by m.id) from public.dtm_materials m where m.course_id=any(${courseIds}::uuid[])),
    'meetings',(select jsonb_agg(to_jsonb(m) order by m.id) from public.dtm_meetings m where m.course_id=any(${courseIds}::uuid[])),
    'grades',(select jsonb_agg(to_jsonb(g) order by g.id) from public.dtm_grade_items g where g.course_id=any(${courseIds}::uuid[])),
    'assignments',(select jsonb_agg(to_jsonb(a) order by a.id) from public.affairs_assignments a where a.dtm_course_id=any(${courseIds}::uuid[])),
    'other_audits',(select jsonb_agg(to_jsonb(a) order by a.id) from public.affairs_agent_audit a where a.user_id=any(${users}::uuid[]))
  )::text) as hash`)[0].hash;
  const absent=async()=>{
    for(const name of [table,operations])assert.equal((await sql`select to_regclass(${name}) as name`)[0].name,null);
    for(const name of procedures)assert.equal((await sql`select to_regprocedure(${name}) as name`)[0].name,null);
  };
  const role=async(tx,userId)=>{await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${userId},true)`;actor=userId;};
  const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
  const next=value=>({...value,request_id:randomUUID()});
  const write=async(tx,kind,payload,raw=JSON.stringify(payload))=>{
    dashboardLayoutFixtureActor(actor,users);
    assert.deepEqual(JSON.parse(raw),payload);const userId=actor;attempts.push({userId,kind,payload:structuredClone(payload)});
    const result=(await tx`select public.affairs_save_dtm_dashboard_layout(${kind},${raw}::text::jsonb) as result`)[0].result;
    dashboardLayoutCheckedReceipt(kind,payload,result);
    const entry={userId,kind,payload:structuredClone(payload),result},key=userId+':'+payload.request_id,prior=accepted.get(key);
    if(prior)assert.deepEqual(prior,entry);else accepted.set(key,entry);return result;
  };
  try{
    const deployment=JSON.parse(await readFile('deployment.json','utf8'));assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);
    const {deploymentEnvironment}=await import('../../scripts/deployment-env.mjs'),env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
    dashboardLayoutClientTarget(connection);const ddl=await readFile(migration,'utf8'),{default:postgres}=await import('postgres');
    pool=postgres(connection,{max:1,max_lifetime:0,idle_timeout:0,connect_timeout:10,onclose:()=>lease?.lose(),connection:{statement_timeout:20000},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});connectionClosed=false;
    phase='physical-session-lease';lease=await reserveDashboardLayoutLease(pool);sql=lease.sql;
    phase='baseline-and-protected-owner';before=await baseline(sql);assert.deepEqual(before,dashboardLayoutExpectedSchema);historyBefore=await history(sql);schemaBefore=await schema(sql);
    assert.equal((await sql`select count(*)::int as n from supabase_migrations.schema_migrations where version=${prerequisite}`)[0].n,1);
    assert.equal((await sql`select count(*)::int as n from supabase_migrations.schema_migrations where version=${version}`)[0].n,0);await absent();
    assert.notEqual((await sql`select to_regprocedure('private.affairs_google_identity()') as name`)[0].name,null);
    [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'Existing protected Google administrator required; no promotion or repair.');assert.ok(!users.includes(owner.id));ownerBefore=await fingerprint(owner.id);
    for(const name of ['auth.users','public.affairs_profiles'])assert.equal((await sql`select count(*)::int as n from ${sql(name)} where ${sql(name==='auth.users'?'id':'user_id')}=any(${users}::uuid[])`)[0].n,0);
    await lease.rollbackOnly(async tx=>{
      started=true;phase='draft-ddl';await tx.unsafe("set local lock_timeout='8s'");await tx.unsafe("set local idle_in_transaction_session_timeout='30s'");await tx.unsafe(ddl);
      assert.deepEqual(await baseline(tx),{migrations:132,rls_tables:150});assert.equal(await history(tx),historyBefore);
      assert.deepEqual((await tx`select private.dtm_dashboard_default_blocks() as value`)[0].value,dtmDashboardLayoutDefaults().blocks);
      for(const userId of users){const google=userId!==nonGoogle,email=`dtm-layout-qa-${userId}@example.invalid`;
        await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
          values('00000000-0000-0000-0000-000000000000',${userId},'authenticated','authenticated',${email},now(),
            ${tx.json(google?{provider:'google',providers:['google']}:{provider:'email',providers:['email']})},'{"full_name":"Synthetic DTM Layout QA"}',now(),now())`;
        if(google)await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${userId},${userId},${tx.json({sub:userId,email,email_verified:true})},'google')`;
      }
      // Do not initialize profiles or sample work. Existing DTM fixture records
      // independently prove layout save/reset never repurposes course storage.
      for(const [index,userId] of [one,two].entries()){
        await tx`insert into public.dtm_courses(id,user_id,code,title,term,source_mode) values(${courseIds[index]},${userId},'SYNTHETIC-LAYOUT','Synthetic preserved course','Synthetic local term','personal')`;
        await tx`insert into public.dtm_materials(id,course_id,title,kind,summary,source_mode,position) values(${materialIds[index]},${courseIds[index]},'Synthetic preserved material','page','Synthetic local content','personal',1)`;
      }
      const otherBefore=await unrelated(tx),original=dashboardLayoutFixture(),matrix=dashboardLayoutValidationCases(original);
      phase='strict-validation-matrix';const parity=await tx`select item.ordinal::int as ordinal,private.dtm_dashboard_layout_payload_valid(item.value->>'kind',item.value->'value') as valid,
        octet_length((item.value->'value')::text) as bytes from jsonb_array_elements(${tx.json(matrix)}::jsonb) with ordinality item(value,ordinal) order by ordinal`;
      assert.equal(parity.length,matrix.length);
      for(const [index,entry] of matrix.entries()){
        phase='strict-validation-case-'+index;diagnostic={caseIndex:index,expectedValid:entry.valid,actualValid:parity[index].valid===true};
        assert.equal(parity[index].valid,entry.valid);assert.equal(validateDtmDashboardLayoutPayload(entry.kind,entry.value)===null,entry.valid);
        if(entry.valid){phase='strict-bytes-case-'+index;diagnostic={caseIndex:index,expectedBytes:dtmDashboardLayoutPayloadBytes(entry.value),actualBytes:parity[index].bytes};assert.equal(parity[index].bytes,dtmDashboardLayoutPayloadBytes(entry.value));}
      }
      for(const bytes of [2048,2049]){phase='strict-byte-limit-'+bytes;const raw=dashboardLayoutNumericBoundary(original,bytes);
        const [row]=await tx`select octet_length((${raw}::text::jsonb)::text) as bytes,private.dtm_dashboard_layout_payload_valid(${saveKind},${raw}::text::jsonb) as valid`;
        diagnostic={expectedBytes:bytes,actualBytes:row.bytes,expectedValid:bytes===2048,actualValid:row.valid===true};assert.equal(row.bytes,bytes);assert.equal(row.valid,bytes===2048);}
      for(const bytes of [1024,1025]){phase='strict-block-byte-limit-'+bytes;const raw=dashboardLayoutBlocksBoundary(original,bytes);
        const [row]=await tx`select octet_length(((${raw}::text::jsonb)->'blocks')::text) as bytes,private.dtm_dashboard_layout_payload_valid(${saveKind},${raw}::text::jsonb) as valid`;
        diagnostic={expectedBytes:bytes,actualBytes:row.bytes,expectedValid:bytes===1024,actualValid:row.valid===true};assert.equal(row.bytes,bytes);assert.equal(row.valid,bytes===1024);}
      diagnostic=null;
      for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE']){phase='acl-authenticated-'+privilege.toLowerCase();assert.equal((await tx`select has_table_privilege('authenticated',${table},${privilege}) as allowed`)[0].allowed,false);}
      phase='acl-select';assert.equal((await tx`select has_table_privilege('authenticated',${table},'SELECT') as allowed`)[0].allowed,true);assert.equal((await tx`select has_table_privilege('anon',${table},'SELECT') as allowed`)[0].allowed,false);
      for(const roleName of ['anon','authenticated'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
        phase='acl-receipts-'+roleName+'-'+privilege.toLowerCase();assert.equal((await tx`select has_table_privilege(${roleName},${operations},${privilege}) as allowed`)[0].allowed,false);}
      for(const [index,name] of procedures.entries()){phase='acl-function-'+index;
        assert.equal((await tx`select has_function_privilege('authenticated',${name},'EXECUTE') as allowed`)[0].allowed,name.startsWith('public.'));
        assert.equal((await tx`select has_function_privilege('anon',${name},'EXECUTE') as allowed`)[0].allowed,false);}
      checks.push('strict-three-block-validation-jsonb-byte-boundaries-and-acls');
      phase='owner-create-and-replay';await role(tx,one);assert.equal((await tx`select user_id from public.dtm_dashboard_layouts`).length,0);
      const first=await write(tx,saveKind,original,dashboardLayoutNumericBoundary(original));assert.deepEqual(await write(tx,saveKind,original),first);
      await denied(tx,s=>write(s,saveKind,next(original)),'PT409');await denied(tx,s=>write(s,saveKind,{...original,blocks:[...original.blocks].reverse()}),'PT409');
      await denied(tx,s=>write(s,resetKind,{request_id:original.request_id,expected_version:0}),'PT409');
      await denied(tx,s=>write(s,saveKind,{...next(original),user_id:two}),'22023');
      const oversized=next(original);await denied(tx,s=>write(s,saveKind,oversized,dashboardLayoutNumericBoundary(oversized,2049)),'22023');
      await denied(tx,s=>s`insert into public.dtm_dashboard_layouts(user_id,version,blocks) values(${two},1,${s.json(original.blocks)})`);
      await denied(tx,s=>s`update public.dtm_dashboard_layouts set blocks=${s.json(dtmDashboardLayoutDefaults().blocks)} where user_id=${one}`);
      await denied(tx,s=>s`delete from public.dtm_dashboard_layouts where user_id=${one}`);await denied(tx,s=>s`select * from private.dtm_dashboard_layout_operations`);
      await role(tx,two);assert.equal((await tx`select user_id from public.dtm_dashboard_layouts`).length,0);
      const emptyReset={request_id:original.request_id,expected_version:0},second=await write(tx,resetKind,emptyReset);assert.deepEqual(await write(tx,resetKind,emptyReset),second);
      assert.deepEqual((await tx`select user_id,blocks from public.dtm_dashboard_layouts`)[0],{user_id:two,blocks:dtmDashboardLayoutDefaults().blocks});
      await role(tx,one);assert.deepEqual((await tx`select user_id,blocks from public.dtm_dashboard_layouts`)[0],{user_id:one,blocks:original.blocks});
      assert.deepEqual(await write(tx,saveKind,original),first);
      await role(tx,owner.id);assert.equal((await tx`select user_id from public.dtm_dashboard_layouts where user_id=any(${users}::uuid[])`).length,0);
      await denied(tx,s=>s`select * from private.dtm_dashboard_layout_operations`);
      checks.push('own-isolation-admin-no-bypass-first-reset-scoped-receipts-and-direct-write-denial');
      phase='cas-edit-reset-and-late-replay';await role(tx,one);
      const edit=next({...original,expected_version:1,blocks:original.blocks.map(row=>({...row,visible:true,weight:0}))}),edited=await write(tx,saveKind,edit);
      assert.deepEqual(await write(tx,saveKind,edit),edited);await denied(tx,s=>write(s,saveKind,next(edit)),'PT409');
      const reset={request_id:randomUUID(),expected_version:2},resetResult=await write(tx,resetKind,reset);assert.deepEqual(await write(tx,resetKind,reset),resetResult);
      assert.deepEqual(await write(tx,saveKind,original),first);assert.deepEqual(await write(tx,saveKind,edit),edited);
      assert.deepEqual((await tx`select version,blocks from public.dtm_dashboard_layouts where user_id=${one}`)[0],{version:3,blocks:dtmDashboardLayoutDefaults().blocks});
      await denied(tx,s=>write(s,saveKind,next(original)),'PT409');await denied(tx,s=>write(s,saveKind,next(edit)),'PT409');await denied(tx,s=>write(s,resetKind,next(reset)),'PT409');
      const afterReset=next({...original,expected_version:3});await write(tx,saveKind,afterReset);assert.deepEqual(await write(tx,resetKind,reset),resetResult);
      assert.deepEqual((await tx`select version,blocks from public.dtm_dashboard_layouts where user_id=${one}`)[0],{version:4,blocks:original.blocks});
      checks.push('serial-stale-cas-reset-revision-boundary-and-nonmutating-late-receipts');
      phase='nongoogle-anonymous-and-revocation';await role(tx,nonGoogle);assert.equal((await tx`select user_id from public.dtm_dashboard_layouts`).length,0);
      await denied(tx,s=>write(s,saveKind,next(original)));await denied(tx,s=>write(s,resetKind,{request_id:randomUUID(),expected_version:0}));
      await tx.unsafe('set local role anon');actor=null;await tx`select set_config('request.jwt.claim.sub','',true)`;
      await denied(tx,s=>s`select * from public.dtm_dashboard_layouts`);await denied(tx,s=>write(s,saveKind,next(original)));
      await tx.unsafe('reset role');await tx`delete from auth.identities where user_id=${two} and provider='google' and provider_id=${two}`;
      await role(tx,two);assert.equal((await tx`select user_id from public.dtm_dashboard_layouts`).length,0);
      await denied(tx,s=>write(s,resetKind,emptyReset));await denied(tx,s=>write(s,saveKind,{...next(original),expected_version:1}));
      checks.push('nongoogle-anonymous-and-revoked-google-denied-before-receipt-replay');
      phase='receipts-other-records-and-owner';await tx.unsafe('reset role');
      await denied(tx,s=>s`update public.dtm_dashboard_layouts set user_id=${nonGoogle},version=version+1 where user_id=${one}`);
      await denied(tx,s=>s`update public.dtm_dashboard_layouts set created_at=created_at+interval '1 second',version=version+1 where user_id=${one}`);
      await denied(tx,s=>s`update public.dtm_dashboard_layouts set version=version+2 where user_id=${one}`,'PT409');
      const receipts=await tx`select user_id,request_id,kind,payload,result from private.dtm_dashboard_layout_operations where user_id=any(${users}::uuid[])`;
      assert.equal(accepted.size,5);assert.equal(receipts.length,accepted.size);
      for(const row of receipts){const entry=accepted.get(row.user_id+':'+row.request_id);assert.ok(entry);assert.deepEqual({userId:row.user_id,kind:row.kind,payload:row.payload,result:row.result},entry);}
      assert.ok(attempts.length>accepted.size);assert.equal((await tx`select count(*)::int as n from public.dtm_dashboard_layouts where user_id=any(${users}::uuid[])`)[0].n,2);
      assert.equal(await unrelated(tx),otherBefore);assert.deepEqual(await fingerprint(owner.id),ownerBefore);
      checks.push('one-durable-audit-receipt-per-write-other-dtm-records-and-protected-owner-unchanged');
    });rolledBack=true;
  }catch(error){failure={phase,code:typeof error?.code==='string'&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:'CHECK_FAILED',diagnostic};}
  finally{
    try{if(lease){await lease.assertHeld();if(before)assert.deepEqual(await baseline(sql),before);if(historyBefore)assert.equal(await history(sql),historyBefore);if(schemaBefore)assert.equal(await schema(sql),schemaBefore);
      if(started){await absent();for(const [name,column,ids] of [['auth.users','id',users],['auth.identities','user_id',users],['public.affairs_profiles','user_id',users],['public.dtm_courses','id',courseIds],['public.dtm_materials','id',materialIds]])
        assert.equal((await sql`select ${sql(column)} from ${sql(name)} where ${sql(column)}=any(${ids}::uuid[])`).length,0);}
      if(ownerBefore)assert.deepEqual(await fingerprint(owner.id),ownerBefore);cleanupVerified=started&&Boolean(schemaBefore)&&Boolean(ownerBefore);}}
    catch{cleanupVerified=false;failure??={phase:'exact-rollback-verification',code:'CHECK_FAILED',diagnostic:null};}
    try{if(lease)await lease.release();}catch{cleanupVerified=false;failure??={phase:'physical-lease-release',code:'CHECK_FAILED',diagnostic:null};}
    try{if(pool)await pool.end({timeout:5});connectionClosed=true;}catch{failure??={phase:'database-close',code:'CHECK_FAILED',diagnostic:null};}
  }
  const passed=!failure&&rolledBack&&cleanupVerified&&connectionClosed;
  console.log(JSON.stringify({status:passed?'passed':'failed',mode:'rollback-only-migration-preflight',baseline:before,checks,cleanupVerified,connectionClosed,
    fixtureCounts:{users:users.length,courses:courseIds.length,successfulRequests:accepted.size},...(failure?{failure}:{}),
    limitations:'SQL role claims and sequential stale operations only; no actual JWT, HTTP, UI, model or parallel RPC acceptance.'}));
  if(!passed)process.exitCode=1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{if(dashboardLayoutCliOptions(process.argv.slice(2)).selfTest)console.log(JSON.stringify(await dashboardLayoutOfflineChecks()));else await preflight();}
  catch{console.error(JSON.stringify({status:'failed',phase:'offline-or-cli-gate',databaseConnections:0}));process.exitCode=1;}
}

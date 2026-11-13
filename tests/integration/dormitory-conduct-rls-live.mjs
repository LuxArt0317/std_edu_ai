import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {dormitoryConductPayloadBytes,validateDormitoryConductPayload} from '../../server/dormitoryConduct.js';

// PREPARED ONLY. Root must grant the serialized DB lease before --execute.
// --self-test/import reads no credentials and opens no database connections.
// Draft220000 is applied ONLY inside one transaction that always rolls back.
// No HTTP/JWT/browser/model acceptance or parallel RPC execution is claimed.
const project='xiftudmvxphxcjtmfmib',version='20261112220000',prerequisite='20261112210000';
const migration='supabase/migrations/20261112220000_dormitory_conduct.sql';
const table='affairs_dormitory_conduct',operations='affairs_dormitory_conduct_operations';
const procedures=['public.affairs_dormitory_conduct_access()','public.affairs_manage_dormitory_conduct(text,jsonb)',
  'private.affairs_dormitory_conduct_identity_guard()','private.affairs_dormitory_conduct_fields(text)','private.affairs_dormitory_conduct_payload_valid(text,jsonb)'];
export const dormitoryConductExpectedSchema=Object.freeze({migrations:131,rls_tables:148});
export const dormitoryConductAdvisoryLockKey=Object.freeze([23101314,115100]);
export function dormitoryConductCliOptions(args){
  if(args.length===1&&args[0]==='--self-test')return {selfTest:true};
  const approved=['--execute','--preflight','--expected-migrations=131','--expected-rls=148'];
  assert.ok(args.length===4&&new Set(args).size===4&&approved.every(flag=>args.includes(flag)),
    'Require the root DB lease and --execute --preflight --expected-migrations=131 --expected-rls=148.');
  return {selfTest:false};
}
export function dormitoryConductClientTarget(connection){
  let target;try{target=new URL(connection);}catch{throw new Error('Client database connection unavailable.');}
  const direct=target.hostname===`db.${project}.supabase.co`&&target.username==='postgres';
  const pooler=target.hostname.endsWith('.pooler.supabase.com')&&target.username===`postgres.${project}`;
  assert.ok(['postgres:','postgresql:'].includes(target.protocol)&&target.pathname==='/postgres'&&(direct||pooler)&&['','5432'].includes(target.port)&&!target.hash,'Exact client direct/session-pool connection required.');
  for(const [key,value] of target.searchParams)assert.ok(key==='sslmode'&&['require','verify-ca','verify-full'].includes(value),'Unsupported connection override.');
}
/** One physical session owns the shared advisory lease and all rollback work. */
export async function reserveDormitoryConductLease(pool,{onLost=()=>{}}={}){
  const reserved=await pool.reserve();let pid=null,held=false,lost=false,released=false,inTransaction=false,savepointNumber=0;
  const lose=()=>{if(!released&&!lost){lost=true;held=false;onLost();}};
  async function assertHeld(){
    assert.ok(held&&!lost&&!released,'Dormitory conduct DB lease unavailable.');
    try{
      const [row]=await reserved`select pg_backend_pid() as pid,exists(select 1 from pg_catalog.pg_locks where pid=pg_backend_pid()
        and locktype='advisory' and granted and mode='ExclusiveLock' and classid=${dormitoryConductAdvisoryLockKey[0]}::oid
        and objid=${dormitoryConductAdvisoryLockKey[1]}::oid and objsubid=2) as held`;
      assert.ok(!lost&&row?.pid===pid&&row.held===true,'Dormitory conduct physical session or shared lock changed.');
    }catch(error){lose();throw error;}
  }
  async function withHeld(action){await assertHeld();assert.ok(!lost&&!released);return action();}
  function sql(...args){return Array.isArray(args[0])&&Object.hasOwn(args[0],'raw')?withHeld(()=>reserved(...args)):reserved(...args);}
  sql.json=(...args)=>reserved.json(...args);
  sql.unsafe=(...args)=>withHeld(()=>reserved.unsafe(...args));
  sql.savepoint=async action=>{
    assert.ok(inTransaction,'Savepoints require the rollback transaction.');const name='dormitory_qa_'+(++savepointNumber);
    await withHeld(()=>reserved.unsafe('savepoint '+name));
    try{const result=await action(sql);await withHeld(()=>reserved.unsafe('release savepoint '+name));return result;}
    catch(error){
      // A failed SQL statement aborts its subtransaction, so do not query the
      // lock view until ROLLBACK TO has recovered it. The reservation cannot reconnect.
      try{assert.ok(!lost&&!released);await reserved.unsafe('rollback to savepoint '+name);await withHeld(()=>reserved.unsafe('release savepoint '+name));}
      catch(rollbackError){lose();throw rollbackError;}throw error;
    }
  };
  async function rollbackOnly(action){
    assert.ok(!inTransaction,'Nested main transactions are forbidden.');await withHeld(()=>reserved.unsafe('begin'));inTransaction=true;
    try{await assertHeld();const result=await action(sql);await withHeld(()=>reserved.unsafe('rollback'));inTransaction=false;await assertHeld();return result;}
    catch(error){
      if(inTransaction){try{assert.ok(!lost&&!released);await reserved.unsafe('rollback');inTransaction=false;await assertHeld();}catch(rollbackError){lose();throw rollbackError;}}
      throw error;
    }
  }
  async function release(){
    if(released)return;
    try{assert.ok(!inTransaction,'Cannot release an open rollback transaction.');
      const [row]=await withHeld(()=>reserved`select pg_advisory_unlock(${dormitoryConductAdvisoryLockKey[0]}::int,${dormitoryConductAdvisoryLockKey[1]}::int) as unlocked`);
      assert.ok(!lost&&!released);assert.equal(row?.unlocked,true);held=false;
    }catch(error){lose();throw error;}finally{released=true;await reserved.release();}
  }
  try{
    const [row]=await reserved`select pg_backend_pid() as pid,pg_try_advisory_lock(${dormitoryConductAdvisoryLockKey[0]}::int,${dormitoryConductAdvisoryLockKey[1]}::int) as held`;
    assert.ok(Number.isInteger(row?.pid)&&row.pid>0&&row.held===true,'Another native acceptance task holds the shared DB lease.');pid=row.pid;held=true;
    await assertHeld();return {sql,assertHeld,withHeld,rollbackOnly,release,lose,get lost(){return lost;}};
  }catch(error){lose();released=true;await reserved.release();throw error;}
}
export const dormitoryConductFixture=(id,userId,requestId)=>({id,user_id:userId,request_id:requestId,expected_version:0,result:'unknown'});
export function dormitoryConductValidationCases(original){
  const deletion={id:original.id,user_id:original.user_id,request_id:randomUUID(),expected_version:1};
  const valid=[['save_dormitory_conduct',original],['save_dormitory_conduct',{...original,result:'empty'}],['delete_dormitory_conduct',deletion]],invalid=[];
  for(const [kind,payload] of [['save_dormitory_conduct',original],['delete_dormitory_conduct',deletion]]){
    valid.push([kind,{...payload,expected_version:999999998}]);
    for(const key of Object.keys(payload)){const missing={...payload};delete missing[key];invalid.push([kind,missing]);}
    for(const patch of [{extra:null},{rows:[]},{eligible:false},{source_mode:'official'},{download_url:'DO-NOT-STORE'},{id:'bad'},{user_id:null},
      {request_id:'ABCDEF00-0000-4000-8000-000000000001'},{expected_version:null},{expected_version:'1'},{expected_version:-1},{expected_version:0.5},{expected_version:999999999}])invalid.push([kind,{...payload,...patch}]);
  }
  for(const result of [null,'',' ','EMPTY','populated',0,false,[],{}])invalid.push(['save_dormitory_conduct',{...original,result}]);
  for(const kind of [null,'','constructor','__proto__','toString','other'])invalid.push([kind,original]);
  invalid.push(['delete_dormitory_conduct',{...deletion,expected_version:0}],['delete_dormitory_conduct',{...deletion,result:'empty'}],
    ['save_dormitory_conduct',null],['save_dormitory_conduct',[]],['save_dormitory_conduct',{}]);
  return [...valid.map(([kind,value])=>({kind,value,valid:true})),...invalid.map(([kind,value])=>({kind,value,valid:false}))];
}
/** Numeric trailing zeros exercise the SQL JSONB budget without adding fields. */
export function dormitoryConductNumericBoundary(payload,bytes=1024){
  assert.equal(payload.expected_version,0);assert.equal(validateDormitoryConductPayload('save_dormitory_conduct',payload),null);
  const base=dormitoryConductPayloadBytes(payload),zeros=bytes-base-1;assert.ok(Number.isSafeInteger(zeros)&&zeros>0);
  const raw=JSON.stringify(payload).replace('"expected_version":0','"expected_version":0.'+'0'.repeat(zeros));assert.deepEqual(JSON.parse(raw),payload);return raw;
}
export async function dormitoryConductOfflineChecks(){
  assert.deepEqual(dormitoryConductCliOptions(['--self-test']),{selfTest:true});
  assert.deepEqual(dormitoryConductCliOptions(['--execute','--preflight','--expected-migrations=131','--expected-rls=148']),{selfTest:false});
  for(const args of [[],['--execute'],['--self-test','--execute'],['--execute','--preflight','--expected-migrations=130','--expected-rls=147']])assert.throws(()=>dormitoryConductCliOptions(args));
  dormitoryConductClientTarget(`postgres://postgres@db.${project}.supabase.co/postgres`);
  dormitoryConductClientTarget(`postgres://postgres.${project}@qa.pooler.supabase.com:5432/postgres?sslmode=require`);
  for(const value of [`postgres://postgres@db.other.supabase.co/postgres`,`postgres://postgres.${project}@qa.pooler.supabase.com:6543/postgres`,
    `postgres://postgres@db.${project}.supabase.co/postgres?host=other.invalid`,`https://db.${project}.supabase.co/postgres`])assert.throws(()=>dormitoryConductClientTarget(value));
  const fixture=dormitoryConductFixture(randomUUID(),randomUUID(),randomUUID()),matrix=dormitoryConductValidationCases(fixture);
  for(const entry of matrix)assert.equal(validateDormitoryConductPayload(entry.kind,entry.value)===null,entry.valid);
  assert.deepEqual(JSON.parse(dormitoryConductNumericBoundary(fixture)),fixture);
  const {Types}=await import('../../node_modules/postgres/src/types.js'),types=Types(),raw=dormitoryConductNumericBoundary(fixture);
  assert.equal(types.serializer(25)(raw),raw);assert.equal(typeof JSON.parse(types.serializer(3802)(raw)),'string');
  return {status:'passed',mode:'offline-contracts',contractCases:matrix.length,databaseConnections:0};
}

async function preflight(){
  let phase='local-config',diagnostic=null,lease,pool,sql,started=false,rolledBack=false,cleanupVerified=false,connectionClosed=true;
  let before,historyBefore,schemaBefore,administrator,ownerBefore;
  const checks=[],users=Array.from({length:3},()=>randomUUID()),targets=Array.from({length:5},()=>randomUUID()),accepted=new Map(),attempts=[];
  const [one,two,nonGoogle]=users,[recordId,otherId,nonGoogleId,replacementId,spareId]=targets;
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
  const absent=async()=>{for(const name of ['public.'+table,'private.'+operations])assert.equal((await sql`select to_regclass(${name}) as name`)[0].name,null);
    for(const name of procedures)assert.equal((await sql`select to_regprocedure(${name}) as name`)[0].name,null);};
  const role=async(tx,id)=>{await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${id},true)`;};
  const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
  const next=value=>({...value,request_id:randomUUID()});
  const save=async(tx,kind,payload,raw=JSON.stringify(payload))=>{
    assert.ok(targets.includes(payload.id)&&users.includes(payload.user_id));assert.deepEqual(JSON.parse(raw),payload);attempts.push({kind,payload:{...payload}});
    const result=(await tx`select public.affairs_manage_dormitory_conduct(${kind},${raw}::text::jsonb) as result`)[0].result;
    assert.deepEqual(Object.keys(result).sort(),['id','kind','summary','version']);assert.equal(result.id,payload.id);assert.equal(result.kind,kind);assert.equal(result.version,payload.expected_version+1);
    const entry={kind,payload:{...payload},result},previous=accepted.get(payload.request_id);if(previous)assert.deepEqual(previous,entry);else accepted.set(payload.request_id,entry);return result;
  };
  let failure;
  try{
    const deployment=JSON.parse(await readFile('deployment.json','utf8'));assert.equal(deployment.repository.toLowerCase(),'luxart0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);
    const {deploymentEnvironment}=await import('../../scripts/deployment-env.mjs'),env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;dormitoryConductClientTarget(connection);
    const ddl=await readFile(migration,'utf8'),{default:postgres}=await import('postgres');
    pool=postgres(connection,{max:1,max_lifetime:0,idle_timeout:0,connect_timeout:10,onclose:()=>lease?.lose(),connection:{statement_timeout:20000},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});connectionClosed=false;
    phase='physical-session-lease';lease=await reserveDormitoryConductLease(pool);sql=lease.sql;
    phase='baseline-and-owner';before=await baseline(sql);assert.deepEqual(before,dormitoryConductExpectedSchema);historyBefore=await history(sql);schemaBefore=await schema(sql);
    assert.equal((await sql`select count(*)::int as count from supabase_migrations.schema_migrations where version=${prerequisite}`)[0].count,1);
    assert.equal((await sql`select count(*)::int as count from supabase_migrations.schema_migrations where version=${version}`)[0].count,0);await absent();
    for(const name of ['public.affairs_profiles','public.affairs_agent_audit'])assert.notEqual((await sql`select to_regclass(${name}) as name`)[0].name,null);
    for(const name of ['private.affairs_google_identity()','private.affairs_is_admin()'])assert.notEqual((await sql`select to_regprocedure(${name}) as name`)[0].name,null);
    [administrator]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator,'Existing verified Google administrator required; no owner repair permitted.');ownerBefore=await fingerprint(administrator.id);assert.ok(!users.includes(administrator.id));
    assert.equal((await sql`select count(*)::int as count from auth.users where id in ${sql(users)}`)[0].count,0);
    assert.equal((await sql`select count(*)::int as count from public.affairs_agent_audit where target_id in ${sql(targets)}`)[0].count,0);
    await lease.rollbackOnly(async tx=>{
      started=true;phase='draft-ddl';await tx.unsafe("set local lock_timeout='8s'");await tx.unsafe("set local idle_in_transaction_session_timeout='30s'");await tx.unsafe(ddl);
      assert.deepEqual(await baseline(tx),{migrations:131,rls_tables:149});assert.equal(await history(tx),historyBefore);
      for(const userId of users){const google=userId!==nonGoogle,email=`dorm-conduct-qa-${userId}@example.invalid`;
        await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
          values('00000000-0000-0000-0000-000000000000',${userId},'authenticated','authenticated',${email},now(),
          ${tx.json(google?{provider:'google',providers:['google']}:{provider:'email',providers:['email']})},'{"full_name":"Synthetic Dormitory QA"}',now(),now())`;
        if(google)await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${userId},${userId},${tx.json({sub:userId,email,email_verified:true})},'google')`;
        await tx`insert into public.affairs_profiles(user_id,email,display_name,role) values(${userId},${email},'Synthetic Dormitory QA','student')`;
      }
      const original=dormitoryConductFixture(recordId,one,randomUUID()),matrix=dormitoryConductValidationCases(original);
      phase='validation-query';const parity=await tx`select item.ordinal::int as ordinal,private.affairs_dormitory_conduct_payload_valid(item.value->>'kind',item.value->'value') as valid,
        octet_length((item.value->'value')::text) as bytes from jsonb_array_elements(${tx.json(matrix)}::jsonb) with ordinality item(value,ordinal) order by ordinal`;
      assert.equal(parity.length,matrix.length);
      for(const [index,entry] of matrix.entries()){
        phase='validation-parity-case-'+index;diagnostic={caseIndex:index,expectedValid:entry.valid,actualValid:parity[index].valid===true};
        assert.equal(validateDormitoryConductPayload(entry.kind,entry.value)===null,entry.valid);assert.equal(parity[index].valid,entry.valid);
        if(entry.valid){phase='validation-bytes-case-'+index;diagnostic={caseIndex:index,expectedBytes:dormitoryConductPayloadBytes(entry.value),actualBytes:parity[index].bytes};assert.equal(parity[index].bytes,dormitoryConductPayloadBytes(entry.value));}
      }
      for(const bytes of [1024,1025]){phase='validation-numeric-encoding-bytes-'+bytes;const raw=dormitoryConductNumericBoundary(original,bytes);
        const [row]=await tx`select octet_length((${raw}::text::jsonb)::text) as bytes,private.affairs_dormitory_conduct_payload_valid('save_dormitory_conduct',${raw}::text::jsonb) as valid`;
        diagnostic={expectedBytes:bytes,actualBytes:row.bytes,expectedValid:bytes===1024,actualValid:row.valid===true};assert.equal(row.bytes,bytes);assert.equal(row.valid,bytes===1024);}
      diagnostic=null;
      for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE']){phase='acl-authenticated-'+privilege.toLowerCase();assert.equal((await tx`select has_table_privilege('authenticated',${'public.'+table},${privilege}) as allowed`)[0].allowed,false);}
      phase='acl-authenticated-select';assert.equal((await tx`select has_table_privilege('authenticated',${'public.'+table},'SELECT') as allowed`)[0].allowed,true);
      phase='acl-anon-select';assert.equal((await tx`select has_table_privilege('anon',${'public.'+table},'SELECT') as allowed`)[0].allowed,false);
      for(const [index,signature] of procedures.entries()){phase='acl-function-'+index;assert.equal((await tx`select has_function_privilege('authenticated',${signature},'EXECUTE') as allowed`)[0].allowed,signature.startsWith('public.'));
        assert.equal((await tx`select has_function_privilege('anon',${signature},'EXECUTE') as allowed`)[0].allowed,false);}
      checks.push('strict-validation-explicit-states-jsonb-byte-boundaries-and-acls');
      phase='singleton-and-roles';await role(tx,administrator.id);assert.deepEqual((await tx`select public.affairs_dormitory_conduct_access() as result`)[0].result,{userId:administrator.id,canManage:true});
      const first=await save(tx,'save_dormitory_conduct',original,dormitoryConductNumericBoundary(original));assert.deepEqual(await save(tx,'save_dormitory_conduct',original),first);
      await save(tx,'save_dormitory_conduct',next({...original,id:otherId,user_id:two,result:'empty'}));await save(tx,'save_dormitory_conduct',next({...original,id:nonGoogleId,user_id:nonGoogle}));
      assert.equal((await tx`select count(*)::int as count from public.affairs_dormitory_conduct`)[0].count,3);
      await denied(tx,s=>save(s,'save_dormitory_conduct',next({...original,id:replacementId})),'PT409');
      await denied(tx,s=>save(s,'save_dormitory_conduct',{...original,result:'empty'}),'PT409');await denied(tx,s=>save(s,'save_dormitory_conduct',next(original)),'PT409');
      await denied(tx,s=>save(s,'save_dormitory_conduct',next({...original,user_id:two,expected_version:1})));
      await denied(tx,s=>save(s,'save_dormitory_conduct',next({...original,expected_version:1,rows:[]})),'22023');
      await denied(tx,s=>s`update public.affairs_dormitory_conduct set result='empty' where id=${recordId}`);
      await role(tx,one);assert.deepEqual((await tx`select id,result from public.affairs_dormitory_conduct`).map(row=>({id:row.id,result:row.result})),[{id:recordId,result:'unknown'}]);
      assert.deepEqual((await tx`select public.affairs_dormitory_conduct_access() as result`)[0].result,{userId:one,canManage:false});
      assert.equal((await tx`select id from public.affairs_dormitory_conduct where user_id=${two}`).length,0);
      await denied(tx,s=>save(s,'save_dormitory_conduct',next({...original,expected_version:1})));
      await denied(tx,s=>save(s,'delete_dormitory_conduct',{id:recordId,user_id:one,request_id:randomUUID(),expected_version:1}));
      await denied(tx,s=>s`insert into public.affairs_dormitory_conduct(id,user_id,result) values(${spareId},${one},'empty')`);
      await denied(tx,s=>s`delete from public.affairs_dormitory_conduct where id=${recordId}`);await denied(tx,s=>s`select * from private.affairs_dormitory_conduct_operations`);
      await role(tx,two);assert.deepEqual((await tx`select id from public.affairs_dormitory_conduct`).map(row=>row.id),[otherId]);
      await role(tx,nonGoogle);assert.equal((await tx`select id from public.affairs_dormitory_conduct`).length,0);await denied(tx,s=>s`select public.affairs_dormitory_conduct_access()`);
      await denied(tx,s=>save(s,'save_dormitory_conduct',next({...original,id:nonGoogleId,user_id:nonGoogle,expected_version:1})));
      await tx.unsafe('set local role anon');await denied(tx,s=>s`select * from public.affairs_dormitory_conduct`);await denied(tx,s=>s`select public.affairs_dormitory_conduct_access()`);
      await denied(tx,s=>save(s,'save_dormitory_conduct',next(original)));checks.push('own-cross-admin-nongoogle-anonymous-and-direct-write-isolation');
      phase='explicit-state-edit-and-identity-revocation';await role(tx,administrator.id);
      const edit=next({...original,expected_version:1,result:'empty'}),edited=await save(tx,'save_dormitory_conduct',edit,JSON.stringify(edit).replace('"expected_version":1','"expected_version":1.0'));
      assert.deepEqual(await save(tx,'save_dormitory_conduct',edit),edited);await denied(tx,s=>save(s,'save_dormitory_conduct',next(edit)),'PT409');
      assert.deepEqual((await tx`select result,version from public.affairs_dormitory_conduct where id=${recordId}`)[0],{result:'empty',version:2});
      await tx.unsafe('reset role');await tx`delete from auth.identities where user_id=${two} and provider='google' and provider_id=${two}`;
      await role(tx,two);assert.equal((await tx`select id from public.affairs_dormitory_conduct`).length,0);await denied(tx,s=>s`select public.affairs_dormitory_conduct_access()`);
      await denied(tx,s=>save(s,'save_dormitory_conduct',next({...original,id:otherId,user_id:two,expected_version:1})));
      checks.push('literal-state-change-stale-replay-and-synthetic-google-identity-revocation');
      phase='tombstones-and-replacement';await role(tx,administrator.id);
      const remove={id:recordId,user_id:one,request_id:randomUUID(),expected_version:2},removed=await save(tx,'delete_dormitory_conduct',remove);
      assert.deepEqual(await save(tx,'delete_dormitory_conduct',remove),removed);assert.deepEqual(await save(tx,'save_dormitory_conduct',original),first);
      for(const expectedVersion of [0,3])await denied(tx,s=>save(s,'save_dormitory_conduct',next({...original,expected_version:expectedVersion})),'PT409');
      await denied(tx,s=>save(s,'delete_dormitory_conduct',next({...remove,expected_version:3})),'PT409');
      await denied(tx,s=>save(s,'delete_dormitory_conduct',{...remove,request_id:original.request_id}),'PT409');
      await role(tx,one);assert.equal((await tx`select id from public.affairs_dormitory_conduct`).length,0);
      await role(tx,administrator.id);await save(tx,'save_dormitory_conduct',next({...original,id:replacementId}));assert.deepEqual(await save(tx,'save_dormitory_conduct',original),first);
      await denied(tx,s=>save(s,'save_dormitory_conduct',next({...original,id:spareId})),'PT409');
      await role(tx,one);assert.deepEqual((await tx`select id from public.affairs_dormitory_conduct`).map(row=>row.id),[replacementId]);
      await tx.unsafe('reset role');assert.deepEqual((await tx`select version,deleted_at is not null as deleted from public.affairs_dormitory_conduct where id=${recordId}`)[0],{version:3,deleted:true});
      await denied(tx,s=>s`update public.affairs_dormitory_conduct set deleted_at=null where id=${recordId}`,'PT409');
      await denied(tx,s=>s`update public.affairs_dormitory_conduct set user_id=${one} where id=${otherId}`);
      await denied(tx,s=>s`update public.affairs_dormitory_conduct set source_mode='official' where id=${otherId}`);
      await denied(tx,s=>s`insert into public.affairs_dormitory_conduct(id,user_id,result) values(${spareId},${one},'unknown')`,'23505');
      checks.push('reserved-tombstones-immutable-owner-source-new-id-replacement-and-late-receipts');
      phase='receipts-audits-and-owner';const receipts=await tx`select request_id,kind,payload,result from private.affairs_dormitory_conduct_operations where user_id=${administrator.id}`;
      assert.equal(accepted.size,6);assert.equal(receipts.length,accepted.size);for(const row of receipts){const entry=accepted.get(row.request_id);assert.ok(entry);assert.deepEqual({kind:row.kind,payload:row.payload,result:row.result},entry);}
      assert.ok(attempts.length>accepted.size);assert.equal((await tx`select count(*)::int as count from public.affairs_agent_audit where user_id=${administrator.id} and target_id in ${tx(targets)}`)[0].count,accepted.size);
      assert.deepEqual(await fingerprint(administrator.id),ownerBefore);checks.push('exact-success-receipts-audits-and-full-protected-owner-fingerprint');
    });rolledBack=true;
  }catch(error){failure={phase,code:typeof error?.code==='string'&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:'CHECK_FAILED',diagnostic};}
  finally{
    try{
      if(lease){await lease.assertHeld();if(before)assert.deepEqual(await baseline(sql),before);if(historyBefore)assert.equal(await history(sql),historyBefore);if(schemaBefore)assert.equal(await schema(sql),schemaBefore);
        if(started){await absent();for(const userId of users){assert.equal((await sql`select id from auth.users where id=${userId}`).length,0);assert.equal((await sql`select user_id from auth.identities where user_id=${userId}`).length,0);assert.equal((await sql`select user_id from public.affairs_profiles where user_id=${userId}`).length,0);}
          assert.equal((await sql`select id from public.affairs_agent_audit where target_id in ${sql(targets)}`).length,0);}
        if(ownerBefore)assert.deepEqual(await fingerprint(administrator.id),ownerBefore);cleanupVerified=started&&Boolean(schemaBefore)&&Boolean(ownerBefore);}
    }catch{failure??={phase:'exact-rollback-verification',code:'CHECK_FAILED',diagnostic:null};cleanupVerified=false;}
    try{if(lease)await lease.release();}catch{cleanupVerified=false;failure??={phase:'physical-lease-release',code:'CHECK_FAILED',diagnostic:null};}
    try{if(pool)await pool.end({timeout:5});connectionClosed=true;}catch{failure??={phase:'database-close',code:'CHECK_FAILED',diagnostic:null};}
  }
  const passed=!failure&&rolledBack&&cleanupVerified&&connectionClosed;
  const result={status:passed?'passed':'failed',mode:'rollback-only-migration-preflight',baseline:before,checks,cleanupVerified,connectionClosed,
    fixtureCounts:{users:users.length,recordIds:targets.length,successfulRequests:accepted.size},...(failure?{failure}:{}),
    limitations:'SQL claim-role checks and serial stale operations only; no actual JWT/API/UI/model or parallel RPC acceptance.'};
  console.log(JSON.stringify(result));if(!passed)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{if(dormitoryConductCliOptions(process.argv.slice(2)).selfTest)console.log(JSON.stringify(await dormitoryConductOfflineChecks()));else await preflight();}
  catch{console.error(JSON.stringify({status:'failed',phase:'offline-or-cli-gate',databaseConnections:0}));process.exitCode=1;}
}

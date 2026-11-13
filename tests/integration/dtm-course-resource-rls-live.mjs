import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,open,readFile,realpath,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateDtmMaterialTargetUrl} from '../../server/dtmCourseResource.js';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';
// PREPARED ONLY: root owns the serialized live lease. Import/self-test is offline.
// All fixture writes and draft DDL run on one reserved physical session and roll back.
const clientRoot='/Users/winsonbaring/Documents/GitHub/std_edu_ai-luxart0317',project='xiftudmvxphxcjtmfmib';
const version='20261114020000',prerequisite='20261114010000',migration='supabase/migrations/20261114020000_dtm_material_targets.sql';
export const dtmResourceExpectedSchema=Object.freeze({migrations:135,rls_tables:152});
export function dtmResourceCliOptions(args){
  if(args.length===1&&args[0]==='--self-test')return {selfTest:true};
  const flags=['--execute','--preflight','--expected-migrations=135','--expected-rls=152'];
  assert.ok(args.length===4&&new Set(args).size===4&&flags.every(value=>args.includes(value)),'Root lease and exact preflight flags/baseline required.');return {selfTest:false};
}
export function dtmResourceUrlCases(){
  const values=[null,'','https://example.org','https://EXAMPLE.ORG:443/a?q=%E4%B8%AD#part','https://example.org/'+'a'.repeat(2028),
    'https://example.org/'+'a'.repeat(2029),' ','http://example.org','HTTPS://example.org','javascript:alert(1)','data:text/plain,x',
    'https://user:pass@example.org','https://example.org:80','https://example.org:0443','https://example.org/%','https://example.org/%0','https://example.org/%gg',
    'https://example.org/%00','https://example.org/%0a','https://example.org/%1f','https://example.org/%7F','https://example.org/%5c','https://example.org/中文',
    ...['localhost','a.localhost','a.local','a.internal','a.localdomain','a.intranet','a.lan','a.home','a.corp','a.test','a.invalid','a.example','a.onion','home.arpa',
      '127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','8.8.8.8','2130706433','127.1','0x7f000001','0177.0.0.1','[::1]','[2001:4860:4860::8888]',
      '%31%32%37.0.0.1','example.org.','example..org','-example.org','example-.org','example.o','example.123','xn--bcher-kva.org','example.xn--p1ai','a'.repeat(64)+'.org'].map(host=>'https://'+host),
    ...Array.from({length:127},(_,index)=>'https://example.org/a'+String.fromCharCode(index+1)+'z')];
  return values.map(value=>({value,valid:validateDtmMaterialTargetUrl(value)===null}));
}
export function dtmResourceOriginalFunctionBody(source){const start=source.indexOf('create function public.dtm_manage_record('),body=source.indexOf('as $$',start)+5,end=source.indexOf('$$;',body);
  assert.ok(start>=0&&body>start&&end>body);return source.slice(body,end);}
export async function dtmResourceAssertDirectWriteBlocked(action){
  let rows;try{rows=await action();}catch(error){if(error?.code==='42501')return 'permission-denied';throw error;}
  assert.ok(Array.isArray(rows));assert.equal(rows.length,0,'Direct RLS mutation returned an affected row.');return 'zero-rows';
}
export async function dtmResourceAssertReadBlocked(action){
  let rows;try{rows=await action();}catch(error){if(error?.code==='42501')return 'permission-denied';throw error;}
  assert.ok(Array.isArray(rows));assert.equal(rows.length,0,'RLS-protected rows were disclosed.');return 'zero-rows';
}
function diagnostic(error,phase){const line=/dtm-course-resource-rls-live\.mjs:(\d+):(\d+)/.exec(error?.stack??'');return {phase,
  code:typeof error?.code==='string'&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:'CHECK_FAILED',...(line?{line:Number(line[1])}:{}),
  ...(typeof error?.constraint_name==='string'&&/^[a-z0-9_]{1,100}$/.test(error.constraint_name)?{constraint:error.constraint_name}:{})};}
async function durable(path,data){await mkdir(dirname(path),{recursive:true,mode:0o700});const file=await open(path+'.next','w',0o600);
  try{await file.writeFile(JSON.stringify(data)+'\n');await file.sync();}finally{await file.close();}await rename(path+'.next',path);
  const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}}
export async function dtmResourceOfflineChecks(){
  assert.deepEqual(dtmResourceCliOptions(['--self-test']),{selfTest:true});assert.deepEqual(dtmResourceCliOptions(['--execute','--preflight','--expected-migrations=135','--expected-rls=152']),{selfTest:false});
  for(const args of [[],['--execute'],['--self-test','--execute'],['--execute','--preflight','--expected-migrations=134','--expected-rls=151']])assert.throws(()=>dtmResourceCliOptions(args));
  dormitoryConductClientTarget(`postgres://postgres@db.${project}.supabase.co/postgres`);assert.throws(()=>dormitoryConductClientTarget('postgres://postgres@db.other.supabase.co/postgres'));
  const cases=dtmResourceUrlCases();assert.ok(cases.some(row=>row.valid)&&cases.some(row=>!row.valid));
  assert.equal(cases.find(row=>row.value==='https://example.org').valid,true);assert.equal(cases.find(row=>row.value==='https://127.0.0.1').valid,false);
  const ddl=await readFile(new URL('../../'+migration,import.meta.url),'utf8');assert.doesNotMatch(ddl,/alter policy|create policy|grant .* to|disable trigger/i);
  const source=await readFile(new URL(import.meta.url),'utf8');assert.ok(source.indexOf('await durable(ledgerPath,ledger)')<source.indexOf('await lease.rollbackOnly'));
  const original=await readFile(new URL('../../supabase/migrations/20261112010000_student_workspace.sql',import.meta.url),'utf8');assert.ok(dtmResourceOriginalFunctionBody(original).startsWith('\ndeclare\n'));assert.ok(dtmResourceOriginalFunctionBody(original).endsWith('\nend;\n'));
  assert.equal(await dtmResourceAssertDirectWriteBlocked(async()=>[]),'zero-rows');
  assert.equal(await dtmResourceAssertDirectWriteBlocked(async()=>{throw Object.assign(Error('Synthetic denied'),{code:'42501'});}),'permission-denied');
  await assert.rejects(()=>dtmResourceAssertDirectWriteBlocked(async()=>[{id:'affected'}]));
  await assert.rejects(()=>dtmResourceAssertDirectWriteBlocked(async()=>{throw Object.assign(Error('Synthetic database error'),{code:'57014'});}),{code:'57014'});
  await assert.rejects(()=>dtmResourceAssertDirectWriteBlocked(async()=>null));
  assert.equal(await dtmResourceAssertReadBlocked(async()=>[]),'zero-rows');
  assert.equal(await dtmResourceAssertReadBlocked(async()=>{throw Object.assign(Error('Synthetic denied'),{code:'42501'});}),'permission-denied');
  await assert.rejects(()=>dtmResourceAssertReadBlocked(async()=>[{id:'disclosed'}]));
  await assert.rejects(()=>dtmResourceAssertReadBlocked(async()=>{throw Object.assign(Error('Synthetic database error'),{code:'57014'});}),{code:'57014'});
  await assert.rejects(()=>dtmResourceAssertReadBlocked(async()=>null));
  return {status:'passed',mode:'offline-contracts',urlCases:cases.length,directWriteOracles:5,readOracles:5,databaseConnections:0};
}
async function preflight(){
  let pool,lease,sql,timer,cleanupTimer,before,historyBefore,schemaBefore,legacyBefore,ownerBefore,administrator,ledger,failure=null,cleanupFailure=null;
  let phase='local-config',cleanupPhase='not-started',started=false,rolledBack=false,cleanupVerified=false,connectionClosed=true,workDeadlineFired=false,cleanupDeadlineFired=false;
  const start=Date.now(),checks=[],users=Array.from({length:4},()=>randomUUID()),[one,two,nonGoogle,uninitialized]=users;
  const courseIds=Array.from({length:4},()=>randomUUID()),[courseOne,courseTwo,otherOwn,spareCourse]=courseIds;
  const materialIds=Array.from({length:3},()=>randomUUID()),[legacyMaterial,foreignMaterial,newMaterial]=materialIds;
  const studentId=randomUUID(),programId=randomUUID(),meetingId=randomUUID(),gradeId=randomUUID(),assignmentId=randomUUID(),audited=[];
  const targets=[...courseIds,...materialIds,meetingId,gradeId,assignmentId],ledgerPath='artifacts/dtm-course-resource-preflight/'+randomUUID()+'/recovery.json';
  const baseline=async q=>(await q`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
  const history=async q=>(await q`select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.version),'[]'::jsonb)::text) as hash from supabase_migrations.schema_migrations m`)[0].hash;
  const owner=async(q,id)=>(await q`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(i) order by id),'[]'::jsonb)::text) from auth.identities i where user_id=u.id) as identities_hash
    from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
  const legacy=async q=>(await q`select md5(jsonb_build_object(
    'courses',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.dtm_courses r where id not in ${q(courseIds)}),
    'materials',(select coalesce(jsonb_agg(to_jsonb(r)-'target_url' order by id),'[]'::jsonb) from public.dtm_materials r where id not in ${q(materialIds)}),
    'meetings',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.dtm_meetings r where id<>${meetingId}),
    'grades',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.dtm_grade_items r where id<>${gradeId}),
    'assignments',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.affairs_assignments r where student_id<>${studentId}),
    'enrollments',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.affairs_enrollments r where student_id<>${studentId}),
    'charges',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.affairs_charges r where student_id<>${studentId}),
    'reports',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.dtm_grade_reports r),
    'contents',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.dtm_course_contents r),
    'audit',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.affairs_agent_audit r where target_id is null or target_id not in ${q(targets)})
  )::text) as hash`)[0].hash;
  const schema=async q=>(await q`select md5(jsonb_build_object(
    'relations',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relowner,c.relacl) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
    'columns',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','private') and a.attnum>0 and not a.attisdropped),
    'constraints',(select jsonb_agg(jsonb_build_array(n.nspname,c.conname,c.conrelid,c.confrelid,pg_get_constraintdef(c.oid)) order by n.nspname,c.conrelid,c.conname) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','private')),
    'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by n.nspname,c.relname) from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
    'policies',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,p.polname,p.polcmd,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by n.nspname,c.relname,p.polname) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
    'functions',(select jsonb_agg(jsonb_build_array(n.nspname,p.oid::regprocedure::text,p.proacl,pg_get_functiondef(p.oid)) order by n.nspname,p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind in ('f','p')),
    'triggers',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and not t.tgisinternal)
  )::text) as hash`)[0].hash;
  const absent=async q=>{const [row]=await q`select to_regprocedure('private.dtm_material_target_url_valid(text)') is null as function_absent,
    not exists(select 1 from pg_attribute where attrelid='public.dtm_materials'::regclass and attname='target_url' and not attisdropped) as column_absent`;
    assert.equal(row.function_absent,true);assert.equal(row.column_absent,true);};
  const role=async(q,id)=>{await q.unsafe('set local role authenticated');await q`select set_config('request.jwt.claim.sub',${id},true)`;};
  const denied=(q,action,code='42501')=>assert.rejects(q.savepoint(action),{code});
  const command=async(q,kind,payload)=>{assert.ok(targets.includes(payload.id??payload.course_id));
    const result=(await q`select public.dtm_manage_record(${kind},${JSON.stringify(payload)}::text::jsonb) as result`)[0].result;
    assert.deepEqual(Object.keys(result).sort(),['id','imported','kind']);assert.equal(result.kind,kind);assert.equal(result.id,kind==='import_dtm_deadlines'?payload.course_id:payload.id);audited.push({kind,id:result.id});return result;};
  const value=async(q,id=legacyMaterial)=>(await q`select target_url,source_url,title from public.dtm_materials where id=${id}`)[0];
  const patch={id:legacyMaterial,course_id:courseOne,title:'Synthetic material',kind:'page',summary:'Literal summary',source_url:'https://dtm.stu.edu.tw/mod/url/view.php?id=123'};
  try{
    assert.equal(await realpath(process.cwd()),clientRoot);assert.equal(await realpath(fileURLToPath(new URL('../../',import.meta.url))),clientRoot);
    const deployment=JSON.parse(await readFile('deployment.json','utf8'));assert.equal(deployment.repository.toLowerCase(),'luxart0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);
    const {deploymentEnvironment}=await import('../../scripts/deployment-env.mjs'),env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;dormitoryConductClientTarget(connection);
    const {default:postgres}=await import('postgres'),ddl=await readFile(migration,'utf8'),original=await readFile('supabase/migrations/20261112010000_student_workspace.sql','utf8');
    pool=postgres(connection,{max:1,max_lifetime:0,idle_timeout:0,connect_timeout:10,onclose:()=>lease?.lose(),connection:{statement_timeout:20000},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});connectionClosed=false;
    timer=setTimeout(()=>{workDeadlineFired=true;lease?.lose();void pool.end({timeout:1}).catch(()=>{});},180000);timer.unref();
    phase='physical-lease';lease=await reserveDormitoryConductLease(pool);sql=lease.sql;
    phase='baseline';before=await baseline(sql);assert.deepEqual(before,dtmResourceExpectedSchema);historyBefore=await history(sql);schemaBefore=await schema(sql);legacyBefore=await legacy(sql);await absent(sql);
    const [versions]=await sql`select exists(select 1 from supabase_migrations.schema_migrations where version=${prerequisite}) as prerequisite_present,not exists(select 1 from supabase_migrations.schema_migrations where version=${version}) as draft_absent`;
    assert.equal(versions.prerequisite_present,true);assert.equal(versions.draft_absent,true);
    const originalBody=dtmResourceOriginalFunctionBody(original);
    const [routine]=await sql`select prosrc,proowner,prosecdef,proconfig,proacl from pg_proc where oid='public.dtm_manage_record(text,jsonb)'::regprocedure`;assert.equal(routine.prosrc,originalBody);
    [administrator]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin' where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator);ownerBefore=await owner(sql,administrator.id);assert.ok(!users.includes(administrator.id));
    const [collisions]=await sql`select (select count(*) from auth.users where id in ${sql(users)})+(select count(*) from public.dtm_courses where id in ${sql(courseIds)})+
      (select count(*) from public.dtm_materials where id in ${sql(materialIds)})+(select count(*) from public.affairs_students where id=${studentId})+(select count(*) from public.affairs_programs where id=${programId})+
      (select count(*) from public.dtm_meetings where id=${meetingId})+(select count(*) from public.dtm_grade_items where id=${gradeId})+(select count(*) from public.affairs_assignments where id=${assignmentId})+
      (select count(*) from public.affairs_agent_audit where target_id in ${sql(targets)}) as count`;assert.equal(Number(collisions.count),0);
    phase='durable-pretransaction-ledger';ledger={format:1,project,migrationVersion:version,createdAt:new Date().toISOString(),status:'pretransaction',before:{baseline:before,history:historyBefore,schema:schemaBefore,legacy:legacyBefore,owner:ownerBefore},
      fixtures:{users:users.map(id=>({id,email:`dtm-resource-qa-${id}@example.invalid`})),courseIds,materialIds,studentId,programId,meetingId,gradeId,assignmentId,targets}};await durable(ledgerPath,ledger);
    await lease.rollbackOnly(async q=>{
      started=true;await q.unsafe("set local lock_timeout='8s'");await q.unsafe("set local idle_in_transaction_session_timeout='30s'");
      phase='synthetic-auth-fixtures';for(const id of users){const google=id!==nonGoogle,email=`dtm-resource-qa-${id}@example.invalid`;
        await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
          ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),${q.json(google?{provider:'google',providers:['google']}:{provider:'email',providers:['email']})},'{"full_name":"Synthetic Resource QA"}',now(),now())`;
        if(google)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at) values(${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now(),now())`;
        if(id!==uninitialized)await q`insert into public.affairs_profiles(user_id,email,display_name,role) values(${id},${email},'Synthetic Resource QA','student')`;
      }
      phase='synthetic-existing-material-fixtures';await q`insert into public.affairs_programs(id,code,name,department) values(${programId},${'QA-'+programId},'Synthetic resource program','Synthetic department')`;
      await q`insert into public.affairs_students(id,user_id,student_number,full_name,program_id,year_level) values(${studentId},${one},${'QA-'+one},'Synthetic Resource QA',${programId},1)`;
      await q`insert into public.dtm_courses(id,user_id,code,title,term,source_mode) values(${courseOne},${one},'QA-1','Synthetic course one','Local term','personal'),(${courseTwo},${two},'QA-2','Synthetic course two','Local term','personal'),(${otherOwn},${one},'QA-3','Synthetic other course','Local term','personal')`;
      await q`insert into public.dtm_materials(id,course_id,title,kind,summary,position,source_mode,source_url) values(${legacyMaterial},${courseOne},'Synthetic material','page','Literal summary',1,'personal',${patch.source_url}),(${foreignMaterial},${courseTwo},'Synthetic foreign material','page','',1,'personal',null)`;
      phase='draft-ddl';await q.unsafe(ddl);assert.deepEqual(await baseline(q),before);assert.equal(await history(q),historyBefore);
      const [{prosrc:changedBody,...sameRoutine}]=await q`select prosrc,proowner,prosecdef,proconfig,proacl from pg_proc where oid='public.dtm_manage_record(text,jsonb)'::regprocedure`;
      assert.notEqual(changedBody,routine.prosrc);const {prosrc:oldBody,...oldRoutine}=routine;assert.ok(oldBody);assert.deepEqual(sameRoutine,oldRoutine);
      assert.equal((await q`select count(*)::int as count from public.dtm_materials where target_url is not null`)[0].count,0);
      phase='url-js-sql-parity';const matrix=dtmResourceUrlCases(),rows=await q`select n.ordinal::int as ordinal,private.dtm_material_target_url_valid(n.value->>'value') as valid from jsonb_array_elements(${q.json(matrix)}::jsonb) with ordinality n(value,ordinal) order by ordinal`;
      assert.equal(rows.length,matrix.length);for(const [index,entry] of matrix.entries())assert.equal(rows[index].valid,entry.valid,'URL case '+index);
      await denied(q,s=>s`update public.dtm_materials set target_url='https://127.0.0.1/' where id=${legacyMaterial}`,'23514');await denied(q,s=>s`update public.dtm_materials set target_url='' where id=${legacyMaterial}`,'23514');
      assert.equal((await q`select has_function_privilege('authenticated','private.dtm_material_target_url_valid(text)','EXECUTE') as allowed`)[0].allowed,false);
      checks.push('strict-url-js-sql-parity-column-constraint-existing-null-metadata-and-preserved-function-acls');
      phase='owned-material-save-omit-clear';await role(q,one);
      await command(q,'save_dtm_material',{...patch,target_url:'https://example.org/material?part=1#section'});assert.equal((await value(q)).target_url,'https://example.org/material?part=1#section');
      await command(q,'save_dtm_material',{...patch,title:'Updated literal title'});assert.deepEqual(await value(q),{target_url:'https://example.org/material?part=1#section',source_url:patch.source_url,title:'Updated literal title'});
      for(const target_url of ['',null]){await command(q,'save_dtm_material',{...patch,target_url});assert.equal((await value(q)).target_url,null);}
      await command(q,'save_dtm_material',{...patch,target_url:'https://example.org/again'});
      for(const target_url of [0,false,{},[],'http://example.org','https://private.local','https://user@example.org'])await denied(q,s=>command(s,'save_dtm_material',{...patch,target_url}),'22023');
      await denied(q,s=>command(s,'save_dtm_material',{...patch,source_url:'https://example.org/provenance'}),'23514');assert.equal((await value(q)).target_url,'https://example.org/again');
      await command(q,'save_dtm_material',{...patch,id:newMaterial,title:'Synthetic new resource',target_url:'https://example.org/new'});assert.equal((await value(q,newMaterial)).target_url,'https://example.org/new');
      await command(q,'delete_dtm_material',{id:newMaterial,course_id:courseOne});assert.equal(await value(q,newMaterial),undefined);
      checks.push('real-owner-material-create-edit-legacy-omission-null-empty-clear-delete-and-provenance-separation');
      phase='scope-and-identity-denials';await denied(q,s=>command(s,'save_dtm_material',{...patch,course_id:otherOwn,target_url:'https://example.org/wrong-course'}));
      await denied(q,s=>command(s,'save_dtm_material',{...patch,id:foreignMaterial,target_url:'https://example.org/foreign'}));assert.equal((await q`select id from public.dtm_materials where id=${foreignMaterial}`).length,0);
      // Existing SELECT-only RLS can suppress writes with zero affected rows
      // even where inherited/default table ACLs permit the SQL command itself.
      const directBefore=(await q`select to_jsonb(m) as row from public.dtm_materials m where id=${legacyMaterial}`)[0];assert.ok(directBefore);
      const auditBefore=(await q`select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) as rows from public.affairs_agent_audit a where user_id=${one}`)[0].rows;
      phase='direct-update-rls-block';await dtmResourceAssertDirectWriteBlocked(()=>q.savepoint(s=>s`update public.dtm_materials set target_url='https://example.org/direct' where id=${legacyMaterial} returning id`));
      assert.deepEqual((await q`select to_jsonb(m) as row from public.dtm_materials m where id=${legacyMaterial}`)[0],directBefore);
      assert.deepEqual((await q`select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) as rows from public.affairs_agent_audit a where user_id=${one}`)[0].rows,auditBefore);
      phase='direct-delete-rls-block';await dtmResourceAssertDirectWriteBlocked(()=>q.savepoint(s=>s`delete from public.dtm_materials where id=${legacyMaterial} returning id`));
      assert.deepEqual((await q`select to_jsonb(m) as row from public.dtm_materials m where id=${legacyMaterial}`)[0],directBefore);
      assert.deepEqual((await q`select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) as rows from public.affairs_agent_audit a where user_id=${one}`)[0].rows,auditBefore);
      phase='remaining-identity-denials';
      await role(q,two);assert.equal((await q`select id from public.dtm_materials where id=${legacyMaterial}`).length,0);await denied(q,s=>command(s,'save_dtm_material',{...patch,target_url:'https://example.org/cross-owner'}));
      for(const id of [nonGoogle,uninitialized]){await role(q,id);await denied(q,s=>s`select public.dtm_course_content_access()`);await denied(q,s=>command(s,'save_dtm_material',patch));}
      phase='anonymous-material-read';await q.unsafe('set local role anon');await q`select set_config('request.jwt.claim.sub','',true)`;
      assert.equal((await q`select auth.uid() as uid`)[0].uid,null);
      // No policy targets anon. A default SELECT ACL can yield an empty result
      // rather than an ACL error; either must disclose exactly zero rows.
      await dtmResourceAssertReadBlocked(()=>q.savepoint(s=>s`select id from public.dtm_materials`));
      phase='anonymous-rpc-execution';await denied(q,s=>command(s,'save_dtm_material',patch));
      await role(q,one);assert.deepEqual((await q`select to_jsonb(m) as row from public.dtm_materials m where id=${legacyMaterial}`)[0],directBefore);
      assert.deepEqual((await q`select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) as rows from public.affairs_agent_audit a where user_id=${one}`)[0].rows,auditBefore);
      checks.push('cross-owner-other-course-nongoogle-uninitialized-anonymous-and-direct-write-denial');
      phase='ordinary-operation-preservation';await role(q,one);
      await command(q,'save_dtm_course',{id:spareCourse,code:'QA-extra',title:'Synthetic extra course',term:'Local term'});await command(q,'delete_dtm_course',{id:spareCourse});
      await command(q,'save_dtm_meeting',{id:meetingId,course_id:courseOne,meeting_on:'2030-01-02',starts_at:'08:00',title:'Synthetic meeting',attendance:'present',notes:''});await command(q,'delete_dtm_meeting',{id:meetingId,course_id:courseOne});
      await command(q,'save_dtm_grade',{id:gradeId,course_id:courseOne,label:'Synthetic grade',score:'0',maximum:'100',feedback:'',graded_on:''});await command(q,'delete_dtm_grade',{id:gradeId,course_id:courseOne});
      await command(q,'save_dtm_assignment',{id:assignmentId,course_id:courseOne,title:'Synthetic assignment',details:'',due_at:'',status:'open',meeting_id:''});await command(q,'delete_dtm_assignment',{id:assignmentId,course_id:courseOne});
      const imported={course_id:courseOne,events:[{title:'Synthetic calendar entry',due_at:'2030-01-03T03:00:00Z',import_key:'a'.repeat(64)}]};assert.equal((await command(q,'import_dtm_deadlines',imported)).imported,1);assert.equal((await command(q,'import_dtm_deadlines',imported)).imported,0);
      await q.unsafe('reset role');assert.equal((await q`select count(*)::int as count from public.affairs_agent_audit where user_id=${one} and target_id in ${q(targets)}`)[0].count,audited.length);
      assert.equal((await q`select count(*)::int as count from public.dtm_materials where id not in ${q(materialIds)} and target_url is not null`)[0].count,0);
      assert.equal(await legacy(q),legacyBefore);assert.deepEqual(await owner(q,administrator.id),ownerBefore);
      checks.push('all-existing-dtm-operation-branches-calendar-deduplication-audit-and-legacy-owner-preservation');
    });rolledBack=true;
  }catch(error){failure=diagnostic(error,phase);}
  finally{
    clearTimeout(timer);cleanupTimer=setTimeout(()=>{cleanupDeadlineFired=true;lease?.lose();void pool?.end({timeout:1}).catch(()=>{});},45000);cleanupTimer.unref();
    try{if(lease){cleanupPhase='lease';await lease.assertHeld();cleanupPhase='baseline';if(before)assert.deepEqual(await baseline(sql),before);cleanupPhase='history';if(historyBefore)assert.equal(await history(sql),historyBefore);cleanupPhase='schema';if(schemaBefore)assert.equal(await schema(sql),schemaBefore);cleanupPhase='legacy';if(legacyBefore)assert.equal(await legacy(sql),legacyBefore);
      if(started){cleanupPhase='draft-absence';await absent(sql);cleanupPhase='fixture-absence';const [counts]=await sql`select
        (select count(*)::int from auth.users where id in ${sql(users)}) as users,(select count(*)::int from auth.identities where user_id in ${sql(users)}) as identities,
        (select count(*)::int from public.affairs_profiles where user_id in ${sql(users)}) as profiles,(select count(*)::int from public.affairs_students where id=${studentId}) as students,
        (select count(*)::int from public.affairs_programs where id=${programId}) as programs,(select count(*)::int from public.dtm_courses where id in ${sql(courseIds)}) as courses,
        (select count(*)::int from public.dtm_materials where id in ${sql(materialIds)}) as materials,(select count(*)::int from public.dtm_meetings where id=${meetingId}) as meetings,
        (select count(*)::int from public.dtm_grade_items where id=${gradeId}) as grades,(select count(*)::int from public.affairs_assignments where student_id=${studentId} or id=${assignmentId}) as assignments,
        (select count(*)::int from public.affairs_enrollments where student_id=${studentId}) as enrollments,(select count(*)::int from public.affairs_charges where student_id=${studentId}) as charges,
        (select count(*)::int from public.affairs_agent_audit where target_id in ${sql(targets)}) as audits`;for(const count of Object.values(counts))assert.equal(count,0);}
      cleanupPhase='owner';if(ownerBefore)assert.deepEqual(await owner(sql,administrator.id),ownerBefore);cleanupVerified=started&&Boolean(schemaBefore)&&Boolean(ownerBefore);}}
    catch(error){cleanupFailure=diagnostic(error,cleanupPhase);failure??=cleanupFailure;}
    try{if(lease)await lease.release();}catch(error){cleanupVerified=false;cleanupFailure??=diagnostic(error,'release');failure??=cleanupFailure;}
    try{if(pool)await pool.end({timeout:5});connectionClosed=true;}catch(error){failure??=diagnostic(error,'connection-close');}clearTimeout(cleanupTimer);
  }
  let passed=!failure&&!workDeadlineFired&&!cleanupDeadlineFired&&rolledBack&&cleanupVerified&&connectionClosed;
  if(ledger)try{await durable(ledgerPath,{...ledger,status:passed?'passed':'failed',finishedAt:new Date().toISOString(),checks,failure,cleanupFailure,cleanupVerified,connectionClosed,workDeadlineFired,cleanupDeadlineFired});}catch(error){passed=false;failure??=diagnostic(error,'terminal-ledger-write');}
  console.log(JSON.stringify({status:passed?'passed':'failed',mode:'rollback-only-migration-preflight',baseline:before,checks,successfulCommands:audited.length,cleanupVerified,connectionClosed,elapsedMs:Date.now()-start,workDeadlineFired,cleanupDeadlineFired,...(ledger?{ledgerPath}:{}),...(failure?{failure}:{}),...(cleanupFailure?{cleanupFailure}:{}),limitations:'SQL role/RLS and transaction-only validation; no actual JWT, HTTP, browser, remote resource or parallel-operation proof.'}));if(!passed)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{if(dtmResourceCliOptions(process.argv.slice(2)).selfTest)console.log(JSON.stringify(await dtmResourceOfflineChecks()));else await preflight();}catch{console.error(JSON.stringify({status:'failed',phase:'offline-or-cli-gate',databaseConnections:0}));process.exitCode=1;}}

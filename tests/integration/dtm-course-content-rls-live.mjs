import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,open,readFile,realpath,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateDtmCourseContentPayload,dtmCourseContentPayloadBytes,parseDtmCourseContentData,parseDtmCourseContentCoursesData,parseDtmCourseContentAssignmentData} from '../../server/dtmCourseContent.js';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

// Import/self-test is offline. Execution requires the root's serialized lease.
// Personal material fixtures use page/file, matching the real personal editor;
// the legacy materialKind='assignment' distinction is covered by offline DTO tests.
// Student-insert trigger rows are owned by preplanned synthetic student IDs.
// All DDL and synthetic SQL fixtures remain in one rollback-only transaction.
// No Auth HTTP, Storage, model, browser, source-school or external calls.
const clientRoot='/Users/winsonbaring/Documents/GitHub/std_edu_ai-luxart0317';
const project='xiftudmvxphxcjtmfmib',version='20261114010000',prerequisite='20261114000000';
const migration='supabase/migrations/20261114010000_dtm_course_content.sql';
const procedures=['private.dtm_course_content_valid(jsonb)','private.dtm_course_content_payload_valid(text,jsonb)','private.dtm_course_content_identity_guard()',
  'private.dtm_course_content_page(uuid,uuid,text,uuid)','public.dtm_course_content_access()','public.dtm_course_content_read(uuid,text,uuid)',
  'public.dtm_course_content_admin(uuid,uuid,text,uuid)','public.dtm_course_content_assignment(uuid,uuid)','public.dtm_manage_course_content(text,jsonb)'];
export const dtmCourseContentExpectedSchema=Object.freeze({migrations:134,rls_tables:151});
export function dtmCourseContentCliOptions(args){
  if(args.length===1&&args[0]==='--self-test')return {selfTest:true};
  const recovery=args.includes('--recovery-check'),allowed=['--execute',recovery?'--recovery-check':'--preflight','--expected-migrations=134','--expected-rls=151'];
  assert.ok(args.length===4&&new Set(args).size===4&&allowed.every(arg=>args.includes(arg)),'Root lease and exact execute/preflight or read-only recovery flags and baseline are required.');return recovery?{selfTest:false,recovery:true}:{selfTest:false};
}
const safeCode=value=>typeof value==='string'&&/^[A-Z0-9_]{1,40}$/.test(value)?value:'CHECK_FAILED';
export function dtmCourseContentDiagnostic(error,phase){
  const line=/dtm-course-content-rls-live\.mjs:(\d+):(\d+)/.exec(error?.stack??'');
  return {phase,code:safeCode(error?.code),...(line?{line:Number(line[1]),column:Number(line[2])}:{}),
    ...(typeof error?.constraint_name==='string'&&/^[a-z0-9_]{1,100}$/.test(error.constraint_name)?{constraint:error.constraint_name}:{}),
    ...(error?.actual?.code?{actualCode:safeCode(error.actual.code)}:{}),...(error?.expected?.code?{expectedCode:safeCode(error.expected.code)}:{})};
}
async function durableLedger(path,value){
  await mkdir(dirname(path),{recursive:true,mode:0o700});const temp=path+'.next',file=await open(temp,'w',0o600);
  try{await file.writeFile(JSON.stringify(value)+'\n');await file.sync();}finally{await file.close();}
  await rename(temp,path);const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
}
async function assertDraftAbsent(q){
  const names=['public.dtm_course_contents','private.dtm_course_content_operations'];
  const [row]=await q`select not exists(select 1 from jsonb_array_elements_text(${q.json(names)}::jsonb) n(name) where to_regclass(n.name) is not null) as tables_absent,
    not exists(select 1 from jsonb_array_elements_text(${q.json(procedures)}::jsonb) n(name) where to_regprocedure(n.name) is not null) as functions_absent`;
  assert.equal(row.tables_absent,true);assert.equal(row.functions_absent,true);
}
const readBaseline=async q=>(await q`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
const readPrerequisites=async q=>{const [row]=await q`select
  exists(select 1 from supabase_migrations.schema_migrations where version=${prerequisite}) as prerequisite_present,
  not exists(select 1 from supabase_migrations.schema_migrations where version=${version}) as draft_absent`;
  assert.equal(row.prerequisite_present,true);assert.equal(row.draft_absent,true);};
/** SELECT-only recovery for earlier runs that did not persist their UUID ledger.
 * It never deletes or repairs fixtures, and cannot reconstruct prior hashes. */
export async function dtmCourseContentReadOnlyRecovery(q){
  assert.equal((await q`select current_setting('default_transaction_read_only') as read_only`)[0].read_only,'on');
  const baseline=await readBaseline(q);assert.deepEqual(baseline,dtmCourseContentExpectedSchema);await readPrerequisites(q);await assertDraftAbsent(q);
  const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',emailPattern='^dtm-content-qa-'+uuid+'@example[.]invalid$',qaPattern='^QA-'+uuid+'$';
  const [residue]=await q`with fixture_students as (select id from public.affairs_students where full_name='Synthetic Content QA' and student_number~${qaPattern})
    select
    (select count(*)::int from auth.users where email~${emailPattern}) as auth_users,
    (select count(*)::int from auth.identities where identity_data->>'email'~${emailPattern}) as identities,
    (select count(*)::int from public.affairs_profiles where email~${emailPattern}) as profiles,
    (select count(*)::int from fixture_students) as students,
    (select count(*)::int from public.affairs_programs where code~${qaPattern} and name='Synthetic program' and department='Synthetic department') as programs,
    (select count(*)::int from public.dtm_courses where source_mode='personal' and term='Local term' and (code~'^QA-[0-9]+$' or code='') and (title~'^Synthetic course [0-9]+$' or title=${'😀'.repeat(600)})) as courses,
    (select count(*)::int from public.affairs_assignments where source_mode='personal' and (title~'^Synthetic activity [0-9]+$' or title='Synthetic unplaced activity')) as assignments,
    (select count(*)::int from public.dtm_materials where source_mode='personal' and title in ('Synthetic page material','Synthetic foreign material')) as materials,
    (select count(*)::int from public.dtm_grade_items where label='Synthetic legacy tracker') as legacy_grades,
    (select count(*)::int from public.affairs_agent_audit where action_kind in ('save_dtm_course_content','delete_dtm_course_content')) as content_audits,
    (select count(*)::int from public.affairs_assignments where student_id in (select id from fixture_students)) as derived_assignments,
    (select count(*)::int from public.affairs_enrollments where student_id in (select id from fixture_students)) as derived_enrollments,
    (select count(*)::int from public.affairs_charges where student_id in (select id from fixture_students)) as derived_charges`;
  for(const count of Object.values(residue))assert.equal(count,0,'Synthetic-prefix or named fixture residue requires separate owner-reviewed recovery.');
  return {baseline,residue,priorOwnerFingerprintVerified:false,priorFullSchemaFingerprintVerified:false};
}
async function recoveryCheck(){
  let pool,lease,timer,result,failure=null,closed=false,timedOut=false;const start=Date.now();
  try{
    assert.equal(await realpath(process.cwd()),clientRoot);assert.equal(await realpath(fileURLToPath(new URL('../../',import.meta.url))),clientRoot);
    const deployment=JSON.parse(await readFile('deployment.json','utf8'));assert.equal(deployment.repository.toLowerCase(),'luxart0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);
    const {deploymentEnvironment}=await import('../../scripts/deployment-env.mjs'),env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;dormitoryConductClientTarget(connection);
    const {default:postgres}=await import('postgres');pool=postgres(connection,{max:1,max_lifetime:0,idle_timeout:0,connect_timeout:10,onclose:()=>lease?.lose(),
      connection:{statement_timeout:20000,default_transaction_read_only:'on'},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
    timer=setTimeout(()=>{timedOut=true;lease?.lose();void pool.end({timeout:1}).catch(()=>{});},60000);timer.unref();
    lease=await reserveDormitoryConductLease(pool);result=await dtmCourseContentReadOnlyRecovery(lease.sql);
  }catch(error){failure=dtmCourseContentDiagnostic(error,'read-only-recovery');}
  finally{try{if(lease)await lease.release();}catch(error){failure??=dtmCourseContentDiagnostic(error,'read-only-recovery-release');}
    try{if(pool)await pool.end({timeout:5});closed=true;}catch(error){failure??=dtmCourseContentDiagnostic(error,'read-only-recovery-close');}clearTimeout(timer);}
  const passed=!failure&&!timedOut&&closed;console.log(JSON.stringify({status:passed?'passed':'failed',mode:'read-only-prefix-recovery-check',elapsedMs:Date.now()-start,timedOut,connectionClosed:closed,...result,...(failure?{failure}:{}),
    limitations:'Current named baseline/object absence and synthetic-prefix/name residue checks only. No historical owner/full-schema hash comparison; original failed result remains failed. No writes or repairs.'}));if(!passed)process.exitCode=1;
}
export function dtmCourseContentValidationCases(original){
  const deletion={id:original.id,user_id:original.user_id,course_id:original.course_id,request_id:randomUUID(),expected_version:1};
  const valid=[['save_dtm_course_content',original],['save_dtm_course_content',{...original,content:{references:[]}}],['delete_dtm_course_content',deletion]],invalid=[];
  for(const [kind,payload] of [['save_dtm_course_content',original],['delete_dtm_course_content',deletion]]){
    valid.push([kind,{...payload,expected_version:999999998}]);
    for(const key of Object.keys(payload)){const missing={...payload};delete missing[key];invalid.push([kind,missing]);}
    for(const patch of [{extra:null},{id:'bad'},{user_id:null},{course_id:'bad'},{expected_version:'0'},{expected_version:0.5},{expected_version:-1},
      {expected_version:999999999},{request_id:'ABCDEF00-0000-4000-8000-000000000001'}])invalid.push([kind,{...payload,...patch}]);
  }
  const reference={kind:'assignment',id:randomUUID(),section:'quizzes'};
  valid.push(['save_dtm_course_content',{...original,content:{references:[reference,{...reference,kind:'material'}]}}]);
  valid.push(['save_dtm_course_content',{...original,content:{references:Array.from({length:1000},()=>({...reference,id:randomUUID()}))}}]);
  for(const patch of [{id:'bad'},{kind:'quiz'},{section:'exams'},{position:0},{kind:null}])invalid.push(['save_dtm_course_content',{...original,content:{references:[{...reference,...patch}]}}]);
  for(const key of ['kind','id','section']){const missing={...reference};delete missing[key];invalid.push(['save_dtm_course_content',{...original,content:{references:[missing]}}]);}
  for(const content of [null,[],{}, {references:[reference,reference]},{references:Array.from({length:1001},()=>({...reference,id:randomUUID()}))},
    {references:[],extra:true},{references:[null]}])invalid.push(['save_dtm_course_content',{...original,content}]);
  for(const kind of [null,'','constructor','save_dtm_grade_report'])invalid.push([kind,original]);
  invalid.push(['delete_dtm_course_content',{...deletion,expected_version:0}],['delete_dtm_course_content',{...deletion,content:original.content}]);
  return [...valid.map(([kind,value])=>({kind,value,valid:true})),...invalid.map(([kind,value])=>({kind,value,valid:false}))];
}
export async function dtmCourseContentOfflineChecks(){
  assert.deepEqual(dtmCourseContentCliOptions(['--self-test']),{selfTest:true});
  assert.deepEqual(dtmCourseContentCliOptions(['--execute','--preflight','--expected-migrations=134','--expected-rls=151']),{selfTest:false});
  assert.deepEqual(dtmCourseContentCliOptions(['--execute','--recovery-check','--expected-migrations=134','--expected-rls=151']),{selfTest:false,recovery:true});
  for(const args of [[],['--execute'],['--self-test','--execute'],['--execute','--preflight','--expected-migrations=133','--expected-rls=150'],
    ['--execute','--recovery-check','--expected-migrations=134','--expected-rls=151','--preflight']])assert.throws(()=>dtmCourseContentCliOptions(args));
  dormitoryConductClientTarget(`postgres://postgres@db.${project}.supabase.co/postgres`);
  for(const url of [`postgres://postgres@db.other.supabase.co/postgres`,`postgres://postgres.${project}@qa.pooler.supabase.com:6543/postgres`,
    `postgres://postgres@db.${project}.supabase.co/postgres?host=other.invalid`])assert.throws(()=>dormitoryConductClientTarget(url));
  const fixture={id:randomUUID(),user_id:randomUUID(),course_id:randomUUID(),request_id:randomUUID(),expected_version:0,content:{references:[]}};
  const matrix=dtmCourseContentValidationCases(fixture);for(const entry of matrix)assert.equal(validateDtmCourseContentPayload(entry.kind,entry.value)===null,entry.valid);
  const {Types}=await import('../../node_modules/postgres/src/types.js'),types=Types(),raw=JSON.stringify(fixture);
  assert.equal(types.serializer(25)(raw),raw);assert.equal(typeof JSON.parse(types.serializer(3802)(raw)),'string');
  const source=await readFile(new URL(import.meta.url),'utf8');assert.match(source,/'Synthetic page material','page'/);assert.match(source,/student_id not in \$\{q\(studentIds\)\}/);
  const recover=async(residue=0,readOnly='on')=>{
    const rows=[{read_only:readOnly},{...dtmCourseContentExpectedSchema},{prerequisite_present:true,draft_absent:true},{tables_absent:true,functions_absent:true},{auth_users:residue}];let calls=0;
    const q=async(parts)=>{assert.match(parts.join(''),/^\s*(select|with)\b/i);return [rows[calls++]];};q.json=value=>value;
    const result=await dtmCourseContentReadOnlyRecovery(q);assert.equal(calls,5);return result;
  };
  assert.equal((await recover()).priorOwnerFingerprintVerified,false);await assert.rejects(()=>recover(1));await assert.rejects(()=>recover(0,'off'));
  const diagnostic=dtmCourseContentDiagnostic(Object.assign(new Error('PRIVATE'),{code:'ERR_ASSERTION',actual:{code:'PT409',secret:'PRIVATE'},expected:{code:'42501'}}),'safe-phase');
  assert.equal(diagnostic.actualCode,'PT409');assert.equal(diagnostic.expectedCode,'42501');assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE/);
  const ddl=await readFile(new URL('../../'+migration,import.meta.url),'utf8');assert.doesNotMatch(ddl,/alter (?:table|policy) (?:public\.)?(?:dtm_courses|dtm_materials|affairs_assignments|dtm_grade)/i);
  return {status:'passed',mode:'offline-contracts',validationCases:matrix.length,recoveryCases:3,diagnosticCases:1,databaseConnections:0};
}

async function preflight(){
  let pool,lease,sql,phase='local-config',failure=null,cleanupFailure=null,cleanupPhase='not-started',before,historyBefore,schemaBefore,legacyBefore,administrator,ownerBefore,started=false,rolledBack=false,cleanupVerified=false,connectionClosed=true,timer,cleanupTimer,ledger;
  let workDeadlineFired=false,cleanupDeadlineFired=false,watchdogPhase=null;const startedAt=Date.now(),timingsMs={},ledgerPath='artifacts/dtm-course-content-preflight/'+randomUUID()+'/recovery.json';
  const checks=[],users=Array.from({length:4},()=>randomUUID()),courseIds=Array.from({length:104},()=>randomUUID()).sort(),targets=Array.from({length:6},()=>randomUUID()),accepted=new Map();
  const [one,two,nonGoogle,uninitialized]=users,ownCourses=courseIds.slice(0,102),courseTwo=courseIds[102],courseNonGoogle=courseIds[103];
  const [contentOne,contentTwo,contentNonGoogle,replacement,spare,legacyGrade]=targets;
  const assignmentIds=Array.from({length:104},()=>randomUUID()).sort(),ownAssignments=assignmentIds.slice(0,102),assignmentOtherCourse=assignmentIds[102],assignmentForeign=assignmentIds[103];
  const materialIds=[ownAssignments[0],randomUUID()],programId=randomUUID(),studentIds=users.slice(0,3).map(()=>randomUUID()),grown=randomUUID();
  const baseline=readBaseline;
  const history=async q=>(await q`select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.version),'[]'::jsonb)::text) as hash from supabase_migrations.schema_migrations m`)[0].hash;
  const legacy=async q=>(await q`select md5(jsonb_build_object(
    'grades',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb) from public.dtm_grade_items g where id<>${legacyGrade}),
    'reports',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb) from public.dtm_grade_reports g),
    'courses',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb) from public.dtm_courses g where id not in ${q(courseIds)}),
    'assignments',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb) from public.affairs_assignments g where id not in ${q(assignmentIds)} and student_id not in ${q(studentIds)}),
    'enrollments',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb) from public.affairs_enrollments g where student_id not in ${q(studentIds)}),
    'charges',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb) from public.affairs_charges g where student_id not in ${q(studentIds)}),
    'materials',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb) from public.dtm_materials g where id not in ${q(materialIds)})
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
  const fingerprint=async(q,id)=>(await q`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
    from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
  const absent=assertDraftAbsent;
  const role=async(q,id)=>{await q.unsafe('set local role authenticated');await q`select set_config('request.jwt.claim.sub',${id},true)`;};
  const denied=(q,fn,code='42501')=>assert.rejects(q.savepoint(fn),{code});
  const next=value=>({...value,request_id:randomUUID()});
  const save=async(q,kind,payload,raw=JSON.stringify(payload))=>{
    assert.ok(targets.includes(payload.id)&&users.includes(payload.user_id)&&courseIds.includes(payload.course_id));assert.deepEqual(JSON.parse(raw),payload);
    const result=(await q`select public.dtm_manage_course_content(${kind},${raw}::text::jsonb) as result`)[0].result;
    assert.deepEqual(Object.keys(result).sort(),['courseId','id','kind','summary','userId','version']);
    assert.equal(result.id,payload.id);assert.equal(result.userId,payload.user_id);assert.equal(result.courseId,payload.course_id);assert.equal(result.kind,kind);assert.equal(result.version,payload.expected_version+1);
    const entry={kind,payload:structuredClone(payload),result},prior=accepted.get(payload.request_id);if(prior)assert.deepEqual(prior,entry);else accepted.set(payload.request_id,entry);return result;
  };
  const ownPage=async(q,ownerId,courseId,cursor)=>(parseDtmCourseContentData((await q`select public.dtm_course_content_read(${courseId},${cursor?.kind??null},${cursor?.id??null}) as result`)[0].result,ownerId,courseId,cursor));
  try{
    assert.equal(await realpath(process.cwd()),clientRoot);assert.equal(await realpath(fileURLToPath(new URL('../../',import.meta.url))),clientRoot);
    const deployment=JSON.parse(await readFile('deployment.json','utf8'));assert.equal(deployment.repository.toLowerCase(),'luxart0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);
    const {deploymentEnvironment}=await import('../../scripts/deployment-env.mjs'),env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;dormitoryConductClientTarget(connection);
    const ddl=await readFile(migration,'utf8'),{default:postgres}=await import('postgres');
    pool=postgres(connection,{max:1,max_lifetime:0,idle_timeout:0,connect_timeout:10,onclose:()=>lease?.lose(),connection:{statement_timeout:20000},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});connectionClosed=false;
    timer=setTimeout(()=>{workDeadlineFired=true;watchdogPhase=phase;lease?.lose();void pool.end({timeout:1}).catch(()=>{});},180000);timer.unref();
    phase='physical-lease';lease=await reserveDormitoryConductLease(pool);sql=lease.sql;
    phase='baseline';before=await baseline(sql);assert.deepEqual(before,dtmCourseContentExpectedSchema);historyBefore=await history(sql);schemaBefore=await schema(sql);legacyBefore=await legacy(sql);
    assert.equal((await sql`select count(*)::int as count from supabase_migrations.schema_migrations where version=${prerequisite}`)[0].count,1);
    assert.equal((await sql`select count(*)::int as count from supabase_migrations.schema_migrations where version=${version}`)[0].count,0);await absent(sql);
    for(const name of ['public.affairs_profiles','public.affairs_agent_audit','public.dtm_courses','public.dtm_materials','public.affairs_assignments','public.dtm_grade_reports'])assert.notEqual((await sql`select to_regclass(${name}) as name`)[0].name,null);
    assert.equal((await sql`select count(*)::int as count from pg_constraint where conname='dtm_courses_report_owner_key' and conrelid='public.dtm_courses'::regclass`)[0].count,1);
    [administrator]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator,'Existing verified administrator required; no owner repair permitted.');ownerBefore=await fingerprint(sql,administrator.id);assert.ok(!users.includes(administrator.id));
    assert.equal((await sql`select count(*)::int as count from auth.users where id in ${sql(users)}`)[0].count,0);
    assert.equal((await sql`select count(*)::int as count from public.dtm_courses where id in ${sql(courseIds)}`)[0].count,0);
    assert.equal((await sql`select count(*)::int as count from public.affairs_assignments where id in ${sql(assignmentIds)}`)[0].count,0);
    assert.equal((await sql`select count(*)::int as count from public.dtm_materials where id in ${sql(materialIds)}`)[0].count,0);
    assert.equal((await sql`select count(*)::int as count from public.affairs_students where id in ${sql(studentIds)}`)[0].count,0);
    assert.equal((await sql`select count(*)::int as count from public.affairs_programs where id=${programId}`)[0].count,0);
    assert.equal((await sql`select count(*)::int as count from public.affairs_agent_audit where target_id in ${sql(targets)}`)[0].count,0);
    phase='durable-pretransaction-manifest';ledger={format:1,project,migrationVersion:version,createdAt:new Date().toISOString(),status:'pretransaction',
      before:{baseline:before,history:historyBefore,schema:schemaBefore,legacy:legacyBefore,owner:ownerBefore},
      fixtures:{users:users.map(id=>({id,email:`dtm-content-qa-${id}@example.invalid`})),courseIds,assignmentIds:[...assignmentIds,grown],materialIds,studentIds,programId,targets,legacyGrade},
      limitations:'Synthetic IDs and pretransaction hashes only; no credentials. Pending or failed state never proves cleanup.'};
    await durableLedger(ledgerPath,ledger);
    await lease.rollbackOnly(async q=>{
      started=true;phase='draft-ddl';await q.unsafe("set local lock_timeout='8s'");await q.unsafe("set local idle_in_transaction_session_timeout='30s'");await q.unsafe(ddl);
      assert.deepEqual(await baseline(q),{migrations:134,rls_tables:152});assert.equal(await history(q),historyBefore);
      phase='fixture-auth-users-profiles';for(const userId of users){const google=userId!==nonGoogle,email=`dtm-content-qa-${userId}@example.invalid`;
        await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
          values('00000000-0000-0000-0000-000000000000',${userId},'authenticated','authenticated',${email},now(),
          ${q.json(google?{provider:'google',providers:['google']}:{provider:'email',providers:['email']})},'{"full_name":"Synthetic Content QA"}',now(),now())`;
        if(google)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
          values(${userId},${userId},${q.json({sub:userId,email,email_verified:true})},'google',now(),now(),now())`;
        if(userId!==uninitialized)await q`insert into public.affairs_profiles(user_id,email,display_name,role) values(${userId},${email},'Synthetic Content QA','student')`;
      }
      phase='fixture-program';await q`insert into public.affairs_programs(id,code,name,department) values(${programId},${'QA-'+programId},'Synthetic program','Synthetic department')`;
      phase='fixture-students-with-derived-sample-rows';for(const [index,userId] of users.slice(0,3).entries())await q`insert into public.affairs_students(id,user_id,student_number,full_name,program_id,year_level)
        values(${studentIds[index]},${userId},${'QA-'+userId},'Synthetic Content QA',${programId},1)`;
      phase='fixture-courses';let stepStarted=Date.now();const courseRows=courseIds.map((id,index)=>({id,user_id:id===courseTwo?two:id===courseNonGoogle?nonGoogle:one,code:index===101?'':'QA-'+index,title:index===101?'😀'.repeat(600):'Synthetic course '+index}));
      const insertedCourses=await q`insert into public.dtm_courses(id,user_id,code,title,term,source_mode)
        select id,user_id,code,title,'Local term','personal' from jsonb_to_recordset(${q.json(courseRows)}::jsonb) as item(id uuid,user_id uuid,code text,title text) returning id`;
      assert.deepEqual(Array.from(insertedCourses,row=>row.id).sort(),courseIds);timingsMs.fixtureCourses=Date.now()-stepStarted;
      phase='fixture-dtm-assignments';stepStarted=Date.now();const assignmentRows=assignmentIds.map((id,index)=>({id,student_id:id===assignmentForeign?studentIds[1]:studentIds[0],dtm_course_id:id===assignmentForeign?courseTwo:id===assignmentOtherCourse?ownCourses[1]:ownCourses[0],title:'Synthetic activity '+index}));
      const insertedAssignments=await q`insert into public.affairs_assignments(id,student_id,dtm_course_id,title,details,due_at,status,source_mode)
        select id,student_id,dtm_course_id,title,'',null,'open','personal' from jsonb_to_recordset(${q.json(assignmentRows)}::jsonb) as item(id uuid,student_id uuid,dtm_course_id uuid,title text) returning id`;
      assert.deepEqual(Array.from(insertedAssignments,row=>row.id).sort(),assignmentIds);timingsMs.fixtureAssignments=Date.now()-stepStarted;
      phase='fixture-dtm-materials';await q`insert into public.dtm_materials(id,course_id,title,kind,summary,position,source_mode) values
        (${materialIds[0]},${ownCourses[0]},'Synthetic page material','page','',1,'personal'),(${materialIds[1]},${courseTwo},'Synthetic foreign material','page','',2,'personal')`;
      phase='fixture-legacy-grade';await q`insert into public.dtm_grade_items(id,course_id,label,score,maximum) values(${legacyGrade},${ownCourses[0]},'Synthetic legacy tracker',66,100)`;
      const original={id:contentOne,user_id:one,course_id:ownCourses[0],request_id:randomUUID(),expected_version:0,content:{references:[
        {kind:'assignment',id:ownAssignments[0],section:'quizzes'},{kind:'material',id:materialIds[0],section:'materials'},{kind:'assignment',id:ownAssignments[1],section:'assignments'}]}};
      phase='validation-parity';const matrix=dtmCourseContentValidationCases(original),parity=await q`select item.ordinal::int as ordinal,
        private.dtm_course_content_payload_valid(item.value->>'kind',item.value->'value') as valid,octet_length((item.value->'value')::text) as bytes
        from jsonb_array_elements(${q.json(matrix)}::jsonb) with ordinality item(value,ordinal) order by ordinal`;
      assert.equal(parity.length,matrix.length);for(const [index,entry] of matrix.entries()){phase='validation-'+index;assert.equal(parity[index].valid,entry.valid);if(entry.valid)assert.equal(parity[index].bytes,dtmCourseContentPayloadBytes(entry.value));}
      const scale=JSON.stringify(original).replace('"expected_version":0','"expected_version":0.0');assert.equal((await q`select private.dtm_course_content_payload_valid('save_dtm_course_content',${scale}::text::jsonb) as valid`)[0].valid,true);
      phase='table-and-function-acls';stepStarted=Date.now();const acl=await q`select 'table' as kind,p.privilege as name,'authenticated' as role,has_table_privilege('authenticated','public.dtm_course_contents',p.privilege) as allowed
        from (values('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege)
        union all select 'table','SELECT','anon',has_table_privilege('anon','public.dtm_course_contents','SELECT')
        union all select 'function',p.name,r.role,has_function_privilege(r.role,p.name,'EXECUTE') from jsonb_array_elements_text(${q.json(procedures)}::jsonb) p(name) cross join (values('authenticated'),('anon')) r(role)`;
      assert.equal(acl.length,5+2*procedures.length);for(const row of acl)assert.equal(row.allowed,row.kind==='function'&&row.role==='authenticated'&&row.name.startsWith('public.'));timingsMs.acls=Date.now()-stepStarted;
      checks.push('strict-jsonb-validation-reference-limit-scale-parity-and-acls');
      phase='admin-legacy-rls';await role(q,administrator.id);
      assert.equal((await q`select id from public.dtm_courses where id in ${q(courseIds)}`).length,0);assert.equal((await q`select id from public.dtm_materials where id in ${q(materialIds)}`).length,0);
      assert.equal((await q`select id from public.affairs_assignments where id in ${q(assignmentIds)}`).length,0);
      phase='admin-course-picker';const courses=parseDtmCourseContentCoursesData((await q`select public.dtm_grade_report_courses_admin(${one},null,null) as result`)[0].result,one);
      const remaining=parseDtmCourseContentCoursesData((await q`select public.dtm_grade_report_courses_admin(${one},null,${courses.nextCursor}) as result`)[0].result,one,courses.nextCursor);
      assert.deepEqual([...courses.courses,...remaining.courses].map(row=>row.id),ownCourses);assert.equal(remaining.courses[1].title,'😀'.repeat(600));assert.equal(remaining.courses[1].code,'');
      phase='admin-initial-content';const initial=parseDtmCourseContentData((await q`select public.dtm_course_content_admin(${one},${ownCourses[0]},null,null) as result`)[0].result,one,ownCourses[0]);
      assert.equal(initial.content,null);assert.equal(initial.total,103);assert.equal(initial.activities.length,100);
      phase='admin-query-denials';await denied(q,s=>s`select public.dtm_course_content_admin(${two},${ownCourses[0]},null,null)`);
      await denied(q,s=>s`select public.dtm_course_content_admin(${one},${ownCourses[0]},'assignment',null)`,'22023');
      await denied(q,s=>s`select public.dtm_course_content_admin(${one},${ownCourses[0]},null,${ownAssignments[0]})`,'22023');
      phase='admin-first-create-replay';const first=await save(q,'save_dtm_course_content',original,scale);assert.deepEqual(await save(q,'save_dtm_course_content',original),first);
      const foreign=next({...original,id:contentTwo,user_id:two,course_id:courseTwo,content:{references:[{kind:'assignment',id:assignmentForeign,section:'quizzes'}]}});
      phase='admin-other-account-creates';await save(q,'save_dtm_course_content',foreign);await save(q,'save_dtm_course_content',next({...original,id:contentNonGoogle,user_id:nonGoogle,course_id:courseNonGoogle,content:{references:[]}}));
      phase='admin-content-rls';
      assert.equal((await q`select id from public.dtm_course_contents`).length,0,'administrator receives only exact-target RPC data');
      for(const [index,ref] of [{kind:'assignment',id:assignmentOtherCourse,section:'assignments'},{kind:'assignment',id:assignmentForeign,section:'assignments'},
        {kind:'material',id:materialIds[1],section:'materials'},{kind:'material',id:ownAssignments[1],section:'materials'}].entries()){
        phase='admin-reference-denial-'+index;await denied(q,s=>save(s,'save_dtm_course_content',next({...original,expected_version:1,content:{references:[ref]}})),'PT409');}
      phase='admin-duplicate-course-denial';await denied(q,s=>save(s,'save_dtm_course_content',next({...original,id:spare})),'PT409');
      checks.push('paged-personal-course-activity-access-without-broadening-legacy-rls-and-same-course-reference-validation');
      phase='own-pages-and-details';await role(q,one);const pageOne=await ownPage(q,one,ownCourses[0]),pageTwo=await ownPage(q,one,ownCourses[0],pageOne.nextCursor);
      assert.equal(pageOne.revision,pageTwo.revision);assert.deepEqual(pageOne.content.references,original.content.references);
      assert.deepEqual([...pageOne.activities,...pageTwo.activities].map(row=>row.kind+':'+row.id),[...ownAssignments.map(id=>'assignment:'+id),'material:'+materialIds[0]]);
      assert.equal(pageTwo.nextCursor,null);assert.equal(pageTwo.activities.at(-1).materialKind,'page');
      const detail=parseDtmCourseContentAssignmentData((await q`select public.dtm_course_content_assignment(${ownCourses[0]},${ownAssignments[101]}) as result`)[0].result,one,ownCourses[0],ownAssignments[101]);assert.equal(detail.assignment.id,ownAssignments[101]);
      for(const missing of [assignmentOtherCourse,assignmentForeign,randomUUID()])assert.deepEqual((await q`select public.dtm_course_content_assignment(${ownCourses[0]},${missing}) as result`)[0].result,{assignment:null});
      assert.equal((await q`select id from public.dtm_course_contents where user_id=${two}`).length,0);await denied(q,s=>s`select public.dtm_course_content_read(${courseTwo},null,null)`);
      await denied(q,s=>s`select public.dtm_course_content_admin(${one},${ownCourses[0]},null,null)`);await denied(q,s=>s`select * from private.dtm_course_content_operations`);
      for(const kind of ['save_dtm_course_content','delete_dtm_course_content'])await denied(q,s=>save(s,kind,kind.startsWith('save')?next({...original,expected_version:1}):{...original,expected_version:1}));
      await denied(q,s=>s`update public.dtm_course_contents set content='{"references":[]}' where id=${contentOne}`);await denied(q,s=>s`delete from public.dtm_course_contents where id=${contentOne}`);
      await role(q,two);assert.deepEqual((await q`select id from public.dtm_course_contents`).map(row=>row.id),[contentTwo]);
      for(const userId of [nonGoogle,uninitialized]){await role(q,userId);assert.equal((await q`select id from public.dtm_course_contents`).length,0);await denied(q,s=>s`select public.dtm_course_content_read(${courseNonGoogle},null,null)`);}
      await q.unsafe('set local role anon');await denied(q,s=>s`select * from public.dtm_course_contents`);await denied(q,s=>s`select public.dtm_course_content_read(${ownCourses[0]},null,null)`);
      checks.push('complete-activity-pagination-exact-assignment-owner-cross-account-anonymous-nongoogle-and-direct-write-denials');
      phase='full-revision-and-inert-stale-references';await q.unsafe('reset role');
      await q`update public.affairs_assignments set details='Changed outside first page' where id=${ownAssignments[101]}`;
      await role(q,one);const afterOutside=await ownPage(q,one,ownCourses[0]);assert.notEqual(afterOutside.revision,pageOne.revision);assert.deepEqual(afterOutside.activities,pageOne.activities);
      await q.unsafe('reset role');await q`update public.dtm_materials set summary='Changed material summary' where id=${materialIds[0]}`;
      await role(q,one);const afterMaterial=await ownPage(q,one,ownCourses[0]);assert.notEqual(afterMaterial.revision,afterOutside.revision);
      await q.unsafe('reset role');await q`delete from public.affairs_assignments where id=${ownAssignments[0]}`;
      await q`update public.dtm_materials set course_id=${courseTwo} where id=${materialIds[0]}`;
      await role(q,one);const stale=await ownPage(q,one,ownCourses[0]);assert.equal(stale.unavailableReferenceCount,2);assert.equal(stale.total,101);assert.deepEqual(stale.content.references,original.content.references);
      assert.ok(stale.activities.every(row=>row.kind==='assignment'&&row.id!==ownAssignments[0]));assert.notEqual(stale.revision,afterMaterial.revision);
      assert.deepEqual((await q`select public.dtm_course_content_assignment(${ownCourses[0]},${ownAssignments[0]}) as result`)[0].result,{assignment:null});
      await role(q,administrator.id);assert.deepEqual(await save(q,'save_dtm_course_content',original),first);
      await denied(q,s=>save(s,'save_dtm_course_content',next({...original,expected_version:1})),'PT409');
      await q.unsafe('reset role');assignmentIds.push(grown);await q`insert into public.affairs_assignments(id,student_id,dtm_course_id,title,source_mode) values(${grown},${studentIds[0]},${ownCourses[0]},'Synthetic unplaced activity','personal')`;
      await role(q,one);assert.equal((await ownPage(q,one,ownCourses[0])).total,102);assert.equal((await ownPage(q,one,ownCourses[0])).content.references.length,3);
      checks.push('full-catalog-revision-offpage-changes-delete-move-stale-ref-isolation-and-new-unplaced-visibility');
      phase='cas-replay-delete';await role(q,administrator.id);
      const changed=next({...original,expected_version:1,content:{references:[original.content.references[2]]}}),edited=await save(q,'save_dtm_course_content',changed);
      assert.deepEqual(await save(q,'save_dtm_course_content',changed),edited);assert.deepEqual(await save(q,'save_dtm_course_content',original),first);
      await denied(q,s=>save(s,'save_dtm_course_content',next(changed)),'PT409');await denied(q,s=>save(s,'save_dtm_course_content',{...changed,content:{references:[]}}),'PT409');
      await denied(q,s=>save(s,'save_dtm_course_content',next({...changed,user_id:two,course_id:courseTwo,expected_version:2})));
      const remove={id:contentOne,user_id:one,course_id:ownCourses[0],request_id:randomUUID(),expected_version:2},removed=await save(q,'delete_dtm_course_content',remove);
      assert.deepEqual(await save(q,'delete_dtm_course_content',remove),removed);assert.deepEqual(await save(q,'save_dtm_course_content',original),first);
      for(const expected_version of [0,3])await denied(q,s=>save(s,'save_dtm_course_content',next({...original,expected_version})),'PT409');
      await role(q,one);const reset=await ownPage(q,one,ownCourses[0]);assert.equal(reset.content,null);assert.equal(reset.total,102);assert.equal(reset.unavailableReferenceCount,0);
      await role(q,administrator.id);await save(q,'save_dtm_course_content',next({...original,id:replacement,content:{references:[]}}));
      await q.unsafe('reset role');await denied(q,s=>s`update public.dtm_course_contents set deleted_at=null where id=${contentOne}`,'PT409');
      await denied(q,s=>s`update public.dtm_course_contents set user_id=${one} where id=${contentTwo}`);
      await denied(q,s=>s`update public.dtm_courses set user_id=${two} where id=${ownCourses[0]}`,'23503');
      checks.push('serial-version-conflict-exact-late-replay-delete-reset-tombstone-and-immutable-ownership');
      phase='audit-legacy-cascade';const receipts=await q`select request_id,kind,payload,result from private.dtm_course_content_operations where actor_id=${administrator.id} and course_id in ${q(courseIds)}`;
      assert.equal(accepted.size,6);assert.equal(receipts.length,accepted.size);for(const receipt of receipts)assert.deepEqual({kind:receipt.kind,payload:receipt.payload,result:receipt.result},accepted.get(receipt.request_id));
      assert.equal((await q`select count(*)::int as count from public.affairs_agent_audit where user_id=${administrator.id} and target_id in ${q(targets)}`)[0].count,accepted.size);
      assert.deepEqual((await q`select score::text as score,maximum::text as maximum from public.dtm_grade_items where id=${legacyGrade}`)[0],{score:'66.00',maximum:'100.00'});
      assert.equal(await legacy(q),legacyBefore);assert.deepEqual(await fingerprint(q,administrator.id),ownerBefore);
      await q`delete from auth.users where id=${nonGoogle}`;assert.equal((await q`select id from public.dtm_course_contents where user_id=${nonGoogle}`).length,0);assert.equal((await q`select request_id from private.dtm_course_content_operations where user_id=${nonGoogle}`).length,0);
      await q`delete from public.dtm_courses where id=${courseTwo}`;assert.equal((await q`select id from public.dtm_course_contents where id=${contentTwo}`).length,0);assert.equal((await q`select request_id from private.dtm_course_content_operations where course_id=${courseTwo}`).length,0);
      checks.push('exact-audit-receipts-legacy-preservation-owner-fingerprint-and-course-user-cascades');
    });rolledBack=true;
  }catch(error){failure=dtmCourseContentDiagnostic(error,phase);}
  finally{
    clearTimeout(timer);timingsMs.work=Date.now()-startedAt;const cleanupStarted=Date.now();
    cleanupTimer=setTimeout(()=>{cleanupDeadlineFired=true;lease?.lose();void pool?.end({timeout:1}).catch(()=>{});},45000);cleanupTimer.unref();
    try{if(lease){cleanupPhase='lease-check';await lease.assertHeld();cleanupPhase='baseline';if(before)assert.deepEqual(await baseline(sql),before);
      cleanupPhase='migration-history';if(historyBefore)assert.equal(await history(sql),historyBefore);cleanupPhase='schema-fingerprint';if(schemaBefore)assert.equal(await schema(sql),schemaBefore);
      cleanupPhase='legacy-fingerprint';if(legacyBefore)assert.equal(await legacy(sql),legacyBefore);
      if(started){cleanupPhase='draft-object-absence';await absent(sql);cleanupPhase='exact-fixture-absence';
        const [residue]=await sql`select
          (select count(*)::int from auth.users where id in ${sql(users)}) as users,
          (select count(*)::int from auth.identities where user_id in ${sql(users)}) as identities,
          (select count(*)::int from public.affairs_profiles where user_id in ${sql(users)}) as profiles,
          (select count(*)::int from public.affairs_students where id in ${sql(studentIds)}) as students,
          (select count(*)::int from public.dtm_courses where id in ${sql(courseIds)}) as courses,
          (select count(*)::int from public.affairs_assignments where id in ${sql([...assignmentIds,grown])} or student_id in ${sql(studentIds)}) as assignments,
          (select count(*)::int from public.dtm_materials where id in ${sql(materialIds)}) as materials,
          (select count(*)::int from public.affairs_enrollments where student_id in ${sql(studentIds)}) as enrollments,
          (select count(*)::int from public.affairs_charges where student_id in ${sql(studentIds)}) as charges,
          (select count(*)::int from public.affairs_programs where id=${programId}) as programs,
          (select count(*)::int from public.dtm_grade_items where id=${legacyGrade}) as grades,
          (select count(*)::int from public.affairs_agent_audit where target_id in ${sql(targets)}) as audits`;
        for(const count of Object.values(residue))assert.equal(count,0);}
      cleanupPhase='protected-owner-fingerprint';if(ownerBefore)assert.deepEqual(await fingerprint(sql,administrator.id),ownerBefore);cleanupVerified=started&&Boolean(schemaBefore)&&Boolean(ownerBefore);}}
    catch(error){cleanupFailure=dtmCourseContentDiagnostic(error,cleanupPhase);failure??=cleanupFailure;cleanupVerified=false;}
    try{if(lease)await lease.release();}catch(error){cleanupVerified=false;cleanupFailure??=dtmCourseContentDiagnostic(error,'lease-release');failure??=cleanupFailure;}
    try{if(pool)await pool.end({timeout:5});connectionClosed=true;}catch(error){cleanupFailure??=dtmCourseContentDiagnostic(error,'connection-close');failure??=cleanupFailure;}
    clearTimeout(cleanupTimer);timingsMs.cleanup=Date.now()-cleanupStarted;
  }
  let passed=!failure&&!workDeadlineFired&&!cleanupDeadlineFired&&rolledBack&&cleanupVerified&&connectionClosed;
  if(ledger)try{await durableLedger(ledgerPath,{...ledger,status:passed?'passed':'failed',finishedAt:new Date().toISOString(),cleanupVerified,connectionClosed,checks,workDeadlineFired,cleanupDeadlineFired,timingsMs,failure,cleanupFailure});}
  catch(error){passed=false;failure??=dtmCourseContentDiagnostic(error,'terminal-ledger-write');}
  console.log(JSON.stringify({status:passed?'passed':'failed',mode:'rollback-only-migration-preflight',baseline:before,checks,cleanupVerified,connectionClosed,
    elapsedMs:Date.now()-startedAt,timingsMs,workDeadlineFired,cleanupDeadlineFired,watchdogPhase,leaseLost:lease?.lost??false,...(ledger?{ledgerPath}:{}),...(cleanupFailure?{cleanupFailure}:{}),
    fixtureCounts:{users:users.length,courses:courseIds.length,assignments:assignmentIds.length,successfulRequests:accepted.size},...(failure?{failure}:{}),
    limitations:'SQL role claims and serial stale operations only; no actual JWT/HTTP/browser/model or parallel RPC acceptance.'}));if(!passed)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const options=dtmCourseContentCliOptions(process.argv.slice(2));if(options.selfTest)console.log(JSON.stringify(await dtmCourseContentOfflineChecks()));else if(options.recovery)await recoveryCheck();else await preflight();}
  catch{console.error(JSON.stringify({status:'failed',phase:'offline-or-cli-gate',databaseConnections:0}));process.exitCode=1;}
}

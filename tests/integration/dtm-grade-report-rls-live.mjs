import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dtmGradeReportPayloadBytes,validateDtmGradeReportPayload,parseDtmGradeReportCoursesData,parseDtmGradeReportOverviewData} from '../../server/dtmGradeReport.js';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

// PREPARED ONLY: --self-test/import never resolves credentials or opens a DB.
// Root must grant the serialized lease before --execute. Every fixture and DDL
// change is inside one physically reserved, always-rolled-back transaction.
// Reuse the reviewed native harness's sticky-loss lease, including guarded
// control statements and abort-safe savepoints. No HTTP/JWT/model/browser calls.
const clientRoot='/Users/winsonbaring/Documents/GitHub/std_edu_ai-luxart0317';
const project='xiftudmvxphxcjtmfmib',version='20261114000000',prerequisite='20261113230000';
const migration='supabase/migrations/20261114000000_dtm_grade_reports.sql';
const procedures=['private.dtm_grade_report_cells_valid(jsonb)','private.dtm_grade_report_content_valid(jsonb)',
  'private.dtm_grade_report_payload_valid(text,jsonb)','private.dtm_grade_report_identity_guard()',
  'public.dtm_grade_report_access()','public.dtm_grade_report_courses_admin(uuid,uuid,uuid)','public.dtm_grade_report_overview(uuid)','public.dtm_manage_grade_report(text,jsonb)'];
export const dtmGradeReportExpectedSchema=Object.freeze({migrations:133,rls_tables:150});
export function dtmGradeReportCliOptions(args){
  if(args.length===1&&args[0]==='--self-test')return {selfTest:true};
  const allowed=['--execute','--preflight','--expected-migrations=133','--expected-rls=150'];
  assert.ok(args.length===4&&new Set(args).size===4&&allowed.every(arg=>args.includes(arg)),
    'Root lease and --execute --preflight --expected-migrations=133 --expected-rls=150 are required.');return {selfTest:false};
}
const cells=()=>({score:null,maximum:null,gradeText:null,rangeText:null,percentageText:null,weightText:null,weightNote:null,rankText:null,feedbackText:null,contributionText:null});
const item=index=>({...cells(),id:'50000000-0000-4000-8000-'+String(index).padStart(12,'0'),label:'Synthetic item '+index,activityKind:'assignment'});
export const dtmGradeReportFixture=(id,userId,courseId,requestId)=>({id,user_id:userId,course_id:courseId,request_id:requestId,expected_version:0,
  report:{items:[{...item(1),score:0,maximum:100,gradeText:null,rangeText:'0–100',weightText:'0.00 %',weightNote:'(empty)',feedbackText:'',contributionText:'0.00 %'},
    {...item(2),gradeText:'Literal assessment',activityKind:null}],total:{...cells(),gradeText:'0',rangeText:'0–100'}}});
export function dtmGradeReportValidationCases(original){
  const deletion={id:original.id,user_id:original.user_id,course_id:original.course_id,request_id:randomUUID(),expected_version:1};
  const valid=[['save_dtm_grade_report',original],['save_dtm_grade_report',{...original,report:{items:[],total:null}}],['delete_dtm_grade_report',deletion]],invalid=[];
  for(const [kind,payload] of [['save_dtm_grade_report',original],['delete_dtm_grade_report',deletion]]){
    valid.push([kind,{...payload,expected_version:999999998}]);
    for(const key of Object.keys(payload)){const missing={...payload};delete missing[key];invalid.push([kind,missing]);}
    for(const patch of [{extra:null},{id:'bad'},{user_id:null},{course_id:'bad'},{expected_version:'0'},{expected_version:0.5},{expected_version:-1},
      {expected_version:999999999},{request_id:'ABCDEF00-0000-4000-8000-000000000001'}])invalid.push([kind,{...payload,...patch}]);
  }
  for(const patch of [{label:'😀'.repeat(160)},{feedbackText:'\n\t literal '},{score:0,maximum:null},{score:null,maximum:0.01},{score:1000000,maximum:1000000}])
    valid.push(['save_dtm_grade_report',{...original,report:{items:[{...item(1),...patch}],total:null}}]);
  for(const patch of [{label:''},{label:'\u00a0\u3000\ufeff'},{label:'😀'.repeat(161)},{feedbackText:'x'.repeat(2001)},{gradeText:'x'.repeat(81)},
    {activityKind:'quiz'},{score:'0'},{score:-1},{score:1.001},{maximum:0},{maximum:1000001},{score:2,maximum:1},{categoryId:'invented'}])
    invalid.push(['save_dtm_grade_report',{...original,report:{items:[{...item(1),...patch}],total:null}}]);
  for(const key of Object.keys(item(1))){const missing={...item(1)};delete missing[key];invalid.push(['save_dtm_grade_report',{...original,report:{items:[missing],total:null}}]);}
  for(const report of [null,[],{}, {items:[item(1),item(1)],total:null},{items:Array.from({length:501},(_,i)=>item(i+1)),total:null},
    {items:[],total:{...cells(),score:1.001}},{items:[],total:null,secret:'not allowed'}])invalid.push(['save_dtm_grade_report',{...original,report}]);
  for(const kind of [null,'','constructor','save_dtm_grade'])invalid.push([kind,original]);
  invalid.push(['delete_dtm_grade_report',{...deletion,expected_version:0}],['delete_dtm_grade_report',{...deletion,report:original.report}]);
  return [...valid.map(([kind,value])=>({kind,value,valid:true})),...invalid.map(([kind,value])=>({kind,value,valid:false}))];
}
export function dtmGradeReportBudgetFixture(original,bytes=131072){
  const value={...original,report:{items:Array.from({length:100},(_,i)=>({...item(i+1),feedbackText:''})),total:null}};
  for(const row of value.report.items){const remaining=bytes-dtmGradeReportPayloadBytes(value);assert.ok(remaining>=0);row.feedbackText='x'.repeat(Math.min(2000,remaining));if(remaining<=2000)break;}
  assert.equal(dtmGradeReportPayloadBytes(value),bytes);return value;
}
export async function dtmGradeReportOfflineChecks(){
  assert.deepEqual(dtmGradeReportCliOptions(['--self-test']),{selfTest:true});
  assert.deepEqual(dtmGradeReportCliOptions(['--execute','--preflight','--expected-migrations=133','--expected-rls=150']),{selfTest:false});
  for(const args of [[],['--execute'],['--self-test','--execute'],['--execute','--preflight','--expected-migrations=132','--expected-rls=149']])assert.throws(()=>dtmGradeReportCliOptions(args));
  dormitoryConductClientTarget(`postgres://postgres@db.${project}.supabase.co/postgres`);
  for(const value of [`postgres://postgres@db.other.supabase.co/postgres`,`postgres://postgres.${project}@qa.pooler.supabase.com:6543/postgres`,
    `postgres://postgres@db.${project}.supabase.co/postgres?host=other.invalid`])assert.throws(()=>dormitoryConductClientTarget(value));
  const fixture=dtmGradeReportFixture(randomUUID(),randomUUID(),randomUUID(),randomUUID()),matrix=dtmGradeReportValidationCases(fixture);
  for(const entry of matrix)assert.equal(validateDtmGradeReportPayload(entry.kind,entry.value)===null,entry.valid);
  for(const bytes of [131072,131073])assert.equal(validateDtmGradeReportPayload('save_dtm_grade_report',dtmGradeReportBudgetFixture(fixture,bytes))===null,bytes===131072);
  const {Types}=await import('../../node_modules/postgres/src/types.js'),types=Types(),raw=JSON.stringify(fixture);
  assert.equal(types.serializer(25)(raw),raw);assert.equal(typeof JSON.parse(types.serializer(3802)(raw)),'string');
  return {status:'passed',mode:'offline-contracts',validationCases:matrix.length,databaseConnections:0};
}

async function preflight(){
  let pool,lease,sql,phase='local-config',failure=null,before,historyBefore,schemaBefore,legacyBefore,administrator,ownerBefore,started=false,rolledBack=false,cleanupVerified=false,connectionClosed=true,timer;
  const checks=[],users=Array.from({length:4},()=>randomUUID()),courseIds=Array.from({length:104},()=>randomUUID()).sort(),targets=Array.from({length:8},()=>randomUUID()),accepted=new Map();
  const [one,two,nonGoogle,uninitialized]=users,ownCourses=courseIds.slice(0,102),courseTwo=courseIds[102],courseNonGoogle=courseIds[103];
  const [reportOne,reportTwo,reportNonGoogle,blankReport,nullReport,replacement,spare,legacyGrade]=targets;
  const baseline=async q=>(await q`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
  const history=async q=>(await q`select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.version),'[]'::jsonb)::text) as hash from supabase_migrations.schema_migrations m`)[0].hash;
  const legacy=async q=>(await q`select md5(coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]'::jsonb)::text) as hash from public.dtm_grade_items g where id<>${legacyGrade}`)[0].hash;
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
  const absent=async q=>{for(const name of ['public.dtm_grade_reports','private.dtm_grade_report_operations'])assert.equal((await q`select to_regclass(${name}) as name`)[0].name,null);
    for(const name of procedures)assert.equal((await q`select to_regprocedure(${name}) as name`)[0].name,null);
    assert.equal((await q`select count(*)::int as count from pg_constraint where conname='dtm_courses_report_owner_key' and conrelid='public.dtm_courses'::regclass`)[0].count,0);};
  const role=async(q,id)=>{await q.unsafe('set local role authenticated');await q`select set_config('request.jwt.claim.sub',${id},true)`;};
  const denied=(q,fn,code='42501')=>assert.rejects(q.savepoint(fn),{code});
  const next=value=>({...value,request_id:randomUUID()});
  const save=async(q,kind,payload,raw=JSON.stringify(payload))=>{
    assert.ok(targets.includes(payload.id)&&users.includes(payload.user_id)&&courseIds.includes(payload.course_id));assert.deepEqual(JSON.parse(raw),payload);
    const result=(await q`select public.dtm_manage_grade_report(${kind},${raw}::text::jsonb) as result`)[0].result;
    assert.deepEqual(Object.keys(result).sort(),['courseId','id','kind','summary','userId','version']);
    assert.equal(result.id,payload.id);assert.equal(result.userId,payload.user_id);assert.equal(result.courseId,payload.course_id);assert.equal(result.kind,kind);assert.equal(result.version,payload.expected_version+1);
    const entry={kind,payload:structuredClone(payload),result},prior=accepted.get(payload.request_id);if(prior)assert.deepEqual(prior,entry);else accepted.set(payload.request_id,entry);return result;
  };
  try{
    assert.equal(await realpath(process.cwd()),clientRoot);assert.equal(await realpath(fileURLToPath(new URL('../../',import.meta.url))),clientRoot);
    const deployment=JSON.parse(await readFile('deployment.json','utf8'));assert.equal(deployment.repository.toLowerCase(),'luxart0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);
    const {deploymentEnvironment}=await import('../../scripts/deployment-env.mjs'),env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;dormitoryConductClientTarget(connection);
    const ddl=await readFile(migration,'utf8'),{default:postgres}=await import('postgres');
    pool=postgres(connection,{max:1,max_lifetime:0,idle_timeout:0,connect_timeout:10,onclose:()=>lease?.lose(),connection:{statement_timeout:20000},ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});connectionClosed=false;
    timer=setTimeout(()=>{lease?.lose();void pool.end({timeout:1}).catch(()=>{});},180000);timer.unref();
    phase='physical-lease';lease=await reserveDormitoryConductLease(pool);sql=lease.sql;
    phase='baseline';before=await baseline(sql);assert.deepEqual(before,dtmGradeReportExpectedSchema);historyBefore=await history(sql);schemaBefore=await schema(sql);legacyBefore=await legacy(sql);
    assert.equal((await sql`select count(*)::int as count from supabase_migrations.schema_migrations where version=${prerequisite}`)[0].count,1);
    assert.equal((await sql`select count(*)::int as count from supabase_migrations.schema_migrations where version=${version}`)[0].count,0);await absent(sql);
    for(const name of ['public.affairs_profiles','public.affairs_agent_audit','public.dtm_courses','public.dtm_grade_items','public.dtm_dashboard_layouts'])assert.notEqual((await sql`select to_regclass(${name}) as name`)[0].name,null);
    [administrator]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator,'Existing verified administrator required; no owner repair permitted.');ownerBefore=await fingerprint(sql,administrator.id);assert.ok(!users.includes(administrator.id));
    assert.equal((await sql`select count(*)::int as count from auth.users where id in ${sql(users)}`)[0].count,0);
    assert.equal((await sql`select count(*)::int as count from public.dtm_courses where id in ${sql(courseIds)}`)[0].count,0);
    assert.equal((await sql`select count(*)::int as count from public.affairs_agent_audit where target_id in ${sql(targets)}`)[0].count,0);
    await lease.rollbackOnly(async q=>{
      started=true;phase='draft-ddl';await q.unsafe("set local lock_timeout='8s'");await q.unsafe("set local idle_in_transaction_session_timeout='30s'");await q.unsafe(ddl);
      assert.deepEqual(await baseline(q),{migrations:133,rls_tables:151});assert.equal(await history(q),historyBefore);
      phase='synthetic-fixtures';for(const userId of users){const google=userId!==nonGoogle,email=`dtm-report-qa-${userId}@example.invalid`;
        await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
          values('00000000-0000-0000-0000-000000000000',${userId},'authenticated','authenticated',${email},now(),
          ${q.json(google?{provider:'google',providers:['google']}:{provider:'email',providers:['email']})},'{"full_name":"Synthetic Grade QA"}',now(),now())`;
        if(google)await q`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${userId},${userId},${q.json({sub:userId,email,email_verified:true})},'google')`;
        if(userId!==uninitialized)await q`insert into public.affairs_profiles(user_id,email,display_name,role) values(${userId},${email},'Synthetic Grade QA','student')`;
      }
      for(const [index,id] of courseIds.entries()){const ownerId=id===courseTwo?two:id===courseNonGoogle?nonGoogle:one;
        await q`insert into public.dtm_courses(id,user_id,code,title,term,source_mode) values(${id},${ownerId},${index===101?'':'QA-'+index},${index===101?'😀'.repeat(600):'Synthetic course '+index},${index===101?'\u00a0\u3000\ufeff':'Local term'},'personal')`;}
      await q`insert into public.dtm_grade_items(id,course_id,label,score,maximum) values(${legacyGrade},${ownCourses[0]},'Synthetic legacy tracker',66,100)`;
      const original=dtmGradeReportFixture(reportOne,one,ownCourses[0],randomUUID()),matrix=dtmGradeReportValidationCases(original);
      phase='validation-parity';const parity=await q`select item.ordinal::int as ordinal,private.dtm_grade_report_payload_valid(item.value->>'kind',item.value->'value') as valid,
        octet_length((item.value->'value')::text) as bytes from jsonb_array_elements(${q.json(matrix)}::jsonb) with ordinality item(value,ordinal) order by ordinal`;
      assert.equal(parity.length,matrix.length);for(const [index,entry] of matrix.entries()){phase='validation-'+index;
        assert.equal(parity[index].valid,entry.valid);if(entry.valid)assert.equal(parity[index].bytes,dtmGradeReportPayloadBytes(entry.value));}
      for(const bytes of [131072,131073]){phase='validation-byte-'+bytes;const fixture=dtmGradeReportBudgetFixture(original,bytes),raw=JSON.stringify(fixture);
        const [result]=await q`select octet_length((${raw}::text::jsonb)::text) as bytes,private.dtm_grade_report_payload_valid('save_dtm_grade_report',${raw}::text::jsonb) as valid`;
        assert.equal(result.bytes,bytes);assert.equal(result.valid,bytes===131072);}
      const scale=JSON.stringify(original).replace('"expected_version":0','"expected_version":0.0').replace('"score":0','"score":0.00');
      assert.equal((await q`select private.dtm_grade_report_payload_valid('save_dtm_grade_report',${scale}::text::jsonb) as valid`)[0].valid,true);
      for(const permission of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await q`select has_table_privilege('authenticated','public.dtm_grade_reports',${permission}) as allowed`)[0].allowed,false);
      assert.equal((await q`select has_table_privilege('anon','public.dtm_grade_reports','SELECT') as allowed`)[0].allowed,false);
      for(const signature of procedures){assert.equal((await q`select has_function_privilege('authenticated',${signature},'EXECUTE') as allowed`)[0].allowed,signature.startsWith('public.'));
        assert.equal((await q`select has_function_privilege('anon',${signature},'EXECUTE') as allowed`)[0].allowed,false);}
      checks.push('strict-jsonb-validation-null-blank-zero-unicode-size-and-acls');
      phase='admin-personal-course-metadata';await role(q,administrator.id);
      assert.equal((await q`select id from public.dtm_courses where id in ${q(courseIds)}`).length,0,'legacy personal course RLS remains restricted');
      assert.equal((await q`select id from public.dtm_grade_items where id=${legacyGrade}`).length,0,'legacy numeric tracker RLS remains restricted');
      const firstPage=parseDtmGradeReportCoursesData((await q`select public.dtm_grade_report_courses_admin(${one},null,null) as result`)[0].result,one);
      assert.deepEqual(firstPage.courses.map(row=>row.id),ownCourses.slice(0,100));assert.equal(firstPage.nextCursor,ownCourses[99]);
      const secondPage=parseDtmGradeReportCoursesData((await q`select public.dtm_grade_report_courses_admin(${one},null,${firstPage.nextCursor}) as result`)[0].result,one,firstPage.nextCursor);
      assert.deepEqual(secondPage.courses.map(row=>row.id),ownCourses.slice(100));assert.equal(secondPage.nextCursor,null);
      const exact=parseDtmGradeReportCoursesData((await q`select public.dtm_grade_report_courses_admin(${one},${ownCourses[101]},null) as result`)[0].result,one);
      assert.deepEqual(exact.courses.map(row=>row.id),[ownCourses[101]]);
      assert.equal(exact.courses[0].title,'😀'.repeat(600));assert.equal(exact.courses[0].code,'');assert.equal(exact.courses[0].term,'\u00a0\u3000\ufeff');
      assert.equal((await q`select public.dtm_grade_report_courses_admin(${one},${courseTwo},null) as result`)[0].result.courses.length,0);
      await denied(q,s=>s`select public.dtm_grade_report_courses_admin(${one},${ownCourses[0]},${ownCourses[0]})`,'22023');
      checks.push('selected-owner-paginated-admin-course-metadata-without-broadening-legacy-rls');
      phase='report-create-and-read';const first=await save(q,'save_dtm_grade_report',original,scale);assert.deepEqual(await save(q,'save_dtm_grade_report',original),first);
      await save(q,'save_dtm_grade_report',next({...original,id:reportTwo,user_id:two,course_id:courseTwo}));
      await save(q,'save_dtm_grade_report',next({...original,id:reportNonGoogle,user_id:nonGoogle,course_id:courseNonGoogle}));
      await save(q,'save_dtm_grade_report',next({...original,id:blankReport,course_id:ownCourses[1],report:{items:[],total:{...cells(),gradeText:''}}}));
      await save(q,'save_dtm_grade_report',next({...original,id:nullReport,course_id:ownCourses[2],report:{items:[],total:null}}));
      await denied(q,s=>save(s,'save_dtm_grade_report',next({...original,id:spare})),'PT409');
      await denied(q,s=>save(s,'save_dtm_grade_report',next({...original,user_id:two,expected_version:1})));
      await denied(q,s=>save(s,'save_dtm_grade_report',next({...original,course_id:ownCourses[3],expected_version:1})));
      await denied(q,s=>save(s,'save_dtm_grade_report',next({...original,expected_version:1,report:{items:[],total:cells(),extra:true}})),'22023');
      await denied(q,s=>s`update public.dtm_grade_reports set report='{"items":[],"total":null}' where id=${reportOne}`);
      await role(q,one);assert.deepEqual((await q`select id from public.dtm_grade_reports order by id`).map(row=>row.id),[reportOne,blankReport,nullReport].sort());
      assert.equal((await q`select id from public.dtm_grade_reports where user_id=${two}`).length,0);
      const ownPage=parseDtmGradeReportOverviewData((await q`select public.dtm_grade_report_overview(null) as result`)[0].result,one);
      assert.equal(ownPage.courses[0].gradeText,'0');assert.equal(ownPage.courses[1].gradeText,'');assert.equal(ownPage.courses[2].gradeText,null);assert.equal(ownPage.courses[3].gradeText,null);
      const ownNext=parseDtmGradeReportOverviewData((await q`select public.dtm_grade_report_overview(${ownPage.nextCursor}) as result`)[0].result,one,ownPage.nextCursor);
      assert.deepEqual([...ownPage.courses,...ownNext.courses].map(row=>row.id),ownCourses);assert.equal(ownNext.nextCursor,null);
      assert.deepEqual((await q`select report from public.dtm_grade_reports where id=${reportOne}`)[0].report,original.report);
      await denied(q,s=>save(s,'save_dtm_grade_report',next({...original,expected_version:1})));
      await denied(q,s=>s`select public.dtm_grade_report_courses_admin(${one},null,null)`);
      await denied(q,s=>s`select * from private.dtm_grade_report_operations`);
      await denied(q,s=>s`insert into public.dtm_grade_reports(id,user_id,course_id,report) values(${spare},${one},${ownCourses[4]},'{"items":[],"total":null}')`);
      await denied(q,s=>s`delete from public.dtm_grade_reports where id=${reportOne}`);
      await role(q,two);assert.deepEqual((await q`select id from public.dtm_grade_reports`).map(row=>row.id),[reportTwo]);
      for(const userId of [nonGoogle,uninitialized]){await role(q,userId);assert.equal((await q`select id from public.dtm_grade_reports`).length,0);await denied(q,s=>s`select public.dtm_grade_report_overview(null)`);}
      await q.unsafe('set local role anon');await denied(q,s=>s`select * from public.dtm_grade_reports`);await denied(q,s=>s`select public.dtm_grade_report_overview(null)`);await denied(q,s=>save(s,'save_dtm_grade_report',original));
      checks.push('literal-roundtrip-owner-overview-cross-account-anonymous-nongoogle-uninitialized-and-direct-write-denial');
      phase='version-and-replay';await role(q,administrator.id);
      const changed=next({...original,expected_version:1,report:{items:[...original.report.items].reverse(),total:{...cells(),gradeText:'Literal total only'}}});
      const edited=await save(q,'save_dtm_grade_report',changed,JSON.stringify(changed).replace('"expected_version":1','"expected_version":1.0'));
      assert.deepEqual(await save(q,'save_dtm_grade_report',changed),edited);assert.deepEqual(await save(q,'save_dtm_grade_report',original),first);
      await denied(q,s=>save(s,'save_dtm_grade_report',next(changed)),'PT409');await denied(q,s=>save(s,'save_dtm_grade_report',{...changed,report:original.report}),'PT409');
      const remove={id:reportOne,user_id:one,course_id:ownCourses[0],request_id:randomUUID(),expected_version:2},removed=await save(q,'delete_dtm_grade_report',remove);
      assert.deepEqual(await save(q,'delete_dtm_grade_report',remove),removed);assert.deepEqual(await save(q,'save_dtm_grade_report',original),first);
      for(const expected_version of [0,3])await denied(q,s=>save(s,'save_dtm_grade_report',next({...original,expected_version})),'PT409');
      await denied(q,s=>save(s,'delete_dtm_grade_report',{...remove,request_id:original.request_id}),'PT409');
      await save(q,'save_dtm_grade_report',next({...original,id:replacement,report:{items:[],total:null}}));
      await role(q,one);assert.equal((await q`select id from public.dtm_grade_reports where id=${reportOne}`).length,0);
      assert.equal((await q`select public.dtm_grade_report_overview(null) as result`)[0].result.courses[0].gradeText,null);
      await q.unsafe('reset role');assert.deepEqual((await q`select version,report,deleted_at is not null as deleted from public.dtm_grade_reports where id=${reportOne}`)[0],{version:3,report:{items:[],total:null},deleted:true});
      await denied(q,s=>s`update public.dtm_grade_reports set deleted_at=null where id=${reportOne}`,'PT409');
      await denied(q,s=>s`update public.dtm_grade_reports set user_id=${one} where id=${reportTwo}`);
      await denied(q,s=>s`update public.dtm_grade_reports set course_id=${ownCourses[4]} where id=${reportTwo}`);
      await denied(q,s=>s`update public.dtm_courses set user_id=${two} where id=${ownCourses[1]}`,'23503');
      checks.push('serial-version-conflicts-exact-late-replay-tombstones-replacement-and-immutable-course-owner');
      phase='audit-legacy-and-cascade';const receipts=await q`select request_id,kind,payload,result from private.dtm_grade_report_operations where actor_id=${administrator.id} and course_id in ${q(courseIds)}`;
      assert.equal(accepted.size,8);assert.equal(receipts.length,accepted.size);for(const receipt of receipts)assert.deepEqual({kind:receipt.kind,payload:receipt.payload,result:receipt.result},accepted.get(receipt.request_id));
      assert.equal((await q`select count(*)::int as count from public.affairs_agent_audit where user_id=${administrator.id} and target_id in ${q(targets)}`)[0].count,accepted.size);
      assert.deepEqual((await q`select score::text as score,maximum::text as maximum from public.dtm_grade_items where id=${legacyGrade}`)[0],{score:'66.00',maximum:'100.00'});
      assert.equal(await legacy(q),legacyBefore);assert.deepEqual(await fingerprint(q,administrator.id),ownerBefore);
      await q`delete from auth.users where id=${nonGoogle}`;assert.equal((await q`select id from public.dtm_grade_reports where user_id=${nonGoogle}`).length,0);assert.equal((await q`select request_id from private.dtm_grade_report_operations where user_id=${nonGoogle}`).length,0);
      await q`delete from public.dtm_courses where id=${ownCourses[1]}`;assert.equal((await q`select id from public.dtm_grade_reports where id=${blankReport}`).length,0);assert.equal((await q`select request_id from private.dtm_grade_report_operations where course_id=${ownCourses[1]}`).length,0);
      checks.push('exact-audit-receipts-legacy-preservation-owner-fingerprint-and-synthetic-course-user-cascade');
    });rolledBack=true;
  }catch(error){failure={phase,code:typeof error?.code==='string'&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:'CHECK_FAILED'};}
  finally{
    clearTimeout(timer);
    try{if(lease){await lease.assertHeld();if(before)assert.deepEqual(await baseline(sql),before);if(historyBefore)assert.equal(await history(sql),historyBefore);if(schemaBefore)assert.equal(await schema(sql),schemaBefore);if(legacyBefore)assert.equal(await legacy(sql),legacyBefore);
      if(started){await absent(sql);for(const userId of users){assert.equal((await sql`select id from auth.users where id=${userId}`).length,0);assert.equal((await sql`select user_id from auth.identities where user_id=${userId}`).length,0);assert.equal((await sql`select user_id from public.affairs_profiles where user_id=${userId}`).length,0);}
        assert.equal((await sql`select id from public.dtm_courses where id in ${sql(courseIds)}`).length,0);assert.equal((await sql`select id from public.dtm_grade_items where id=${legacyGrade}`).length,0);assert.equal((await sql`select id from public.affairs_agent_audit where target_id in ${sql(targets)}`).length,0);}
      if(ownerBefore)assert.deepEqual(await fingerprint(sql,administrator.id),ownerBefore);cleanupVerified=started&&Boolean(schemaBefore)&&Boolean(ownerBefore);}}
    catch{failure??={phase:'exact-rollback-verification',code:'CHECK_FAILED'};cleanupVerified=false;}
    try{if(lease)await lease.release();}catch{cleanupVerified=false;failure??={phase:'lease-release',code:'CHECK_FAILED'};}
    try{if(pool)await pool.end({timeout:5});connectionClosed=true;}catch{failure??={phase:'connection-close',code:'CHECK_FAILED'};}
  }
  const passed=!failure&&rolledBack&&cleanupVerified&&connectionClosed;
  console.log(JSON.stringify({status:passed?'passed':'failed',mode:'rollback-only-migration-preflight',baseline:before,checks,cleanupVerified,connectionClosed,
    fixtureCounts:{users:users.length,courses:courseIds.length,successfulRequests:accepted.size},...(failure?{failure}:{}),
    limitations:'SQL role claims and serial stale operations only; no actual JWT/HTTP/browser/model or parallel RPC acceptance.'}));if(!passed)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{if(dtmGradeReportCliOptions(process.argv.slice(2)).selfTest)console.log(JSON.stringify(await dtmGradeReportOfflineChecks()));else await preflight();}
  catch{console.error(JSON.stringify({status:'failed',phase:'offline-or-cli-gate',databaseConnections:0}));process.exitCode=1;}
}

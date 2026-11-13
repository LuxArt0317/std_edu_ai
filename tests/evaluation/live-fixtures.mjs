/**
 * Disposable, account-private evaluation fixtures for the exact client project.
 * Importing this module performs no I/O and reads no credentials. prepare() is
 * the explicit mutation boundary; callers must hold the project DB lease.
 * Never use a real account, alter shared catalog/notices, or execute proposals.
 */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,rename,rm,chmod} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {fixtureForCase,evaluationDates,EVAL_OTHER_USER_ID} from './fixtures.mjs';
import {loadNativeAcademicRecords} from '../../server/nativeAcademicWorkspace.js';
import {mapScholarshipRecords} from '../../server/scholarshipRecords.js';
import {mapHousingRecords} from '../../server/housingRecords.js';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const PROJECT='xiftudmvxphxcjtmfmib';
const PRIVATE_DIR=resolve(ROOT,'artifacts/assistant-evaluation');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PRIVATE_NATIVE_DOMAINS=['studentAid','creditLoadHistory','courseSelection','academicGrades','graduationReview','academicAttendance'];
const CONDITIONAL_NATIVE_DOMAINS=['courses','scholarship','housing'];
const SUPPORTED_TOOLS=new Set(['profile','charges','tasks','requests','serviceRecords','dtm','assignments',...PRIVATE_NATIVE_DOMAINS,...CONDITIONAL_NATIVE_DOMAINS]);
const FOREIGN_MARKER='FOREIGN PRIVATE SENTINEL';
let state;

export class LiveFixtureError extends Error {
  constructor(kind,message){super(`[${kind}] ${message}`);this.name='LiveFixtureError';this.code=kind;}
}
const fail=(kind,message)=>{throw new LiveFixtureError(kind,message);};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const timestamp=value=>value==null?null:new Date(value).toISOString();
const pick=(row,keys)=>Object.fromEntries(keys.map(key=>[key,row[key]??null]));
const sort=rows=>[...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
function signals(signal,ms=15000){return signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);}
function ready(){if(!state?.prepared||state.closing)fail('fixture-state','prepare() must complete before fixture access.');return state;}
/** Metadata only: never forward PostgreSQL message/detail/query or row values. */
export function safeDatabaseDiagnostic(error){
  const fields=[];
  if(/^[A-Z0-9_]{2,35}$/.test(String(error?.code)))fields.push('code '+error.code);
  const identifier=value=>typeof value==='string'&&value.length<=63&&/^(?:affairs_|dtm_)[a-z0-9_]+$/.test(value);
  if(identifier(error?.table_name)||['identities','users'].includes(error?.table_name))fields.push('table '+error.table_name);
  if(identifier(error?.constraint_name))fields.push('constraint '+error.constraint_name);
  return fields.length?' ('+fields.join('; ')+')':'';
}
const diagnostic=safeDatabaseDiagnostic;
async function query(work,label){try{return await work();}catch(error){if(error instanceof LiveFixtureError)throw error;fail('fixture-database',label+diagnostic(error));}}
async function saveLedger(){
  const s=state;if(!s?.ledger)return;
  const tmp=s.ledger+'.tmp';
  await writeFile(tmp,JSON.stringify({version:1,projectRef:PROJECT,runId:s.runId,origin:s.origin,createdAt:s.startedAt,
    fixtureUserIds:s.users.map(user=>user.id),ownedRecordIds:[...s.recordIds].sort(),activeCaseId:s.current?.caseId??null},null,2),{mode:0o600});
  await chmod(tmp,0o600);await rename(tmp,s.ledger);await chmod(s.ledger,0o600);
}
async function readSnapshot(user,{signal=state?.signal,cleanup=false}={}){
  const s=state;let response;
  try{response=await fetch(new URL('/api/affairs-data',s.origin),{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(cleanup?undefined:signal,45000)});}catch{fail('fixture-readback','Authenticated /api/affairs-data request did not complete.');}
  if(response.status!==200||!response.headers.get('content-type')?.includes('application/json'))fail('fixture-readback',`Authenticated /api/affairs-data returned ${response.status}; no model request may run.`);
  const reader=response.body?.getReader();if(!reader)fail('fixture-readback','Snapshot response has no body.');
  const chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000){await reader.cancel();fail('fixture-readback','Snapshot exceeded the bounded fixture readback size.');}chunks.push(value);}}
  catch(error){if(error instanceof LiveFixtureError)throw error;fail('fixture-readback','Snapshot body did not complete.');}
  let snapshot;try{snapshot=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('fixture-readback','Snapshot response was not JSON.');}
  if(snapshot?.profile?.userId!==user.id)fail('fixture-isolation','Snapshot did not belong to the newly created fixture user.');
  if(user===s.users[0]&&JSON.stringify(snapshot).includes(FOREIGN_MARKER))fail('fixture-isolation','The second fixture account leaked into the first account snapshot.');
  return snapshot;
}
async function createFixtureUser(index){
  const s=state;
  // A fixed .invalid address preserves independently authored golden email facts.
  // Creation fails if a previous run still owns it; no existing account is reused.
  const email=index===0?'evaluation.student@example.invalid':`evaluation.other.${s.runId}@example.invalid`;
  const password=randomBytes(32).toString('base64url')+'Aa1!';
  let created;try{created=await s.admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:index===0?'Evaluation Student':'Evaluation Other',assistant_evaluation_run:s.runId}});}catch{fail('fixture-create','Disposable account creation did not complete.');}
  if(created.error||!UUID.test(created.data?.user?.id||''))fail('fixture-create','Could not create a fresh synthetic account; existing accounts are never reused.');
  const user={id:created.data.user.id,token:null};s.users.push(user);
  // Durable cleanup identity is written immediately, before any additional write.
  await saveLedger();
  await query(()=>s.sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
    values(${user.id},${user.id},${s.sql.json({sub:user.id,email,email_verified:true})},'google',now(),now())`,'Could not link the disposable Google fixture identity.');
  const auth=createClient(s.url,s.publishable,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:s.boundedFetch}});
  let signed;try{signed=await auth.auth.signInWithPassword({email,password});}catch{fail('fixture-signin','Synthetic account sign-in did not complete.');}
  if(signed.error||signed.data?.session?.user?.id!==user.id)fail('fixture-signin','Synthetic account session could not be verified.');
  user.token=signed.data.session.access_token;
  const initial=await readSnapshot(user);user.studentId=initial.student?.id;
  if(!UUID.test(user.studentId||''))fail('fixture-readback','Synthetic School Affairs student initialization failed.');
  return user;
}

/** No mutation occurs until this explicit lifecycle entry point is invoked. */
export async function prepare({runId,cases,now,origin,signal}={}){
  if(state)fail('fixture-state','This fixture adapter cannot run overlapping lifecycles.');
  if(!UUID.test(runId||'')||!Array.isArray(cases)||!cases.length||!Number.isFinite(Date.parse(now)))fail('fixture-config','A unique run ID, selected case list and valid evaluation clock are required.');
  if(resolve(process.cwd())!==resolve(ROOT))fail('fixture-target','Run this adapter from the exact client checkout root.');
  const config=JSON.parse(await readFile(resolve(ROOT,'deployment.json'),'utf8'));
  if(config.repository!=='LuxArt0317/std_edu_ai'||config.supabase?.projectRef!==PROJECT)fail('fixture-target','Deployment configuration is not the authorized client project.');
  const env=deploymentEnvironment(); // Secrets are resolved only at explicit prepare().
  const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
  const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
  const publishable=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  if(!url||!connection||!publishable||!serviceKey)fail('fixture-config','Exact-client database and Auth credentials are required.');
  let db,base,target;try{db=new URL(connection);base=new URL(url);target=new URL(origin||env.ASSISTANT_EVAL_ORIGIN||config.vercel.productionUrl);}catch{fail('fixture-config','Invalid configured project or origin URL.');}
  if(base.protocol!=='https:'||base.hostname!==PROJECT+'.supabase.co'||base.username||base.password)fail('fixture-target','Supabase URL does not match the exact client project.');
  if(!(db.hostname==='db.'+PROJECT+'.supabase.co'||db.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(db.username).endsWith('.'+PROJECT)))fail('fixture-target','Database connection does not match the exact client project.');
  if(target.username||target.password||target.pathname!=='/'||target.search||target.hash||!(target.origin===config.vercel.productionUrl||['127.0.0.1','localhost'].includes(target.hostname)&&['http:','https:'].includes(target.protocol)))fail('fixture-target','Only the configured production origin or explicit loopback is allowed.');
  const ignore=await readFile(resolve(ROOT,'.gitignore'),'utf8');if(!/^\/?artifacts\/$/m.test(ignore))fail('fixture-ledger','Private fixture ledger directory must be ignored by Git.');
  await mkdir(PRIVATE_DIR,{recursive:true,mode:0o700});await chmod(PRIVATE_DIR,0o700);
  const boundedFetch=(input,init={})=>fetch(input,{...init,signal:signals(init.signal,15000)});
  state={runId,now,origin:target.origin,url,publishable,signal,boundedFetch,startedAt:new Date().toISOString(),users:[],recordIds:new Set(),caseIds:new Set(cases.map(row=>row.id)),prepared:false,closing:false,current:null,
    ledger:resolve(PRIVATE_DIR,'active-fixtures-'+runId+'.json'),admin:createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}})};
  try{
    state.sql=postgres(connection,{max:1,connect_timeout:10,idle_timeout:10,max_lifetime:0,
      ssl:{rejectUnauthorized:true,ca:await readFile(resolve(ROOT,'supabase/certs/prod-ca-2021.crt'),'utf8')},onnotice:()=>{},
      connection:{application_name:'stu-assistant-evaluation',statement_timeout:15000,lock_timeout:3000,idle_in_transaction_session_timeout:15000}});
    // Reserve one physical connection: the advisory lock must cover every case.
    state.db=state.sql;state.sql=await query(()=>state.db.reserve(),'Could not reserve the bounded fixture connection.');
    const locked=await query(()=>state.sql`select pg_try_advisory_lock(23101314,115100) as held`,'Could not acquire the fixture exclusivity lock.');
    if(locked[0]?.held!==true)fail('fixture-lease','Another evaluation fixture lifecycle owns the database lock.');state.locked=true;
    await saveLedger();
    await createFixtureUser(0);await createFixtureUser(1);
    const foreignId=randomUUID();state.recordIds.add(foreignId);await saveLedger();
    await query(()=>state.sql`insert into public.dtm_courses(id,user_id,code,title,term,role,source_mode)
      values(${foreignId},${state.users[1].id},'FOREIGN-EVAL',${FOREIGN_MARKER},'Synthetic private term','student','personal')`,'Could not create the isolated second-account sentinel.');
    await readSnapshot(state.users[0]);
    state.prepared=true;
    return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:[...SUPPORTED_TOOLS]};
  }catch(error){
    // The runner will call cleanup too; this first attempt limits orphan lifetime
    // when prepare() itself fails, retaining the private ledger on any failure.
    try{await cleanup();}catch{/* The original error is safe; ledger remains. */}
    if(error instanceof LiveFixtureError)throw error;fail('fixture-prepare','Fixture preparation failed'+diagnostic(error)+'.');
  }
}

function assertSupported(testCase,snapshot){
  const key=testCase.fixtureKey,tools=testCase.expected?.requiredTools||[];
  if(!state.caseIds.has(testCase.id))fail('fixture-case','The case was not included in prepare().');
  if(key==='anonymous')fail('fixture-case','Anonymous requests must bypass the signed-in fixture adapter.');
  if(['mixed-currency','admin'].includes(key))fail('fixture-unsupported',`${key} needs an additional real schema adapter; it is not a model result.`);
  if(['empty:profile','empty:courses','empty:dtm','empty:tasks','empty:announcements'].includes(key))fail('fixture-unsupported',`${key} cannot be represented while the account initializer recreates those records or the records are globally shared.`);
  if(tools.some(tool=>!SUPPORTED_TOOLS.has(tool))){
    const onlyPermissionCheck=testCase.id==='account:action-announcement-denied';
    if(!onlyPermissionCheck)fail('fixture-unsupported',`No private live mapping for ${tools.filter(tool=>!SUPPORTED_TOOLS.has(tool)).join(', ')}; unsupported fixtures never count as passing.`);
  }
  if(testCase.id==='account:dtm-notices')fail('fixture-unsupported','DTM notices are globally shared; this adapter never publishes synthetic notices.');
  if(key==='submissions')fail('fixture-unsupported','This adapter does not create file uploads or submission revisions; a tracker row is not submission evidence.');
  if(snapshot.profile.role!=='student')fail('fixture-unsupported','The live adapter never elevates a fixture to administrator.');
  if(testCase.expected?.timeFixture){
    const expected=evaluationDates(state.now),actual=evaluationDates(new Date().toISOString());
    if(expected.today!==actual.today||expected.nextClass!==actual.nextClass)fail('fixture-clock','Live date boundary no longer matches the authored case; rebuild the suite with the current clock.');
  }
}

// These fields are the persisted migration contract, not answer-derived data.
// Unknown fields cannot become SQL identifiers; all tables and columns below
// are fixed literals. A planner can be exercised entirely offline.
const COMMON=['id','userId','sourceMode','version','createdAt','updatedAt'];
const NATIVE_TABLES={
  studentAid:{records:['affairs_student_aid_records',['applicantLabel','studentName','maskedIdentityNumber','departmentName','phone','applicationKind','relativeCount','subsidyAmount','studentRecordLocked','schoolReviewStatus','ministryReviewStatus','academicYear','semester']]},
  creditLoadHistory:{records:['affairs_credit_load_history',['academicYear','semester','category','requestedCredits','processText','resultText']]},
  courseSelection:{records:['affairs_course_selection_records',['academicYear','semester','selectionPhase','termCourseCode','courseTitle','requiredElectiveText','credits','instructorOne','remarkText','rowOrder','timetableIncluded','meetings']]},
  academicGrades:{
    records:['affairs_academic_grade_records',['recordKind','academicYear','semester','courseTitle','courseCode','categoryText','moduleName','requiredElectiveText','credits','gradeText','remarkText','rowOrder']],
    termSummaries:['affairs_academic_term_summaries',['summaryKind','academicYear','semester','earnedCredits','averageGradeText','attemptedCredits','passedCredits','failedCredits']],
    rankings:['affairs_academic_rankings',['academicYear','semester','departmentRankingText','classRankingText']],
    metadata:['affairs_academic_metadata',['classLabel','englishRequirementText']],
  },
  graduationReview:{reports:['affairs_graduation_reviews',['reportKind']]},
  academicAttendance:{
    statistics:['affairs_academic_attendance_statistics',['academicYear','semester','rowOrder','studentNumber','studentName','courseCode','courseTitle','totalTeachingHours','currentTeachingWeeks','currentTeachingHours','absenceHours','unexcusedAbsenceHours']],
    details:['affairs_academic_attendance_details',['academicYear','semester','rowOrder','courseCode','courseTitle','teacherName','absenceTypeText','courseDate','periodText','rollCalledAt']],
    metadata:['affairs_academic_attendance_metadata',['currentAcademicYear','currentSemester']],
  },
};
const REPORT_FIELDS=['reportedAt','identity','educationProgram','foreignLanguageCompletion','englishRequirement','graduationReview','languageRequirements','categories','otherCourses'];
const PERIOD_FIELDS={scholarship:['termLabel','opensAt','closesAt','published','instructions','sourceMode','version'],housing:['termLabel','academicYear','semester','opensAt','closesAt','published','instructions','agreementText','sourceMode','version']};
const COURSE_FIELDS=['code','title','credits','term','termStartsOn','termEndsOn','instructor','weekday','startsAt','endsAt','room'];
const APPLICATION_FIELDS={
  scholarship:['id','userId','periodId','status','awardAmount','requiredHours','actualHours','reviewNote','submittedAt','reviewedAt','cancelledAt','version'],
  housing:['id','userId','periodId','receiptNumber','fullName','studentNumber','gender','department','birthDate','homePhone','mobilePhone','email','address','postalCode','category','healthNotes','agreementVersion','agreementText','submittedAt','version'],
};
const BED_FIELDS=['id','userId','periodId','bedNumber','dormitory','bunk','accommodationFee','deposit','subsidyAmount','version'];
const snake=key=>key.replace(/[A-Z]/g,character=>'_'+character.toLowerCase());
const ownTables=Object.values(NATIVE_TABLES).flatMap(domain=>Object.values(domain).map(([table])=>table));
const periodTables={scholarship:'affairs_scholarship_periods',housing:'affairs_housing_periods'};
const applicationTables={scholarship:'affairs_scholarship_applications',housing:'affairs_housing_applications'};
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const amount=(value,max,nullable=false)=>nullable&&value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max&&Number(value.toFixed(2))===value;
const validText=(value,max,nullable=false)=>nullable&&value===null||typeof value==='string'&&value.trim().length>0&&[...value].length<=max&&!/[\u0000\ud800-\udfff]/u.test(value);
const validStamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))&&validDay(value.slice(0,10));
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const requireSchema=(condition,label)=>{if(!condition)fail('fixture-schema',label);};
function requiredFields(row,fields,label){
  requireSchema(row&&typeof row==='object'&&!Array.isArray(row)&&fields.every(key=>Object.hasOwn(row,key)&&row[key]!==undefined),`${label} has missing explicit persisted fields.`);
  return Object.fromEntries(fields.map(key=>[snake(key),structuredClone(row[key])]));
}
function validCommon(row){
  return UUID.test(row.id)&&UUID.test(row.user_id)&&row.source_mode==='local_demo'&&integer(row.version,1,2147483647)&&validStamp(row.created_at)&&validStamp(row.updated_at);
}
function validatePrivateNativeRow(table,row){
  requireSchema(validCommon(row),`Invalid native owner, provenance, version or timestamp in ${table}.`);
  if(table==='affairs_student_aid_records'){
    const mask=row.masked_identity_number;
    requireSchema(validText(row.applicant_label,160)&&validText(row.student_name,160)&&validText(row.department_name,160,true)&&
      (mask===null||typeof mask==='string'&&mask.length>=3&&mask.length<=24&&/^[A-Za-z0-9*•● -]+$/.test(mask)&&/[*•●]{3,}/.test(mask)&&mask.replace(/[^A-Za-z0-9]/g,'').length<=4)&&
      (row.phone===null||typeof row.phone==='string'&&row.phone.length>=3&&row.phone.length<=40&&/^[0-9+()# .-]+$/.test(row.phone))&&
      validText(row.application_kind,120)&&(row.relative_count===null||integer(row.relative_count,0,1000))&&amount(row.subsidy_amount,10000000,true)&&
      [true,false,null].includes(row.student_record_locked)&&validText(row.school_review_status,160,true)&&validText(row.ministry_review_status,160,true)&&
      integer(row.academic_year,1,999)&&integer(row.semester,1,3),'Invalid explicit student aid fields.');
  }else if(table==='affairs_credit_load_history'){
    requireSchema(integer(row.academic_year,1,9999)&&integer(row.semester,1,3)&&['over','under'].includes(row.category)&&amount(row.requested_credits,9999.99)&&validText(row.process_text,300,true)&&validText(row.result_text,300,true),'Invalid credit-load history fields.');
  }else if(table==='affairs_course_selection_records'){
    const seen=new Set(),periods=['1','2','3','4','午','5','6','7','8','傍','A','B','C','D'];
    requireSchema(integer(row.academic_year,1,9999)&&integer(row.semester,1,3)&&['initial','add_drop','withdrawal','summer1'].includes(row.selection_phase)&&
      validText(row.term_course_code,80)&&validText(row.course_title,160)&&validText(row.required_elective_text,30,true)&&amount(row.credits,999.99)&&
      validText(row.instructor_one,160,true)&&validText(row.remark_text,300,true)&&integer(row.row_order,0,999999)&&typeof row.timetable_included==='boolean'&&Array.isArray(row.meetings)&&row.meetings.length<=98,'Invalid course-selection fields.');
    for(const slot of row.meetings){
      requireSchema(slot&&Object.keys(slot).length===3&&integer(slot.weekday,1,7)&&periods.includes(slot.period)&&typeof slot.room==='string'&&[...slot.room].length<=80,'Invalid course-selection meeting slot.');
      const key=slot.weekday+':'+slot.period;requireSchema(!seen.has(key),'Duplicate course-selection meeting slot.');seen.add(key);
    }
  }
}
function sameFields(a,b,fields){return JSON.stringify(canonical(pick(a,fields)))===JSON.stringify(canonical(pick(b,fields)));}
function uniqueRows(rows){
  for(const [table,values] of Object.entries(rows)){
    const ids=new Set();for(const row of values){requireSchema(UUID.test(row.id)&&!ids.has(row.id),`Duplicate or invalid synthetic record ID in ${table}.`);ids.add(row.id);}
  }
  for(const [table,keys] of Object.entries({affairs_scholarship_applications:['user_id','period_id'],affairs_housing_applications:['user_id','period_id'],affairs_housing_assignments:['user_id','period_id'],affairs_enrollments:['student_id','section_id'],affairs_attendance:['enrollment_id','meeting_on']})){
    const seen=new Set();for(const row of rows[table]||[]){const value=JSON.stringify(keys.map(key=>row[key]));requireSchema(!seen.has(value),`Duplicate native uniqueness constraint in ${table}.`);seen.add(value);}
  }
  const beds=new Set(),receipts=new Set();
  for(const row of rows.affairs_housing_assignments||[]){const key=row.period_id+':'+row.bed_number;requireSchema(!beds.has(key),'Duplicate housing bed in a period.');beds.add(key);}
  for(const row of rows.affairs_housing_applications||[]){requireSchema(!receipts.has(row.receipt_number),'Duplicate housing receipt.');receipts.add(row.receipt_number);}
}
function stableRowId(value){const digest=hash(value);return digest.slice(0,8)+'-'+digest.slice(8,12)+'-4'+digest.slice(13,16)+'-a'+digest.slice(17,20)+'-'+digest.slice(20,32);}

/**
 * Pure translation boundary. shared contains already-read public catalog rows
 * and published periods. Nothing here fetches, resolves credentials or writes.
 * It returns only account-owned rows; no shared table is ever an insertion target.
 */
export async function planNativeFixture(snapshot,{userId,studentId,otherUserId,domains=PRIVATE_NATIVE_DOMAINS,shared={}}={}){
  requireSchema(UUID.test(userId)&&UUID.test(studentId)&&(!otherUserId||UUID.test(otherUserId))&&userId!==otherUserId,'Fixture identities must be distinct valid UUIDs.');
  requireSchema(Array.isArray(domains)&&new Set(domains).size===domains.length&&domains.every(key=>PRIVATE_NATIVE_DOMAINS.includes(key)||CONDITIONAL_NATIVE_DOMAINS.includes(key)),'Unknown or duplicate native fixture domain.');
  const rows={},expected={},owner=source=>{
    if(source===snapshot.profile?.userId)return userId;
    if(source===EVAL_OTHER_USER_ID&&otherUserId)return otherUserId;
    fail('fixture-isolation','A fixture record belongs to an account outside the two disposable identities.');
  };
  for(const domain of domains){
    if(!NATIVE_TABLES[domain])continue;
    expected[domain]={};
    for(const [collection,[table,fields]] of Object.entries(NATIVE_TABLES[domain])){
      const source=snapshot[domain]?.[collection];requireSchema(Array.isArray(source),`Missing ${domain}.${collection} fixture collection.`);
      rows[table]=source.map(item=>{
        const row=requiredFields(item,[...COMMON,...fields],table);row.user_id=owner(item.userId);
        if(domain==='graduationReview')row.report=Object.fromEntries(REPORT_FIELDS.map(key=>{requireSchema(Object.hasOwn(item,key),`Missing graduation report field ${key}.`);return [key,structuredClone(item[key])];}));
        validatePrivateNativeRow(table,row);return row;
      });
      expected[domain][collection]=source.filter(item=>owner(item.userId)===userId).map(item=>({...structuredClone(item),userId}));
      // The reader deliberately omits createdAt for aid; its persisted value is
      // still validated above, rather than fabricated or discarded from SQL.
      if(domain==='studentAid')expected[domain][collection].forEach(item=>delete item.createdAt);
    }
  }
  // Exercise the exact grade/graduation/attendance read validators offline.
  for(const id of [userId,otherUserId].filter(Boolean)){
    try{await loadNativeAcademicRecords(id,false,async table=>(rows[table]||[]).filter(row=>row.user_id===id));}
    catch{fail('fixture-schema','The persisted native academic rows failed the application read contract.');}
  }
  for(const domain of ['scholarship','housing'].filter(key=>domains.includes(key))){
    const value=snapshot[domain],published=shared[domain]?.periods;
    requireSchema(value&&Array.isArray(value.periods)&&Array.isArray(value.applications)&&(domain!=='housing'||Array.isArray(value.assignments)),`Missing ${domain} fixture collections.`);
    if(!Array.isArray(published))fail('fixture-unsupported',`${domain} requires an exact read-only published-period binding.`);
    if(published.length!==value.periods.length)fail('fixture-unsupported',`${domain} published periods do not equal the golden fixture; shared periods will not be changed.`);
    const bindings=new Map();expected[domain]=structuredClone(value);
    expected[domain].periods=value.periods.map(period=>{
      requiredFields(period,['id',...PERIOD_FIELDS[domain]],domain+' period');
      requireSchema(UUID.test(period.id)&&validText(period.termLabel,80)&&validStamp(period.opensAt)&&validStamp(period.closesAt)&&Date.parse(period.opensAt)<Date.parse(period.closesAt)&&period.opensAt.slice(0,10)>='2000-01-01'&&period.closesAt.slice(0,10)<'2101-01-01'&&typeof period.instructions==='string'&&period.instructions.length<=2000&&period.sourceMode==='local_demo'&&integer(period.version,1,2147483647),'Invalid published-period fixture fields.');
      if(domain==='housing')requireSchema(integer(period.academicYear,1,300)&&[1,2].includes(period.semester)&&validText(period.agreementText,4000),'Invalid housing period term or agreement.');
      const matches=published.filter(item=>item.published===true&&sameFields(item,period,PERIOD_FIELDS[domain]));
      if(matches.length!==1||!UUID.test(matches[0].id)||bindings.has(period.id))fail('fixture-unsupported',`${domain} has no unique, exactly matching published period.`);
      bindings.set(period.id,matches[0].id);return {...structuredClone(period),id:matches[0].id};
    });
    const bind=periodId=>{if(!bindings.has(periodId))fail('fixture-schema',`${domain} record references an absent golden period.`);return bindings.get(periodId);};
    rows[applicationTables[domain]]=value.applications.map(item=>{
      const row=requiredFields(item,APPLICATION_FIELDS[domain],domain+' application');row.user_id=owner(item.userId);row.period_id=bind(item.periodId);
      requireSchema(integer(row.version,1,2147483647)&&validStamp(row.submitted_at),'Invalid application version or timestamp.');
      if(domain==='scholarship'){
        requireSchema(['pending','approved','rejected','cancelled'].includes(row.status)&&
          (['approved','rejected'].includes(row.status)?validStamp(row.reviewed_at):row.reviewed_at===null)&&
          (row.status==='cancelled'?validStamp(row.cancelled_at):row.cancelled_at===null)&&
          (row.status==='approved'?amount(row.award_amount,10000000)&&amount(row.required_hours,10000)&&amount(row.actual_hours,10000):row.award_amount===null&&row.required_hours===null&&row.actual_hours===null)&&typeof row.review_note==='string'&&row.review_note.length<=2000,'Invalid scholarship review fields.');
      }else{
        const categories=['general','disability','island','low_income','lower_middle_income','college','academic_award','athlete','dorm_leader','overseas_chinese','international','mainland'];
        requireSchema(validText(row.full_name,80)&&validText(row.student_number,40)&&['male','female'].includes(row.gender)&&validText(row.department,100)&&validDay(row.birth_date)&&row.birth_date>='1900-01-01'&&row.birth_date<='2100-12-31'&&
          [row.home_phone,row.mobile_phone].every(item=>typeof item==='string'&&item.length<=40)&&typeof row.email==='string'&&row.email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)&&validText(row.address,300)&&validText(row.postal_code,12)&&categories.includes(row.category)&&
          typeof row.health_notes==='string'&&row.health_notes.length<=250&&integer(row.agreement_version,1,2147483647)&&validText(row.agreement_text,4000),'Housing application is missing valid explicit synthetic form fields.');
      }
      return row;
    });
    expected[domain].applications=value.applications.filter(item=>owner(item.userId)===userId).map(item=>({...structuredClone(item),userId,periodId:bind(item.periodId)}));
    if(domain==='housing'){
      rows.affairs_housing_assignments=value.assignments.map(item=>{
        const row=requiredFields(item,BED_FIELDS,'housing assignment');row.user_id=owner(item.userId);row.period_id=bind(item.periodId);
        const period=value.periods.find(period=>period.id===item.periodId);
        requireSchema(item.academicYear===period.academicYear&&item.semester===period.semester,'Housing bed term differs from the actual bound period.');
        requireSchema(/^[A-Za-z0-9-]{1,32}$/.test(row.bed_number)&&validText(row.dormitory,80)&&[null,'upper','lower'].includes(row.bunk)&&[row.accommodation_fee,row.deposit,row.subsidy_amount].every(value=>amount(value,10000000,true))&&integer(row.version,1,2147483647),'Invalid housing assignment fields.');
        return row;
      });
      expected[domain].assignments=value.assignments.filter(item=>owner(item.userId)===userId).map(item=>({...structuredClone(item),userId,periodId:bind(item.periodId)}));
    }
  }
  if(domains.includes('courses')){
    requireSchema(Array.isArray(snapshot.courses),'Missing enrollment course fixture.');
    if(!Array.isArray(shared.courses))fail('fixture-unsupported','Enrollment fixtures require exact read-only catalog section bindings.');
    rows.affairs_enrollments=[];rows.affairs_grade_items=[];rows.affairs_attendance=[];expected.courses=structuredClone(snapshot.courses);
    for(const course of snapshot.courses){
      requiredFields(course,['enrollmentId','status','sourceMode',...COURSE_FIELDS,'grades','attendance'],'enrollment');
      const matching=shared.courses.filter(row=>sameFields(row,course,COURSE_FIELDS));
      if(matching.length!==1||!UUID.test(matching[0].sectionId))fail('fixture-unsupported','No unique catalog section matches every golden enrollment field, including term dates and meeting times.');
      requireSchema(['enrolled','withdrawn','completed'].includes(course.status)&&['sample','verified'].includes(course.sourceMode),'Invalid enrollment status or provenance.');
      rows.affairs_enrollments.push({id:course.enrollmentId,student_id:studentId,section_id:matching[0].sectionId,status:course.status,source_mode:course.sourceMode});
      requireSchema(Array.isArray(course.grades)&&Array.isArray(course.attendance),'Missing enrollment grade or attendance collection.');
      course.grades.forEach((item,index)=>{
        requireSchema(validText(item.label,10000)&&amount(item.score,999.99)&&amount(item.maximum,999.99)&&item.maximum>0&&item.score<=item.maximum&&['sample','verified'].includes(item.sourceMode),'Invalid enrollment assessment fields.');
        rows.affairs_grade_items.push({id:stableRowId([course.enrollmentId,'grade',index]),enrollment_id:course.enrollmentId,label:item.label,score:item.score,maximum:item.maximum,released_at:snapshot.checkedAt,source_mode:item.sourceMode});
      });
      course.attendance.forEach((item,index)=>{
        requireSchema(validDay(item.date)&&['present','late','absent','excused'].includes(item.status)&&['sample','verified'].includes(item.sourceMode),'Invalid enrollment attendance fields.');
        rows.affairs_attendance.push({id:stableRowId([course.enrollmentId,'attendance',index]),enrollment_id:course.enrollmentId,meeting_on:item.date,status:item.status,source_mode:item.sourceMode});
      });
    }
    if(shared.initializerSectionIds?.some(id=>!rows.affairs_enrollments.some(row=>row.section_id===id)))fail('fixture-unsupported','The account initializer would add catalog enrollments outside this golden fixture; the fixture cannot be evaluated faithfully.');
  }
  uniqueRows(rows);
  return {domains:[...domains],rows,expected,userId,studentId,otherUserId};
}

/** Exact comparison after the real API read; field mismatches are fixture errors. */
export function verifyNativeFixtureReadback(actual,plan){
  for(const domain of plan.domains){
    const ordered=value=>domain==='courses'&&Array.isArray(value)?[...value].sort((a,b)=>String(a.enrollmentId).localeCompare(String(b.enrollmentId))):value;
    assertFactEqual(ordered(actual[domain]),ordered(plan.expected[domain]),domain+' native records');
  }
  return true;
}
/** Matches service row checks, including the separate mental-health time enum. */
export function validateFixtureServiceRecord(row){
  requireSchema(UUID.test(row?.id)&&validText(row.title,160)&&typeof row.notes==='string'&&row.notes.length<=2000&&['draft','filed','withdrawn'].includes(row.status)&&validStamp(row.updatedAt),'Invalid private service record fields.');
  const start=row.startsOn??null,end=row.endsOn??null,category=row.leaveCategory??null,periods=row.periods??null,phone=row.contactPhone??null,time=row.leaveTimePeriod??null;
  requireSchema(start===null&&end===null||validDay(start)&&validDay(end)&&start>='2000-01-01'&&end<='2100-12-31'&&start<=end,'Invalid service record dates.');
  requireSchema(category===null||['personal','sick','official','bereavement','nursing','mental_health','maternity','menstrual','other'].includes(category),'Invalid leave category.');
  requireSchema(row.serviceKey==='leave'&&row.recordType==='leave'&&start!==null&&category!==null&&validText(periods,80)||
    row.serviceKey==='internship'&&['contract','self_assessment','company'].includes(row.recordType)&&category===null&&periods===null||
    /^[1-9][0-9]{0,2}-[1-9][0-9]{0,2}$/.test(row.serviceKey)&&row.recordType==='note'&&start===null&&category===null&&periods===null,'Invalid service-specific record shape.');
  requireSchema(phone===null||row.serviceKey==='leave'&&typeof phone==='string'&&phone.length>=3&&phone.length<=32&&/^[+0-9 ()#.-]+$/.test(phone),'Invalid private leave contact field.');
  requireSchema(category==='mental_health'?['am','pm','day'].includes(time):time===null,'leaveTimePeriod is an am/pm/day mental-health enum; ordinary leave uses periods and must leave it null.');
  requireSchema(row.reviewStatus==null||['open','in_review','resolved'].includes(row.reviewStatus),'Invalid joined service review state.');
  return true;
}
async function readNativeBindings(snapshot,testCase){
  const s=state,required=new Set(testCase.expected?.requiredTools||[]),domains=[...PRIVATE_NATIVE_DOMAINS,...CONDITIONAL_NATIVE_DOMAINS.filter(domain=>required.has(domain))],shared={};
  for(const domain of ['scholarship','housing'].filter(domain=>domains.includes(domain))){
    const values=await query(()=>s.sql`select * from ${s.sql('public.'+periodTables[domain])} where published=true order by id limit 501`,'Could not read published fixture period bindings.');
    if(values.length>500)fail('fixture-unsupported','Published period bindings exceed the bounded fixture inventory.');
    const normalized=values.map(row=>({...row,opens_at:timestamp(row.opens_at),closes_at:timestamp(row.closes_at)}));
    shared[domain]=domain==='scholarship'?mapScholarshipRecords(normalized,[]):mapHousingRecords(normalized,[],[]);
  }
  if(domains.includes('courses')){
    const codes=snapshot.courses.map(row=>row.code);
    const values=await query(()=>s.sql`select s.id as section_id,c.code,c.title,c.credits,t.label as term,
      to_char(t.starts_on,'YYYY-MM-DD') as term_starts_on,to_char(t.ends_on,'YYYY-MM-DD') as term_ends_on,
      s.instructor,s.weekday,s.starts_at::text,s.ends_at::text,s.room,t.code as term_code
      from public.affairs_sections s join public.affairs_courses c on c.id=s.course_id join public.affairs_terms t on t.id=s.term_id
      where c.code in ${s.sql(codes.length?codes:['__NO_SYNTHETIC_COURSES__'])} or t.code='SAMPLE-2026-FALL' limit 501`,'Could not read exact shared course bindings.');
    if(values.length>500)fail('fixture-unsupported','Catalog bindings exceed the bounded fixture inventory.');
    shared.courses=values.map(row=>({sectionId:row.section_id,code:row.code,title:row.title,credits:Number(row.credits),term:row.term,termStartsOn:row.term_starts_on,termEndsOn:row.term_ends_on,instructor:row.instructor,weekday:Number(row.weekday),startsAt:row.starts_at,endsAt:row.ends_at,room:row.room}));
    shared.initializerSectionIds=values.filter(row=>row.term_code==='SAMPLE-2026-FALL').map(row=>row.section_id);
  }
  return planNativeFixture(snapshot,{userId:s.users[0].id,studentId:s.users[0].studentId,otherUserId:s.users[1].id,domains,shared});
}
function recordsToInsert(snapshot,user){
  const courses=snapshot.dtm.courses.filter(row=>row.sourceMode==='personal');
  const courseIds=new Set(courses.map(row=>row.id));
  const rows={
    dtm_courses:courses.map((row,index)=>({...pick(row,['id','code','title','term','role']),user_id:user.id,source_mode:'personal',created_at:new Date(Date.parse(state.now)-index*1000).toISOString()})),
    dtm_materials:courses.flatMap(course=>course.materials.map(row=>({id:row.id,course_id:course.id,title:row.title,kind:row.kind,summary:row.summary,position:row.position,source_mode:'personal',source_url:row.sourceUrl??null}))),
    dtm_meetings:courses.flatMap(course=>course.meetings.map(row=>({id:row.id,course_id:course.id,meeting_on:row.date,starts_at:row.startsAt,title:row.title,attendance:row.attendance,notes:row.notes}))),
    dtm_grade_items:courses.flatMap(course=>course.grades.map(row=>({id:row.id,course_id:course.id,label:row.label,score:row.score,maximum:row.maximum,graded_on:row.date,feedback:row.feedback}))),
    affairs_assignments:snapshot.assignments.map(row=>{
      if(row.sourceMode!=='personal'||!courseIds.has(row.dtmCourseId)||row.enrollmentId)fail('fixture-unsupported','Only actual private DTM assignments are mapped by this adapter.');
      return {id:row.id,student_id:user.studentId,enrollment_id:null,dtm_course_id:row.dtmCourseId,title:row.title,details:row.details,due_at:row.dueAt,status:row.status,submitted_at:row.submittedAt,source_mode:'personal',meeting_id:row.meetingId,import_key:row.origin==='moodle_calendar'?hash({fixture:row.id}):null};
    }),
    affairs_charges:snapshot.charges.map(row=>({id:row.id,student_id:user.studentId,label:row.label,amount_due:row.amountDue,amount_paid:row.amountPaid,currency:row.currency,due_on:row.dueOn,source_mode:row.sourceMode,occurrence_on:row.occurrenceOn,category:row.category,contact_unit:row.contactUnit,contact_extension:row.contactExtension,payment_unit:row.paymentUnit})),
    affairs_tasks:snapshot.tasks.map(row=>({id:row.id,user_id:user.id,title:row.title,due_at:row.dueAt,completed_at:row.completedAt,source_mode:row.sourceMode})),
    affairs_service_requests:snapshot.requests.map(row=>({id:row.id,user_id:user.id,request_type:row.type,title:row.title,details:row.details,status:row.status,created_at:row.createdAt,updated_at:row.createdAt})),
    affairs_service_records:[],
  };
  for(const row of snapshot.serviceRecords){
    validateFixtureServiceRecord(row);
    if(row.userId&&row.userId!==user.id)fail('fixture-isolation','Service fixture record belongs to a different account.');
    const reviewId=row.reviewStatus?randomUUID():null;
    if(reviewId)rows.affairs_service_requests.push({id:reviewId,user_id:user.id,request_type:'general',title:'Review '+row.title,details:'Synthetic local review request for '+row.title,status:row.reviewStatus,created_at:state.now,updated_at:state.now});
    rows.affairs_service_records.push({id:row.id,user_id:user.id,service_key:row.serviceKey,record_type:row.recordType,title:row.title,notes:row.notes,status:row.status,starts_on:row.startsOn,ends_on:row.endsOn,leave_category:row.leaveCategory,periods:row.periods,review_request_id:reviewId,updated_at:row.updatedAt,contact_phone:row.contactPhone??null,leave_time_period:row.leaveTimePeriod??null});
  }
  for(const [table,values] of Object.entries(rows)){
    const ids=new Set();for(const row of values){if(!UUID.test(row.id)||ids.has(row.id))fail('fixture-schema',`Duplicate or invalid synthetic record ID for ${table}.`);ids.add(row.id);}
  }
  return rows;
}
async function persistSnapshot(snapshot,rows,testCase,nativePlan){
  const s=state,user=s.users[0];
  for(const values of Object.values(rows))for(const row of values)s.recordIds.add(row.id);
  await saveLedger();
  await query(async()=>{
    const tx=s.sql;await tx.unsafe('begin');
    try{
    // Deletes are scoped only to the freshly created fixture account. Global
    // sample courses, university captures, notices and real people are untouched.
    await tx`delete from public.affairs_service_records where user_id=${user.id}`;
    await tx`delete from public.affairs_service_requests where user_id=${user.id}`;
    await tx`delete from public.affairs_tasks where user_id=${user.id} and source_mode='site'`;
    await tx`delete from public.affairs_assignments where student_id=${user.studentId}`;
    await tx`delete from public.dtm_courses where user_id=${user.id} and source_mode='personal'`;
    await tx`delete from public.affairs_charges where student_id=${user.studentId}`;
    // Both owners are newly created in this lifecycle. Foreign sentinel records
    // are written only to the second fixture account, never a real identity.
    const fixtureUsers=s.users.map(item=>item.id);
    for(const table of [...ownTables,'affairs_scholarship_applications','affairs_housing_applications','affairs_housing_assignments']){
      await tx`delete from ${tx('public.'+table)} where user_id in ${tx(fixtureUsers)}`;
    }
    if(nativePlan.domains.includes('courses'))await tx`delete from public.affairs_enrollments where student_id=${user.studentId}`;
    await tx`update public.affairs_profiles set preferred_name=${snapshot.profile.displayName} where user_id=${user.id}`;
    await tx`update public.affairs_students set student_number=${snapshot.student.studentNumber},full_name=${snapshot.student.fullName},year_level=${snapshot.student.yearLevel} where id=${user.studentId} and user_id=${user.id}`;
    // Programs are shared catalog data. Existing rows may be referenced, never
    // created or changed to accommodate an evaluation.
    const programs=await tx`select id from public.affairs_programs where name=${snapshot.student.program} order by id limit 2`;
    if(programs.length===1)await tx`update public.affairs_students set program_id=${programs[0].id} where id=${user.studentId} and user_id=${user.id}`;
    else if(JSON.stringify(testCase.expected).includes('Information Studies'))fail('fixture-unsupported','The required synthetic program is absent from the shared catalog; no global catalog row will be created.');
    for(const [table,values] of Object.entries(rows)){
      for(let start=0;start<values.length;start+=100){
        const batch=values.slice(start,start+100).map(row=>({...row,...(table==='affairs_course_selection_records'?{meetings:tx.json(row.meetings)}:{}),...(table==='affairs_graduation_reviews'?{report:tx.json(row.report)}:{})}));
        if(batch.length)await tx`insert into ${tx('public.'+table)} ${tx(batch)}`;
      }
    }
    await tx.unsafe('commit');
    }catch(error){try{await tx.unsafe('rollback');}catch{/* Preserve the original, sanitized error. */}throw error;}
  },'Could not persist private evaluation rows.');
}
function canonical(value){
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value)){const result=value.map(canonical);return result.every(row=>row&&typeof row==='object'&&row.id)?result.sort((a,b)=>String(a.id).localeCompare(String(b.id))):result;}
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)&&Number.isFinite(Date.parse(value)))return timestamp(value);
  return value;
}
function assertFactEqual(actual,expected,label){
  try{assert.deepEqual(canonical(actual),canonical(expected));}catch{fail('fixture-mapping',`${label} differs between the independent golden fixture and authenticated /api/affairs-data. Model evaluation was not started.`);}
}
function verifyReadback(actual,expected,testCase){
  assertFactEqual(pick(actual.profile,['email','displayName','role']),pick(expected.profile,['email','displayName','role']),'profile');
  assertFactEqual(pick(actual.student,['studentNumber','fullName','yearLevel','status','sourceMode']),pick(expected.student,['studentNumber','fullName','yearLevel','status','sourceMode']),'student identity');
  if(JSON.stringify(testCase.expected).includes('Information Studies'))assertFactEqual(actual.student.program,expected.student.program,'program');
  assertFactEqual(sort(actual.dtm.courses.filter(row=>row.sourceMode==='personal')),sort(expected.dtm.courses.filter(row=>row.sourceMode==='personal')),'personal DTM courses, material content, meetings and grade feedback');
  assertFactEqual(sort(actual.assignments),sort(expected.assignments),'assignment records and linkage');
  assertFactEqual(sort(actual.charges),sort(expected.charges),'fee balances and contact fields');
  assertFactEqual(sort(actual.tasks.filter(row=>row.sourceMode==='site')),sort(expected.tasks),'personal task records');
  const requestIds=new Set(expected.requests.map(row=>row.id));
  assertFactEqual(sort(actual.requests.filter(row=>requestIds.has(row.id))),sort(expected.requests),'request status');
  if(testCase.fixtureKey==='empty:requests')assertFactEqual(actual.requests,[],'empty request collection');
  const serviceKeys=['id','serviceKey','recordType','title','notes','status','startsOn','endsOn','leaveCategory','periods','updatedAt','reviewStatus','contactPhone','leaveTimePeriod'];
  assertFactEqual(sort(actual.serviceRecords.map(row=>pick(row,serviceKeys))),sort(expected.serviceRecords.map(row=>pick(row,serviceKeys))),'service records and joined review status');
}
function ownState(snapshot){
  const keys=['profile','student','courses','assignments','charges','tasks','requests','serviceRecords','scholarship','studentAid','housing','creditLoadHistory','courseSelection','academicGrades','graduationReview','academicAttendance'];
  return canonical({...Object.fromEntries(keys.map(key=>[key,snapshot[key]??null])),dtm:{sourceMode:snapshot.dtm.sourceMode,courses:snapshot.dtm.courses}});
}

/** Persists golden facts, then proves the application's actual auth/RLS read path. */
export async function forCase(testCase,{signal}={}){
  const s=ready();if(s.current)fail('fixture-state','afterCase() must complete before selecting another fixture.');
  if((signal||s.signal)?.aborted)fail('fixture-aborted','Evaluation was interrupted.');
  const expected=fixtureForCase(testCase,{userId:s.users[0].id,now:s.now});
  assertSupported(testCase,expected);
  const nativePlan=await readNativeBindings(expected,testCase);
  const rows={...recordsToInsert(expected,s.users[0]),...nativePlan.rows};
  await persistSnapshot(expected,rows,testCase,nativePlan);
  const actual=await readSnapshot(s.users[0],{signal:signal||s.signal});
  verifyReadback(actual,expected,testCase);
  verifyNativeFixtureReadback(actual,nativePlan);
  const before=ownState(actual);
  s.current={caseId:testCase.id,beforeHash:hash(before)};
  await saveLedger();
  return {token:s.users[0].token};
}

/** Deliberately never confirms or executes a proposed assistant action. */
export async function afterCase(testCase,envelope,{signal}={}){
  const s=ready();if(s.current?.caseId!==testCase.id)fail('fixture-state','afterCase() does not match the prepared case.');
  const current=s.current;
  try{
    const actual=await readSnapshot(s.users[0],{signal:signal||s.signal});
    const afterHash=hash(ownState(actual));
    envelope.stateBefore={ownedRecordsDigest:current.beforeHash};
    envelope.stateAfterProposal={ownedRecordsDigest:afterHash};
    envelope.fixtureReadback={verified:true,projectRef:PROJECT,independentGolden:true};
    if(afterHash!==current.beforeHash)fail('fixture-unapproved-write','Generating an answer or proposal changed the fixture records before confirmation.');
  }finally{s.current=null;await saveLedger();}
}

/** Removes only this lifecycle's fresh users and proves cascaded data is absent. */
export async function cleanup(){
  const s=state;if(!s)return {verified:true,createdUsers:0};
  s.closing=true;let verified=false,cleanupError;
  try{
    for(const user of [...s.users].reverse()){
      let deleted=false;
      for(let attempt=0;attempt<3;attempt++){
        try{const result=await s.admin.auth.admin.deleteUser(user.id);if(!result.error||result.error.status===404){deleted=true;break;}}catch{/* Retry a bounded Auth call, without tokens in diagnostics. */}
      }
      if(!deleted)fail('fixture-cleanup','Disposable account removal failed; exact IDs remain in the owner-only cleanup ledger.');
      user.token=null;
    }
    if(s.users.length){
      const ids=s.users.map(user=>user.id);
      const remaining=await query(()=>s.sql`select 'auth' as kind,id from auth.users where id in ${s.sql(ids)}
        union all select 'profile',user_id from public.affairs_profiles where user_id in ${s.sql(ids)}
        union all select 'student',id from public.affairs_students where user_id in ${s.sql(ids)}
        union all select 'dtm',id from public.dtm_courses where user_id in ${s.sql(ids)}
        union all select 'service',id from public.affairs_service_records where user_id in ${s.sql(ids)}`,'Could not verify disposable fixture cleanup.');
      if(remaining.length)fail('fixture-cleanup','Fixture-owned rows remain; the private cleanup ledger is retained.');
      for(const table of [...ownTables,'affairs_scholarship_applications','affairs_housing_applications','affairs_housing_assignments']){
        const native=await query(()=>s.sql`select id from ${s.sql('public.'+table)} where user_id in ${s.sql(ids)} limit 1`,'Could not verify native fixture cleanup.');
        if(native.length)fail('fixture-cleanup','Native fixture-owned rows remain; the private cleanup ledger is retained.');
      }
    }
    verified=true;
    if(s.ledger){await rm(s.ledger,{force:true});await rm(s.ledger+'.tmp',{force:true});}
  }catch(error){cleanupError=error;}
  finally{
    try{if(s.locked)await s.sql`select pg_advisory_unlock(23101314,115100)`;}catch{if(!cleanupError)cleanupError=new LiveFixtureError('fixture-cleanup','Could not release the fixture advisory lock.');}
    try{await s.sql?.release?.();await s.db?.end({timeout:5});}catch{if(!cleanupError)cleanupError=new LiveFixtureError('fixture-cleanup','Could not close the fixture database connection.');}
    if(verified&&!cleanupError)state=undefined;
  }
  if(cleanupError){if(cleanupError instanceof LiveFixtureError)throw cleanupError;fail('fixture-cleanup','Cleanup could not be verified; the private ledger is retained.');}
  return {verified:true,createdUsers:s.users.length,projectRef:PROJECT};
}

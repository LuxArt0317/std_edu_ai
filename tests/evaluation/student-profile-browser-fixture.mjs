import {isDeepStrictEqual} from 'node:util';
import {profileFieldLengths,studentProfilePath} from '../../server/studentProfileContract.js';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';
import {certificateAwardPreviewHash as digest} from './certificate-award-preview.mjs';
import {studentProfileBrowserCases} from './student-profile-browser-turn.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

const roles=['A','B'];
const program='SAMPLE-GEN';
const observedProfiles=['20261105010000','20261106010000','20261114210000'];
const need=condition=>check(condition,'student profile fixture mismatch');
const normalizeTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():value;
const enrollments=[['SAMP090','SAMPLE-2026-SPRING','completed'],['SAMP103','SAMPLE-2026-FALL','enrolled'],
  ['SAMP201','SAMPLE-2027-SPRING','enrolled']];

export function buildStudentProfileBrowserFixture(runId,owners){
  const identity=validateAidPaymentFixtureOwners({runId,owners});
  const hash=digest({runId,owner:owners.A.id,purpose:'student-profile-browser'});
  const id=[hash.slice(0,8),hash.slice(8,12),'4'+hash.slice(13,16),'8'+hash.slice(17,20),hash.slice(20,32)].join('-');
  need(![runId,...roles.map(role=>owners[role].id)].includes(id));
  const marker='PROFILE-QA-'+hash.slice(0,12);
  const student={id,user_id:owners.A.id,student_number:marker,full_name:'Disposable '+marker,
    year_level:3,source_mode:'sample',status:'active'};
  const record={...Object.fromEntries(Object.keys(profileFieldLengths).map(key=>[key,null])),
    user_id:student.user_id,student_number:marker,name_zh:'測試 '+marker,name_en:student.full_name,
    identity_last_four:hash.slice(0,4),registered_address:'Private sample address '+marker,
    original_mobile:'0900000123',updated_mobile:null,confirmed_at:'2026-11-14T02:12:00.000Z',version:2};
  return {...identity,student,record};
}

export async function assertStudentProfileBrowserSchema(sql){
  const [state]=await sql`select
    (select count(*)::int from supabase_migrations.schema_migrations where version in ${sql(observedProfiles)}) as versions,
    coalesce(has_function_privilege('authenticated',to_regprocedure('public.affairs_read_student_profile(uuid,boolean)'),'EXECUTE'),false) as executable,
    coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.affairs_student_profiles')),false) as profile_rls,
    coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.affairs_students')),false) as student_rls,
    not has_table_privilege('authenticated',to_regclass('public.affairs_student_profiles'),'SELECT') as private_table`;
  need(state?.versions===observedProfiles.length&&state.executable===true&&state.profile_rls===true&&state.student_rls===true&&state.private_table===true);
}

async function validateScope(sql,plan,lock){
  need(isDeepStrictEqual(plan,buildStudentProfileBrowserFixture(plan.runId,plan.owners)));
  const ids=roles.map(role=>plan.owners[role].id).sort();
  if(lock)for(const id of ids){
    await sql`select pg_advisory_xact_lock(hashtextextended('student-profile-actor:'||${id},0))`;
    await sql`select pg_advisory_xact_lock(hashtextextended('student-profile-target:'||${id},0))`;
  }
  const people=await sql`select u.id,u.email,u.raw_user_meta_data->>'assistant_evaluation_run' as "runMarker",
    u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
      and exists(select 1 from public.affairs_profiles p where p.user_id=u.id and p.role='student') as disposable
    from auth.users u where u.id in ${sql(ids)} limit 3`;
  need(people.length===2&&roles.every(role=>people.some(({disposable,...person})=>disposable===true
    &&isDeepStrictEqual(person,plan.owners[role]))));
  return ids;
}

async function readRows(sql,plan,ids){
  const studentId=plan.student.id;
  const profiles=await sql`select to_jsonb(p) as value from public.affairs_student_profiles p where user_id in ${sql(ids)} limit 3`;
  const students=await sql`select s.id,s.user_id,s.student_number,s.full_name,s.year_level,s.source_mode,s.status,p.code as program_code,
    p.source_mode as program_mode from public.affairs_students s join public.affairs_programs p on p.id=s.program_id
    where s.id=${studentId} or s.user_id in ${sql(ids)} limit 3`;
  const receipts=await sql`select 1 from private.affairs_student_profile_receipts where actor in ${sql(ids)} or target in ${sql(ids)} limit 1`;
  need(receipts.length===0);
  return {profiles:profiles.map(({value})=>({...value,confirmed_at:normalizeTime(value.confirmed_at)})),students:[...students]};
}

/** In the deployed schema inserting one sample student seeds three
 * enrollments, a tuition row and one assignment. Observe their exact scope
 * and preserve the shared catalog. Deleting the reserved student cascades only
 * the verified rows under that student's reserved ID. */
async function readChildren(sql,studentId,{empty=false}={}){
  const courses=await sql`select e.id,c.code,t.code as term,e.status,e.source_mode from public.affairs_enrollments e
    join public.affairs_sections s on s.id=e.section_id join public.affairs_courses c on c.id=s.course_id
    join public.affairs_terms t on t.id=s.term_id where e.student_id=${studentId} order by c.code limit 4`;
  const charges=await sql`select id,label,amount_due::text,amount_paid::text,currency,due_on::text,source_mode
    from public.affairs_charges where student_id=${studentId} limit 2`;
  const assignments=await sql`select id,enrollment_id,dtm_course_id,title,details,status,source_mode,
    to_char(due_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as due_at
    from public.affairs_assignments where student_id=${studentId} limit 2`;
  if(empty)need(!courses.length&&!charges.length&&!assignments.length);
  else{
    const [charge]=charges,[assignment]=assignments;
    need(isDeepStrictEqual(courses.map(row=>[row.code,row.term,row.status]),enrollments)&&courses.every(row=>row.source_mode==='sample')
      &&charges.length===1&&charge.label==='Sample Fall 2026 tuition'&&Number(charge.amount_due)===28000
      &&Number(charge.amount_paid)===5000&&charge.currency==='TWD'&&charge.due_on==='2026-12-15'&&charge.source_mode==='sample'
      &&assignments.length===1&&assignment.enrollment_id===courses[1].id&&assignment.dtm_course_id===null
      &&assignment.title==='Student services worksheet'&&assignment.details==='Complete the sample student services checklist.'
      &&assignment.status==='open'&&assignment.source_mode==='sample'&&assignment.due_at==='2026-11-13T15:59:00Z');
    const [state]=await sql`select exists(select 1 from public.affairs_grade_items where enrollment_id in ${sql(courses.map(row=>row.id))})
      or exists(select 1 from public.affairs_attendance where enrollment_id in ${sql(courses.map(row=>row.id))}) as extra`;
    need(state?.extra===false);
  }
  return {courses:[...courses],charges:[...charges],assignments:[...assignments]};
}

const expectedStudent=plan=>({...plan.student,program_code:program,program_mode:'sample'});
async function observe(sql,plan,ids){
  const rows=await readRows(sql,plan,ids);
  need(isDeepStrictEqual(rows.profiles,[plan.record])&&isDeepStrictEqual(rows.students,[expectedStudent(plan)]));
  return digest({...rows,...await readChildren(sql,plan.student.id)});
}

export async function seedStudentProfileBrowserFixture(sql,plan){
  await assertStudentProfileBrowserSchema(sql);
  const ids=await validateScope(sql,plan,true),rows=await readRows(sql,plan,ids);
  need(!rows.profiles.length&&!rows.students.length);
  await readChildren(sql,plan.student.id,{empty:true});
  const student=plan.student;
  const created=await sql`insert into public.affairs_students(id,user_id,student_number,full_name,year_level,source_mode,status,program_id)
    select ${student.id},${student.user_id},${student.student_number},${student.full_name},${student.year_level},'sample','active',id
    from public.affairs_programs where code=${program} and source_mode='sample' returning id`;
  need(created.length===1&&created[0].id===student.id);
  await sql`insert into public.affairs_student_profiles ${sql(plan.record)}`;
  return observe(sql,plan,ids);
}

export async function observeStudentProfileBrowserFixture(sql,plan){
  return observe(sql,plan,await validateScope(sql,plan,false));
}

export async function deleteStudentProfileBrowserFixture(sql,plan){
  const ids=await validateScope(sql,plan,true),rows=await readRows(sql,plan,ids);
  if(!rows.profiles.length&&!rows.students.length){await readChildren(sql,plan.student.id,{empty:true});return;}
  await observe(sql,plan,ids);
  const owner=plan.owners.A.id;
  const profile=await sql`delete from public.affairs_student_profiles where user_id=${owner} and version=${plan.record.version} returning user_id`;
  const student=await sql`delete from public.affairs_students where id=${plan.student.id} and user_id=${owner} returning id`;
  need(profile.length===1&&profile[0].user_id===owner&&student.length===1&&student[0].id===plan.student.id);
  const after=await readRows(sql,plan,ids);
  need(!after.profiles.length&&!after.students.length);
  await readChildren(sql,plan.student.id,{empty:true});
}

export async function verifyStudentProfileBrowserFixtureAbsent(sql,plan){
  need(isDeepStrictEqual(plan,buildStudentProfileBrowserFixture(plan.runId,plan.owners)));
  const ids=roles.map(role=>plan.owners[role].id);
  const [state]=await sql`select exists(select 1 from auth.users where id in ${sql(ids)})
    or exists(select 1 from auth.identities where user_id in ${sql(ids)})
    or exists(select 1 from auth.sessions where user_id in ${sql(ids)})
    or exists(select 1 from public.affairs_profiles where user_id in ${sql(ids)})
    or exists(select 1 from public.affairs_students where id=${plan.student.id} or user_id in ${sql(ids)})
    or exists(select 1 from public.affairs_student_profiles where user_id in ${sql(ids)})
    or exists(select 1 from private.affairs_student_profile_receipts where actor in ${sql(ids)} or target in ${sql(ids)}) as remains`;
  if(state?.remains!==false)return false;
  await readChildren(sql,plan.student.id,{empty:true});
  return true;
}

/** Compare the raw status and limited year through both authenticated
 * accounts. The direct cross reads use the peer's credential and must fail. */
export async function observeStudentProfileBrowserCallers(plan,{users,readRpc,readYear}){
  need(typeof readRpc==='function'&&typeof readYear==='function'&&Array.isArray(users)&&users.length===2
    &&roles.every((role,index)=>users[index]?.id===plan.owners[role].id&&typeof users[index].token==='string'&&users[index].token)
    &&users[0].token!==users[1].token);
  const observations={};
  for(const [index,role] of roles.entries()){
    const user=users[index],other=users[1-index],recordExists=role==='A',workspace=recordExists?plan.record:null;
    const status=await readRpc(user,{p_target:null,p_status_only:true});
    const {confirmedAt,...fixed}=status?.body??{};
    need(status?.status===200&&isDeepStrictEqual(fixed,{userId:user.id,recordExists})
      &&normalizeTime(confirmedAt)===(workspace?.confirmed_at??null));
    const crossed=await readRpc(user,{p_target:other.id,p_status_only:false});
    need(crossed?.status===403&&crossed.body?.code==='42501');
    const year=await readYear(user,user.id);
    const expectedYear=recordExists?{user_id:user.id,year_level:plan.student.year_level,source_mode:'sample'}:null;
    need([200,206].includes(year?.status)&&year.contentRange===(expectedYear?'0-0/1':'*/0')
      &&isDeepStrictEqual(year.body,expectedYear?[expectedYear]:[]));
    const hidden=await readYear(user,other.id);
    need([200,206].includes(hidden?.status)&&hidden.contentRange==='*/0'&&isDeepStrictEqual(hidden.body,[]));
    observations[role]={ownerId:user.id,recordExists,confirmedAt:normalizeTime(confirmedAt),workspace,year:expectedYear};
  }
  return observations;
}

export function bindStudentProfileBrowserCase(plan,observations,caseId){
  const frozen=studentProfileBrowserCases.find(row=>row.id===caseId);
  need(frozen);
  const {role,...testCase}=frozen,observation=observations[role];
  need(observation?.ownerId===plan.owners[role].id);
  return {role,testCase:{...testCase,route:studentProfilePath},observation:structuredClone(observation)};
}

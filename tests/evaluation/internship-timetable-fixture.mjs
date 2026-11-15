import {isDeepStrictEqual} from 'node:util';
import {internshipObservationDigest as digest} from '../../server/internshipObservation.js';
import {bindPublishedSampleEnrollments,sampleEnrollmentManifest} from './published-sample-enrollments.mjs';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const select='id,student_id,section_id,status,source_mode,student:affairs_students!affairs_enrollments_student_id_fkey(id,user_id),section:affairs_sections!affairs_enrollments_section_id_fkey(id,course_id,term_id,weekday,starts_at,ends_at,room,course:affairs_courses!affairs_sections_course_id_fkey(id,code,title),term:affairs_terms!affairs_sections_term_id_fkey(id,label,starts_on,ends_on))';
const fail=stage=>{throw new Error('Internship published timetable fixture: '+stage+'.');};
const order=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
const fixtureCodes=sampleEnrollmentManifest.scope.academicSeedCourseCodes;

export function buildInternshipTimetableFixture({runId,owners,read,now}){
  const ids=[runId,owners?.A,owners?.B];
  if(!ids.every(value=>uuid.test(value??''))||new Set(ids).size!==ids.length)fail('invalid disposable identities');
  const id=suffix=>runId.slice(0,24)+'000000000'+suffix;
  const students=['A','B'].map((role,index)=>({
    id:id(631+index),user_id:owners[role],student_number:'EVAL-'+id(631+index),full_name:'Evaluation Timetable Student '+role,
    program_id:null,year_level:1,status:'active',source_mode:'sample',
  }));
  // Synthetic enrollment IDs here only validate the read-only shared initializer
  // universe. The trigger's actual owned IDs are independently read after insert.
  const enrollmentIdsByCode=Object.fromEntries(sampleEnrollmentManifest.courses.map((course,index)=>[course.code,id(641+index)]));
  if(students.some(row=>ids.includes(row.id))||Object.values(enrollmentIdsByCode).some(value=>ids.includes(value)))fail('reserved identity collision');
  const bound=bindPublishedSampleEnrollments(read,{userId:owners.A,studentId:students[0].id,enrollmentIdsByCode,now});
  const sections=bound.binding.sections.filter(section=>fixtureCodes.includes(section.code)).map(section=>{
    const course=sampleEnrollmentManifest.courses.find(row=>row.code===section.code);
    return {...section,...course,term:sampleEnrollmentManifest.terms.find(term=>term.code===course.termCode)};
  });
  for(const student of students)student.program_id=sections[0].programId;
  if(bound.binding.sections.some(section=>Object.values(section).some(value=>[...ids,...students.map(row=>row.id)].includes(value))))fail('shared identity collision');
  return {runId,owners:{...owners},students,sections,sharedDigest:bound.binding.sharedDigest};
}

async function readState(sql,plan,reservedEnrollments=[]){
  const studentIds=plan.students.map(row=>row.id);
  const students=await sql`select id,user_id,student_number,full_name,program_id,year_level,status,source_mode
    from public.affairs_students where id in ${sql(studentIds)} or user_id in ${sql(Object.values(plan.owners))} order by id limit 3`;
  const linked=[...new Set([...studentIds,...students.map(row=>row.id)])];
  const enrollments=await sql`select id,student_id,section_id,status,source_mode from public.affairs_enrollments
    where student_id in ${sql(linked)} or id=any(${reservedEnrollments}::uuid[]) order by id limit 7`;
  return {students:Array.from(students),enrollments:Array.from(enrollments)};
}

function validateState(plan,state){
  if(!isDeepStrictEqual(state.students,order(plan.students))||state.enrollments.length!==plan.students.length*plan.sections.length
    ||new Set(state.enrollments.map(row=>row.id)).size!==state.enrollments.length)fail('owned timetable rows differ');
  for(const {id}of plan.students){
    for(const section of plan.sections){
      const rows=state.enrollments.filter(row=>row.student_id===id&&row.section_id===section.sectionId);
      if(rows.length!==1||!uuid.test(rows[0].id)||rows[0].status!==section.status||rows[0].source_mode!==section.sourceMode)
        fail('scoped trigger rows differ');
    }
  }
}

export async function observeInternshipTimetableRows(sql,plan){
  const state=await readState(sql,plan);
  validateState(plan,state);
  return state;
}
export async function verifyInternshipTimetableAbsent(sql,plan,expected){
  const studentIds=plan.students.map(row=>row.id);
  const state=await readState(sql,plan,expected?.enrollments.map(row=>row.id));
  const charges=await sql`select 1 from public.affairs_charges where student_id in ${sql(studentIds)} limit 1`;
  const assignments=await sql`select 1 from public.affairs_assignments where student_id in ${sql(studentIds)} limit 1`;
  if(state.students.length||state.enrollments.length||charges.length||assignments.length)fail('reserved rows remain after cleanup');
}
export async function stageInternshipTimetable(sql,plan){
  await verifyInternshipTimetableAbsent(sql,plan);
  await sql`insert into public.affairs_students ${sql(plan.students)}`;
  return observeInternshipTimetableRows(sql,plan);
}
export async function cleanupInternshipTimetable(sql,plan,expected){
  const state=await readState(sql,plan,expected?.enrollments.map(row=>row.id));
  if(!state.students.length&&!state.enrollments.length)return;
  validateState(plan,state);
  if(expected&&!isDeepStrictEqual(state,expected))fail('persisted owner enrollment identities changed');
  // The exact disposable owner/student pair cascades its synthetic enrollments
  // and their dependent trigger seed rows. Shared referenced catalog rows stay.
  for(const student of plan.students){
    const removed=await sql`delete from public.affairs_students where id=${student.id} and user_id=${student.user_id} returning id`;
    if(removed.length!==1||removed[0].id!==student.id)fail('student deletion was not exact');
  }
  await verifyInternshipTimetableAbsent(sql,plan,state);
}

/** Independent SQL calendar oracle, using a weekday date series from the exact
 * owned relational row set, an explicit Taipei instant and the literal sections. */
export async function readInternshipNextMeeting(sql,studentId,now){
  const rows=await sql`with clock as (
    select date_trunc('minute',${now}::timestamptz at time zone 'Asia/Taipei') as local_now
  ), meetings as (
    select c.code,c.title,s.section_code,s.room,s.starts_at,d.day::date as day
    from public.affairs_enrollments e join public.affairs_sections s on s.id=e.section_id
    join public.affairs_courses c on c.id=s.course_id join public.affairs_terms t on t.id=s.term_id cross join clock
    cross join lateral generate_series(greatest(local_now::date,t.starts_on)::timestamp,t.ends_on::timestamp,'1 day'::interval) d(day)
    where e.student_id=${studentId} and e.status='enrolled' and s.weekday=extract(isodow from d.day)
      and d.day::date+s.starts_at>local_now
  )
  select code,title,section_code as "sectionCode",room,to_char(day,'YYYY-MM-DD') as date,
    to_char(starts_at-time '00:00','HH24:MI') as "startTime"
    from meetings order by day,starts_at,code limit 1`;
  if(rows.length!==1)fail('no independently dated upcoming meeting');
  return {...rows[0]};
}

export function internshipTimetableSelection(plan,state,student){
  validateState(plan,state);
  const studentUrl=new URL('/rest/v1/affairs_students',origin);
  studentUrl.search=new URLSearchParams({select:'id,user_id',user_id:'eq.'+student.user_id,limit:'2'});
  const enrollmentsUrl=new URL('/rest/v1/affairs_enrollments',origin);
  enrollmentsUrl.search=new URLSearchParams({select,student_id:'eq.'+student.id,status:'eq.enrolled',order:'id.asc',limit:'100',offset:'0'});
  const studentRow={id:student.id,user_id:student.user_id};
  const enrolled=state.enrollments.filter(row=>row.student_id===student.id&&row.status==='enrolled');
  return [[studentUrl,[studentRow]],[enrollmentsUrl,enrolled.map(row=>{
    const s=plan.sections.find(section=>section.sectionId===row.section_id);
    return {...row,student:studentRow,section:{id:s.sectionId,course_id:s.courseId,term_id:s.termId,weekday:s.weekday,starts_at:s.startsAt,
      ends_at:s.endsAt,room:s.room,course:{id:s.courseId,code:s.code,title:s.title},
      term:{id:s.termId,label:s.term.label,starts_on:s.term.startsOn,ends_on:s.term.endsOn}}};
  })]];
}

export function expectedInternshipTimetableRead(plan,state){
  const [student]=plan.students;
  const selection=internshipTimetableSelection(plan,state,student);
  const courses=selection[1][1].map(row=>{
    const s=row.section;
    return {enrollmentId:row.id,status:row.status,sourceMode:row.source_mode,code:s.course.code,title:s.course.title,term:s.term.label,
      termStartsOn:s.term.starts_on,termEndsOn:s.term.ends_on,weekday:s.weekday,startsAt:s.starts_at.slice(0,5),endsAt:s.ends_at.slice(0,5),room:s.room};
  });
  return {reads:selection.map(([url,rows],index)=>digest({method:'GET',url:url.href,ownerId:student.user_id,rows,...(index?{total:rows.length}:{})})),
    evidenceDigest:digest({studentRecordFound:true,courses})};
}

export async function observeInternshipTimetableCallers(plan,state,{callers,publishableKey,fetchImpl,readResponse,signal}){
  if(!Array.isArray(callers)||callers.length!==2||callers.some((user,index)=>user.id!==plan.students[index].user_id
    ||typeof user.token!=='string'||!user.token)||callers[0].token===callers[1].token||typeof publishableKey!=='string'||!publishableKey)
    fail('independent caller binding is invalid');
  const proof=await Promise.all(callers.flatMap(caller=>plan.students.flatMap(target=>
    internshipTimetableSelection(plan,state,target).map(async ([url,expected],index)=>{
      const owned=caller.id===target.user_id;
      const response=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',signal,
        headers:{apikey:publishableKey,Authorization:'Bearer '+caller.token,...(index?{Prefer:'count=exact'}:{})}});
      const rows=await readResponse(response,url,16000);
      if(!isDeepStrictEqual(rows,owned?expected:[])||index&&response.headers.get('content-range')!==(owned?'0-'+(expected.length-1)+'/'+expected.length:'*/0'))
        fail('own or crossed caller rows differ');
      return digest({url:url.href,caller:caller.id,owned,rows});
    }))));
  return {checks:proof.length,digest:digest(proof)};
}

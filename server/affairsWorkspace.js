/** Private, account-scoped School Affairs data access. Never imports Nexus data. */
import {mapScholarshipRecords} from './scholarshipRecords.js';
import {mapStudentAidRecords} from './studentAidRecords.js';
import {mapHousingRecords} from './housingRecords.js';
import {mapCreditLoadHistory} from './creditLoadHistory.js';
import {mapCourseSelection} from './courseSelection.js';
import {loadNativeAcademicRecords} from './nativeAcademicWorkspace.js';
export class AffairsWorkspaceError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

function configuration() {
  const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key || !/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(url))
    throw new AffairsWorkspaceError('The client School Affairs database is unavailable.');
  return {url:url.replace(/\/$/,''),key};
}

function headers(token, key, body = false) {
  return {apikey:key,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json',Prefer:'return=representation'}:{})};
}

export async function verifyAffairsToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 4096)
    throw new AffairsWorkspaceError('Sign in to School Affairs again.',401);
  const {url,key}=configuration();
  let response;
  try { response=await fetch(`${url}/auth/v1/user`,{headers:headers(token,key),signal:AbortSignal.timeout(8000)}); }
  catch { throw new AffairsWorkspaceError('School Affairs sign-in could not be checked.'); }
  if (!response.ok) throw new AffairsWorkspaceError('Your School Affairs session expired. Please sign in again.',401);
  const user=await response.json().catch(()=>null);
  if (!user?.id || !Array.isArray(user.identities) || !user.identities.some(item=>item.provider==='google'))
    throw new AffairsWorkspaceError('Sign in to School Affairs with Google.',401);
  return {user,token,url,key};
}

async function request(account, table, options = {}) {
  const {rpc=false,body,query={}}=options;
  const target=new URL(`${account.url}/rest/v1/${rpc?'rpc/':''}${table}`);
  for (const [name,value] of Object.entries(query)) if (value !== undefined) target.searchParams.set(name,String(value));
  let response;
  try {
    const remaining=account.requestDeadline===undefined?12000:account.requestDeadline-Date.now();
    if(remaining<=0)throw new Error('Record lookup budget exhausted');
    response=await fetch(target,{method:rpc?'POST':'GET',headers:headers(account.token,account.key,rpc),...(rpc?{body:JSON.stringify(body||{})}:{}),signal:AbortSignal.timeout(Math.min(12000,remaining))});
  } catch { throw new AffairsWorkspaceError('The School Affairs database did not respond. Please try again.'); }
  if (!response.ok) {
    if (response.status===401 || response.status===403) throw new AffairsWorkspaceError('This School Affairs action is not allowed for your account.',403);
    if (response.status===400) throw new AffairsWorkspaceError('The School Affairs request was invalid. Check the fields and try again.',400);
    if (response.status===409) throw new AffairsWorkspaceError(['affairs_scholarship_action','affairs_manage_student_aid_record','affairs_housing_action','affairs_manage_credit_load_history','affairs_manage_course_selection','affairs_manage_academic_grades','affairs_manage_graduation_review','affairs_manage_academic_attendance'].includes(table)
      ? 'This record or its application period changed. Refresh and try again.'
      : 'A matching School Affairs record already exists.',409);
    throw new AffairsWorkspaceError('School Affairs records could not be loaded. Please try again.');
  }
  const raw=await response.text().catch(()=>{throw new AffairsWorkspaceError('School Affairs returned an unreadable record.');});
  if (!raw && rpc) return null; // PostgREST void RPCs may return 204 without JSON.
  try { return JSON.parse(raw); }
  catch { throw new AffairsWorkspaceError('School Affairs returned an invalid record.'); }
}

const own=(userId,limit=50)=>({select:'*',user_id:`eq.${userId}`,limit});
const byIds=(ids)=>ids.length?`in.(${ids.join(',')})`:'eq.00000000-0000-0000-0000-000000000000';
// PostgREST caps each response. A student's past terms can span many pages.
async function readAccountRows(account, table, query) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await request(account, table, {query:{...query,limit:pageSize,offset}});
    if (!Array.isArray(page)) throw new AffairsWorkspaceError('School Affairs returned invalid records.');
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
export async function loadAffairsSnapshot(account, includeAdmin = false, options = {}) {
  account={...account,...(Number.isFinite(options.deadline)?{requestDeadline:options.deadline}:{})};
  if(options.initialize!==false) {
    await request(account,'affairs_initialize_account',{rpc:true});
    await request(account,'dtm_initialize_account',{rpc:true});
  }
  const userId=account.user.id;
  const [profiles,students,terms,programs,courses,sections,announcements,tasks,requests,adminProfiles,adminStudents,adminEnrollments,adminDtmCourses,adminRequests,dtmCourses,dtmNotices,serviceRecords]=await Promise.all([
    request(account,'affairs_profiles',{query:own(userId,1)}),
    request(account,'affairs_students',{query:own(userId,1)}),
    request(account,'affairs_terms',{query:{select:'*',limit:30}}),
    request(account,'affairs_programs',{query:{select:'*',limit:100}}),
    request(account,'affairs_courses',{query:{select:'*',limit:200}}),
    request(account,'affairs_sections',{query:{select:'*',limit:300}}),
    request(account,'affairs_announcements',{query:{select:'*',order:'published_at.desc',limit:30}}),
    request(account,'affairs_tasks',{query:{...own(userId),order:'created_at.desc'}}),
    request(account,'affairs_service_requests',{query:{...own(userId),order:'created_at.desc'}}),
    includeAdmin?request(account,'affairs_profiles',{query:{select:'user_id,email,display_name,role,created_at',order:'created_at.desc',limit:100}}):Promise.resolve([]),
    includeAdmin?request(account,'affairs_students',{query:{select:'id,user_id,student_number,full_name',limit:100}}):Promise.resolve([]),
    includeAdmin?request(account,'affairs_enrollments',{query:{select:'id,student_id,section_id,status',limit:500}}):Promise.resolve([]),
    includeAdmin?request(account,'dtm_courses',{query:{select:'id,user_id,code,title,term',source_mode:'eq.sample',limit:500}}):Promise.resolve([]),
    includeAdmin?request(account,'affairs_service_requests',{query:{select:'id,user_id,request_type,title,details,status,created_at',order:'created_at.desc',limit:100}}):Promise.resolve([]),
    readAccountRows(account,'dtm_courses',{...own(userId),order:'created_at.desc,id.asc'}),
    request(account,'dtm_notices',{query:{select:'*',order:'published_at.desc',limit:30}}),
    readAccountRows(account,'affairs_service_records',{...own(userId),select:'*,affairs_service_requests(status)',order:'updated_at.desc,id.asc'}),
  ]);
  const profile=profiles[0];
  if (!profile || (includeAdmin && profile.role!=='admin')) throw new AffairsWorkspaceError('Administrator access is required.',403);
  const [scholarshipPeriods,scholarshipApplications,adminScholarshipApplications,studentAidRows,adminStudentAidRows,housingPeriods,housingApplications,housingAssignments,adminHousingApplications,adminHousingAssignments,creditLoadRows,adminCreditLoadRows,selectionRows,adminSelectionRows,nativeAcademic]=await Promise.all([
    readAccountRows(account,'affairs_scholarship_periods',{select:'*',...(includeAdmin?{}:{published:'eq.true'}),order:'opens_at.desc,id.asc'}),
    readAccountRows(account,'affairs_scholarship_applications',{...own(userId),order:'submitted_at.desc,id.asc'}),
    includeAdmin?readAccountRows(account,'affairs_scholarship_applications',{select:'*',order:'submitted_at.desc,id.asc'}):Promise.resolve([]),
    readAccountRows(account,'affairs_student_aid_records',{...own(userId),order:'academic_year.desc,semester.desc,id.asc'}),
    includeAdmin?readAccountRows(account,'affairs_student_aid_records',{select:'*',order:'academic_year.desc,semester.desc,id.asc'}):Promise.resolve([]),
    readAccountRows(account,'affairs_housing_periods',{select:'*',order:'opens_at.desc,id.asc'}),
    readAccountRows(account,'affairs_housing_applications',{...own(userId),order:'submitted_at.desc,id.asc'}),
    readAccountRows(account,'affairs_housing_assignments',{...own(userId),order:'period_id.asc,id.asc'}),
    includeAdmin?readAccountRows(account,'affairs_housing_applications',{select:'*',order:'submitted_at.desc,id.asc'}):Promise.resolve([]),
    includeAdmin?readAccountRows(account,'affairs_housing_assignments',{select:'*',order:'period_id.asc,id.asc'}):Promise.resolve([]),
    readAccountRows(account,'affairs_credit_load_history',{...own(userId),order:'academic_year.desc,semester.desc,id.asc'}),
    includeAdmin?readAccountRows(account,'affairs_credit_load_history',{select:'*',order:'academic_year.desc,semester.desc,id.asc'}):Promise.resolve([]),
    readAccountRows(account,'affairs_course_selection_records',{...own(userId),order:'academic_year.desc,semester.desc,selection_phase.asc,row_order.asc,id.asc'}),
    includeAdmin?readAccountRows(account,'affairs_course_selection_records',{select:'*',order:'academic_year.desc,semester.desc,selection_phase.asc,row_order.asc,id.asc'}):Promise.resolve([]),
    loadNativeAcademicRecords(userId,includeAdmin,(table,query)=>readAccountRows(account,table,query)),
  ]);
  // The generic manager lists its first 100 profiles. Scholarship history can contain
  // older applicants, so resolve every missing applicant rather than rendering anonymous rows.
  if (includeAdmin) {
    const known=new Set(adminProfiles.map(row=>row.user_id));
    const missing=[...new Set([...adminScholarshipApplications,...adminStudentAidRows,...adminHousingApplications,...adminHousingAssignments,...adminCreditLoadRows,...adminSelectionRows].map(row=>row.user_id).concat(nativeAcademic.adminUserIds).filter(id=>!known.has(id)))];
    for (let offset=0;offset<missing.length;offset+=100) {
      const applicants=await readAccountRows(account,'affairs_profiles',{
        select:'user_id,email,display_name,role,created_at',user_id:byIds(missing.slice(offset,offset+100)),order:'user_id.asc',
      });
      adminProfiles.push(...applicants);
    }
  }
  const student=students[0]||null;
  const enrollments=student?await request(account,'affairs_enrollments',{query:{select:'*',student_id:`eq.${student.id}`,limit:100}}):[];
  const enrollmentIds=enrollments.map(item=>item.id);
  const dtmRows = (table, order) => dtmCourses.length ? readAccountRows(account, table, {
    select:'*,dtm_courses!inner(user_id)', 'dtm_courses.user_id':`eq.${userId}`, order,
  }) : Promise.resolve([]);
  const [grades,attendance,charges,assignments,dtmMaterials,adminCharges,adminAssignments,dtmMeetings,dtmGrades]=await Promise.all([
    request(account,'affairs_grade_items',{query:{select:'*',enrollment_id:byIds(enrollmentIds),limit:200}}),
    request(account,'affairs_attendance',{query:{select:'*',enrollment_id:byIds(enrollmentIds),limit:200}}),
    student?readAccountRows(account,'affairs_charges',{select:'*',student_id:`eq.${student.id}`,order:'occurrence_on.desc.nullslast,id.asc'}):Promise.resolve([]),
    student?readAccountRows(account,'affairs_assignments',{select:'*',student_id:`eq.${student.id}`,order:'due_at.asc.nullslast,id.asc'}):Promise.resolve([]),
    dtmRows('dtm_materials','position.asc,id.asc'),
    includeAdmin?readAccountRows(account,'affairs_charges',{select:'*',order:'occurrence_on.desc.nullslast,id.asc'}):Promise.resolve([]),
    includeAdmin?request(account,'affairs_assignments',{query:{select:'*',source_mode:'eq.sample',limit:500}}):Promise.resolve([]),
    dtmRows('dtm_meetings','meeting_on.desc,starts_at.desc,id.asc'),
    dtmRows('dtm_grade_items','graded_on.desc.nullslast,id.asc'),
  ]);
  const courseById=new Map(courses.map(row=>[row.id,row]));
  const termById=new Map(terms.map(row=>[row.id,row]));
  const sectionById=new Map(sections.map(row=>[row.id,row]));
  return {
    checkedAt:new Date().toISOString(),source:'stu.best School Affairs',officialUniversityData:false,
    completeness:{...nativeAcademic.completeness,...Object.fromEntries([
      ['terms',terms,30],['programs',programs,100],['catalog',courses,200],['sections',sections,300],
      ['enrollments',enrollments,100],['grades',grades,200],['attendance',attendance,200],
      ['announcements',announcements,30],['dtmNotices',dtmNotices,30],['tasks',tasks,50],['requests',requests,50],
    ].map(([key,rows,cap])=>[key,{returned:rows.length,complete:rows.length<cap,cap}]))},
    ...nativeAcademic.own,
    scholarship:mapScholarshipRecords(scholarshipPeriods.filter(row=>row.published),scholarshipApplications),
    studentAid:mapStudentAidRecords(studentAidRows),
    creditLoadHistory:mapCreditLoadHistory(creditLoadRows),
    courseSelection:mapCourseSelection(selectionRows),
    housing:mapHousingRecords(housingPeriods.filter(row=>row.published || housingApplications.some(item=>item.period_id===row.id) || housingAssignments.some(item=>item.period_id===row.id)),housingApplications,housingAssignments),
    profile:{userId:profile.user_id,email:profile.email,displayName:profile.preferred_name || profile.display_name,role:profile.role},
    student:student?{id:student.id,studentNumber:student.student_number,fullName:student.full_name,yearLevel:student.year_level,status:student.status,sourceMode:student.source_mode,program:programs.find(row=>row.id===student.program_id)?.name||null}:null,
    courses:enrollments.map(enrollment=>{
      const section=sectionById.get(enrollment.section_id);const course=courseById.get(section?.course_id);const term=termById.get(section?.term_id);
      return {enrollmentId:enrollment.id,status:enrollment.status,sourceMode:enrollment.source_mode,
        code:course?.code||'',title:course?.title||'',credits:course?.credits||0,
        term:term?.label||'',termStartsOn:term?.starts_on||'',termEndsOn:term?.ends_on||'',instructor:section?.instructor||'',weekday:section?.weekday||null,
        startsAt:section?.starts_at||'',endsAt:section?.ends_at||'',room:section?.room||'',
        grades:grades.filter(row=>row.enrollment_id===enrollment.id && row.released_at).map(row=>({label:row.label,score:row.score,maximum:row.maximum,sourceMode:row.source_mode})),
        attendance:attendance.filter(row=>row.enrollment_id===enrollment.id).map(row=>({date:row.meeting_on,status:row.status,sourceMode:row.source_mode}))};
    }),
    charges:charges.map(row=>({id:row.id,label:row.label,amountDue:Number(row.amount_due),amountPaid:Number(row.amount_paid),currency:row.currency,dueOn:row.due_on,sourceMode:row.source_mode,occurrenceOn:row.occurrence_on??null,category:row.category??null,contactUnit:row.contact_unit??null,contactExtension:row.contact_extension??null,paymentUnit:row.payment_unit??null})),
    assignments:assignments.map(row=>({id:row.id,title:row.title,details:row.details,dueAt:row.due_at,status:row.status,submittedAt:row.submitted_at,sourceMode:row.source_mode,
      enrollmentId:row.enrollment_id,dtmCourseId:row.dtm_course_id,meetingId:row.meeting_id ?? null,
      origin:row.import_key?'moodle_calendar':row.source_mode==='personal'?'manual':'sample',
      course:row.enrollment_id
        ? courseById.get(sectionById.get(enrollments.find(item=>item.id===row.enrollment_id)?.section_id)?.course_id)?.code||'School Affairs'
        : dtmCourses.find(item=>item.id===row.dtm_course_id)?.code||'DTM',
    })),
    announcements:announcements.map(row=>({id:row.id,title:row.title,body:row.body,publishedAt:row.published_at,sourceMode:row.source_mode})),
    tasks:tasks.map(row=>({id:row.id,title:row.title,dueAt:row.due_at,completedAt:row.completed_at,sourceMode:row.source_mode})),
    requests:requests.map(row=>({id:row.id,type:row.request_type,title:row.title,details:row.details,status:row.status,createdAt:row.created_at})),
    serviceRecords:serviceRecords.map(row=>({
      id:row.id, serviceKey:row.service_key, recordType:row.record_type, title:row.title, notes:row.notes,
      status:row.status, startsOn:row.starts_on, endsOn:row.ends_on, leaveCategory:row.leave_category,
      periods:row.periods, updatedAt:row.updated_at, reviewStatus:row.affairs_service_requests?.status ?? null,
      contactPhone:row.contact_phone ?? null, leaveTimePeriod:row.leave_time_period ?? null,
    })),
    dtm:{
      sourceMode:dtmCourses.some(row=>row.source_mode==='personal')?'personal':'sample',
      courses:dtmCourses.map(row=>({
        id:row.id,code:row.code,title:row.title,term:row.term,role:row.role,sourceMode:row.source_mode,
        materials:dtmMaterials.filter(item=>item.course_id===row.id).map(item=>({
          id:item.id,title:item.title,kind:item.kind,summary:item.summary,position:item.position,
          sourceMode:item.source_mode,sourceUrl:item.source_url ?? null,
        })),
        meetings:dtmMeetings.filter(item=>item.course_id===row.id).map(item=>({
          id:item.id,date:item.meeting_on,startsAt:item.starts_at,title:item.title,attendance:item.attendance,notes:item.notes,
        })),
        grades:dtmGrades.filter(item=>item.course_id===row.id).map(item=>({
          id:item.id,label:item.label,score:Number(item.score),maximum:Number(item.maximum),date:item.graded_on,feedback:item.feedback,
        })),
      })),
      notices:dtmNotices.map(row=>({id:row.id,title:row.title,body:row.body,publishedAt:row.published_at,sourceMode:row.source_mode})),
    },
    ...(includeAdmin?{admin:{...nativeAcademic.admin,courseSelection:mapCourseSelection(adminSelectionRows),creditLoadHistory:mapCreditLoadHistory(adminCreditLoadRows),scholarship:mapScholarshipRecords(scholarshipPeriods,adminScholarshipApplications),studentAid:mapStudentAidRecords(adminStudentAidRows),housing:mapHousingRecords(housingPeriods,adminHousingApplications,adminHousingAssignments),profiles:adminProfiles,students:adminStudents,sections:sections.map(row=>({id:row.id,code:courseById.get(row.course_id)?.code||'',term:termById.get(row.term_id)?.label||''})),enrollments:adminEnrollments.map(row=>({id:row.id,studentId:row.student_id,status:row.status,code:courseById.get(sectionById.get(row.section_id)?.course_id)?.code||''})),dtmCourses:adminDtmCourses,charges:adminCharges,assignments:adminAssignments,requests:adminRequests}}:{}),
  };
}

export async function executeAffairsAction(account,kind,payload,requestId) {
  if (!payload || typeof payload!=='object' || Array.isArray(payload))
    throw new AffairsWorkspaceError('Unsupported School Affairs action.',400);
  const body={p_kind:kind,p_payload:payload};
  if (requestId !== undefined) {
    if (typeof requestId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))
      throw new AffairsWorkspaceError('Invalid action request identifier.',400);
    return request(account,'affairs_reviewed_action',{rpc:true,body:{...body,p_request_id:requestId}});
  }
  if (kind==='submit_housing_application') return request(account,'affairs_housing_action',{rpc:true,body});
  if (['apply_scholarship','cancel_scholarship'].includes(kind))
    return request(account,'affairs_scholarship_action',{rpc:true,body});
  if (['save_service_record','delete_service_record','submit_service_record_for_review'].includes(kind))
    return request(account,'affairs_manage_service_record',{rpc:true,body});
  if (/^(?:save|delete)_dtm_(?:course|meeting|assignment|grade|material)$/.test(kind) || kind==='import_dtm_deadlines')
    return request(account,'dtm_manage_record',{rpc:true,body});
  if (['create_task','complete_task','create_service_request','publish_announcement','resolve_service_request'].includes(kind))
    return request(account,'affairs_execute_action',{rpc:true,body});
  throw new AffairsWorkspaceError('Unsupported School Affairs action.',400);
}

export async function manageAffairsRecord(account,kind,payload) {
  if (['save_academic_grade_record','save_academic_term_summary','save_academic_ranking','save_academic_metadata'].includes(kind) && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_manage_academic_grades',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (kind==='save_graduation_review' && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_manage_graduation_review',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (['save_academic_attendance_statistic','save_academic_attendance_detail','save_academic_attendance_metadata'].includes(kind) && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_manage_academic_attendance',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (kind==='save_course_selection' && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_manage_course_selection',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (kind==='save_credit_load_history' && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_manage_credit_load_history',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (['save_housing_period','save_housing_assignment'].includes(kind) && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_housing_action',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (kind==='save_student_aid_record' && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_manage_student_aid_record',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (['save_scholarship_period','review_scholarship_application'].includes(kind)
    && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_scholarship_action',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (!['save_enrollment','save_charge','delete_charge','save_assignment','delete_assignment'].includes(kind)
    || !payload || typeof payload!=='object' || Array.isArray(payload))
    throw new AffairsWorkspaceError('Unsupported manager action.',400);
  return request(account,'affairs_manage_record',{rpc:true,body:{p_kind:kind,p_payload:payload}});
}

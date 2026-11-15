import { affairsClient } from '@/features/public/affairs/authClient';
import type { ScholarshipRecords } from './scholarship';
import type { StudentAidRecords } from './studentAid';
import type { HousingRecords } from './housing';
import type { PendingFeeMetadata } from './pendingFees';
import type { CreditLoadHistoryRecords } from './creditLoadHistory';
import type { CourseSelectionRecords } from './courseSelection';
import type { AcademicGradesRecords } from './academicGrades';
import type { GraduationReviewRecords } from './graduationReview';
import type { AcademicAttendanceRecords } from './academicAttendance';

export type AffairsAction = {kind:'create_task'|'complete_task'|'create_service_request'|'publish_announcement'|'resolve_service_request'|'update_display_name'|'set_assignment_status';payload:Record<string,string>;requestId?:string};
export type AffairsManagerAction = {kind:'save_enrollment'|'save_charge'|'delete_charge'|'save_assignment'|'delete_assignment'|'save_scholarship_period'|'review_scholarship_application'|'save_student_aid_record'|'save_housing_period'|'save_housing_assignment'|'save_credit_load_history'|'save_course_selection'|'save_academic_grade_record'|'save_academic_term_summary'|'save_academic_ranking'|'save_academic_metadata'|'save_graduation_review'|'save_academic_attendance_statistic'|'save_academic_attendance_detail'|'save_academic_attendance_metadata';payload:Record<string,unknown>};
export type ServiceRecord = {
  id:string;serviceKey:string;recordType:'leave'|'contract'|'self_assessment'|'company'|'note';
  title:string;notes:string;status:'draft'|'filed'|'withdrawn';startsOn:string|null;endsOn:string|null;
  leaveCategory:string|null;periods:string|null;updatedAt:string;reviewStatus:'open'|'in_review'|'resolved'|null;
  contactPhone?:string|null;leaveTimePeriod?:string|null;
};
export type DtmMeeting = {id:string;date:string;startsAt:string;title:string;attendance:'unknown'|'present'|'late'|'absent'|'excused';notes:string};
export type DtmGrade = {id:string;label:string;score:number;maximum:number;date:string|null;feedback:string};
export type DtmMaterial = {id:string;title:string;kind:string;summary:string;position:number;sourceMode:string;sourceUrl?:string|null;targetUrl?:string|null};
export type DtmCourse = {
  id:string;code:string;title:string;term:string;role:string;sourceMode:string;
  materials:DtmMaterial[];meetings?:DtmMeeting[];grades?:DtmGrade[];
};
export type DtmAssignment = {
  id:string;title:string;details:string;dueAt:string|null;status:'open'|'submitted'|'graded';submittedAt:string|null;
  sourceMode:string;enrollmentId:string|null;dtmCourseId:string|null;course:string;
  meetingId?:string|null;origin?:'sample'|'manual'|'moodle_calendar';
};
export type DtmRecordKind = 'course'|'meeting'|'grade'|'material'|'assignment';
export type DeadlineImport = {title:string;due_at:string;import_key:string};
type PersonalAction =
  | {kind:'apply_scholarship'|'cancel_scholarship'|'submit_housing_application';payload:Record<string,string>}
  | {kind:'save_service_record'|'delete_service_record'|'submit_service_record_for_review'|`save_dtm_${DtmRecordKind}`|`delete_dtm_${DtmRecordKind}`;payload:Record<string,string>}
  | {kind:'import_dtm_deadlines';payload:{course_id:string;events:DeadlineImport[]}};
export type AffairsSnapshot = {
  checkedAt:string;officialUniversityData:false;
  profile:{userId:string;email:string;displayName:string;role:'student'|'admin'};
  student:{id:string;studentNumber:string;fullName:string;yearLevel:number;status:string;sourceMode:string;program:string|null}|null;
  courses:Array<{enrollmentId:string;status:string;sourceMode:string;code:string;title:string;credits:number;term:string;termStartsOn:string;termEndsOn:string;instructor:string;weekday:number|null;startsAt:string;endsAt:string;room:string;grades:Array<{label:string;score:number;maximum:number;sourceMode:string}>;attendance:Array<{date:string;status:string;sourceMode:string}>}>;
  charges:Array<Partial<PendingFeeMetadata>&{id:string;label:string;amountDue:number;amountPaid:number;currency:string;dueOn:string|null;sourceMode:string}>;
  assignments:DtmAssignment[];
  announcements:Array<{id:string;title:string;body:string;publishedAt:string;sourceMode:string}>;
  tasks:Array<{id:string;title:string;dueAt:string|null;completedAt:string|null;sourceMode:string}>;
  requests:Array<{id:string;type:string;title:string;details:string;status:string;createdAt:string}>;
  serviceRecords?:ServiceRecord[];
  scholarship?:ScholarshipRecords;
  studentAid?:StudentAidRecords;
  housing?:HousingRecords;
  creditLoadHistory?:CreditLoadHistoryRecords;
  courseSelection?:CourseSelectionRecords;
  academicGrades?:AcademicGradesRecords;
  graduationReview?:GraduationReviewRecords;
  academicAttendance?:AcademicAttendanceRecords;
  dtm:{sourceMode:'sample'|'personal';courses:DtmCourse[];notices:Array<{id:string;title:string;body:string;publishedAt:string;sourceMode:string}>};
  admin?:{academicGrades?:AcademicGradesRecords;graduationReview?:GraduationReviewRecords;academicAttendance?:AcademicAttendanceRecords;courseSelection?:CourseSelectionRecords;creditLoadHistory?:CreditLoadHistoryRecords;scholarship?:ScholarshipRecords;studentAid?:StudentAidRecords;housing?:HousingRecords;profiles:Array<{user_id:string;email:string;display_name:string;role:string;created_at:string}>;students:Array<{id:string;user_id:string;student_number:string;full_name:string}>;sections:Array<{id:string;code:string;term:string}>;enrollments:Array<{id:string;studentId:string;status:string;code:string}>;dtmCourses:Array<{id:string;user_id:string;code:string;title:string;term:string}>;charges:Array<{id:string;student_id:string;label:string;amount_due:number;amount_paid:number;legacy_amount_paid?:number|null;due_on:string|null;occurrence_on?:string|null;category?:string|null;contact_unit?:string|null;contact_extension?:string|null;payment_unit?:string|null}>;assignments:Array<{id:string;student_id:string;enrollment_id:string|null;dtm_course_id:string|null;title:string;details:string;due_at:string|null;status:string}>;requests:Array<{id:string;user_id:string;request_type:string;title:string;details:string;status:string;created_at:string}>};
};

async function token(expectedUserId?:string) {
  if(expectedUserId!==undefined&&(typeof expectedUserId!=='string'||!expectedUserId.trim()))throw new Error('Your account changed. Reload the workspace.');
  if (!affairsClient) throw new Error('School Affairs sign-in is unavailable.');
  const {data,error}=await affairsClient.auth.getSession();
  if (error || !data.session) throw new Error('Sign in to School Affairs again.');
  if(expectedUserId!==undefined&&data.session.user.id!==expectedUserId)throw new Error('Your account changed. Reload the workspace.');
  return data.session.access_token;
}
async function call<T>(path:string,init?:RequestInit,expectedUserId?:string):Promise<T> {
  init?.signal?.throwIfAborted();
  const accessToken=await token(expectedUserId);
  init?.signal?.throwIfAborted();
  const response=await fetch(path,{...init,headers:{Authorization:`Bearer ${accessToken}`,...init?.headers}});
  const payload=await response.json().catch(()=>null);
  init?.signal?.throwIfAborted();
  if (!response.ok || !payload) throw new Error(typeof payload?.error==='string'?payload.error:'School Affairs is temporarily unavailable.');
  return payload as T;
}
export function loadSchoolAffairsData(admin=false,signal?:AbortSignal) { return call<AffairsSnapshot>(`/api/affairs-data${admin?'?scope=admin':''}`,{signal}); }
export function performSchoolAffairsAction(action:AffairsAction,options?:Parameters<typeof savePersonalSchoolRecord>[1]) {
  return call<{id:string;kind:string;summary:string}>('/api/affairs-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action),signal:options?.signal},options?.expectedUserId);
}
export function manageSchoolAffairsRecord(action:AffairsManagerAction,options?:Parameters<typeof savePersonalSchoolRecord>[1]) {
  return call<{id:string;kind:string;summary:string}>('/api/affairs-manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action),signal:options?.signal},options?.expectedUserId);
}
export function savePersonalSchoolRecord(action:PersonalAction,options?:{expectedUserId:string;signal?:AbortSignal}) {
  const signal=options?.signal?AbortSignal.any([options.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000);
  return call<{id:string;kind:string;imported?:number}>('/api/affairs-action',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action),signal,
  },options?.expectedUserId);
}

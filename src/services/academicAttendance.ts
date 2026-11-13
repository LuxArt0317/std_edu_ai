export type AcademicAttendanceBase={id:string;userId:string;sourceMode:'local_demo';version:number;createdAt:string;updatedAt:string};
export type AcademicAttendanceTerm={academicYear:number;semester:1|2|3;rowOrder:number};
export type AcademicAttendanceStatistic=AcademicAttendanceBase&AcademicAttendanceTerm&{
  studentNumber:string|null;studentName:string|null;courseCode:string;courseTitle:string;
  totalTeachingHours:number|null;currentTeachingWeeks:number|null;currentTeachingHours:number|null;
  absenceHours:number|null;unexcusedAbsenceHours:number|null;
};
export type AcademicAttendanceDetail=AcademicAttendanceBase&AcademicAttendanceTerm&{
  courseCode:string;courseTitle:string;teacherName:string|null;absenceTypeText:string|null;
  courseDate:string|null;periodText:string|null;rollCalledAt:string|null;
};
export type AcademicAttendanceMetadata=AcademicAttendanceBase&{currentAcademicYear:number|null;currentSemester:1|2|3|null};
export type AcademicAttendanceRecords={statistics:AcademicAttendanceStatistic[];details:AcademicAttendanceDetail[];metadata:AcademicAttendanceMetadata[]};
export type AcademicAttendanceView='statistics'|'detail';
export const academicAttendancePaths={statistics:'/school-affairs/services/14-1',detail:'/school-affairs/services/14-1/detail'} as const;
export const academicAttendanceTitles={statistics:'學生缺曠課統計查詢(當學期)',detail:'學生缺曠課明細查詢(當學期)'} as const;
export const academicAttendanceStatisticColumns=['學號','姓名','課號','課程名稱','本學期授課總時數','目前授課總週次','目前授課總時數','目前缺課時數','目前曠課時數'] as const;
export const academicAttendanceDetailColumns=['課號','課程名稱','授課老師','類別','課程日期','節次','點名時間'] as const;
// Text captured on 2026-11-13. It is explanatory source content, never a rule
// for deriving a stored value, modifying local leave or deciding consequences.
export const academicAttendanceNotes={
  statistics:['本校學則第二十七條第三項規定：一學期曠課時數逾全學期授課時數三分之二，經系務及院務會議決議退學者。','當學期授課總週次為 18 週，上述所顯示的為學生目前授課總週次之缺課、曠課時數。'],
  detail:['缺課: 老師點名未到，但學生已完成請假作業。','曠課: 老師點名未到，且未完成請假作業。'],
} as const;
export function ownAcademicAttendance(data:AcademicAttendanceRecords|null|undefined,userId:string):AcademicAttendanceRecords {
  return {statistics:userId?data?.statistics.filter(row=>row.userId===userId)??[]:[],details:userId?data?.details.filter(row=>row.userId===userId)??[]:[],metadata:userId?data?.metadata.filter(row=>row.userId===userId)??[]:[]};
}
export function currentAcademicAttendance(data:AcademicAttendanceRecords|null|undefined,userId:string){
  const own=ownAcademicAttendance(data,userId),metadata=own.metadata[0];
  const term=metadata&&metadata.currentAcademicYear!==null&&metadata.currentSemester!==null?{academicYear:metadata.currentAcademicYear,semester:metadata.currentSemester}:null;
  const order=(left:AcademicAttendanceTerm&{id:string},right:AcademicAttendanceTerm&{id:string})=>left.rowOrder-right.rowOrder||left.id.localeCompare(right.id);
  return {term,statistics:term?own.statistics.filter(row=>row.academicYear===term.academicYear&&row.semester===term.semester).sort(order):[],details:term?own.details.filter(row=>row.academicYear===term.academicYear&&row.semester===term.semester).sort(order):[]};
}
export function academicAttendanceCourseDate(value:string|null|undefined):string {
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '—';
  const date=new Date(value+'T00:00:00Z');return Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value?'—':value.replaceAll('-','/');
}
const rollCallFormat=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h12'});
export function academicAttendanceRollCall(value:string|null|undefined):string {
  if(!value)return '—';const date=new Date(value);if(Number.isNaN(date.getTime()))return '—';
  const parts=Object.fromEntries(rollCallFormat.formatToParts(date).map(part=>[part.type,part.value]));
  return `${parts.year}/${parts.month}/${parts.day} ${parts.dayPeriod} ${parts.hour}:${parts.minute}:${parts.second}`;
}
export function academicAttendanceTimestamp(value:string|null|undefined):string {
  if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date).replaceAll('-','/');
}

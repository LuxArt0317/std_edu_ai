export type StudentAidRecord={
  id:string;userId:string;applicantLabel:string;studentName:string;maskedIdentityNumber:string|null;
  departmentName:string|null;phone:string|null;applicationKind:string;relativeCount:number|null;
  subsidyAmount:number|null;studentRecordLocked:boolean|null;schoolReviewStatus:string|null;ministryReviewStatus:string|null;
  academicYear:number;semester:number;sourceMode:'local_demo';version:number;updatedAt:string;
};
export type StudentAidRecords={records:StudentAidRecord[]};
export type StudentAidProfile={user_id:string;display_name:string;email:string};
export type StudentAidSaveAction={kind:'save_student_aid_record';payload:Record<string,string>};
export function studentAidApplicantLabel(profile:StudentAidProfile) {
  const identity=profile.email || profile.user_id;
  return profile.display_name && profile.display_name!==identity?`${profile.display_name} (${identity})`:identity;
}
export function isMaskedStudentAidIdentity(value:string) {
  const text=value.trim();
  return !text || text.length>=3 && text.length<=24 && /^[A-Za-z0-9*•● -]+$/u.test(text) && /[*•●]{3,}/u.test(text)
    && text.replace(/[^A-Za-z0-9]/g,'').length<=4;
}
export function studentAidTimestamp(value:string) {
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('sv-SE',{
    timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,
  }).format(date).replaceAll('-','/');
}

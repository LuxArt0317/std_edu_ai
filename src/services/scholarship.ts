export type ScholarshipPeriod = {
  id:string;termLabel:string;opensAt:string;closesAt:string;published:boolean;
  instructions:string;sourceMode:'local_demo';version:number;
};
export type ScholarshipApplication = {
  id:string;periodId:string;userId:string;status:'pending'|'approved'|'rejected'|'cancelled';
  awardAmount:number|null;requiredHours:number|null;actualHours:number|null;reviewNote:string;
  submittedAt:string;reviewedAt:string|null;cancelledAt:string|null;version:number;
};
export type ScholarshipRecords = {periods:ScholarshipPeriod[];applications:ScholarshipApplication[]};
export const scholarshipStatusLabels = {pending:'待審核',approved:'審核通過',rejected:'審核未通過',cancelled:'已取消申請'};
export function scholarshipApplicantLabel(profile:{user_id:string;display_name:string;email:string}) {
  const identity=profile.email || profile.user_id;
  return profile.display_name && profile.display_name!==identity?`${profile.display_name} (${identity})`:identity;
}
export function scholarshipPeriodState(period:ScholarshipPeriod,now=Date.now()):'open'|'upcoming'|'closed'|'draft' {
  if (!period.published) return 'draft';
  if (now < Date.parse(period.opensAt)) return 'upcoming';
  return now < Date.parse(period.closesAt) ? 'open' : 'closed';
}
export function scholarshipDate(iso:string) {
  return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
}

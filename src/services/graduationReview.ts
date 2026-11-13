export type GraduationStatusIndicator='passed'|'attention'|null;
export const graduationReviewKinds=['academic_services','legacy'] as const;
export type GraduationReviewKind=typeof graduationReviewKinds[number];
export function isGraduationReviewKind(value:unknown):value is GraduationReviewKind {
  return value==='academic_services'||value==='legacy';
}
export type GraduationStatusValue={text:string|null;indicator:GraduationStatusIndicator};
export type GraduationReviewIdentity={
  studentNumber:string|null;studentName:string|null;departmentName:string|null;yearText:string|null;
  enrollmentStatusText:string|null;curriculumCohortText:string|null;doubleMajorText:string|null;minorText:string|null;
};
export type GraduationActualCourse={
  id:string;sequenceText:string|null;title:string;credits:number|null;requiredElectiveText:string|null;yearText:string|null;transferText:string|null;
};
export type GraduationRequirement={
  id:string;sequenceText:string|null;title:string;moduleText:string|null;credits:number|null;requiredElectiveText:string|null;
  yearText:string|null;transferText:string|null;indicator:GraduationStatusIndicator;matchedCourses:GraduationActualCourse[];
};
export type GraduationLanguageRequirement={id:string;label:string;status:GraduationStatusValue;requiredCredits:number|null;matchedCredits:number|null;missingCredits:number|null};
export type GraduationRequirementCategory={
  id:string;label:string;requiredElectiveText:string|null;requiredCredits:number|null;completedCredits:number|null;matchedCredits:number|null;excludedCredits:number|null;
  status:GraduationStatusValue;requirements:GraduationRequirement[];detailSubtotalCredits:number|null;
};
export type GraduationReviewContent={
  reportedAt:string|null;identity:GraduationReviewIdentity;
  educationProgram:GraduationStatusValue;foreignLanguageCompletion:GraduationStatusValue;englishRequirement:GraduationStatusValue;
  graduationReview:GraduationStatusValue&{note:string|null};
  languageRequirements:GraduationLanguageRequirement[];categories:GraduationRequirementCategory[];otherCourses:GraduationActualCourse[];
};
export type GraduationReviewReport=GraduationReviewContent&{
  id:string;userId:string;reportKind:GraduationReviewKind;sourceMode:'local_demo';version:number;createdAt:string;updatedAt:string;
};
export type GraduationReviewRecords={reports:GraduationReviewReport[]};
export const graduationReviewPaths={academic_services:'/school-affairs/services/13-1/graduation',legacy:'/school-affairs/services/15-2'} as const;
export const graduationReviewPath=graduationReviewPaths.academic_services;
export const graduationLanguageColumns=['課程類別','是否通過','應修學分','符合學分','尚缺學分'] as const;
export const graduationCategoryColumns=['編程名稱','必選修','應修學分','已修學分','符合學分','不計入此類學分','通過'] as const;
// The nested source table uses 扺免; the separate actual-course table uses 抵免.
export const graduationRequirementColumns=['#','應修習課程','模組','學分','必選修','年級','扺免'] as const;
export const graduationOtherCourseColumns=['#','實際修習課程','學分','必選修','年級','抵免'] as const;
export const graduationReviewNotes=[
  '此檢核表僅提供您做為畢業資格審核參考，是否符合畢業資格仍以實際規定之畢業條件為準。',
  '檢核時除檢查各應修課程是否有對應到實際已修課程，且應注意符合學分是否與應修學分相同。（修習替代課程以及曾辦理免修者請特別留意）',
  '若有任何檢核之問題，請於開學一週內至系上或教務處(分機：2009、2010、2012、2016)詢問，以免影響自身之權益。',
] as const;
export function ownGraduationReview(data:GraduationReviewRecords|null|undefined,userId:string,reportKind:GraduationReviewKind='academic_services'):GraduationReviewReport|null {
  if(typeof userId!=='string'||!userId.trim()||!isGraduationReviewKind(reportKind))return null;
  const reports=data?.reports.filter(report=>Object.hasOwn(report,'userId')&&report.userId===userId&&report.reportKind===reportKind)??[];
  return reports.length===1?reports[0]:null;
}
export function graduationDetailIds(report:GraduationReviewReport|null):string[] {
  return report?.categories.filter(category=>category.requirements.length>0||category.detailSubtotalCredits!==null).map(category=>category.id)??[];
}
export function graduationReviewTimestamp(value:string|null|undefined):string {
  if(!value)return '—';const date=new Date(value);
  return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date).replaceAll('-','/');
}

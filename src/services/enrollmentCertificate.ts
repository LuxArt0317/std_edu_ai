/** Unmounted 17-1 contract. Assessments are stored values, never fee-derived UI decisions. */
export type EnrollmentCertificateAssessment={
  id:string;userId:string;sourceMode:'local_demo';version:number;createdAt:string;updatedAt:string;
  academicYear:number|null;semester:1|2|3|null;hasPendingFees:'Y'|'N'|null;
  status:'unknown'|'blocked'|'local_eligible';resultText:string|null;assessedAt:string|null;
  identity:{studentNumber:string|null;studentName:string|null;departmentName:string|null;yearText:string|null;classLabel:string|null};
};
/** No URL or bearer capability belongs in an account snapshot. The host reauthorizes this ID on open. */
export type EnrollmentCertificateLocalDocument={
  id:string;userId:string;assessmentId:string;assessmentVersion:number;
  issuer:'stu.best';purpose:'local_enrollment_reference';sourceMode:'local_demo';
  status:'available'|'revoked';verifiedAt:string|null;expiresAt:string|null;
};
export type EnrollmentCertificateRecords={assessments:EnrollmentCertificateAssessment[];documents:EnrollmentCertificateLocalDocument[]};
export type EnrollmentCertificateSnapshot={profile:{userId:string};checkedAt:string;enrollmentCertificate?:EnrollmentCertificateRecords};
export type EnrollmentCertificateDocumentRequest={documentId:string;assessmentId:string;expectedAssessmentVersion:number};
export const enrollmentCertificatePath='/school-affairs/services/17-1';
export const enrollmentCertificateColumns=['目前學年度','目前學期','是否有待繳費用','在學證明'] as const;
// Generic text captured 2026-11-13. It describes the source service, not rules
// for issuing a stu.best document or determining a caller's eligibility.
export const enrollmentCertificateSourceNotes=[
  '限申請「當學期」在學證明。(第 1 學期申請日為8/1~1/31；第 2 學期申請日為2/1~7/31)',
  '「是否有待繳費用」欄位值須為「N」，方能產出在學證明；若為「Y」代表繳費未成功、尚欠餘額或全額未繳，則無法產出在學證明，請持繳費收據至總務處出納組確認。',
  '如需紙本，請自行使用A4紙張、彩色列印。',
  '在學證明為「正式文件」，經查證擅自偽造或修改文件，將依本校學生獎懲辦法議處。',
] as const;

const own=(row:{userId:string},userId:string)=>row&&Object.hasOwn(row,'userId')&&row.userId===userId;
export function ownEnrollmentCertificate(data:EnrollmentCertificateRecords|null|undefined,userId:string){
  const rows=typeof userId==='string'&&userId.trim()&&Array.isArray(data?.assessments)
    ?data.assessments.filter(row=>own(row,userId)&&row.sourceMode==='local_demo'):[];
  // The future backend exposes one current assessment per owner. Do not guess
  // which duplicate is current by sorting timestamps or choosing the latest.
  return {assessment:rows.length===1?rows[0]:null,ambiguous:rows.length>1};
}
function instant(value:string|null|undefined):number|null {
  if(typeof value!=='string')return null;
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/);
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  if(year===0||month<1||month>12||day<1||day>days[month-1])return null;
  const time=Date.parse(value);return Number.isFinite(time)?time:null;
}
export function enrollmentCertificateTimestamp(value:string|null|undefined):string {
  const time=instant(value);return time===null?'—':new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(time).replaceAll('-','/');
}
/** A display guard, not authorization or proof of a stored file. The download endpoint must check again. */
export function verifiedEnrollmentCertificateDocument(data:EnrollmentCertificateRecords|null|undefined,userId:string,now=Date.now()):EnrollmentCertificateLocalDocument|null {
  const {assessment}=ownEnrollmentCertificate(data,userId);
  if(!assessment||assessment.status!=='local_eligible'||!Number.isInteger(assessment.version)||assessment.version<1||!Number.isFinite(now))return null;
  const linked=Array.isArray(data?.documents)?data.documents.filter(row=>own(row,userId)&&row.assessmentId===assessment.id&&row.assessmentVersion===assessment.version&&row.status==='available'):[];
  if(linked.length!==1)return null;
  const document=linked[0],verified=instant(document.verifiedAt),expires=instant(document.expiresAt);
  if(typeof document.id!=='string'||!document.id.trim()||document.issuer!=='stu.best'||document.purpose!=='local_enrollment_reference'||document.sourceMode!=='local_demo'
    ||verified===null||verified>now||document.expiresAt!==null&&(expires===null||expires<=now||expires<=verified))return null;
  return document;
}
export function enrollmentCertificateResult(assessment:EnrollmentCertificateAssessment):string {
  return assessment.resultText??({unknown:'尚未完成站內條件確認',blocked:'目前無法提供站內文件',local_eligible:'站內條件已確認'}[assessment.status]);
}

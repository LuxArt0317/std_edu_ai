import {validateEnrollmentCertificatePayload} from '../../server/enrollmentCertificate.js';
import type {EnrollmentCertificateAssessment} from './enrollmentCertificate';
import type {EnrollmentCertificateAdminRecords} from '../../server/enrollmentCertificate.js';

export type CertificateAssessmentInput={
  id:string;user_id:string;request_id:string;expected_version:number;
  academic_year:number|null;semester:1|2|3|null;has_pending_fees:'Y'|'N'|null;
  status:'unknown'|'blocked';result_text:string|null;assessed_at:string|null;
  student_number:string|null;student_name:string|null;department_name:string|null;year_text:string|null;class_label:string|null;
};
export type CertificateAssessmentReceipt={id:string;kind:'save_enrollment_certificate_assessment';version:number;summary:string};
export interface CertificateRecordClient{
  load(userId:string,signal:AbortSignal):Promise<EnrollmentCertificateAdminRecords>;
  save(payload:CertificateAssessmentInput,signal:AbortSignal):Promise<CertificateAssessmentReceipt>;
}
export class CertificateRecordError extends Error{
  status:number;constructor(message:string,status=503){super(message);this.name='CertificateRecordError';this.status=status;}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const validCertificateAccount=(id:string)=>uuid.test(id);
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const id=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value);
const version=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value<=999999999;
function requireValue(value:unknown):asserts value{if(!value)throw new CertificateRecordError('Certificate records could not be verified. Refresh before editing.');}
export function certificateAssessmentFields(row:EnrollmentCertificateAssessment){return {
  academic_year:row.academicYear,semester:row.semester,has_pending_fees:row.hasPendingFees,status:row.status,result_text:row.resultText,assessed_at:row.assessedAt,
  student_number:row.identity.studentNumber,student_name:row.identity.studentName,department_name:row.identity.departmentName,year_text:row.identity.yearText,class_label:row.identity.classLabel,
};}
/** The complete selected-account response is validated before any editor is shown.
 * Document capabilities and cross-account metadata are deliberately rejected. */
export function parseCertificateAdminRecords(value:unknown,userId:string):EnrollmentCertificateAdminRecords{
  requireValue(id(userId)&&object(value)&&exact(value,['assessments','documents','documentMetadata'])&&Array.isArray(value.assessments)&&value.assessments.length<=1&&Array.isArray(value.documents)&&value.documents.length===0&&Array.isArray(value.documentMetadata)&&value.documentMetadata.length<=10000);
  const envelope=['id','userId','sourceMode','version','createdAt','updatedAt'];
  const safeStamp=(stamp:unknown)=>typeof stamp==='string'&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(stamp)&&Number.isFinite(Date.parse(stamp));
  const validEnvelope=(row:Record<string,unknown>)=>id(row.id)&&row.userId===userId&&row.sourceMode==='local_demo'&&version(row.version)&&safeStamp(row.createdAt)&&safeStamp(row.updatedAt);
  for(const row of value.assessments){
    requireValue(object(row)&&exact(row,[...envelope,'academicYear','semester','hasPendingFees','status','resultText','assessedAt','identity'])&&validEnvelope(row)&&object(row.identity)&&exact(row.identity,['studentNumber','studentName','departmentName','yearText','classLabel']));
    const input={id:row.id,user_id:userId,request_id:row.id,expected_version:0,...certificateAssessmentFields(row as EnrollmentCertificateAssessment)};
    requireValue(validateEnrollmentCertificatePayload('save_enrollment_certificate_assessment',input)===null);
    for(const stamp of [row.createdAt,row.updatedAt])requireValue(validateEnrollmentCertificatePayload('save_enrollment_certificate_assessment',{...input,assessed_at:stamp})===null);
  }
  const seen=new Set<string>();
  for(const row of value.documentMetadata){
    requireValue(object(row)&&exact(row,[...envelope,'assessmentId','assessmentVersion','issuer','purpose','status','verifiedAt','expiresAt'])&&validEnvelope(row)&&!seen.has(row.id as string));
    const input={id:row.id,user_id:userId,request_id:row.id,expected_version:0,assessment_id:row.assessmentId,assessment_version:row.assessmentVersion,
      issuer:row.issuer,purpose:row.purpose,status:row.status,verified_at:row.verifiedAt,expires_at:row.expiresAt};
    requireValue(validateEnrollmentCertificatePayload('save_enrollment_certificate_document',input)===null);
    for(const stamp of [row.createdAt,row.updatedAt])requireValue(validateEnrollmentCertificatePayload('save_enrollment_certificate_document',{...input,expires_at:stamp})===null);
    seen.add(row.id as string);
  }
  return structuredClone(value) as EnrollmentCertificateAdminRecords;
}
type Dependencies={fetch?:typeof fetch;getSession?:()=>Promise<{userId:string;accessToken:string}|null>};
export function createCertificateRecordClient(managerId:string,dependencies:Dependencies={}):CertificateRecordClient{
  const getSession=dependencies.getSession??(async()=>{
    const {affairsClient}=await import('../features/public/affairs/authClient');
    const response=await affairsClient?.auth.getSession(),session=response?.data.session;
    return response?.error||!session?null:{userId:session.user.id,accessToken:session.access_token};
  });
  async function request(path:string,signal:AbortSignal,body?:unknown):Promise<unknown>{
    signal.throwIfAborted();let session:Awaited<ReturnType<typeof getSession>>;
    try{session=await getSession();}catch{signal.throwIfAborted();throw new CertificateRecordError('Sign in again before managing certificate records.',401);}
    signal.throwIfAborted();
    if(!id(managerId)||session?.userId!==managerId||!session.accessToken)throw new CertificateRecordError('Sign in again before managing certificate records.',401);
    let response:Response;
    try{response=await(dependencies.fetch??fetch)(path,{method:body===undefined?'GET':'POST',credentials:'omit',cache:'no-store',redirect:'error',
      headers:{Authorization:'Bearer '+session.accessToken,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});}
    catch{signal.throwIfAborted();throw new CertificateRecordError('Certificate operation was not confirmed. Keep the draft and retry.');}
    signal.throwIfAborted();
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw new CertificateRecordError(response.status===409?'The saved assessment changed. Refresh before saving; your draft is retained.':
      [401,403].includes(response.status)?'This account cannot manage these certificate records.':'Certificate operation was not confirmed. Keep the draft and retry.',response.status);}
    try{const value:unknown=await response.json();signal.throwIfAborted();return value;}catch{signal.throwIfAborted();throw new CertificateRecordError('Certificate response could not be verified. Keep the draft and retry.');}
  }
  return {
    async load(userId,signal){requireValue(id(userId));return parseCertificateAdminRecords(await request('/api/affairs-data?scope=enrollment-certificate-admin&user_id='+userId,signal),userId);},
    async save(payload,signal){
      const kind='save_enrollment_certificate_assessment';
      const invalid=validateEnrollmentCertificatePayload(kind,payload);
      if(invalid||!['unknown','blocked'].includes(payload.status))throw new CertificateRecordError(invalid??'Choose an editable local assessment status.',400);
      const row=await request('/api/affairs-manage',signal,{kind,payload});
      requireValue(object(row)&&exact(row,['id','kind','version','summary'])&&row.id===payload.id&&row.kind===kind&&row.version===payload.expected_version+1&&typeof row.summary==='string');
      return {id:payload.id,kind,version:row.version as number,summary:row.summary};
    },
  };
}

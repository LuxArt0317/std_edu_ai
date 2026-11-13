import { AffairsWorkspaceError, manageAffairsRecord, verifyAffairsToken } from '../server/affairsWorkspace.js';
import { manageCourseCatalog } from '../server/courseCatalog.js';
import { DtmSubmissionError, manageDtmSubmissionReview } from '../server/dtmSubmissions.js';
import { EnrollmentCertificateError, manageEnrollmentCertificateRecord } from '../server/enrollmentCertificate.js';
import { SyllabusSearchError, manageSyllabusMetadata } from '../server/syllabusSearch.js';
import { TuitionDocumentsError, tuitionDocumentKinds, tuitionDocumentMaxPayloadBytes, manageTuitionDocumentRecord } from '../server/tuitionDocuments.js';
import { StudentConductError, studentConductKinds, studentConductMaxPayloadBytes, manageStudentConductRecord } from '../server/studentConduct.js';
import { StudentLoanError, studentLoanKinds, studentLoanMaxPayloadBytes, manageStudentLoanRecord } from '../server/studentLoan.js';
import { DormitoryConductError, dormitoryConductKinds, dormitoryConductMaxPayloadBytes, manageDormitoryConductRecord } from '../server/dormitoryConduct.js';
import { DtmGradeReportError, dtmGradeReportKinds, dtmGradeReportMaxPayloadBytes, manageDtmGradeReport } from '../server/dtmGradeReport.js';

type Request = {method?:string;headers:Record<string,string|string[]|undefined>;body?:unknown};
type Response = {status:(code:number)=>Response;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
export default async function handler(request:Request,response:Response) {
  const requestDeadline=Date.now()+17000;
  response.setHeader('Cache-Control','no-store, max-age=0');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='POST'){response.setHeader('Allow','POST');response.status(405).json({error:'Method not allowed'});return;}
  let body:unknown=request.body;
  if(typeof body==='string'){try{body=JSON.parse(body);}catch{body=null;}}
  const input=body&&typeof body==='object'&&!Array.isArray(body)?body as Record<string,unknown>:null;
  const catalogAction=input?.kind==='save_course_offering'||input?.kind==='delete_course_offering';
  const submissionReview=input?.kind==='save_dtm_submission_review';
  const syllabusMetadata=input?.kind==='syllabus-metadata';
  const tuitionKind=tuitionDocumentKinds.find(kind=>kind===input?.kind);
  const conductKind=studentConductKinds.find(kind=>kind===input?.kind);
  const loanKind=studentLoanKinds.find(kind=>kind===input?.kind);
  const dormitoryKind=dormitoryConductKinds.find(kind=>kind===input?.kind);
  const gradeReportKind=dtmGradeReportKinds.find(kind=>kind===input?.kind);
  const certificateKind=input?.kind==='save_enrollment_certificate_assessment'?'save_enrollment_certificate_assessment'
    :input?.kind==='save_enrollment_certificate_document'?'save_enrollment_certificate_document':null;
  const maxBodyBytes=gradeReportKind?dtmGradeReportMaxPayloadBytes+1024:dormitoryKind?dormitoryConductMaxPayloadBytes+1024:loanKind?studentLoanMaxPayloadBytes+1024:conductKind?studentConductMaxPayloadBytes+1024:tuitionKind?tuitionDocumentMaxPayloadBytes+1024:syllabusMetadata?2000:certificateKind?10000:input?.kind==='save_graduation_review'?140000:input?.kind==='save_housing_period'?26000:catalogAction?48000:submissionReview?14000:12000;
  if(!input || typeof input.kind!=='string' || !input.payload || typeof input.payload!=='object'
    || Array.isArray(input.payload) || Buffer.byteLength(JSON.stringify(input),'utf8')>maxBodyBytes
    || (certificateKind||syllabusMetadata||tuitionKind||conductKind||loanKind||dormitoryKind||gradeReportKind)&&(Object.keys(input).length!==2||!Object.hasOwn(input,'kind')||!Object.hasOwn(input,'payload'))){response.status(400).json({error:'Invalid manager request.'});return;}
  try {
    const authorization=first(request.headers.authorization);
    const account=await verifyAffairsToken(authorization?.startsWith('Bearer ')?authorization.slice(7):'');
    const result=gradeReportKind?await manageDtmGradeReport({...account,requestDeadline},gradeReportKind,input.payload)
      :dormitoryKind?await manageDormitoryConductRecord({...account,requestDeadline},dormitoryKind,input.payload)
      :loanKind?await manageStudentLoanRecord({...account,requestDeadline},loanKind,input.payload)
      :conductKind?await manageStudentConductRecord({...account,requestDeadline},conductKind,input.payload)
      :tuitionKind?await manageTuitionDocumentRecord({...account,requestDeadline},tuitionKind,input.payload)
      :syllabusMetadata?await manageSyllabusMetadata({...account,requestDeadline},input.payload)
      :certificateKind?await manageEnrollmentCertificateRecord({...account,requestDeadline},certificateKind,input.payload)
      :submissionReview?await manageDtmSubmissionReview(account,input.kind,input.payload)
      :catalogAction?await manageCourseCatalog(account,input.kind,input.payload):await manageAffairsRecord(account,input.kind,input.payload);
    response.status(200).json(result);
  } catch(error) {
    const known=error instanceof AffairsWorkspaceError||error instanceof DtmSubmissionError||error instanceof EnrollmentCertificateError||error instanceof SyllabusSearchError||error instanceof TuitionDocumentsError||error instanceof StudentConductError||error instanceof StudentLoanError||error instanceof DormitoryConductError||error instanceof DtmGradeReportError;
    response.status(known?error.status:503).json({error:known?error.message:'School Affairs record could not be saved.'});
  }
}

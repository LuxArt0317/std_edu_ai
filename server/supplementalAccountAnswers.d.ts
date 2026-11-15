import type {exactClearanceVerification} from './clearanceEvidenceIntent.js';
import type {InternshipEvidenceResult} from './internshipEvidenceContract.js';
import type {StudentLeaveEvidenceResult} from './accountStudentLeaveEvidence.js';
import type {DtmAssignmentEvidenceResult} from './accountDtmAssignmentEvidence.js';
import type {TutorEvaluationEvidenceResult} from './accountTutorEvaluationEvidence.js';
import type {ClearanceEvidenceResult} from './accountClearanceEvidence.js';
import type {CounselingEvidenceResult} from './accountCounselingEvidence.js';
import type {HealthExaminationEvidenceResult} from './accountHealthExaminationEvidence.js';
import type {FeeRemissionEvidenceResult} from './accountFeeRemissionEvidence.js';
import type {StudentConductEvidenceResult} from './accountStudentConductEvidence.js';
import type {AidPaymentsEvidenceResult} from './accountAidPaymentsEvidence.js';
import type {DtmGradeReportEvidenceResult} from './accountDtmGradeReportEvidence.js';
import type {FacilityRepairEvidenceResult} from './accountFacilityRepairEvidence.js';
import type {DormitoryConductEvidenceResult} from './accountDormitoryConductEvidence.js';
import type {ElearningOutlineEvidenceResult} from './accountElearningOutlineEvidence.js';
import type {ElearningEvidenceResult} from './accountElearningEvidence.js';
import type {StudentLoanEvidenceResult} from './accountStudentLoanEvidence.js';
import type {CatalogEvidenceResult} from './accountCatalogEvidence.js';
import type {CertificateEvidenceResult} from './accountCertificateEvidence.js';
import type {SubmissionEvidenceResult} from './accountSubmissionEvidence.js';
import type {TuitionEvidenceResult} from './accountTuitionEvidence.js';
import type {TeachingFeedbackEvidenceResult} from './accountTeachingFeedbackEvidence.js';
import type {TeachingEvidenceSelection} from './teachingFeedbackEvidenceIntent.js';

export type SupplementalEvidenceResult=InternshipEvidenceResult|StudentLeaveEvidenceResult|DtmAssignmentEvidenceResult|TutorEvaluationEvidenceResult|ClearanceEvidenceResult|CounselingEvidenceResult|HealthExaminationEvidenceResult|FeeRemissionEvidenceResult|CatalogEvidenceResult|CertificateEvidenceResult|SubmissionEvidenceResult|TuitionEvidenceResult|StudentConductEvidenceResult|StudentLoanEvidenceResult|AidPaymentsEvidenceResult|DtmGradeReportEvidenceResult|ElearningEvidenceResult|FacilityRepairEvidenceResult|DormitoryConductEvidenceResult|ElearningOutlineEvidenceResult|TeachingFeedbackEvidenceResult;
export type SupplementalRecordView={id:string;title:string;url:string;columns:string[];rows:string[][];total:number;checkedAt:string;note:string};
export type SupplementalAnswerCandidate={
  status:'answered'|'abstained';answer:string;
  citations:{chunkId:string;claim:string;title:string;sourceName:string;url:string;locator:null;effectiveAt:null;reviewedAt:null}[];
  views:SupplementalRecordView[];sourceIds:string[];
  /** All selected reader results and display items are complete. This is not
   * a correctness/verification verdict or a claim to cover every account record. */
  complete:boolean;
  formatting:{limited:boolean;omittedItems:number;omittedViewRows:number;omittedViews:number};
};
export function supplementalAnswerLanguage(question:string):'en'|'zh-TW';
export function formatExactDtmGradeAvailability(result:DtmGradeReportEvidenceResult,question:string):
  Pick<SupplementalAnswerCandidate,'status'|'answer'|'citations'|'views'>|null;
export function formatExactDtmGradeAnswer(result:DtmGradeReportEvidenceResult,question:string):
  Pick<SupplementalAnswerCandidate,'status'|'answer'|'citations'|'views'>|null;
export function formatExactClearanceAnswer(result:ClearanceEvidenceResult,question:string,scope:NonNullable<ReturnType<typeof exactClearanceVerification>>):
  (Pick<SupplementalAnswerCandidate,'answer'|'citations'|'views'>&{status:'answered'|'handoff'})|null;
export function formatExactTeachingFeedbackAnswer(result:TeachingFeedbackEvidenceResult,question:string,selection:TeachingEvidenceSelection):
  Pick<SupplementalAnswerCandidate,'status'|'answer'|'citations'|'views'>|null;
export function formatRequestedAidPaymentDetails(result:AidPaymentsEvidenceResult,question:string,
  selection:{views:readonly ('salary'|'claims')[];pages:Partial<Record<'salary'|'claims',number>>;reason:string|null}):
  Pick<SupplementalAnswerCandidate,'status'|'answer'|'citations'|'views'>|null;
export const supplementalAnswerLimits:Readonly<{answerCharacters:8000;resultBytes:24000;views:3;viewRows:12}>;
/** Accept only already validated, own-account reader envelopes.
 * Pure candidate/view formatting; performs no authorization, reads, writes,
 * tool dispatch or model verification. Pass the same evidence to independent
 * verification before presenting this candidate as verified.
 * Unknown/duplicate sources and invalid envelopes throw TypeError. An
 * impossible metadata budget throws RangeError rather than concealing facts.
 */
export function formatSupplementalAccountAnswers(results:readonly SupplementalEvidenceResult[],options?:{question?:string;language?:'en'|'zh-TW'}):SupplementalAnswerCandidate;

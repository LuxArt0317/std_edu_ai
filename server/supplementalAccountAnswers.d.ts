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

export type SupplementalEvidenceResult=TutorEvaluationEvidenceResult|ClearanceEvidenceResult|CounselingEvidenceResult|HealthExaminationEvidenceResult|FeeRemissionEvidenceResult|CatalogEvidenceResult|CertificateEvidenceResult|SubmissionEvidenceResult|TuitionEvidenceResult|StudentConductEvidenceResult|StudentLoanEvidenceResult|AidPaymentsEvidenceResult|DtmGradeReportEvidenceResult|ElearningEvidenceResult|FacilityRepairEvidenceResult|DormitoryConductEvidenceResult|ElearningOutlineEvidenceResult;
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
export const supplementalAnswerLimits:Readonly<{answerCharacters:8000;resultBytes:24000;views:3;viewRows:12}>;
/** Accept only already validated, own-account reader envelopes.
 * Pure candidate/view formatting; performs no authorization, reads, writes,
 * tool dispatch or model verification. Pass the same evidence to independent
 * verification before presenting this candidate as verified.
 * Unknown/duplicate sources and invalid envelopes throw TypeError. An
 * impossible metadata budget throws RangeError rather than concealing facts.
 */
export function formatSupplementalAccountAnswers(results:readonly SupplementalEvidenceResult[],options?:{question?:string;language?:'en'|'zh-TW'}):SupplementalAnswerCandidate;

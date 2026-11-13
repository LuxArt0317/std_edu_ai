import type {CatalogEvidenceResult} from './accountCatalogEvidence.js';
import type {CertificateEvidenceResult} from './accountCertificateEvidence.js';
import type {SubmissionEvidenceResult} from './accountSubmissionEvidence.js';
import type {TuitionEvidenceResult} from './accountTuitionEvidence.js';

export type SupplementalEvidenceResult=CatalogEvidenceResult|CertificateEvidenceResult|SubmissionEvidenceResult|TuitionEvidenceResult;
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
export const supplementalAnswerLimits:Readonly<{answerCharacters:8000;resultBytes:24000;views:3;viewRows:12}>;
/** Accept only already validated, own-account reader envelopes.
 * Pure candidate/view formatting; performs no authorization, reads, writes,
 * tool dispatch or model verification. Pass the same evidence to independent
 * verification before presenting this candidate as verified.
 * Unknown/duplicate sources and invalid envelopes throw TypeError. An
 * impossible metadata budget throws RangeError rather than concealing facts.
 */
export function formatSupplementalAccountAnswers(results:readonly SupplementalEvidenceResult[],options?:{question?:string;language?:'en'|'zh-TW'}):SupplementalAnswerCandidate;

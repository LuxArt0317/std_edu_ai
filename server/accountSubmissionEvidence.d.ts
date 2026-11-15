import type {AffairsAccount} from './affairsWorkspace.js';
import type {VerificationEvidence} from './answerVerification.js';
export type SubmissionFileMetadata={filename:string;sizeBytes:number;contentType:string;committedAt:string};
export type SubmissionReviewMetadata={status:'graded'|'not_graded';gradeText:string|null;feedback:string|null;reviewedAt:string};
export type SubmissionEvidenceRecord={assignmentTitle:string;courseTitle:string;assignmentSourceMode:'sample'|'personal';url:string;dueAt:string|null;
  submission:null|{sourceMode:'local_submission';version:number;submittedAt:string;contentModifiedAt:string;dueAtAtSubmission:string|null;currentFile:SubmissionFileMetadata;currentReview:SubmissionReviewMetadata|null};
  pendingReservation:null|{filename:string;sizeBytes:number;contentType:string;expiresAt:string;state:'reserved_not_committed'};
  reviewedRetiredFiles:{file:SubmissionFileMetadata;review:SubmissionReviewMetadata}[];
  reviewHistory:{available:number;included:number;omitted:number;completeRetainedHistory:boolean}};
export type SubmissionUnavailable={assignmentTitle:string;courseTitle:string;url:string;reason:string};
export type SubmissionEvidencePayload={checkedAt:string;source:string;officialUniversityData:false;rules:string;
  selection:{scope:string;requiresClarification:boolean;choices:{assignmentTitle:string;courseTitle:string;url:string}[]};
  counts:{available:number;selected:number;requested:number;loaded:number;included:number;omitted:number;unavailable:number};
  complete:boolean;records:SubmissionEvidenceRecord[];unavailable:SubmissionUnavailable[]};
export type SubmissionEvidenceResult={readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;evidence:VerificationEvidence};
export function isSubmissionEvidenceQuestion(question:unknown,route?:string,history?:{role:string;content:string}[]):boolean;
export type DtmSubmissionTimingRecord={submittedAt:string|null;dueAtAtSubmission:string|null};
export function dtmSubmissionInstantMicros(value:unknown):bigint|null;
export function readDtmSubmissionTiming(account:AffairsAccount&{requestDeadline?:number},options:{courseId:string;assignmentId:string;deadline?:number},dependencies?:{fetchImpl?:typeof fetch}):Promise<DtmSubmissionTimingRecord>;
/** Captures caller credentials and minimal owned assignment/course metadata
 * synchronously, before any concurrent read worker starts. */
export function readSubmissionEvidence(account:AffairsAccount&{requestDeadline?:number},options:{snapshot:Record<string,unknown>;question?:string;route?:string;history?:{role:string;content:string}[];deadline?:number;assignmentIds?:string[]},dependencies?:{fetchImpl?:typeof fetch}):Promise<SubmissionEvidenceResult>;

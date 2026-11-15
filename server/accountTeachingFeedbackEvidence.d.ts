import type {VerificationEvidence} from './answerVerification.js';
export const teachingFeedbackEvidenceLimits:Readonly<{responseBytes:16000;admissionBytes:131072;deadlineMs:8000;surveys:50;eligibleCourses:200;feedback:100}>;
export type TeachingFeedbackEvidenceAccount={url:string;key:string;token:string;user:{id:string};requestDeadline?:number};
export type TeachingFeedbackEvidenceOptions={views:Array<'survey'|'immediate'>;commentRequested?:boolean;course?:{code?:string;title?:string};deadline?:number};
export type TeachingFeedbackEvidenceResult={readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;evidence:VerificationEvidence&{id:'account:teachingFeedback';provenance:'saved_local'}};
export function unavailableTeachingFeedbackEvidence(reason:string):TeachingFeedbackEvidenceResult;
/** Verified caller only. The upstream selector must reject foreign, management
 * and write requests before calling. Only requested student views are read;
 * exact course title/code filters constrain every projected row and comment.
 * Status-only responses never expose comment text. Survey responses are
 * anonymous and are never loaded or projected. Cap and omission counts remain
 * explicit; failed reads never imply empty history. No retry occurs here.
 * Entire result <=16KB, admission <=128KiB, shared deadline <=8s. Native loader
 * has its own HTTP bound; injection is captured before the first await.
 */
export function readTeachingFeedbackEvidence(account:TeachingFeedbackEvidenceAccount,options:TeachingFeedbackEvidenceOptions,dependencies?:{
  read?:(account:TeachingFeedbackEvidenceAccount,query:{scope:'teaching-feedback';view:'survey'|'immediate'})=>Promise<unknown>;
  observeRead?:(view:'survey'|'immediate',dto:unknown)=>void;
}):Promise<TeachingFeedbackEvidenceResult>;

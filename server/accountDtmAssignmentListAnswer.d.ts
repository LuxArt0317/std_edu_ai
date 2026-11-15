import type {VerificationProgress,VerificationCandidate} from './answerVerification.js';
import type {DtmAssignmentListSelection} from './dtmAssignmentListIntent.js';
import type {loadDtmAssignmentList} from './dtmCourseResource.js';
export function answerDtmAssignmentList(options:{account:Parameters<typeof loadDtmAssignmentList>[0];selection:Extract<DtmAssignmentListSelection,{reason:null}>;
  question:string;deadline:number;onProgress?:(step:VerificationProgress)=>void},load?:typeof loadDtmAssignmentList):Promise<VerificationCandidate>;

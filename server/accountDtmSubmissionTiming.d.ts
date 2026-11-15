import type {AffairsAccount} from './affairsWorkspace.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
import type {readDtmSubmissionTiming} from './accountSubmissionEvidence.js';
import type {DtmSubmissionTimingSelection} from './dtmSubmissionTimingIntent.js';
export function answerDtmSubmissionTiming(input:{
  account:AffairsAccount;selection:DtmSubmissionTimingSelection;question:string;deadline:number;onProgress?:(step:VerificationProgress)=>void
},load?:typeof readDtmSubmissionTiming):Promise<VerificationCandidate>;

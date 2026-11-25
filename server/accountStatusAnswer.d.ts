import type {AffairsAccount} from './affairsWorkspace.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
export function guestAccountStatusAnswer(question:string):VerificationCandidate;
export function answerAccountStatus(options:{account:AffairsAccount;question:string;route:string;deadline:number;
  onProgress?:(step:VerificationProgress)=>void}):Promise<VerificationCandidate>;

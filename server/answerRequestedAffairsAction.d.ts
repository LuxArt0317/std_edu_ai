import type {ExplicitAccountAction} from './accountActionIntent.js';
import type {AffairsAccount} from './affairsWorkspace.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
export function answerRequestedAffairsAction(options:{
  account:AffairsAccount;question:string;selection:ExplicitAccountAction;route:string;deadline:number;
  onProgress?:(step:VerificationProgress)=>void;
}):Promise<VerificationCandidate>;

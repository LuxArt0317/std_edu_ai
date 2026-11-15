import type {AffairsAccount} from './affairsWorkspace.js';
import type {ClubMembershipSelection} from './clubMembershipIntent.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
export function clubMembershipBoundary(question:string,options?:{foreign?:boolean}):VerificationCandidate;
export function answerClubMemberships(options:{account:AffairsAccount;question:string;route:string;selection:ClubMembershipSelection;
  deadline:number;onProgress?:(step:VerificationProgress)=>void}):Promise<VerificationCandidate>;

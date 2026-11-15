import type {AffairsAccount} from './affairsWorkspace.js';
import type {ClubAttendanceSelection} from './clubAttendanceIntent.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
export function answerClubActivityAttendance(options:{account:AffairsAccount;question:string;route:string;selection:ClubAttendanceSelection;
  deadline:number;onProgress?:(step:VerificationProgress)=>void}):Promise<VerificationCandidate>;

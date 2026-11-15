import type {AffairsAccount} from './affairsWorkspace.js';
import type {ClubAttendanceSelection} from './clubAttendanceIntent.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
import type {ClubAttendanceBrowserObservation} from './clubAttendanceObservation.js';
export function answerClubActivityAttendance(options:{account:AffairsAccount;question:string;route:string;selection:ClubAttendanceSelection;
  deadline:number;onProgress?:(step:VerificationProgress)=>void;observation?:ClubAttendanceBrowserObservation}):Promise<VerificationCandidate>;

import type {AffairsAccount} from './affairsWorkspace.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
export type ExactAcademicAttendancePlan={question:string;route:string;courseTitle:string|null;rollCallOnly:boolean;fullStatistics:boolean;unexcusedOnly:boolean;absenceOnly:boolean};
export function selectExactAcademicAttendance(question:string,route:string,history?:Array<{role:string;content:string}>):ExactAcademicAttendancePlan|null;
export function answerExactAcademicAttendance(options:{account:AffairsAccount;question:string;route:string;plan:ExactAcademicAttendancePlan;deadline:number;
  onProgress?:(step:VerificationProgress)=>void}):Promise<VerificationCandidate>;

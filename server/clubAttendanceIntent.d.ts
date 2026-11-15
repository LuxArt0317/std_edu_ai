import type {VerificationCandidate} from './answerVerification.js';
export type ClubAttendanceSelection={page:number;reason:'foreign'|'excluded'|'navigation'|'action'|'scope'|null;latest:boolean;countOnly:boolean;partial:boolean};
export const clubAttendancePath:string;
export const clubAttendanceRoute:RegExp;
export function clubAttendancePage(page:number):string;
export function clubAttendanceSelection(question:string,route?:string):ClubAttendanceSelection|null;
export function clubAttendanceBoundary(selection:ClubAttendanceSelection,question:string,signedIn:boolean):VerificationCandidate;

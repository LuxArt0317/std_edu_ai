export const earlyGraduationPath:'/school-affairs/services/7-4';
export const earlyGraduationScope:'early-graduation';
export const earlyGraduationStudentActions:readonly string[];
export const earlyGraduationManagerActions:readonly string[];
export type GraduationTerm={academicYear:number;semester:number};
export type GraduationRowTerm={academic_year:number;semester:number;version:number};
export type GraduationWindow=GraduationRowTerm & {opens_at:string;closes_at:string};
export type GraduationIdentity=GraduationRowTerm & {user_id:string;study_track:string;department:string;student_number:string;graduation_year:number;graduation_semester:number};
export type GraduationCandidate=GraduationIdentity & {eligibility:'unverified'|'eligible'|'ineligible'};
export type GraduationApplication=GraduationIdentity & {applied_at:string;status:'submitted'|'cancelled'|'approved'|'rejected'};
export type GraduationData=GraduationTerm & {userId:string|null;state:'unconfigured'|'scheduled'|'open'|'closed';window:GraduationWindow|null;candidate:GraduationCandidate|null;records:GraduationApplication[]};
type Base={academic_year:number;semester:number;expected_version:number;request_id:string};
export type GraduationAction=
  | {kind:'set_graduation_window';payload:Base & Pick<GraduationWindow,'opens_at'|'closes_at'>}
  | {kind:'set_graduation_candidate';payload:Base & Omit<GraduationCandidate,keyof GraduationRowTerm>}
  | {kind:'review_early_graduation';payload:Base & {user_id:string;decision:'approved'|'rejected'}}
  | {kind:'submit_early_graduation';payload:Base & {candidate_version:number}}
  | {kind:'cancel_early_graduation';payload:Base};
export function validEarlyGraduationAction(kind:unknown,payload:unknown):boolean;
export function parseEarlyGraduation(data:unknown,userId:string|null,term?:GraduationTerm):GraduationData;
export function parseEarlyGraduationReceipt(row:unknown,kind:string,payload:Record<string,unknown>,userId:string|null):GraduationWindow|GraduationCandidate|GraduationApplication;
export function earlyGraduationQuestion(question:string):boolean;

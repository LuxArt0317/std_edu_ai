export type ClearanceTrack='undergraduate'|'graduate';
export type ClearanceOffice='library'|'academic'|'department'|'cashier'|'career'|'advisor'|'thesis'|'international';
export type ClearanceDecision='pending'|'cleared'|'action_required';
export type ClearancePage='apply'|'status';
export type ClearanceCandidate={track:ClearanceTrack;international:boolean;version:number};
export type ClearancePeriod={termId:string;term:string;opensAt:string;closesAt:string;version:number;state:'scheduled'|'open'|'closed';candidate:ClearanceCandidate|null};
export type ClearanceReview={office:ClearanceOffice;status:ClearanceDecision;note:string;reviewedAt:string|null;version:number};
export type ClearanceApplication={id:string;termId:string;term:string;track:ClearanceTrack;submittedAt:string;reviews:ClearanceReview[]};
export type ClearanceData={userId:string;targetId:string|null;terms:{id:string;label:string}[];periods:ClearancePeriod[];applications:ClearanceApplication[]};
type Request={request_id:string};
export type ClearanceAction=
  |{kind:'set_clearance_period';payload:Request & {term_id:string;opens_at:string;closes_at:string;expected_version:number}}
  |{kind:'set_clearance_candidate';payload:Request & {term_id:string;user_id:string;track:ClearanceTrack;international:boolean;expected_version:number}}
  |{kind:'submit_graduation_clearance';payload:Request & {term_id:string;period_version:number;candidate_version:number;acknowledged:true}}
  |{kind:'review_clearance_office';payload:Request & {application_id:string;office:ClearanceOffice;decision:ClearanceDecision;note:string;expected_version:number}};
export const clearancePaths:Record<ClearancePage,string>;
export const clearanceScope:'graduation-clearance';
export const clearanceSubmit:'submit_graduation_clearance';
export const clearanceManagerActions:readonly string[];
export const clearanceOffices:Record<ClearanceOffice,[string,string]>;
export const clearanceStatuses:Record<ClearanceDecision,[string,string]>;
export function validClearanceAction(kind:unknown,body:unknown):boolean;
export function parseClearance(value:unknown,userId:string,view:'student'|'manage',term?:string,target?:string):ClearanceData;
export function parseClearanceReceipt(row:unknown,kind:string,payload:ClearanceAction['payload']):unknown;
export function clearanceQuestion(question:string):ClearancePage|null;

import type { ClubActivity } from './clubServicesContract.js';
export type ClubStudentView = 'directory'|'activity-search'|'my-attendance'|'my-memberships'|'foundation'|'foundation/review';
type Period = {academic_year:number|null;term:number|null};
export type ClubFoundationStatus = 'submitted'|'approved'|'declined'|'withdrawn';
export type FoundationReceipt = {id:string;version:1|2;status:ClubFoundationStatus};
export type FoundationRow = FoundationReceipt & {
  name:string;description:string;review_note:string;updated_at:string;club_id:string|null;student_name:string|null;
};
export type ClubStudentWorkspace = {userId:string;page:number;eligible:boolean;hasMore:boolean}&(
  {view:'directory';rows:Array<{id:string;name:string;location:string;advisor:string}>}|
  {view:'activity-search';rows:ClubActivity[]}|
  {view:'my-attendance';rows:Array<Pick<ClubActivity,'id'|'title'|'starts_at'|'location'|'club_name'>&Period&{recorded_at:string}>}|
  {view:'my-memberships';rows:Array<{id:string;name:string;role_label:string;active:boolean}&Period>}|
  {view:'foundation';rows:FoundationRow[]}|{view:'foundation/review';rows:FoundationRow[]}
);
type Existing = {request_id:string;id:string;expected_version:1};
export type ClubFoundationAction =
  {kind:'submit_club_foundation';payload:{request_id:string;name:string;description:string}}|
  {kind:'withdraw_club_foundation';payload:Existing}|
  {kind:'review_club_foundation';payload:Existing&{status:'approved'|'declined';note:string}};
export const clubStudentMenu:ReadonlyArray<readonly [ClubStudentView|'activities',string,string]>;
export const clubStudentScope:'club-student';
export const clubFoundationActions:Readonly<Record<ClubFoundationAction['kind'],'submit'|'withdraw'|'review'>>;
export const clubFoundationStatuses:Readonly<Record<ClubFoundationStatus,string>>;
export const clubSearchViews:ReadonlyArray<string>;
export function isClubStudentView(value:unknown):value is ClubStudentView;
export function validClubStudentWorkspace(value:unknown,userId:string,view:ClubStudentView,page:number):value is ClubStudentWorkspace;
export function validClubFoundationReceipt(row:unknown):row is FoundationReceipt;
export function clubStudentQuestion(question:string):Exclude<ClubStudentView,'foundation/review'>|null;
export function clubStudentGuide(question:string,view:Exclude<ClubStudentView,'foundation/review'>,signedIn?:boolean):ReturnType<typeof import('./clubServicesContract.js').clubGuide>;

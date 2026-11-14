export type OfficerView='applications'|'completion'|'profiles'|'members'|'participation'|'review';
export type OfficerChoice='natures'|'audiences'|'sdgs'|'education';
export type OfficerStatus='submitted'|'approved'|'declined'|'withdrawn'|'completed';
export type ClubApplicationInput={
  advisor:string;advisor_phone:string;area:string;audiences:string[];campus_location:string;club_id:string;co_organizer:string;
  coordinator:string;coordinator_phone:string;education:string[];education_other:string;ends_at:string;hours:string;location:string;
  natures:string[];offsite_location:string;organizer:string;sdgs:string[];starts_at:string;title:string;
};
export type OfficerReceipt={id:string;version:number;status:OfficerStatus};
type AcademicPeriod={academic_year:number|null;term:number|null};
export type ClubApplication=OfficerReceipt & AcademicPeriod & {club_id:string;club_name:string;title:string;organizer:string;starts_at:string;ends_at:string;
  hours:number;location:string;details:ClubApplicationInput;review_note:string;completion_note:string;can_edit:boolean};
type ClubProfile=AcademicPeriod & {id:string;name:string;location:string;advisor:string;member_count:number;lead_name:string|null;lead_email:string|null;
  lead_phone:string|null;lead_mobile:string|null;review_status:string|null;lending_status:string|null};
type ClubMember=AcademicPeriod & {id:string;student_number:string;student_name:string;club_name:string;role_label:string;officer:boolean;contact_email:string|null;contact_phone:string|null};
type ClubParticipation=Omit<ClubMember,'role_label'|'officer'|'contact_email'|'contact_phone'> & {title:string;starts_at:string};
export type OfficerWorkspace={userId:string;clubs:Array<{id:string;name:string}>} & (
  {view:'applications'|'completion'|'review';rows:ClubApplication[]} | {view:'profiles';rows:ClubProfile[]} |
  {view:'members';rows:ClubMember[]} | {view:'participation';rows:ClubParticipation[]}
);
type Base={request_id:string};
type RecordInput=Base & {id:string;expected_version:number};
export type OfficerAction=
  {kind:'submit_club_application';payload:Base & {application:ClubApplicationInput}} |
  {kind:'edit_club_application';payload:RecordInput & {application:ClubApplicationInput}} |
  {kind:'withdraw_club_application';payload:RecordInput} |
  {kind:'complete_club_application';payload:RecordInput & {note:string}} |
  {kind:'review_club_application';payload:RecordInput & {status:'approved'|'declined';category:string;note:string}};
export const clubOfficerScope:'club-officer';
export const clubOfficerMenu:ReadonlyArray<readonly [string,string,string]>;
export const clubOfficerViews:readonly OfficerView[];
export const clubOfficerActions:Record<OfficerAction['kind'],string>;
export const clubApplicationStatus:Record<OfficerStatus,string>;
export const clubApplicationChoices:Record<OfficerChoice,string[]>;
export function validClubApplicationReceipt(value:unknown):value is OfficerReceipt;
export function validClubOfficerWorkspace(value:unknown,userId:string,view:OfficerView):value is OfficerWorkspace;
export function clubOfficerQuestion(question:string):'applications'|'completion'|null;
export function clubOfficerGuide(question:string,view:'applications'|'completion',signedIn?:boolean):ReturnType<typeof import('./clubServicesContract.js').clubGuide>;

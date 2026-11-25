export type ClubView = 'activities' | 'equipment' | 'review';
export type ClubCategory = 'lecture' | 'performance' | 'outreach' | 'camp' | 'service' | 'special' | 'competition' | 'sports' | 'other' | 'uncategorized';
export type EquipmentCategory = 'A01' | 'B01' | 'C01' | 'D01' | 'E01' | 'F01';
export type ClubPurpose = 'class' | 'activity' | 'meeting' | 'other';
export type ClubStatus = 'submitted' | 'approved' | 'declined' | 'cancelled' | 'returned';
export type ClubActivity = {id:string;club_name:string;title:string;category:ClubCategory;starts_at:string;ends_at:string;location:string;description:string};
export type ClubReceipt = {id:string;status:ClubStatus;version:number};
export type ClubEquipmentRequest = ClubReceipt & {
  student_number:string;student_name:string;club_id:string;club_name:string;phone:string;pickup_on:string;return_on:string;
  purpose:ClubPurpose;other_purpose:string;items:Array<{id:string;label:string}>;collateral:string;updated_at:string;
};
type ClubBase = {userId:string;manager:boolean;today:string;student:{student_number:string;student_name:string}|null;
  clubs:Array<{id:string;name:string}>;equipment:Array<{id:string;label:string;category:EquipmentCategory}>};
export type ClubWorkspace = ClubBase & ({view:'activities';rows:ClubActivity[]}|{view:'equipment'|'review';rows:ClubEquipmentRequest[]});
type ClubApplication = {request_id:string;club_id:string;items:string[];phone:string;pickup_on:string;return_on:string;purpose:string;other_purpose:string};
export type ClubAction = {kind:'submit_club_equipment';payload:ClubApplication}
  | {kind:'edit_club_equipment';payload:ClubApplication & {id:string;expected_version:number}}
  | {kind:'cancel_club_equipment';payload:{request_id:string;id:string;expected_version:number}}
  | {kind:'review_club_equipment';payload:{request_id:string;id:string;expected_version:number;status:'approved'|'declined'|'returned';collateral:string}};
export const clubPath:string;
export const clubEquipmentNewPath:string;
export const clubScope:'student-clubs';
export const clubActions:ClubAction['kind'][];
export const clubDate:RegExp;
export const clubUuid:RegExp;
export const clubMonth:RegExp;
export const clubCategories:Record<ClubCategory,string>;
export const clubEquipmentCategories:Record<EquipmentCategory,string>;
export const clubPurposes:Record<ClubPurpose,string>;
export const clubRequestStatuses:Record<ClubStatus,string>;
export function validClubWorkspace(value:unknown,userId:string,view:ClubView):value is ClubWorkspace;
export function validClubReceipt(value:unknown):value is ClubReceipt;
export function mentionsClub(question:string):boolean;
export function clubIntent(question:string,route?:string):'equipment'|'activities'|null;
export function clubGuide(question:string,intent:'equipment'|'activities',signedIn?:boolean):{
  status:'answered'|'handoff';answer:string;
  citations:Array<{chunkId:string;title:string;url:string;claim:string;sourceName:string;locator:null;effectiveAt:null;reviewedAt:null}>;
  suggestedQuestions:string[];grounding:{source:string;webSearched:boolean};
};

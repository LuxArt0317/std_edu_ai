export const counselingPath:string;
export const counselingScope:'counseling-appointments';
export const counselingConsentVersion:'stu-best-2026-11-14';
export type CounselingKind='counseling'|'assessment';
export type CounselingStatus='requested'|'scheduled'|'cancelled'|'closed';
export const counselingStatus:Record<CounselingStatus,[string,string]>;
export const counselingKinds:Record<CounselingKind,string>;
export type CounselingRow={id:string;kind:CounselingKind;preferred_on:string;preferred_period:'morning'|'afternoon';
  status:CounselingStatus;scheduled_at:string|null;updated_at:string;version:number};
export type CounselingQueueRow=CounselingRow&{user_id:string;contact_email:string};
export type CounselingWorkspace={userId:string;available:boolean;canCoordinate:boolean;rows:CounselingRow[]};
export type CounselingReceipt={id:string;version:number;status:CounselingStatus};
export function counselingQuestion(question:string):'guide'|'status'|null;
export function counselingGuide(question:string,intent:'guide'|'status',signedIn?:boolean):{
  status:'answered'|'handoff';answer:string;citations:Array<{chunkId:string;claim:string;title:string;url:string;sourceName:string;locator:null;effectiveAt:null;reviewedAt:null}>;
  suggestedQuestions:string[];grounding:{source:string;webSearched:boolean}};

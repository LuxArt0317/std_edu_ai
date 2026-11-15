export type FacilityRepairSelection={id:string|null;idSource:'question'|'route'|'previous_user'|'none'|'ambiguous';page:number;status:''|'submitted'|'in_progress'|'resolved'|'cancelled';latestNoteRequested:boolean;noteHistoryRequested:boolean;fields:{location:boolean;item:boolean;description:boolean};requiresClarification:boolean;reason:'ambiguous_selection'|null};
export function selectFacilityRepairEvidence(question:unknown,route?:string,history?:{role:string;content:string}[]):FacilityRepairSelection|null;
export function isFacilityRepairEvidenceQuestion(question:unknown,route?:string,history?:{role:string;content:string}[]):boolean;
export function isForeignFacilityRepairQuestion(question:unknown):boolean;
export function requestsFacilityRepairTechnicianMessage(question:unknown):boolean;

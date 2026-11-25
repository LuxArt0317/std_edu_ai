export type DtmAssignmentField='title'|'details'|'dueAt'|'trackerStatus'|'trackerSubmittedAt';
export type DtmAssignmentSelection={courseId:string|null;assignmentId:string|null;fields:DtmAssignmentField[];question:string;reason:null|'invalid_route'|'foreign_request'|'unsupported_operation'|'ambiguous_selector'};
export function dtmAssignmentRoute(route?:string):{courseId:string;assignmentId:string;url:string}|null|undefined;
export function dtmAssignmentLookupContext(question:unknown,route?:string,history?:Array<{role:string;content:string}>):{selection:DtmAssignmentSelection|null;otherQuestion:string;excluded:boolean};
export function selectDtmAssignmentEvidence(question:unknown,route?:string,history?:Array<{role:string;content:string}>):DtmAssignmentSelection|null;
export function isDtmAssignmentEvidenceQuestion(question:unknown,route?:string,history?:Array<{role:string;content:string}>):boolean;

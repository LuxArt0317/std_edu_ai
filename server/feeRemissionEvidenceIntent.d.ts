export type FeeRemissionEvidenceSelection={from:'question'|'route'|'history';academicYear:string|null;semester:string|null;currentTerm:boolean;studentNumber:boolean;operation:boolean;document:boolean;reason:'invalid_route'|'foreign_request'|'invalid_period'|'ambiguous_period'|null};
export function selectFeeRemissionEvidence(question?:string,route?:string,history?:Array<{role:string;content:string}>):FeeRemissionEvidenceSelection|null;
export function isFeeRemissionEvidenceQuestion(question?:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function isFeeRemissionPeriodClause(value:string):boolean;

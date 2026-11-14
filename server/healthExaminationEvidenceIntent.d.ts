export type HealthExaminationEvidenceSelection={from:'question'|'route'|'history';page:number|null;clinical:boolean;document:boolean;operation:boolean;reason:'invalid_route'|'foreign_request'|'invalid_selector'|'ambiguous_selector'|null};
export function selectHealthExaminationEvidence(question?:string,route?:string,history?:Array<{role:string;content:string}>):HealthExaminationEvidenceSelection|null;
export function isHealthExaminationEvidenceQuestion(question?:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function isHealthExaminationPageClause(clause:string):boolean;
export function isHealthExaminationFieldClause(clause:string):boolean;
export function isHealthExaminationNavigationQuestion(question:string):boolean;
export function withoutExcludedHealthClause(question:string):string;

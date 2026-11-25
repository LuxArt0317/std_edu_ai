export type CounselingEvidenceSelection={from:'question'|'route'|'history';clinical:boolean;document:boolean;identity:boolean;operation:boolean;reason:'invalid_route'|'foreign_request'|'restricted_view'|null};
export function selectCounselingEvidence(question?:string,route?:string,history?:Array<{role:string;content:string}>):CounselingEvidenceSelection|null;
export function isCounselingEvidenceQuestion(question?:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function isCounselingNavigationQuestion(question:string):boolean;
export function isCounselingFieldClause(clause:string):boolean;
export function withoutExcludedCounselingClause(question:string):string;
export function isOwnCounselingTrackingNoteQuestion(question:string):boolean;

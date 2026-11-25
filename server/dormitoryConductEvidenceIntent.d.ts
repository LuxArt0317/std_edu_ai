export type DormitoryConductEvidenceSelection={from:'question'|'route'|'history';operation:boolean;document:boolean;reason:'invalid_route'|'foreign_request'|null};
export function selectDormitoryConductEvidence(question?:string,route?:string,history?:Array<{role:string;content:string}>):DormitoryConductEvidenceSelection|null;
export function isDormitoryConductEvidenceQuestion(question?:string,route?:string,history?:Array<{role:string;content:string}>):boolean;

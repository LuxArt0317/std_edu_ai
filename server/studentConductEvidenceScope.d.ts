export type StudentConductScope = {
  selected:boolean; foreign:boolean; excluded:boolean; navigation:boolean;
  question:string; otherQuestion:string;
  from:'question'|'route'|'history'|null;
  reason:null|'foreign_request'|'invalid_route'|'ambiguous_subject';
};
export function studentConductScope(question:string,route?:string,history?:Array<{role:string;content:string}>):StudentConductScope;
export function isStudentConductScopeQuestion(question:string,route?:string,history?:Array<{role:string;content:string}>):boolean;

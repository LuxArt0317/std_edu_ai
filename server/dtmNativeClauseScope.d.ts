import type {DtmAssignmentSelection} from './dtmAssignmentEvidenceIntent.js';
export type DtmNativeClauseScope={recognized:boolean;compound:boolean;tools:('dtmAssignment'|'dtmGradeReport')[];
 assignment:null|{question:string;route:string;history:[];selection:DtmAssignmentSelection};
 grades:null|{question:string;route:string;history:[]};
 denied:{source:'dtmAssignment'|'dtmGradeReport';reason:string}[];otherQuestion:string};
export function dtmNativeClauseScope(question:unknown,route?:string,history?:{role:string;content:string}[]):DtmNativeClauseScope;
export function dtmNativeClauseNotice(scope:DtmNativeClauseScope,question:string):string;

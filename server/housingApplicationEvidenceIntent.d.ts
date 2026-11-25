import type {HousingApplicationTerm} from './accountHousingApplicationEvidence.js';
export type HousingApplicationSelection={from:'question'|'route'|'history';term:HousingApplicationTerm;reason:null|'foreign_request'|'unsupported_operation'|'ambiguous_selector'|'invalid_route'|'outside_scope';unavailableDetails:boolean};
export type HousingApplicationLookupContext={selection:HousingApplicationSelection|null;question:string;otherQuestion:string;navigation:boolean;foreign:boolean;excluded:boolean};
export function housingApplicationLookupContext(question:unknown,route?:string,history?:Array<{role:string;content:string}>):HousingApplicationLookupContext;
export function isHousingApplicationScopeQuestion(question:unknown,route?:string,history?:Array<{role:string;content:string}>):boolean;

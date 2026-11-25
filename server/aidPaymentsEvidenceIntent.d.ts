import type {AidPaymentView} from './aidPaymentsContract.js';
export type AidPaymentsEvidenceSelection={views:AidPaymentView[];question:string;pages:Partial<Record<AidPaymentView,number>>;from:'question'|'route'|'history';reason:null|'invalid_page'|'ambiguous_page'};
export function selectAidPaymentsEvidence(question:unknown,route?:string,history?:Array<{role:string;content:string}>):AidPaymentsEvidenceSelection|null;
export function isAidPaymentsEvidenceQuestion(question:unknown,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function isForeignAidPaymentsQuestion(question:unknown,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function aidPaymentsLookupContext(question:unknown,route?:string,history?:Array<{role:string;content:string}>):{selection:AidPaymentsEvidenceSelection|null;question:string;otherQuestion:string;foreign:boolean;excluded:boolean};

export function aidPaymentsNavigation(question:unknown):AidPaymentView|null;
export function isAidPaymentsScopeQuestion(question:unknown,route?:string,history?:Array<{role:string;content:string}>):boolean;

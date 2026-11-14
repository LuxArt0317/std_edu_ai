import type {AidPaymentView} from './aidPaymentsContract.js';
export type AidPaymentsEvidenceSelection={views:AidPaymentView[];question:string};
export function selectAidPaymentsEvidence(question:unknown,route?:string,history?:Array<{role:string;content:string}>):AidPaymentsEvidenceSelection|null;
export function isAidPaymentsEvidenceQuestion(question:unknown,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function isForeignAidPaymentsQuestion(question:unknown):boolean;

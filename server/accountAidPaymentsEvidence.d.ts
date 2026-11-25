import type {VerificationEvidence} from './answerVerification.js';
import type {AidPaymentView} from './aidPaymentsContract.js';
export const aidPaymentsEvidenceMaxBytes:16000;
export type AidPaymentsEvidenceAccount={url:string;key:string;token:string;user:{id:string};requestDeadline?:number};
export type AidPaymentsEvidenceOptions={question?:string;route?:string;history?:Array<{role:string;content:string}>;deadline?:number};
export type AidPaymentsEvidenceResult={readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;evidence:VerificationEvidence&{id:'account:aidPayments';provenance:'saved_local'}};
export function isAidPaymentsEvidenceQuestion(question:unknown,route?:string,history?:Array<{role:string;content:string}>):boolean;
export {isForeignAidPaymentsQuestion} from './aidPaymentsEvidenceIntent.js';
export function unavailableAidPaymentsEvidence(reason:string):AidPaymentsEvidenceResult;
export function readAidPaymentsEvidence(account:AidPaymentsEvidenceAccount,options?:AidPaymentsEvidenceOptions,dependencies?:{
  read?:(account:AidPaymentsEvidenceAccount,query:{scope:'aid-payments';view:AidPaymentView;page:string;summary?:'1'})=>Promise<unknown>;
}):Promise<AidPaymentsEvidenceResult>;

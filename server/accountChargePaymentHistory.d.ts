import type {readChargePaymentHistory} from './chargePaymentHistory.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';

export const chargePaymentHistoryPath:'/school-affairs/services/39-1/payment-history';
type PaymentHistorySelection={reason:null;zh:boolean;filter:{from?:string;through?:string};
  onlyTuition:boolean;monthly:boolean;latest:boolean;alsoBalance:boolean};
type PaymentHistoryBoundary={reason:'foreign'|'write'|'period';zh:boolean};
export function selectChargePaymentHistory(question:string,route?:string,history?:Array<{role:string;content:string}>,
  now?:number):PaymentHistorySelection|PaymentHistoryBoundary|null;
export function chargePaymentHistoryBoundary(selection:PaymentHistoryBoundary):VerificationCandidate;
export function answerChargePaymentHistory(options:{account:Parameters<typeof readChargePaymentHistory>[0];
  selection:PaymentHistorySelection;question:string;deadline:number;onProgress?:(step:VerificationProgress)=>void},
  load:typeof readChargePaymentHistory):Promise<VerificationCandidate>;

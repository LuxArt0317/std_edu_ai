import type {verifyAffairsToken} from './affairsWorkspace.js';
import type {AidPaymentResult} from './aidPaymentsContract.js';
export function readAidPayments(account:Awaited<ReturnType<typeof verifyAffairsToken>>&{requestDeadline?:number},
  query:Record<string,string|string[]|undefined>):Promise<AidPaymentResult>;

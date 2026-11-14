import type {AffairsAccount} from './affairsWorkspace.js';
import type {VerificationEvidence} from './answerVerification.js';
export {isFeeRemissionEvidenceQuestion} from './feeRemissionEvidenceIntent.js';
export const feeRemissionEvidenceMaxBytes:16000;
export type FeeRemissionEvidenceOptions={question?:string;route?:string;history?:Array<{role:string;content:string}>;deadline?:number};
export type FeeRemissionEvidenceResult={readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;evidence:VerificationEvidence&{provenance:'saved_local'}};
export function unavailableFeeRemissionEvidence(reason:string):FeeRemissionEvidenceResult;
export function readFeeRemissionEvidence(account:AffairsAccount&{requestDeadline?:number},options?:FeeRemissionEvidenceOptions,dependencies?:{load?:(account:AffairsAccount&{requestDeadline?:number})=>Promise<unknown>}):Promise<FeeRemissionEvidenceResult>;

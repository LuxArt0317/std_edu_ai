import type {VerificationEvidence} from './answerVerification.js';
export {isCounselingEvidenceQuestion} from './counselingEvidenceIntent.js';
export const counselingEvidenceMaxBytes:16000;
export type CounselingEvidenceAccount={url:string;key:string;token:string;user:{id:string};requestDeadline?:number};
export type CounselingEvidenceOptions={question?:string;route?:string;history?:Array<{role:string;content:string}>;deadline?:number};
export type CounselingEvidenceResult={readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;evidence:VerificationEvidence&{id:'account:counselingAppointments';provenance:'saved_local'}};
export function unavailableCounselingEvidence(reason:string):CounselingEvidenceResult;
export function readCounselingEvidence(account:CounselingEvidenceAccount,options?:CounselingEvidenceOptions,dependencies?:{
  read?:(account:CounselingEvidenceAccount,query:{scope:'counseling-appointments';view:'mine'})=>Promise<unknown>;
}):Promise<CounselingEvidenceResult>;

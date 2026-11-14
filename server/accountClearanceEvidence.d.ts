import type {VerificationEvidence} from './answerVerification.js';
export {isClearanceEvidenceQuestion} from './clearanceEvidenceIntent.js';
export const clearanceEvidenceMaxBytes:16000;
export type ClearanceEvidenceAccount={url:string;key:string;token:string;user:{id:string};requestDeadline?:number};
export type ClearanceEvidenceOptions={question?:string;route?:string;history?:Array<{role:string;content:string}>;deadline?:number};
export type ClearanceEvidenceResult={readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;evidence:VerificationEvidence&{id:'account:graduationClearance';provenance:'saved_local'}};
export function unavailableClearanceEvidence(reason:string):ClearanceEvidenceResult;
export function readClearanceEvidence(account:ClearanceEvidenceAccount,options?:ClearanceEvidenceOptions,dependencies?:{
  read?:(account:ClearanceEvidenceAccount,query:{scope:'graduation-clearance';view:'student'})=>Promise<unknown>;
}):Promise<ClearanceEvidenceResult>;

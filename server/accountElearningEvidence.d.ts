import type {VerificationEvidence} from './answerVerification.js';
export const elearningEvidenceMaxBytes:12000;
export type ElearningEvidenceAccount={url:string;key:string;token:string;user:{id:string};requestDeadline?:number};
export type ElearningEvidenceOptions={question?:string;route?:string;history?:Array<{role:string;content:string}>;deadline?:number};
export type ElearningEvidenceResult={readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;
  evidence:VerificationEvidence&{id:'account:elearningEnrollments';provenance:'saved_local'}};
export function unavailableElearningEvidence(reason:string):ElearningEvidenceResult;
export function readElearningEvidence(account:ElearningEvidenceAccount,options?:ElearningEvidenceOptions,dependencies?:{
  read?:(account:ElearningEvidenceAccount,query:{scope:'elearning-workspace'})=>Promise<unknown>;
}):Promise<ElearningEvidenceResult>;

import type {VerificationEvidence} from './answerVerification.js';
export const elearningOutlineEvidenceMaxBytes:16000;
export type ElearningOutlineEvidenceAccount={url:string;key:string;token:string;user:{id:string};requestDeadline?:number};
export type ElearningOutlineEvidenceOptions={question?:string;route?:string;history?:Array<{role:string;content:string}>;deadline?:number};
export type ElearningOutlineEvidenceResult={readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;
  evidence:VerificationEvidence&{id:'account:elearningOutline';provenance:'saved_local'}};
export function unavailableElearningOutlineEvidence(reason:string):ElearningOutlineEvidenceResult;
export function readElearningOutlineEvidence(account:ElearningOutlineEvidenceAccount,options?:ElearningOutlineEvidenceOptions,dependencies?:{
  read?:(account:ElearningOutlineEvidenceAccount,query:{scope:'elearning-course-outline';course:string})=>Promise<unknown>;
}):Promise<ElearningOutlineEvidenceResult>;

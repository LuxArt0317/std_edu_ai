import type {TuitionDocumentsAccount} from './tuitionDocuments.js';
import type {VerificationEvidence} from './answerVerification.js';
export const tuitionEvidenceMaxBytes:16000;
export type TuitionEvidenceOptions={question?:string;route?:string;history?:{role:string;content:string}[];deadline?:number};
export type TuitionEvidenceResult={readState:'ok'|'empty'|'unavailable';reason:string|null;evidence:VerificationEvidence&{provenance:'local_demo'}};
export function isTuitionEvidenceQuestion(question:unknown,route?:string,history?:{role:string;content:string}[]):boolean;
export function readTuitionEvidence(account:TuitionDocumentsAccount,options?:TuitionEvidenceOptions,dependencies?:{load?:(account:TuitionDocumentsAccount)=>Promise<unknown>}):Promise<TuitionEvidenceResult>;

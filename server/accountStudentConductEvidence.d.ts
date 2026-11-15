import type {StudentConductAccount} from './studentConduct.js';
import type {VerificationEvidence} from './answerVerification.js';
export const studentConductEvidenceMaxBytes:16000;
export type StudentConductEvidenceOptions={question?:string;route?:string;history?:{role:string;content:string}[];deadline?:number};
export type StudentConductEvidenceResult={readState:'ok'|'empty'|'unavailable';reason:string|null;evidence:VerificationEvidence&{provenance:'local_demo'}};
export function isStudentConductEvidenceQuestion(question:unknown,route?:string,history?:{role:string;content:string}[]):boolean;
export function readStudentConductEvidence(account:StudentConductAccount,options?:StudentConductEvidenceOptions,dependencies?:{
  load?:(account:StudentConductAccount)=>Promise<unknown>;
  loadCount?:(account:StudentConductAccount)=>Promise<unknown>;
}):Promise<StudentConductEvidenceResult>;

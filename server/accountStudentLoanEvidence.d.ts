import type {StudentLoanAccount} from './studentLoan.js';
import type {VerificationEvidence} from './answerVerification.js';
export const studentLoanEvidenceMaxBytes:16000;
export type StudentLoanEvidenceOptions={question?:string;route?:string;history?:{role:string;content:string}[];deadline?:number};
export type StudentLoanEvidenceResult={readState:'ok'|'empty'|'unavailable';reason:string|null;evidence:VerificationEvidence&{provenance:'local_demo'}};
export function isStudentLoanEvidenceQuestion(question:unknown,route?:string,history?:{role:string;content:string}[]):boolean;
export function readStudentLoanEvidence(account:StudentLoanAccount,options?:StudentLoanEvidenceOptions,dependencies?:{load?:(account:StudentLoanAccount)=>Promise<unknown>}):Promise<StudentLoanEvidenceResult>;

import type {VerificationEvidence} from './answerVerification.js';
import type {StudentLeaveSelection} from './studentLeaveEvidenceIntent.js';

export const studentLeaveEvidenceLimits: Readonly<{rows:number;responseBytes:number;transportBytes:number;deadlineMs:number}>;
export type StudentLeaveEvidenceResult = {
  readState:'ok'|'empty'|'partial'|'unavailable'; reason:string|null; evidence:VerificationEvidence;
};
export function unavailableStudentLeaveEvidence(reason:unknown): StudentLeaveEvidenceResult;
export function readStudentLeaveEvidence(
  account:{user:{id:string};url:string;key:string;token:string;requestDeadline?:number},
  options:{selection:StudentLeaveSelection;deadline?:number},
  dependencies?:{fetchImpl?:typeof fetch},
): Promise<StudentLeaveEvidenceResult>;

import type {AffairsAccount} from './affairsWorkspace.js';
export type DtmSubmissionAccount=AffairsAccount&{requestDeadline?:number};
export const dtmSubmissionBucket:'dtm-submissions';
export const dtmSubmissionMaxBytes:10485760;
export const dtmSubmissionMaxPayloadBytes:12000;
export const dtmSubmissionStudentKinds:readonly string[];
export class DtmSubmissionError extends Error {status:number;constructor(message:string,status?:number);}
export function validateDtmSubmissionPayload(kind:string,payload:unknown):string|null;
export function executeDtmSubmissionAction(account:DtmSubmissionAccount,kind:string,payload:unknown):Promise<Record<string,unknown>>;
export function manageDtmSubmissionReview(account:DtmSubmissionAccount,kind:string,payload:unknown):Promise<Record<string,unknown>>;
export type DtmSubmissionFile={id:string;filename:string;sizeBytes:number;contentType:string;path:string;state:'pending'|'current'|'retired';expiresAt:string;committedAt:string|null};
export type DtmSubmissionWorkspace={assignmentId:string;userId:string;courseId:string;dueAt:string|null;maxBytes:number;submission:Record<string,unknown>|null;files:DtmSubmissionFile[];reviews:Record<string,unknown>[]};
export function loadDtmSubmissionWorkspace(account:DtmSubmissionAccount,assignmentId:string,options?:{admin?:boolean}):Promise<DtmSubmissionWorkspace>;
export function createDtmSubmissionDownload(account:DtmSubmissionAccount,assignmentId:string,uploadId:string):Promise<{uploadId:string;signedUrl:string;expiresIn:60}>;
export function cleanupDtmSubmissionUploads(account:DtmSubmissionAccount):Promise<{removed:number;remaining:number}>;

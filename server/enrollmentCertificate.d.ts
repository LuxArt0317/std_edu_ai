import type {AffairsAccount} from './affairsWorkspace.js';
import type {EnrollmentCertificateAssessment,EnrollmentCertificateRecords} from '../src/services/enrollmentCertificate.ts';
export type EnrollmentCertificateAccount=AffairsAccount&{requestDeadline?:number};
export type EnrollmentCertificateKind='save_enrollment_certificate_assessment'|'save_enrollment_certificate_document';
export type EnrollmentCertificateDocumentMetadata={id:string;userId:string;assessmentId:string;assessmentVersion:number;issuer:'stu.best';purpose:'local_enrollment_reference';status:'metadata_only'|'revoked';verifiedAt:null;expiresAt:string|null;sourceMode:'local_demo';version:number;createdAt:string;updatedAt:string};
export type EnrollmentCertificateAdminRecords={assessments:EnrollmentCertificateAssessment[];documents:[];documentMetadata:EnrollmentCertificateDocumentMetadata[]};
export const enrollmentCertificatePath:string;
export const enrollmentCertificateMaxPayloadBytes:number;
export const enrollmentCertificateKinds:readonly EnrollmentCertificateKind[];
export const enrollmentCertificateFields:Record<EnrollmentCertificateKind,readonly string[]>;
export const enrollmentCertificateReadSources:readonly {key:'assessments'|'documentMetadata';table:string;select:string;order:string}[];
export class EnrollmentCertificateError extends Error{status:number;constructor(message:string,status?:number);}
export function enrollmentCertificatePayloadBytes(value:unknown):number;
export function validateEnrollmentCertificatePayload(kind:unknown,value:unknown):string|null;
/** Never returns activatable documents; actual content verification is not implemented. */
export function loadEnrollmentCertificate(account:EnrollmentCertificateAccount):Promise<EnrollmentCertificateRecords>;
export function loadEnrollmentCertificateAdmin(account:EnrollmentCertificateAccount,options?:{userId?:string}):Promise<EnrollmentCertificateAdminRecords>;
export function manageEnrollmentCertificateRecord(account:EnrollmentCertificateAccount,kind:EnrollmentCertificateKind,payload:unknown):Promise<{id:string;kind:EnrollmentCertificateKind;version:number;summary:string}>;

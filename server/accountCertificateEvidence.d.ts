import type {EnrollmentCertificateAccount} from './enrollmentCertificate.js';

export type CertificateEvidenceReason='unauthorized'|'forbidden'|'invalid_context'|'invalid_deadline'|'deadline_exceeded'|'invalid_records'|'ambiguous_records'|'evidence_limit'|'record_changed'|'read_failed';
export type CertificateIdentityField='studentNumber'|'studentName'|'departmentName'|'yearText'|'classLabel';
/** Non-value metadata in successful evidence.content; omitted is not null. */
export type CertificateIdentityProjection={requestedFields:CertificateIdentityField[];omittedFields:CertificateIdentityField[];omissionReason:'not_requested';nullMeaning:'not_recorded'};
export type CertificateEvidenceResult={
  readState:'ok'|'empty'|'unavailable';reason:CertificateEvidenceReason|null;
  evidence:{id:'account:enrollmentCertificate';title:string;url:'/school-affairs/services/17-1';provenance:'local_demo';content:string};
};
export type CertificateEvidenceOptions={deadline?:number;question?:string;route?:string;history?:readonly {role:string;content:string}[]};
export const certificateEvidenceMaxBytes:12000;
export function isCertificateEvidenceQuestion(question:unknown,route?:unknown,history?:unknown):boolean;
/** The dependency is a personal reader, never an admin reader or writer.
 * Evidence projects only individually requested identity fields in certificate context.
 * Coordinated student identity lists share their explicit person qualifier.
 * Successful content includes identityProjection to distinguish omitted fields
 * from requested fields whose stored value is null, without disclosing values.
 * Caller credentials and requested identity fields are captured before awaiting. */
export function readCertificateEvidence(account:EnrollmentCertificateAccount,options?:CertificateEvidenceOptions,
  dependencies?:{load?:(account:EnrollmentCertificateAccount)=>Promise<unknown>}):Promise<CertificateEvidenceResult>;

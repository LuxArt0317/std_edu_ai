import type {StudentLeaveEvidenceResult} from './accountStudentLeaveEvidence.js';

export const leaveObservationHeader:string;
export type StudentLeaveBoundaryDisposition='navigation'|'foreign_request'|'invalid_route'|'ambiguous_selector'|
  'unsupported_operation'|'unsupported_field'|'requires_attendance_source'|'excluded';
export function studentLeaveObservationDigest(value:unknown):string;
export function studentLeaveRowsDigest(rows:Record<string,unknown>[]):string;
export function openStudentLeaveObservation(input:{
  body:unknown;
  identity?:{id:string;email?:string;runMarker?:unknown};
  correlationId:string;
}):null|{
  purpose:'read'|'boundary';
  finishBoundary(payload:unknown,disposition:StudentLeaveBoundaryDisposition):string|null;
  observe(reader:(dependency:{observeRead(digest:string):void})=>Promise<StudentLeaveEvidenceResult>):Promise<StudentLeaveEvidenceResult>;
  modelCompleted(operation:string):void;
  nativeCheckCompleted():void;
  finish(payload:unknown):string|null;
};

type StudentLeaveProbeScope={ownerId:string;runId:string;origin:string;sourceRevision:string;nonce:string};
type StudentLeaveProbeRequest={question:string;route:string;history:ReadonlyArray<{role:string;content:string}>;stream:false;consentedResearchUse:false};
type StudentLeaveProbeBinding=StudentLeaveProbeScope&{issuedAt:number;requestDigest:string};
export function createStudentLeaveProbe(scope:StudentLeaveProbeScope,request:StudentLeaveProbeRequest,key:string,now?:number):{
  binding:StudentLeaveProbeBinding;body:StudentLeaveProbeRequest&{evaluationLeaveProbe:string};
};
export function createStudentLeaveBoundaryProbe(scope:StudentLeaveProbeScope,request:StudentLeaveProbeRequest,key:string,now?:number):{
  binding:StudentLeaveProbeBinding&{purpose:'boundary'};body:StudentLeaveProbeRequest&{evaluationLeaveProbe:string};
};
export function verifyStudentLeaveObservation(input:{
  receipt:string|null;binding:StudentLeaveProbeBinding;correlationId:string|null;body:unknown;
},key:string):null|{
  binding:StudentLeaveProbeBinding;correlationId:string;attempts:Array<{reads:string[];evidenceDigest:string}>;
  completedModelOperations:string[];verificationMethod:'native-exact'|'model'|'none';responseDigest:string;
  boundaryDisposition?:StudentLeaveBoundaryDisposition;
};

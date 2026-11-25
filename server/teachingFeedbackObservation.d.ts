import type {readTeachingFeedbackEvidence,TeachingFeedbackEvidenceResult} from './accountTeachingFeedbackEvidence.js';
type Scope={ownerId:string;runId:string;origin:string;sourceRevision:string;nonce:string};
type Request={question:string;route:string;history:[];stream:false;consentedResearchUse:false};
type Binding=Scope&{issuedAt:number;requestDigest:string};
type Receipt={binding:Binding;correlationId:string;attempts:{reads:{view:'survey'|'immediate';digest:string}[];projectionDigest:string}[];modelOperations:string[];verificationMethod:'native-exact'|'model'|'none';responseDigest:string};
export const teachingObservationHeader:string;
export function teachingObservationDigest(value:unknown):string;
export function teachingReadDigest(view:'survey'|'immediate',dto:unknown):string;
export function teachingProjectionDigest(projection:unknown):string;
export function createTeachingProbe(scope:Scope,request:Request,key:string,now?:number):{binding:Binding;body:Request&{evaluationTeachingProbe:string}};
export function openTeachingObservation(input:{body:unknown;identity?:{id:string;email?:string;runMarker?:unknown};correlationId:string},env?:Record<string,string|undefined>,now?:number):{
  observe:(reader:(dependencies:NonNullable<Parameters<typeof readTeachingFeedbackEvidence>[2]>)=>Promise<TeachingFeedbackEvidenceResult>)=>Promise<TeachingFeedbackEvidenceResult>;
  modelCompleted:(operation:string)=>void;
  nativeCheckCompleted:()=>void;
  finish:(body:unknown,expectsRead:boolean)=>string|null;
}|null;
export function verifyTeachingObservation(input:{receipt:unknown;binding:Binding;correlationId:unknown;body:unknown},key:string):Receipt|null;

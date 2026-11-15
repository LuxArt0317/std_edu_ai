type Scope={ownerId:string;runId:string;origin:string;sourceRevision:string;nonce:string};
type Request={question:string;route:string;history:[];stream:false;consentedResearchUse:false};
type Binding=Scope&{issuedAt:number;requestDigest:string};
type Identity={id:string;email?:string;runMarker?:unknown};
type ReadResult={evidence:{content:string}};
type Receipt={binding:Binding;correlationId:string;attempts:{reads:string[];evidenceDigest:string}[];modelOperations:string[];verificationMethod:'native-exact'|'model'|'none';responseDigest:string};
export const internshipObservationHeader:'X-Internship-Observation';
export function internshipObservationDigest(value:unknown):string;
export function createInternshipProbe(scope:Scope,request:Request,key:string,now?:number):{binding:Binding;body:Request&{evaluationInternshipProbe:string}};
export function openInternshipObservation(input:{body:unknown;identity?:Identity;correlationId:string},env?:Record<string,string|undefined>,now?:number):{
  observe<T extends ReadResult>(reader:(dependencies:{observeRead:(read:unknown)=>void})=>Promise<T>):Promise<T>;
  modelCompleted(operation:string):void;
  nativeCheckCompleted():void;
  finish(payload:unknown,expectsRead:boolean):string|null;
}|null;
export function verifyInternshipObservation(input:{receipt:unknown;binding:Binding;correlationId:unknown;body:unknown},key:string):Receipt|null;

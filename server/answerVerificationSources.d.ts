import type {VerificationEvidence} from './answerVerification.js';
type Capture={source:string;aliases?:string[];file:string;route:string;checksum:string;capturedOn:string};
type SourceDependencies={captures?:Capture[];acquire?:(url:string,options?:Record<string,unknown>)=>Promise<{bytes:Uint8Array;mimeType:string;finalUrl:string}>;fetchCapture?:(url:string,options?:RequestInit)=>Promise<Response>};
export function readVerificationSources(citations:Array<{url:string;chunkId:string;title:string}>,deadline:number,dependencies?:SourceDependencies):Promise<VerificationEvidence[]>;

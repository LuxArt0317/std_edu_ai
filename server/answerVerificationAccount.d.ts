import type {VerificationCandidate,VerificationEvidence,VerificationProgress} from './answerVerification.js';
export const accountTools:Record<string,string>;
export const publicTopics:Record<string,string>;
export function requiredNativeTools(question:string,route?:string,history?:Array<{role:string;content:string}>):string[];
export function planAccountLookup(question:string,history:Array<{role:string;content:string}>,route:string,deadline:number,retry?:{previousTools:string[];feedback:string[]}):Promise<{tools:string[];publicTopics:string[];degraded?:boolean}>;
export type AccountReadContext={question?:string;route?:string;history?:Array<{role:string;content:string}>};
export function accountEvidence(snapshot:Record<string,any>,tools?:string[],context?:AccountReadContext):VerificationEvidence[];
export function lookupPublicTopics(topics:string[],deadline:number,onProgress?:(step:VerificationProgress)=>void):Promise<VerificationEvidence[]>;
export function answerAccountWithVerification(options:{question:string;snapshot:Record<string,any>;history?:Array<{role:string;content:string}>;route?:string;loadSnapshot:()=>Promise<Record<string,any>>;onProgress?:(step:VerificationProgress)=>void;deadline?:number}):Promise<VerificationCandidate>;

import type {VerificationContext,VerificationEvidence,VerificationCandidate} from './answerVerification.js';
export function answerLinksSupported(answer:string,evidence:VerificationEvidence[]):boolean;
export function snapshotProvenanceSupported(candidate:VerificationCandidate,evidence:VerificationEvidence[],sourceIds?:string[]):boolean;
export function verificationModelCall(name:string,schema:Record<string,any>,instructions:string,input:unknown,deadline:number,images?:Array<{dataUrl:string}>):Promise<any>;
export function validEvidence(evidence:VerificationEvidence[]):boolean;
export function reviewMatchesEvidence(review:unknown,evidence:VerificationEvidence[],hasImages?:boolean):boolean;
export function evidenceReferenceCatalog(evidence:VerificationEvidence[]):{format:'RFC6901';sources:Array<{evidenceId:string;jsonPaths:string[];partial:boolean}>;partial:boolean};
export function verifyEvidenceAnswer(context:VerificationContext,images?:Array<{dataUrl:string}>):Promise<{ok:boolean;reason:string;feedback?:string[]}>;
export function repairEvidenceAnswer(context:VerificationContext,images?:Array<{dataUrl:string}>):Promise<VerificationCandidate>;

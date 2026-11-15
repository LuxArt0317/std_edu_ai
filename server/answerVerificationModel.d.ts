import type {VerificationContext,VerificationEvidence,VerificationCandidate} from './answerVerification.js';
export function answerLinksSupported(answer:string,evidence:VerificationEvidence[]):boolean;
export function outlineAnswerLinksSupported(answer:string,evidence:VerificationEvidence[]):boolean;
export function snapshotProvenanceSupported(candidate:VerificationCandidate,evidence:VerificationEvidence[],sourceIds?:string[]):boolean;
export function verificationModelCall(name:string,schema:Record<string,any>,instructions:string,input:unknown,deadline:number,images?:Array<{dataUrl:string}>,deeperReview?:boolean,onProviderCompleted?:(operation:string)=>void):Promise<any>;
export function validEvidence(evidence:VerificationEvidence[]):boolean;
export function reviewMatchesEvidence(review:unknown,evidence:VerificationEvidence[],hasImages?:boolean):boolean;
export function evidenceReferenceCatalog(evidence:VerificationEvidence[]):{format:'RFC6901';sources:Array<{evidenceId:string;jsonPaths:string[];partial:boolean}>;partial:boolean};
export type AnswerResponseIntent='records'|'coaching'|'mixed';
/** A fresh server-generated random UUID, never an account or caller-supplied identifier. */
export type VerificationDiagnosticContext={correlationId:string;attempt?:1|2|3};
/** Resolved prior USER wording is reference context only, never factual evidence or authorization. */
export type GuidanceVerificationContext=VerificationContext & {responseIntent?:AnswerResponseIntent;history?:Array<{role:string;content:string}>;resolvedUserQuestion?:string;requiredEvidenceReferences?:ReadonlyArray<{id:string;paths:RegExp;label:string}>;diagnosticContext?:VerificationDiagnosticContext;deeperReview?:boolean;trackPublicCoverage?:boolean;afterVerifiedPartial?:boolean;onProviderCompleted?:(operation:string)=>void};
export function verifyEvidenceAnswer(context:GuidanceVerificationContext,images?:Array<{dataUrl:string}>):Promise<{ok:boolean;reason:string;feedback?:string[];missingRequestedCount?:number}>;
export function repairEvidenceAnswer(context:GuidanceVerificationContext,images?:Array<{dataUrl:string}>):Promise<VerificationCandidate>;
export function composeEvidenceAnswer(context:Omit<GuidanceVerificationContext,'candidate'> & {candidate?:VerificationCandidate},images?:Array<{dataUrl:string}>):Promise<VerificationCandidate>;

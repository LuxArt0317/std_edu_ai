export type VerificationEvidence = {id:string;content:string;url?:string;urls?:string[];title?:string};
export type VerificationCandidate = {answer:string;status:string;citations:any[];activity?:any[];grounding?:Record<string,any>;suggestedQuestions?:string[];proposedAction?:any;[key:string]:any};
export type VerificationContext = {question:string;candidate:VerificationCandidate;evidence:VerificationEvidence[];deadline:number;feedback?:string[]};
export type VerificationProgress = {kind:string;label:string;detail:string;status:'running'|'complete'|'unavailable'};
export function runAnswerVerification(options:{question:string;initialAnswer:VerificationCandidate;loadEvidence:(options:{attempt:number;deadline:number})=>Promise<VerificationEvidence[]>;verify:(context:VerificationContext)=>Promise<{ok:boolean;reason?:string}>;repair:(context:VerificationContext)=>Promise<VerificationCandidate>;onProgress?:(step:VerificationProgress)=>void;deadline?:number}):Promise<VerificationCandidate>;
export function unverifiedAnswer(question:string,candidate:VerificationCandidate,activity:VerificationProgress[],attempts:number,reason:string):VerificationCandidate;

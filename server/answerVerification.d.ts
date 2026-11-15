export type VerificationEvidence = {id:string;content:string;url?:string;urls?:string[];title?:string;capturedOn?:string};
export type VerificationCandidate = {answer:string;status:string;citations:any[];activity?:any[];grounding?:Record<string,any>;suggestedQuestions?:string[];proposedAction?:any;[key:string]:any};
export type VerificationContext = {question:string;candidate:VerificationCandidate;evidence:VerificationEvidence[];deadline:number;feedback?:string[]};
export type VerificationProgress = {kind:string;label:string;detail:string;status:'running'|'complete'|'unavailable'};
export type VerificationCheckContext = VerificationContext & {attempt:number};
export function runAnswerVerification(options:{question:string;initialAnswer:VerificationCandidate;loadEvidence:(options:{attempt:number;deadline:number;feedback?:string[];previousFailure?:string})=>Promise<VerificationEvidence[]>;verify:(context:VerificationCheckContext)=>Promise<{ok:boolean;reason?:string;feedback?:string[]}>;repair:(context:VerificationCheckContext)=>Promise<VerificationCandidate>;onProgress?:(step:VerificationProgress)=>void;allowDeeperReview?:boolean;deadline?:number}):Promise<VerificationCandidate>;
export function unverifiedAnswer(question:string,candidate:VerificationCandidate,activity:VerificationProgress[],attempts:number,reason:string):VerificationCandidate;

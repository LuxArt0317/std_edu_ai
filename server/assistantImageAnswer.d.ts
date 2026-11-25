import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
export function isImageDescriptionQuestion(question:unknown):boolean;
export function answerAttachedImage(options:{question:string;images:Array<{dataUrl:string;name:string}>;history:Array<{role:string;content:string}>;deadline:number;onProgress?:(step:VerificationProgress)=>void}):Promise<VerificationCandidate>;

import type {VerificationProgress} from './answerVerification.js';
export function conversationalGuidance<T extends {answer:string;[key:string]:any}>(question:string,history:Array<{role:string;content:string}>,reply:T,options?:{deadline?:number;onProgress?:(step:VerificationProgress)=>void}):Promise<T>;

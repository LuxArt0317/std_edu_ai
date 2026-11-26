import type {AffairsAccount} from './affairsWorkspace.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
export function answerWithApplicationApis(input:{account:AffairsAccount;question:string;history?:Array<{role:string;content:string}>;route?:string;deadline:number;onProgress?:(step:VerificationProgress)=>void},dependencies?:any):Promise<VerificationCandidate|null>;

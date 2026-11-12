import type {VerificationEvidence} from './answerVerification.js';
export function readVerificationSources(citations:Array<{url:string;chunkId:string;title:string}>,deadline:number):Promise<VerificationEvidence[]>;

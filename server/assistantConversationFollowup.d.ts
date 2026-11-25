import type {VerificationCandidate} from './answerVerification.js';
export function assistantConversationFollowup(question:unknown,history?:Array<{role:string;content:string}>):VerificationCandidate|null;

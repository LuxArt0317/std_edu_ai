import type {VerificationEvidence} from './answerVerification.js';
export function isPublicCommunicationQuestion(question:unknown):boolean;
export function publicCommunicationContext(question:unknown):{page:{title:string;route:string;source:string;capturedOn:string};contentAvailable:true;evidence:VerificationEvidence;additionalEvidence:VerificationEvidence[]}|null;

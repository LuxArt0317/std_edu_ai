import type {VerificationEvidence} from './answerVerification.js';
export function publicFundingIntent(question:unknown):'remission'|'scholarships'|null;
export function publicFundingContext(question:unknown):{page:{title:string;route:string;source:string;capturedOn:string};contentAvailable:true;evidence:VerificationEvidence;additionalEvidence:VerificationEvidence[]}|null;

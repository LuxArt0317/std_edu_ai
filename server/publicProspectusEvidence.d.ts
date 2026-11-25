import type {PublicPageContext} from './publicPageContext.js';
import type {VerificationEvidence} from './answerVerification.js';
export function publicProspectusContext(question:string,route?:string):(PublicPageContext & {additionalEvidence?:VerificationEvidence[]})|null;

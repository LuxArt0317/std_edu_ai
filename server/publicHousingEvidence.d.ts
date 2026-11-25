import type {PublicPageContext} from './publicPageContext.js';
import type {VerificationEvidence} from './answerVerification.js';
export function publicHousingContext(question:string):(PublicPageContext & {additionalEvidence:VerificationEvidence[]})|null;

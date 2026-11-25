import type {PublicPageContext} from './publicPageContext.js';
import type {VerificationEvidence} from './answerVerification.js';
export function publicTuitionContext(question:string):(PublicPageContext & {additionalEvidence:VerificationEvidence[]})|null;

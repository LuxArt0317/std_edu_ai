import type {PublicPageContext} from './publicPageContext.js';
import type {VerificationEvidence} from './answerVerification.js';
export type EnrollmentMilestone={role:string;locator:string;text:string;date:string};
export function isPublicEnrollmentDateQuestion(question:unknown):boolean;
export function extractEnrollmentMilestones(pages:Array<{locator:string;text:string}>):EnrollmentMilestone[];
export function publicEnrollmentContext(question:string,options?:{now?:Date}):(PublicPageContext&{additionalEvidence:VerificationEvidence[]})|null;

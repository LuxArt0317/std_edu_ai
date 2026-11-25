import type {PublicPageContext} from './publicPageContext.js';
import type {VerificationEvidence} from './answerVerification.js';
export function isPublicFacultyTrainingQuestion(question:unknown):boolean;
export function publicFacultyTrainingContext(question:string):(PublicPageContext&{additionalEvidence:VerificationEvidence[]})|null;
export function publicFacultyTrainingResponseNeeds(question:string,evidence:VerificationEvidence[]):string[];

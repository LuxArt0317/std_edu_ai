import type {PublicPageContext} from './publicPageContext.js';
export function isPublicContactDirectoryQuestion(question:unknown):boolean;
export function publicContactDirectoryContext(question:string):PublicPageContext|null;
export function publicContactDirectoryPageContext(route:unknown):PublicPageContext|null;
export function publicContactDirectoryResponseNeeds(question:string,evidence:import('./answerVerification.js').VerificationEvidence[]):string[];

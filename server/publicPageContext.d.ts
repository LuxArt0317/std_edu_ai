import type {VerificationCandidate,VerificationEvidence} from './answerVerification.js';
export type PublicCapture={source:string;title:string;route:string;file:string;checksum:string;capturedOn:string;aliases?:string[]};
export type PublicPageContext={page:Pick<PublicCapture,'title'|'route'|'source'|'capturedOn'>;contentAvailable:boolean;evidence:VerificationEvidence};
export function publicPageForRoute(route:unknown,pages?:PublicCapture[]):PublicCapture|null;
export function normalizePublicPageRoute(route:unknown):string;
export function isPublicPageQuestion(question:unknown):boolean;
export function loadPublicPageContext(route:string,deadline:number,dependencies?:{captures?:PublicCapture[];fetchCapture?:typeof fetch}):Promise<PublicPageContext|null>;
export function boundedPublicPageEvidence(context:PublicPageContext,options?:{budget?:number}):VerificationEvidence;
export function publicPageCandidate(context:PublicPageContext,question:string):VerificationCandidate;

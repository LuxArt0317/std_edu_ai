import type {PublicPageContext} from './publicPageContext.js';
import type {VerificationEvidence} from './answerVerification.js';
export function isPublicOfficeDirectionsQuestion(question:unknown):boolean;
export function loadOfficeDirectionsEvidence(loadPage:(route:string,deadline:number,options?:{includeContactSections:boolean;includeDirectoryLinks:boolean})=>Promise<unknown>,deadline:number):Promise<VerificationEvidence[]>;
export function publicOfficeCaptureRoute(question:string):string;
export function focusOfficeContactContext(context:PublicPageContext):PublicPageContext;

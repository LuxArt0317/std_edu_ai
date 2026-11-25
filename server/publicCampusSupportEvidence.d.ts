import type {PublicPageContext} from './publicPageContext.js';
import type {VerificationEvidence} from './answerVerification.js';
export const campusSupportRoute:string;
export const campusEmergencyRoute:string;
export function publicCampusSupportIntent(question:unknown):'lost-property'|'safety'|null;
export function focusCampusSupportContext(context:PublicPageContext):PublicPageContext;
export function loadCampusSupportEvidence(loadPage:(route:string,deadline:number,options?:{includeContactSections:boolean;includeDirectoryLinks:boolean})=>Promise<PublicPageContext|null>,deadline:number,intent?:'lost-property'|'safety'|null):Promise<VerificationEvidence[]>;

export function focusLostPropertyDirectoryContext(context:PublicPageContext):PublicPageContext;

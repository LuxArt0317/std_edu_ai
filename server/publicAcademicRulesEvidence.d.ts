import type {VerificationEvidence} from './answerVerification.js';
import type {PublicPageContext} from './publicPageContext.js';
export function isPublicGraduationAttendanceQuestion(question:unknown):boolean;
export function publicAcademicRulesContext(question:string):(PublicPageContext & {additionalEvidence:VerificationEvidence[]})|null;
export function academicContinuationPolicyProjection(document:{articles:Array<{article:string;pageNumbers:number[];text:string}>}):Array<{role:string;clauses:Array<{article:string;pageNumbers:number[];quote:string;applicability:Record<string,string>}>}>;

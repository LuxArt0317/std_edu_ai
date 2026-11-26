import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
import type {CourseSelectionReadScope} from './accountCourseSelectionRows.js';
import type {AffairsAccount} from './affairsWorkspace.js';
export type ExactCourseSelectionPlan={view:'history'|'timetable'|'remark';scope:CourseSelectionReadScope;
  chinese:boolean;ambiguous:boolean;course:string|null;remark:string|null;phaseNamesOnly:boolean;roomAndWeekdayOnly:boolean};
export function courseSelectionPageDisposition(question:string,route:string):{kind:'navigation'|'unsupported-write';url:string}|null;
export function courseSelectionWriteBoundary(url:string):VerificationCandidate;
export function selectExactCourseSelection(question:string,route:string,history?:Array<{role:string;content:string}>):ExactCourseSelectionPlan|null;
export function answerExactCourseSelection(options:{account:AffairsAccount;question:string;route:string;plan:ExactCourseSelectionPlan;deadline:number;
  onProgress?:(step:VerificationProgress)=>void}):Promise<VerificationCandidate>;

export function courseSelectionTermGuide(question:string,route:string,history?:Array<{role:string;content:string}>):VerificationCandidate|null;

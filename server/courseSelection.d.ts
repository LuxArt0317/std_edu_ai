import type {CourseSelectionRecords} from '../src/services/courseSelection';
export const courseSelectionPeriods:Array<{period:string;time:string}>;
export const courseSelectionNavigation:Array<{id:string;match:RegExp;title:string[];officialUrl:string;localUrl:string;description:string[]}>;
export function mapCourseSelection(rows:Record<string,unknown>[]):CourseSelectionRecords;
export function isCourseSelectionQuestion(question:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function answerCourseSelection(question:string,snapshot:{profile?:{userId?:string};courseSelection?:CourseSelectionRecords},route?:string,history?:Array<{role:string;content:string}>):{answer:string;title:string;url:string}|null;
export type CourseSelectionFilter={academicYear?:number;semester?:number;selectionPhase?:'initial'|'add_drop'|'withdrawal'|'summer1'};
export function courseSelectionFilters(text:string):CourseSelectionFilter & {ambiguousPhase:boolean;invalidSemester:boolean};

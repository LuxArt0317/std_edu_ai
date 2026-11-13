import type {SubstitutionDepartment,SubstitutionCourse,SubstitutionResult} from '../src/features/public/affairs/courseSubstitution.js';
type Selection={year:string;trackKey:string;departmentCode:string};
type Options={fetchSource?:typeof fetch;readSaved?:(selection:Selection)=>Promise<SubstitutionResult>};
export function parseSubstitutionResults(html:string,selection:{year:string;track:string;department:SubstitutionDepartment}):SubstitutionCourse[];
export function lookupCourseSubstitution(selection:Selection,options?:Options):Promise<SubstitutionResult>;
export function answerCourseSubstitution(selection:Selection&{code:string},question:string,lookup?:typeof lookupCourseSubstitution):Promise<Record<string,unknown>>;
export function serveCourseSubstitution(request:{method?:string;query?:Record<string,string|string[]|undefined>},response:{
  setHeader(name:string,value:string):void;
  status(code:number):{json(body:unknown):void};
}):Promise<void>;

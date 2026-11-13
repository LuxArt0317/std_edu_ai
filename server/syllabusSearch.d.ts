import type {AffairsAccount} from './affairsWorkspace.js';
import type {CourseOffering} from '../src/features/public/affairs/courseCatalogModel.js';
export type SyllabusAccount=AffairsAccount&{requestDeadline?:number};
export type SyllabusSearchScope='current'|'historical';
export type SyllabusSortKey='sequence'|'course_code'|'course_name'|'academicYearText'|'semesterText'|'admission_name'|'instructor';
export type SyllabusSearchRow={id:string;sequence:number;course_code:string;course_name:string;admission_name:string;instructor:string;academicYearText:string|null;semesterText:string|null};
export type SyllabusSearchResult={scope:SyllabusSearchScope;total:number;rows:SyllabusSearchRow[];page:number;pageSize:number;hasMore:boolean;sort:{key:SyllabusSortKey;direction:'asc'|'desc'};revision:string};
export type SyllabusSearchOptions={terms:{value:string;label:string}[];departments:{value:string;label:string}[]};
export type SyllabusMetadataPayload={id:string;request_id:string;expected_version:number;syllabus_is_current:boolean|null;academic_year_text:string|null;semester_text:string|null};
export const syllabusSearchPath:string;
export const syllabusMetadataKind:'save_syllabus_search_metadata';
export const syllabusSortKeys:readonly SyllabusSortKey[];
export class SyllabusSearchError extends Error{status:number;constructor(message:string,status?:number);}
export function normalizeSyllabusSearchQuery(query?:Record<string,string|string[]|undefined>):{p_filters:{scope:SyllabusSearchScope;keyword:string;term:string;department:string;themes:number[]};p_page:number;p_page_size:number;p_sort:SyllabusSortKey;p_direction:'asc'|'desc'};
export function validateSyllabusMetadataPayload(value:unknown):string|null;
export function loadSyllabusSearch(account:SyllabusAccount,query?:Record<string,string|string[]|undefined>):Promise<SyllabusSearchResult>;
export function loadSyllabusOptions(account:SyllabusAccount):Promise<SyllabusSearchOptions>;
export function loadSyllabusDetail(account:SyllabusAccount,id:string):Promise<{row:CourseOffering|null}>;
export function manageSyllabusMetadata(account:SyllabusAccount,payload:unknown):Promise<{id:string;kind:typeof syllabusMetadataKind;version:number;summary:string}>;

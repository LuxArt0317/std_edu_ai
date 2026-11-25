import type {AffairsAccount} from './affairsWorkspace.js';
export type DtmCourseResourceCourse={id:string;userId:string;title:string;code:string;term:string;sourceMode:'sample'|'personal'};
export type DtmCourseResourceMaterial={id:string;userId:string;courseId:string;title:string;kind:'page'|'file'|'assignment';summary:string;position:number;sourceMode:'sample'|'personal';sourceUrl:string|null;targetUrl:string|null};
export type DtmCourseResourceData={course:DtmCourseResourceCourse;material:DtmCourseResourceMaterial|null};
export type DtmCourseResourceAccount=AffairsAccount&{requestDeadline?:number};
export const dtmMaterialTargetUrlMaxLength:2048;
export const dtmCourseResourceMaxResponseBytes:196608;
export class DtmCourseResourceError extends Error{status:number;constructor(message:string,status?:number);}
/** null and the exact empty string clear the destination; accepted URLs retain their literal spelling. */
export function validateDtmMaterialTargetUrl(value:unknown):string|null;
export function parseDtmCourseResourceData(value:unknown,userId:string,courseId:string,materialId:string):DtmCourseResourceData;
export function loadDtmCourseResource(account:DtmCourseResourceAccount,options:{courseId:string;materialId:string}):Promise<DtmCourseResourceData>;

export type DtmStudyRecords = {
  courses: {
    id: string; user_id: string; code: string; title: string; term: string;
    source_mode: 'sample' | 'personal'; role: 'student' | 'teacher';
  }[];
  meetings: {
    id: string; course_id: string; meeting_on: string; starts_at: string;
    title: string; attendance: 'unknown' | 'present' | 'absent' | 'late' | 'excused';
    notes: string; dtm_courses: {id: string; user_id: string};
  }[];
  courseTotal: number;
  meetingTotal: number;
};
export function parseDtmStudyRecords(value: unknown, userId: string, courseId: string | null): DtmStudyRecords;
export function loadDtmStudyRecords(account: DtmCourseResourceAccount, courseId: string | null): Promise<DtmStudyRecords>;

export const dtmMaterialListLimit: 12;
export type DtmCourseMaterialList = {
  id: string;
  user_id: string;
  dtm_materials: {
    id: string; course_id: string; title: string; kind: 'page' | 'file' | 'assignment';
    source_mode: 'sample' | 'personal'; position: number;
  }[];
};
export function loadDtmCourseMaterialList(account: Parameters<typeof loadDtmCourseResource>[0], options: {courseId: string}): Promise<DtmCourseMaterialList>;
export function parseDtmCourseMaterialList(row: unknown, userId: string, courseId: string): DtmCourseMaterialList;
export const dtmAssignmentListLimit:20;
export type SavedDtmAssignmentList={rows:Array<{id:string;courseId:string;courseCode:string;title:string;sourceMode:'personal'|'sample';
  dueAt?:string|null;trackerStatus?:'open'|'submitted'|'graded'}>;total:number;courseScope:'selected'|'personal'|'sample'};
export function loadDtmAssignmentList(account:DtmCourseResourceAccount,options:{courseId:string|null;mode:'all'|'open'|'done'|'submitted'|'graded';
  period:string|null;dates:boolean;statuses:boolean;countOnly:boolean;asOf:number}):Promise<SavedDtmAssignmentList>;

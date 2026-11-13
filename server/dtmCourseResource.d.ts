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

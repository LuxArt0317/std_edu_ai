import type {AffairsAccount} from './affairsWorkspace.js';
export type DtmCourseContentActivityKind='assignment'|'material';
export type DtmCourseContentSection='assignments'|'quizzes'|'materials';
export type DtmCourseContentReference={kind:DtmCourseContentActivityKind;id:string;section:DtmCourseContentSection};
export type DtmCourseContent={references:DtmCourseContentReference[]};
export type DtmCourseContentRecord=DtmCourseContent&{id:string;userId:string;courseId:string;sourceMode:'local_demo';version:number;createdAt:string;updatedAt:string};
export type DtmCourseContentCourse={id:string;userId:string;title:string;code:string;term:string};
export type DtmCourseContentCursor={kind:DtmCourseContentActivityKind;id:string};
export type DtmCourseContentActivity=
  |{kind:'assignment';id:string;title:string;details:string;dueAt:string|null}
  |{kind:'material';id:string;title:string;materialKind:'page'|'file'|'assignment';summary:string;position:number;sourceMode:'sample'|'personal';sourceUrl:string|null};
export type DtmCourseContentData={course:DtmCourseContentCourse;content:DtmCourseContentRecord|null;activities:DtmCourseContentActivity[];total:number;limit:100;nextCursor:DtmCourseContentCursor|null;revision:string;unavailableReferenceCount:number};
export type DtmCourseContentCoursesData={courses:DtmCourseContentCourse[];limit:100;nextCursor:string|null};
export type DtmCourseContentAssignment={id:string;userId:string;courseId:string;title:string;details:string;dueAt:string|null;status:'open'|'submitted'|'graded';submittedAt:string|null;sourceMode:'sample'|'personal';meetingId:string|null;origin:'sample'|'manual'|'moodle_calendar'};
export type DtmCourseContentAssignmentData={assignment:DtmCourseContentAssignment|null};
export type DtmCourseContentKind='save_dtm_course_content'|'delete_dtm_course_content';
export type DtmCourseContentTarget={id:string;user_id:string;course_id:string;request_id:string;expected_version:number};
export type DtmCourseContentAction={kind:'save_dtm_course_content';payload:DtmCourseContentTarget&{content:DtmCourseContent}}|{kind:'delete_dtm_course_content';payload:DtmCourseContentTarget};
export type DtmCourseContentReceipt={id:string;userId:string;courseId:string;kind:DtmCourseContentKind;version:number;summary:string};
export type DtmCourseContentAccount=AffairsAccount&{requestDeadline?:number};
export type DtmCourseContentPageOptions={courseId:string;afterKind?:DtmCourseContentActivityKind;afterId?:string};
export const dtmCourseContentKinds:readonly DtmCourseContentKind[];
export const dtmCourseContentMaxPayloadBytes:131072;
export const dtmCourseContentMaxResponseBytes:196608;
export const dtmCourseContentMaxReferences:1000;
export class DtmCourseContentError extends Error{status:number;constructor(message:string,status?:number);}
export function dtmCourseContentPayloadBytes(value:unknown):number;
export function validateDtmCourseContent(value:unknown):string|null;
export function validateDtmCourseContentPayload(kind:unknown,value:unknown):string|null;
export function parseDtmCourseContentData(value:unknown,userId:string,courseId:string,cursor?:DtmCourseContentCursor):DtmCourseContentData;
export function parseDtmCourseContentCoursesData(value:unknown,userId:string,afterId?:string):DtmCourseContentCoursesData;
export function parseDtmCourseContentAssignmentData(value:unknown,userId:string,courseId:string,assignmentId:string):DtmCourseContentAssignmentData;
export function parseDtmCourseContentReceipt(value:unknown,kind:DtmCourseContentKind,payload:DtmCourseContentTarget):DtmCourseContentReceipt;
export function loadDtmCourseContent(account:DtmCourseContentAccount,options:DtmCourseContentPageOptions):Promise<DtmCourseContentData>;
export function loadDtmCourseContentAdmin(account:DtmCourseContentAccount,options:DtmCourseContentPageOptions&{userId:string}):Promise<DtmCourseContentData>;
export function loadDtmCourseContentCoursesAdmin(account:DtmCourseContentAccount,options:{userId:string;afterId?:string}):Promise<DtmCourseContentCoursesData>;
export function loadDtmCourseContentAssignment(account:DtmCourseContentAccount,options:{courseId:string;assignmentId:string}):Promise<DtmCourseContentAssignmentData>;
export function manageDtmCourseContent(account:DtmCourseContentAccount,kind:DtmCourseContentKind,payload:unknown):Promise<DtmCourseContentReceipt>;

import type {DtmCourseContentAccount,DtmCourseContentAssignmentData} from './dtmCourseContent.js';
export type DtmAssignmentEvidenceResult={readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;evidence:{id:'account:dtmAssignment';title:string;url:string;content:string}};
export const dtmAssignmentEvidenceMaxBytes:12000;
export function unavailableDtmAssignmentEvidence(reason:string):DtmAssignmentEvidenceResult;
export function readDtmAssignmentEvidence(account:DtmCourseContentAccount,options?:{question?:string;route?:string;history?:Array<{role:string;content:string}>;deadline?:number},dependencies?:{load?:(account:DtmCourseContentAccount,target:{courseId:string;assignmentId:string})=>Promise<DtmCourseContentAssignmentData>}):Promise<DtmAssignmentEvidenceResult>;
export function parseDtmAssignmentEvidence(result:unknown):Record<string,any>|null;

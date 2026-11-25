import type {AcademicAttendanceQuery} from './academicAttendance.js';
import type {AcademicGradesRecords} from '../src/services/academicGrades.ts';
import type {GraduationReviewRecords} from '../src/services/graduationReview.ts';
import type {AcademicAttendanceRecords} from '../src/services/academicAttendance.ts';
type Collections={academicGrades:AcademicGradesRecords;graduationReview:GraduationReviewRecords;academicAttendance:AcademicAttendanceRecords};
/** Reader results are untrusted until all source rows and mapping counts pass validation. Rejects malformed own or admin sources. */
export function loadNativeAcademicRecords(userId:string,includeAdmin:boolean,readRows:(table:string,query:Record<string,string>)=>Promise<unknown>):Promise<{
  own:Collections;admin?:Collections;adminUserIds:string[];completeness:Record<string,{returned:number;complete:true}>;
}>;
export function loadNativeGradeView(userId:string,view:string,readRows:(table:string,query:Record<string,string>)=>Promise<unknown>):Promise<AcademicGradesRecords>;
export function loadNativeAttendanceView(userId:string,question:string,route:string,readRows:(table:string,query:Record<string,string>)=>Promise<unknown>):Promise<{selection:AcademicAttendanceQuery;records:AcademicAttendanceRecords}>;

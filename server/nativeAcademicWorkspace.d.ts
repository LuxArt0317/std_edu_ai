import type {AcademicGradesRecords} from '../src/services/academicGrades.ts';
import type {GraduationReviewRecords} from '../src/services/graduationReview.ts';
import type {AcademicAttendanceRecords} from '../src/services/academicAttendance.ts';
type Collections={academicGrades:AcademicGradesRecords;graduationReview:GraduationReviewRecords;academicAttendance:AcademicAttendanceRecords};
/** Reader results are untrusted until all source rows and mapping counts pass validation. Rejects malformed own or admin sources. */
export function loadNativeAcademicRecords(userId:string,includeAdmin:boolean,readRows:(table:string,query:Record<string,string>)=>Promise<unknown>):Promise<{
  own:Collections;admin?:Collections;adminUserIds:string[];completeness:Record<string,{returned:number;complete:true}>;
}>;

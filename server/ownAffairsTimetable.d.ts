import type {AffairsAccount} from './affairsWorkspace.js';
export const ownAffairsTimetableLimits:Readonly<{rows:200;pageRows:100;responseBytes:131072;deadlineMs:12000}>;
export type OwnTimetableCourse={enrollmentId:string;status:'enrolled';sourceMode:'sample'|'verified';code:string;title:string;term:string;
  termStartsOn:string;termEndsOn:string;weekday:number;startsAt:string;endsAt:string;room:string};
export type OwnAffairsTimetable={profile:{userId:string};checkedAt:string;source:'stu.best School Affairs';officialUniversityData:false;
  studentRecordFound:boolean;courses:OwnTimetableCourse[];completeness:{courses:{scope:'owned_enrolled_timetable';returned:number;complete:boolean;
    cap:200;reason:null|'student_unlinked';meaning:string}}};
/** Read-only, existing-caller JWT transport. The account must already be
 * verified by the API. No initializer, role/grant, profile identity, grades,
 * attendance, DTM or broad catalog request is performed. Request credentials
 * and deadline are captured before I/O; callers cannot select another student.
 * A successful missing student is explicit. Failed/denied/capped/malformed
 * reads throw AffairsWorkspaceError and never return apparent zero classes.
 * The inherited deadline and 12-second shared bound include response streaming.
 * Sub-minute schedules are rejected instead of rounded by the minute scheduler.
 * Optional expectedStudentId is a private consistency assertion from a prior
 * verified own lookup (null means expected unlinked). It never changes the
 * caller-user filter, and a mismatch stops before reading enrollments. The
 * captured ID is never returned to a model or rendered in the snapshot.
 */
export function loadOwnAffairsTimetable(account:AffairsAccount&{requestDeadline?:number},options?:{deadline?:number;expectedStudentId?:string|null},
  dependencies?:{fetchImpl?:typeof fetch}):Promise<OwnAffairsTimetable>;

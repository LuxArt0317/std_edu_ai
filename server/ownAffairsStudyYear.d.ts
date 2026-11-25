import type {AffairsAccount} from './affairsWorkspace.js';
export const ownAffairsStudyYearLimits:Readonly<{rows:1;responseBytes:4096;deadlineMs:12000}>;
export type OwnAffairsStudyYear={profile:{userId:string};checkedAt:string;source:'stu.best School Affairs';officialUniversityData:false;
  studentRecordFound:boolean;student:null|{yearLevel:number;sourceMode:'sample'|'verified'}};
/** Caller is already verified by the API. One exact caller-filtered GET reads
 * user_id/year_level/source_mode only; response must prove total zero or one.
 * Stored year is literal 1..8. No calendar/course-derived year, identity data,
 * initializer, broad snapshot or official synchronization claim is supplied.
 * Successful no-row read returns studentRecordFound:false and student:null.
 * Unavailable, denied, malformed, oversized or expired reads throw a safe
 * AffairsWorkspaceError; they are never represented as a missing student.
 * Captures caller credentials before I/O. Inherited deadline and 12s cap cover
 * response streaming, including a transport that ignores abort.
 */
export function loadOwnAffairsStudyYear(account:AffairsAccount&{requestDeadline?:number},options?:{deadline?:number},
  dependencies?:{fetchImpl?:typeof fetch}):Promise<OwnAffairsStudyYear>;

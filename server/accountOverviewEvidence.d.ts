import type {AffairsAccount} from './affairsWorkspace.js';
import type {OwnTimetableCourse} from './ownAffairsTimetable.js';
export const accountOverviewLimits:Readonly<{deadlineMs:12000;responseBytes:24576;readBytes:262144;dtmCourses:200}>;
export type OverviewSourceState={readState:'ok'|'empty'|'partial'|'unavailable';total:number|null;included:number;complete:boolean;reason:string|null};
export type AccountOverviewSnapshot={checkedAt:string;source:'stu.best School Affairs';officialUniversityData:false;overviewScope:true;
  profile:{userId:string;displayName?:string};student:{yearLevel:number;sourceMode:'sample'|'verified';program:string;programSourceMode:'sample'|'verified'}|null;
  profileRecordFound:boolean|null;studentRecordFound:boolean|null;courses:OwnTimetableCourse[];
  dtm:{courses:{id:string;code:string;title:string;term:string;sourceMode:'sample'|'personal'}[]};
  overview:Record<'profile'|'courses'|'dtm'|'assignments'|'charges'|'tasks'|'requests',OverviewSourceState>;meaning:string};
/** Read-only fixed-project caller snapshot. Uses GET for bounded metadata and
 * HEAD/limit=0/count=exact for four private collection counts. Does not initialize
 * accounts or read private tracker/request text, grades, notes, materials, or
 * unrequested native services. Missing student and failed reads remain explicit;
 * absence never stands in for unavailable. The consumer must use overview counts,
 * not invent placeholder arrays or derive counts from absent collections.
 * The verified caller's credentials and shared <=12s deadline are captured before
 * I/O. Concurrent reads are not an atomic snapshot. No runtime mount is implied. */
export function loadAccountOverviewSnapshot(account:AffairsAccount&{requestDeadline?:number},options?:{deadline?:number},
  dependencies?:{fetchImpl?:typeof fetch}):Promise<AccountOverviewSnapshot>;

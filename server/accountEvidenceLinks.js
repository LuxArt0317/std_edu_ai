import {schoolServiceEntries,studentServiceByKey} from '../src/features/public/affairs/studentServices.js';
import {studentAidPath} from '../src/features/public/affairs/studentAidLinks.js';
import {academicGradesPaths} from './academicGrades.js';
import {graduationReviewPaths} from './graduationReview.js';
import {academicAttendancePaths} from './academicAttendance.js';

const fixed = new Map(Object.entries({
  profile:['/school-affairs/records'],courses:['/school-affairs/records'],
  assignments:['/dtm/assignments','/dtm','/dtm/dashboard'],
  dtm:['/dtm','/dtm/dashboard','/dtm/assignments','/dtm/grades'],
  charges:['/school-affairs/services/39-1'],tasks:['/school-affairs/records'],
  requests:['/school-affairs/records'],serviceRecords:['/school-affairs/records'],
  announcements:['/school-affairs'],scholarship:['/school-affairs/services/9-1'],
  studentAid:[studentAidPath],housing:['/school-affairs/services/26-1','/school-affairs/services/34-1'],
  creditLoadHistory:['/school-affairs/services/11-3'],courseSelection:['/school-affairs/services/11-1','/school-affairs/services/11-2'],
  academicGrades:Object.values(academicGradesPaths),
  graduationReview:[...Object.values(graduationReviewPaths),'/school-affairs/services/15-1'],
  academicAttendance:Object.values(academicAttendancePaths),
}));
const services = new Map(schoolServiceEntries.map(entry=>[entry.id,entry.localUrl]));
for(const key of ['leave','internship'])services.set(key,studentServiceByKey(key).localUrl);
const serviceRoutes = new Set(services.values());
const reservedIds = new Set(['__proto__','prototype','constructor']);
const segment = id=>typeof id==='string'&&/^[\p{L}\p{N}_-][\p{L}\p{M}\p{N}_-]{0,127}$/u.test(id)&&!reservedIds.has(id)
  ?encodeURIComponent(id):null;
const rows = value=>Array.isArray(value)?value.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)):[];
const parentMatches=(row,id)=>['courseId','course_id','dtmCourseId','dtm_course_id'].every(field=>row[field]==null||row[field]===id);
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');

function dtmCandidates(records){
  const courses=rows(records?.courses).filter(row=>segment(row.id));
  const paths=courses.map(course=>'/dtm/course/'+segment(course.id));
  const childGroups=courses.map((course,index)=>{
    const path=paths[index];
    const groups=[['meetings','meeting'],['grades','grade'],['assignments','assignment']].map(([kind,anchor])=>
      rows(course[kind]).filter(row=>segment(row.id)&&parentMatches(row,course.id)).map(row=>`${path}/${kind}#${anchor}-${segment(row.id)}`));
    // Interleave types so one long meeting history cannot hide every grade.
    const merged=[];
    for(let i=0;i<Math.max(0,...groups.map(group=>group.length));i++)for(const group of groups)if(group[i])merged.push(group[i]);
    return merged;
  });
  const children=[];
  // Interleave courses for the same reason; no course gets all available slots.
  for(let i=0;i<Math.max(0,...childGroups.map(group=>group.length));i++)for(const group of childGroups)if(group[i])children.push(group[i]);
  return [...paths,...children,...paths.flatMap(path=>['/materials','/meetings','/assignments','/grades'].map(suffix=>path+suffix))];
}
function assignmentCandidates(records){
  const included=rows(records).filter(row=>segment(row.dtmCourseId));
  const paths=[...new Set(included.map(row=>'/dtm/course/'+segment(row.dtmCourseId)))];
  const details=included.filter(row=>segment(row.id)).flatMap(row=>{
    const path='/dtm/course/'+segment(row.dtmCourseId),id=segment(row.id);
    return [path+'/assignments#assignment-'+id,path+'/assignment/'+id];
  });
  // A meeting pointer is not a retrieved meeting record. Only the assignment
  // and its own parent course are safe citation destinations here.
  return [...paths,...details,...paths.map(path=>path+'/assignments')];
}

/**
 * Local citation destinations for an already-owned, already-projected excerpt.
 * Pass raw bounded domain records, never a full snapshot or an excerpt wrapper.
 * No omitted course, assignment, service row or external stored URL is visited.
 * The returned array's complete JSON encoding obeys both count and UTF-8 limits.
 */
export function selectedEvidenceLinks(key,boundedRecords,{primaryUrl,maxBytes=2000,maxLinks=24}={}){
  if(!fixed.has(key))throw new TypeError('Unknown account evidence collection.');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<2||!Number.isSafeInteger(maxLinks)||maxLinks<0)throw new RangeError('Link limits must be whole non-negative counts and at least two JSON bytes.');
  const candidates=[...fixed.get(key),...(key==='dtm'?dtmCandidates(boundedRecords):key==='assignments'?assignmentCandidates(boundedRecords):
    key==='serviceRecords'?rows(boundedRecords).map(row=>services.get(row.serviceKey)).filter(Boolean):[])];
  const allowed=new Set(candidates);
  // A known empty service may still be the user's requested primary page.
  if(key==='serviceRecords')for(const path of serviceRoutes)allowed.add(path);
  if(primaryUrl!==undefined&&(typeof primaryUrl!=='string'||!allowed.has(primaryUrl)))throw new TypeError('The primary evidence URL is not an allowed local destination for this excerpt.');
  if(primaryUrl!==undefined&&(maxLinks<1||bytes([primaryUrl])>maxBytes))throw new RangeError('The primary evidence URL does not fit the requested link budget.');
  const result=primaryUrl===undefined?[]:[primaryUrl],seen=new Set(result);
  for(const candidate of candidates){
    if(result.length===maxLinks)break;
    if(seen.has(candidate))continue;
    if(bytes([...result,candidate])>maxBytes)continue;
    result.push(candidate);seen.add(candidate);
  }
  return result;
}

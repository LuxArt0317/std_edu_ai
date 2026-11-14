import {createHash} from 'node:crypto';

// Offline contract only. A future adapter must perform the complete read scope
// below with a disposable caller, then independently read back its owned rows.
// This module never reads credentials, queries a database, or creates records.
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const keys=(value,expected)=>object(value)&&Object.keys(value).length===expected.length&&expected.every(key=>Object.hasOwn(value,key));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const sampleEnrollmentManifest=freeze({
  version:1,
  sourceMigrations:['20261105010000_school_affairs_workspace.sql','20261106010000_affairs_academic_records.sql'],
  scope:{id:'sample-enrollment-initializer-union-v1',fallTermCode:'SAMPLE-2026-FALL',academicSeedCourseCodes:['SAMP090','SAMP103','SAMP201']},
  program:{code:'SAMPLE-GEN',name:'Sample General Studies',department:'Sample Academic Office',sourceMode:'sample'},
  terms:[
    {code:'SAMPLE-2026-FALL',label:'Sample Fall 2026',startsOn:'2026-09-07',endsOn:'2027-01-15',sourceMode:'sample'},
    {code:'SAMPLE-2026-SPRING',label:'Sample Spring 2026',startsOn:'2026-02-16',endsOn:'2026-06-26',sourceMode:'sample'},
    {code:'SAMPLE-2027-SPRING',label:'Sample Spring 2027',startsOn:'2027-02-15',endsOn:'2027-06-25',sourceMode:'sample'},
  ],
  courses:[
    {code:'SAMP101',title:'Campus Orientation',credits:2,termCode:'SAMPLE-2026-FALL',weekday:1,startsAt:'09:00:00',endsAt:'10:30:00',room:'Sample Room 101',status:'enrolled',period:'current'},
    {code:'SAMP102',title:'Digital Learning Basics',credits:3,termCode:'SAMPLE-2026-FALL',weekday:3,startsAt:'13:00:00',endsAt:'14:30:00',room:'Sample Room 203',status:'enrolled',period:'current'},
    {code:'SAMP103',title:'Student Services Practice',credits:2,termCode:'SAMPLE-2026-FALL',weekday:5,startsAt:'10:00:00',endsAt:'11:30:00',room:'Sample Room 305',status:'enrolled',period:'current'},
    {code:'SAMP090',title:'Study Skills Foundations',credits:2,termCode:'SAMPLE-2026-SPRING',weekday:2,startsAt:'09:00:00',endsAt:'10:30:00',room:'Sample Room 104',status:'completed',period:'historical'},
    {code:'SAMP201',title:'Applied Digital Projects',credits:3,termCode:'SAMPLE-2027-SPRING',weekday:2,startsAt:'14:00:00',endsAt:'15:30:00',room:'Sample Lab 202',status:'enrolled',period:'upcoming'},
  ].map(course=>({...course,sectionCode:'A',instructor:'Sample instructor',sourceMode:'sample'})),
  validity:{timeZone:'Asia/Taipei',startsAt:'2026-09-06T16:00:00.000Z',expiresAt:'2027-01-15T16:00:00.000Z',expiresExclusive:true},
  exclusions:['No DB301 or other legacy golden is relabelled or rebound.','No official enrollment, qualifications or complete school history is established.','Grades, attendance, assignments, charges and student identity are not part of this binding.'],
});

export const sampleEnrollmentSharedFields=freeze([
  'sectionId','courseId','termId','programId','code','title','credits','courseSourceMode',
  'programCode','programName','department','programSourceMode','termCode','termLabel','termStartsOn','termEndsOn','termSourceMode',
  'sectionCode','instructor','weekday','startsAt','endsAt','room','sectionSourceMode',
]);
const messages=Object.freeze({
  'input-invalid':'The sample enrollment binding input is invalid.',
  'read-incomplete':'The complete initializer union must be read before binding sample enrollments.',
  'initializer-universe-mismatch':'Shared rows do not exactly equal the reviewed five-section initializer universe.',
  'shared-row-mismatch':'A shared sample course, section, term or program field differs from the reviewed migration.',
  'shared-identity-invalid':'Shared section, course, term or program identities are invalid or inconsistent.',
  'owned-identity-invalid':'Disposable owner, student or enrollment identities are invalid or overlap shared identities.',
  'fixture-window-not-started':'The literal Fall 2026 sample-enrollment evaluation window has not started.',
  'fixture-window-expired':'The literal Fall 2026 sample-enrollment evaluation window has expired; dates must not be rebased.',
});
function fail(reason){const error=new Error(messages[reason]);error.name='PublishedSampleEnrollmentBindingError';error.code='fixture-unsupported';error.reason=reason;throw error;}
const requireValue=(condition,reason)=>{if(!condition)fail(reason);};

function checkedTime(now){
  requireValue(typeof now==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(now),'input-invalid');
  const time=Date.parse(now);
  requireValue(Number.isFinite(time)&&(new Date(time).toISOString()===now||new Date(time).toISOString().replace('.000Z','Z')===now),'input-invalid');
  if(time<Date.parse(sampleEnrollmentManifest.validity.startsAt))fail('fixture-window-not-started');
  if(time>=Date.parse(sampleEnrollmentManifest.validity.expiresAt))fail('fixture-window-expired');
  return {checkedAt:new Date(time).toISOString(),campusDay:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time))};
}

/**
 * read.rows must be the entire JOIN scope:
 *   term.code = SAMPLE-2026-FALL OR course.code IN (SAMP090,SAMP103,SAMP201).
 * A code-filtered five-row lookup is insufficient: the initializer also enrolls
 * every other Fall section and every section of the academic seed courses.
 * Completeness is an adapter obligation, never inferred here from a row count.
 *
 * IDs are binding inputs, not evidence that an account is disposable. A future
 * adapter remains responsible for fresh-user fencing, owner guards and cleanup.
 * Returned rows are a plan only; no mutation or successful initialization occurs.
 */
export function bindPublishedSampleEnrollments(read,{userId,studentId,enrollmentIdsByCode,now}={}){
  requireValue(keys(read,['scope','complete','rows']),'input-invalid');
  const scope=sampleEnrollmentManifest.scope;
  requireValue(keys(read.scope,['id','fallTermCode','academicSeedCourseCodes'])&&read.scope.id===scope.id&&read.scope.fallTermCode===scope.fallTermCode
    &&Array.isArray(read.scope.academicSeedCourseCodes)&&JSON.stringify(read.scope.academicSeedCourseCodes)===JSON.stringify(scope.academicSeedCourseCodes)
    &&read.complete===true,'read-incomplete');
  const time=checkedTime(now),courses=sampleEnrollmentManifest.courses;
  requireValue(Array.isArray(read.rows)&&read.rows.length===courses.length,'initializer-universe-mismatch');
  requireValue(uuid(userId)&&uuid(studentId)&&userId!==studentId&&keys(enrollmentIdsByCode,courses.map(course=>course.code)),'owned-identity-invalid');
  const ownedIds=[userId,studentId,...courses.map(course=>enrollmentIdsByCode[course.code])];
  requireValue(ownedIds.every(uuid)&&new Set(ownedIds).size===ownedIds.length,'owned-identity-invalid');
  requireValue(read.rows.every(row=>keys(row,sampleEnrollmentSharedFields)),'shared-row-mismatch');
  requireValue(new Set(read.rows.map(row=>row.code)).size===courses.length&&read.rows.every(row=>courses.some(course=>course.code===row.code)),'initializer-universe-mismatch');
  const sectionIds=new Set(),courseIds=new Set(),termIds=new Map(),programIds=new Set(),sharedRows=[];
  for(const expected of courses){
    const row=read.rows.find(item=>item.code===expected.code),term=sampleEnrollmentManifest.terms.find(item=>item.code===expected.termCode),program=sampleEnrollmentManifest.program;
    const literal={code:expected.code,title:expected.title,credits:expected.credits,courseSourceMode:expected.sourceMode,
      programCode:program.code,programName:program.name,department:program.department,programSourceMode:program.sourceMode,
      termCode:term.code,termLabel:term.label,termStartsOn:term.startsOn,termEndsOn:term.endsOn,termSourceMode:term.sourceMode,
      sectionCode:expected.sectionCode,instructor:expected.instructor,weekday:expected.weekday,startsAt:expected.startsAt,endsAt:expected.endsAt,room:expected.room,sectionSourceMode:expected.sourceMode};
    requireValue(Object.entries(literal).every(([key,value])=>row[key]===value),'shared-row-mismatch');
    requireValue([row.sectionId,row.courseId,row.termId,row.programId].every(uuid)&&!sectionIds.has(row.sectionId)&&!courseIds.has(row.courseId),'shared-identity-invalid');
    if(termIds.has(term.code))requireValue(termIds.get(term.code)===row.termId,'shared-identity-invalid');
    sectionIds.add(row.sectionId);courseIds.add(row.courseId);termIds.set(term.code,row.termId);programIds.add(row.programId);
    sharedRows.push({sectionId:row.sectionId,courseId:row.courseId,termId:row.termId,programId:row.programId,...literal});
  }
  requireValue(programIds.size===1&&termIds.size===3&&new Set(termIds.values()).size===3,'shared-identity-invalid');
  const sharedIds=[...sectionIds,...courseIds,...termIds.values(),...programIds];
  requireValue(new Set(sharedIds).size===sharedIds.length,'shared-identity-invalid');
  requireValue(!ownedIds.some(id=>sharedIds.includes(id)),'owned-identity-invalid');
  const enrollments=courses.map((course,index)=>({id:enrollmentIdsByCode[course.code],student_id:studentId,section_id:sharedRows[index].sectionId,status:course.status,source_mode:'sample'}));
  const expectedCourses=courses.map((course,index)=>{const row=sharedRows[index];return {enrollmentId:enrollmentIdsByCode[course.code],status:course.status,sourceMode:'sample',code:course.code,title:course.title,credits:course.credits,
    term:row.termLabel,termStartsOn:row.termStartsOn,termEndsOn:row.termEndsOn,instructor:course.instructor,weekday:course.weekday,startsAt:course.startsAt,endsAt:course.endsAt,room:course.room};});
  return freeze({
    binding:{version:1,scope:{...scope,academicSeedCourseCodes:[...scope.academicSeedCourseCodes]},sharedDigest:digest(sharedRows),...time,
      validity:{...sampleEnrollmentManifest.validity},owner:{userId,studentId},
      sections:sharedRows.map(row=>({code:row.code,sectionId:row.sectionId,courseId:row.courseId,termId:row.termId,programId:row.programId})),
      initializer:{fall:sharedRows.filter(row=>row.termCode===scope.fallTermCode).map(row=>row.sectionId),academicSeed:sharedRows.filter(row=>scope.academicSeedCourseCodes.includes(row.code)).map(row=>row.sectionId),union:sharedRows.map(row=>row.sectionId)},
      expectedSets:{current:['SAMP101','SAMP102','SAMP103'],historical:['SAMP090'],upcoming:['SAMP201']},
    },enrollments,expectedCourses,
  });
}

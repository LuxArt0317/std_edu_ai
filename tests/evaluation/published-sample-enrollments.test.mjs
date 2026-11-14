import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {bindPublishedSampleEnrollments,sampleEnrollmentManifest,sampleEnrollmentSharedFields} from './published-sample-enrollments.mjs';

// These goldens are deliberately independent of the binder's exported manifest
// and of all runtime answer, calendar and database-mapper helpers.
const id=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');
const currentTime='2026-11-13T02:00:00Z';
const terms={
  'SAMPLE-2026-FALL':{termId:id(901),termLabel:'Sample Fall 2026',termStartsOn:'2026-09-07',termEndsOn:'2027-01-15'},
  'SAMPLE-2026-SPRING':{termId:id(902),termLabel:'Sample Spring 2026',termStartsOn:'2026-02-16',termEndsOn:'2026-06-26'},
  'SAMPLE-2027-SPRING':{termId:id(903),termLabel:'Sample Spring 2027',termStartsOn:'2027-02-15',termEndsOn:'2027-06-25'},
};
const literalRows=[
  ['SAMP101','Campus Orientation',2,'SAMPLE-2026-FALL',1,'09:00:00','10:30:00','Sample Room 101'],
  ['SAMP102','Digital Learning Basics',3,'SAMPLE-2026-FALL',3,'13:00:00','14:30:00','Sample Room 203'],
  ['SAMP103','Student Services Practice',2,'SAMPLE-2026-FALL',5,'10:00:00','11:30:00','Sample Room 305'],
  ['SAMP090','Study Skills Foundations',2,'SAMPLE-2026-SPRING',2,'09:00:00','10:30:00','Sample Room 104'],
  ['SAMP201','Applied Digital Projects',3,'SAMPLE-2027-SPRING',2,'14:00:00','15:30:00','Sample Lab 202'],
];
function readFixture(){return {scope:{id:'sample-enrollment-initializer-union-v1',fallTermCode:'SAMPLE-2026-FALL',academicSeedCourseCodes:['SAMP090','SAMP103','SAMP201']},complete:true,
  rows:literalRows.map(([code,title,credits,termCode,weekday,startsAt,endsAt,room],index)=>({sectionId:id(100+index),courseId:id(200+index),programId:id(900),
    code,title,credits,courseSourceMode:'sample',programCode:'SAMPLE-GEN',programName:'Sample General Studies',department:'Sample Academic Office',programSourceMode:'sample',
    termCode,...terms[termCode],termSourceMode:'sample',sectionCode:'A',instructor:'Sample instructor',weekday,startsAt,endsAt,room,sectionSourceMode:'sample'})),
};}
const options=now=>({userId:id(700),studentId:id(701),enrollmentIdsByCode:Object.fromEntries(literalRows.map(([code],index)=>[code,id(300+index)])),now:now??currentTime});
const bind=(read=readFixture(),config=options())=>bindPublishedSampleEnrollments(read,config);
function rejects(work,reason){assert.throws(work,error=>error.name==='PublishedSampleEnrollmentBindingError'&&error.code==='fixture-unsupported'&&error.reason===reason);}

test('read-only binding preserves five exact literal courses, term memberships and synthetic owner rows',()=>{
  const actual=bind();
  assert.deepEqual(actual.binding.expectedSets,{current:['SAMP101','SAMP102','SAMP103'],historical:['SAMP090'],upcoming:['SAMP201']});
  assert.equal(actual.binding.campusDay,'2026-11-13');assert.equal(actual.binding.checkedAt,'2026-11-13T02:00:00.000Z');
  assert.equal(actual.binding.sharedDigest.length,64);assert.deepEqual(actual.binding.owner,{userId:id(700),studentId:id(701)});
  assert.deepEqual(actual.enrollments.map(row=>[row.id,row.student_id,row.section_id,row.status,row.source_mode]),[
    [id(300),id(701),id(100),'enrolled','sample'],[id(301),id(701),id(101),'enrolled','sample'],[id(302),id(701),id(102),'enrolled','sample'],
    [id(303),id(701),id(103),'completed','sample'],[id(304),id(701),id(104),'enrolled','sample'],
  ]);
  assert.deepEqual(actual.expectedCourses.map(row=>[row.code,row.title,row.credits,row.term,row.termStartsOn,row.termEndsOn,row.weekday,row.startsAt,row.endsAt,row.room]),literalRows.map(([code,title,credits,termCode,weekday,startsAt,endsAt,room])=>[code,title,credits,terms[termCode].termLabel,terms[termCode].termStartsOn,terms[termCode].termEndsOn,weekday,startsAt,endsAt,room]));
  assert.equal(actual.expectedCourses[0].instructor,'Sample instructor');
  assert.equal(actual.expectedCourses.every(row=>!('grades' in row)&&!('attendance' in row)&&!('studentNumber' in row)),true,'Unsupported collections are unknown, not fabricated empty arrays.');
  assert.deepEqual(actual.binding.initializer.fall,[id(100),id(101),id(102)]);
  assert.deepEqual(actual.binding.initializer.academicSeed,[id(102),id(103),id(104)]);
  assert.deepEqual(actual.binding.initializer.union,[id(100),id(101),id(102),id(103),id(104)]);
});

test('both source migrations independently agree with the constants and whole initializer union',async()=>{
  const first=await readFile(new URL('../../supabase/migrations/20261105010000_school_affairs_workspace.sql',import.meta.url),'utf8');
  const second=await readFile(new URL('../../supabase/migrations/20261106010000_affairs_academic_records.sql',import.meta.url),'utf8');
  for(const [code,title,credits,termCode,weekday,startsAt,endsAt,room] of literalRows){
    const source=['SAMP101','SAMP102'].includes(code)?first:second;
    assert.ok(source.includes(`('${code}','${title}',${credits}.0::numeric)`),code);
    const section=['SAMP101','SAMP102'].includes(code)?`('${code}',${weekday},'${startsAt.slice(0,5)}','${endsAt.slice(0,5)}','${room}')`:`('${code}','${termCode}',${weekday},'${startsAt.slice(0,5)}','${endsAt.slice(0,5)}','${room}')`;
    assert.ok(source.includes(section),code+' section');
  }
  for(const [code,term] of Object.entries(terms))assert.ok((code==='SAMPLE-2026-FALL'?first:second).includes(`('${code}','${term.termLabel}','${term.termStartsOn}','${term.termEndsOn}')`));
  assert.ok(first.includes("('SAMPLE-GEN','Sample General Studies','Sample Academic Office')"));
  assert.match(first,/where t\.code='SAMPLE-2026-FALL' on conflict\(student_id,section_id\) do nothing/);
  assert.match(second,/where c\.code in \('SAMP090','SAMP103','SAMP201'\)/);
  assert.match(second,/case when t\.code='SAMPLE-2026-SPRING' then 'completed' else 'enrolled' end/);
  assert.deepEqual(sampleEnrollmentManifest.courses.map(row=>[row.code,row.title,row.credits,row.termCode,row.weekday,row.startsAt,row.endsAt,row.room]),literalRows);
});

test('reordering the complete read does not alter the stable binding or input data',()=>{
  const read=readFixture(),before=structuredClone(read),config=options(),beforeConfig=structuredClone(config);
  const original=bind(read,config);read.rows.reverse();
  assert.deepEqual(bind(read,config),original);
  assert.deepEqual([...read.rows].reverse(),before.rows);assert.deepEqual(config,beforeConfig);
  assert.equal(Object.isFrozen(sampleEnrollmentManifest.courses[0]),true);assert.equal(Object.isFrozen(original.expectedCourses[0]),true);
  assert.throws(()=>{original.enrollments[0].status='completed';},TypeError);
});

test('every non-ID shared field must equal the reviewed literal, including all provenance levels',()=>{
  const fields=sampleEnrollmentSharedFields.filter(key=>!key.endsWith('Id'));
  for(const field of fields){
    const read=readFixture();read.rows[0][field]=typeof read.rows[0][field]==='number'?read.rows[0][field]+1:'MISMATCH PRIVATE SENTINEL';
    assert.throws(()=>bind(read),error=>error.code==='fixture-unsupported'&&!error.message.includes('PRIVATE SENTINEL'),field);
  }
  for(const field of ['credits','weekday']){const read=readFixture();read.rows[0][field]=String(read.rows[0][field]);rejects(()=>bind(read),'shared-row-mismatch');}
  const partialTime=readFixture();partialTime.rows[0].startsAt='09:00';rejects(()=>bind(partialTime),'shared-row-mismatch');
});

test('shared ID uniqueness and program/term relationships cannot be cloned or cross-wired',()=>{
  for(const key of ['sectionId','courseId','termId','programId']){const read=readFixture();read.rows[0][key]='not-a-uuid';rejects(()=>bind(read),'shared-identity-invalid');}
  for(const key of ['sectionId','courseId']){const read=readFixture();read.rows[1][key]=read.rows[0][key];rejects(()=>bind(read),'shared-identity-invalid');}
  const splitProgram=readFixture();splitProgram.rows[1].programId=id(950);rejects(()=>bind(splitProgram),'shared-identity-invalid');
  const splitTerm=readFixture();splitTerm.rows[1].termId=id(951);rejects(()=>bind(splitTerm),'shared-identity-invalid');
  const clonedTerm=readFixture();clonedTerm.rows[3].termId=clonedTerm.rows[0].termId;rejects(()=>bind(clonedTerm),'shared-identity-invalid');
  const crossTable=readFixture();crossTable.rows[0].courseId=crossTable.rows[0].sectionId;rejects(()=>bind(crossTable),'shared-identity-invalid');
});

test('extra Fall or academic-seed sections and duplicate/missing courses cannot be silently ignored',()=>{
  for(const extra of [{...readFixture().rows[0],code:'EXTRA101',courseId:id(980),sectionId:id(981)},
    {...readFixture().rows[3],sectionCode:'B',sectionId:id(982)}]){
    const read=readFixture();read.rows.push(extra);rejects(()=>bind(read),'initializer-universe-mismatch');
  }
  const duplicate=readFixture();duplicate.rows[4]={...duplicate.rows[0],sectionId:id(985)};rejects(()=>bind(duplicate),'initializer-universe-mismatch');
  const missing=readFixture();missing.rows.pop();rejects(()=>bind(missing),'initializer-universe-mismatch');
  const unrelated=readFixture();unrelated.rows[0].code='DB301';rejects(()=>bind(unrelated),'initializer-universe-mismatch');
});

test('a restricted or incomplete read is never treated as an exhaustive initializer inventory',()=>{
  for(const complete of [false,null,undefined,'true']){const read=readFixture();read.complete=complete;rejects(()=>bind(read),'read-incomplete');}
  const partialScope=readFixture();partialScope.scope.id='only-five-known-course-ids';rejects(()=>bind(partialScope),'read-incomplete');
  const missingSeed=readFixture();missingSeed.scope.academicSeedCourseCodes.pop();rejects(()=>bind(missingSeed),'read-incomplete');
  const extraScope=readFixture();extraScope.scope.ownerId=id(700);rejects(()=>bind(extraScope),'read-incomplete');
  const rawOwner=readFixture();rawOwner.rows[0].userId=id(700);rejects(()=>bind(rawOwner),'shared-row-mismatch');
});

test('disposable own IDs must be explicit, unique and separate from every shared identity',()=>{
  for(const field of ['userId','studentId']){const config=options();config[field]='invalid';rejects(()=>bind(readFixture(),config),'owned-identity-invalid');}
  const cloned=options();cloned.enrollmentIdsByCode.SAMP102=cloned.enrollmentIdsByCode.SAMP101;rejects(()=>bind(readFixture(),cloned),'owned-identity-invalid');
  const sharedOwner=options();sharedOwner.userId=id(100);rejects(()=>bind(readFixture(),sharedOwner),'owned-identity-invalid');
  const overlapping=options();overlapping.studentId=overlapping.userId;rejects(()=>bind(readFixture(),overlapping),'owned-identity-invalid');
  const extra=options();extra.enrollmentIdsByCode.FOREIGN=id(999);rejects(()=>bind(readFixture(),extra),'owned-identity-invalid');
  const missing=options();delete missing.enrollmentIdsByCode.SAMP103;rejects(()=>bind(readFixture(),missing),'owned-identity-invalid');
});

test('literal term dates enforce Taipei day boundaries and expire rather than rebase',()=>{
  rejects(()=>bind(readFixture(),options('2026-09-06T15:59:59.999Z')),'fixture-window-not-started');
  const first=bind(readFixture(),options('2026-09-06T16:00:00.000Z'));assert.equal(first.binding.campusDay,'2026-09-07');
  const last=bind(readFixture(),options('2027-01-15T15:59:59.999Z'));assert.equal(last.binding.campusDay,'2027-01-15');
  rejects(()=>bind(readFixture(),options('2027-01-15T16:00:00.000Z')),'fixture-window-expired');
  rejects(()=>bind(readFixture(),options('2030-11-13T02:00:00.000Z')),'fixture-window-expired');
  assert.deepEqual(first.expectedCourses,last.expectedCourses);assert.equal(first.binding.sharedDigest,last.binding.sharedDigest);
  for(const value of ['2026-11-31T02:00:00Z','2026-11-13','2026-11-13T02:00:00+00:00',null,0])rejects(()=>bind(readFixture(),{...options(),now:value}),'input-invalid');
});

test('shared literal changes affect binding; changing disposable account does not rewrite shared data',()=>{
  const first=bind(),read=readFixture();read.rows[0].sectionId=id(999);
  const rebound=bind(read);assert.notEqual(rebound.binding.sharedDigest,first.binding.sharedDigest);assert.equal(rebound.expectedCourses[0].title,'Campus Orientation');
  const config=options();config.userId=id(710);config.studentId=id(711);
  const second=bind(readFixture(),config);assert.equal(second.binding.sharedDigest,first.binding.sharedDigest);assert.notDeepEqual(second.binding.owner,first.binding.owner);
  assert.equal(second.enrollments.every(row=>row.student_id===id(711)),true);
});

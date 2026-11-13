import assert from 'node:assert/strict';
import {test} from 'node:test';
import {academicAttendanceCourseDate,academicAttendanceDetailColumns,academicAttendanceNotes,academicAttendancePaths,academicAttendanceRollCall,academicAttendanceStatisticColumns,academicAttendanceTimestamp,currentAcademicAttendance,ownAcademicAttendance,type AcademicAttendanceRecords,type AcademicAttendanceStatistic,type AcademicAttendanceDetail,type AcademicAttendanceMetadata} from '../../src/services/academicAttendance';
const base={id:'synthetic',userId:'own',sourceMode:'local_demo' as const,version:1,createdAt:'2030-01-05T08:07:06Z',updatedAt:'2030-01-05T08:07:06Z'};
const statistic:AcademicAttendanceStatistic={...base,academicYear:115,semester:1,rowOrder:1,studentNumber:'LOCAL-QA',studentName:'Synthetic Student',courseCode:'LOCAL-COURSE',courseTitle:'Synthetic course',totalTeachingHours:11.25,currentTeachingWeeks:0,currentTeachingHours:null,absenceHours:0,unexcusedAbsenceHours:3.5};
const detail:AcademicAttendanceDetail={...base,academicYear:115,semester:1,rowOrder:1,courseCode:'LOCAL-COURSE',courseTitle:'Synthetic course',teacherName:null,absenceTypeText:'原文類別',courseDate:'2030-01-02',periodText:'午',rollCalledAt:'2030-01-05T03:04:05Z'};
const metadata:AcademicAttendanceMetadata={...base,currentAcademicYear:115,currentSemester:1};
const empty:AcademicAttendanceRecords={statistics:[],details:[],metadata:[]};
test('attendance own-scope includes all three collections and never selects another account metadata',()=>{
  const data={statistics:[statistic,{...statistic,id:'private',userId:'other'}],details:[detail,{...detail,id:'private',userId:'other'}],metadata:[{...metadata,id:'private',userId:'other'},metadata]};
  assert.deepEqual(ownAcademicAttendance(data,'own'),{statistics:[statistic],details:[detail],metadata:[metadata]});assert.deepEqual(ownAcademicAttendance(data,''),empty);assert.deepEqual(ownAcademicAttendance(undefined,'own'),empty);
  assert.equal(currentAcademicAttendance({...data,metadata:[data.metadata[0]]},'own').term,null);
});
test('current attendance requires explicit metadata and never guesses the latest term',()=>{
  const data={statistics:[statistic,{...statistic,id:'future',academicYear:9999}],details:[detail],metadata:[]};
  assert.deepEqual(currentAcademicAttendance(data,'own'),{term:null,statistics:[],details:[]});
  assert.deepEqual(currentAcademicAttendance({...data,metadata:[{...metadata,currentAcademicYear:null,currentSemester:null}]},'own'),{term:null,statistics:[],details:[]});
  const current=currentAcademicAttendance({...data,metadata:[metadata]},'own');assert.deepEqual(current.term,{academicYear:115,semester:1});assert.deepEqual(current.statistics,[statistic]);assert.deepEqual(current.details,[detail]);
});
test('current term and stored row order apply independently to both tables without mutating the snapshot',()=>{
  const statistics=[statistic,{...statistic,id:'first',rowOrder:0},{...statistic,id:'old',academicYear:114},{...statistic,id:'summer',semester:3 as const}];
  const details=[detail,{...detail,id:'first-detail',rowOrder:0},{...detail,id:'other-term',semester:2 as const}];
  const current=currentAcademicAttendance({statistics,details,metadata:[metadata]},'own');assert.deepEqual(current.statistics.map(row=>row.id),['first','synthetic']);assert.deepEqual(current.details.map(row=>row.id),['first-detail','synthetic']);assert.deepEqual(statistics.map(row=>row.id),['synthetic','first','old','summer']);
});
test('literal categories, blank strings and null/zero hours are never derived from detail rows or leave',()=>{
  const stored={...statistic,studentName:''};const rows=Array.from({length:10},(_,index)=>({...detail,id:String(index),absenceTypeText:index?'缺課':'<script>literal</script>'}));
  const current=currentAcademicAttendance({statistics:[stored],details:rows,metadata:[metadata]},'own');assert.equal(current.statistics[0].studentName,'');assert.equal(current.statistics[0].totalTeachingHours,11.25);assert.equal(current.statistics[0].currentTeachingWeeks,0);assert.equal(current.statistics[0].currentTeachingHours,null);assert.equal(current.statistics[0].absenceHours,0);assert.equal(current.statistics[0].unexcusedAbsenceHours,3.5);assert.equal(current.details[0].absenceTypeText,'<script>literal</script>');
});
test('course calendar dates and Taipei roll-call timestamps remain distinct',()=>{
  assert.equal(academicAttendanceCourseDate(detail.courseDate),'2030/01/02');assert.equal(academicAttendanceRollCall(detail.rollCalledAt),'2030/1/5 上午 11:04:05');assert.equal(academicAttendanceRollCall('2030-01-05T16:00:00Z'),'2030/1/6 上午 12:00:00');
  assert.equal(academicAttendanceCourseDate('2030-02-29'),'—');assert.equal(academicAttendanceCourseDate('2032-02-29'),'2032/02/29');assert.equal(academicAttendanceCourseDate(null),'—');assert.equal(academicAttendanceRollCall('invalid'),'—');assert.equal(academicAttendanceTimestamp(base.createdAt),'2030/01/05 16:07:06');assert.equal(academicAttendanceTimestamp(undefined),'—');
});
test('source headers, reciprocal routes and captured explanation remain literal',()=>{
  assert.equal(academicAttendanceStatisticColumns.length,9);assert.deepEqual(academicAttendanceDetailColumns,['課號','課程名稱','授課老師','類別','課程日期','節次','點名時間']);assert.equal(academicAttendancePaths.statistics,'/school-affairs/services/14-1');assert.equal(academicAttendancePaths.detail,'/school-affairs/services/14-1/detail');assert.match(academicAttendanceNotes.statistics[0],/三分之二/);assert.ok(!academicAttendanceNotes.statistics[0].includes('三分之一'));assert.equal(academicAttendanceNotes.detail[1],'曠課: 老師點名未到，且未完成請假作業。');
});

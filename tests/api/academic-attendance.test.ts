import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {academicAttendanceFields,academicAttendanceNavigation,academicAttendancePaths,academicAttendancePayloadBytes,academicAttendanceReadSources,
  answerAcademicAttendance,isAcademicAttendanceQuestion,mapAcademicAttendance,validateAcademicAttendancePayload} from '../../server/academicAttendance.js';
const ids={record:'10000000-0000-4000-8000-000000000001',owner:'10000000-0000-4000-8000-000000000002',request:'10000000-0000-4000-8000-000000000003'};
const envelope={id:ids.record,user_id:ids.owner,request_id:ids.request,expected_version:0};
const statistic=()=>({...envelope,academic_year:115,semester:1,student_number:null as string|null,student_name:null as string|null,course_code:'LOCAL-ATTEND-001',
  course_title:'Synthetic attendance course',total_teaching_hours:54 as number|null,current_teaching_weeks:7.5 as number|null,current_teaching_hours:22.5 as number|null,
  absence_hours:0 as number|null,unexcused_absence_hours:null as number|null,row_order:0});
const detail=()=>({...envelope,id:'20000000-0000-4000-8000-000000000001',academic_year:115,semester:1,course_code:'LOCAL-ATTEND-001',course_title:'Synthetic attendance course',
  teacher_name:'Synthetic teacher' as string|null,absence_type_text:'Synthetic literal category' as string|null,course_date:'2026-11-13' as string|null,
  period_text:'A–B' as string|null,roll_called_at:'2026-11-13T08:30:00+08:00' as string|null,row_order:0});
const metadata=()=>({...envelope,id:'30000000-0000-4000-8000-000000000001',current_academic_year:115 as number|null,current_semester:1 as number|null});
const persisted=(value:Record<string,unknown>)=>({...value,source_mode:'local_demo',version:1,created_at:'2026-11-13T00:00:00Z',updated_at:'2026-11-13T00:00:00Z'});
const data=()=>({profile:{userId:ids.owner},academicAttendance:mapAcademicAttendance([persisted(statistic())],[persisted(detail())],[persisted(metadata())])});
const fixtures=[['save_academic_attendance_statistic',statistic],['save_academic_attendance_detail',detail],['save_academic_attendance_metadata',metadata]] as const;
test('all attendance operations require exact declared fields, including explicit nullable fields',()=>{
  for(const [kind,fixture] of fixtures){
    const value=fixture();assert.equal(validateAcademicAttendancePayload(kind,value),null);
    assert.equal(Object.keys(value).length,academicAttendanceFields[kind].length+4);
    for(const key of Object.keys(value)){const missing={...value} as Record<string,unknown>;delete missing[key];assert.ok(validateAcademicAttendancePayload(kind,missing),key);}
    for(const patch of [{privateIdentity:'DO-NOT-STORE'},{source_mode:'official'},{user_id:null},{id:0},{request_id:'bad'},{expected_version:-1},{expected_version:'0'}])
      assert.ok(validateAcademicAttendancePayload(kind,{...value,...patch}));
  }
  for(const value of [null,[],{},'value'])assert.ok(validateAcademicAttendancePayload('unknown_kind',value));
});
test('inherited and unknown operation names return validation errors without throwing or accepting a valid payload',()=>{
  for(const kind of ['__proto__','constructor','prototype','toString','valueOf','hasOwnProperty','unknown_kind','']){
    for(const [,fixture] of fixtures)assert.equal(validateAcademicAttendancePayload(kind,fixture()),'Invalid attendance operation.',kind);
    for(const value of [null,[],{},'value'])assert.equal(validateAcademicAttendancePayload(kind,value),'Invalid attendance operation.',kind);
  }
});
test('statistics preserve explicit zero, null and fractional numeric values without converting strings',()=>{
  for(const number of [null,0,0.01,7.25,9999.99]){const value=statistic();value.absence_hours=number;assert.equal(validateAcademicAttendancePayload(fixtures[0][0],value),null);}
  for(const number of [-1,10000,0.001,NaN,Infinity,'0','7.25',true])assert.ok(validateAcademicAttendancePayload(fixtures[0][0],{...statistic(),absence_hours:number}));
  for(const patch of [{academic_year:0},{academic_year:10000},{semester:12},{semester:'1'},{row_order:1.5},{row_order:1000000}])
    assert.ok(validateAcademicAttendancePayload(fixtures[0][0],{...statistic(),...patch}));
  const mapped=data().academicAttendance.statistics[0];assert.equal(mapped.absenceHours,0);assert.equal(mapped.unexcusedAbsenceHours,null);
  assert.equal(mapped.currentTeachingWeeks,7.5);assert.equal(mapped.currentTeachingHours,22.5);
});
test('optional display text preserves empty strings and Unicode code-point limits while required labels reject blanks',()=>{
  const value=detail();value.teacher_name='';value.period_text=null;assert.equal(validateAcademicAttendancePayload(fixtures[1][0],value),null);
  assert.equal(mapAcademicAttendance([],[persisted(value)]).details[0].teacherName,'');
  value.course_title='😀'.repeat(160);assert.equal(validateAcademicAttendancePayload(fixtures[1][0],value),null);
  for(const title of ['',' \t\n\u00a0','😀'.repeat(161),'\u0000','\ud800'])assert.ok(validateAcademicAttendancePayload(fixtures[1][0],{...value,course_title:title}));
  for(const patch of [{course_code:'x'.repeat(81)},{teacher_name:'x'.repeat(161)},{absence_type_text:'x'.repeat(81)},{period_text:'x'.repeat(81)}])
    assert.ok(validateAcademicAttendancePayload(fixtures[1][0],{...detail(),...patch}));
});
test('date-only course dates and zoned roll-call timestamps reject impossible dates without normalization',()=>{
  for(const date of [null,'2024-02-29','2000-02-29','0001-01-01'])assert.equal(validateAcademicAttendancePayload(fixtures[1][0],{...detail(),course_date:date}),null);
  for(const date of ['2026-02-29','1900-02-29','2026-04-31','0000-01-01','2026-01-01T00:00:00Z',''])
    assert.ok(validateAcademicAttendancePayload(fixtures[1][0],{...detail(),course_date:date}),date);
  for(const stamp of [null,'2024-02-29T23:59:59.123456Z','2026-11-13T00:00:00-05:30'])assert.equal(validateAcademicAttendancePayload(fixtures[1][0],{...detail(),roll_called_at:stamp}),null);
  for(const stamp of ['2026-02-29T00:00:00Z','2026-11-13T24:00:00Z','2026-11-13T00:00:00','2026-11-13T00:00:00+16:00',''])
    assert.ok(validateAcademicAttendancePayload(fixtures[1][0],{...detail(),roll_called_at:stamp}),stamp);
});
test('current-term metadata requires an explicit complete pair and can be cleared without becoming a guessed term',()=>{
  for(const pair of [[null,null],[115,1],[9999,3]])assert.equal(validateAcademicAttendancePayload(fixtures[2][0],{...metadata(),current_academic_year:pair[0],current_semester:pair[1]}),null);
  for(const pair of [[null,1],[115,null],[0,1],[115,12],['115',1]])assert.ok(validateAcademicAttendancePayload(fixtures[2][0],{...metadata(),current_academic_year:pair[0],current_semester:pair[1]}));
  const snapshot=data();snapshot.academicAttendance.metadata[0].currentAcademicYear=null;snapshot.academicAttendance.metadata[0].currentSemester=null;
  assert.match(answerAcademicAttendance('My attendance',snapshot)!.answer,/latest history is not assumed current/);
  assert.doesNotMatch(answerAcademicAttendance('My attendance',snapshot)!.answer,/Synthetic attendance course/);
});
test('statistics answers preserve stored values independently of details and local leave requests',()=>{
  const snapshot={...data(),requests:[{status:'approved',kind:'leave'}]};
  const answer=answerAcademicAttendance('My current attendance statistics',snapshot)!;
  assert.equal(answer.url,academicAttendancePaths.statistics);assert.match(answer.answer,/term teaching hours 54; current teaching weeks 7.5; current teaching hours 22.5; absence hours 0; unexcused absence hours not recorded/);
  assert.match(answer.answer,/not derived from details or local leave status/);assert.doesNotMatch(answer.answer,/absence hours 1|unexcused absence hours 0|approved|Synthetic literal category/);
  assert.equal(isAcademicAttendanceQuestion('How many classes have I missed?'),true);
});
test('detail answers retain literal categories, period labels and timestamp values without converting them into decisions',()=>{
  const answer=answerAcademicAttendance('My absence details',data())!;
  assert.equal(answer.url,academicAttendancePaths.detail);assert.match(answer.answer,/type Synthetic literal category/);
  assert.match(answer.answer,/course date 2026-11-13; period A–B; roll-call time 2026-11-13T08:30:00\+08:00/);
  assert.doesNotMatch(answer.answer,/absent on|approved leave|unexcused absence hours/);
});
test('every collection is independently owner-scoped, including the current-term marker',()=>{
  const foreign='40000000-0000-4000-8000-000000000001';
  const bundle=mapAcademicAttendance([persisted(statistic()),persisted({...statistic(),id:'foreign',user_id:foreign,course_title:'PRIVATE OTHER STATISTIC'})],
    [persisted(detail()),persisted({...detail(),id:'foreign',user_id:foreign,course_title:'PRIVATE OTHER DETAIL'})],
    [persisted({...metadata(),user_id:foreign,current_academic_year:999})]);
  const snapshot={profile:{userId:ids.owner},academicAttendance:bundle};
  assert.match(answerAcademicAttendance('My attendance',snapshot)!.answer,/not been explicitly designated/);
  for(const question of ['My attendance statistics academic year115 semester1','My absence details academic year115 semester1']){
    assert.doesNotMatch(answerAcademicAttendance(question,snapshot)!.answer,/PRIVATE OTHER|999/);
    for(const empty of [{academicAttendance:bundle},{profile:{userId:'empty'},academicAttendance:bundle},{profile:{userId:'empty'},admin:{academicAttendance:bundle}}])
      assert.match(answerAcademicAttendance(question,empty)!.answer,/No local records/);
  }
});
test('explicit term, course-code and follow-up filters never label the latest historical term as current',()=>{
  const snapshot=data();snapshot.academicAttendance.statistics.push(...mapAcademicAttendance([persisted({...statistic(),id:'older',academic_year:114,course_title:'OLDER TERM'})]).statistics);
  const explicit=answerAcademicAttendance('My attendance academic year114 semester1',snapshot)!;assert.match(explicit.answer,/OLDER TERM/);assert.doesNotMatch(explicit.answer,/Synthetic attendance course/);
  const followup=answerAcademicAttendance('semester1',snapshot,'',[{role:'user',content:'My attendance academic year114'}])!;assert.match(followup.answer,/OLDER TERM/);
  assert.match(answerAcademicAttendance('My current attendance academic year114 semester1',snapshot)!.answer,/differs from the explicitly designated/);
  assert.match(answerAcademicAttendance('My attendance academic year115',snapshot)!.answer,/Specify both/);
  assert.match(answerAcademicAttendance('My attendance last semester',snapshot)!.answer,/does not infer relative terms/);
  for(const question of ['My attendance semester12','我的第12學期缺曠課','My attendance academic year10000'])assert.match(answerAcademicAttendance(question,snapshot)!.answer,/Specify a valid|請指定有效/);
  assert.match(answerAcademicAttendance('My attendance course code NOT-RECORDED',snapshot)!.answer,/No local records/);
  assert.match(answerAcademicAttendance('My absence details course code LOCAL-ATTEND-001',snapshot)!.answer,/Synthetic attendance course/);
});
test('bounded answers disclose matching row coverage and named-course queries still search the full account dataset',()=>{
  const rows=Array.from({length:75},(_,i)=>persisted({...detail(),id:`detail-${i}`,row_order:i,course_code:`LOCAL-${i}`,course_title:`SyntheticCourse${String(i).padStart(3,'0')}`}));
  const snapshot={profile:{userId:ids.owner},academicAttendance:mapAcademicAttendance([],rows,[persisted(metadata())])};
  const original=structuredClone(snapshot.academicAttendance),answer=answerAcademicAttendance('My absence details',snapshot)!;
  assert.match(answer.answer,/Showing 20 of 75 matching records/);assert.match(answer.answer,/shows only part/);assert.ok(answer.answer.includes(academicAttendancePaths.detail));
  assert.doesNotMatch(answer.answer,/SyntheticCourse074/);assert.deepEqual(snapshot.academicAttendance,original);
  assert.match(answerAcademicAttendance('My absence details for SyntheticCourse074',snapshot)!.answer,/SyntheticCourse074/);
  assert.match(answerAcademicAttendance('My absence details for SyntheticCourse074',snapshot)!.answer,/Showing 1 of 1/);
});
test('daily/weekly/monthly hours are unavailable rather than derived from term statistics, row counts or period labels',()=>{
  for(const question of ['My absence hours last week','How many hours was I absent last week?','My daily attendance totals','My monthly attendance statistics','我的本週缺課時數',
    'My absence hours on 2026-11-13']){
    const answer=answerAcademicAttendance(question,data())!;
    assert.match(answer.answer,/hour totals are unavailable|沒有每日、每週或每月時數加總/);
    assert.match(answer.answer,/cannot be converted into hours|不能由明細筆數或節次換算時數/);
    assert.ok(answer.answer.includes(academicAttendancePaths.detail));assert.doesNotMatch(answer.answer,/teaching hours 54|absence hours 0/);
  }
  assert.match(answerAcademicAttendance('My absence details yesterday',data())!.answer,/Specify a YYYY-MM-DD/);
});
test('one actual ISO course date filters details independently of the roll-call timestamp',()=>{
  const snapshot=data();snapshot.academicAttendance.details.push(...mapAcademicAttendance([],[persisted({...detail(),id:'other-date',course_date:'2026-11-12',course_title:'OTHER COURSE DATE',roll_called_at:'2026-11-13T08:30:00+08:00'})]).details);
  const answer=answerAcademicAttendance('My absences on 2026-11-13',snapshot)!;
  assert.equal(answer.url,academicAttendancePaths.detail);assert.match(answer.answer,/Synthetic attendance course/);
  assert.doesNotMatch(answer.answer,/OTHER COURSE DATE/);assert.match(answer.answer,/Showing 1 of 1/);
  assert.match(answerAcademicAttendance('My absence details on 2026-11-14',snapshot)!.answer,/No local records/);
  for(const question of ['My absence details on 2026-02-29','My absence details from 2026-11-12 to 2026-11-13'])
    assert.match(answerAcademicAttendance(question,snapshot)!.answer,/Specify one actual YYYY-MM-DD/);
});
test('attendance intent yields DTM, grades, selection, leave actions and navigation, while retaining explicit native context',()=>{
  for(const question of ['My DTM attendance','My Moodle attendance','My grades','My timetable','我的選課紀錄','My graduation review',
    'My leave requests','我的請假紀錄','My fee balance','Where can I find attendance records?','Remind me to check attendance'])
    assert.equal(isAcademicAttendanceQuestion(question,academicAttendancePaths.statistics),false,question);
  assert.equal(isAcademicAttendanceQuestion('My attendance','/dtm/course/synthetic'),false);
  assert.equal(isAcademicAttendanceQuestion('What about attendance?','',[{role:'user',content:'My DTM course'}]),false);
  assert.equal(isAcademicAttendanceQuestion('My academic attendance','/dtm/course/synthetic'),true);
  assert.equal(isAcademicAttendanceQuestion('What are the hours?',academicAttendancePaths.statistics),true);
});
test('read ordering, literal source URL, JSONB bytes and draft private mutation boundaries are explicit',async()=>{
  assert.equal(academicAttendanceReadSources.length,3);assert.ok(academicAttendanceReadSources.every(source=>source.order.endsWith('id.asc')));
  assert.equal(academicAttendanceNavigation.officialUrl,'https://infosys.stu.edu.tw/StuOffclass/Login/AspLogin/2');
  assert.equal(academicAttendancePayloadBytes({label:'測試',value:0,missing:null}),new TextEncoder().encode('{"label": "測試", "value": 0, "missing": null}').byteLength);
  const sql=await readFile(new URL('../../supabase/migrations/20261112140000_academic_attendance.sql',import.meta.url),'utf8');
  assert.match(sql,/unique\(user_id,academic_year,semester,course_code\)/);assert.match(sql,/receipt.payload<>p_payload/);
  assert.match(sql,/before_row->>'user_id'/);assert.match(sql,/row level security/);assert.match(sql,/octet_length\(value::text\)>8000/);
  assert.doesNotMatch(sql,/insert into auth\.users|insert into auth\.identities/i);
});

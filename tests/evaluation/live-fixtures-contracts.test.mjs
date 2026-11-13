import test from 'node:test';
import assert from 'node:assert/strict';
import {planNativeFixture,verifyNativeFixtureReadback,validateFixtureServiceRecord,safeDatabaseDiagnostic,LiveFixtureError} from './live-fixtures.mjs';
import {buildAccountFixture,fixtureForCase,EVAL_USER_ID,EVAL_OTHER_USER_ID,evalId} from './fixtures.mjs';
import {loadNativeAcademicRecords} from '../../server/nativeAcademicWorkspace.js';
import {mapStudentAidRecords} from '../../server/studentAidRecords.js';
import {mapCreditLoadHistory} from '../../server/creditLoadHistory.js';
import {mapCourseSelection} from '../../server/courseSelection.js';
import {mapScholarshipRecords} from '../../server/scholarshipRecords.js';
import {mapHousingRecords} from '../../server/housingRecords.js';

const OPTIONS={userId:EVAL_USER_ID,studentId:evalId(10),otherUserId:EVAL_OTHER_USER_ID};
const isError=code=>error=>error instanceof LiveFixtureError&&error.code===code;
test('database diagnostics retain safe constraint identifiers without exposing SQL, detail or row data',()=>{
  const error={code:'23514',table_name:'affairs_service_records',constraint_name:'affairs_service_records_leave_form_fields_check',message:'SECRET ROW',detail:'SECRET PASSWORD',query:'select SECRET TOKEN',parameters:['SECRET VALUE']};
  assert.equal(safeDatabaseDiagnostic(error),' (code 23514; table affairs_service_records; constraint affairs_service_records_leave_form_fields_check)');
  assert.doesNotMatch(safeDatabaseDiagnostic(error),/SECRET|select/);
  assert.equal(safeDatabaseDiagnostic({code:'23514\nSECRET',table_name:'affairs_records; SECRET',constraint_name:'postgres://credential@host'}),'');
});
test('sick leave class periods are separate from the restricted mental-health am/pm/day field',()=>{
  const row=buildAccountFixture().serviceRecords[0];assert.equal(row.periods,'3-4');assert.equal(row.leaveTimePeriod,null);
  assert.equal(validateFixtureServiceRecord(row),true);
  assert.throws(()=>validateFixtureServiceRecord({...row,leaveTimePeriod:'10:10-12:00'}),isError('fixture-schema'));
  assert.throws(()=>validateFixtureServiceRecord({...row,leaveTimePeriod:'am'}),isError('fixture-schema'));
  assert.throws(()=>validateFixtureServiceRecord({...row,leaveCategory:'mental_health'}),isError('fixture-schema'));
  assert.equal(validateFixtureServiceRecord({...row,leaveCategory:'mental_health',leaveTimePeriod:'am'}),true);
  assert.equal(validateFixtureServiceRecord(buildAccountFixture().serviceRecords[1]),true);
});
async function applicationRead(plan){
  const only=table=>(plan.rows[table]||[]).filter(row=>row.user_id===plan.userId);
  const {own}=await loadNativeAcademicRecords(plan.userId,false,async table=>only(table));
  return {...own,studentAid:mapStudentAidRecords(only('affairs_student_aid_records')),
    creditLoadHistory:mapCreditLoadHistory(only('affairs_credit_load_history')),courseSelection:mapCourseSelection(only('affairs_course_selection_records'))};
}
function sharedBindings(snapshot){
  return {
    courses:snapshot.courses.map((row,index)=>({...row,sectionId:evalId(8000+index)})),
    scholarship:{periods:snapshot.scholarship.periods.map(row=>({...row,id:evalId(8101)}))},
    housing:{periods:snapshot.housing.periods.map(row=>({...row,id:evalId(8102)}))},
  };
}
function periodRows(plan,domain){
  const snake=key=>key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
  return plan.expected[domain].periods.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[snake(key),value])));
}

test('all private native collections round-trip through actual readers with independently authored golden facts',async()=>{
  const snapshot=buildAccountFixture(),plan=await planNativeFixture(snapshot,OPTIONS),actual=await applicationRead(plan);
  assert.equal(verifyNativeFixtureReadback(actual,plan),true);
  assert.equal(actual.studentAid.records[0].subsidyAmount,15000);
  assert.equal(actual.studentAid.records[0].applicantLabel,'EVAL-115-001');
  assert.equal(actual.creditLoadHistory.records[0].requestedCredits,25);
  assert.equal(actual.courseSelection.records[0].meetings[0].period,'3');
  assert.equal(actual.academicGrades.records[0].gradeText,'87');
  assert.equal(actual.academicGrades.termSummaries[0].averageGradeText,'84.5');
  assert.equal(actual.academicGrades.rankings[0].departmentRankingText,'12 / 140');
  assert.equal(actual.graduationReview.reports[0].categories[0].matchedCredits,15);
  assert.equal(actual.graduationReview.reports[0].categories[0].detailSubtotalCredits,17);
  assert.equal(actual.academicAttendance.statistics[0].absenceHours,6);
  assert.equal(actual.academicAttendance.details[0].rollCalledAt,'2026-11-10T10:12:00+08:00');
  assert.ok(Object.values(plan.rows).flat().every(row=>row.user_id===EVAL_USER_ID));
  assert.ok(!Object.keys(plan.rows).some(table=>/periods|programs|sections|^affairs_courses$/.test(table)));
  assert.deepEqual(snapshot,buildAccountFixture(),'Planning must not mutate independently authored golden fixtures.');
});

test('literal zero and null remain distinct in persisted and read-back grade/attendance fields',async()=>{
  const plan=await planNativeFixture(fixtureForCase('null-zero'),OPTIONS),actual=await applicationRead(plan);
  assert.equal(plan.rows.affairs_academic_grade_records[0].grade_text,'0');
  assert.equal(actual.academicGrades.termSummaries[0].earnedCredits,null);
  assert.equal(actual.academicAttendance.statistics[0].absenceHours,0);
  assert.equal(actual.academicAttendance.statistics[0].unexcusedAbsenceHours,null);
  assert.equal(verifyNativeFixtureReadback(actual,plan),true);
});

test('foreign native sentinels bind only to the second disposable owner and never enter own expectations',async()=>{
  const other='00000000-0000-4000-8000-000000009999';
  const plan=await planNativeFixture(fixtureForCase('native-other-owner'),{...OPTIONS,otherUserId:other});
  const foreign=plan.rows.affairs_academic_grade_records.find(row=>row.course_title==='FOREIGN PRIVATE SENTINEL');
  assert.equal(foreign.user_id,other);assert.equal(foreign.grade_text,'99');
  assert.ok(!JSON.stringify(plan.expected).includes('FOREIGN PRIVATE SENTINEL'));
  const actual=await applicationRead(plan);assert.equal(verifyNativeFixtureReadback(actual,plan),true);
  actual.academicGrades.records.push({...actual.academicGrades.records[0],userId:other,id:evalId(9999)});
  assert.throws(()=>verifyNativeFixtureReadback(actual,plan),isError('fixture-mapping'));
});

test('unknown owners and missing persisted fields fail before any mutation boundary',async()=>{
  const source=buildAccountFixture();source.studentAid.records[0].userId='00000000-0000-4000-8000-000000004444';
  await assert.rejects(planNativeFixture(source,OPTIONS),isError('fixture-isolation'));
  const invalid=buildAccountFixture();delete invalid.studentAid.records[0].studentName;
  await assert.rejects(planNativeFixture(invalid,OPTIONS),isError('fixture-schema'));
});

test('empty native fixtures remain empty through actual read mappers rather than copying generic tracker records',async()=>{
  for(const domain of ['studentAid','creditLoadHistory','courseSelection','academicGrades','graduationReview','academicAttendance']){
    const plan=await planNativeFixture(fixtureForCase('empty:'+domain),OPTIONS),actual=await applicationRead(plan);
    assert.equal(Object.values(actual[domain]).flat().length,0,domain);
    assert.equal(verifyNativeFixtureReadback(actual,plan),true);
  }
});
test('historical and future native academic years remain explicit without being inferred from the current clock',async()=>{
  for(const year of [112,116]){
    const source=buildAccountFixture();
    for(const domain of ['academicGrades','courseSelection','creditLoadHistory','academicAttendance'])for(const values of Object.values(source[domain]))for(const row of values){
      if(Object.hasOwn(row,'academicYear'))row.academicYear=year;
      if(Object.hasOwn(row,'currentAcademicYear'))row.currentAcademicYear=year;
    }
    const plan=await planNativeFixture(source,OPTIONS),actual=await applicationRead(plan);
    assert.equal(actual.academicGrades.records[0].academicYear,year);assert.equal(actual.academicAttendance.metadata[0].currentAcademicYear,year);
    assert.equal(actual.courseSelection.records[0].academicYear,year);assert.equal(verifyNativeFixtureReadback(actual,plan),true);
  }
});

test('native academic strict validators reject inconsistent transcript fields, unbounded JSON and invalid attendance dates',async()=>{
  const mutations=[s=>{s.academicGrades.records[0].courseCode='unexpected';},
    s=>{s.graduationReview.reports[0].categories[0].requiredCredits=1001;},
    s=>{s.academicAttendance.details[0].courseDate='2026-02-30';},
    s=>{s.academicAttendance.metadata[0].currentSemester=null;}];
  for(const mutate of mutations){const s=buildAccountFixture();mutate(s);await assert.rejects(planNativeFixture(s,OPTIONS),isError('fixture-schema'));}
});

test('SQL-shaped aid, credit and course-selection validators reject unsafe masks, precision loss and duplicate slots',async()=>{
  const mutations=[s=>{s.studentAid.records[0].maskedIdentityNumber='A123456789';},
    s=>{s.creditLoadHistory.records[0].requestedCredits=25.001;},
    s=>{s.courseSelection.records[0].meetings.push({...s.courseSelection.records[0].meetings[0]});},
    s=>{s.courseSelection.records[0].meetings[0].room=null;}];
  for(const mutate of mutations){const s=buildAccountFixture();mutate(s);await assert.rejects(planNativeFixture(s,OPTIONS),isError('fixture-schema'));}
});

test('native readback rejects altered amount, status, source provenance, report kind and nested credit totals',async()=>{
  const plan=await planNativeFixture(buildAccountFixture(),OPTIONS);
  for(const mutate of [s=>{s.studentAid.records[0].subsidyAmount=99999;},s=>{s.creditLoadHistory.records[0].resultText='Declined';},
    s=>{s.academicGrades.records[0].sourceMode='verified';},s=>{s.graduationReview.reports[0].reportKind='legacy';},
    s=>{s.graduationReview.reports[0].categories[0].matchedCredits=30;}]){
    const actual=await applicationRead(plan);mutate(actual);assert.throws(()=>verifyNativeFixtureReadback(actual,plan),isError('fixture-mapping'));
  }
});

test('scholarship maps only owned applications against exactly matching published existing periods',async()=>{
  const source=buildAccountFixture(),plan=await planNativeFixture(source,{...OPTIONS,domains:['scholarship'],shared:sharedBindings(source)});
  const application=plan.rows.affairs_scholarship_applications[0];
  assert.equal(application.award_amount,12000);assert.equal(application.actual_hours,8);assert.equal(application.period_id,evalId(8101));
  assert.equal(Object.keys(plan.rows).join(','),'affairs_scholarship_applications');
  const actual={scholarship:mapScholarshipRecords(periodRows(plan,'scholarship'),plan.rows.affairs_scholarship_applications)};
  assert.equal(verifyNativeFixtureReadback(actual,plan),true);assert.equal(source.scholarship.applications[0].periodId,evalId(631));
});

test('housing round-trip includes explicit synthetic application fields and actual period-derived bed term',async()=>{
  const source=buildAccountFixture(),plan=await planNativeFixture(source,{...OPTIONS,domains:['housing'],shared:sharedBindings(source)});
  const row=plan.rows.affairs_housing_applications[0];assert.equal(row.birth_date,'2004-01-01');assert.equal(row.address,'Synthetic evaluation residence');
  assert.equal(row.agreement_version,1);assert.equal(row.period_id,evalId(8102));
  assert.equal(plan.rows.affairs_housing_assignments[0].accommodation_fee,8500);
  const actual={housing:mapHousingRecords(periodRows(plan,'housing'),plan.rows.affairs_housing_applications,plan.rows.affairs_housing_assignments)};
  assert.equal(verifyNativeFixtureReadback(actual,plan),true);
  const invalid=buildAccountFixture();delete invalid.housing.applications[0].birthDate;
  await assert.rejects(planNativeFixture(invalid,{...OPTIONS,domains:['housing'],shared:sharedBindings(invalid)}),isError('fixture-schema'));
});

test('absent, changed, duplicate or additional shared periods are explicit fixture failures, not fabricated public rows',async()=>{
  const source=buildAccountFixture();
  await assert.rejects(planNativeFixture(source,{...OPTIONS,domains:['scholarship']}),isError('fixture-unsupported'));
  for(const mutate of [shared=>{shared.scholarship.periods=[];},shared=>{shared.scholarship.periods[0].closesAt='2027-01-01T00:00:00Z';},
    shared=>{shared.scholarship.periods.push({...shared.scholarship.periods[0],id:evalId(8122)});},shared=>{shared.scholarship.periods[0].published=false;}]){
    const shared=sharedBindings(source);mutate(shared);await assert.rejects(planNativeFixture(source,{...OPTIONS,domains:['scholarship'],shared}),isError('fixture-unsupported'));
  }
});

test('courses translate current, completed, withdrawn and future enrollment records without changing shared catalog',async()=>{
  const source=buildAccountFixture(),plan=await planNativeFixture(source,{...OPTIONS,domains:['courses'],shared:sharedBindings(source)});
  assert.deepEqual(plan.rows.affairs_enrollments.map(row=>row.status),['enrolled','completed','enrolled','withdrawn']);
  assert.equal(plan.rows.affairs_enrollments[2].section_id,evalId(8002));
  assert.equal(plan.rows.affairs_grade_items[0].score,18);assert.equal(plan.rows.affairs_attendance[0].status,'absent');
  assert.deepEqual(Object.keys(plan.rows),['affairs_enrollments','affairs_grade_items','affairs_attendance']);
  assert.ok(plan.rows.affairs_enrollments.every(row=>row.student_id===OPTIONS.studentId));
  assert.equal(verifyNativeFixtureReadback({courses:structuredClone(source.courses)},plan),true);
});

test('future-only course fixtures retain the chosen calendar dates and reject stale or incomplete section bindings',async()=>{
  const now='2027-01-31T17:00:00Z',source=fixtureForCase('future-only',{now}),shared=sharedBindings(source);
  const plan=await planNativeFixture(source,{...OPTIONS,domains:['courses'],shared});
  assert.equal(plan.expected.courses[0].termStartsOn,'2027-02-08');assert.equal(plan.expected.courses[0].startsAt,'09:10:00');
  shared.courses[0].termStartsOn='2026-11-16';
  await assert.rejects(planNativeFixture(source,{...OPTIONS,domains:['courses'],shared}),isError('fixture-unsupported'));
  await assert.rejects(planNativeFixture(source,{...OPTIONS,domains:['courses']}),isError('fixture-unsupported'));
});

test('initializer-enforced extra enrollments cannot silently change expected course fixtures',async()=>{
  const source=buildAccountFixture(),shared=sharedBindings(source);shared.initializerSectionIds=[evalId(8999)];
  await assert.rejects(planNativeFixture(source,{...OPTIONS,domains:['courses'],shared}),isError('fixture-unsupported'));
});

test('pure fixture planning performs no network requests',async()=>{
  const old=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;throw new Error('Network prohibited in offline contracts.');};
  try{await planNativeFixture(buildAccountFixture(),OPTIONS);assert.equal(calls,0);}finally{globalThis.fetch=old;}
});

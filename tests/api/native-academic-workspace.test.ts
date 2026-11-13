import assert from 'node:assert/strict';
import test from 'node:test';
import {loadNativeAcademicRecords} from '../../server/nativeAcademicWorkspace.js';

const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const anotherId='00000000-0000-4000-8000-000000000003',stamp='2026-11-12T10:12:13.123456+08:00';
type Row=Record<string,unknown>;
const common=(user_id=owner)=>({id:user_id,user_id,source_mode:'local_demo',version:1,created_at:stamp,updated_at:stamp});
const grade=(user_id=owner)=>({...common(user_id),academic_year:114,semester:2,
  record_kind:'transcript',course_title:' Synthetic subject ',course_code:null,category_text:null,module_name:null,
  required_elective_text:'必',grade_text:' P / <literal> ',remark_text:null,credits:0,row_order:0});
const report={reportedAt:stamp,identity:{studentNumber:null,studentName:null,departmentName:' Synthetic department ',yearText:'',enrollmentStatusText:null,curriculumCohortText:null,doubleMajorText:null,minorText:null},
  educationProgram:{text:'',indicator:null},foreignLanguageCompletion:{text:null,indicator:null},englishRequirement:{text:' Literal status ',indicator:'attention'},graduationReview:{text:null,indicator:null,note:''},
  languageRequirements:[{id:'language-one',label:'Synthetic language',status:{text:'',indicator:null},requiredCredits:0,matchedCredits:null,missingCredits:0}],categories:[],
  otherCourses:[{id:'course-one',sequenceText:null,title:'Synthetic course',credits:0,requiredElectiveText:'',yearText:null,transferText:''}]};
const sourceRows=(userId=owner):Record<string,Row[]>=>({
  affairs_academic_grade_records:[grade(userId)],
  affairs_academic_term_summaries:[{...common(userId),summary_kind:'transcript',academic_year:114,semester:2,earned_credits:0,average_grade_text:' P ',attempted_credits:null,passed_credits:null,failed_credits:null}],
  affairs_academic_rankings:[{...common(userId),academic_year:114,semester:2,department_ranking_text:' 2 / 45 (unpublished percent) ',class_ranking_text:null}],
  affairs_academic_metadata:[{...common(userId),class_label:null,english_requirement_text:' Literal stored status '}],
  affairs_graduation_reviews:[{...common(userId),report_kind:'academic_services',report:structuredClone(report)}],
  affairs_academic_attendance_statistics:[{...common(userId),academic_year:114,semester:2,row_order:0,course_code:'SYNTHETIC',course_title:' Synthetic attendance ',student_number:'',student_name:null,
    total_teaching_hours:72.5,current_teaching_weeks:0,current_teaching_hours:null,absence_hours:1.25,unexcused_absence_hours:0}],
  affairs_academic_attendance_details:[{...common(userId),academic_year:114,semester:2,row_order:0,course_code:'SYNTHETIC',course_title:' Synthetic attendance ',teacher_name:'',absence_type_text:' Literal type ',course_date:'2026-11-11',period_text:'午',roll_called_at:stamp}],
  affairs_academic_attendance_metadata:[{...common(userId),current_academic_year:null,current_semester:null}],
});

test('native academic reads scope every source to caller and preserve literal values',async()=>{
  const calls:Array<{table:string;query:Record<string,string>}>=[];
  const result=await loadNativeAcademicRecords(owner,false,async(table,query)=>{
    calls.push({table,query});return table==='affairs_academic_grade_records'?[grade(owner)]:[];
  });
  assert.equal(calls.length,8);
  for(const {query}of calls){assert.equal(query.user_id,'eq.'+owner);assert.ok(query.order.endsWith('id.asc'));assert.equal(query.select,'*');}
  assert.equal(result.own.academicGrades.records[0].credits,0);
  assert.equal(result.own.academicGrades.records[0].gradeText,' P / <literal> ');
  assert.equal(result.admin,undefined);assert.deepEqual(result.adminUserIds,[]);
  assert.deepEqual(result.completeness.affairs_academic_grade_records,{returned:1,complete:true});
});

test('administrator records stay separate and all related owners can be hydrated',async()=>{
  const result=await loadNativeAcademicRecords(owner,true,async(table,query)=>table==='affairs_academic_grade_records'
    ?query.user_id?[grade(owner)]:[grade(owner),grade(other)]:[]);
  assert.deepEqual(result.own.academicGrades.records.map(row=>row.userId),[owner]);
  assert.deepEqual(result.admin?.academicGrades.records.map(row=>row.userId),[owner,other]);
  assert.deepEqual(result.adminUserIds,[owner,other]);
});

test('failed, malformed, ownerless or cross-account reads cannot become a complete empty history',async()=>{
  await assert.rejects(loadNativeAcademicRecords('',false,async()=>[]),/access is unavailable/);
  await assert.rejects(loadNativeAcademicRecords('not-an-account',false,async()=>[]),/access is unavailable/);
  await assert.rejects(loadNativeAcademicRecords(owner,false,async()=>[grade(other)]),/invalid account scope/);
  await assert.rejects(loadNativeAcademicRecords(owner,false,async()=>[{id:'ownerless'}]),/invalid account scope/);
  await assert.rejects(loadNativeAcademicRecords(owner,false,async()=>({rows:[]})),/invalid account scope/);
  await assert.rejects(loadNativeAcademicRecords(owner,false,async()=>new Array(1)),/invalid account scope/);
  await assert.rejects(loadNativeAcademicRecords(owner,false,async()=>[Object.assign(Object.create({user_id:owner}),grade())]),/invalid account scope/);
  await assert.rejects(loadNativeAcademicRecords(owner,false,async()=>{throw new Error('Reader failed');}),/Reader failed/);
});

test('all eight complete source shapes preserve row counts, literal values, null/zero and microsecond timestamps',async()=>{
  const rows=sourceRows(),before=structuredClone(rows);
  rows.affairs_graduation_reviews.push({...common(),id:anotherId,report_kind:'legacy',report:{...structuredClone(report),graduationReview:{text:' Independent legacy status ',indicator:null,note:null}}});
  rows.affairs_academic_grade_records.push({...grade(),id:anotherId,record_kind:'warning',course_code:'SYNTHETIC-WARNING',category_text:null,module_name:null,required_elective_text:null,credits:null,grade_text:null,remark_text:' Literal warning '});
  rows.affairs_academic_term_summaries.push({...common(),id:anotherId,summary_kind:'warning',academic_year:114,semester:2,earned_credits:null,average_grade_text:null,attempted_credits:0,passed_credits:null,failed_credits:4.25});
  const frozen=structuredClone(rows),result=await loadNativeAcademicRecords(owner,false,async table=>rows[table]);
  const collections=[result.own.academicGrades.records,result.own.academicGrades.termSummaries,result.own.academicGrades.rankings,result.own.academicGrades.metadata,
    result.own.graduationReview.reports,result.own.academicAttendance.statistics,result.own.academicAttendance.details,result.own.academicAttendance.metadata];
  Object.entries(rows).forEach(([table,raw],index)=>{
    assert.equal(collections[index].length,raw.length,table);
    assert.deepEqual(collections[index].map(row=>[row.id,row.userId]),raw.map(row=>[row.id,row.user_id]),table);
    assert.deepEqual(result.completeness[table],{returned:raw.length,complete:true});
    for(const row of collections[index]){assert.equal(row.createdAt,stamp);assert.equal(row.updatedAt,stamp);assert.equal(row.version,1);assert.equal(row.sourceMode,'local_demo');}
  });
  assert.equal(result.own.academicGrades.records[0].courseTitle,before.affairs_academic_grade_records[0].course_title);
  assert.equal(result.own.academicGrades.records[1].credits,null);assert.equal(result.own.academicGrades.termSummaries[0].earnedCredits,0);
  assert.equal(result.own.academicGrades.termSummaries[1].passedCredits,null);assert.equal(result.own.academicGrades.termSummaries[1].failedCredits,4.25);
  assert.equal(result.own.academicGrades.rankings[0].departmentRankingText,before.affairs_academic_rankings[0].department_ranking_text);
  assert.deepEqual(result.own.graduationReview.reports.map(row=>row.reportKind),['academic_services','legacy']);
  assert.equal(result.own.graduationReview.reports[0].reportedAt,stamp);assert.equal(result.own.graduationReview.reports[0].identity.yearText,'');
  assert.equal(result.own.graduationReview.reports[0].otherCourses[0].credits,0);assert.equal(result.own.graduationReview.reports[0].languageRequirements[0].matchedCredits,null);
  assert.equal(result.own.graduationReview.reports[1].graduationReview.text,' Independent legacy status ');
  assert.equal(result.own.academicAttendance.statistics[0].currentTeachingWeeks,0);assert.equal(result.own.academicAttendance.statistics[0].currentTeachingHours,null);
  assert.equal(result.own.academicAttendance.statistics[0].studentNumber,'');assert.equal(result.own.academicAttendance.details[0].teacherName,'');
  assert.equal(result.own.academicAttendance.details[0].courseDate,'2026-11-11');assert.equal(result.own.academicAttendance.details[0].rollCalledAt,stamp);
  assert.equal(result.own.academicAttendance.metadata[0].currentAcademicYear,null);assert.equal(result.own.academicAttendance.metadata[0].currentSemester,null);
  assert.deepEqual(rows,frozen,'Validation and mapping must not normalize the persisted values.');
});

test('every persisted field is required, including nullable fields, in own and administrator sources',async()=>{
  for(const admin of [false,true])for(const [table,rows]of Object.entries(sourceRows(admin?other:owner)))for(const field of Object.keys(rows[0])){
    const malformed={...rows[0]};delete malformed[field];
    await assert.rejects(loadNativeAcademicRecords(owner,admin,async(name,query)=>name===table&&(!admin||!query.user_id)?[malformed]:[]),
      /invalid (?:account scope|persisted row)/,`${admin?'admin':'own'} ${table}.${field}`);
  }
});

test('malformed owned discriminators, nested reports, values and cross-kind fields fail before mapping',async()=>{
  const cases:Array<[string,Partial<Row>]>=[
    ['affairs_academic_grade_records',{record_kind:'unknown'}],['affairs_academic_grade_records',{credits:'0'}],
    ['affairs_academic_grade_records',{credits:NaN}],['affairs_academic_grade_records',{credits:Infinity}],['affairs_academic_grade_records',{credits:-1}],
    ['affairs_academic_grade_records',{credits:1.001}],['affairs_academic_grade_records',{credits:1000}],
    ['affairs_academic_grade_records',{course_title:{secret:'not text'}}],['affairs_academic_grade_records',{course_title:''}],
    ['affairs_academic_grade_records',{course_code:'warning-only'}],['affairs_academic_grade_records',{row_order:0.5}],
    ['affairs_academic_term_summaries',{summary_kind:'unknown'}],['affairs_academic_term_summaries',{attempted_credits:0}],
    ['affairs_academic_term_summaries',{earned_credits:10000}],['affairs_academic_rankings',{semester:12}],
    ['affairs_academic_rankings',{department_ranking_text:0}],['affairs_academic_metadata',{class_label:''}],
    ['affairs_graduation_reviews',{report_kind:'unknown'}],['affairs_graduation_reviews',{report_kind:null}],['affairs_graduation_reviews',{report:null}],
    ['affairs_graduation_reviews',{report:{...report,categories:{invalid:true}}}],['affairs_graduation_reviews',{report:{...report,reportedAt:'2026-02-30T00:00:00Z'}}],
    ['affairs_graduation_reviews',{report:{...report,otherCourses:[{...report.otherCourses[0],credits:'0'}]}}],
    ['affairs_graduation_reviews',{report:{...report,otherCourses:[report.otherCourses[0],report.otherCourses[0]]}}],
    ['affairs_graduation_reviews',{report:{...report,secret:'unsupported'}}],
    ['affairs_academic_attendance_statistics',{absence_hours:'0'}],['affairs_academic_attendance_statistics',{absence_hours:-1}],
    ['affairs_academic_attendance_statistics',{current_teaching_weeks:true}],['affairs_academic_attendance_statistics',{course_title:'   '}],
    ['affairs_academic_attendance_details',{course_date:'2026-02-30'}],['affairs_academic_attendance_details',{roll_called_at:'2026-11-12T10:12:13'}],
    ['affairs_academic_attendance_metadata',{current_academic_year:115,current_semester:null}],['affairs_academic_attendance_metadata',{current_academic_year:null,current_semester:1}],
  ];
  for(const admin of [false,true])for(const [table,patch]of cases){
    const malformed={...sourceRows(admin?other:owner)[table][0],...patch};
    await assert.rejects(loadNativeAcademicRecords(owner,admin,async(name,query)=>name===table&&(!admin||!query.user_id)?[malformed]:[]),/invalid persisted row/,
      `${admin?'admin':'own'} ${table} ${Object.keys(patch).join(',')}`);
  }
});

test('all sources reject malformed provenance, identity and transport types without coercion',async()=>{
  for(const [table,rows]of Object.entries(sourceRows()))for(const patch of [
    {id:'bad-id'},{source_mode:'official_sync'},{version:0},{version:'1'},{version:1.5},
    {created_at:null},{created_at:'2026-02-30T10:00:00Z'},{updated_at:'infinity'},
  ])await assert.rejects(loadNativeAcademicRecords(owner,false,async name=>name===table?[{...rows[0],...patch}]:[]),/invalid persisted row/,table);
});

test('duplicate primary keys and database-unique scopes fail; distinct owners and report kinds coexist',async()=>{
  const uniqueTables=Object.keys(sourceRows()).filter(table=>!['affairs_academic_grade_records','affairs_academic_attendance_details'].includes(table));
  for(const [table,rows]of Object.entries(sourceRows())){
    await assert.rejects(loadNativeAcademicRecords(owner,false,async name=>name===table?[rows[0],rows[0]]:[]),/duplicate persisted rows/,table);
    if(uniqueTables.includes(table))await assert.rejects(loadNativeAcademicRecords(owner,false,async name=>name===table?[rows[0],{...rows[0],id:anotherId}]:[]),/duplicate persisted rows/,table);
  }
  const own=sourceRows(),foreign=sourceRows(other),result=await loadNativeAcademicRecords(owner,true,async(table,query)=>query.user_id?own[table]:[...own[table],...foreign[table]]);
  assert.deepEqual(result.adminUserIds,[owner,other]);
  for(const collection of Object.values(result.own))for(const rows of Object.values(collection))assert.ok(rows.every((row:{userId:string})=>row.userId===owner));
  assert.equal(result.admin?.graduationReview.reports.length,2);assert.equal(result.admin?.academicAttendance.metadata.length,2);
});

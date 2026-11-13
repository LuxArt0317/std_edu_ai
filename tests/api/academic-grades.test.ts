import assert from 'node:assert/strict';
import {test} from 'node:test';
import {academicGradeReadSources,academicGradesNavigation,academicGradesPaths,answerAcademicGrades,isAcademicGradesQuestion,mapAcademicGrades} from '../../server/academicGrades.js';
// The frontend service is checked by its own TS project; load its source contract
// at runtime without adding it to the independent API composite project's files.
const frontendServiceUrl=new URL('../../src/services/academicGrades.ts',import.meta.url).href;
const {academicTranscriptColumns,academicWarningColumns,academicRankingColumns,academicWarningSummaryLabels}=await import(frontendServiceUrl);

const base={id:'synthetic-record',user_id:'student-one',source_mode:'local_demo',version:1,created_at:'2026-11-12T00:00:00Z',updated_at:'2026-11-12T00:00:00Z'};
const transcript={...base,academic_year:114,semester:1,record_kind:'transcript',course_title:'Synthetic transcript course',course_code:null,
  category_text:'LOCAL-CATEGORY-001',module_name:'Synthetic module',required_elective_text:'選修',credits:'3.50',grade_text:'P',remark_text:null,row_order:1};
const warning={...transcript,id:'synthetic-warning',academic_year:115,record_kind:'warning',course_title:'Synthetic warning course',course_code:'LOCAL-WARN-001',
  category_text:null,module_name:null,required_elective_text:null,grade_text:'F',remark_text:'Synthetic warning remark'};
const term={...base,id:'synthetic-summary',academic_year:114,semester:1,summary_kind:'transcript',earned_credits:'7.25',average_grade_text:'0.00',
  attempted_credits:null,passed_credits:null,failed_credits:null};
const warningTerm={...term,id:'synthetic-warning-summary',academic_year:115,summary_kind:'warning',earned_credits:null,average_grade_text:null,
  attempted_credits:'24.00',passed_credits:'0',failed_credits:null};
const rank={...base,id:'synthetic-rank',academic_year:114,semester:1,department_ranking_text:'2 / 40 (5.00%)',class_ranking_text:'0'};
const metadata={...base,id:'synthetic-metadata',class_label:'Synthetic class',english_requirement_text:'Synthetic display status'};
const snapshot={profile:{userId:'student-one'},academicGrades:mapAcademicGrades([transcript,warning],[term,warningTerm],[rank],[metadata])};
test('academic mapping preserves literal grades, category/rank text and explicit null versus zero fields',()=>{
  const data=mapAcademicGrades([transcript,{...transcript,id:'zero',grade_text:'0',credits:'0'},{...warning,id:'missing',grade_text:null,credits:null}],
    [term,warningTerm],[rank],[metadata]);
  assert.equal(data.records[0].gradeText,'P');assert.equal(data.records[0].categoryText,'LOCAL-CATEGORY-001');assert.equal(data.records[0].courseCode,null);
  assert.equal(data.records[1].gradeText,'0');assert.equal(data.records[1].credits,0);assert.equal(data.records[2].gradeText,null);assert.equal(data.records[2].credits,null);
  assert.equal(data.termSummaries[0].earnedCredits,7.25);assert.equal(data.termSummaries[0].averageGradeText,'0.00');
  assert.equal(data.termSummaries[1].passedCredits,0);assert.equal(data.termSummaries[1].failedCredits,null);
  assert.equal(data.rankings[0].departmentRankingText,'2 / 40 (5.00%)');assert.equal(data.rankings[0].classRankingText,'0');
  assert.equal(data.metadata[0].englishRequirementText,'Synthetic display status');assert.equal(data.records[0].sourceMode,'local_demo');
});
test('captured query columns remain distinct and read contracts require ordered owner-scoped pagination',()=>{
  assert.deepEqual([...academicTranscriptColumns],['選課時間','科目名稱','類別','模組名稱','必選修','學分數','成績']);
  assert.deepEqual([...academicWarningColumns],['課程代碼','課程名稱','學分數','成績','備註']);
  assert.deepEqual([...academicRankingColumns],['學年','學期','系排名','班排名']);
  assert.deepEqual([...academicWarningSummaryLabels],['總修習學分數','及格學分數','不及格學分數']);
  assert.equal(academicGradesNavigation.officialUrl,'https://infosys.stu.edu.tw/AcademicServices/login/AspLoginGrade');
  assert.deepEqual(academicGradeReadSources.map(source=>source.table),['affairs_academic_grade_records','affairs_academic_term_summaries','affairs_academic_rankings','affairs_academic_metadata']);
  assert.ok(academicGradeReadSources.every(source=>source.order.endsWith('id.asc')));
  assert.ok(academicGradeReadSources.find(source=>source.key==='rankings')?.order.startsWith('academic_year.desc,semester.desc'));
});
test('transcripts use explicit stored summaries even when they differ from course-credit sums',()=>{
  const answer=answerAcademicGrades('Show my academic transcript',snapshot)!;
  assert.equal(answer.url,academicGradesPaths.transcript);assert.match(answer.answer,/credits: 3.5; grade: P/);
  assert.match(answer.answer,/Explicit summary: earned credits 7.25; average grade 0.00/);
  assert.doesNotMatch(answer.answer,/earned credits 3.5|Synthetic warning|passed the course|eligible to graduate/);
  assert.match(answer.answer,/no pass status, graduation eligibility or university synchronization is inferred/);
});
test('missing summaries never become calculated totals and display grade zero or withdrawal literally',()=>{
  const missing={...snapshot,academicGrades:mapAcademicGrades([{...transcript,grade_text:'棄選',credits:'0'}])};
  const answer=answerAcademicGrades('我的歷年成績',missing)!;
  assert.match(answer.answer,/學分：0；成績：棄選/);assert.match(answer.answer,/實得學分 未記錄；平均成績 未記錄/);
  assert.doesNotMatch(answer.answer,/實得學分 0|已及格|未及格|已退選/);
});
test('warning answers retain their own explicit totals without converting P/F into final academic results',()=>{
  const answer=answerAcademicGrades('My warning grades for academic year115 semester1',snapshot)!;
  assert.equal(answer.url,academicGradesPaths.warning);assert.match(answer.answer,/LOCAL-WARN-001.*grade: F; remark: Synthetic warning remark/);
  assert.match(answer.answer,/attempted credits 24; passed credits 0; failed credits not recorded/);
  assert.doesNotMatch(answer.answer,/earned credits 7.25|average grade|failed credits 3.5|final grade/i);
});
test('ranking and English-requirement replies preserve text and make no eligibility calculation',()=>{
  const answer=answerAcademicGrades('My department rank',snapshot)!;
  assert.equal(answer.url,academicGradesPaths.ranking);assert.match(answer.answer,/department ranking: 2 \/ 40 \(5.00%\); class ranking: 0/);
  assert.doesNotMatch(answer.answer,/top 5|passed|eligible to/);
  const english=answerAcademicGrades('What is my English requirement status?',snapshot)!;
  assert.equal(english.url,academicGradesPaths.transcript);assert.match(english.answer,/Synthetic display status/);
  assert.match(english.answer,/not a graduation eligibility decision/);
});
test('GPA requests and follow-ups explicitly report the missing metric instead of converting semester averages',()=>{
  for(const question of ['What is my GPA?','What is my grade point average?','我的平均績點']){
    assert.equal(isAcademicGradesQuestion(question),true);
    const answer=answerAcademicGrades(question,snapshot)!;
    assert.equal(answer.url,academicGradesPaths.transcript);assert.match(answer.answer,/do not store GPA|沒有儲存 GPA/);
    assert.doesNotMatch(answer.answer,/0.00|7.25|GPA[=:：]\s*\d/);
  }
  const answer=answerAcademicGrades('What about GPA?',snapshot,academicGradesPaths.transcript,[{role:'user',content:'My transcript'}])!;
  assert.match(answer.answer,/cannot be converted into or treated as GPA/);
});
test('every academic collection is independently owner-filtered, including summaries, rankings and metadata',()=>{
  const foreign={...base,user_id:'student-two'};
  const mixed={...snapshot,academicGrades:mapAcademicGrades(
    [transcript,{...transcript,...foreign,id:'foreign-row',course_title:'PRIVATE OTHER COURSE'}],
    [term,{...term,...foreign,id:'foreign-summary',average_grade_text:'PRIVATE OTHER AVERAGE'}],
    [rank,{...rank,...foreign,id:'foreign-rank',department_ranking_text:'PRIVATE OTHER RANK'}],
    [metadata,{...metadata,...foreign,id:'foreign-metadata',english_requirement_text:'PRIVATE OTHER REQUIREMENT'}])};
  for(const question of ['My transcript','My ranking','My English requirement status'])assert.doesNotMatch(answerAcademicGrades(question,mixed)!.answer,/PRIVATE OTHER/);
  for(const value of [{academicGrades:mixed.academicGrades},{profile:{userId:'no-records'},academicGrades:mixed.academicGrades}]){
    assert.match(answerAcademicGrades('My transcript',value)!.answer,/No academic grade records/);
    assert.match(answerAcademicGrades('My ranking',value)!.answer,/No semester ranking records/);
    assert.match(answerAcademicGrades('My English requirement status',value)!.answer,/display status: not recorded/);
  }
});
test('transcript filters and ordering use explicit academic year and semester without mixing term summaries',()=>{
  const data={...snapshot,academicGrades:mapAcademicGrades([
    {...transcript,id:'second',semester:2,course_title:'SECOND SEMESTER'},
    {...transcript,id:'older',academic_year:113,course_title:'OLDER YEAR'},
    {...transcript,id:'earlier',row_order:0,course_title:'EARLIER ROW'},transcript,
  ],[term,{...term,id:'second-summary',semester:2,average_grade_text:'OTHER SEMESTER AVERAGE'}])};
  const answer=answerAcademicGrades('我的114學年第1學期歷年成績',data)!;
  assert.ok(answer.answer.indexOf('EARLIER ROW')<answer.answer.indexOf('Synthetic transcript course'));
  assert.doesNotMatch(answer.answer,/SECOND SEMESTER|OLDER YEAR|OTHER SEMESTER AVERAGE/);
  const followup=answerAcademicGrades('semester2',data,academicGradesPaths.transcript,[{role:'user',content:'My transcript academic year114'}])!;
  assert.match(followup.answer,/SECOND SEMESTER|OTHER SEMESTER AVERAGE/);assert.doesNotMatch(followup.answer,/OLDER YEAR|EARLIER ROW/);
  for(const question of ['My transcript semester12','我的第12學期成績','My transcript academic year10000']){
    const invalid=answerAcademicGrades(question,data,academicGradesPaths.transcript)!;
    assert.match(invalid.answer,/Specify a valid|請指定有效/);assert.doesNotMatch(invalid.answer,/Synthetic transcript course/);
  }
});
test('generic grades and relative terms ask for precision rather than labeling the latest history current',()=>{
  assert.match(answerAcademicGrades('My grades',snapshot)!.answer,/Please specify the transcript/);
  assert.match(answerAcademicGrades('My transcript this semester',snapshot)!.answer,/not designated as the current term/);
  assert.match(answerAcademicGrades('My ranking this year',snapshot)!.answer,/not designated as the current term/);
  assert.match(answerAcademicGrades('My current warning grades',snapshot)!.answer,/not designated as the current term/);
  const multiple={...snapshot,academicGrades:mapAcademicGrades([warning,{...warning,id:'older-warning',academic_year:114}])};
  const answer=answerAcademicGrades('My warning grades',multiple)!;
  assert.match(answer.answer,/Specify the academic year and semester/);assert.doesNotMatch(answer.answer,/Synthetic warning course/);
});
test('unobserved current, transfer and cycle populated states cannot manufacture private data or present captured emptiness as live fact',()=>{
  const current=answerAcademicGrades('My current-term grades',snapshot)!;
  assert.equal(current.url,academicGradesPaths.current);assert.doesNotMatch(current.answer,/when captured|source capture|opening period/);assert.match(current.answer,/no current-term grade model/);
  assert.doesNotMatch(current.answer,/Synthetic transcript course|Synthetic warning course/);
  for(const view of ['transfer','cycle'] as const){
    const answer=answerAcademicGrades('Show my records',snapshot,academicGradesPaths[view])!;
    assert.match(answer.answer,/does not establish that your university records are empty/);
    assert.doesNotMatch(answer.answer,/Synthetic transcript course|Synthetic warning course/);
  }
});
test('academic predicates yield to DTM, selection, credits, other records, navigation and action requests',()=>{
  const history=[{role:'user',content:'My transcript'}];
  for(const question of ['My DTM grades','我的Moodle成績','My eLearning grades','My assignment grade','我的選課紀錄',
    'My timetable','My course-selection history','My graduation credits','我的畢業學分','我的抵免學分','My credit-load application',
    'My fee balance','我的宿舍資料','My attendance records','Remind me to check my grades','新增待辦：查成績',
    'Where can I find my academic transcript?','How do I open the grade website?']){
    assert.equal(isAcademicGradesQuestion(question,academicGradesPaths.transcript,history),false,question);
  }
  assert.equal(isAcademicGradesQuestion('What is the average?',academicGradesPaths.transcript),true);
  assert.equal(isAcademicGradesQuestion('What is the average?','/school-affairs/services/39-1'),false);
  assert.equal(isAcademicGradesQuestion('Show my records','',history),true);
  assert.equal(isAcademicGradesQuestion('My grades','/dtm/course/synthetic/grades'),false);
  assert.equal(isAcademicGradesQuestion('What about my grades?','',[{role:'user',content:'My DTM courses'}]),false);
  assert.equal(isAcademicGradesQuestion('My academic transcript','/dtm/course/synthetic/grades'),true);
  assert.equal(isAcademicGradesQuestion('My grades',academicGradesPaths.transcript,[{role:'user',content:'My DTM courses'}]),true);
});
test('grade row limits count the entire own filtered scope and preserve explicit summaries without mutation',()=>{
  const records=Array.from({length:35},(_,i)=>({...transcript,id:`row-${i}`,academic_year:115,semester:2,row_order:i,
    course_title:`Synthetic bounded course ${i}`,credits:i===0?'0':null,grade_text:i===0?'0':null}));
  const data={profile:{userId:'student-one'},academicGrades:mapAcademicGrades([
    ...records,{...transcript,id:'other-term',course_title:'OTHER TERM'},
    {...records[0],id:'foreign',user_id:'student-two',course_title:'PRIVATE FOREIGN COURSE'},
  ],[{...term,academic_year:115,semester:2,earned_credits:'999.25',average_grade_text:'Literal stored average'}])};
  const before=structuredClone(data);
  const answer=answerAcademicGrades('My transcript academic year115 semester2',data)!;
  assert.equal((answer.answer.match(/Synthetic bounded course /g)??[]).length,20);
  assert.match(answer.answer,/Grade rows shown: 20 of 35 matching rows/);assert.match(answer.answer,/Terms shown: 1 of 1 matching terms/);
  assert.match(answer.answer,/credits: 0; grade: 0/);assert.match(answer.answer,/credits: not recorded; grade: not recorded/);
  assert.match(answer.answer,/Explicit summary: earned credits 999.25; average grade Literal stored average/);
  assert.doesNotMatch(answer.answer,/Synthetic bounded course 20|OTHER TERM|PRIVATE FOREIGN/);
  assert.match(answer.answer,/only part of the matching records, not the complete result/);
  assert.ok(answer.answer.includes(academicGradesPaths.transcript));assert.ok(Buffer.byteLength(answer.answer,'utf8')<=16384);
  assert.deepEqual(data,before);
});
test('summary-only terms count toward the ten-term cap and keep zero and missing explicit summaries distinct',()=>{
  const summaries=Array.from({length:12},(_,i)=>({...term,id:`summary-${i}`,academic_year:100+i,
    earned_credits:i===0?'0':null,average_grade_text:i===0?'0':null}));
  const data={profile:{userId:'student-one'},academicGrades:mapAcademicGrades([],summaries)};
  const before=structuredClone(data),answer=answerAcademicGrades('My transcript',data)!;
  assert.equal((answer.answer.match(/Academic year /g)??[]).length,10);
  assert.equal((answer.answer.match(/Explicit summary:/g)??[]).length,10);
  assert.match(answer.answer,/earned credits 0; average grade 0/);assert.match(answer.answer,/earned credits not recorded; average grade not recorded/);
  assert.match(answer.answer,/Grade rows shown: 0 of 0 matching rows/);assert.match(answer.answer,/Terms shown: 10 of 12 matching terms/);
  assert.doesNotMatch(answer.answer,/Academic year 110|Academic year 111|No academic grade records/);
  assert.ok(answer.answer.includes(academicGradesPaths.transcript));assert.deepEqual(data,before);
});
test('twenty grade rows is a global cap across terms and later shown terms retain their stored summaries',()=>{
  const records=Array.from({length:27},(_,i)=>({...transcript,id:`multi-${i}`,academic_year:110+Math.floor(i/9),row_order:i,
    course_title:`Multi-term course ${i}`}));
  const summaries=Array.from({length:3},(_,i)=>({...term,id:`multi-summary-${i}`,academic_year:110+i,
    earned_credits:String(900+i),average_grade_text:`Stored term ${i}`}));
  const data={profile:{userId:'student-one'},academicGrades:mapAcademicGrades(records,summaries)};
  const answer=answerAcademicGrades('My transcript',data)!;
  assert.equal((answer.answer.match(/Multi-term course /g)??[]).length,20);
  assert.match(answer.answer,/Grade rows shown: 20 of 27 matching rows/);assert.match(answer.answer,/Terms shown: 3 of 3 matching terms/);
  for(let i=0;i<3;i++)assert.ok(answer.answer.includes(`Explicit summary: earned credits ${900+i}; average grade Stored term ${i}.`));
  assert.doesNotMatch(answer.answer,/Multi-term course 20|earned credits 31.5|earned credits 7;/);
  const complete=answerAcademicGrades('My transcript academic year112',data)!;
  assert.equal((complete.answer.match(/Multi-term course /g)??[]).length,9);
  assert.match(complete.answer,/earned credits 902; average grade Stored term 2/);
  assert.doesNotMatch(complete.answer,/only part|not the complete result|rows shown/);
});
test('ranking and warning-term choices cap at twenty using full matching owner counts',()=>{
  const rankings=Array.from({length:25},(_,i)=>({...rank,id:`rank-${i}`,academic_year:100+i}));
  const warnings=Array.from({length:25},(_,i)=>({...warningTerm,id:`warning-summary-${i}`,academic_year:100+i}));
  const data={profile:{userId:'student-one'},academicGrades:mapAcademicGrades([],warnings,
    [...rankings,{...rank,id:'foreign',academic_year:999,user_id:'student-two',department_ranking_text:'PRIVATE RANK'}])};
  const before=structuredClone(data),ranking=answerAcademicGrades('My ranking',data)!,choices=answerAcademicGrades('My warning grades',data)!;
  assert.equal((ranking.answer.match(/department ranking:/g)??[]).length,20);
  assert.match(ranking.answer,/Ranking rows shown: 20 of 25 matching rows/);
  assert.ok(ranking.answer.indexOf('Academic year 124')<ranking.answer.indexOf('Academic year 123'));
  assert.doesNotMatch(ranking.answer,/Academic year 104|PRIVATE RANK/);assert.ok(ranking.answer.includes(academicGradesPaths.ranking));
  assert.match(choices.answer,/Specify the academic year and semester/);
  assert.equal((choices.answer.match(/Academic year /g)??[]).length,20);
  assert.match(choices.answer,/Warning terms shown: 20 of 25 matching terms/);
  assert.doesNotMatch(choices.answer,/Academic year 120|attempted credits/);assert.ok(choices.answer.includes(academicGradesPaths.warning));
  for(const answer of [ranking,choices]){
    assert.match(answer.answer,/not the complete result/);assert.ok(Buffer.byteLength(answer.answer,'utf8')<=16384);
  }
  assert.deepEqual(data,before);
});
test('maximum CJK literal grade fields fit a 16 KiB complete-answer budget without partial rows or computed totals',()=>{
  const records=Array.from({length:20},(_,i)=>({...transcript,id:`long-${i}`,row_order:i,
    course_title:`課${i.toString().padStart(2,'0')}`+'名'.repeat(157),category_text:'類'.repeat(160),module_name:'組'.repeat(160),
    required_elective_text:'選'.repeat(30),grade_text:'績'.repeat(80),credits:i===0?'0':null}));
  const data={profile:{userId:'student-one'},academicGrades:mapAcademicGrades(records,[{...term,earned_credits:'999.99',average_grade_text:'均'.repeat(80)}])};
  const before=structuredClone(data),answer=answerAcademicGrades('我的歷年成績',data)!;
  const coverage=answer.answer.match(/成績列：顯示 (\d+) \/ 20 筆符合條件的紀錄/);assert.ok(coverage);
  const shown=Number(coverage[1]);assert.ok(shown>0 && shown<20);
  for(const [index,record] of records.entries()){
    const whole=`${record.course_title}；類別：${record.category_text}；模組：${record.module_name}；必選修：${record.required_elective_text}；學分：${index===0?'0':'未記錄'}；成績：${record.grade_text}。`;
    if(index<shown)assert.ok(answer.answer.includes(whole),`complete literal row ${index}`);
    else assert.ok(!answer.answer.includes(record.course_title),`omitted entire row ${index}`);
  }
  assert.match(answer.answer,/實得學分 999.99/);assert.ok(answer.answer.includes('平均成績 '+'均'.repeat(80)));
  assert.match(answer.answer,/並非完整結果/);assert.ok(answer.answer.includes(academicGradesPaths.transcript));
  assert.match(answer.answer,/不計算及格、畢業資格或校方同步結果/);
  assert.ok(Buffer.byteLength(answer.answer,'utf8')<=16384);assert.deepEqual(data,before);
});
test('maximum CJK ranking and warning rows use byte limits as well as row limits',()=>{
  const rankings=Array.from({length:20},(_,i)=>({...rank,id:`long-rank-${i}`,academic_year:100+i,
    department_ranking_text:'系'.repeat(160),class_ranking_text:'班'.repeat(160)}));
  const warningRows=Array.from({length:20},(_,i)=>({...warning,id:`long-warning-${i}`,row_order:i,
    course_code:`W${i.toString().padStart(2,'0')}`+'碼'.repeat(77),course_title:'課'.repeat(160),grade_text:'績'.repeat(80),remark_text:'註'.repeat(300)}));
  const data={profile:{userId:'student-one'},academicGrades:mapAcademicGrades(warningRows,[warningTerm],rankings)};
  for(const [question,path,label] of [['My ranking',academicGradesPaths.ranking,'Ranking rows'],
    ['My warning grades academic year115 semester1',academicGradesPaths.warning,'Grade rows']]){
    const answer=answerAcademicGrades(question,data)!;
    const coverage=answer.answer.match(new RegExp(label+' shown: (\\d+) of 20 matching rows'));assert.ok(coverage);
    const shown=Number(coverage[1]);assert.ok(shown>0 && shown<20);
    const literal=label==='Ranking rows'?`; department ranking: ${'系'.repeat(160)}; class ranking: ${'班'.repeat(160)}.`
      :`; grade: ${'績'.repeat(80)}; remark: ${'註'.repeat(300)}.`;
    assert.equal(answer.answer.split(literal).length-1,shown,'every displayed row retains its complete final fields');
    if(label==='Grade rows')assert.match(answer.answer,/attempted credits 24; passed credits 0; failed credits not recorded/);
    assert.ok(Buffer.byteLength(answer.answer,'utf8')<=16384);assert.ok(answer.answer.includes(path));
    assert.match(answer.answer,/not the complete result/);assert.match(answer.answer,/no pass status, graduation eligibility or university synchronization is inferred/);
  }
});

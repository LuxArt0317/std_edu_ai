import assert from 'node:assert/strict';
import {test} from 'node:test';
import {answerDtmRecords,answerStudentServiceRecords} from '../../server/dtmAnswer.js';
import {accountEvidence,accountTools,supplementalAccountTools} from '../../server/answerVerificationAccount.js';
import {studyCalendar} from '../../server/affairsSchedule.js';
import {buildAccountFixture,fixtureForCase,EVAL_IDS,DEFAULT_EVAL_NOW,evaluationDates} from './fixtures.mjs';
import {buildAccountCases} from './account-cases.mjs';

test('evaluation fixtures are fresh and preserve independent oracles and explicit backend gaps',()=>{
  const a=buildAccountFixture(),b=buildAccountFixture();a.profile.displayName='Modified fixture';assert.equal(b.profile.displayName,'Evaluation Student');
  const cases=buildAccountCases();assert.equal(new Set(cases.map(row=>row.id)).size,cases.length);
  const registered={...accountTools,...supplementalAccountTools};
  for(const item of cases.filter(row=>!Object.hasOwn(registered,row.domain))){
    if(item.domain==='assistant-guidance'){
      assert.equal(item.mode,'coaching');assert.deepEqual(item.expected.requiredTools,[]);assert.deepEqual(item.expected.allowedTools,[]);
      assert.equal(item.expected.maxDistinctAttemptedTools,0);assert.equal(item.expected.guidanceRubric.version,'stu-guidance-v1');assert.equal(item.expected.verification,'verified');
      assert.ok(!item.coveredTools?.length,'Coaching must not fabricate personal-record coverage.');
    }else assert.equal(item.capability.gap,true,'An unregistered backend capability must remain an explicit gap.');
  }
  for(const item of cases){if(item.fixtureKey!=='anonymous')assert.ok(fixtureForCase(item));if(item.mode==='record'&&item.expected.behavior==='answer')assert.ok(item.expected.facts.length||item.expected.exactLists?.length,item.id);}
  assert.throws(()=>fixtureForCase('unknown-domain'));assert.throws(()=>fixtureForCase('unavailable:unknown'));
});
test('the bank declares all registered tools while actual DTM file fixtures remain unexecutable',()=>{
  const base=Object.keys(accountTools),supplemental=Object.keys(supplementalAccountTools),registered=[...base,...supplemental];
  assert.equal(base.length,17);
  assert.deepEqual(supplemental.sort(),['aidPayments','courseCatalog','dormitoryConduct','dtmGradeReport','dtmSubmissions','elearningEnrollments','elearningOutline','enrollmentCertificate','facilityRepairs','feeRemission','healthExaminations','studentConduct','studentLoan','tuition'].sort());
  assert.equal(new Set(registered).size,registered.length,'Base and supplemental registrations must not shadow each other.');
  const cases=buildAccountCases({includePlannedFeeRemission:true,includePlannedHealthExaminations:true}),declared=[...new Set(cases.flatMap(row=>row.expected.requiredTools))];
  assert.deepEqual(declared.sort(),registered.sort());
  const actualFileCases=cases.filter(row=>row.expected.requiredTools.includes('dtmSubmissions'));
  assert.equal(actualFileCases.length,1,'Declared actual-file intent is not evidence of executable fixtures or successful model coverage.');
  const trackerBoundary=cases.find(row=>row.id==='account:actual-file-submission-gap');
  assert.ok(trackerBoundary);assert.equal(trackerBoundary.capability.gap,true);
  assert.equal(trackerBoundary.expected.behavior,'unavailable');assert.equal(trackerBoundary.fixtureKey,'submissions');
  assert.deepEqual(actualFileCases,[trackerBoundary]);
  assert.deepEqual(trackerBoundary.expected.requiredTools,['assignments','dtm','dtmSubmissions']);
  assert.match(trackerBoundary.capability.limitation,/unsupported fixture setup failure/,
    'This required reader remains an execution gap until independently committed-file and revision-review fixtures exist.');
  const snapshot=fixtureForCase(trackerBoundary);
  assert.equal(snapshot.assignments.find(row=>row.title==='Reading response')?.status,'submitted');
  assert.equal(Object.hasOwn(snapshot,'dtmSubmissions'),false,'Tracker status must not fabricate actual committed files or reviews.');
  assert.throws(()=>fixtureForCase('dtmSubmissions'),/Unknown evaluation fixture/);
});
test('declared supplemental tools do not erase unavailable workflows or unbound catalog fixtures',()=>{
  const cases=buildAccountCases();
  for(const id of ['fees-monthly-history-gap','academic-gpa-gap','academic-current-gap','academic-transfer-gap','academic-cycle-gap','attendance-weekly-gap','enrollment-certificate-gap','tuition-summer-file-gap','tuition-extended-gap','action-upload-gap']){
    const item=cases.find(row=>row.id==='account:'+id);assert.ok(item,id);
    assert.equal(item.capability.gap,true,id);assert.equal(item.expected.behavior,'unavailable',id);
    assert.equal(item.expected.limitation,true,id);assert.ok(item.capability.limitation,id);
  }
  const pendingCatalog=cases.filter(row=>row.domain==='courseCatalog');assert.equal(pendingCatalog.length,5);
  for(const item of pendingCatalog){
    assert.equal(item.fixtureRequirement,'published_catalog_binding',item.id);
    assert.equal(item.capability.gap,true,item.id);assert.equal(item.expected.behavior,'unavailable',item.id);
    assert.deepEqual(item.expected.facts,[],item.id+' cannot claim published facts before independent binding.');
  }
});
test('relative deadlines and meeting fixtures rebase to the chosen Taipei evaluation clock',()=>{
  const now='2027-01-31T17:00:00Z',s=buildAccountFixture({now}),dates=evaluationDates(now);
  assert.equal(dates.today,'2027-02-01');assert.equal(dates.tomorrow,'2027-02-02');assert.equal(s.assignments[0].dueAt,'2027-02-02T04:00:00Z');assert.equal(s.courses[0].weekday,1);
  const c=buildAccountCases({now}).find(row=>row.id==='account:tomorrow-assignments');assert.equal(c.expected.facts[0].values[0],dates.tomorrow);
});
test('next known enrollment meeting includes a future term that starts Monday',()=>{
  const s=fixtureForCase('future-only'),calendar=studyCalendar(s.courses,s.checkedAt);
  assert.ok(calendar.next,'A known upcoming enrolled meeting must not disappear because its term has not started.');
  assert.equal(calendar.next.course.title,'Monday Research Seminar');assert.equal(calendar.next.day,'2026-11-16');
});
test('tomorrow assignment answer excludes next-month and already-submitted work',()=>{
  const s=buildAccountFixture(),answer=answerDtmRecords('Which assignments are due tomorrow?',s,'/dtm/assignments');
  assert.ok(answer);assert.match(answer.answer,/Index plan/);assert.doesNotMatch(answer.answer,/Final portfolio|Reading response/);
});
test('a selected material-content question answers from its saved summary',()=>{
  const s=buildAccountFixture(),answer=answerDtmRecords('What does Review notes say the quiz covers?',s,'/dtm/course/'+EVAL_IDS.dtmCourse);
  assert.ok(answer,'The selected course has an exact-title matching saved material.');assert.match(answer.answer,/normalization/);assert.match(answer.answer,/transaction isolation/);
});
test('a selected assessment feedback question returns its stored feedback',()=>{
  const s=buildAccountFixture(),answer=answerDtmRecords('What feedback did I receive on Quiz 1?',s,'/dtm/course/'+EVAL_IDS.dtmCourse+'/grades');
  assert.ok(answer,'The selected course has an exact-title matching grade feedback.');assert.match(answer.answer,/Revise normalization examples/);
});
test('a specifically requested course survives bounded DTM evidence after long archive rows',()=>{
  const testCase=buildAccountCases().find(row=>row.id==='account:dtm-tail-retrieval'),snapshot=fixtureForCase(testCase);
  const evidence=accountEvidence(snapshot,['dtm'],{question:testCase.question,route:testCase.route,history:[]});
  const source=evidence.find(row=>row.id==='account:dtm');assert.ok(source);assert.match(source.content,/Target Research Seminar/);assert.match(source.content,/normalization/);
});
test('a specifically requested assignment survives bounded evidence after historical archive rows',()=>{
  const testCase=buildAccountCases({now:DEFAULT_EVAL_NOW}).find(row=>row.id==='account:assignment-tail-retrieval'),snapshot=fixtureForCase(testCase);
  const evidence=accountEvidence(snapshot,['assignments'],{question:testCase.question,route:testCase.route,history:[]});
  const source=evidence.find(row=>row.id==='account:assignments');assert.ok(source);assert.match(source.content,/Compare B-tree and hash indexes in two pages/);
});

test('next class considers distant valid terms while excluding ended, withdrawn and malformed meetings',()=>{
  const s=buildAccountFixture();
  const future={...s.courses[2],termStartsOn:'2027-02-15',termEndsOn:'2027-06-25',weekday:2};
  const plan=studyCalendar([{...s.courses[0],termEndsOn:'2026-11-12'}, {...future,status:'withdrawn'}, {...future,startsAt:'99:99'},future],DEFAULT_EVAL_NOW);
  assert.equal(plan.next?.day,'2027-02-16');assert.equal(plan.next?.course.title,'Research Practicum');
});
test('assignment today and tomorrow boundaries use Taipei midnight, not UTC or all open records',()=>{
  const s=buildAccountFixture({now:'2026-11-13T15:30:00Z'});
  s.assignments=[{...s.assignments[0],title:'Before midnight',dueAt:'2026-11-13T15:59:00Z'}, {...s.assignments[0],id:'next-day',title:'After midnight',dueAt:'2026-11-13T16:00:00Z'}, {...s.assignments[0],id:'later',title:'Next month',dueAt:'2026-12-20T00:00:00Z'}];
  const today=answerDtmRecords('Which assignments are due today?',s,'/dtm/assignments').answer;
  const tomorrow=answerDtmRecords('Which assignments are due tomorrow?',s,'/dtm/assignments').answer;
  assert.match(today,/Before midnight/);assert.doesNotMatch(today,/After midnight|Next month/);
  assert.match(tomorrow,/After midnight/);assert.doesNotMatch(tomorrow,/Before midnight|Next month/);
});
test('saved meeting notes and absence work use the named meeting and only its linked assignment',()=>{
  const s=buildAccountFixture();
  const notes=answerDtmRecords('What did I record about Database indexes on2026-11-10?',s,'/dtm').answer;
  assert.match(notes,/B-tree and hash indexes/);assert.match(notes,/prepare an index plan/);assert.doesNotMatch(notes,/Transaction lab/);
  const missed=answerDtmRecords('I missed Database indexes in Learning Research on2026-11-10. What work was assigned?',s,'/dtm').answer;
  assert.match(missed,/Index plan/);assert.match(missed,/two pages/);assert.match(missed,/B-tree and hash indexes/);assert.doesNotMatch(missed,/Final portfolio|Reading response/);
});
test('DTM material and grade multipart answers preserve saved content and literal zero rather than inventing totals',()=>{
  const s=buildAccountFixture();s.dtm.courses[0].grades[0].score=0;
  const response=answerDtmRecords('Show Review notes and my Quiz 1 feedback in Learning Research.',s,'/dtm').answer;
  assert.match(response,/transaction isolation/);assert.match(response,/Revise normalization examples/);assert.match(response,/0\/20 \(0\.0%\)/);
  const final=answerDtmRecords('What is my official final grade in Learning Research?',s,'/dtm').answer;
  assert.match(final,/no official final grade/i);assert.doesNotMatch(final,/official final grade is 0/);
});
test('grade feedback follow-up stays on the named prior assessment and unknown assessment does not substitute another grade',()=>{
  const s=buildAccountFixture();s.dtm.courses[0].grades.push({...s.dtm.courses[0].grades[0],id:'second-grade',label:'Quiz 10',feedback:'Different feedback'});
  const history=[{role:'user',content:'Show my Quiz 1 score in Learning Research.'}];
  const reply=answerDtmRecords('What feedback did I get?',s,'/',history).answer;
  assert.match(reply,/Revise normalization examples/);assert.doesNotMatch(reply,/Different feedback/);
  const missing=answerDtmRecords('What feedback did I get on Quiz 99?',s,'/dtm').answer;
  assert.match(missing,/No recorded grade matches/);assert.doesNotMatch(missing,/Revise normalization|Different feedback/);
});
test('private DTM routes do not substitute another course and tracker status never proves a file upload',()=>{
  const s=buildAccountFixture();
  const unknown=answerDtmRecords('Show the course materials',s,'/dtm/course/00000000-0000-4000-8000-000000000099').answer;
  assert.match(unknown,/No saved DTM courses match/);assert.doesNotMatch(unknown,/normalization/);
  const upload=answerDtmRecords('Was the file for Reading response actually uploaded, and which revision was graded?',s,'/dtm').answer;
  assert.match(upload,/no verifiable uploaded-file/);assert.match(upload,/does not prove a file was uploaded/);
});
test('DTM account role, imported origin and negative submitted phrasing answer the requested stored field',()=>{
  const s=buildAccountFixture();
  assert.match(answerDtmRecords('What is my role in Learning Research on Moodle?',s,'/dtm').answer,/Role: student/);
  const pending=answerDtmRecords('Which assignments have not been submitted?',s,'/dtm').answer;
  assert.match(pending,/Index plan/);assert.doesNotMatch(pending,/Reading response/);
  const imported=answerDtmRecords('Which assignments came from the Moodle calendar import?',s,'/dtm').answer;
  assert.match(imported,/Final portfolio/);assert.doesNotMatch(imported,/Index plan|Reading response/);
});
test('foreign-owned DTM rows cannot influence a private answer even if accidentally present in an input snapshot',()=>{
  const s=buildAccountFixture();s.dtm.courses.push({...s.dtm.courses[0],id:'foreign-course',userId:'other-user',title:'Foreign secret course',grades:[{id:'foreign-grade',label:'Quiz 77',score:99,maximum:100,feedback:'FOREIGN PRIVATE SENTINEL'}]});
  const result=answerDtmRecords('Show all my Moodle grades',s,'/dtm').answer;
  assert.match(result,/Quiz 1/);assert.doesNotMatch(result,/FOREIGN PRIVATE SENTINEL|Quiz 77/);
});
test('assignment feedback and its follow-up never substitute an unrelated course assessment',()=>{
  const s=buildAccountFixture();
  for(const [question,history] of [['What feedback did I get on Reading response?',[]],['What feedback did I get?',[{role:'user',content:'Is Reading response marked submitted?'}]]]){
    const reply=answerDtmRecords(question,s,'/dtm',history).answer;
    assert.match(reply,/no verifiable linked assessment or feedback/);assert.doesNotMatch(reply,/Revise normalization|Quiz 1|12\/20/);
  }
  const namedAssessment=answerDtmRecords('Show Reading response and Quiz 1 feedback.',s,'/dtm').answer;
  assert.match(namedAssessment,/Revise normalization examples/);
});
test('all Moodle courses overrides an open course route while an explicitly requested term still constrains all',()=>{
  const s=buildAccountFixture(),route='/dtm/course/'+EVAL_IDS.dtmCourse;
  const all=answerDtmRecords('List all my Moodle courses.',s,route).answer;
  assert.match(all,/Learning Research/);assert.match(all,/Introduction to Research/);assert.match(all,/Advanced Research/);
  const term=answerDtmRecords('List all my Moodle courses for academic year 114, semester 2.',s,route).answer;
  assert.match(term,/Introduction to Research/);assert.doesNotMatch(term,/Learning Research|Advanced Research/);
});
test('named saved material, assignment and missed meeting resolve their actual course despite an unrelated open route',()=>{
  const s=buildAccountFixture(),route='/dtm/course/'+EVAL_IDS.historicalDtmCourse;
  const material=answerDtmRecords('What does Review notes say?',s,route).answer;
  assert.match(material,/transaction isolation/);assert.doesNotMatch(material,/Introduction to Research/);
  const assignment=answerDtmRecords('What instructions are saved for Index plan?',s,route).answer;
  assert.match(assignment,/Compare B-tree and hash indexes in two pages/);assert.match(assignment,new RegExp(EVAL_IDS.dtmCourse+'/assignments'));
  const missed=answerDtmRecords('I missed Database indexes. What work was assigned?',s,route).answer;
  assert.match(missed,/Index plan/);assert.match(missed,/two pages/);assert.doesNotMatch(missed,/Final portfolio|Reading response/);
});
test('DTM route announcement queries answer saved notice content and filter foreign-owned notices',()=>{
  const s=buildAccountFixture();s.dtm.notices.push({...s.dtm.notices[0],id:'foreign-notice',user_id:'another-account',title:'Foreign notice',body:'PRIVATE NOTICE SENTINEL'});
  const answer=answerDtmRecords('What are my announcements?',s,'/dtm').answer;
  assert.match(answer,/laboratory opens at 08:30 on Saturday/);assert.doesNotMatch(answer,/PRIVATE NOTICE SENTINEL|Introduction to Research/);
  assert.equal(answerDtmRecords('What are my School Affairs announcements?',s,'/dtm'),null);
});
test('foreign-owned or mismatched-lineage DTM children cannot affect direct answers',()=>{
  const s=buildAccountFixture(),course=s.dtm.courses[0],route='/dtm/course/'+course.id;
  course.materials.push({...course.materials[0],id:'foreign-material',userId:'another-account',title:'Foreign material',summary:'FOREIGN MATERIAL SENTINEL'});
  course.grades.push({...course.grades[0],id:'wrong-grade',courseId:EVAL_IDS.historicalDtmCourse,label:'Quiz 88',feedback:'WRONG COURSE GRADE SENTINEL'});
  course.meetings.push({...course.meetings[0],id:'wrong-meeting',dtm_course_id:EVAL_IDS.historicalDtmCourse,title:'Foreign meeting',notes:'WRONG COURSE MEETING SENTINEL'});
  s.assignments.push({...s.assignments[0],id:'foreign-assignment',user_id:'another-account',title:'Foreign assignment',details:'FOREIGN ASSIGNMENT SENTINEL'});
  for(const question of ['Show all course materials.','Show my DTM grade feedback.','Show my saved meetings.','Which assignments are unfinished?']){
    const answer=answerDtmRecords(question,s,route).answer;assert.doesNotMatch(answer,/SENTINEL|Quiz 88|Foreign assignment/);
  }
});
test('named internship and leave status reads stay local, owned and separate from unrelated native record questions',()=>{
  const s=buildAccountFixture(),route='/school-affairs/services/internship';
  s.serviceRecords.push({...s.serviceRecords[1],id:'foreign-service',userId:'another-account',title:'PRIVATE INTERNSHIP SENTINEL'});
  const named=answerStudentServiceRecords('What status is saved for my Community Internship?',s,route).answer;
  assert.match(named,/Community Internship/);assert.match(named,/marked filed by you/);assert.doesNotMatch(named,/PRIVATE INTERNSHIP SENTINEL|Clinic leave/);
  const routeOnly=answerStudentServiceRecords('What status is saved?',s,route).answer;
  assert.match(routeOnly,/Community Internship/);assert.doesNotMatch(routeOnly,/Clinic leave/);
  for(const question of ['What is my tuition status?','Show my academic transcript.','What is the status of my payroll note?','What grades did I get in my internship?'])assert.equal(answerStudentServiceRecords(question,s,route),null,question);
  assert.equal(answerStudentServiceRecords('What is saved?',s,'/'),null);
});

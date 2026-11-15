import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildAccountCases} from './account-cases.mjs';
import {buildAccountFixture,fixtureForCase} from './fixtures.mjs';
import {studyCalendar} from '../../server/affairsSchedule.js';
import {gradeCase} from './grading.mjs';
import {buildGuidanceReviewBinding,validateGuidanceReview} from './guidance-rubric.mjs';

const ids=['overview-records','overview-learning-attention','current-course-and-year','current-course-and-year-zh','future-course-current-year','current-course-followup-room','qualification-coaching-typo','qualification-from-learning-records','quiz-feedback-interview-help','current-courses-plus-interview-draft','current-course-year-gpa-partial','empty-transcript-interview-help','unavailable-certificate-partial','topic-change-excludes-finances'];
const bank=buildAccountCases();
const get=id=>bank.find(item=>item.id==='account:'+id);
const fail=(result,id)=>assert.ok(result.failures.some(row=>row.id===id),JSON.stringify(result.failures));
function envelope(item,answer){
  return {statusCode:200,execution:'recorded',sourceRevision:'offline-case-revision',fixtureKey:item.fixtureKey,events:item.expected.requiredAttemptedTools.map(name=>({kind:'account-read:'+name+':1',status:name==='enrollmentCertificate'&&item.fixtureRequirement==='offline_reader_failure'?'unavailable':'complete'})),body:{status:'answered',answer,verification:{status:'verified',attempts:1},citations:item.expected.requiredLinks.map((url,index)=>({url,chunkId:'account:'+(item.expected.requiredTools[index%item.expected.requiredTools.length]||'courses')}))}};
}
// This only supplies the already-validated runner result to isolate fact/tool
// gates. Separate guidance-rubric tests validate real response-bound artifacts.
const review=(item,response)=>({independentReview:{status:'passed',passed:true,binding:buildGuidanceReviewBinding({runId:'offline-case-review',finalSuiteHash:'a'.repeat(64),sourceRevision:response.sourceRevision,testCase:item,envelope:response}),criteria:item.expected.guidanceRubric.criteria.map(({id})=>({id,passed:true})),failures:[]}});
const reviewedGrade=(item,response)=>gradeCase(item,response,review(item,response));

test('fourteen separately identified questions retain independent fixtures and bounded relevant-tool policies',()=>{
  assert.equal(ids.length,14);assert.equal(new Set(ids).size,14);
  for(const id of ids){const item=get(id);assert.ok(item,id);assert.ok(fixtureForCase(item));assert.equal(item.expected.requireToolExecution,true);assert.equal(item.expected.forbidPublicResearch,true);assert.equal(item.expected.maxDistinctAttemptedTools,item.expected.allowedTools.length);assert.ok(item.expected.requiredAttemptedTools.every(name=>item.expected.allowedTools.includes(name)));}
  const overview=get('overview-records');assert.deepEqual(overview.expected.allowedTools,['profile','courses','dtm','assignments','charges','tasks','requests']);
  const fixture=buildAccountFixture();assert.equal(fixture.student.yearLevel,3);assert.equal(fixture.courses[0].code,'DB301');assert.equal(fixture.assignments.length,3);assert.equal(fixture.charges.length,2);assert.equal(fixture.tasks.length,2);assert.equal(fixture.requests.length,1);
});
test('new mixed evidence expectations do not copy school-affairs grades into Moodle feedback',()=>{
  const item=get('quiz-feedback-interview-help'),fixture=fixtureForCase(item);
  assert.deepEqual(item.expected.requiredTools,['dtm','assignments']);
  assert.equal(fixture.dtm.courses[0].grades[0].feedback,'Revise normalization examples.');
  assert.equal(fixture.dtm.courses[0].grades[0].score,12);assert.equal(fixture.academicGrades.records[0].gradeText,'87');
  const answer='Your local Learning Research course: Quiz 1 feedback is Revise normalization examples. Practice explaining normalization with a small example you create. Use a placeholder for any actual project until you supply it.';
  const good=envelope(item,answer);assert.equal(reviewedGrade(item,good).passed,true);
  fail(reviewedGrade(item,envelope(item,answer.replace('Revise normalization examples.','Excellent professional experience.'))),'fact.0');
  fail(reviewedGrade(item,envelope(item,answer+' Your Quiz 1 score is 87.')),'text.forbidden.10');
});
test('course plus year requires both independently recorded parts, not only a fluent course answer',()=>{
  const item=get('current-course-and-year'),good=envelope(item,'Your local current course is Database Design (DB301). Your recorded year level is 3.');
  assert.equal(gradeCase(item,good).passed,true);
  fail(gradeCase(item,envelope(item,'Your local current course is Database Design (DB301).')),'fact.1');
  fail(gradeCase(item,envelope(item,'Your local year level is 3.')),'fact.0');
  fail(gradeCase(item,envelope(item,'Your local current courses are Database Design (DB301) and Withdrawn Studio. Your recorded year level is 3.')),'list.0.exclude.2');
});
test('next-term enrollment does not increment the currently saved year',()=>{
  const item=get('future-course-current-year');
  assert.equal(gradeCase(item,envelope(item,'Local next-semester course: Research Practicum (FUT401), 115學年度第2學期. Your current year level is 3.')).passed,true);
  fail(gradeCase(item,envelope(item,'Local next-semester course: Research Practicum (FUT401), 115學年度第2學期. Your current year level is 4.')),'fact.1');
});
test('Chinese multi-part facts accept the actual recorded third year without English-only grading',()=>{
  const item=get('current-course-and-year-zh');
  assert.equal(gradeCase(item,envelope(item,'站內這學期的課程為 Database Design（DB301）。目前年級：三年級。')).passed,true);
});
test('pure coaching is not an account-record coverage case and cannot self-approve helpfulness',()=>{
  const item=get('qualification-coaching-typo');assert.equal(item.mode,'coaching');assert.equal(item.domain,'assistant-guidance');assert.deepEqual(item.expected.facts,[]);assert.deepEqual(item.expected.requiredTools,[]);assert.equal(item.expected.maxDistinctAttemptedTools,0);
  const good=envelope(item,'Start with your actual learning, one example you can explain, and what you want to improve. Draft: “I have studied [actual topic], and in [real example] I [specific contribution].” Choose one genuine example and fill those slots. What project or exercise could you discuss?');
  fail(gradeCase(item,good),'guidance.independentReview');
  const spoof=structuredClone(good);spoof.body.independentReviewResult=review(item,good).independentReview;spoof.independentReviewResult=review(item,good).independentReview;
  fail(gradeCase(item,spoof),'guidance.independentReview');
  assert.equal(reviewedGrade(item,good).passed,true);
  const invented=envelope(item,'You are qualified to be a software engineer. '+good.body.answer);
  fail(reviewedGrade(item,invented),'text.forbidden.5');
  const personal=structuredClone(good);personal.events.push({kind:'account-read:profile:1',status:'complete'});
  fail(reviewedGrade(item,personal),'tools.allowed.attempted');
});
test('course advice requires both records and independent usable-help review',()=>{
  const item=get('current-courses-plus-interview-draft'),onlyFacts=envelope(item,'Your local current course is Database Design (DB301).');
  fail(gradeCase(item,onlyFacts),'guidance.independentReview');
  const rejected=review(item,onlyFacts);rejected.independentReview.status='failed';rejected.independentReview.passed=false;rejected.independentReview.criteria.find(row=>row.id==='usable_help').passed=false;
  fail(gradeCase(item,onlyFacts,rejected),'guidance.independentReview');
});
test('published sample coaching keeps its own literal course binding, rubric and scope',()=>{
  const original=get('current-courses-plus-interview-draft'),sample=get('published-sample-current-courses-plus-interview-draft');
  assert.equal(sample.question,original.question);
  assert.equal(original.fixtureKey,'courses');
  assert.deepEqual(original.expected.facts.map(({label,values})=>[label,values]),[['Database Design',['DB301']]]);
  assert.equal(sample.fixtureKey,'published-sample:records');
  assert.deepEqual(sample.expected.guidanceRubric,original.expected.guidanceRubric);
  assert.deepEqual(sample.expected.requiredTools,['courses']);
  assert.deepEqual(sample.expected.requiredAttemptedTools,['courses']);
  assert.deepEqual(sample.expected.allowedTools,['courses']);
  assert.equal(sample.expected.requireToolExecution,true);
  assert.equal(sample.expected.forbidPublicResearch,true);

  const now='2026-11-16T04:00:00.000Z',snapshot=fixtureForCase(sample,{now}),calendar=studyCalendar(snapshot.courses,now);
  assert.deepEqual(calendar.current.map(({code,title,sourceMode})=>[code,title,sourceMode]),[
    ['SAMP101','Campus Orientation','sample'],['SAMP102','Digital Learning Basics','sample'],['SAMP103','Student Services Practice','sample'],
  ]);
  assert.deepEqual(calendar.historical.map(row=>row.code),['SAMP090']);
  assert.deepEqual(calendar.upcoming.map(row=>row.code),['SAMP201']);

  const answer='Your saved sample subjects for this semester are Campus Orientation (SAMP101), Digital Learning Basics (SAMP102) and Student Services Practice (SAMP103).'
    +'\n\nPick one real exercise. Practice draft: “In [exercise], my contribution was [what you actually did].”';
  const item=envelope(sample,answer);
  assert.equal(reviewedGrade(sample,item).passed,true);
  fail(gradeCase(sample,item),'guidance.independentReview');
  fail(reviewedGrade(sample,envelope(sample,answer.replace('Student Services Practice (SAMP103)','Study Skills Foundations (SAMP090)'))),'list.0.exclude.0');
  const enrollmentClaim=sample.expected.forbiddenText.indexOf('You are officially enrolled');
  fail(reviewedGrade(sample,envelope(sample,answer+' You are officially enrolled.')),'text.forbidden.'+enrollmentClaim);
  const limited=answer+' The sample records do not establish whether you’re officially enrolled.';
  assert.equal(reviewedGrade(sample,envelope(sample,limited)).passed,true);
  fail(reviewedGrade(sample,envelope(sample,answer.replace('saved sample','saved local'))),'source.provenance');
  const overbroad=structuredClone(item);
  overbroad.events.push({kind:'account-read:charges:1',status:'complete'});
  fail(reviewedGrade(sample,overbroad),'tools.allowed.attempted');
  fail(reviewedGrade(original,envelope(original,answer)),'fact.0');
});

test('empty transcript fixture does not erase the useful coaching requirement or become a failed read',()=>{
  const item=get('empty-transcript-interview-help'),fixture=fixtureForCase(item);assert.deepEqual(fixture.academicGrades.records,[]);
  const good=envelope(item,'Your local transcript has no saved records. You can still draft an honest introduction using [actual learning], [a real example], and [what you want to improve]. Choose one real exercise and fill in those details.');
  assert.equal(reviewedGrade(item,good).passed,true);
  fail(reviewedGrade(item,envelope(item,'Your local transcript service is unavailable. Try again.')),'fact.0');
  fail(reviewedGrade(item,envelope(item,good.body.answer+' You have never studied.')),'text.forbidden.10');
});
test('injected failure remains explicit offline-only and cannot accept normal, empty or unattempted certificate results',()=>{
  const item=get('unavailable-certificate-partial');assert.equal(item.fixtureRequirement,'offline_reader_failure');assert.equal(item.capability.gap,true);assert.deepEqual(item.expected.requiredTools,['profile','courses']);assert.ok(item.expected.requiredAttemptedTools.includes('enrollmentCertificate'));
  const answer='Your local current course is Database Design (DB301). Your recorded year level is 3. The certificate read is unavailable; I cannot infer that no records exist.';
  assert.equal(reviewedGrade(item,envelope(item,answer)).passed,true);
  const normal=envelope(item,answer);normal.events.at(-1).status='complete';fail(reviewedGrade(item,normal),'tool.terminal.enrollmentCertificate');
  const notTried=envelope(item,answer);notTried.events.pop();fail(reviewedGrade(item,notTried),'tool.attempted.enrollmentCertificate');
  fail(reviewedGrade(item,envelope(item,answer+' No certificate records are saved.')),'text.forbidden.7');
});
test('explicit new topic rejects stale financial facts and even failed financial lookup attempts',()=>{
  const item=get('topic-change-excludes-finances'),answer='Your local current course is Database Design (DB301). Your recorded year level is 3.';
  assert.equal(gradeCase(item,envelope(item,answer)).passed,true);
  const broad=envelope(item,answer);broad.events.unshift({kind:'account-read:charges:1',status:'unavailable'});
  fail(gradeCase(item,broad),'tools.allowed.attempted');
  fail(gradeCase(item,envelope(item,answer+' Your balance is TWD 23,000.')),'text.forbidden.5');
});


test('an independently validated guidance review is bound to the exact case, question, response and revision',()=>{
  const item=get('qualification-coaching-typo'),response=envelope(item,'Choose one real project or exercise you can explain. Draft: “I studied [actual topic] and used it in [real exercise].” Fill in one truthful example, then practise explaining your own contribution.');
  const binding=buildGuidanceReviewBinding({runId:'independent-rebind-test',finalSuiteHash:'b'.repeat(64),sourceRevision:response.sourceRevision,testCase:item,envelope:response});
  const artifact={binding,reviewer:{id:'synthetic-offline-reviewer',method:'manual'},criteria:item.expected.guidanceRubric.criteria.map(({id,proof})=>({id,passed:true,answerSpans:proof==='spans'?[{start:0,end:response.body.answer.length,text:response.body.answer}]:[],...(proof==='whole_answer'?{examinedRange:{start:0,end:response.body.answer.length}}:{})}))};
  const independentReview=validateGuidanceReview({testCase:item,envelope:response,binding,artifact});assert.equal(independentReview.status,'passed');
  assert.equal(gradeCase(item,response,{independentReview}).passed,true);
  const changed=structuredClone(response);changed.body.answer='I refuse to help.';fail(gradeCase(item,changed,{independentReview}),'guidance.independentReview');
  fail(gradeCase({...item,id:item.id+'-different'},response,{independentReview}),'guidance.independentReview');
  fail(gradeCase({...item,question:'Different coaching request'},response,{independentReview}),'guidance.independentReview');
  fail(gradeCase(item,{...response,sourceRevision:'different-revision'},{independentReview}),'guidance.independentReview');
  const unbound=structuredClone(independentReview);delete unbound.binding;fail(gradeCase(item,response,{independentReview:unbound}),'guidance.independentReview');
});

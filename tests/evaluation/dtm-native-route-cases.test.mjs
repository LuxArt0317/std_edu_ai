import assert from 'node:assert/strict';
import test from 'node:test';
import {buildDtmNativeRouteCases,dtmNativeRouteFixture,dtmNativeRouteManifest,gradeDtmNativeRouteCase} from './dtm-native-route-cases.mjs';
import {readDtmGradeReportEvidence} from '../../server/accountDtmGradeReportEvidence.js';
import {parseDtmGradeReportOverviewData,parseDtmGradeReportData} from '../../server/dtmGradeReport.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';
import {isNativeDtmGradeOnlyQuestion} from '../../server/dtmGradeEvidenceIntent.js';
const bank=buildDtmNativeRouteCases(),owner=dtmNativeRouteManifest.ownerId;
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:owner}};
async function rendered(testCase){
  const fixture=dtmNativeRouteFixture(testCase.nativeExpectation.fixture),reads=[];
  const result=await readDtmGradeReportEvidence(account,{question:testCase.question,route:testCase.route,history:testCase.history},{
    loadOverview:async(caller,query)=>{reads.push({operation:'overview',ownerId:caller.user.id,query,...(testCase.nativeExpectation.fixture==='failed'?{failed:true}:{data:structuredClone(fixture.overview)})});
      if(testCase.nativeExpectation.fixture==='failed')throw Error('OFFLINE_UNAVAILABLE');return fixture.overview;},
    loadReport:async(caller,{courseId})=>{reads.push({operation:'report',ownerId:caller.user.id,courseId,data:structuredClone(fixture.report)});return fixture.report;},
  });
  const body=formatSupplementalAccountAnswers([result],{question:testCase.question});
  const observation={ownerId:owner,execution:'mocked',reads,evidence:JSON.parse(result.evidence.content),broadReads:0,publicReads:0,writes:0};
  const envelope={statusCode:200,execution:'deterministic',fixtureKey:testCase.fixtureKey,body,events:[{kind:'account-read:dtmGradeReport:1',status:result.readState==='unavailable'?'unavailable':'complete'}]};
  return {testCase,envelope,observation};
}
const grade=value=>gradeDtmNativeRouteCase(value.testCase,value.envelope,value.observation);
test('independent packet keeps exact route intent, source distinctions and unmounted fixture limits',()=>{
  assert.equal(bank.length,14);assert.equal(new Set(bank.map(row=>row.id)).size,14);
  assert.ok(bank.every(row=>row.mounted===false&&row.setupEligible===false));
  assert.equal(dtmNativeRouteManifest.inventory.length,10);assert.equal(dtmNativeRouteManifest.liveReady,false);
  for(const mode of dtmNativeRouteManifest.fixtureModes){
    const fixture=dtmNativeRouteFixture(mode);assert.deepEqual(parseDtmGradeReportOverviewData(fixture.overview,owner),fixture.overview);
    assert.deepEqual(parseDtmGradeReportData(fixture.report,owner,dtmNativeRouteManifest.courseId),fixture.report);
  }
  const copy=dtmNativeRouteFixture();copy.overview.courses[0].gradeText='FOREIGN';assert.equal(dtmNativeRouteFixture().overview.courses[0].gradeText,null);
});
test('actual native projector and formatter satisfy content/state oracle without receiving model-verification credit',async()=>{
  for(const testCase of bank.filter(row=>row.nativeExpectation.overviewCalls)){
    const value=await rendered(testCase),result=grade(value);
    const content=result.failures.filter(row=>row.id!=='answer.verification');
    assert.deepEqual(content,[],testCase.id+': '+JSON.stringify(content));
    if(testCase.expected.behavior==='answer')assert.equal(result.passed,false,'Formatter alone must not manufacture strict model verification.');
    assert.equal(result.modelAcceptance,false);assert.equal(result.liveAcceptance,false);
    assert.equal(isNativeDtmGradeOnlyQuestion(testCase.question,testCase.route,testCase.history),true,testCase.id);
  }
});
test('record field pairing rejects swapped null/blank/zero and feedback from a different report item',async()=>{
  for(const suffix of ['grades','item-feedback','saved-total']){
    const value=await rendered(bank.find(row=>row.id.endsWith('-'+suffix)));
    value.envelope.body.verification={status:'verified',attempts:1};assert.equal(grade(value).passed,true,JSON.stringify(grade(value).failures));
    const original=structuredClone(value);
    value.envelope.body.answer=value.envelope.body.answer.replace(suffix==='grades'?'not recorded':suffix==='item-feedback'?'Explain the sampling choice.':'73.50',suffix==='grades'?'0':suffix==='item-feedback'?'Compare the two approaches.':'73.5');
    assert.equal(grade(value).passed,false,suffix);
    const changed=structuredClone(original);changed.observation.evidence.courses??=[];
    if(suffix==='grades')changed.observation.evidence.courses[0].gradeText='0';else changed.observation.evidence.report.items[0].feedbackText='INVENTED';
    assert.ok(grade(changed).failures.some(row=>row.id.startsWith('native.')));
  }
});
test('raw caller scope and zero broad/public/write proof cannot be replaced by citations or a verified label',async()=>{
  const original=await rendered(bank.find(row=>row.id.endsWith('-item-feedback')));original.envelope.body.verification={status:'verified',attempts:1};
  for(const mutate of [value=>value.observation.broadReads++,value=>value.observation.publicReads++,value=>value.observation.writes++,
    value=>{value.observation.reads[0].ownerId=dtmNativeRouteManifest.foreignOwnerId;},value=>{value.observation.reads=[];},value=>{value.observation.evidence=null;}]){
    const value=structuredClone(original);mutate(value);assert.equal(grade(value).passed,false);
  }
  const linkOnly=structuredClone(original);linkOnly.envelope.body.answer='[Source Analysis]('+bank[4].route+')';linkOnly.envelope.body.views=[];
  assert.equal(grade(linkOnly).passed,false);
});
test('the minimal-snapshot predicate refuses mixed or unrecognized clauses and stale history',()=>{
  for(const question of ['Show my Moodle grades and my courses.','Show my native DTM grade report and all my courses.',
    'Show my Moodle grade report for Study Methods, show my courses.',
    'Show my Moodle grade report for Study Methods: my courses.',
    'Show my Moodle grade report for Study Methods with my current courses.'])
    assert.equal(isNativeDtmGradeOnlyQuestion(question,'/dtm/grades'),false,question);
  for(const question of ['Show my Moodle grades and my tuition balance.','Show my Moodle grades and my health records.','Show my Moodle grades and list my unfinished assignments.',
    'Show my native DTM grade report and my saved file revisions.','Show my personal grade tracker.','Show my Moodle grades and explain my appeal status.',
    'Show my Moodle grade report for Study Methods and my tasks.','Delete my Moodle grade report.','Show my friend’s Moodle grades.'])
    assert.equal(isNativeDtmGradeOnlyQuestion(question,'/dtm/grades'),false,question);
  assert.equal(isNativeDtmGradeOnlyQuestion('What feedback?','/',[{role:'user',content:'Show my tuition balance.'}]),false);
  assert.equal(isNativeDtmGradeOnlyQuestion('What feedback?','/',[{role:'assistant',content:'Show my Moodle grades.'}]),false);
});

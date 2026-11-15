import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {buildDtmNativeRouteCases} from './dtm-native-route-cases.mjs';
import {
  buildDtmGradePreview,dtmGradePreviewCases,dtmGradePreviewDigest,gradeDtmGradePreview,unmountedDtmNativeGradeCases,
} from './dtm-grade-report-preview.mjs';

function makeFixture(){
  const runId=randomUUID();
  const owners={
    A:{id:randomUUID(),email:'grade-a@example.invalid',runMarker:runId},
    B:{id:randomUUID(),email:'grade-b@example.invalid',runMarker:runId},
  };
  return buildDtmGradePreview(runId,owners);
}

test('protected native Moodle grade manifest accounts for all fourteen original cases',()=>{
  const fixture=makeFixture(),cases=dtmGradePreviewCases(fixture);
  assert.equal(cases.length,10);
  const mounted=cases.flatMap(row=>row.nativeCase?[row.nativeCase]:[]);
  assert.equal(mounted.length,7);
  assert.deepEqual([...mounted,...unmountedDtmNativeGradeCases.map(row=>row.id)].sort(),buildDtmNativeRouteCases().map(row=>row.id).sort());
  assert.equal(new Set(cases.map(row=>row.id)).size,10);
  assert.ok(cases.every(row=>row.executionContract==='live-native'&&fixture.plans[row.fixtureKey]));
  for(const row of cases.filter(row=>row.expected.requiredLinks.some(url=>url.startsWith('/dtm/course/')))){
    const path='/dtm/course/'+fixture.plans[row.fixtureKey].courseBindings[row.role].id+'/grades';
    assert.deepEqual(row.expected.requiredSourceBindings,[{sourceId:'account:dtmGradeReport',url:path}]);
  }
});

test('native zero, native null, absent report and tracker data remain separately bound',()=>{
  const fixture=makeFixture(),cases=dtmGradePreviewCases(fixture);
  const native=fixture.plans.dtmGradeReport.expectedByOwner[fixture.owners.A.id].report;
  const absent=fixture.plans['empty:dtmGradeReport'].expectedByOwner[fixture.owners.A.id];
  const full=fixture.plans['full:dtmGradeReport'].expectedByOwner[fixture.owners.A.id].report;
  const tracker=fixture.trackers.find(row=>row.course_id===native.courseId);
  assert.equal(native.items[0].gradeText,'0');
  assert.equal(native.total,null);
  assert.equal(absent.report,null);
  assert.equal(full.items.length,20);
  assert.equal(full.total.gradeText,'73.50');
  assert.equal(tracker.label,native.items[0].label);
  assert.notEqual(tracker.score,native.items[0].gradeText);
  assert.notEqual(tracker.feedback,native.items[0].feedbackText);
  assert.ok(cases.every(row=>row.expected.forbiddenAccountMarkers.includes(tracker.feedback)
    &&row.expected.forbiddenAccountMarkers.includes(tracker.score)));
  assert.ok(cases.filter(row=>row.role==='A').every(row=>row.expected.forbiddenText.includes('FOREIGN REPORT TOTAL')));
  assert.ok(cases.find(row=>row.role==='B').expected.forbiddenText.includes('Explain the index choice'));
});

test('protected grade result checks both independent digests and retains only safe verdicts',()=>{
  const row=dtmGradePreviewCases(makeFixture()).find(caseRow=>caseRow.id.endsWith('-foreign'));
  const before={rows:dtmGradePreviewDigest({digest:'observed SQL'}),callers:dtmGradePreviewDigest({digest:'observed callers'})};
  const envelope={statusCode:200,fixtureKey:row.fixtureKey,execution:'live-native',events:[{kind:'account-access',status:'complete'}],
    body:{status:'handoff',answer:'I cannot show another student’s Moodle grades.'}};
  const verified=gradeDtmGradePreview(row,envelope,before,structuredClone(before));
  assert.equal(verified.passed,true,verified.failedFields.join(','));
  assert.equal(Object.hasOwn(verified,'body'),false);
  assert.match(verified.answerDigest,/^[a-f0-9]{64}$/u);
  const drift=gradeDtmGradePreview(row,envelope,before,{...before,callers:dtmGradePreviewDigest({digest:'changed callers'})});
  assert.deepEqual(drift.failedFields,['unchanged-paired-readback']);
  const leaked=gradeDtmGradePreview(row,{...envelope,body:{...envelope.body,internal:row.expected.forbiddenAccountMarkers[0]}},before,before);
  assert.equal(leaked.passed,false);
  assert.ok(leaked.failedFields.some(id=>id.startsWith('text.forbidden.')));
});

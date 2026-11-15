import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {buildDtmNativeRouteCases} from './dtm-native-route-cases.mjs';
import {
  buildDtmGradeOverviewPreview,buildDtmGradePreview,dtmGradeOverviewPreviewCases,dtmGradePreviewCases,dtmGradePreviewDigest,
  gradeDtmGradePreview,readDtmGradeOverviewScopes,unmountedDtmNativeGradeCases,
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

test('separate grade overview arm mounts the original four entry paths, two-item feedback and a truly empty caller',()=>{
  const {runId,owners}=makeFixture(),fixture=buildDtmGradeOverviewPreview(runId,owners);
  const originals=buildDtmNativeRouteCases(),cases=dtmGradeOverviewPreviewCases(fixture);
  assert.equal(cases.length,6);
  assert.deepEqual(cases.map(row=>row.id).sort(),unmountedDtmNativeGradeCases.map(row=>row.id).filter(id=>!id.endsWith('-failed')).sort());
  assert.deepEqual(cases.map(row=>row.role),['A','A','A','A','A','B']);
  assert.deepEqual(cases.slice(0,3).map(row=>row.route),['/dtm/dashboard','/dtm/my','/dtm/grades']);
  assert.equal(cases[3].route,'/dtm/course/'+fixture.courses[0].id+'/grades/overview');
  assert.deepEqual(fixture.overviews.A.courses.map(course=>[course.title,course.gradeText]).sort(),
    [['Field Practice','0'],['Study Methods',null],['Visual Thinking','']]);
  assert.deepEqual(fixture.overviews.B,{courses:[],limit:100,nextCursor:null});
  assert.ok(fixture.courses.every(course=>course.user_id===owners.A.id));
  assert.deepEqual(fixture.reports[0].report.items.map(item=>item.label),['Source Analysis','Reflection Memo']);
  for(const row of cases)assert.deepEqual(row.expected.facts,originals.find(item=>item.id===row.id).expected.facts);
});

test('overview readback requires all authentic caller read scopes and rejects null/blank swaps and unsafe denials',async()=>{
  const {runId,owners}=makeFixture(),fixture=buildDtmGradeOverviewPreview(runId,owners);
  const users=Object.values(owners).map((owner,index)=>({id:owner.id,token:'owned-'+index}));
  const origin='https://stdedu-abcdef123-v1-d286.vercel.app',calls=[];
  async function run(mutation){
    return readDtmGradeOverviewScopes(fixture,users,{origin,readResponse:(response,_url,max,status)=>{
      assert.ok(max<=131072);assert.equal(response.status,status);return response.json();
    },fetchImpl:async(url,options)=>{
      assert.equal(url.origin,origin);assert.equal(url.pathname,'/api/affairs-data');
      assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
      const role=options.headers.Authorization==='Bearer owned-0'?'A':'B',scope=url.searchParams.get('scope');
      calls.push([role,scope]);
      if(scope==='dtm-grade-report-overview'){
        assert.deepEqual([...url.searchParams.keys()],['scope']);
        const payload=structuredClone(fixture.overviews[role]);
        if(role==='A'&&mutation==='blank')payload.courses.find(row=>row.gradeText==='').gradeText=null;
        return Response.json(payload);
      }
      assert.deepEqual([...url.searchParams.keys()],['scope','course_id']);
      const row=fixture.reports.find(item=>item.course_id===url.searchParams.get('course_id'));
      assert.ok(row);
      if(role==='B')return Response.json({error:mutation==='denial'?'An unrelated error.':'This course is not available to your account.'},{status:403});
      return Response.json({report:{id:row.id,userId:row.user_id,courseId:row.course_id,sourceMode:row.source_mode,version:row.version,
        createdAt:row.created_at,updatedAt:row.updated_at,...row.report}});
    }});
  }
  assert.match(await run(),/^[a-f0-9]{64}$/u);
  assert.deepEqual(calls,['A','B'].flatMap(role=>[[role,'dtm-grade-report-overview'],...Array.from({length:3},()=>[role,'dtm-grade-report'])]));
  await assert.rejects(run('blank'),/exact caller overview null, blank and literal zero/u);
  await assert.rejects(run('denial'),/exact owned or crossed overview report read/u);
});

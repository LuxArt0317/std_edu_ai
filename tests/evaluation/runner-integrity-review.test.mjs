import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as runner from './run.mjs';
import {assessCoverage} from './coverage.mjs';

const revision='a'.repeat(40);
const cases=[
  {id:'fees',domain:'fees',serviceId:'39-1',route:'/school-affairs/services/39-1',routeFamily:'affairs',mode:'record',fixtureKey:'fees',capability:{level:'native',gap:false},expected:{behavior:'answer',requiredTools:['charges']}},
  {id:'dtm',domain:'dtm',route:'/dtm',routeFamily:'dtm',mode:'record',fixtureKey:'dtm',capability:{level:'native',gap:false},expected:{behavior:'answer',requiredTools:['dtm']}},
];
const inventory={services:['39-1'],tools:['charges','dtm'],routeFamilies:[{id:'affairs',routes:[cases[0].route],auth:'signed-in'},{id:'dtm',routes:['/dtm'],auth:'signed-in'}]};
const results=cases.map(row=>({caseId:row.id,fixtureKey:row.fixtureKey,passed:true,executed:true,checks:[{id:'independent-fact',passed:true}],failures:[],execution:'live-model',sourceRevision:revision}));
const browserAcceptance={status:'passed',sourceRevision:revision,routeResults:cases.map(row=>({route:row.route,status:'passed',assistantPresent:true,keyboardUsable:true,sessionVerified:true,authenticated:true}))};
const assess=extra=>assessCoverage({cases,results,inventory,sourceRevision:revision,browserAcceptance,...extra});
const healthyRun=()=>({mode:'live',results:results.map((row,index)=>({...structuredClone(row),response:{deploymentCheck:{verified:true,sourceRevision:revision,requestIndex:index+1}}})),
  cleanup:{complete:true},sourceUnchanged:true,dirty:false,deployment:{verified:true,sourceRevision:revision},
  deploymentPin:{status:'finished',failure:null,pendingRequest:null,sourceRevision:revision,manifest:{revision},identityKind:'release-manifest',deploymentId:null,issued:2,completed:2,rechecked:2,checked:8}});
const assessRun=report=>{
  assert.equal(typeof runner.assessRun,'function','Runner must expose pure final assessment so setup/integrity checks can run without Git, models or a database.');
  return runner.assessRun(report,{cases,inventory,sourceRevision:revision,browserAcceptance,requestedSuite:'full'});
};

test('optional browser acceptance input is an explicit CLI file argument',()=>{
  assert.equal(runner.options(['--mode','live','--browser-acceptance','artifacts/assistant-evaluation/browser.json']).browserAcceptance,'artifacts/assistant-evaluation/browser.json');
});

test('setup failure is unexecuted and does not count as a failed chatbot answer',()=>{
  const failed={...results[0],passed:false,executed:false,failureKind:'setup',execution:'not-run',checks:[],failures:[{id:'fixture-unsupported',detail:'No fixture mapping'}]};
  const report=assess({results:[failed,results[1]]});
  assert.equal(report.passed,false);assert.equal(report.releaseReady,false);
  assert.equal(report.behaviorPassed,true);assert.equal(report.behaviorStatus,'passed');
  assert.equal(report.totals.executed,1);assert.equal(report.totals.evaluated,1);assert.equal(report.totals.failed,0);
  assert.equal(report.totals.setupFailed,1);assert.equal(report.totals.unexecuted,1);
  assert.deepEqual(report.coverage.cases.missing,['fees']);
  assert.ok(report.failures.some(row=>row.id==='result.setupFailed'));
  assert.equal(report.byDomain.fees.executed,0);assert.equal(report.byDomain.fees.setupFailed,1);
});

test('transport failure counts a real request but does not judge an answer that never arrived',()=>{
  const failed={...results[0],passed:false,executed:true,failureKind:'infrastructure',checks:[],failures:[{id:'request-timeout',detail:'Request timed out'}]};
  const report=assess({results:[failed,results[1]]});
  assert.equal(report.releaseReady,false);assert.equal(report.behaviorPassed,true);
  assert.equal(report.totals.executed,2);assert.equal(report.totals.evaluated,1);assert.equal(report.totals.failed,0);
  assert.equal(report.totals.infrastructureFailed,1);assert.equal(report.totals.unexecuted,0);
  assert.ok(report.failures.some(row=>row.id==='result.infrastructureFailed'));
});

test('zero completed answers is not a behavioral pass or a behavioral failure',()=>{
  const blocked=results.map(row=>({...row,passed:false,executed:false,failureKind:'setup',execution:'not-run',checks:[]}));
  const report=assess({results:blocked});
  assert.equal(report.behaviorPassed,null);assert.equal(report.behaviorStatus,'not-evaluated');
  assert.equal(report.totals.evaluated,0);assert.equal(report.totals.failed,0);assert.equal(report.totals.setupFailed,2);
  assert.equal(report.releaseReady,false);assert.equal(report.passed,false);
});

test('an actually completed incorrect answer remains a behavioral failure',()=>{
  const failed={...results[0],passed:false,failureKind:'behavior',checks:[{id:'wrong-amount',passed:false}],failures:[{id:'wrong-amount',detail:'Wrong tuition'}]};
  const report=assess({results:[failed,results[1]]});
  assert.equal(report.behaviorPassed,false);assert.equal(report.behaviorStatus,'failed');
  assert.equal(report.totals.failed,1);assert.equal(report.totals.evaluated,2);assert.equal(report.totals.setupFailed,0);
  assert.ok(report.releaseBlockers.length>0,'A failed release requires visible blockers.');
});

test('a synthetic passing result cannot override explicit unexecuted setup state',()=>{
  const report=assess({results:[{...results[0],executed:false,failureKind:'setup'},results[1]]});
  assert.equal(report.releaseReady,false);assert.equal(report.totals.passed,1);assert.equal(report.coverage.services.passed,0);
  assert.equal(report.coverage.routes.passed,1);assert.equal(report.byDomain.fees.answersPassed,0);
});

test('subset success keeps the complete denominator and never becomes a full release',()=>{
  const report=assess({requestedSuite:'subset',results:[results[0]]});
  assert.equal(report.passed,true);assert.equal(report.behaviorPassed,true);assert.equal(report.releaseReady,false);
  assert.equal(report.totals.registered,2);assert.equal(report.totals.executed,1);assert.equal(report.coverage.tools.total,2);
  assert.deepEqual(report.coverage.cases.missing,['dtm']);assert.ok(report.releaseBlockers.includes('subset_only'));
});

test('separate browser proof cannot promote deterministic API results to live-model evidence',()=>{
  const report=assess({results:results.map(row=>({...row,execution:'deterministic'}))});
  assert.equal(report.browserAcceptance.passed,true);assert.equal(report.behaviorPassed,true);assert.equal(report.releaseReady,false);
  assert.ok(report.failures.some(row=>row.id==='result.notLive'));
});

test('final runner assessment preserves a healthy live run and supplied browser proof',()=>{
  const report=assessRun(healthyRun());
  assert.equal(report.releaseReady,true);assert.equal(report.browserAcceptance.passed,true);
});

for(const [name,mutate,word] of [
  ['dirty source',report=>{report.dirty=true;},'dirty'],
  ['changed source',report=>{report.sourceUnchanged=false;},'source'],
  ['failed cleanup',report=>{report.cleanup.complete=false;},'cleanup'],
  ['unverified deployment',report=>{report.deployment.verified=false;},'deployment'],
  ['different deployment revision',report=>{report.deployment.sourceRevision='b'.repeat(40);},'revision'],
]){
  test('final runner assessment explicitly reports '+name,()=>{
    const state=healthyRun();mutate(state);const report=assessRun(state);
    assert.equal(report.releaseReady,false);assert.equal(report.passed,false);
    assert.equal(report.behaviorPassed,true,'Run setup/integrity must not rewrite successfully checked answers.');
    assert.ok(report.failures.some(row=>new RegExp(word,'i').test(row.id+' '+row.detail)),JSON.stringify(report.failures));
    assert.ok(report.releaseBlockers.length>0,'Integrity failure requires a visible release blocker.');
  });
}

test('retrieval-only cases without an independent retrieval contract are unsupported, never green',()=>{
  assert.equal(typeof runner.gradeRetrievalCase,'function');
  const report=runner.gradeRetrievalCase(cases[0],[],{sourceRevision:revision,fixtureKey:'fees',elapsedMs:1});
  assert.equal(report.passed,false);assert.equal(report.executed,false);assert.equal(report.failureKind,'setup');
});

test('an empty requiredText array is not an independent retrieval assertion',()=>{
  assert.equal(typeof runner.gradeRetrievalCase,'function');
  const testCase={...cases[0],expected:{...cases[0].expected,retrieval:{sourceId:'account:charges',requiredText:[],forbiddenText:[]}}};
  const report=runner.gradeRetrievalCase(testCase,[],{sourceRevision:revision,fixtureKey:'fees',elapsedMs:1});
  assert.equal(report.passed,false);assert.equal(report.executed,false);
});

test('retrieval results carry independent checks and fail a missing declared fact',()=>{
  assert.equal(typeof runner.gradeRetrievalCase,'function');
  const testCase={...cases[0],expected:{...cases[0].expected,retrieval:{sourceId:'account:charges',requiredText:['Tuition balance 23000'],forbiddenText:['FOREIGN PRIVATE']}}};
  const metadata={sourceRevision:revision,fixtureKey:'fees',elapsedMs:1};
  const passed=runner.gradeRetrievalCase(testCase,[{id:'account:charges',text:'Tuition balance 23000'}],metadata);
  assert.equal(passed.passed,true);assert.equal(passed.execution,'deterministic');assert.ok(passed.checks.length>0);
  const missing=runner.gradeRetrievalCase(testCase,[{id:'account:charges',text:'Tuition balance 2300'}],metadata);
  assert.equal(missing.passed,false);assert.equal(missing.failureKind,'behavior');
  const leaked=runner.gradeRetrievalCase(testCase,[{id:'account:charges',text:'Tuition balance 23000 FOREIGN PRIVATE'}],metadata);
  assert.equal(leaked.passed,false);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assessCoverage,routeMatches} from './coverage.mjs';

const cases=[
  {id:'fee.read',domain:'fees',serviceId:'39-1',route:'/fees',routeFamily:'affairs',mode:'record',fixtureKey:'fees',capability:{level:'native'},expected:{behavior:'answer',requiredTools:['charges']}},
  {id:'dtm.read',domain:'dtm',route:'/dtm',routeFamily:'dtm',mode:'record',fixtureKey:'dtm',capability:{level:'native'},expected:{behavior:'answer',requiredTools:['dtm']}},
];
const inventory={services:['39-1'],tools:['charges','dtm'],routeFamilies:[{id:'affairs',routes:['/fees'],auth:'signed-in'},{id:'dtm',routes:['/dtm'],auth:'signed-in'}]};
const results=cases.map(testCase=>({caseId:testCase.id,passed:true,checks:[{id:'fact.0',passed:true}],failures:[],fixtureKey:testCase.fixtureKey,execution:'live-model',sourceRevision:'sha-a'}));
const browserAcceptance={status:'passed',sourceRevision:'sha-a',routeResults:['/fees','/dtm'].map(route=>({route,status:'passed',assistantPresent:true,keyboardUsable:true,sessionVerified:true,authenticated:true}))};
const run=extra=>assessCoverage({cases,results,inventory,sourceRevision:'sha-a',browserAcceptance,...extra});
const failure=(report,id)=>assert.ok(report.failures.some(item=>item.id===id),JSON.stringify(report));

test('complete live same-revision native bank is eligible for release',()=>{
  const report=run();assert.equal(report.passed,true);assert.equal(report.releaseReady,true);
  assert.equal(report.coverage.services.total,1);assert.equal(report.coverage.tools.passed,2);assert.equal(report.totals.unexecuted,0);
});
test('a family-level case cannot cover missing concrete routes',()=>{
  const report=run({inventory:{...inventory,routeFamilies:[inventory.routeFamilies[0],{id:'dtm',routes:['/dtm','/dtm/assignments','/dtm/course/:id']} ]}});
  failure(report,'routes.omitted');assert.equal(report.coverage.routes.total,4);
  assert.deepEqual(report.coverage.routes.missing,['/dtm/assignments','/dtm/course/:id']);
});
test('concrete course samples match one parameter segment and query view selectors',()=>{
  assert.equal(routeMatches('/dtm/course/:id','/dtm/course/course-one'),true);
  assert.equal(routeMatches('/dtm/course/:id','/dtm/course/:id'),false);
  assert.equal(routeMatches('/dtm/course/:id','/dtm/course/%3Aid'),false);
  assert.equal(routeMatches('/dtm/course/:id','/dtm/course/course-one/grades'),false);
  assert.equal(routeMatches('/dtm/course/:id/grades','/dtm/course/course-one/grades?view=other'),false);
  assert.equal(routeMatches('/school-affairs/services/12-4?course=:id','/school-affairs/services/12-4?course=abc'),true);
  assert.equal(routeMatches('/school-affairs/services/12-4?course=:id','/school-affairs/services/12-4'),false);
  assert.equal(routeMatches('/school-affairs/services/12-4?syllabus=:id','/school-affairs/services/12-4?course=abc'),false);
  assert.equal(routeMatches('/school-affairs/services/12-4?course=:id','/school-affairs/services/12-4?course=:id'),false);
  assert.equal(routeMatches('/dtm','https://evil.invalid/dtm'),false);
  assert.equal(routeMatches('/dtm','//stu.best/dtm'),false);
});
test('required concrete destinations can cover a parameterized page but do not prove browser visits',()=>{
  const changed=cases.map(testCase=>testCase.id==='dtm.read'?{...testCase,expected:{...testCase.expected,requiredLinks:['/dtm/course/course-one']}}:testCase);
  const report=run({cases:changed,inventory:{...inventory,routeFamilies:[inventory.routeFamilies[0],{id:'dtm',routes:['/dtm','/dtm/course/:id']}]}});
  assert.equal(report.passed,true);assert.equal(report.coverage.routes.registered,3);assert.equal(report.releaseReady,false);
  assert.ok(report.browserAcceptance.missing.includes('/dtm/course/:id'));
});
test('semantic success without browser evidence is not release readiness',()=>{
  const report=run({browserAcceptance:undefined});assert.equal(report.passed,true);assert.equal(report.behaviorPassed,true);assert.equal(report.releaseReady,false);
  assert.ok(report.browserAcceptance.failures.some(row=>row.id==='browser.missing'));
  assert.ok(report.releaseBlockers.includes('browser_acceptance_missing_or_failed'));
});
test('browser proof requires each route, matching revision and actual authenticated chatbot observations',()=>{
  const stale=run({browserAcceptance:{...browserAcceptance,sourceRevision:'old'}});assert.equal(stale.releaseReady,false);
  assert.ok(stale.browserAcceptance.failures.some(row=>row.id==='browser.revisionMismatch'));
  const incomplete=run({browserAcceptance:{...browserAcceptance,routeResults:[{...browserAcceptance.routeResults[0],assistantPresent:false},browserAcceptance.routeResults[1]]}});
  assert.equal(incomplete.releaseReady,false);assert.ok(incomplete.browserAcceptance.incomplete.includes('/fees'));
  const anonymous=run({browserAcceptance:{...browserAcceptance,routeResults:[{...browserAcceptance.routeResults[0],authenticated:false},browserAcceptance.routeResults[1]]}});
  assert.equal(anonymous.releaseReady,false);
  const subset=run({browserAcceptance:{...browserAcceptance,routeResults:browserAcceptance.routeResults.slice(0,1)}});
  assert.equal(subset.releaseReady,false);assert.deepEqual(subset.browserAcceptance.missing,['/dtm']);
});
test('unknown or duplicate browser results cannot silently overwrite a failure',()=>{
  const duplicate=run({browserAcceptance:{...browserAcceptance,routeResults:[{...browserAcceptance.routeResults[0],status:'failed'},...browserAcceptance.routeResults]}});
  assert.equal(duplicate.releaseReady,false);assert.ok(duplicate.browserAcceptance.failures.some(row=>row.id==='browser.duplicateRoute'));
  const unknown=run({browserAcceptance:{...browserAcceptance,routeResults:[...browserAcceptance.routeResults,{...browserAcceptance.routeResults[0],route:'/unknown'}]}});
  assert.equal(unknown.releaseReady,false);assert.ok(unknown.browserAcceptance.failures.some(row=>row.id==='browser.unknownRoute'));
});
test('route inventory cannot erase browser requirements',()=>{
  const report=run({inventory:{...inventory,routeFamilies:[{...inventory.routeFamilies[0],browserChecks:[]},inventory.routeFamilies[1]]}});
  failure(report,'routes.browserContractInvalid');
});
test('new catalog service or new tool fails the inventory gate',()=>{
  const report=run({inventory:{...inventory,services:['39-1','99-1'],tools:['charges','dtm','newTool']}});
  assert.equal(report.passed,false);failure(report,'coverage.omitted');assert.deepEqual(report.coverage.services.missing,['99-1']);
});
test('full cannot pass a selected subset or zero executions',()=>{
  failure(run({results:results.slice(0,1)}),'cases.unexecuted');
  failure(run({results:[]}),'results.empty');
});
test('explicit subset reports its omissions and is never release ready',()=>{
  const report=run({requestedSuite:'subset',results:results.slice(0,1)});
  assert.equal(report.passed,true);assert.equal(report.releaseReady,false);assert.deepEqual(report.coverage.cases.missing,['dtm.read']);
});
test('unknown results and repeated execution cannot silently overwrite the first failure',()=>{
  failure(run({results:[...results,{...results[0],caseId:'unknown'}]}),'result.unknown');
  const report=run({results:[{...results[0],passed:false},...results]});
  failure(report,'result.failed');failure(report,'result.duplicate');assert.equal(report.totals.failed,1);
});
test('duplicate case and inventory identifiers are invalid',()=>{
  failure(run({cases:[...cases,cases[0]]}),'case.duplicate');
  failure(run({inventory:{...inventory,tools:['charges','charges','dtm']}}),'inventory.invalid');
});
test('deterministic or recorded proof cannot become live release evidence',()=>{
  const deterministic=results.map(result=>({...result,execution:'deterministic'}));
  failure(run({results:deterministic}),'result.notLive');
  const fast=run({results:deterministic,requireLive:false});assert.equal(fast.passed,true);assert.equal(fast.releaseReady,false);
});
test('different revision and fixture results fail',()=>{
  failure(run({results:results.map(result=>({...result,sourceRevision:'old'}))}),'result.revisionMismatch');
  failure(run({results:[{...results[0],fixtureKey:'other'},results[1]]}),'result.fixtureMismatch');
});
test('missing source revision never meets release evidence requirements',()=>{
  const report=run({sourceRevision:undefined});assert.equal(report.releaseReady,false);
});
test('self-reported pass without independent checks fails',()=>{
  failure(run({results:results.map(result=>({...result,checks:[]}))}),'result.ungraded');
  failure(run({results:results.map(result=>({...result,checks:[{id:'fact',passed:false}]}))}),'result.ungraded');
});
test('all correct generic-tracker answers still report the product capability gap',()=>{
  const report=run({cases:[{...cases[0],capability:{level:'generic-tracker',limitation:'No real fee workflow.'}},cases[1]]});
  assert.equal(report.behaviorPassed,true);assert.equal(report.passed,true);assert.equal(report.capabilityComplete,false);assert.equal(report.releaseReady,false);
  assert.equal(report.capabilityGaps[0].serviceId,'39-1');
});
test('an explicitly supported privacy or empty-record guard is not a product gap',()=>{
  const report=run({cases:[{...cases[0],capability:{level:'native',gap:false,limitation:'An empty record is an expected supported outcome.'}},cases[1]]});
  assert.equal(report.capabilityComplete,true);assert.equal(report.releaseReady,true);
});
test('required per-service case modes cannot be omitted',()=>{
  failure(run({inventory:{...inventory,services:[{id:'39-1',requiredModes:['navigation','record']}]}}),'coverage.modeOmitted');
});
test('route aliases can map to authoritative route families',()=>{
  const noFamily=cases.map(({routeFamily:_routeFamily,...testCase})=>testCase);
  const report=run({cases:noFamily,inventory:{...inventory,routeFamilies:[{id:'affairs',routes:['/fees']},{id:'dtm',routes:['/dtm']}]}});
  assert.equal(report.passed,true,JSON.stringify(report));
});
test('missing authoritative inventories and claimed unknown tools fail',()=>{
  failure(run({inventory:{services:['39-1']}}),'inventory.missing');
  failure(run({cases:[{...cases[0],coveredTools:['made-up']},cases[1]]}),'coverage.unknown');
});
test('limitation and answer-required counts remain separate',()=>{
  const report=run({cases:[{...cases[0],expected:{...cases[0].expected,behavior:'unavailable'}},cases[1]]});
  assert.equal(report.byDomain.fees.answerRequired,0);assert.equal(report.byDomain.fees.limitations,1);
  assert.equal(report.byDomain.dtm.answerRequired,1);assert.equal(report.byDomain.dtm.answersPassed,1);
});

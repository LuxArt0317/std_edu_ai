import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {teachingFeedbackRunnerCases,teachingFeedbackCaseAdmission,assertTeachingFeedbackCaseReady,gradeEvaluationCase,teachingFeedbackSetupSummary} from './teaching-feedback-runner.mjs';
import {buildTeachingFeedbackNativeCases,teachingFeedbackNativeFixtureForCase} from './teaching-feedback-native-cases.mjs';
import {main,evaluationSuite,assessRun} from './run.mjs';
import {gradeCase} from './grading.mjs';
import {prepare} from './live-fixtures.mjs';

const cases=teachingFeedbackRunnerCases(),revision='a'.repeat(40),clone=structuredClone;
const identity={sourceRevision:revision,workingTreeHash:'b'.repeat(64),dirty:false};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const inventory={hash:'c'.repeat(64),services:[{id:'7-5'},{id:'7-6'}],tools:['charges','teachingFeedback'],publicPages:[],
  routeFamilies:[{id:'teaching',routes:['/school-affairs/services/7-5','/school-affairs/services/7-6'],auth:'signed-in'}]};
const ordinary=id=>({id,domain:'fees',route:'/school-affairs/services/39-1',mode:'record',fixtureKey:'fees',capability:{level:'native',gap:false},
  expected:{behavior:'answer',facts:[{label:'Tuition balance',kind:'number',values:[23000]}],requiredTools:[]}});
const answer={status:'answered',answer:'Tuition balance: 23000.',verification:{status:'verified',attempts:1}};
const find=suffix=>cases.find(row=>row.id==='account:teaching-native-'+suffix);
function teacherResponse(row,text='These are saved local stu.best records.\n\n- DB701\n  Status: submitted\n- WS702\n  Status: reviewed'){
  return {statusCode:200,execution:'recorded',sourceRevision:revision,fixtureKey:row.fixtureKey,
    events:[{kind:'account-read:teachingFeedback:1',status:'complete'}],body:{status:'answered',answer:text,
      citations:[{chunkId:'account:teachingFeedback',url:'/school-affairs/services/7-6',title:'Saved local feedback'}],views:[],verification:{status:'verified',attempts:1}}};
}
function rig(selected){
  const calls=[],saved=[],suite={cases:clone(selected),inventory:clone(inventory),suiteHash:digest(selected)};
  const adapter={
    prepare:async context=>calls.push(['prepare',context.cases.map(row=>row.id)]),
    forCase:async row=>{calls.push(['forCase',row.id]);return {token:'OFFLINE_SYNTHETIC_TOKEN'};},
    afterCase:async row=>calls.push(['afterCase',row.id]),cleanup:async()=>{calls.push(['cleanup']);return {verified:true};},
  };
  const dependencies={sourceIdentity:async()=>identity,evaluationSuite:async()=>clone(suite),log:()=>{},
    saveReport:async(_path,report)=>saved.push(clone(report)),loadFixtureAdapter:async()=>{calls.push(['import']);return adapter;},
    pace:async(start,signal,before)=>{signal.throwIfAborted();await before();return start(0);},
    fetchImpl:async(input,init)=>{
      const url=new URL(input);assert.equal(url.origin,'https://stu.best');assert.equal(init.redirect,'error');
      if(url.pathname==='/release.json'){calls.push(['pin']);return Response.json({version:1,revision,source:'vercel-git',environment:'production',builtAt:'2026-11-14T12:00:00.000Z'});}
      calls.push(['post',JSON.parse(init.body).question]);assert.equal(init.method,'POST');assert.equal(init.headers.Authorization,'Bearer OFFLINE_SYNTHETIC_TOKEN');
      return Response.json(answer);
    },
  };
  async function run(mode='live',extra=[]){
    const previous=process.exitCode;
    try{return await main(['--mode',mode,'--fixture-module','tests/evaluation/live-fixtures.mjs',...extra],dependencies);}
    finally{process.exitCode=previous;}
  }
  return {calls,saved,suite,run};
}

test('all forty unchanged independent cases enter the main denominator, not execution coverage',async()=>{
  const originals=buildTeachingFeedbackNativeCases();assert.equal(cases.length,40);
  cases.forEach((row,index)=>{const {coveredTools,coveragePurpose,...original}=row;assert.deepEqual(original,originals[index]);assert.deepEqual(coveredTools,row.toolPolicy.required);assert.match(coveragePurpose,/not proof/u);});
  const suite=await evaluationSuite('2026-11-15T02:00:00Z');
  assert.deepEqual(suite.cases.filter(row=>row.id.startsWith('account:teaching-native-')),cases);
  assert.equal(new Set(suite.cases.map(row=>row.id)).size,suite.cases.length);
  const assessment=assessRun({results:[],cleanup:{complete:true},sourceUnchanged:true,dirty:false},{...suite,requestedSuite:'full',sourceRevision:revision});
  assert.ok(!assessment.coverage.tools.missing.includes('teachingFeedback'));
  assert.equal(assessment.byDomain.teachingFeedback.executed,0);assert.equal(assessment.teachingFeedbackSetup.registered,40);
  assert.equal(assessment.teachingFeedbackSetup.liveEligible,0);assert.equal(assessment.releaseReady,false);
  assert.ok(assessment.integrity.failures.some(row=>row.id==='run.teachingFixtureUnbound'));
});

test('case admission detects weakened question, oracle, scope, fixture and unknown identities',()=>{
  for(const row of cases){assert.equal(teachingFeedbackCaseAdmission(row).eligible,false);assert.throws(()=>assertTeachingFeedbackCaseReady(row),/trusted request-bound/u);}
  for(const change of [{question:'different'},{expected:{}},{readExpectation:{views:[]}},{fixtureKey:'fees'},{id:'account:teaching-native-unknown'}]){
    const changed={...clone(find('immediate-status')),...change};assert.equal(teachingFeedbackCaseAdmission(changed).reason,'teaching_case_definition_changed');
  }
  assert.equal(teachingFeedbackCaseAdmission(ordinary('other')),null);
  assert.deepEqual(teachingFeedbackSetupSummary([]),{registered:0,liveEligible:0,observationsMounted:false,admissions:[]});
});

test('returned nested facts cannot mutate the canonical oracle or a later suite',()=>{
  const original=clone(find('immediate-status')),returned=teachingFeedbackRunnerCases().find(row=>row.id===original.id);
  returned.expected.facts[0].fields[0].values[0]='FORGED';
  assert.equal(teachingFeedbackCaseAdmission(returned).reason,'teaching_case_definition_changed');
  assert.deepEqual(teachingFeedbackRunnerCases().find(row=>row.id===original.id),original);
  assert.equal(teachingFeedbackCaseAdmission(original).reason,'teaching_fixture_and_request_observation_unmounted');
  assert.equal(buildTeachingFeedbackNativeCases().find(row=>row.id===original.id).expected.facts[0].fields[0].values[0],'submitted');
});

test('main grading invokes the native independent oracle; model or body observations cannot replace it',()=>{
  const row=find('immediate-status'),response=teacherResponse(row),fixture=teachingFeedbackNativeFixtureForCase(row);
  const invented={callerId:fixture.owner,reads:fixture.reads,evidence:fixture.evidence,companions:fixture.companions,writeRequests:[],storageRequests:[],publicRequests:[]};
  response.observation=invented;response.body.observation=invented;
  const result=gradeEvaluationCase(row,response,{teachingObservation:invented});
  assert.ok(result.failures.some(check=>check.id==='teaching.nativeReads'));assert.ok(result.failures.some(check=>check.id==='teaching.selectedEvidence'));
  assert.ok(result.failures.some(check=>check.id==='teaching.setupUnavailable'));assert.equal(result.passed,false);
  const swapped=gradeEvaluationCase(row,teacherResponse(row,'Saved local records.\n- DB701\n  Status: reviewed\n- WS702\n  Status: submitted'));
  assert.ok(swapped.failures.some(check=>check.id.startsWith('fact.')));
  const leaked=teacherResponse(row);leaked.body.views=[{columns:['Course','Comment'],rows:[['DB701','Invented saved comment']]}];
  assert.ok(gradeEvaluationCase(row,leaked).failures.some(check=>check.id==='teaching.cardCommentPair'));
});

test('non-teaching grading is byte-equivalent to the existing generic grader',()=>{
  const row=ordinary('ordinary'),response={statusCode:200,body:answer,events:[],execution:'recorded',fixtureKey:row.fixtureKey,sourceRevision:revision};
  assert.deepEqual(gradeEvaluationCase(row,response),gradeCase(row,response));
});

test('a selected teaching-only live packet records forty setup failures without importing or mutating fixtures or posting',async()=>{
  const env=rig(cases),report=await env.run();
  assert.deepEqual(env.calls,[['pin'],['pin']]);assert.equal(report.results.length,40);
  assert.ok(report.results.every(row=>row.executed===false&&row.passed===false&&row.failureKind==='setup'&&row.response.statusCode===0));
  assert.equal(report.assessment.totals.setupFailed,40);assert.equal(report.assessment.totals.evaluated,0);assert.equal(report.assessment.totals.executed,0);
  assert.equal(report.cleanup.complete,true);assert.equal(report.deploymentPin.issued,0);assert.equal(report.deploymentPin.status,'finished');
  assert.equal(report.assessment.releaseReady,false);assert.equal(report.teachingFeedbackSetup.liveEligible,0);
  assert.doesNotMatch(JSON.stringify(env.saved),/OFFLINE_SYNTHETIC_TOKEN|Bearer/u);
});

test('unmounted cases do not prevent existing eligible fixtures and HTTP cases before and after them',async()=>{
  const first=ordinary('ordinary:before'),last=ordinary('ordinary:after'),env=rig([first,find('survey-status'),find('immediate-comment'),last]),report=await env.run();
  assert.deepEqual(env.calls.find(row=>row[0]==='prepare'),['prepare',[first.id,last.id]]);
  assert.deepEqual(env.calls.filter(row=>row[0]==='forCase'),[['forCase',first.id],['forCase',last.id]]);
  assert.equal(env.calls.filter(row=>row[0]==='post').length,2);assert.equal(env.calls.filter(row=>row[0]==='afterCase').length,2);
  assert.deepEqual(report.results.map(row=>[row.caseId,row.executed,row.failureKind]),[[first.id,true,null],[find('survey-status').id,false,'setup'],[find('immediate-comment').id,false,'setup'],[last.id,true,null]]);
  assert.equal(report.results[0].passed,true);assert.equal(report.results[3].passed,true);assert.equal(report.cleanup.complete,true);
  assert.equal(report.totalCases,4);assert.equal(report.results.length,4);assert.equal(report.assessment.releaseReady,false);
});

test('draft and retrieval modes cannot manufacture snapshot evidence or credit from the offline teaching fixture',async()=>{
  for(const mode of ['draft','retrieval']){
    const env=rig([find('immediate-status')]),report=await env.run(mode);
    assert.deepEqual(env.calls,[]);assert.equal(report.results.length,1);assert.equal(report.results[0].executed,false);
    assert.equal(report.results[0].failureKind,'setup');assert.equal(report.assessment.totals.evaluated,0);
  }
});

test('direct legacy-adapter entry rejects teaching cases before credentials, project reads or network',async()=>{
  const fetch=globalThis.fetch;let requests=0;globalThis.fetch=()=>{requests++;throw Error('Offline test forbids network');};
  try{
    for(const row of [find('immediate-status'),{id:find('immediate-status').id},...cases.filter(row=>row.auth==='anonymous')])
      await assert.rejects(prepare({runId:'75000000-0000-4000-8000-000000000099',cases:[row],now:'2026-11-15T02:00:00Z',origin:'https://stu.best'}),error=>error.code==='fixture-unsupported');
    assert.equal(requests,0);
  }finally{globalThis.fetch=fetch;}
});

test('a fabricated all-passed result cannot remove the explicit unmounted teaching release blocker',()=>{
  const row=find('immediate-status'),response=teacherResponse(row),result={...gradeCase(row,response),passed:true,executed:true,execution:'live-model',caseId:row.id,sourceRevision:revision,fixtureKey:row.fixtureKey};
  const assessed=assessRun({results:[result],cleanup:{complete:true},sourceUnchanged:true,dirty:false},{cases:[row],inventory,requestedSuite:'full',sourceRevision:revision});
  assert.equal(assessed.releaseReady,false);assert.ok(assessed.integrity.failures.some(check=>check.id==='run.teachingFixtureUnbound'));
});

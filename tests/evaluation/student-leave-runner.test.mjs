import {catalogDetailIntent} from '../../server/catalogDetailIntent.js';
import * as actions from '../../server/accountActionIntent.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {dtmAssignmentListSelection} from '../../server/dtmAssignmentListIntent.js';
import * as materialIntent from '../../server/dtmMaterialIntent.js';
import * as catalogIntent from '../../server/elearningCatalogPageIntent.js';
import * as internshipIntent from '../../server/internshipEvidenceIntent.js';
import * as leaveIntent from '../../server/studentLeaveEvidenceIntent.js';
import {boundedAssistantText} from '../../src/services/assistantActivityBudget.js';
import {readAssistantReply} from '../../src/services/assistantStreamReader.js';
import {gradeCase} from './grading.mjs';
import {forCase,prepare} from './live-fixtures.mjs';
import {assessRun,main} from './run.mjs';
import {leaveFixtureOwner,leaveFixtureForeign,leaveFixtureRow} from './student-leave-native-cases.mjs';
import {
  assertNativeStudentLeaveCaseReady,markLegacyStudentLeaveFixture,nativeStudentLeaveSetupRequired,studentLeaveRunnerCases,studentLeaveSetupSummary,
} from './student-leave-runner.mjs';

const base='/school-affairs/services/leave';
const origin='https://stu.best';
const revision='a'.repeat(40);
const runId='11900000-0000-4000-8000-000000009001';
const sourceIdentity={sourceRevision:revision,workingTreeHash:'b'.repeat(64),dirty:false};
const lookup=id=>studentLeaveRunnerCases().find(row=>row.id==='account:student-leave-native-'+id);
const inventory={
  hash:'c'.repeat(64),services:[],tools:[{id:'leaveRecords'},{id:'charges'},{id:'courses'}],
  publicPages:[],routeFamilies:[{id:'student-leave',auth:'signed-in',
    routes:[base,base+'/index',base+'/history',base+'/archive',base+'/periods',base+'/edit/:id']}],
};

test('Student Leave resolves four previously omitted paths with actual question routes',()=>{
  const cases=studentLeaveRunnerCases(),withRoute=(route,id)=>cases.some(row=>row.route===route&&row.id.endsWith('-'+id));
  assert.equal(cases.length,42);
  assert.equal(new Set(cases.map(row=>row.id)).size,42);
  assert.ok(withRoute(base+'/index','index-navigation'));
  assert.ok(withRoute(base+'/archive','archive-route'));
  assert.ok(withRoute(base+'/periods','periods'));
  assert.ok(withRoute(base+'/edit/'+leaveFixtureRow,'exact-edit'));
  assert.ok(cases.every(row=>row.nativeLeaveContract.fixtureMounted===false&&row.nativeLeaveContract.requiresRequestObservations));
  assert.ok(cases.every(nativeStudentLeaveSetupRequired));
  assert.deepEqual(lookup('companion').expected.requiredTools,['leaveRecords','charges']);
  assert.deepEqual(lookup('companion-reverse').expected.requiredTools,['leaveRecords','courses']);
  assert.deepEqual(lookup('leave-and-moodle-grades').expected.requiredTools,['leaveRecords','dtmGradeReport']);
  assert.deepEqual(lookup('moodle-grades-and-leave').expected.requiredSourceBindings,[
    {sourceId:'account:leaveRecords',url:base+'/history'},{sourceId:'account:dtmGradeReport',url:'/dtm/grades'},
  ]);
  assert.deepEqual(lookup('foreign-record-no-expansion').expected.allowedTools,[]);
  assert.deepEqual(lookup('review-unavailable').nativeLeaveContract.selectedFields,['dates','reviewStatus']);
  assert.ok(cases.filter(row=>row.mode==='record'&&row.expected.behavior==='answer').every(row=>row.expected.facts.length));
  assert.equal(studentLeaveSetupSummary(cases).liveEligible,0);
});

test('compiled client selects account verification before older direct readers and preserves exact leave routes',async()=>{
  const source=await readFile(new URL('../../src/services/schoolAffairsAssistant.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let caller=leaveFixtureOwner;
  const exports={},requests=[];
  runInNewContext(code,{exports,require:specifier=>{
    if(specifier.endsWith('catalogDetailIntent.js'))return {catalogDetailIntent};
    if(specifier.endsWith('elearningCatalogPageIntent.js'))return catalogIntent;
    if(specifier.endsWith('accountActionIntent.js'))return actions;
    if(specifier.endsWith('dtmAssignmentListIntent.js'))return {dtmAssignmentListSelection};
    if(specifier.endsWith('dtmMaterialIntent.js'))return materialIntent;
    if(specifier.endsWith('internshipEvidenceIntent.js'))return internshipIntent;
    if(specifier.endsWith('studentLeaveEvidenceIntent.js'))return leaveIntent;
    if(specifier.endsWith('assistantActivityBudget.js'))return {boundedAssistantText};
    if(specifier.endsWith('assistantStreamReader.js'))return {readAssistantReply};
    if(specifier.endsWith('/authClient'))return {affairsClient:{auth:{getSession:async()=>({data:{session:{user:{id:caller},access_token:'OFFLINE_LEAVE_BROWSER'}},error:null})}}};
    return new Proxy({},{get:()=>()=>assert.fail('An unrelated fallback was evaluated before the leave graph.')});
  },fetch:async(url,init)=>{
    assert.equal(url,'/api/affairs-assistant');
    assert.equal(init.headers.Authorization,'Bearer OFFLINE_LEAVE_BROWSER');
    requests.push(JSON.parse(init.body));
    return Response.json({status:'answered',answer:'Intercepted verified endpoint.',citations:[]});
  }});
  for(const id of ['exact-edit','archive-route','date-from-history','companion','moodle-grades-and-leave','explicit-foreign','excluded']){
    const item=lookup(id);
    const response=await exports.askSchoolAffairsAssistant(leaveFixtureOwner,item.question,item.history,undefined,[],item.route);
    assert.equal(response.answer,'Intercepted verified endpoint.');
    assert.deepEqual(requests.at(-1),{question:item.question,history:item.history,images:[],route:item.route,stream:false});
  }
  caller=leaveFixtureForeign;
  await assert.rejects(()=>exports.askSchoolAffairsAssistant(leaveFixtureOwner,'Show my leave dates',[],undefined,[],base+'/history'),/account changed/u);
  assert.equal(requests.length,7);
});

test('the legacy fixture adapter rejects from prepare and forCase before provider access',async()=>{
  const source=lookup('history');
  const isolated=[
    source,
    {...source,fixtureRequirement:undefined,fixtureKey:'baseline'},
    {...source,id:'unrelated-case',fixtureKey:'baseline'},
    {...source,id:'unrelated-case',fixtureRequirement:undefined},
  ];
  for(const row of isolated){
    assert.throws(()=>assertNativeStudentLeaveCaseReady(row),{code:'student_leave_fixture_and_observation_unmounted'});
    await assert.rejects(prepare({runId,cases:[row],now:'2026-11-15T04:00:00Z',origin}),{code:'fixture-unsupported'});
    await assert.rejects(forCase(row),{code:'fixture-unsupported'});
  }
  const prior={id:'account:leave-history',fixtureKey:'leave',question:'A prior named leave question',expected:{requiredTools:['serviceRecords']}};
  const marked=markLegacyStudentLeaveFixture(prior);
  assert.equal(marked.question,prior.question);
  assert.deepEqual(marked.expected,prior.expected);
  assert.equal(marked.fixtureRequirement,'legacy_student_leave_rebind');
  assert.throws(()=>assertNativeStudentLeaveCaseReady(prior),{code:'student_leave_fixture_and_observation_unmounted'});
  assert.equal(nativeStudentLeaveSetupRequired({id:'account:internship-period',fixtureKey:'internship'}),false);
});

test('the real live, retrieval and draft runners retain unmounted leave cases as unexecuted',async()=>{
  const previous=process.exitCode;
  const selected=[lookup('history'),lookup('review-unavailable'),lookup('confirmed-empty'),lookup('explicit-foreign')];
  try{
    for(const mode of ['live','retrieval','draft']){
      const fetches=[],unexpected=[];
      const report=await main(['--mode',mode,'--origin',origin,'--fixture-module','tests/evaluation/live-fixtures.mjs'],{
        sourceIdentity:async()=>structuredClone(sourceIdentity),
        evaluationSuite:async()=>({cases:structuredClone(selected),inventory:structuredClone(inventory),suiteHash:'d'.repeat(64)}),
        loadFixtureAdapter:async()=>{unexpected.push('fixture');throw new Error('Unexpected fixture import.');},
        saveReport:async()=>{},log:()=>{},
        fetchImpl:async(input,init)=>{
          const url=new URL(input);
          fetches.push([url.origin,url.pathname,init.method]);
          assert.equal(url.origin,origin);
          assert.equal(url.pathname,'/release.json');
          assert.equal(init.method,'GET');
          return Response.json({version:1,revision,source:'vercel-git',environment:'production',builtAt:'2026-11-15T00:00:00.000Z'});
        },
      });
      assert.deepEqual(unexpected,[]);
      assert.deepEqual(fetches,mode==='live'?[[origin,'/release.json','GET'],[origin,'/release.json','GET']]:[]);
      assert.deepEqual(report.results.map(row=>row.caseId),selected.map(row=>row.id));
      for(const row of report.results){
        assert.equal(row.executed,false);
        assert.equal(row.passed,false);
        assert.equal(row.failureKind,'setup');
        assert.equal(row.response.execution,'not-run');
        assert.match(row.response.body.error,/fixtures and independent request observations/u);
      }
      assert.equal(report.assessment.releaseReady,false);
      assert.equal(report.assessment.totals.executed,0);
      assert.deepEqual(report.studentLeaveSetup.caseIds,selected.map(row=>row.id));
      assert.deepEqual(report.assessment.studentLeaveSetup.caseIds,selected.map(row=>row.id));
      assert.ok(report.assessment.releaseBlockers.includes('run.studentLeaveFixtureUnbound'));
    }
  }finally{process.exitCode=previous;}
});

test('a saved or forged successful result cannot remove the automatic fixture release blocker',()=>{
  const original=lookup('index-navigation'),cases=[original];
  const stamped={caseId:original.id,passed:true,execution:'live-model',executed:true,checks:[{id:'forged',passed:true}],sourceRevision:revision,fixtureKey:original.fixtureKey};
  const report=assessRun({results:[stamped],sourceUnchanged:true,dirty:false,cleanup:{complete:true}},
    {cases,inventory,sourceRevision:revision,requestedSuite:'full'});
  assert.equal(report.releaseReady,false);
  assert.ok(report.releaseBlockers.includes('run.studentLeaveFixtureUnbound'));
});

const successfulReview=()=>({
  statusCode:200,execution:'recorded',fixtureKey:lookup('exact-edit').fixtureKey,
  body:{status:'answered',answer:'This is your stu.best record. Saved local review status: resolved. I cannot verify whether your leave was approved.',
    verification:{status:'verified',attempts:1},
    citations:[{chunkId:'account:leaveRecords',url:base+'/edit/'+leaveFixtureRow}],
    activity:[{kind:'account-read:leaveRecords:1',status:'complete'}]},
});
test('independent grade accepts a saved local status and rejects status cosplay, phone disclosure and official claims',()=>{
  const sample=lookup('exact-edit');
  const good=gradeCase(sample,successfulReview());
  assert.equal(good.passed,true,JSON.stringify(good.failures));
  for(const claim of [
    ' Your leave was approved.',
    ' Your absence was marked excused.',
    ' 校方已核准假單。',
    ' STUDENT_PRIVATE_PHONE.',
  ]){
    const attempt=successfulReview();attempt.body.answer+=claim;
    assert.equal(gradeCase(sample,attempt).passed,false);
  }
  const view=successfulReview();view.body.views=[{columns:['Decision'],rows:[['Your leave was approved.']]}];
  assert.ok(gradeCase(sample,view).failures.some(row=>row.id.startsWith('evidence.boundary.')));
  const wrong=successfulReview();wrong.body.answer='Your stu.best record. Saved local review status: in review.';
  assert.ok(gradeCase(sample,wrong).failures.some(row=>row.id==='fact.0'));
  const unattempted=successfulReview();unattempted.body.activity=[];
  assert.ok(gradeCase(sample,unattempted).failures.some(row=>row.id==='tool.attempted.leaveRecords'));
});

test('independent grade distinguishes a failed exact read from absence and a confirmed empty result',()=>{
  const failed=lookup('read-unavailable'),absent=lookup('confirmed-empty');
  const runtime=(sample,answer,terminal)=>({statusCode:200,execution:'recorded',fixtureKey:sample.fixtureKey,
    body:{status:'answered',answer,citations:[],activity:[{kind:'account-read:leaveRecords:1',status:terminal}],
      views:[{url:sample.expected.requiredLinks[0]}]}});
  const couldNot='I could not read the selected leave record.';
  const good=gradeCase(failed,runtime(failed,couldNot,'unavailable'));
  assert.equal(good.passed,true,JSON.stringify(good.failures));
  const bad=gradeCase(failed,runtime(failed,couldNot+' You have no saved leave records.','unavailable'));
  assert.ok(bad.failures.some(item=>item.id.startsWith('evidence.boundary.')));
  const empty=gradeCase(absent,runtime(absent,'There are no matching saved leave records.','complete'));
  assert.equal(empty.passed,true,JSON.stringify(empty.failures));
  assert.equal(gradeCase(absent,runtime(absent,couldNot,'unavailable')).passed,false);
});

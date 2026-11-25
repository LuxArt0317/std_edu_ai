import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {clubEquipmentPlan} from '../../server/clubEquipmentIntent.js';
import {routeMatches} from './coverage.mjs';
import {clubEquipmentHostedCases,clubEquipmentHostedRouteCases} from './club-equipment-hosted.mjs';
import {assertClubEquipmentCaseReady,clubEquipmentRunnerCases,clubEquipmentSetupRequired,clubEquipmentSetupSummary} from './club-equipment-runner.mjs';
import {forCase,prepare} from './live-fixtures.mjs';
import {assessRun,evaluationSuite,main} from './run.mjs';

const revision='b'.repeat(40),now='2026-11-15T11:00:00.000Z';
const path='/school-affairs/services/40-1/equipment';
const release={version:1,revision,source:'vercel-git',environment:'production',builtAt:now};
const identity={sourceRevision:revision,workingTreeHash:'c'.repeat(64),dirty:false};
function checkReportInputs(suite){
  return assessRun({results:[],mode:'inventory',dirty:false,sourceUnchanged:true,cleanup:{complete:true}},
    {...suite,requestedSuite:'full',sourceRevision:revision});
}

test('the full suite admits the unchanged hosted oracle IDs and concrete new/edit route contexts without awarding execution',async()=>{
  const suite=await evaluationSuite(now),cases=clubEquipmentRunnerCases();
  assert.deepEqual(cases.map(row=>row.id),[...clubEquipmentHostedCases(),...clubEquipmentHostedRouteCases()].map(row=>row.id));
  assert.equal(cases.length,12);
  assert.deepEqual(suite.cases.filter(clubEquipmentSetupRequired),cases);
  assert.deepEqual(clubEquipmentSetupSummary(cases),{registered:12,liveEligible:0,caseIds:cases.map(row=>row.id)});
  const inventory=checkReportInputs(suite);
  assert.equal(inventory.byDomain.clubEquipment.executed,0);
  assert.ok(inventory.releaseBlockers.includes('run.clubEquipmentFixtureUnbound'));
  assert.ok(!inventory.coverage.tools.missing.includes('clubEquipment'));
  assert.ok(!inventory.coverage.routeFamilies.missing.includes('student-club-equipment'));
  for(const route of [path,path+'/new',path+'/new?edit=%3Aid'])
    assert.ok(!inventory.coverage.routes.missing.includes(route));
  const [owned,crossed]=cases.slice(-2);
  const routeId=new URL(owned.route,'https://stu.best').searchParams.get('edit');
  assert.match(routeId,/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u);
  assert.equal(crossed.route,owned.route);
  assert.equal(routeMatches(path+'/new?edit=%3Aid',owned.route),true);
  assert.equal(clubEquipmentPlan(owned.question,owned.route).selection.id,routeId);
  assert.deepEqual(clubEquipmentPlan(owned.question,owned.route).selection.fields,['status','pickup','return','items']);
  assert.equal(clubEquipmentPlan('Return the equipment on this request.',owned.route).selection.reason,'action');
  const liveOnly={...owned,fixtureRequirement:undefined};
  assert.throws(()=>assertClubEquipmentCaseReady(liveOnly),/isolated two-owner/u);
  await assert.rejects(forCase(liveOnly),/isolated paired-owner/u);
  await assert.rejects(prepare({runId:'45040000-0000-4000-8000-000000000001',cases:[owned],now}),
    /isolated evaluator/u);
});

test('default draft, retrieval and live modes leave every equipment case unexecuted and skip fixture admission',async()=>{
  const cases=clubEquipmentRunnerCases();
  const suite={cases,inventory:{hash:'d'.repeat(64),services:[{id:'40-1'}],tools:['clubEquipment'],publicPages:[],
    routeFamilies:[{id:'equipment',routes:[path,path+'/new',path+'/new?edit=:id'],auth:'signed-in'}]},
    suiteHash:createHash('sha256').update(JSON.stringify(cases)).digest('hex')};
  const calls=[];
  const dependencies={
    sourceIdentity:async()=>identity,evaluationSuite:async()=>structuredClone(suite),log:()=>{},saveReport:async()=>{},
    loadFixtureAdapter:async()=>assert.fail('A blocked case must never initialize the fixture'),
    fetchImpl:async(input,init)=>{
      const url=new URL(input);
      assert.equal(url.origin,'https://stu.best');
      assert.equal(url.pathname,'/release.json');
      assert.equal(init.method??'GET','GET');
      calls.push('pin');
      return Response.json(release);
    },
  };
  for(const mode of ['draft','retrieval','live']){
    const previous=process.exitCode;
    try{
      const report=await main(['--mode',mode,'--fixture-module','tests/evaluation/live-fixtures.mjs'],dependencies);
      assert.equal(report.results.length,12);
      assert.ok(report.results.every(row=>!row.passed&&row.executed===false&&row.execution==='not-run'&&row.failureKind==='setup'));
      assert.equal(report.assessment.totals.setupFailed,12);
      assert.equal(report.assessment.releaseReady,false);
      if(mode==='live')assert.equal(report.deploymentPin.issued,0);
    }finally{process.exitCode=previous;}
  }
  assert.deepEqual(calls,['pin','pin']);
});

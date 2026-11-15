import assert from 'node:assert/strict';
import test from 'node:test';
import {forCase,prepare} from './live-fixtures.mjs';
import {assessRun,main} from './run.mjs';
import {
  assertNativeInternshipCaseReady,internshipRunnerCases,internshipSetupSummary,markLegacyInternshipFixture,nativeInternshipSetupRequired,
} from './internship-native-runner.mjs';

const origin='https://stu.best';
const runId='53010000-0000-4000-8000-000000009001';
const revision='a'.repeat(40);
const sourceIdentity={sourceRevision:revision,workingTreeHash:'b'.repeat(64),dirty:false};
const base='/school-affairs/services/internship';
const lookup=suffix=>internshipRunnerCases().find(row=>row.id==='account:internship-native-'+suffix);
const inventory={hash:'c'.repeat(64),services:[],tools:[{id:'internshipRecords'},{id:'charges'},{id:'courses'}],publicPages:[],
  routeFamilies:[{id:'internship',auth:'signed-in',routes:[base,...['contract','self_assessment','company','directory'].map(view=>base+'/'+view)]}]};

test('the full runner retains all native internship views and explicit independent-tool requirements',()=>{
  const cases=internshipRunnerCases();
  assert.equal(cases.length,30);
  assert.equal(new Set(cases.map(row=>row.id)).size,30);
  assert.deepEqual(new Set(cases.filter(row=>row.observationExpectation.read).map(row=>row.route)),new Set(inventory.routeFamilies[0].routes.slice(1)));
  assert.ok(cases.every(nativeInternshipSetupRequired));
  assert.deepEqual(lookup('fees-reversed').expected.requiredTools,['internshipRecords','charges']);
  assert.deepEqual(lookup('next-class').expected.requiredTools,['internshipRecords','courses']);
  assert.deepEqual(lookup('foreign-prefix').expected.allowedTools,[]);
  assert.deepEqual(lookup('failed-companion').expected.requiredTools,['charges']);
  assert.equal(internshipSetupSummary(cases).liveEligible,0);
});

test('legacy adapter denies the native suite from prepare and forCase before creating fixtures',async()=>{
  const source=lookup('contract-list');
  const variants=[source,{...source,fixtureRequirement:undefined,fixtureKey:'baseline'},
    {...source,id:'independent-case',fixtureKey:'baseline'},
    {...source,id:'independent-case',fixtureRequirement:undefined}];
  const legacy={id:'account:internship-period',fixtureKey:'internship',question:'Original question',
    expected:{requiredTools:['serviceRecords']}};
  const marked=markLegacyInternshipFixture(legacy);
  assert.equal(marked.question,legacy.question);
  assert.deepEqual(marked.expected,legacy.expected);
  assert.equal(marked.fixtureRequirement,'legacy_internship_rebind');
  for(const row of [...variants,legacy,marked]){
    assert.throws(()=>assertNativeInternshipCaseReady(row),{code:'internship_fixture_and_observation_unmounted'});
    await assert.rejects(prepare({runId,cases:[row],now:'2026-11-15T04:00:00Z',origin}),{code:'fixture-unsupported'});
    await assert.rejects(forCase(row),{code:'fixture-unsupported'});
  }
  assert.equal(nativeInternshipSetupRequired({id:'account:leave-history',fixtureKey:'leave'}),false);
});

test('the live, retrieval and draft runners report unmounted cases as unexecuted with no model or fixture call',async()=>{
  const previous=process.exitCode;
  const selected=['contract-list','reader-failed','foreign-prefix','next-class','anonymous'].map(lookup);
  try{
    for(const mode of ['live','retrieval','draft']){
      const fetched=[],unexpected=[];
      const report=await main(['--mode',mode,'--origin',origin,'--fixture-module','tests/evaluation/live-fixtures.mjs'],{
        sourceIdentity:async()=>structuredClone(sourceIdentity),
        evaluationSuite:async()=>({cases:structuredClone(selected),inventory:structuredClone(inventory),suiteHash:'d'.repeat(64)}),
        loadFixtureAdapter:async()=>{unexpected.push('fixture');throw new Error('Unexpected fixture import.');},
        saveReport:async()=>{},log:()=>{},
        fetchImpl:async(input,init)=>{
          const url=new URL(input);
          fetched.push([url.origin,url.pathname,init.method]);
          assert.equal(url.origin,origin);
          assert.equal(url.pathname,'/release.json');
          assert.equal(init.method,'GET');
          return Response.json({version:1,revision,source:'vercel-git',environment:'production',builtAt:'2026-11-15T00:00:00.000Z'});
        },
      });
      assert.deepEqual(unexpected,[]);
      assert.deepEqual(fetched,mode==='live'?[[origin,'/release.json','GET'],[origin,'/release.json','GET']]:[]);
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
      assert.deepEqual(report.internshipSetup.caseIds,selected.map(row=>row.id));
      assert.ok(report.assessment.releaseBlockers.includes('run.nativeInternshipFixtureUnbound'));
    }
  }finally{process.exitCode=previous;}
});

test('a claimed passing result cannot remove the missing native fixture release blocker',()=>{
  const row=lookup('contract-list');
  const stamped={caseId:row.id,passed:true,execution:'live-model',executed:true,checks:[{id:'forged',passed:true}],
    sourceRevision:revision,fixtureKey:row.fixtureKey};
  const result=assessRun({results:[stamped],sourceUnchanged:true,dirty:false,cleanup:{complete:true}},
    {cases:[row],inventory,sourceRevision:revision,requestedSuite:'full'});
  assert.equal(result.releaseReady,false);
  assert.ok(result.releaseBlockers.includes('run.nativeInternshipFixtureUnbound'));
});

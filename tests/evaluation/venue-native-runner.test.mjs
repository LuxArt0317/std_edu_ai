import assert from 'node:assert/strict';
import test from 'node:test';
import {discoverSurfaces} from './surface-inventory.mjs';
import {main} from './run.mjs';
import {prepare,forCase} from './live-fixtures.mjs';
import {
  assertVenueCaseDefinition,venueRunnerCases,nativeVenueSetupRequired,assertNativeVenueCaseReady,venueSetupSummary,markLegacyVenueFixture,
} from './venue-native-runner.mjs';

const origin='https://stu.best',revision='a'.repeat(40),date='2026-11-15T01:00:00Z';

test('authoritative venue inventory records the local route, independent fixtures, sources and scoped tool contracts',async()=>{
  const inventory=await discoverSurfaces(),cases=venueRunnerCases();
  assert.equal(inventory.tools.filter(row=>row.id==='venueRequests').length,1);
  assert.ok(inventory.routeFamilies.find(row=>row.id==='school-services').routes.includes('/school-affairs/services/44-1'));
  assert.equal(cases.length,9);
  assert.equal(new Set(cases.map(row=>row.id)).size,9);
  assert.deepEqual(venueSetupSummary(cases).caseIds,cases.map(row=>row.id));
  for(const row of cases){
    assert.equal(assertVenueCaseDefinition(row),true);
    assert.equal(nativeVenueSetupRequired(row),true);
    assert.equal(row.venueOracle.fixtureMounted,false);
    assert.throws(()=>assertVenueCaseDefinition({...row,question:row.question+' extra'}),{code:'venue_case_binding_mismatch'});
    assert.throws(()=>assertVenueCaseDefinition({...row,expected:{...row.expected,requiredLinks:[]},route:'/'}),{code:'venue_case_binding_mismatch'});
  }
  const pair=cases.find(row=>row.id==='account:venue-native-count-and-fees');
  assert.deepEqual(pair.venueOracle.scope,{room:'T0308',from:'2026-11-23',through:'2026-11-23',status:'approved',limit:1,rows:1});
  assert.deepEqual(pair.expected.requiredSourceBindings,[
    {sourceId:'account:venueRequests',url:'/school-affairs/services/44-1'},{sourceId:'account:charges',url:'/school-affairs/services/39-1'},
  ]);
});

test('all venue live setup variants stop before ordinary fixture operations',async()=>{
  const base=venueRunnerCases()[0];
  const older={id:'service:44-1:record',question:'Original generic note question',expected:{requiredTools:['serviceRecords']}};
  const legacy=markLegacyVenueFixture(older);
  assert.equal(legacy.question,older.question);
  assert.deepEqual(legacy.expected,older.expected);
  for(const row of [
    base,legacy,{...base,fixtureRequirement:null,fixtureKey:'ordinary'},
    {...base,id:'renamed',fixtureRequirement:null},{...base,id:'renamed',fixtureKey:'ordinary'},
  ]){
    assert.throws(()=>assertNativeVenueCaseReady(row),{code:'venue_fixture_and_observation_unmounted'});
    await assert.rejects(prepare({runId:'11900000-0000-4000-8000-000000009001',cases:[row],now:date,origin}),{code:'fixture-unsupported'});
    await assert.rejects(forCase(row),{code:'fixture-unsupported'});
  }
});

test('the authoritative runner gives no hosted model credit without authentic setup and trusted observations',async()=>{
  const previous=process.exitCode;
  const cases=venueRunnerCases();
  const reportInventory={hash:'c'.repeat(64),services:[],tools:[{id:'venueRequests'},{id:'charges'}],publicPages:[],routeFamilies:[]};
  let adapterLoads=0,releaseReads=0;
  try{
    const report=await main(['--mode','live','--origin',origin,'--fixture-module','tests/evaluation/live-fixtures.mjs'],{
      sourceIdentity:async()=>({sourceRevision:revision,workingTreeHash:'b'.repeat(64),dirty:false}),
      evaluationSuite:async()=>({cases,inventory:reportInventory,suiteHash:'d'.repeat(64)}),
      loadFixtureAdapter:async()=>{adapterLoads++;throw Error('Forbidden fixture load');},
      saveReport:async()=>{},log:()=>{},
      fetchImpl:async(input,init)=>{
        assert.equal(String(input),'https://stu.best/release.json');
        assert.equal(init.method,'GET');
        releaseReads++;
        return Response.json({version:1,revision,source:'vercel-git',environment:'production',builtAt:'2026-11-15T00:00:00.000Z'});
      },
    });
    assert.equal(adapterLoads,0);
    assert.equal(releaseReads,2);
    assert.equal(report.venueSetup.liveEligible,0);
    assert.equal(report.results.length,cases.length);
    assert.ok(report.results.every(row=>row.executed===false&&row.execution==='not-run'&&row.passed===false&&row.failureKind==='setup'));
    assert.ok(report.assessment.releaseBlockers.includes('run.nativeVenueFixtureUnbound'));
  }finally{process.exitCode=previous;}
});

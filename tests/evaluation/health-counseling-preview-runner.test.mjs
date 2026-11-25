import assert from 'node:assert/strict';
import {test} from 'node:test';
import {counselingHostedCases} from './counseling-appointment-hosted.mjs';
import {healthMetadataFamily,healthMetadataLiveCases} from './health-examination-live.mjs';
import {packetVerdict} from './run-health-counseling-preview.mjs';

const origin='https://stdedu-abcdefghi-v1-d286.vercel.app';
const sourceRevision='1'.repeat(40);
const pin=count=>({origin,sourceRevision,status:'finished',issued:count,completed:count});
const health=()=>{
  const results=healthMetadataLiveCases().map(row=>({caseId:row.id,passed:true,executed:true,response:{fixtureReadback:{verified:true}}}));
  return {mode:'live',caseFamily:healthMetadataFamily,injectedDependencies:false,sourceRevision,sourceUnchanged:true,finishedAt:'2026-11-15T08:00:00Z',
    cleanup:{complete:true,proof:{verified:true}},deploymentPin:pin(results.length),results};
};
const counseling=()=>{
  const results=counselingHostedCases().map((row,index)=>({caseId:row.id,passed:true,requestIndex:index+1}));
  return {sourceRevision,terminal:true,liveAcceptance:true,deployment:pin(results.length),cleanup:{verified:true},results};
};

test('the independent packet verdict uses exact executed case identities and cleanup proof',()=>{
  assert.deepEqual(packetVerdict('health',health(),origin,sourceRevision),{
    status:'passed',expected:16,executed:16,passed:16,failed:0,cleanup:'verified',
  });
  assert.deepEqual(packetVerdict('counseling',counseling(),origin,sourceRevision),{
    status:'passed',expected:9,executed:9,passed:9,failed:0,cleanup:'verified',
  });
  const report=counseling();
  report.results[0].passed=false;
  report.liveAcceptance=false;
  assert.equal(packetVerdict('counseling',report,origin,sourceRevision).status,'failed');
});

test('partial, duplicated, wrong-pin, injected or missing readback reports cannot pass',()=>{
  for(const corrupt of [
    row=>{row.results.pop();},
    row=>{row.results[0]=row.results[1];},
    row=>{row.results[1].executed=false;},
    row=>{row.results[2]=null;},
    row=>{row.results[3].response.fixtureReadback.verified=false;},
    row=>{row.injectedDependencies=true;},
    row=>{row.deploymentPin.completed--;},
    row=>{row.deploymentPin.origin='https://other.invalid';},
    row=>{row.cleanup={complete:true};},
  ]){
    const report=health();corrupt(report);
    assert.equal(packetVerdict('health',report,origin,sourceRevision).status,'incomplete');
  }
  const report=counseling();
  report.terminal=false;
  assert.equal(packetVerdict('counseling',report,origin,sourceRevision).status,'incomplete');
  assert.equal(packetVerdict('health',null,origin,sourceRevision).cleanup,'unproven');
  assert.equal(packetVerdict('counseling',{...counseling(),cleanup:null},origin,sourceRevision).cleanup,'unproven');
});

test('a tuition packet needs both linked proofs, the explicit exclusion, a stable combined digest and exact cleanup',()=>{
  const cases=counselingHostedCases({compound:true});
  const full={sourceRevision,terminal:true,liveAcceptance:true,deployment:pin(3),
    cleanup:{verified:true,counselingCompoundCleanup:true,protectedOwnerUnchanged:true},
    results:cases.map((row,index)=>({caseId:row.id,passed:true,requestIndex:index+1,failures:[],
      correlationId:'f1300000-0000-4000-8000-'+String(index+1).padStart(12,'0'),requestSha256:String(index).repeat(64),
      recordDigest:'d'.repeat(64),attempts:1,callerCounts:[3,1],completedTools:row.expected.requiredTools}))};
  assert.deepEqual(packetVerdict('counseling-tuition',full,origin,sourceRevision),
    {status:'passed',expected:3,executed:3,passed:3,failed:0,cleanup:'verified'});
  for(const breakProof of [
    row=>{row.cleanup.counselingCompoundCleanup=false;},
    row=>{row.cleanup.protectedOwnerUnchanged=false;},
    row=>{row.results[1].recordDigest='f'.repeat(64);},
    row=>{row.results[2].completedTools=['charges','counselingAppointments'];},
    row=>{row.results[1].requestSha256=row.results[0].requestSha256;},
    row=>{row.results[0].correlationId=row.results[1].correlationId;},
  ]){
    const report=structuredClone(full);breakProof(report);
    assert.equal(packetVerdict('counseling-tuition',report,origin,sourceRevision).status,'incomplete');
  }
});

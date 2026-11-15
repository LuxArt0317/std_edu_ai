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

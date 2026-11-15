import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import test from 'node:test';
import {repairPaths} from '../../src/features/public/affairs/facilityRepair.js';
import {buildFacilityRepairCancellationPlan,facilityRepairCancellationCaseIds,facilityRepairCancellationMode,
  hasFacilityRepairCancellationProof,verifyFacilityRepairCancellation} from './facility-repair-cancellation-preview.mjs';
import {prepare} from './live-fixtures.mjs';

const origin='https://stdedu-abcdef123-v1-d286.vercel.app';
const runId=randomUUID(),owners={
  A:{id:randomUUID(),email:'repair-a@example.invalid',runMarker:runId},
  B:{id:randomUUID(),email:'repair-b@example.invalid',runMarker:runId},
};
const plan=buildFacilityRepairCancellationPlan(runId,owners);
const [target,sibling,foreign]=plan.reports,requestId=randomUUID();
const expectedRoute=repairPaths.history+'/'+target.id;
const hash=value=>createHash('sha256').update(value).digest('hex');

test('confirmed facility repair requires an exact clean protected fixture arm',async()=>{
  const setup={runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,
    expectedReleaseRevision:'a'.repeat(40),fixtureMode:facilityRepairCancellationMode,previewReadbackFetch:()=>assert.fail('No network')};
  for(const invalid of [{origin:'https://stu.best'},{approvedPreviewOrigin:undefined},{cases:[{}]},{caseFamily:'other'},
    {applicationFetch:()=>assert.fail('No injected application')},{previewReadbackFetch:undefined}])
    await assert.rejects(prepare({...setup,...invalid}),/exact protected Preview/u);
});

test('the independent sequence journals the exact proposal, permits one transition and proves a stable receipt',async()=>{
  let state='initial',command=null,confirmationCount=0;
  const requests=[];
  const proof=await verifyFacilityRepairCancellation({plan,
    observe:async expected=>{
      assert.equal(state,expected);
      return {counts:[2,1],rowsDigest:hash('rows'+state),eventsDigest:hash('events'+state),wireDigest:hash('wire'+state)};
    },
    markCancellation:async intention=>{
      assert.equal(state,'initial');assert.deepEqual(intention,{request_id:requestId,id:target.id,version:1});
      command=structuredClone(intention);
    },
    request:async input=>{
      requests.push(input);
      let body,activity=[];
      if(input.query){
        assert.equal(command,null);
        body={status:'clarification'};
        if(input.actor==='guest')body={status:'handoff',citations:[{url:'/school-affairs/login?next='+encodeURIComponent(repairPaths.history)}]};
        if(input.proposalSelector){
          assert.equal(input.route,expectedRoute);assert.equal(input.actor,'A');
          body={status:'answered',grounding:{source:'account',webSearched:false},verification:{status:'verified',attempts:1},
            proposedAction:{kind:'cancel_facility_repair',label:'Cancel repair report '+target.id.slice(0,8).toUpperCase()+' · Submitted 2024-01-25',
              payload:{id:target.id,version:'1'},requestId,url:expectedRoute}};
          activity=[{kind:'account-read:facilityRepairs:1',status:'complete'}];
        }
      }else{
        assert.ok(command);
        body={error:'Rejected repair'};
        if(input.caseId.endsWith('-confirmed')){
          assert.equal(state,'initial');assert.deepEqual(input.action.payload,command);
          state='cancelled';confirmationCount++;
          body={id:target.id,status:state,version:2};
        }
        if(input.caseId.endsWith('-replayed')){
          assert.equal(state,'cancelled');assert.deepEqual(input.action.payload,command);
          body={id:target.id,status:state,version:2};
        }
      }
      return {body,activity,requestIndex:requests.length,...(input.query&&input.actor!=='guest'?{correlationId:randomUUID()}:{})};
    },
  });
  assert.deepEqual(proof.map(row=>row.caseId),facilityRepairCancellationCaseIds());
  assert.equal(confirmationCount,1);assert.equal(hasFacilityRepairCancellationProof(proof),true);
  const payload=suffix=>requests.find(value=>value.caseId==='facility-repair-cancel-'+suffix).action.payload;
  assert.equal(payload('unrelated').id,plan.missingId);
  assert.deepEqual(payload('ineligible'),{id:sibling.id,version:2,request_id:requestId});
  assert.deepEqual(payload('stale-after'),{id:target.id,version:1,request_id:plan.staleRequestId});
  assert.deepEqual(payload('crossed-after'),command);
  assert.equal(foreign.user_id,owners.B.id);
  assert.doesNotMatch(JSON.stringify(proof),new RegExp([runId,owners.A.id,owners.B.id,target.id,requestId].join('|'),'u'));
  for(const mutate of [
    rows=>{rows.find(row=>row.caseId.endsWith('-replayed')).requestDigest=hash('changed request');},
    rows=>{rows.find(row=>row.caseId.endsWith('-replayed')).receiptDigest=hash('changed receipt');},
    rows=>{rows.find(row=>row.caseId.endsWith('-confirmed')).after.eventsDigest=rows[0].before.eventsDigest;},
    rows=>{rows.find(row=>row.caseId.endsWith('-wrong-version')).after.wireDigest=hash('early mutation');},
  ]){
    const tampered=structuredClone(proof);mutate(tampered);
    assert.equal(hasFacilityRepairCancellationProof(tampered),false);
  }
});

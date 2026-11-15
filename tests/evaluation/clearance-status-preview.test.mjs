import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertClearanceStatusTermIds,assertClearanceStatusSchema,readClearanceStatusShared,bindClearanceStatusPreview,verifyClearanceStatusPreview,
  clearanceStatusPreviewCaseIds,clearanceStatusPreviewDeferred} from './clearance-status-preview.mjs';

const ids=[randomUUID(),randomUUID()];
const shared=[
  {term:{id:ids[0],label:'Current published term',starts_on:'2025-09-01',ends_on:'2026-02-01'},period:null},
  {term:{id:ids[1],label:'Earlier published term',starts_on:'2025-02-01',ends_on:'2025-07-01'},period:null},
];
function fixture(){
  const runId=randomUUID(),owners=Object.fromEntries(['A','B'].map(side=>[side,{id:randomUUID(),email:side.toLowerCase()+'@example.invalid',runMarker:runId}]));
  return bindClearanceStatusPreview(runId,owners,shared);
}

test('clearance Preview binds only two exact existing terms and fails closed on configured windows or invalid schema',async()=>{
  assert.throws(()=>assertClearanceStatusTermIds([ids[0],ids[0]]),/approved-term-id-pair/u);
  assert.throws(()=>assertClearanceStatusTermIds([...ids,'unrelated']),/approved-term-id-pair/u);
  const sql=(parts,...values)=>{
    if(!Object.hasOwn(parts,'raw'))return parts;
    assert.deepEqual(values,[ids]);
    assert.match(parts.join(''),/left join public\.affairs_clearance_periods/iu);
    return [...shared].reverse();
  };
  assert.deepEqual(await readClearanceStatusShared(sql,ids),shared);
  const moved=[{...shared[0],period:{version:1}},shared[1]];
  const emulate=rows=>async parts=>Object.hasOwn(parts,'raw')?rows:parts;
  await assert.rejects(readClearanceStatusShared(emulate(moved),ids),/selected-terms-have-no-configured-periods/u);
  await assert.rejects(readClearanceStatusShared(emulate(shared),[...ids].reverse()),/distinct-ordered-term-pair/u);
  const flags={applied:true,rls:true,caller_tables:true,caller_rpc:true,operator:true};
  await assertClearanceStatusSchema(async()=>[flags]);
  for(const name of Object.keys(flags))await assert.rejects(assertClearanceStatusSchema(async()=>[{...flags,[name]:false}]),/schema-preflight/u);
  assert.equal(clearanceStatusPreviewCaseIds.length,16);
  const deferred=clearanceStatusPreviewDeferred.filter(row=>row.reason==='insufficient-period-bindings');
  assert.deepEqual(deferred.map(row=>row.caseId.split('applications-')[1]),['windows','status-and-windows','window-without-application']);
});

test('crossed caller response and unexpected SQL data stop the packet before any assistant call',async()=>{
  const rows=fixture();
  const context={fixture:rows,readShared:async()=>shared,readOwned:async()=>rows.expected,
    readNative:async side=>({status:200,body:rows.native[side]}),ask:async()=>assert.fail('unverified scope sent an assistant request')};
  await assert.rejects(verifyClearanceStatusPreview({...context,
    readNative:async()=>({status:200,body:rows.native.B})}),/exact-owned-native-readback/u);
  await assert.rejects(verifyClearanceStatusPreview({...context,
    readOwned:async()=>({...rows.expected,receipts:[{unexpected:true}]})}),/exact-owned-sql-readback/u);
  await assert.rejects(verifyClearanceStatusPreview({...context,
    readShared:async()=>[{...shared[0],term:{...shared[0].term,label:'Changed'}},shared[1]]}),/shared-term-period-changed/u);
});

import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {venueRequestPlan} from '../../server/venueRequestIntent.js';
import {venueFixture,venueRunnerCases} from './venue-native-runner.mjs';
import {buildVenueProtectedPlan,expectedVenueProtectedRead,observeVenueProtectedFixture,venueProtectedCases,venueProtectedGaps} from './venue-protected-fixture.mjs';

const plan=()=>{
  const runId=randomUUID(),owners=Object.fromEntries(['A','B'].map(role=>[role,{id:randomUUID(),email:'venue-'+role.toLowerCase()+'@example.invalid',runMarker:runId}]));
  return buildVenueProtectedPlan(runId,owners);
};

test('the protected cohort uses only historical pending fixtures and leaves the frozen positive and failure oracles intact',()=>{
  const pinned=plan(),cases=venueProtectedCases(),gaps=venueProtectedGaps();
  assert.equal(pinned.rows[0].id,venueFixture.requestId);
  assert.equal(cases.length,7);
  assert.ok(pinned.rows.every(row=>row.status==='submitted'&&row.booking_date<'2002'&&row.venue.startsWith('QAVENUE-')));
  assert.equal(new Set(pinned.rows.map(row=>row.user_id)).size,2);
  assert.equal(gaps.filter(row=>row.reason==='approved_slot_requires_isolated_database').length,4);
  assert.equal(gaps.filter(row=>row.reason==='controlled_reader_outage').length,2);
  assert.equal(gaps.filter(row=>row.reason==='legacy_generic_note_rebind').length,3);
  for(const fixture of venueRunnerCases()){
    const mounted=cases.find(row=>row.testCase.id===fixture.id);
    if(mounted)assert.deepEqual(mounted.testCase,fixture);
    else assert.ok(gaps.some(row=>row.caseId===fixture.id));
  }
});

test('independent protected oracles bind the parsed owner, dates, IDs and count without reusing runtime parsing',()=>{
  const pinned=plan();
  const digests=new Set();
  for(const boundCase of venueProtectedCases()){
    const {scope,testCase,role}=boundCase;
    const actual=venueRequestPlan(testCase.question,testCase.route,testCase.history);
    const proof=expectedVenueProtectedRead(pinned,boundCase);
    if(!scope){
      assert.equal(proof,null);
      if(role!=='guest')assert.ok(['foreign','mixed'].includes(actual.selection.reason));
      continue;
    }
    const {rows,...oracle}=scope;
    assert.deepEqual(actual.selection,{reason:null,period:null,latest:false,submittedAt:false,...oracle});
    assert.equal(actual.feeQuestion,null);
    assert.match(proof.readDigest,/^[a-f0-9]{64}$/u);
    assert.match(proof.evidenceDigest,/^[a-f0-9]{64}$/u);
    digests.add(proof.readDigest);
    if(!rows){
      assert.equal(role,'B');
      assert.ok(pinned.rows.some(row=>row.id===scope.id&&row.user_id===pinned.owners.A.id));
      assert.ok(pinned.rows.some(row=>row.user_id===pinned.owners.B.id&&row.id!==scope.id));
    }
  }
  assert.equal(digests.size,4);
});

test('the database reader refuses any forged plan capable of holding capacity before issuing SQL',async()=>{
  const pinned=plan(),sql=()=>assert.fail('Unbound fixture cannot issue SQL.');
  pinned.rows[0].status='approved';
  await assert.rejects(observeVenueProtectedFixture(sql,pinned),/changed after ownership binding/u);
  assert.throws(()=>expectedVenueProtectedRead(pinned,venueProtectedCases()[0]),/changed after ownership binding/u);
});

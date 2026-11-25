import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {buildServiceCases} from './service-cases.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {EVAL_USER_ID,EVAL_OTHER_USER_ID,evalId,fixtureForCase} from './fixtures.mjs';
import {bindPublishedHousingBedFixture,verifyPublishedHousingBedBinding,verifyNativeFixtureReadback,planNativeFixture} from './live-fixtures.mjs';

const cases=buildAccountCases(),options={domains:['housing'],userId:EVAL_USER_ID,studentId:evalId(10),otherUserId:EVAL_OTHER_USER_ID};
const snapshot=fixtureForCase(cases.find(row=>row.id==='account:housing-bed'));
const expected=snapshot.housing.assignments[0],original=snapshot.housing.periods[0];
const period={...original,id:evalId(8101),termLabel:'Published 115/1 semester',
  opensAt:'2026-01-01T09:00:00.123456Z',closesAt:'2026-01-25T09:00:00.654321Z',
  instructions:'Published window and agreement',agreementText:'Existing published agreement',version:7};
const archived={...period,id:evalId(8102),academicYear:114,semester:2};
const periods=[period,archived];

test('read-only bed binding uses the exact academic term rather than invented window text or catalog size',async()=>{
  const fixture=await bindPublishedHousingBedFixture(snapshot,{...options,read:async()=>periods});
  assert.deepEqual(Object.keys(fixture.rows),['affairs_housing_applications','affairs_housing_assignments']);
  assert.deepEqual(fixture.rows.affairs_housing_applications,[]);
  const [saved]=fixture.rows.affairs_housing_assignments;
  assert.equal(saved.period_id,period.id);
  assert.deepEqual([saved.bed_number,saved.dormitory,saved.bunk,saved.accommodation_fee,saved.deposit,saved.subsidy_amount],
    ['E-305-2','East Hall','upper',8500,1000,2000]);
  assert.deepEqual(fixture.expected.housing,{periods,applications:[],assignments:[{...expected,periodId:period.id}]});
  assert.equal(verifyNativeFixtureReadback({housing:fixture.expected.housing},fixture),true);
  assert.throws(()=>verifyNativeFixtureReadback({housing:{...fixture.expected.housing,assignments:[{...expected,periodId:archived.id}]}},fixture));
  assert.deepEqual(snapshot.housing.periods,[original]);
  assert.equal(snapshot.housing.applications.length,1);
});

test('a missing or ambiguous exact period fails setup and never chooses a different term',async()=>{
  const noPeriod=error=>error.code==='fixture-unsupported'&&/academic year 115 semester 1/u.test(error.message);
  for(const rows of [[],[archived],[{...period,semester:2}]]){
    await assert.rejects(bindPublishedHousingBedFixture(snapshot,{...options,read:async()=>rows}),noPeriod);
  }
  await assert.rejects(bindPublishedHousingBedFixture(snapshot,{...options,read:async()=>[period,{...period,id:evalId(8103)}]}),{code:'fixture-schema'});
  const unbound=structuredClone(snapshot);
  unbound.housing.assignments[0].semester=2;
  await assert.rejects(bindPublishedHousingBedFixture(unbound,{...options,read:async()=>periods}),{code:'fixture-schema'});
});

test('independent fingerprint catches period remapping, field changes, and published inventory drift',async()=>{
  const fixture=await bindPublishedHousingBedFixture(snapshot,{...options,read:async()=>periods});
  const binding=fixture.housingBedPeriodBinding;
  assert.deepEqual(await verifyPublishedHousingBedBinding(binding,{read:async()=>[archived,period]}),binding);
  for(const changed of [[period],[{...period,id:evalId(8300)},archived],[{...period,version:8},archived],
    [{...period,opensAt:'2026-01-01T09:00:00.123457Z'},archived],[{...period,agreementText:'Changed'},archived]]){
    await assert.rejects(verifyPublishedHousingBedBinding(binding,{read:async()=>changed}),{code:'fixture-mapping'});
  }
});

test('receipt fixture keeps the independent agreement and period requirements',async()=>{
  await assert.rejects(planNativeFixture(snapshot,{...options,shared:{housing:{periods:[period]}}}),{code:'fixture-unsupported'});
});


test('empty bed history remains an exact private assignment check when there is no published period',async()=>{
  const empty=fixtureForCase(cases.find(row=>row.id==='account:empty-housing'));
  for(const published of [[],[archived]]){
    const fixture=await bindPublishedHousingBedFixture(empty,{...options,read:async()=>published});
    assert.deepEqual(fixture.expected.housing,{periods:published,applications:[],assignments:[]});
    assert.deepEqual(fixture.rows.affairs_housing_assignments,[]);
    assert.equal(fixture.housingBedPeriodBinding.academicYear,null);
    assert.equal(verifyNativeFixtureReadback({housing:fixture.expected.housing},fixture),true);
  }
});

test('live baseline invokes read-only period binding only for the declared protected bed cases',async()=>{
  const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function readNativeBindings(');
  const end=source.indexOf('function recordsToInsert(',start);
  let currentReads=0;
  const state={previewGate:{},users:[{id:EVAL_USER_ID,studentId:evalId(10)},{id:EVAL_OTHER_USER_ID}]};
  const readBindings=runInNewContext('('+source.slice(start,end).trim()+')',{
    state,PRIVATE_NATIVE_DOMAINS:[],CONDITIONAL_NATIVE_DOMAINS:['housing'],
    fail:(code,message)=>{throw Object.assign(new Error(message),{code});},
    readPublishedHousingPeriods:async()=>{currentReads++;return periods;},bindPublishedHousingBedFixture,
  });
  const casesToCheck=['account:housing-bed','account:housing-costs','account:dormitory-conduct-mixed-housing',
    'service:34-1:record','service:34-1:empty'].map(id=>[...cases,...buildServiceCases()].find(row=>row.id===id));
  for(const testCase of casesToCheck){
    assert.ok(testCase);
    const actual=await readBindings(fixtureForCase(testCase),testCase);
    const ownsBed=testCase.id!=='service:34-1:empty';
    assert.equal(actual.rows.affairs_housing_assignments.length,ownsBed?1:0);
    assert.equal(actual.housingBedPeriodBinding.academicYear,ownsBed?115:null);
  }
  assert.equal(currentReads,casesToCheck.length);
  state.previewGate=null;
  await assert.rejects(readBindings(snapshot,casesToCheck[0]),{code:'fixture-target'});
  assert.equal(currentReads,casesToCheck.length);
});

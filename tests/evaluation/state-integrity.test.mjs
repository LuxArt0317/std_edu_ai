import {nativeInternshipSetupRequired} from './internship-native-runner.mjs';
import {nativeStudentLeaveSetupRequired} from './student-leave-runner.mjs';
import {isElearningPublishedReadbackCase} from './elearning-catalog-runner.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {fixtureForCase,EVAL_USER_ID,EVAL_OTHER_USER_ID} from './fixtures.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {readSupplementalFixtureScopes,planSupplementalFixture,verifySupplementalFixtureReadback,LiveFixtureError} from './live-fixtures.mjs';

// Extract only pure helpers and the case lifecycle functions. Importing or
// executing the live prepare/cleanup entrypoints is never part of this test.
const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
function section(start,end){
  const first=source.indexOf(start),last=source.indexOf(end,first);
  assert.ok(first>=0&&last>first,'The actual lifecycle section must exist.');
  return source.slice(first,last).replaceAll('export async function ','async function ');
}
const hashSource=section('function digestObjectKeys(','const timestamp=');
const hash=vm.runInNewContext(hashSource+'\nhash;',{createHash});
const domains=['enrollmentCertificate','tuition'];
const item=buildAccountCases().find(row=>row.id==='account:tuition-certificate-balance-mixed');
assert.ok(item);
const reverseKeys=value=>Array.isArray(value)?value.map(reverseKeys):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reverseKeys(value[key])])):value;

async function pipeline(mutate){
  const now=new Date('2026-11-09T04:00:00.000Z'),fixture=fixtureForCase(item,{userId:EVAL_USER_ID,now});
  const plan=planSupplementalFixture(fixture,{userId:EVAL_USER_ID,otherUserId:EVAL_OTHER_USER_ID,domains});
  const values={before:structuredClone(plan.expectedByOwner),after:reverseKeys(structuredClone(plan.expectedByOwner))};
  mutate?.(values.after);
  const observed={before:{},after:{}},state={prepared:true,current:null,origin:'https://synthetic.invalid',now,
    users:[{id:EVAL_USER_ID,token:'synthetic-own'},{id:EVAL_OTHER_USER_ID,token:'synthetic-foreign'}],
    supplementalTables:new Set(['affairs_enrollment_certificate_assessments','affairs_tuition_settlements'])};
  let phase='before',ledgerSaves=0;
  async function orderedRead(user,selected){
    const gates=new Map();
    const task=readSupplementalFixtureScopes(user,selected,{origin:state.origin,fetchImpl:async(url,init)=>new Promise(resolve=>{
      assert.equal(url.origin,state.origin);assert.equal(init.headers.Authorization,'Bearer '+user.token);
      const domain=url.searchParams.get('scope')==='tuition-documents'?'tuition':'enrollmentCertificate';
      gates.set(domain,()=>resolve(Response.json(values[phase][user.id][domain])));
    })});
    await new Promise(setImmediate);assert.equal(gates.size,2);
    const order=phase==='before'?domains:[...domains].reverse();
    // A completed body read, not elapsed-time jitter, determines insertion order.
    gates.get(order[0])();await new Promise(setImmediate);gates.get(order[1])();
    const result=await task;observed[phase][user.id]=result;return result;
  }
  const context={nativeInternshipSetupRequired,nativeStudentLeaveSetupRequired,isElearningPublishedReadbackCase,createHash,state,ready:()=>state,timestamp:value=>new Date(value).toISOString(),fixtureForCase,
    // Setup/persistence are deliberately in-memory. The actual forCase,
    // afterCase, hash, ownState, scoped reader and readback checks run below.
    assertSupported:()=>{},readNativeBindings:async()=>({rows:{}}),recordsToInsert:()=>({}),
    planSupplementalFixture,persistSnapshot:async()=>{},readSnapshot:async()=>structuredClone(fixture),
    verifyReadback:(actual,expected)=>assert.deepEqual(actual,expected),verifyNativeFixtureReadback:()=>{},
    SUPPLEMENTAL_SCOPES:{enrollmentCertificate:'enrollment-certificate',tuition:'tuition-documents'},
    SUPPLEMENTAL_TABLES:{enrollmentCertificate:'affairs_enrollment_certificate_assessments',tuition:'affairs_tuition_settlements'},
    readSupplementalFixtureScopes:orderedRead,verifySupplementalFixtureReadback,
    saveLedger:async()=>{ledgerSaves++;},PROJECT:'synthetic',fail:(code,message)=>{throw new LiveFixtureError(code,message);}};
  const methods=vm.runInNewContext(hashSource+'\n'+section('function canonical(value){','function assertFactEqual(')+'\n'
    +section('function ownState(snapshot){','/** Persists golden facts')+'\n'
    +section('export async function forCase(','/** Deliberately never confirms')+'\n'
    +section('export async function afterCase(','/** Removes only')+'\n({forCase,afterCase});',context);
  await methods.forCase(item);phase='after';const envelope={};let error;
  try{await methods.afterCase(item,envelope);}catch(caught){error=caught;}
  assert.equal(state.current,null);assert.equal(ledgerSaves,2);
  for(const owner of state.users){
    assert.deepEqual(Object.keys(observed.before[owner.id]),domains);
    assert.deepEqual(Object.keys(observed.after[owner.id]),[...domains].reverse());
  }
  return {error,envelope,observed};
}

test('common digest normalizes nested object keys while preserving arrays, values and timestamp strings',()=>{
  const original={owner:{status:'blocked',rows:[{id:'b',text:null},{id:'a',text:''}]},time:'2026-11-13T00:00:00Z',amount:0};
  assert.equal(hash(original),hash(reverseKeys(original)));
  for(const mutate of [value=>{value.owner.rows.reverse();},value=>{value.owner.rows[0].text='';},value=>{value.amount='0';},
    value=>{value.time='2026-11-13T00:00:00+00:00';},value=>{delete value.owner.status;}]){
    const changed=structuredClone(original);mutate(changed);assert.notEqual(hash(original),hash(changed));
  }
  const date=new Date('2026-11-13T00:00:00.000Z');assert.equal(hash({date}),hash({date:date.toJSON()}));
  const prototypeKey=JSON.parse('{"__proto__":{"record":1},"a":2}');
  assert.equal(hash(prototypeKey),hash(reverseKeys(prototypeKey)));
  assert.notEqual(hash(prototypeKey),hash({a:2}));
});

test('actual scoped reads and forCase/afterCase accept unchanged two-owner records with reversed async completion',async()=>{
  const {error,envelope,observed}=await pipeline();assert.equal(error,undefined);
  assert.deepEqual(observed.before,observed.after);
  assert.equal(envelope.stateBefore.ownedRecordsDigest,envelope.stateAfterProposal.ownedRecordsDigest);
  assert.equal(envelope.fixtureReadback.verified,true);
});

test('the same actual pipeline still rejects changed owner fields, foreign fields, missing rows and array order',async()=>{
  for(const mutate of [
    values=>{values[EVAL_USER_ID].tuition.settlements[0].text='CHANGED_LITERAL_RECORD';},
    values=>{values[EVAL_OTHER_USER_ID].enrollmentCertificate.assessments[0].status='local_eligible';},
    values=>{values[EVAL_USER_ID].tuition.settlements.pop();},
    values=>{values[EVAL_USER_ID].tuition.settlements.reverse();},
  ]){
    const {error,envelope}=await pipeline(mutate);
    assert.equal(error?.code,'fixture-unapproved-write');
    assert.notEqual(envelope.stateBefore.ownedRecordsDigest,envelope.stateAfterProposal.ownedRecordsDigest);
  }
});

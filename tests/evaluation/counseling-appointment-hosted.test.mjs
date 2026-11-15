import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {buildCounselingAppointmentFixturePlan,counselingAppointmentFixtureReadContract} from './counseling-appointment-fixture-plan.mjs';
import {counselingCompoundFixtureMode,counselingFixtureMode,counselingHostedCases,gradeHostedCounseling,observeCounselingFixture,requestCounselingHostedCase,
  transitionCounselingFixtures,validateCounselingHostedCases} from './counseling-appointment-hosted.mjs';
import {prepare,runCounselingHostedEvaluation} from './live-fixtures.mjs';

const runId=randomUUID(),origin='https://stdedu-123456789-v1-d286.vercel.app',table='affairs_counseling_appointments';
const owners=Object.fromEntries(['A','B'].map(role=>[role,{id:randomUUID(),email:role.toLowerCase()+'@example.invalid',runMarker:runId}]));
const users=Object.values(owners).map(owner=>({id:owner.id,token:'test-token-'+owner.id}));
const plan=fixtureKey=>buildCounselingAppointmentFixturePlan({runId,owners,fixtureKey});
const fresh=plan('counselingAppointments'),empty=plan('empty:counselingAppointments');
function storage(initial=[]){
  let rows=structuredClone(initial);const calls=[];
  const sql=(parts,...values)=>{
    if(!Array.isArray(parts)||!Object.hasOwn(parts,'raw'))return parts;
    const text=parts.join('$').replace(/\s+/gu,' ').trim();
    if(text.includes('from auth.users'))return structuredClone(Object.values(owners));
    if(text.startsWith('select id,user_id,kind'))return structuredClone(rows.filter(row=>values[0].includes(row.user_id)||values[1].includes(row.id)));
    if(text.startsWith('select user_id from private.affairs_counseling_coordinators'))return [];
    if(text.startsWith('delete from public.affairs_counseling_appointments')){
      calls.push('delete');const [id,userId]=values;
      const removed=rows.filter(row=>row.id===id&&row.user_id===userId);
      rows=rows.filter(row=>!removed.includes(row));return removed.map(row=>({id:row.id}));
    }
    if(text.startsWith('insert into public.affairs_counseling_appointments')){
      calls.push('insert');rows.push(...structuredClone(values[0]));return [];
    }
    throw new Error('Unexpected SQL in test.');
  };
  return {sql,calls,rows:()=>rows};
}

test('only the exact scoped counseling packet can reach owned fixture preparation',async()=>{
  const cases=counselingHostedCases();
  assert.equal(cases.length,9);assert.equal(validateCounselingHostedCases(cases),true);
  assert.throws(()=>validateCounselingHostedCases(cases.slice(1)),/exact/);
  await assert.rejects(prepare({runId,cases,now:new Date().toISOString(),origin:'https://stu.best',
    fixtureMode:'counseling-appointments-only',caseFamily:'counseling-appointments'}),{code:'fixture-target'});
  await assert.rejects(runCounselingHostedEvaluation({origin:'https://stu.best',sourceRevision:'a'.repeat(40)}),{code:'fixture-config'});
  await assert.rejects(prepare({runId,cases,now:new Date().toISOString(),origin}),{code:'fixture-target'});
});

test('the tuition mode admits only both frozen question orders and the explicit exclusion',async()=>{
  const cases=counselingHostedCases({compound:true});
  assert.deepEqual(cases.map(row=>row.id),['mixed-tuition','mixed-reversed','negative-counseling'].map(id=>'account:counseling-appointments-'+id));
  assert.deepEqual(cases.map(row=>row.expected.requiredTools),[['counselingAppointments','charges'],['counselingAppointments','charges'],['charges']]);
  assert.equal(validateCounselingHostedCases(cases,{compound:true}),true);
  const denied=()=>assert.fail('Invalid admission must not reach the Preview.');
  const preparation={runId,now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,
    fixtureMode:counselingCompoundFixtureMode,caseFamily:'counseling-appointments',previewReadbackFetch:denied};
  await assert.rejects(prepare({...preparation,cases,fixtureMode:counselingFixtureMode}),/exact read-only/u);
  await assert.rejects(prepare({...preparation,cases:counselingHostedCases()}),/exact read-only/u);
  await assert.rejects(prepare({...preparation,cases:[{...cases[0],question:'Altered question.'},...cases.slice(1)]}),/exact read-only/u);
  await assert.rejects(prepare({...preparation,cases,caseFamily:undefined}),{code:'fixture-target'});
  await assert.rejects(prepare({...preparation,cases,applicationFetch:denied}),{code:'fixture-target'});
});

test('exact planner transitions, rollback recovery and unknown rows fail closed',async()=>{
  const store=storage();
  await transitionCounselingFixtures(store.sql,{next:fresh});
  assert.equal(store.rows().length,4);
  await transitionCounselingFixtures(store.sql,{previous:fresh,next:empty});
  assert.equal(store.rows().length,1);
  await transitionCounselingFixtures(store.sql,{previous:fresh,next:empty,recovering:true});
  assert.equal(store.rows().length,0);
  assert.deepEqual(store.calls,['insert','delete','delete','delete','delete','insert','delete']);
  const altered=storage(fresh.rows[table]);
  altered.rows()[0].version++;
  await assert.rejects(transitionCounselingFixtures(altered.sql,{previous:fresh,recovering:true}),/rows_mismatch/);
  assert.deepEqual(altered.calls,[]);
  const collision=storage([...fresh.rows[table],{...empty.rows[table][0],user_id:randomUUID()}]);
  await assert.rejects(transitionCounselingFixtures(collision.sql,{previous:fresh,next:empty,recovering:true}),/rows_mismatch/);
  assert.deepEqual(collision.calls,[]);
});

test('paired authenticated reads require the exact mine projection with a foreign positive control',async()=>{
  const store=storage(empty.rows[table]),seen=[];
  let leak=false,coordinator=false;
  const fetchImpl=async(url,init)=>{
    assert.equal(url.origin,origin);assert.equal(url.pathname,'/api/affairs-data');assert.equal(init.method,'GET');
    assert.equal(url.search,'?scope=counseling-appointments&view=mine');
    const role=init.headers.Authorization==='Bearer '+users[0].token?'A':'B';seen.push(role);
    const {expected}=counselingAppointmentFixtureReadContract(empty,{role});
    return Response.json({...expected,available:false,canCoordinate:coordinator,
      rows:leak?[...expected.rows,{contact_email:'PRIVATE EXCLUDED'}]:expected.rows});
  };
  const args={origin,users,sql:store.sql,fetchImpl,readResponse:response=>response.json(),knownIds:empty.recordIds};
  const proof=await observeCounselingFixture(empty,args);
  assert.deepEqual(proof.counts,[0,1]);assert.deepEqual(seen,['A','B']);
  leak=true;
  await assert.rejects(observeCounselingFixture(empty,args),/readback_mismatch/);
  leak=false;coordinator=true;
  await assert.rejects(observeCounselingFixture(empty,args),/coordinator access/);
});

test('request scope binds the follow-up and drops excluded fields before reporting',async()=>{
  const testCase=counselingHostedCases().find(row=>row.id.endsWith('history-followup'));
  let privateField=false;
  const correlationId=randomUUID(),correlationIds=new Set();
  const progress=[['account-read:counselingAppointments:1','running'],['account-read:counselingAppointments:1','complete'],
    ['verification-1','running'],['verification-1','complete']];
  const fetchImpl=async(url,init)=>{
    assert.equal(url.href,origin+'/api/affairs-assistant');assert.equal(init.method,'POST');
    assert.deepEqual(JSON.parse(init.body),{question:testCase.question,history:testCase.history,route:'/',stream:true,consentedResearchUse:false});
    const reply={answer:'checked',status:'answered',verification:{status:'verified',attempts:1},...(privateField?{contact_email:'excluded'}:{})};
    const event=(kind,payload)=>'event: '+kind+'\ndata: '+JSON.stringify(payload)+'\n\n';
    return new Response(progress.map(([kind,status])=>event('progress',{kind,status})).join('')+event('result',reply),
      {headers:{'Content-Type':'text/event-stream','X-Assistant-Request-Id':correlationId}});
  };
  const args={testCase,origin,token:users[0].token,fetchImpl,privateMarkers:users.map(row=>row.token),correlationIds};
  const result=await requestCounselingHostedCase(args);assert.equal(result.correlationId,correlationId);
  assert.match(result.requestSha256,/^[a-f0-9]{64}$/u);
  await assert.rejects(requestCounselingHostedCase(args),/distinct/);
  correlationIds.clear();privateField=true;
  await assert.rejects(requestCounselingHostedCase(args),/excluded private fields/);
  const proof={counts:[3,1],rowsDigest:'a'.repeat(64)};
  assert.equal(gradeHostedCounseling(testCase,result.envelope,proof,proof).failures.includes('counseling.request_activity'),false);
  assert.equal(gradeHostedCounseling(testCase,result.envelope,proof,proof).failures.includes('action.ownedRecordsUnchanged'),false);
  const claimedProof={...result.envelope,fixtureReadback:{verified:true,independentGolden:true}};
  for(const [before,after] of [
    [proof,{...proof,rowsDigest:'b'.repeat(64)}],
    [{...proof,counts:[3,0]},{...proof,counts:[3,0]}],
    [{...proof,rowsDigest:'invalid'},{...proof,rowsDigest:'invalid'}],
    [undefined,undefined],
  ]){
    const failures=gradeHostedCounseling(testCase,claimedProof,before,after).failures;
    assert.ok(failures.includes('action.ownedRecordsUnchanged'));
    assert.ok(failures.includes('counseling.readback'));
  }
  assert.ok(gradeHostedCounseling(testCase,{...result.envelope,events:[]},proof,{...proof,rowsDigest:'b'.repeat(64)}).failures.includes('counseling.readback'));
  assert.ok(gradeHostedCounseling(testCase,{...result.envelope,events:[]},proof,proof).failures.includes('counseling.request_activity'));
});

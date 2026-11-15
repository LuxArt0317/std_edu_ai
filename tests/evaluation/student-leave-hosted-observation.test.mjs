import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {answerAccountWithVerification} from '../../server/answerVerificationAccount.js';
import {createStudentLeaveBoundaryProbe,createStudentLeaveProbe,leaveObservationHeader,openStudentLeaveObservation,studentLeaveRowsDigest,verifyStudentLeaveObservation} from '../../server/studentLeaveObservation.js';
import {requestObservedStudentLeave,studentLeaveHostedBoundaryCaseIds,studentLeaveHostedSelection} from './student-leave-hosted-observation.mjs';
import {bindStudentLeaveFixtureCase,buildStudentLeaveFixturePlan,leaveFixtureProject,leaveFixtureTables} from './student-leave-fixture-plan.mjs';
import {runStudentLeaveHostedEvaluation} from './live-fixtures.mjs';
import {expectedAttempt} from './student-leave-offline-adapter.mjs';

const origin='https://stdedu-1234abcde-v1-d286.vercel.app',sourceRevision='a'.repeat(40);
const prefix='account:student-leave-native-';

test('hosted admission selects eighteen native read cases and excludes other targets and unavailable oracles',async()=>{
  const selected=studentLeaveHostedSelection();
  assert.equal(selected.length,18);
  assert.deepEqual([...new Set(selected.map(row=>row.family))].sort(),['archive','ordinary','prior-date','sibling']);
  assert.equal(studentLeaveHostedBoundaryCaseIds().length,14);
  assert.ok(studentLeaveHostedSelection(studentLeaveHostedBoundaryCaseIds()).every(row=>row.family==='ordinary'));
  assert.throws(()=>studentLeaveHostedSelection([prefix+'dates',prefix+'write']),/Invalid Student Leave/);
  assert.throws(()=>studentLeaveHostedSelection([prefix+'write',prefix+'dates']),/Invalid Student Leave/);
  assert.throws(()=>studentLeaveHostedSelection([prefix+'read-unavailable']),/Invalid Student Leave/);
  assert.throws(()=>studentLeaveHostedSelection([prefix+'companion']),/Invalid Student Leave/);
  assert.throws(()=>studentLeaveHostedSelection(['account:leave-history']),/Invalid Student Leave/);
  assert.throws(()=>studentLeaveHostedSelection([prefix+'taipei-today']),/Invalid Student Leave/);
  assert.throws(()=>studentLeaveHostedSelection([prefix+'dates',prefix+'dates']),/Invalid Student Leave/);
  await assert.rejects(runStudentLeaveHostedEvaluation({origin:'https://stu.best',sourceRevision}),{code:'fixture-config'});
});

test('all eighteen frozen hosted oracles pass the real deterministic handler and signed proof with zero provider calls',async t=>{
  const runId=randomUUID(),ownerId=randomUUID(),key='OFFLINE_LEAVE_OBSERVATION_KEY_'+randomUUID(),token='OFFLINE_FIXTURE_OWNER_TOKEN';
  const env={VERCEL_ENV:'preview',VERCEL_URL:new URL(origin).hostname,VERCEL_GIT_COMMIT_SHA:sourceRevision,
    SUPABASE_SERVICE_ROLE_KEY:key,OPENAI_API_KEY:'OFFLINE_PROVIDER_TEST_KEY'};
  for(const [name,value] of Object.entries(env)){
    const original=process.env[name];
    process.env[name]=value;
    t.after(()=>{if(original===undefined)delete process.env[name];else process.env[name]=original;});
  }
  const binding={runId,projectRef:leaveFixtureProject,origin,sourceRevision,suiteHash:'c'.repeat(64),
    owners:{A:{id:ownerId,email:'evaluation.student@example.invalid',runMarker:runId},
      B:{id:randomUUID(),email:'evaluation.school@example.invalid',runMarker:runId}}};
  const base='https://'+binding.projectRef+'.supabase.co';
  let modelReceipt=false,providerCalls=0;
  const handler=createAffairsAssistantHandler({
    verifyToken:async returned=>{
      assert.equal(returned,token);
      return {url:base,key:'OFFLINE_PUBLIC',token,user:{id:ownerId,email:binding.owners.A.email,user_metadata:{assistant_evaluation_run:runId}}};
    },
    loadSnapshot:async()=>assert.fail('Broad snapshot was entered'),
    publicResearch:async()=>assert.fail('Public research was entered'),
    answerAccount:options=>answerAccountWithVerification(modelReceipt
      ?{...options,leavePlan:{...options.leavePlan,deterministicRead:false}}:options),
  });
  const originalFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=originalFetch;});
  const unexpected=[];
  let plan,reads,readIndex;
  globalThis.fetch=async (input,init)=>{
    try{
      const url=new URL(input);
      if(modelReceipt&&url.href==='https://api.openai.com/v1/responses'){
        providerCalls++;
        assert.equal(JSON.parse(init.body).text.format.name,'answer_evidence_review');
        const review={supported:true,answersQuestion:true,claims:[{claim:'Saved leave dates',supported:true,
          evidenceId:'account:leaveRecords',jsonPaths:['/records/0/startsOn','/records/0/endsOn'],quotes:[]}]};
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]});
      }
      assert.equal(url.origin,base,'No provider, public lookup or external service should be called');
      const read=reads[readIndex++];
      assert.equal(url.href,read.url);
      assert.equal(init.method,'GET');
      assert.equal(init.headers.Authorization,'Bearer '+token);
      assert.equal(url.searchParams.get('user_id'),'eq.'+ownerId);
      const table=url.pathname.split('/').at(-1);
      assert.ok(Object.values(leaveFixtureTables).includes(table));
      const selected=url.searchParams.get('select').split(',');
      let rows=plan.rows[table].filter(row=>row.user_id===ownerId);
      const id=url.searchParams.get('id');
      if(id?.startsWith('eq.'))rows=rows.filter(row=>row.id===id.slice(3));
      else if(id?.startsWith('in.('))rows=rows.filter(row=>id.slice(4,-1).split(',').includes(row.id));
      if(table===leaveFixtureTables.forms){
        const date=url.searchParams.get('and')?.match(/starts_on\.lt\.(\d{4}-\d{2}-\d{2})/u)?.[1];
        const from=url.searchParams.get('and')?.match(/ends_on\.gte\.(\d{4}-\d{2}-\d{2})/u)?.[1];
        const through=url.searchParams.get('and')?.match(/starts_on\.lte\.(\d{4}-\d{2}-\d{2})/u)?.[1];
        rows=rows.filter(row=>(!date||row.starts_on<date)&&(!from||row.ends_on>=from)&&(!through||row.starts_on<=through))
          .sort((a,b)=>b.starts_on.localeCompare(a.starts_on)||a.id.localeCompare(b.id));
      }else rows.sort((a,b)=>a.id.localeCompare(b.id));
      const projected=rows.slice(0,Number(url.searchParams.get('limit')))
        .map(row=>Object.fromEntries(selected.map(field=>[field,row[field]])));
      assert.equal(studentLeaveRowsDigest(projected),read.rowsDigest);
      return Response.json(projected,{headers:{'content-range':read.contentRange},status:read.statusCode});
    }catch(error){unexpected.push(error);throw error;}
  };
  const seenCorrelations=new Set();
  const endpoint=({stripReceipt=false,changeAnswer=false}={})=>async(url,init)=>{
    assert.equal(url,origin+'/api/affairs-assistant');
    const headers=new Headers(),result={};
    const response={setHeader(name,value){headers.set(name,value);},status(status){result.status=status;return response;},json(body){result.body=body;}};
    await handler({method:init.method,headers:{authorization:init.headers.Authorization,host:new URL(url).hostname},body:init.body},response);
    if(stripReceipt)headers.delete(leaveObservationHeader);
    if(changeAnswer)result.body.answer='A different answer from the verified response.';
    return Response.json(result.body,{status:result.status,headers});
  };
  const run=({testCase,family},endpointOptions)=>{
    plan=buildStudentLeaveFixturePlan({binding,family});
    reads=expectedAttempt(plan,bindStudentLeaveFixtureCase(plan,testCase),studentLeaveRowsDigest).reads;
    readIndex=0;
    return requestObservedStudentLeave({plan,testCase,key,token,seenCorrelations,fetchImpl:endpoint(endpointOptions)});
  };
  for(const selection of studentLeaveHostedSelection()){
    const verified=await run(selection);
    assert.deepEqual(unexpected,[]);
    assert.equal(verified.passed,true,JSON.stringify({caseId:verified.caseId,failures:verified.failures}));
    assert.equal(verified.observed,true);
    assert.equal(verified.attempts,1);
    assert.equal(verified.reads,reads.length);
    assert.equal(readIndex,reads.length);
    assert.equal(verified.completedModelCalls,0);
    assert.equal(verified.completedReview,false);
    assert.equal(verified.completedNativeCheck,true);
    assert.equal(verified.execution,'live-native');
    assert.match(verified.receiptDigest,/^[a-f0-9]{64}$/u);
    assert.doesNotMatch(JSON.stringify(verified),/OFFLINE|example\.invalid|2026-11-09|2026-11-10/u);
  }
  for(const failure of [{stripReceipt:true},{changeAnswer:true}]){
    const proof=await run(studentLeaveHostedSelection([prefix+'dates'])[0],failure);
    assert.equal(proof.passed,false);
    assert.equal(proof.observed,false);
    assert.deepEqual(proof.failures,['observation.missing_or_invalid']);
  }
  assert.equal(providerCalls,0);
  modelReceipt=true;
  const previous=await run(studentLeaveHostedSelection([prefix+'dates'])[0]);
  assert.deepEqual(unexpected,[]);
  assert.equal(previous.observed,true);
  assert.equal(previous.execution,'live-model');
  assert.equal(previous.completedNativeCheck,false);
  assert.equal(previous.completedReview,true);
  assert.equal(providerCalls,1);
  assert.deepEqual(previous.failures,['observation.native_check_not_completed']);
  assert.equal(previous.passed,false);
});

test('all fourteen frozen boundaries attest an exact disposition without private reads or a provider call',async t=>{
  const runId=randomUUID(),id=randomUUID(),key='OFFLINE_LEAVE_BOUNDARY_KEY_'+randomUUID();
  const token='OFFLINE_BOUNDARY_TOKEN',email='evaluation.student@example.invalid';
  const identity={id,email,runMarker:runId};
  const env={VERCEL_ENV:'preview',VERCEL_URL:new URL(origin).hostname,VERCEL_GIT_COMMIT_SHA:sourceRevision,SUPABASE_SERVICE_ROLE_KEY:key};
  for(const [name,value] of Object.entries(env)){
    const original=process.env[name];
    process.env[name]=value;
    t.after(()=>{if(original===undefined)delete process.env[name];else process.env[name]=original;});
  }
  const fixtureBinding={runId,projectRef:leaveFixtureProject,origin,sourceRevision,suiteHash:'c'.repeat(64),
    owners:{A:{id,email,runMarker:runId},B:{id:randomUUID(),email:'evaluation.school@example.invalid',runMarker:runId}}};
  const plan=buildStudentLeaveFixturePlan({binding:fixtureBinding,family:'ordinary'});
  const seenCorrelations=new Set();
  let privateCalls=0;
  const unexpected=async()=>{privateCalls++;assert.fail('A zero-read branch attempted a private or provider request');};
  t.mock.method(globalThis,'fetch',unexpected);
  const handler=createAffairsAssistantHandler({
    verifyToken:async supplied=>{
      assert.equal(supplied,token);
      return {url:'https://'+leaveFixtureProject+'.supabase.co',key:'OFFLINE_PUBLIC',token,
        user:{id,email,user_metadata:{assistant_evaluation_run:runId}}};
    },
    loadSnapshot:unexpected,publicResearch:unexpected,answerAccount:unexpected,readers:{leaveRecords:unexpected},
  });
  const realEndpoint=async(url,init)=>{
    assert.equal(url,origin+'/api/affairs-assistant');
    const headers=new Headers(),result={};
    const response={setHeader(name,value){headers.set(name,value);},status(status){result.status=status;return response;},json(body){result.body=body;}};
    await handler({method:init.method,headers:{authorization:init.headers.Authorization,host:new URL(url).hostname},body:init.body},response);
    return Response.json(result.body,{status:result.status,headers});
  };
  const inputs={plan,key,token,seenCorrelations};
  const selections=studentLeaveHostedSelection(studentLeaveHostedBoundaryCaseIds());
  for(const {testCase} of selections){
    const proof=await requestObservedStudentLeave({...inputs,testCase,fetchImpl:realEndpoint});
    assert.equal(proof.passed,true,JSON.stringify({caseId:proof.caseId,failures:proof.failures}));
    assert.equal(proof.completedBoundaryCheck,true);
    assert.equal(proof.completedNativeCheck,false);
    assert.equal(proof.attempts,0);
    assert.equal(proof.reads,0);
    assert.equal(proof.completedModelCalls,0);
  }
  assert.equal(seenCorrelations.size,14);
  const {testCase}=selections.find(row=>row.testCase.id===prefix+'write');
  const request={question:testCase.question,route:bindStudentLeaveFixtureCase(plan,testCase).route,history:[],stream:false,consentedResearchUse:false};
  const scope={ownerId:id,runId,origin,sourceRevision,nonce:randomUUID()};
  const call=body=>realEndpoint(origin+'/api/affairs-assistant',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)});
  const boundaryProbe=createStudentLeaveBoundaryProbe(scope,request,key);
  const ordinary=await call(request);
  assert.equal(ordinary.headers.get(leaveObservationHeader),null);
  const readProbe=createStudentLeaveProbe(scope,request,key);
  assert.equal((await call(readProbe.body)).status,404);
  const wrongPurpose=createStudentLeaveBoundaryProbe(scope,{...request,question:'Show my leave dates.'},key);
  assert.equal((await call(wrongPurpose.body)).status,404);
  assert.equal((await call({...boundaryProbe.body,question:'Show my leave dates.'})).status,404);
  const signed=await call(boundaryProbe.body);
  assert.equal(signed.status,200);
  const payload=await signed.json(),correlationId=signed.headers.get('x-assistant-request-id');
  assert.deepEqual(payload,await ordinary.json());
  const receipt=signed.headers.get(leaveObservationHeader);
  assert.equal(verifyStudentLeaveObservation({receipt,binding:readProbe.binding,correlationId,body:payload},key),null);
  assert.equal(verifyStudentLeaveObservation({receipt,binding:boundaryProbe.binding,correlationId,body:{...payload,answer:'Tampered reply'}},key),null);

  const polluted=openStudentLeaveObservation({body:boundaryProbe.body,identity,correlationId},env);
  await assert.rejects(polluted.observe(unexpected),/cannot read records/u);
  assert.equal(polluted.finishBoundary(payload,'unsupported_operation'),null);
  const fabricated=await requestObservedStudentLeave({...inputs,testCase,
    async fetchImpl(_url,init){
      const freshCorrelation=randomUUID();
      const collector=openStudentLeaveObservation({body:JSON.parse(init.body),identity,correlationId:freshCorrelation},env);
      return Response.json(payload,{headers:{'X-Assistant-Request-Id':freshCorrelation,
        [leaveObservationHeader]:collector.finishBoundary(payload,'navigation')}});
    }});
  assert.equal(fabricated.passed,false);
  assert.deepEqual(fabricated.failures,['observation.boundary_disposition_mismatch']);
  assert.equal(privateCalls,0);
});

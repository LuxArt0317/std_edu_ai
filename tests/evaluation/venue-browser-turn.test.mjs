import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {venueBrowserObservationEvent,venueObservationHeader} from '../../server/venueObservation.js';
import {discoverClientDispatchSurfaces} from './client-dispatch-inventory.mjs';
import {bindVenueBrowserCase,createProtectedVenueBrowserTurn,venueBrowserCases} from './venue-browser-turn.mjs';
import {buildVenueProtectedPlan} from './venue-protected-fixture.mjs';

const origin='https://stdedu-abcdef123-v1-d286.vercel.app', sourceRevision='a'.repeat(40);
const dbOrigin='https://xiftudmvxphxcjtmfmib.supabase.co';
const key='synthetic-venue-browser-observation-key-test-only';
const runId=randomUUID();
const owners={
  A:{id:randomUUID(),email:'evaluation.student@example.invalid',runMarker:runId},
  B:{id:randomUUID(),email:'evaluation.other.'+runId+'@example.invalid',runMarker:runId},
};

test('the three frozen venue browser turns require an exact signed user, selected read and real streamed receipt',async t=>{
  const {questions}=await discoverClientDispatchSurfaces();
  for(const testCase of venueBrowserCases){
    const frozen=questions.find(row=>row.id===testCase.id);
    assert.deepEqual([testCase.question,testCase.route,testCase.mode],[frozen.question,frozen.route,frozen.mode]);
  }
  const configured={VERCEL_ENV:'preview',VERCEL_URL:new URL(origin).host,VERCEL_GIT_COMMIT_SHA:sourceRevision,SUPABASE_SERVICE_ROLE_KEY:key};
  const previous=Object.fromEntries(Object.keys(configured).map(name=>[name,process.env[name]]));
  Object.assign(process.env,configured);
  t.after(()=>{for(const [name,value] of Object.entries(previous))if(value===undefined)delete process.env[name];else process.env[name]=value;});
  let plan,reads=0;
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    assert.equal(url.origin,dbOrigin);
    assert.equal(url.pathname,'/rest/v1/affairs_venue_requests');
    assert.equal(init.method,'GET');
    assert.equal(new Headers(init.headers).get('prefer'),'count=exact');
    const owner=new Headers(init.headers).get('authorization').slice('Bearer '.length);
    assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
    const columns=url.searchParams.get('select').split(',');
    const rows=plan.rows.filter(row=>row.user_id===owner).map(row=>Object.fromEntries(columns.map(name=>[name,row[name]])));
    reads++;
    return Response.json(rows,{headers:{'content-range':rows.length?'0-0/1':'*/0'}});
  });
  const unexpected=()=>assert.fail('No model or broad private record call');
  const handler=createAffairsAssistantHandler({
    verifyToken:async token=>{
      const owner=Object.values(owners).find(row=>row.id===token);
      assert.ok(owner);
      return {user:{id:owner.id,email:owner.email,user_metadata:{assistant_evaluation_run:runId}},token,key:'fixture-key',url:dbOrigin};
    },loadSnapshot:unexpected,answerAccount:unexpected,publicResearch:unexpected,
  });
  async function invoke(body,ownerId){
    const headers=new Headers(),packets=[];
    let flushed=false,result,code=0;
    const response={
      setHeader(name,value){assert.equal(flushed,false);headers.set(name,String(value));},
      status(status){code=status;return this;},json(value){result=value;},
      flushHeaders(){flushed=true;},write(packet){assert.equal(flushed,true);packets.push(packet);},end(){},
    };
    await handler({method:'POST',body,headers:{host:new URL(origin).host,authorization:'Bearer '+ownerId}},response);
    return {code,headers,result,bytes:Buffer.from(packets.join(''))};
  }

  for(const testCase of venueBrowserCases){
    plan=buildVenueProtectedPlan(runId,owners,{emptyB:testCase.mode==='empty'});
    const callers=['A','B'].map(role=>({role,count:plan.rows.filter(row=>row.user_id===owners[role].id).length,
      crossedVisible:0,managementDenied:true}));
    const bound=bindVenueBrowserCase(plan,callers,testCase.id);
    const turn=createProtectedVenueBrowserTurn({bound,origin,sourceRevision,runId,key});
    const {ownerId}=bound,frameUrl=origin+testCase.route;
    const payload={question:testCase.question,route:testCase.route,history:[],images:[],stream:true};
    assert.throws(()=>turn.request({payload:{...payload,images:[{name:'blocked'}]},frameUrl,ownerId}),/unreserved assistant turn/u);
    const request=turn.request({payload,frameUrl,ownerId});
    const other=Object.values(owners).find(owner=>owner.id!==ownerId).id;
    assert.equal((await invoke(request,other)).code,404);
    const response=await invoke(request,ownerId),correlationId=response.headers.get('x-assistant-request-id');
    assert.equal(response.code,200);
    assert.equal(response.headers.has(venueObservationHeader),false);
    assert.match(response.bytes.toString('utf8'),new RegExp(venueBrowserObservationEvent,'u'));
    assert.throws(()=>turn.receive({bytes:response.bytes,correlationId:randomUUID()}),/save answer mismatch/u);
    const observed=turn.receive({bytes:response.bytes,correlationId});
    assert.match(observed.proofDigest,/^[a-f0-9]{64}$/u);
    assert.doesNotMatch(observed.body.toString('utf8'),new RegExp(venueBrowserObservationEvent,'u'));
    const withoutReceipt=createProtectedVenueBrowserTurn({bound,origin,sourceRevision,runId,key});
    withoutReceipt.request({payload,frameUrl,ownerId});
    assert.throws(()=>withoutReceipt.receive({bytes:observed.body,correlationId}),/invalid assistant stream result/u);
  }
  assert.equal(reads,2);
});

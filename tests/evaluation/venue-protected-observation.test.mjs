import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {createVenueProbe,verifyVenueObservation,venueObservationHeader} from '../../server/venueObservation.js';
import {buildVenueProtectedPlan,venueProtectedCases} from './venue-protected-fixture.mjs';
import {hasVenueProtectedProof,requestVenueProtectedCase} from './venue-protected-preview.mjs';

const origin='https://stdedu-abcdef123-v1-d286.vercel.app',sourceRevision='a'.repeat(40);
const host=new URL(origin).host;
const key='synthetic-test-key-venue-signed-attempt-only';
const source='https://xiftudmvxphxcjtmfmib.supabase.co';
const runId=randomUUID();
const users=['A','B'].map(role=>({role,id:randomUUID(),email:role==='A'?'evaluation.student@example.invalid':
  'evaluation.other.'+runId+'@example.invalid',runMarker:runId,token:randomUUID()}));
const plan=buildVenueProtectedPlan(runId,Object.fromEntries(users.map(({id,email,runMarker,role})=>[role,{id,email,runMarker}])));
const cohort=venueProtectedCases();
const fields=['id','user_id','venue','booking_date','period','status','created_at'];
const sink=()=>({code:200,body:null,headers:new Headers(),setHeader(name,value){this.headers.set(name,String(value));},
  status(code){this.code=code;return this;},json(value){this.body=value;}});

test('the protected Venue evaluator binds all case reads to the actual assistant response, rejects tampering and never searches publicly',async t=>{
  const changes={VERCEL_ENV:'preview',VERCEL_URL:host,VERCEL_GIT_COMMIT_SHA:sourceRevision,SUPABASE_SERVICE_ROLE_KEY:key};
  const old=Object.keys(changes).map(name=>[name,process.env[name]]);
  Object.assign(process.env,changes);
  t.after(()=>old.forEach(([name,value])=>{if(value===undefined)delete process.env[name];else process.env[name]=value;}));
  const ask=createAffairsAssistantHandler({verifyToken:async token=>{
    const user=users.find(row=>row.token===token);
    if(!user)throw Error('Invalid synthetic token');
    return {user:{id:user.id,email:user.email,user_metadata:{assistant_evaluation_run:runId}},token,key:'fixture-publishable',url:source};
  },loadSnapshot:async()=>assert.fail('No unscoped account load'),publicResearch:async()=>assert.fail('No public search'),
  answerAccount:async()=>assert.fail('No provider model')});
  const guest=createResearchAssistantHandler();
  let readCount=0,failRead=false;
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    assert.equal(url.origin,source);
    assert.equal(url.pathname,'/rest/v1/affairs_venue_requests');
    assert.equal(init.method,'GET');
    assert.equal(new Headers(init.headers).get('prefer'),'count=exact');
    readCount++;
    if(failRead)return Response.json({error:'offline control'},{status:503});
    const owner=users.find(row=>'Bearer '+row.token===new Headers(init.headers).get('authorization'));
    assert.ok(owner);
    assert.equal(url.searchParams.get('user_id'),'eq.'+owner.id);
    const rows=plan.rows.filter(row=>row.user_id===owner.id&&
      [['id','id'],['venue','venue'],['status','status']].every(([field,property])=>!url.searchParams.has(field)
        ||url.searchParams.get(field)==='eq.'+row[property]))
      .map(row=>Object.fromEntries(fields.map(field=>[field,row[field]])));
    return Response.json(rows,{headers:{'content-range':rows.length?'0-0/1':'*/0'}});
  });
  const invoke=async(url,init,requestHost=host)=>{
    const headers={host:requestHost,...Object.fromEntries(new Headers(init.headers))},out=sink();
    await (url.pathname==='/api/affairs-assistant'?ask:guest)({method:'POST',headers,body:init.body},out);
    return Response.json(out.body,{status:out.code,headers:out.headers});
  };
  const correlations=new Set();
  const privateMarkers=[runId,...users.flatMap(user=>[user.id,user.email,user.token]),
    ...plan.rows.flatMap(row=>[row.id,row.purpose,row.review_note])];
  const results=[],readback={rowsDigest:'a'.repeat(64),callers:users.map(({role})=>({
    role,count:1,crossedVisible:0,managementDenied:true,projectionDigest:'b'.repeat(64),
  }))};
  for(const boundCase of cohort){
    const token=users.find(user=>user.role===boundCase.role)?.token;
    const result=await requestVenueProtectedCase({boundCase,plan,origin,sourceRevision,key,token,fetchImpl:invoke,
      readResponse:async(response)=>response.json(),correlations,privateMarkers});
    assert.deepEqual(result.failures,[],boundCase.testCase.id);
    assert.equal(result.completedNativeCheck,Boolean(boundCase.scope));
    results.push({...result,requestIndex:results.length+1,before:readback,after:readback});
  }
  assert.equal(readCount,4);
  assert.equal(correlations.size,6);
  assert.equal(hasVenueProtectedProof(results),true);
  for(const change of [
    rows=>{rows[1].correlationId=rows[0].correlationId;},
    rows=>{rows[3].readDigest=null;},
    rows=>{rows[6].observed=true;},
    rows=>{rows[0].after={...rows[0].after,rowsDigest:'c'.repeat(64)};},
    rows=>{rows[4].after={...rows[4].after,callers:[...rows[4].after.callers,{role:'C'}]};},
  ]){
    const tampered=structuredClone(results);
    change(tampered);
    assert.equal(hasVenueProtectedProof(tampered),false);
  }

  const endpoint=new URL('/api/affairs-assistant',origin);
  const normal={question:cohort[0].testCase.question,route:cohort[0].testCase.route,history:[],stream:false,consentedResearchUse:false};
  const scope={ownerId:users[0].id,runId,origin,sourceRevision,nonce:randomUUID()};
  const probe=createVenueProbe(scope,normal,key);
  const send=(body,token=users[0].token,requestHost=host)=>invoke(endpoint,{body:JSON.stringify(body),headers:{Authorization:'Bearer '+token}},requestHost);
  for(const response of await Promise.all([
    send({...probe.body,question:normal.question+' Changed.'}),send(probe.body,users[1].token),send(probe.body,users[0].token,'wrong-preview.invalid'),
    send({...probe.body,evaluationLeaveProbe:'duplicate'}),send(createVenueProbe(scope,normal,key,Date.now()-180000).body),
    send(createVenueProbe({...scope,sourceRevision:'b'.repeat(40)},normal,key).body),
    send(createVenueProbe(scope,{...normal,question:'Show my venue requests and my tuition balance.'},key).body),
  ])){
    assert.equal(response.status,404);
    assert.equal(response.headers.get(venueObservationHeader),null);
  }
  assert.equal(readCount,4);

  const ok=await send(probe.body),body=await ok.json();
  const header={binding:probe.binding,receipt:ok.headers.get(venueObservationHeader),correlationId:ok.headers.get('X-Assistant-Request-Id')};
  assert.ok(verifyVenueObservation({...header,body},key));
  assert.equal(verifyVenueObservation({...header,body:{...body,answer:'changed'}},key),null);
  assert.equal(verifyVenueObservation({...header,body,correlationId:randomUUID()},key),null);
  assert.equal(verifyVenueObservation({...header,body},key+'wrong'),null);

  failRead=true;
  const unavailable=await send(createVenueProbe({...scope,nonce:randomUUID()},normal,key).body);
  assert.equal((await unavailable.json()).verification.status,'unverified');
  assert.equal(unavailable.headers.get(venueObservationHeader),null);
  failRead=false;
  process.env.VERCEL_ENV='production';
  assert.equal((await send(probe.body)).status,404);
  const ordinary=await send(normal);
  assert.equal((await ordinary.json()).verification.status,'verified');
  assert.equal(ordinary.headers.get(venueObservationHeader),null);
});

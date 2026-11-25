import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import test from 'node:test';
import {counselingAppointmentsPath as route} from '../../server/counselingContract.js';
import {buildCounselingAppointmentFixturePlan,counselingAppointmentCancellationTarget} from './counseling-appointment-fixture-plan.mjs';
import {assertCounselingCancellationCommand,cleanupCounselingCancellation,observeCounselingFixture} from './counseling-appointment-hosted.mjs';
import {counselingCancellationCaseIds,hasCounselingCancellationProof,requestCounselingCancellation,verifyCounselingCancellation} from './counseling-cancellation-preview.mjs';
import {runCounselingCancellationPreview} from './live-fixtures.mjs';
import {packetVerdict} from './run-health-counseling-preview.mjs';

const runId=randomUUID(),origin='https://stdedu-bcdefa123-v1-d286.vercel.app',sourceRevision='a'.repeat(40);
const owners=Object.fromEntries(['A','B'].map(role=>[role,{id:randomUUID(),email:role.toLowerCase()+'@example.invalid',runMarker:runId}]));
const users=Object.values(owners).map(owner=>({id:owner.id,token:'synthetic.'+owner.id+'.signature'}));
const plan=buildCounselingAppointmentFixturePlan({runId,owners,fixtureKey:'scheduled:counselingAppointments'});
const target=counselingAppointmentCancellationTarget(plan);
const command={request_id:randomUUID(),id:target.id,expected_version:target.version};
const receipt={id:target.id,status:'cancelled',version:target.version+1};
const updatedAt='2026-11-30T04:22:29.304224Z';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const readResponse=async(response,_url,_limit,status=200)=>{assert.equal(response.status,status);return response.json();};
const originalRows=()=>structuredClone(plan.rows[plan.table]);

function store(){
  const deletes=[];
  let rows=originalRows(),operation=[],coordinators=[];
  const sql=(parts,...values)=>{
    if(!Array.isArray(parts)||!Object.hasOwn(parts,'raw'))return parts;
    const text=parts.join('$').replace(/\s+/gu,' ').trim();
    if(text.includes('from auth.users'))return structuredClone(Object.values(owners));
    if(text.startsWith('select pg_advisory_xact_lock'))return [];
    if(text.startsWith('select id,user_id,kind'))return structuredClone(rows.filter(row=>values[0].includes(row.user_id)||values[1].includes(row.id)).sort((a,b)=>a.id.localeCompare(b.id)));
    if(text.startsWith('select user_id from private.affairs_counseling_coordinators'))return [...coordinators,...(text.includes('union all')?operation:[])];
    if(text.startsWith('select actor,request_id'))return structuredClone(operation);
    if(text.startsWith('delete from private.affairs_counseling_operations')){
      const [actor,requestId]=values;assert.equal(actor,owners.A.id);assert.equal(requestId,command.request_id);
      deletes.push(requestId);
      const removed=operation.filter(row=>row.actor===actor&&row.request_id===requestId);
      operation=operation.filter(row=>!removed.includes(row));
      return removed.map(row=>({request_id:row.request_id}));
    }
    if(text.startsWith('delete from public.affairs_counseling_appointments')){
      const [id,userId]=values;
      assert.ok(plan.rows[plan.table].some(row=>row.id===id&&row.user_id===userId));
      deletes.push(id);
      const removed=rows.filter(row=>row.id===id&&row.user_id===userId);
      rows=rows.filter(row=>!removed.includes(row));return removed.map(row=>({id:row.id}));
    }
    assert.fail(text);
  };
  const readPair=async(url,{headers})=>{
    assert.equal(url.href,origin+'/api/affairs-data?scope=counseling-appointments&view=mine');
    const caller=users.find(user=>headers.Authorization==='Bearer '+user.token);
    assert.ok(caller);
    return Response.json({userId:caller.id,canCoordinate:false,available:false,
      rows:rows.filter(row=>row.user_id===caller.id).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)||a.id.localeCompare(b.id))
        .map(({user_id,consent_version,consent_at,...row})=>row)});
  };
  const cancel=()=>{
    Object.assign(rows.find(row=>row.id===target.id),{status:'cancelled',version:receipt.version,updated_at:updatedAt});
    operation=[{actor:owners.A.id,request_id:command.request_id,operation:'cancel',receipt,matches:true,created_at:updatedAt}];
  };
  return {sql,deletes,readPair,cancel,rows:()=>rows,operation:()=>operation,coordinators:()=>coordinators};
}

const marker=[...plan.recordIds,...Object.values(owners).flatMap(owner=>[owner.id,owner.email]),...users.map(user=>user.token)];
function replyStream(body,activity=[]){
  const sse=(name,value)=>'event: '+name+'\ndata: '+JSON.stringify(value)+'\n\n';
  return new Response(activity.map(event=>sse('progress',event)).join('')+sse('result',body),{
    headers:{'Content-Type':'text/event-stream; charset=utf-8','X-Assistant-Request-Id':randomUUID()},
  });
}
const proposal={kind:'counseling_cancel',label:'Cancel Counseling · Scheduled date 2026-11-27 · Scheduled',
  payload:{id:target.id,expected_version:String(target.version)},requestId:command.request_id,url:route};

test('all nine cases require exact paired snapshots, native command replay and one coherent receipt chain',async()=>{
  const state=store(),delivered=[];
  const correlationIds=new Set();
  let marked=false,confirmed=false;
  const results=await verifyCounselingCancellation({
    plan,
    markCancellation:value=>{assert.deepEqual(value,command);assert.equal(state.operation().length,0);marked=true;},
    observe:expectedState=>observeCounselingFixture(plan,{sql:state.sql,users,origin,fetchImpl:state.readPair,readResponse,
      knownIds:plan.recordIds,expectedState,command:marked?command:undefined}),
    request:async input=>{
      const {actor}=input,user=actor==='guest'?null:users[actor==='A'?0:1];
      const result=await requestCounselingCancellation({origin,command:input,token:user?.token,readResponse,
        privateMarkers:marker,correlationIds,
        previewFetch:async(url,init)=>{
          assert.equal(url.pathname,user?'/api/affairs-assistant':'/api/research-assistant');
          assert.equal(init.headers.Authorization,user?'Bearer '+user.token:undefined);
          assert.deepEqual(JSON.parse(init.body),{route,question:input.query,stream:true,consentedResearchUse:false});
          assert.equal(state.operation().length,0);
          if(!user)return replyStream({status:'handoff',citations:[{url:'/school-affairs/login?next='+encodeURIComponent(route)}]});
          if(actor==='B')return replyStream({status:'clarification'});
          return replyStream({status:'answered',verification:{status:'verified',attempts:1},grounding:{source:'account',webSearched:false},
            proposedAction:proposal},[{kind:'account-read:counselingAppointments:1',status:'complete'}]);
        },
        actionFetch:async(url,init)=>{
          assert.equal(url.pathname,'/api/affairs-action');assert.ok(marked);
          assert.equal(init.headers.Authorization,'Bearer '+user.token);
          const sent=JSON.parse(init.body);assert.deepEqual(sent,input.action);
          const status=actor==='B'?404:sent.payload.expected_version===target.version?200:409;
          assert.equal(status,input.status);
          if(status!==200)return Response.json({error:'Unavailable'},{status});
          if(!confirmed){state.cancel();confirmed=true;}
          return Response.json(receipt);
        },
      });
      delivered.push(input.caseId);return {...result,requestIndex:delivered.length};
    },
  });
  assert.deepEqual(delivered,counselingCancellationCaseIds());
  assert.ok(hasCounselingCancellationProof(results));
  assert.equal(results[0].beforeOperationsDigest,sha([]));
  assert.equal(results.filter(row=>row.beforeDigest!==row.afterDigest).length,1);
  assert.deepEqual(state.rows().filter(row=>row.user_id===owners.B.id),originalRows().filter(row=>row.user_id===owners.B.id));
  assert.ok(marker.every(raw=>!JSON.stringify(results).includes(raw)));
  const report={origin,sourceRevision,terminal:true,liveAcceptance:true,results,
    deployment:{origin,sourceRevision,status:'finished',issued:9,completed:9},cleanup:{verified:true,counselingCancellationCleanup:true,protectedOwnerUnchanged:true}};
  assert.equal(packetVerdict('counseling-cancellation',report,origin,sourceRevision).status,'passed');
  assert.equal(packetVerdict('counseling-cancellation',{...report,cleanup:{verified:true}},origin,sourceRevision).status,'incomplete');
  const altered=structuredClone(report);
  altered.results[5].afterOperationsDigest=altered.results[5].beforeOperationsDigest;
  assert.equal(packetVerdict('counseling-cancellation',altered,origin,sourceRevision).status,'incomplete');
  await cleanupCounselingCancellation(state.sql,{plan,command,knownIds:plan.recordIds});
  assert.deepEqual(state.deletes,[command.request_id,...plan.recordIds]);
  assert.deepEqual(state.rows(),[]);assert.deepEqual(state.operation(),[]);
});

test('cleanup leaves unrelated or uncertain counseling content untouched',async()=>{
  assert.doesNotThrow(()=>assertCounselingCancellationCommand(plan,command));
  for(const bad of [{...command,id:plan.recordIds.at(-1)},{...command,request_id:runId},{...command,expected_version:1}]){
    assert.throws(()=>assertCounselingCancellationCommand(plan,bad),/outside/u);
  }
  const clean=store();
  await cleanupCounselingCancellation(clean.sql,{plan,command,knownIds:plan.recordIds});
  assert.deepEqual(clean.deletes,plan.recordIds);
  for(const change of [
    state=>{state.operation()[0].actor=owners.B.id;},
    state=>{state.operation()[0].matches=false;},
    state=>{state.operation()[0].receipt={...receipt,version:8};},
    state=>{state.rows()[0].updated_at=updatedAt.replace('304224','304223');},
    state=>{state.rows().at(-1).status='scheduled';},
    state=>{state.coordinators().push({user_id:owners.B.id});},
  ]){
    const state=store();state.cancel();change(state);
    await assert.rejects(cleanupCounselingCancellation(state.sql,{plan,command,knownIds:plan.recordIds}),/Unexpected|rows_mismatch/u);
    assert.deepEqual(state.deletes,[]);
  }
});

test('proposal payload exemption never allows another field to expose the selected appointment',async()=>{
  const input={query:'Cancel my counseling appointment with ID '+target.id+'.',proposalSelector:target.id,status:200};
  const options={origin,command:input,token:users[0].token,privateMarkers:marker,correlationIds:new Set()};
  await assert.rejects(requestCounselingCancellation({...options,previewFetch:async()=>replyStream({
    proposedAction:proposal,answer:'Selected '+target.id,
  })}),/private-field boundary/u);
  await assert.rejects(requestCounselingCancellation({...options,command:{...input,proposalSelector:undefined},
    previewFetch:async()=>replyStream({proposedAction:proposal})}),/private-field boundary/u);
  await assert.rejects(runCounselingCancellationPreview({origin:'https://stu.best',sourceRevision}),{code:'fixture-config'});
});

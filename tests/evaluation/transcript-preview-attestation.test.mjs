import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildTranscriptReplayPlan} from './transcript-replay.mjs';
import {createTranscriptLiveTransport} from './transcript-live-transport.mjs';
import {createTranscriptConversationSave} from './transcript-conversation-save.mjs';
import {boundedAssistantText,reconcileAssistantActivity} from '../../src/services/assistantActivityBudget.js';
import {verifyTranscriptTurnCommitments} from './transcript-preview-attestation.mjs';

const origin='https://std-edu-ai-attestation-v1-d286.vercel.app',sourceRevision='a'.repeat(40);
const plan=()=>buildTranscriptReplayPlan({runId:'17000000-0000-4000-8000-000000000001',sessionId:'17000000-0000-4000-8000-000000000002',
  ownerId:'17000000-0000-4000-8000-000000000003',sourceRevision,now:'2026-11-16T08:00:00.000Z'});

async function captured(){
  const packet=plan(),turns=[],requests=[];let conversation=null,current=0,messages=[];
  const transport=createTranscriptLiveTransport({origin,approvedPreviewOrigin:origin,expectedRevision:sourceRevision,fetchImpl:async(input,init)=>{
    const url=new URL(input);assert.equal(url.origin,origin);
    if(url.pathname==='/release.json')return Response.json({version:1,source:'vercel-git',environment:'preview',revision:sourceRevision,builtAt:'2026-11-15T01:00:00.000Z'});
    if(url.pathname==='/api/affairs-assistant'){
      requests.push(JSON.parse(init.body));current++;
      const activity=[{kind:'native',status:'complete',label:'Saved source',detail:'Final detail'}];
      const body={status:'answered',answer:current===1?'甲😀'.repeat(700):'Private answer '+current,activity,
        citations:[{chunkId:'account:charges',claim:'Saved record',title:'Record',sourceName:'Local',url:'/school-affairs/records',locator:null}],
        views:[{id:'saved',title:'Saved details',url:'/school-affairs/records',columns:['A','B','C','D','E','F','G','H'],rows:[['1','2','3','4','5','6','7','8']],total:1,note:'Saved only'}],
        verification:{status:'verified',attempts:2},suggestedQuestions:['Follow up']};
      const events=[{kind:'outer',status:'complete',label:'Caller scope',detail:'Own only'},{kind:'native',status:'running',label:'Saved source',detail:'Streaming detail'}];
      const wire=events.map(row=>'event: progress\ndata: '+JSON.stringify(row)+'\n\n').join('')+'event: result\ndata: '+JSON.stringify(body)+'\n\n';
      return new Response(wire,{headers:{'content-type':'text/event-stream','X-Assistant-Request-Id':'18000000-0000-4000-8000-00000000000'+current}});
    }
    assert.equal(url.pathname,'/api/affairs-conversations');
    if(init.method==='GET')return conversation?Response.json(conversation):Response.json({error:'not found'},{status:404});
    const body=JSON.parse(init.body);conversation={...body,version:body.version+1};return Response.json(conversation);
  }});
  const receipts=[],save=createTranscriptConversationSave({transport,ownerId:packet.ownerId,conversationId:packet.sessionId,title:'Reported school assistant transcript',
    journal:{pending:async entry=>receipts.push(entry),received:async()=>{}}});
  await transport.pin();
  for(const row of packet.cases){
    const testCase={...row,history:messages.slice(-6).map(({role,content})=>({role,content:boundedAssistantText(content,2000)}))};
    let pending;
    const envelope=await transport.assistant({token:'SYNTHETIC_CALLER',question:testCase.question,history:testCase.history,route:testCase.route,beforeSend:async value=>{pending=value;}});
    assert.equal(envelope.requestHash,pending.requestHash);
    const result=await save.append({token:'SYNTHETIC_CALLER',user:{id:row.turnId+':user',role:'user',content:row.question},
      assistant:{id:row.turnId+':assistant',role:'assistant',phase:'complete',content:envelope.body.answer,result:envelope.body,activity:reconcileAssistantActivity(envelope.events,envelope.body.activity)}});
    assert.equal(result.messageDigest,receipts.at(-1).messageDigest);messages=result.messages;
    turns.push({turnId:row.turnId,caseId:row.id,testCase,envelope,savedVersion:result.version,messageDigest:result.messageDigest});
  }
  await transport.finish();return {plan:packet,turns,requests};
}

test('actual transport commitments and actual save sanitizer agree for four turns, clipped history, activity and eight-column cards',async()=>{
  const value=await captured(),proof=verifyTranscriptTurnCommitments(value);
  assert.equal(proof.verified,true);assert.equal(proof.messageCount,8);assert.equal(proof.turns.length,4);
  assert.equal(proof.lastMessageDigest,value.turns[3].messageDigest);assert.equal(value.requests[1].history[1].content.length,1999);
  assert.doesNotMatch(value.requests[1].history[1].content,/[\ud800-\udfff]/u);
  assert.doesNotMatch(JSON.stringify(proof),/Private answer|甲|Saved details|SYNTHETIC_CALLER/u);
  assert.equal(Object.isFrozen(proof),true);assert.equal(Object.isFrozen(proof.turns),true);
});

test('changed request hash or saved-message digest is rejected rather than credited as a complete report',async()=>{
  const value=await captured();
  for(const [key,code]of [['requestHash','request_commitment_mismatch'],['messageDigest','saved_commitment_mismatch']]){
    const changed=structuredClone(value);if(key==='requestHash')changed.turns[0].envelope.requestHash='f'.repeat(64);else changed.turns[0].messageDigest='f'.repeat(64);
    assert.throws(()=>verifyTranscriptTurnCommitments(changed),{code});
  }
});

test('answer, visible card, citation and activity alterations invalidate the saved commitment',async()=>{
  const original=await captured();
  for(const mutate of [row=>{row.envelope.body.answer='Replacement';},row=>{row.envelope.body.views[0].rows[0][7]='Wrong eighth cell';},
    row=>{row.envelope.body.citations[0].url='/elsewhere';},row=>{row.envelope.events[0].detail='Replacement activity';}]){
    const value=structuredClone(original);mutate(value.turns[0]);assert.throws(()=>verifyTranscriptTurnCommitments(value),{code:'saved_commitment_mismatch'});
  }
});

test('wire history and ordering are derived from prior persisted answers, never accepted independently from report text',async()=>{
  const original=await captured();
  for(const mutate of [rows=>{rows[1].testCase.history[1].content='Invented prior answer';},rows=>{rows[1].testCase.question='Different question';},
    rows=>{rows[1].testCase.route='/dtm';},rows=>{rows.reverse();},rows=>{rows[1].savedVersion=3;},rows=>{rows[1].caseId=rows[0].caseId;}]){
    const value=structuredClone(original);mutate(value.turns);assert.throws(()=>verifyTranscriptTurnCommitments(value),{code:'turn_drift'});
  }
  const partial={...original,turns:original.turns.slice(0,2)};assert.equal(verifyTranscriptTurnCommitments(partial).messageCount,4);
  assert.equal(verifyTranscriptTurnCommitments({...original,turns:[]}).lastMessageDigest,null);
});

test('unpreservable answer, action and corrupted plan fail safely without accepting a digest',async()=>{
  const original=await captured();
  const long=structuredClone(original);long.turns[0].envelope.body.answer='a'.repeat(8001);assert.throws(()=>verifyTranscriptTurnCommitments(long),{code:'truncated_turn'});
  const nul=structuredClone(original);nul.turns[0].envelope.body.answer+='\0';assert.throws(()=>verifyTranscriptTurnCommitments(nul),{code:'truncated_turn'});
  const action=structuredClone(original);action.turns[0].envelope.body.proposedAction={kind:'create_task'};assert.throws(()=>verifyTranscriptTurnCommitments(action),{code:'turn_drift'});
  const planDrift=structuredClone(original);planDrift.plan.ownerId='17000000-0000-4000-8000-000000000099';assert.throws(()=>verifyTranscriptTurnCommitments(planDrift),{code:'plan_drift'});
});

test('artifact admission does not execute object or array accessors, accept subclass behavior, or allocate unbounded values',()=>{
  let touched=0;const object=Object.defineProperty({},'plan',{enumerable:true,get(){touched++;return plan();}});
  assert.throws(()=>verifyTranscriptTurnCommitments(object),{code:'invalid_input'});
  const turns=[];Object.defineProperty(turns,'0',{enumerable:true,get(){touched++;return {};}});assert.throws(()=>verifyTranscriptTurnCommitments({plan:plan(),turns}),{code:'invalid_input'});
  class Rows extends Array{}assert.throws(()=>verifyTranscriptTurnCommitments({plan:plan(),turns:new Rows()}),{code:'invalid_input'});
  assert.throws(()=>verifyTranscriptTurnCommitments({plan:plan(),turns:[],extra:'x'.repeat(10_000_001)}),{code:'invalid_input'});assert.equal(touched,0);
});

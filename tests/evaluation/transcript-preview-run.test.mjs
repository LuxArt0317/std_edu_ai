import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTranscriptDurableJournal,readTranscriptDurableJournal} from './transcript-durable-journal.mjs';
import {transcriptPreviewOptions} from './run-transcript-preview.mjs';
import {assessTranscriptPreview,runTranscriptPreview} from './transcript-preview-run.mjs';
import {verifyTranscriptConversationRow} from './transcript-conversation-save.mjs';
import {newConversationId} from '../../src/services/assistantConversationId.js';

const origin='https://std-edu-ai-fixture-v1-d286.vercel.app',sourceRevision='a'.repeat(40);
const runId='17000000-0000-4000-8000-000000000001',conversationId=newConversationId(),
  ownerId='17000000-0000-4000-8000-000000000003',token='SYNTHETIC_CALLER_TOKEN';
const now='2026-11-16T08:00:00.000Z',stateHash='b'.repeat(64);
const manifest=()=>({version:1,source:'vercel-git',environment:'preview',revision:sourceRevision,builtAt:'2026-11-15T01:00:00.000Z'});
const args={runId,conversationId,origin,approvedPreviewOrigin:origin,sourceRevision,now,simulation:true};

function fixture({protection=false,drift=false,changeFixture=false,loseSave=false,loseJournal=false,cleanupFailed=false,returnAction=false,failReport=false,cleanupDrift=false,journalFactory}={}){
  const calls=[],savedReports=[],journalRows=[],prompts=[],terminals=[];
  let conversation,protectedDrift=false,prepares=0,cleanups=0,postSaves=0;
  let journal={
    async pending(entry){calls.push('journal:'+entry.operation);if(loseJournal)throw new Error('private write failure');journalRows.push({pending:entry});},
    async received(entry){
      if(entry.operation==='assistant'){
        assert.equal(entry.receipt.requestHash,journalRows.at(-1).pending.requestHash);
        assert.equal(entry.receipt.body.answer,'Synthetic answer '+prompts.length);
      }else assert.equal(entry.messageDigest,journalRows.at(-1).pending.messageDigest);
      journalRows.at(-1).received=entry;calls.push('received');
    },
    async terminal(marker){terminals.push(marker);},
    async read(){return {entries:journalRows};},
    async close(){calls.push('journal-close');},
  };
  const adapter={
    async prepare(options){
      prepares++;calls.push('prepare');
      assert.equal(options.runId,runId);
      assert.equal(options.expectedReleaseRevision,sourceRevision);
      assert.equal(options.applicationFetch,fetchImpl);
      assert.equal(options.cases.length,4);
      assert.ok(options.cases.every(row=>row.history.length===0));
    },
    async transcriptFixtureIdentity(){return {ownerId};},
    async reserveTranscriptConversation(input){
      assert.equal(input.conversationId,conversationId);assert.equal(input.journal,journal);
      return {ownerId,conversationId,async readback(){
        calls.push('fixture-conversation-readback');
        const {pending}=(await journal.read()).entries.at(-1);
        assert.equal(verifyTranscriptConversationRow(pending,[{...conversation,user_id:ownerId}]),true);
        return {version:conversation.version,messageDigest:pending.messageDigest};
      }};
    },
    async forCase(row){calls.push('fixture-before');assert.equal(row.turnId,'turn-'+(prompts.length+1));return {token};},
    async afterCase(row,envelope){
      calls.push('fixture-after');
      assert.equal(row.question,prompts.at(-1).question);
      envelope.stateBefore={ownedRecordsDigest:stateHash};
      envelope.stateAfterProposal={ownedRecordsDigest:changeFixture?'c'.repeat(64):stateHash};
      envelope.fixtureReadback={verified:true,independentGolden:true};
    },
    async cleanup(){
      cleanups++;calls.push('cleanup');
      if(cleanupFailed)return {verified:false};
      conversation=undefined;
      if(cleanupDrift)protectedDrift=true;
      return {verified:true,protectedOwnerUnchanged:true,conversationCleanup:{verified:true,conversationRows:0}};
    },
  };
  const fetchImpl=async(input,init)=>{
    const url=new URL(input);
    assert.equal(url.origin,origin);
    if(url.pathname==='/release.json'){
      calls.push('manifest');
      assert.equal(new Headers(init.headers).get('authorization'),null);
      if(protection)return new Response(null,{status:302});
      return Response.json(protectedDrift?{...manifest(),builtAt:'2026-11-15T01:01:00.000Z'}:manifest());
    }
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+token);
    if(url.pathname==='/api/affairs-assistant'){
      calls.push('assistant');prompts.push(JSON.parse(init.body));protectedDrift=drift;
      const answer='Synthetic answer '+prompts.length;
      const result={answer,status:'answered',activity:[],...(returnAction?{proposedAction:{kind:'create_task'}}:{})};
      const event={kind:'fixture-confirmed',label:'Checked request',detail:'Captured synthetic evidence.',status:'complete'};
      const stream='event: progress\ndata: '+JSON.stringify(event)+'\n\nevent: result\ndata: '+JSON.stringify(result)+'\n\n';
      return new Response(stream,{headers:{'content-type':'text/event-stream','X-Assistant-Request-Id':'18000000-0000-4000-8000-00000000000'+prompts.length}});
    }
    assert.equal(url.pathname,'/api/affairs-conversations');
    if(init.method==='GET'){
      calls.push('read-conversation');
      return conversation?Response.json(conversation):Response.json({error:'Conversation not found.'},{status:404});
    }
    calls.push('save-conversation');postSaves++;
    const payload=JSON.parse(init.body);
    assert.equal(payload.id,conversationId);
    assert.equal(payload.version,conversation?.version??0);
    assert.ok(payload.messages.at(-1).activity.some(step=>step.kind==='fixture-confirmed'));
    conversation={...payload,version:payload.version+1,updated_at:now};
    if(loseSave)throw new Error('Synthetic network drop');
    return Response.json(conversation);
  };
  return {calls,savedReports,prompts,terminals,journalRows,
    get prepares(){return prepares;},get cleanups(){return cleanups;},get postSaves(){return postSaves;},
    run:overrides=>runTranscriptPreview({...args,fetchImpl,...overrides},{
      fixture:adapter,async createJournal(binding){
        assert.equal(binding.ownerId,ownerId);
        if(journalFactory)journal=await journalFactory(binding);
        return journal;
      },
      async writeReport(report){
        if(failReport&&!report.failure)throw new Error('simulated disk failure');
        savedReports.push(report);
      },
      async wait(ms){assert.equal(ms,5500);calls.push('pace');},
    })};
}

test('all four exact questions run in one saved chat with fresh observed history, two readbacks and cleanup',async()=>{
  const env=fixture(),report=await env.run();
  assert.equal(report.failure,null);
  assert.equal(report.execution,'deterministic');
  assert.equal(report.plan.sessionId,conversationId);
  assert.match(conversationId,/^.{14}7/u);
  assert.equal(report.plan.ownerId,ownerId);
  assert.equal(report.turns.length,4);
  assert.equal(report.deployment.status,'finished');
  assert.equal(report.deployment.completed,13);
  assert.equal(report.cleanup.verified,true);
  assert.equal(report.assessment.passed,false);
  assert.equal(report.assessment.releaseReady,false);
  for(const [index,request]of env.prompts.entries()){
    assert.equal(request.question,report.plan.cases[index].question);
    assert.deepEqual(request.history,report.turns[index].testCase.history);
    assert.equal(request.history.length,2*index);
    if(index)assert.equal(request.history.at(-1).content,'Synthetic answer '+index);
    assert.equal(request.consentedResearchUse,false);
  }
  assert.equal(env.postSaves,4);
  assert.equal(env.journalRows.length,8);
  assert.equal(env.calls.filter(row=>row==='fixture-conversation-readback').length,4);
  assert.ok(env.calls.indexOf('cleanup')<env.calls.indexOf('journal-close'));
  assert.doesNotMatch(JSON.stringify(env.savedReports),new RegExp(token));
  const changed=structuredClone(report);changed.turns[1].testCase.history[1].content='Replacement';
  assert.throws(()=>assessTranscriptPreview(changed),/report_drift/u);
});

test('protection and production-target mismatch stop before fixture setup',async()=>{
  const env=fixture({protection:true}),report=await env.run();
  assert.equal(report.failure.phase,'deployment_pin');
  assert.equal(env.prepares,0);assert.equal(env.cleanups,0);assert.equal(env.prompts.length,0);
  await assert.rejects(env.run({origin:'https://stu.best',approvedPreviewOrigin:'https://stu.best'}),/invalid_configuration/u);
});

test('fixture drift, disallowed action, save uncertainty and journal failure stop without replay',async()=>{
  for(const [options,phase,prompts,saves]of [
    [{changeFixture:true},'fixture_after',1,0],
    [{returnAction:true},'assistant_receipt',1,0],
    [{loseSave:true},'conversation_save',1,1],
    [{loseJournal:true},'assistant_request',0,0],
    [{drift:true},'assistant_request',1,0],
  ]){
    const env=fixture(options),report=await env.run();
    assert.equal(report.failure.phase,phase);
    assert.equal(env.prompts.length,prompts);
    assert.equal(env.postSaves,saves);
    assert.equal(env.cleanups,1);
    assert.equal(env.terminals.length,1);
    assert.equal(report.turns.length,0);
    if(options.drift)assert.equal(report.incomplete.response.body.answer,'Synthetic answer 1');
    assert.equal(report.assessment.passed,false);
  }
});

test('cleanup failure and missing independent reviews cannot earn acceptance',async()=>{
  const env=fixture({cleanupFailed:true}),report=await env.run();
  assert.equal(report.turns.length,4);
  assert.equal(report.cleanup.verified,false);
  assert.equal(report.assessment.passed,false);
  assert.equal(report.assessment.results.filter(row=>row.guidanceReviewBinding).length,2);
});

test('real durable journal commits all eight requests and survives the runner closing it',async()=>{
  const directory=await realpath(await mkdtemp(join(tmpdir(),'stu-transcript-orchestration-')));
  let binding;
  try{
    const env=fixture({async journalFactory(value){
      binding=value;return createTranscriptDurableJournal({directory,binding});
    }});
    const report=await env.run();
    assert.equal(report.failure,null);
    const persisted=await readTranscriptDurableJournal({directory,binding});
    assert.equal(persisted.entries.length,8);
    assert.equal(persisted.terminal,null);
    for(const [index,turn] of report.turns.entries()){
      assert.equal(persisted.entries[2*index].received.correlationId,turn.envelope.correlationId);
      assert.equal(persisted.entries[2*index+1].received.messageDigest,turn.messageDigest);
    }
    assert.doesNotMatch(JSON.stringify(persisted),/SYNTHETIC_CALLER_TOKEN|Synthetic answer|what do you know/u);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('entry point only accepts an explicit exact protected target and operator transport',()=>{
  const args=['--origin',origin,'--approved-preview-origin',origin,'--revision',sourceRevision,'--transport-module','/private/path/transport.mjs'];
  assert.deepEqual(transcriptPreviewOptions(args),{origin,approvedPreviewOrigin:origin,sourceRevision,transportModule:'/private/path/transport.mjs'});
  const oidcOrigin='https://stdedu-abcdef123-v1-d286.vercel.app';
  const oidc=['--origin',oidcOrigin,'--approved-preview-origin',oidcOrigin,'--revision',sourceRevision,'--preview-auth','oidc'];
  assert.deepEqual(transcriptPreviewOptions(oidc),{origin:oidcOrigin,approvedPreviewOrigin:oidcOrigin,sourceRevision,previewAuth:'oidc'});
  for(const bad of [[],['--origin','https://stu.best'],args.slice(0,-2),[...args,'--origin',origin],
    [...args,'--simulation','true'],args.map(value=>value===origin?'https://example.com':value),
    [...oidc,'--transport-module','/private/path/transport.mjs'],oidc.map(value=>value===oidcOrigin?origin:value)]){
    assert.throws(()=>transcriptPreviewOptions(bad),/invalid_options/u);
  }
});

test('late manifest drift is retained in the durable journal after cleanup',async()=>{
  const directory=await realpath(await mkdtemp(join(tmpdir(),'stu-transcript-final-drift-')));
  let binding;
  try{
    const env=fixture({cleanupDrift:true,async journalFactory(value){
      binding=value;return createTranscriptDurableJournal({directory,binding});
    }});
    const report=await env.run();
    assert.equal(report.failure.phase,'deployment_finish');
    assert.equal(report.turns.length,4);
    assert.equal(report.cleanup.verified,true);
    assert.equal(report.assessment.transportComplete,false);
    const journal=await readTranscriptDurableJournal({directory,binding});
    assert.equal(journal.entries.length,8);
    assert.deepEqual(journal.terminal,{phase:'deployment',code:'deployment_failed',disposition:'not_sent',requestHash:null});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('report storage failure stops before connection or credentials and returns the failed stage',async()=>{
  const env=fixture({failReport:true}),report=await env.run();
  assert.equal(report.failure.phase,'initial_report');
  assert.equal(env.prepares,0);
  assert.equal(env.calls.length,0);
  assert.equal(env.savedReports.length,1);
});

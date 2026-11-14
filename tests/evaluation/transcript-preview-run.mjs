import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {buildTranscriptReplayPlan} from './transcript-replay.mjs';
import {buildGuidanceReviewBinding,validateGuidanceReview} from './guidance-rubric.mjs';
import {gradeCase} from './grading.mjs';
import {createTranscriptLiveTransport} from './transcript-live-transport.mjs';
import {createTranscriptConversationSave} from './transcript-conversation-save.mjs';
import {verifyTranscriptTurnCommitments} from './transcript-preview-attestation.mjs';
import {boundedAssistantText,reconcileAssistantActivity} from '../../src/services/assistantActivityBudget.js';

const title='Reported school assistant transcript';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[a-f0-9]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/u.test(value);
const hasMethods=(object,keys)=>object&&keys.every(key=>typeof object[key]==='function');
const failure=code=>{throw new Error('Transcript Preview: '+code+'.');};
// Keep the wire history aligned with the authenticated browser request.
const historyOf=messages=>messages.slice(-6).map(({role,content})=>({role,content:boundedAssistantText(content,2000)}));
function checkEnvelope(envelope,revision,correlations){
  if(envelope.operation!=='assistant'||envelope.sourceRevision!==revision||envelope.statusCode!==200
    ||envelope.deploymentVerified!==true||!uuid(envelope.correlationId)||correlations.has(envelope.correlationId)
    ||!digest(envelope.requestHash)||!Number.isSafeInteger(envelope.requestIndex)||!Array.isArray(envelope.events)
    ||!['answered','clarification','abstained','handoff'].includes(envelope.body?.status)
    ||typeof envelope.body.answer!=='string'||!envelope.body.answer.trim()||envelope.body.proposedAction)
    failure('invalid_assistant_result');
  correlations.add(envelope.correlationId);
}

function assessment(plan,turns,reviews=[]){
  if(!Array.isArray(reviews)||reviews.length>2||new Set(reviews.map(row=>row?.binding?.caseId)).size!==reviews.length
    ||reviews.some(row=>!turns.some(turn=>turn.testCase.expected.guidanceRubric&&turn.caseId===row?.binding?.caseId)))
    failure('invalid_reviews');
  const results=turns.map(turn=>{
    const {testCase,envelope}=turn;
    const binding=testCase.expected.guidanceRubric?buildGuidanceReviewBinding({
      runId:plan.runId,finalSuiteHash:plan.suiteHash,sourceRevision:plan.sourceRevision,
      testCase,envelope,fixtureStateHash:plan.fixtureStateHash,
    }):null;
    const review=binding?validateGuidanceReview({testCase,envelope,binding,artifact:reviews.find(row=>row.binding.caseId===turn.caseId)}):undefined;
    return {...gradeCase(testCase,envelope,{independentReview:review}),...(binding?{guidanceReviewBinding:binding,independentReview:review}:{})};
  });
  return {complete:results.length===4,passed:results.length===4&&results.every(row=>row.passed),results};
}

export function assessTranscriptPreview(report,{reviews=[]}={}){
  if(!report?.plan||!isDeepStrictEqual(report.plan,buildTranscriptReplayPlan(report.plan))||!Array.isArray(report.turns)||report.turns.length>4)
    failure('invalid_report');
  if(!['live-model','deterministic'].includes(report.execution)||report.plan.sourceRevision!==report.sourceRevision
    ||report.plan.runId!==report.runId||report.plan.sessionId!==report.conversationId)failure('invalid_report');
  const saved=[],correlations=new Set(),requestHashes=new Set();
  for(const [index,turn] of report.turns.entries()){
    const expected={...report.plan.cases[index],history:historyOf(saved)};
    if(turn.caseId!==expected.id||!isDeepStrictEqual(turn.testCase,expected)||turn.savedVersion!==index+1||!digest(turn.messageDigest)
      ||turn.envelope.fixtureKey!==expected.fixtureKey||turn.envelope.execution!==report.execution
      ||turn.envelope.fixtureReadback?.verified!==true||turn.envelope.fixtureReadback.independentGolden!==true
      ||!digest(turn.envelope.stateBefore?.ownedRecordsDigest)
      ||index&&turn.envelope.stateBefore.ownedRecordsDigest!==report.turns[0].envelope.stateBefore.ownedRecordsDigest
      ||turn.envelope.stateAfterProposal?.ownedRecordsDigest!==turn.envelope.stateBefore.ownedRecordsDigest)
      failure('report_drift');
    checkEnvelope(turn.envelope,report.plan.sourceRevision,correlations);
    const expectedRequestIndex=[1,5,8,11][index];
    if(turn.envelope.requestIndex!==expectedRequestIndex||requestHashes.has(turn.envelope.requestHash))
      failure('report_drift');
    requestHashes.add(turn.envelope.requestHash);
    saved.push({role:'user',content:expected.question},{role:'assistant',content:turn.envelope.body.answer});
  }
  verifyTranscriptTurnCommitments({plan:report.plan,turns:report.turns});
  const evaluated=assessment(report.plan,report.turns,reviews);
  const deployment=report.deployment,cleanupVerified=report.cleanup?.verified===true&&report.cleanup.conversationRows===0;
  const transportComplete=deployment?.status==='finished'&&deployment.sourceRevision===report.sourceRevision
    &&deployment.origin===report.origin&&deployment.issued===13&&deployment.completed===13;
  return {...evaluated,transportComplete,cleanupVerified,releaseReady:false,
    passed:evaluated.passed&&report.execution==='live-model'&&report.failure===null
      &&transportComplete&&cleanupVerified};
}

/**
 * Run the user's four messages in order over the exact Preview. Every answer
 * becomes the next turn's history only after fixture recheck and two
 * independent saved-conversation readbacks. This packet cannot release the
 * full product. Caller supplies an authorized session transport, reserved
 * disposable fixture lifecycle, and owner-only durable report writer.
 */
export async function runTranscriptPreview({
  runId=randomUUID(),conversationId=randomUUID(),origin,approvedPreviewOrigin,sourceRevision,
  now=new Date().toISOString(),fetchImpl,signal,simulation=false,
}={},{
  fixture,createJournal,writeReport,wait=ms=>delay(ms,undefined,{signal}),
}={}){
  if(!uuid(runId)||!uuid(conversationId)||runId===conversationId||!sha(sourceRevision)
    ||!approvedPreviewOrigin||origin!==approvedPreviewOrigin||origin==='https://stu.best'||typeof simulation!=='boolean'
    ||!hasMethods(fixture,['prepare','transcriptFixtureIdentity','reserveTranscriptConversation','forCase','afterCase','cleanup'])
    ||typeof createJournal!=='function'||typeof writeReport!=='function'||typeof wait!=='function')
    failure('invalid_configuration');
  const transport=createTranscriptLiveTransport({origin,approvedPreviewOrigin,expectedRevision:sourceRevision,fetchImpl,signal});
  const packet=buildTranscriptReplayPlan({runId,sessionId:conversationId,sourceRevision,now});
  const report={version:1,runId,conversationId,sourceRevision,origin,execution:simulation?'deterministic':'live-model',
    plan:null,turns:[],failure:null,incomplete:null,cleanup:{required:false,verified:false,conversationRows:null},deployment:transport.status().deployment};
  const persist=()=>writeReport(structuredClone(report));
  let phase='initial_report',journal,opened=false,canFinish=false,persistError,lastRequestHash;
  const correlations=new Set();
  try{
    await persist();
    phase='deployment_pin';
    await transport.pin();
    report.deployment=transport.status().deployment;
    await persist();
    signal?.throwIfAborted();
    phase='fixture_prepare';
    opened=true;
    report.cleanup.required=true;
    await fixture.prepare({runId,cases:structuredClone(packet.cases),now,origin,approvedPreviewOrigin,
      expectedReleaseRevision:sourceRevision,signal,applicationFetch:fetchImpl});
    const {ownerId}=await fixture.transcriptFixtureIdentity();
    const plan=buildTranscriptReplayPlan({runId,sessionId:conversationId,sourceRevision,now,ownerId});
    report.plan=plan;
    phase='journal_setup';
    journal=await createJournal({runId,ownerId,conversationId,sourceRevision,suiteHash:plan.suiteHash});
    if(!hasMethods(journal,['pending','received','terminal','read','close']))failure('journal_contract');
    phase='conversation_reservation';
    const reservation=await fixture.reserveTranscriptConversation({conversationId,journal});
    if(reservation?.ownerId!==ownerId||reservation.conversationId!==conversationId||!hasMethods(reservation,['readback']))
      failure('fixture_owner');
    const conversation=createTranscriptConversationSave({transport,ownerId,conversationId,title,journal});
    let messages=[];
    for(const testCaseTemplate of plan.cases){
      signal?.throwIfAborted();
      const testCase={...testCaseTemplate,history:historyOf(messages)};
      const {id:caseId,turnId}=testCase;
      report.incomplete={caseId,turnId};
      lastRequestHash=undefined;
      phase='fixture_before';
      await transport.assertCurrent();
      const {token}=await fixture.forCase(structuredClone(testCase),{signal});
      if(typeof token!=='string'||!token.trim())failure('fixture_session');
      phase='assistant_request';
      if(messages.length)await wait(5500);
      const response=await transport.assistant({token,question:testCase.question,history:testCase.history,route:testCase.route,
        beforeSend:async commitment=>{
          await journal.pending({...commitment,turnId,caseId});
          lastRequestHash=commitment.requestHash;
        }});
      report.incomplete.response=response;
      phase='assistant_receipt';
      await journal.received({operation:'assistant',turnId,caseId,receipt:response});
      checkEnvelope(response,sourceRevision,correlations);
      // Keep fixture metadata beside the original body and event stream. Each
      // readback uses the same fixture and the response's observed tool scope.
      const envelope={...response,execution:report.execution,fixtureKey:testCase.fixtureKey,executed:true,
        deploymentCheck:{requestIndex:response.requestIndex,sourceRevision,verified:true}};
      phase='fixture_after';
      await fixture.afterCase(structuredClone(testCase),envelope,{signal});
      const before=envelope.stateBefore?.ownedRecordsDigest;
      if(!digest(before)||before!==envelope.stateAfterProposal?.ownedRecordsDigest
        ||envelope.fixtureReadback?.verified!==true||envelope.fixtureReadback.independentGolden!==true)
        failure('fixture_state_changed');
      phase='conversation_save';
      const activity=reconcileAssistantActivity(response.events,response.body.activity??[]);
      const saved=await conversation.append({token,user:{id:turnId+':user',role:'user',content:testCase.question},
        assistant:{id:turnId+':assistant',role:'assistant',phase:'complete',content:response.body.answer,result:response.body,activity}});
      phase='conversation_readback';
      const durable=await reservation.readback();
      if(durable?.version!==saved.version||durable.messageDigest!==saved.messageDigest)failure('conversation_state_changed');
      messages=saved.messages;
      report.turns.push({caseId,turnId,testCase,envelope,savedVersion:saved.version,messageDigest:saved.messageDigest});
      report.incomplete=null;
      report.deployment=transport.status().deployment;
      phase='turn_report';
      await persist();
    }
    canFinish=true;
  }catch(error){
    if(error?.receivedResponse&&report.incomplete&&!report.incomplete.response)report.incomplete.response=error.receivedResponse;
    report.failure={phase,uncertain:error?.requiresReconciliation===true||['conversation_save','conversation_readback'].includes(phase)};
    if(journal?.terminal){
      try{await journal.terminal({phase:'eval_abort',code:signal?.aborted?'cancelled':'failed',
        disposition:report.failure.uncertain?'uncertain':'not_sent',
        ...(phase==='assistant_request'&&lastRequestHash?{requestHash:lastRequestHash}:{})});}
      catch{report.failure.journalRetained=true;}
    }
  }finally{
    if(opened){
      try{
        const cleanup=await fixture.cleanup();
        report.cleanup.conversationRows=cleanup?.conversationCleanup?.conversationRows??null;
        report.cleanup.verified=cleanup?.verified===true&&cleanup.protectedOwnerUnchanged===true
          &&(report.plan===null||cleanup.conversationCleanup?.verified===true&&report.cleanup.conversationRows===0);
      }catch{report.cleanup.verified=false;}
    }
    if(canFinish){
      try{await transport.finish();}
      catch{
        report.failure??={phase:'deployment_finish',uncertain:false};
        try{await journal?.terminal({phase:'deployment',code:'deployment_failed',disposition:'not_sent'});}
        catch{report.failure.journalRetained=true;}
      }
    }else transport.stop();
    report.deployment=transport.status().deployment;
    if(journal?.close){
      try{await journal.close();}catch{report.failure??={phase:'journal_close',uncertain:false};}
    }
    if(report.plan){
      try{report.assessment=assessTranscriptPreview(report);}
      catch{report.failure??={phase:'report_assessment',uncertain:false};}
    }
    try{await persist();}catch(error){persistError=error;}
  }
  if(persistError)failure('report_persistence_failed');
  return report;
}

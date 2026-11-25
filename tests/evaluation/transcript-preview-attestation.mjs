/** Pure artifact consistency, not authenticated remote storage or model proof.
 * No I/O; exact live transport/save interoperability is tested separately. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';
import {boundedAssistantText,reconcileAssistantActivity} from '../../src/services/assistantActivityBudget.js';
import {buildTranscriptReplayPlan} from './transcript-replay.mjs';

const codes=new Set(['invalid_input','plan_drift','turn_drift','request_commitment_mismatch','saved_commitment_mismatch','truncated_turn']);
export class TranscriptAttestationError extends Error{
  constructor(code){const safe=codes.has(code)?code:'invalid_input';super('Transcript attestation failed: '+safe+'.');this.name='TranscriptAttestationError';this.code=safe;}
}
const fail=code=>{throw new TranscriptAttestationError(code);};
const plain=value=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype;
function normalized(value){
  let nodes=0,characters=0;
  const visit=(item,depth)=>{
    if(++nodes>200000||depth>40)fail('invalid_input');
    if(typeof item==='string'){characters+=item.length;if(characters>10_000_000)fail('invalid_input');return item;}
    if(item===null||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item))return item;
    if(!item||typeof item!=='object'||Object.getOwnPropertySymbols(item).length)fail('invalid_input');
    const descriptors=Object.getOwnPropertyDescriptors(item);
    if(Object.values(descriptors).some(row=>!Object.hasOwn(row,'value')))fail('invalid_input');
    if(Array.isArray(item)){
      if(Object.getPrototypeOf(item)!==Array.prototype||item.length>2048||Object.keys(descriptors).length!==item.length+1)fail('invalid_input');
      return Array.from({length:item.length},(_,index)=>{if(!descriptors[index]?.enumerable)fail('invalid_input');return visit(descriptors[index].value,depth+1);});
    }
    if(!plain(item)||Object.keys(descriptors).length>512)fail('invalid_input');
    return Object.fromEntries(Object.keys(descriptors).sort().map(key=>{
      if(key.length>300||!descriptors[key].enumerable)fail('invalid_input');return [key,visit(descriptors[key].value,depth+1)];
    }));
  };
  const copy=visit(value,0);if(Buffer.byteLength(JSON.stringify(copy))>10_000_000)fail('invalid_input');return copy;
}
const sha=value=>createHash('sha256').update(value).digest('hex');
const historyOf=messages=>messages.slice(-6).map(({role,content})=>({role,content:boundedAssistantText(content,2000)}));
// Transport v1 computes its commitment before serializing the request. The
// three input keys and each history row are sorted by its jsonData admission;
// its two fixed flags are then appended by assistantBody. Keep this exact order.
function requestDigest(testCase){
  const body={history:normalized(testCase.history),question:testCase.question,route:testCase.route,stream:true,consentedResearchUse:false};
  return sha(JSON.stringify({operation:'assistant',path:'/api/affairs-assistant',body}));
}
const messageDigest=messages=>sha(JSON.stringify(normalized(messages)));

/** Reconstruct all committed messages and wire histories from the recorded
 * original answers. Never accept prior assistant/user prose as source facts.
 * Independent factual/helpfulness, own SQL readback and deployment checks are
 * still mandatory; these digests are consistency checks, not signatures. */
export function verifyTranscriptTurnCommitments(input){
  let plan,turns;
  try{({plan,turns}=normalized(input));}catch{fail('invalid_input');}
  let rebuilt;try{rebuilt=buildTranscriptReplayPlan(plan);}catch{fail('plan_drift');}
  if(!isDeepStrictEqual(plan,rebuilt)||!Array.isArray(turns)||turns.length>4)fail('plan_drift');
  let messages=[];const proofs=[];
  for(let index=0;index<turns.length;index++){
    const turn=turns[index],expected={...rebuilt.cases[index],history:historyOf(messages)},envelope=turn?.envelope;
    if(!plain(turn)||turn.turnId!==expected.turnId||turn.caseId!==expected.id||!isDeepStrictEqual(turn.testCase,expected)
      ||turn.savedVersion!==index+1||!plain(envelope)||envelope.operation!=='assistant'||envelope.sourceRevision!==plan.sourceRevision
      ||envelope.statusCode!==200||!plain(envelope.body)||typeof envelope.body.answer!=='string'||!envelope.body.answer.trim()
      ||!Array.isArray(envelope.events)||envelope.events.length>100||envelope.body.proposedAction)fail('turn_drift');
    const requestHash=requestDigest(expected);if(envelope.requestHash!==requestHash)fail('request_commitment_mismatch');
    const before=messages,answer=envelope.body.answer;
    try{
      const activity=reconcileAssistantActivity(envelope.events,envelope.body.activity??[]);
      messages=JSON.parse(JSON.stringify(sanitizeStoredConversation([...before,
        {id:expected.turnId+':user',role:'user',content:expected.question},
        {id:expected.turnId+':assistant',role:'assistant',phase:'complete',content:answer,result:envelope.body,activity},
      ])));
    }catch{fail('truncated_turn');}
    if(messages.length!==before.length+2||!isDeepStrictEqual(messages.slice(0,-2),before)
      ||messages.at(-2)?.content!==expected.question||messages.at(-1)?.content!==answer||!messages.at(-1)?.result)fail('truncated_turn');
    const savedHash=messageDigest(messages);if(turn.messageDigest!==savedHash)fail('saved_commitment_mismatch');
    proofs.push(Object.freeze({turnId:expected.turnId,requestHash,messageDigest:savedHash}));
  }
  return Object.freeze({verified:true,turns:Object.freeze(proofs),messageCount:messages.length,lastMessageDigest:proofs.at(-1)?.messageDigest??null});
}

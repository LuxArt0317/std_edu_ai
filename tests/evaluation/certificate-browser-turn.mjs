import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {certificateAwardBankReceiptNote,certificateAwardPath} from '../../server/certificateAwardsContract.js';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';
import {boundedAssistantText} from '../../src/services/assistantActivityBudget.js';
import {isConversationId} from '../../src/services/assistantConversationId.js';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

const messageId=/^u-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const hash=/^[a-f0-9]{64}$/u;
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;
const validConversation=id=>typeof id==='string'&&isConversationId(id)&&id[14]==='7';

/** Validate the narrow native response before making it visible to the browser.
 * The fixture grader independently determines whether the rows are correct. */
export function inspectProtectedCertificateBrowserReply(reply,{bankReceipt}){
  check(exact(reply,'activity,answer,citations,grounding,status,suggestedQuestions')&&reply.status==='answered'
    &&exact(reply.grounding,'source,webSearched')&&reply.grounding.source==='account'&&reply.grounding.webSearched===false
    &&Array.isArray(reply.suggestedQuestions)&&reply.suggestedQuestions.length===0
    &&typeof reply.answer==='string'&&reply.answer.length<=8000
    &&Array.isArray(reply.citations)&&reply.citations.length===1
    &&Array.isArray(reply.activity)&&reply.activity.length===(bankReceipt?2:1),'invalid certificate response');
  const [citation]=reply.citations,[read,bank]=reply.activity;
  const title='Certificate award applications',sourceName='My stu.best records',summary=read?.detail;
  check(['Your recent certificate applications:','This account has no saved certificate applications.'].includes(summary)
    &&isDeepStrictEqual(citation,{chunkId:'account:certificate-awards',claim:summary,title,url:certificateAwardPath,sourceName})
    &&isDeepStrictEqual(read,{kind:'certificate-awards',label:title,detail:summary,status:'complete'})
    &&(!bankReceipt||isDeepStrictEqual(bank,{kind:'certificate-awards-bank-receipt',label:'Bank receipt confirmation',
      detail:certificateAwardBankReceiptNote[1],status:'unavailable'})),'invalid certificate response');
  const blocks=reply.answer.split('\n\n');
  const href=blocks.pop(),bankNote=bankReceipt?blocks.pop():null,heading=blocks.shift();
  const items=blocks.length===1?blocks[0].split('\n'):[],empty=summary.startsWith('This account');
  check(href===`[${title}](${certificateAwardPath})`&&heading===summary
    &&(!bankReceipt||bankNote===certificateAwardBankReceiptNote[1])
    &&(empty?blocks.length===0:blocks.length===1&&items.every(line=>line.startsWith('- ')&&line.length>2)),
  'invalid certificate response');
  return {summary,items:items.map(line=>line.slice(2)),bankNote,title,url:certificateAwardPath,sourceName};
}

/** Bind the browser's version-zero save to the exact native response bytes. */
export function verifyProtectedCertificateBrowserSave({payload,question,assistantResponse,requestSequence,bankReceipt}){
  return verifyProtectedNativeBrowserSave({payload,question,assistantResponse,requestSequence,
    inspectReply:reply=>inspectProtectedCertificateBrowserReply(reply,{bankReceipt})});
}

export function verifyProtectedNativeBrowserSave({payload,question,assistantResponse,requestSequence,inspectReply}){
  check(Number.isSafeInteger(requestSequence)&&requestSequence>0&&Buffer.isBuffer(assistantResponse)
    &&assistantResponse.length>0&&assistantResponse.length<=32768,'save certificate binding');
  let reply;
  try{reply=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(assistantResponse));}
  catch{check(false,'invalid certificate response');}
  const display=inspectReply(reply);
  const title=boundedAssistantText(question,80);
  check(exact(payload,'id,messages,title,version')&&validConversation(payload.id)&&title&&payload.title===title&&payload.version===0,
    'save envelope mismatch');
  check(Array.isArray(payload.messages)&&payload.messages.length===2,'save message shape mismatch');
  const [prompt,answer]=payload.messages;
  check(messageId.test(prompt?.id??'')&&answer?.id==='a'+prompt.id.slice(1),'save message shape mismatch');
  const messages=sanitizeStoredConversation([{id:prompt.id,role:'user',content:question,images:[]},
    {id:answer.id,role:'assistant',phase:'complete',content:reply.answer,result:reply,activity:reply.activity}]);
  check(answer.content===reply.answer&&answer.result?.answer===reply.answer,'save answer mismatch');
  check(isDeepStrictEqual(answer.activity,messages[1].activity)&&isDeepStrictEqual(answer.result?.activity,messages[1].result.activity),
    'save activity mismatch');
  check(isDeepStrictEqual(payload.messages,messages),'save certificate transcript mismatch');
  return {id:payload.id,question,title,answer:reply.answer,activity:messages[1].activity,display,messages,requestSequence,
    responseSha256:createHash('sha256').update(assistantResponse).digest('hex')};
}

export function verifyProtectedCertificateBrowserReceipt({row,expected,mode}){
  const saved=mode==='save';
  check((saved||mode==='read')&&validConversation(expected?.id)&&hash.test(expected?.responseSha256??'')
    &&exact(row,saved?'created_at,id,messages,title,updated_at,version':'id,messages,title,updated_at,version')
    &&row.id===expected.id&&row.title===expected.title&&row.version===1&&timestamp(row.updated_at)
    &&(!saved||timestamp(row.created_at)&&Date.parse(row.created_at)<=Date.parse(row.updated_at))
    &&(saved||row.updated_at===expected.updatedAt)&&isDeepStrictEqual(row.messages,expected.messages),'save certificate receipt mismatch');
  return {id:row.id,version:1,updatedAt:row.updated_at};
}

/** Evaluate only after closing the Playwright context and draining its relay. */
export function verifyProtectedCertificateBrowserEgress({evidence,mode,requestSequence}){
  return verifyProtectedNativeBrowserEgress({evidence,mode,requestSequence,scope:'certificate'});
}

export function verifyProtectedNativeBrowserEgress({evidence,mode,requestSequence,scope,answerMethod='GET'}){
  const turn=mode==='turn';
  const bootstrap=scope+'-bootstrap',answer=scope+'-answer';
  check((turn||mode==='restore')&&evidence?.overflow===false&&Array.isArray(evidence.observations)
    &&evidence.observations.length>0&&evidence.observations.length<=256,'certificate egress mismatch');
  const counts=new Map();
  for(const [index,row] of evidence.observations.entries()){
    check(row?.sequence===index+1,'certificate egress mismatch');
    if(row.request==='auth'){
      check(['GET','OPTIONS'].includes(row.method)&&row.result==='pass-through'&&row.forwarded===false,'certificate egress mismatch');
      continue;
    }
    const startup=['document','asset',bootstrap,'conversations'].includes(row.request);
    const turnRequest=turn&&(row.request===answer||row.request==='conversation-save');
    const restoreRequest=!turn&&row.request==='conversation-detail';
    check((startup||turnRequest||restoreRequest)&&row.forwarded===true&&row.result==='accepted'&&row.status===200
      &&row.method===(row.request==='conversation-save'?'POST':row.request===answer?answerMethod:'GET')
      &&(turn?startup?row.phase==='bootstrap'||row.phase==='turn':row.phase==='turn':row.phase==='restore'),
      'certificate egress mismatch');
    counts.set(row.request,(counts.get(row.request)??0)+1);
    if(row.request===answer)check(row.sequence===requestSequence,'certificate egress mismatch');
    if(row.request==='conversation-save')check(counts.get(answer)===1,'certificate egress mismatch');
  }
  const required=['document',bootstrap,'conversations',
    ...(turn?[answer,'conversation-save']:['conversation-detail'])];
  check(required.every(request=>counts.get(request)===1),'certificate egress mismatch');
  return {mode,answerRequests:turn?1:0,saveRequests:turn?1:0,restoreRequests:turn?0:1};
}

/** Offline exact-transcript packet. No HTTP, Auth, database, model or disk adapter. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {isConversationId} from '../../src/services/assistantConversationId.js';
import {buildAccountCases} from './account-cases.mjs';
import {fixtureForCase,DEFAULT_EVAL_NOW} from './fixtures.mjs';
import {sampleEnrollmentManifest} from './published-sample-enrollments.mjs';
import {gradeCase} from './grading.mjs';
import {buildGuidanceReviewBinding,validateGuidanceReview} from './guidance-rubric.mjs';

const turnSpecs=[
  ['account:reproduction-record-overview','what do you know about my records'],
  ['account:reproduction-current-courses-year','what courses i have for this semester and what year i am currently at'],
  ['account:reproduction-remaining-balance','how much is my remaining balance in school'],
  ['account:reproduction-interview-help','i am asked what makes me qualified to be a software engineer i dont know what cna you help me?'],
];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const fail=code=>{const error=new Error('Offline transcript replay failed: '+code);error.code=code;throw error;};
function canonical(value){
  let nodes=0,characters=0;
  function visit(item,depth){
    if(++nodes>20000||depth>30)fail('invalid_json');
    if(typeof item==='string'){characters+=item.length;if(item.length>128000||characters>512000)fail('packet_too_large');}
    if(item===null||typeof item==='string'||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item))return JSON.stringify(item);
    if(Array.isArray(item)){
      if(Object.getPrototypeOf(item)!==Array.prototype||item.length>1024||Object.getOwnPropertySymbols(item).length)fail('invalid_json');
      const descriptors=Object.getOwnPropertyDescriptors(item);
      if(Object.keys(descriptors).length!==item.length+1||Object.values(descriptors).some(row=>row.get||row.set))fail('invalid_json');
      const values=[];
      for(let index=0;index<item.length;index++){
        if(!Object.hasOwn(descriptors,String(index))||!Object.hasOwn(descriptors[index],'value'))fail('invalid_json');
        values.push(visit(descriptors[index].value,depth+1));
      }
      return '['+values.join(',')+']';
    }
    if(!object(item)||Object.keys(item).length>256||Object.keys(item).some(key=>key.length>300)
      ||Object.values(Object.getOwnPropertyDescriptors(item)).some(row=>row.get||row.set))fail('invalid_json');
    return '{'+Object.keys(item).sort().map(key=>JSON.stringify(key)+':'+visit(item[key],depth+1)).join(',')+'}';
  }
  return visit(value,0);
}
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const bounded=value=>{const text=canonical(value);if(Buffer.byteLength(text)>512*1024)fail('packet_too_large');return JSON.parse(text);};

export const transcriptReplayManifest=freeze({version:1,id:'reported-four-turn-transcript-v1',caseIds:turnSpecs.map(row=>row[0]),
  execution:'offline',mounted:false,liveReady:false,conversationPersistence:'injected round-trip store only',
  requiredLiveProof:['Exact approved pinned deployment before fixture setup and before/after each request.',
    'One disposable own-account fixture with independent before/after readback and complete cleanup.',
    'A reviewed real conversation/session persistence adapter with stable caller, turn IDs and request correlation.',
    'Actual model responses and all observed selected/completed reads, with no public research or implicit writes.',
    'Independent response-bound factual and helpfulness review; production verifier verdict is not the oracle.'],
  limitations:['This packet never creates credentials, sessions, rows or a provider request.',
    'Prior assistant/user wording is conversation context, not source evidence; the independent fixture never incorporates it.',
    'A pending request is not replayed automatically after an uncertain dispatch or store outcome.',
    'The ordinary runner accepts static history per case; it does not currently save this evolving four-turn session.']});

export function buildTranscriptReplayPlan({runId,sessionId,ownerId='17000000-0000-4000-8000-000000009001',sourceRevision,now=DEFAULT_EVAL_NOW}={}){
  if(!uuid(runId)||!uuid(ownerId)||!isConversationId(sessionId)||new Set([runId,sessionId,ownerId]).size!==3||typeof sourceRevision!=='string'||!/^[a-f0-9]{40}$/u.test(sourceRevision)
    ||typeof now!=='string'||!Number.isFinite(Date.parse(now)))fail('invalid_identity');
  const timestamp=Date.parse(now),window=sampleEnrollmentManifest.validity;
  if(timestamp<Date.parse(window.startsAt)||timestamp>=Date.parse(window.expiresAt))fail('fixture_window');
  const bank=buildAccountCases({now}),cases=turnSpecs.map(([id,question],index)=>{
    const row=bank.find(item=>item.id===id);
    if(!row||row.question!==question||row.fixtureKey!=='published-sample:records'||row.route!=='/')fail('case_drift');
    return {...structuredClone(row),history:[],turnId:'turn-'+(index+1)};
  });
  const fixture=fixtureForCase(cases[0],{now,userId:ownerId}),fixtureStateHash=hash(fixture);
  if(cases.some(row=>hash(fixtureForCase(row,{now,userId:ownerId}))!==fixtureStateHash))fail('fixture_drift');
  return freeze({version:1,packetId:transcriptReplayManifest.id,runId,sessionId,ownerId,sourceRevision,now,cases,
    suiteHash:hash(cases),fixtureStateHash,execution:'offline',liveReady:false});
}
function validatePlan(plan){
  if(!object(plan))fail('invalid_plan');
  const expected=buildTranscriptReplayPlan(plan);
  if(!isDeepStrictEqual(plan,expected))fail('plan_drift');
  return expected;
}
export function transcriptReplayFixture(plan){const valid=validatePlan(plan);return fixtureForCase(valid.cases[0],{now:valid.now,userId:valid.ownerId});}
const historyFrom=state=>state.turns.map(({role,content})=>({role,content}));
const initialState=plan=>({version:1,sessionId:plan.sessionId,runId:plan.runId,sourceRevision:plan.sourceRevision,suiteHash:plan.suiteHash,
  fixtureStateHash:plan.fixtureStateHash,revision:0,turns:[],results:[],pending:null});
function checkedEnvelope(raw,plan,testCase){
  const value=bounded(raw);
  if(!object(value)||!Number.isInteger(value.statusCode)||value.statusCode<100||value.statusCode>599||!object(value.body)
    ||typeof value.body.answer!=='string'||!value.body.answer.trim()||value.body.answer.length>8000||!Array.isArray(value.events)
    ||value.events.length>256||!['deterministic','recorded'].includes(value.execution)||value.sourceRevision!==plan.sourceRevision
    ||value.fixtureKey!==testCase.fixtureKey||value.executed===false)fail('invalid_response');
  return value;
}
function validateState(value,plan){
  const state=bounded(value),initial=initialState(plan);
  if(!object(state)||!isDeepStrictEqual(Object.keys(state).sort(),Object.keys(initial).sort())
    ||Object.keys(initial).filter(key=>!['revision','turns','results','pending'].includes(key)).some(key=>state[key]!==initial[key])
    ||!Array.isArray(state.results)||state.results.length>4||!Array.isArray(state.turns)||state.turns.length!==state.results.length*2+(state.pending?1:0)
    ||state.revision!==state.turns.length)fail('saved_session_drift');
  for(let i=0;i<state.results.length;i++){
    const testCase={...plan.cases[i],history:historyFrom({turns:state.turns.slice(0,i*2)})};
    const result=state.results[i];
    if(!object(result)||!isDeepStrictEqual(Object.keys(result).sort(),['caseId','envelope','requestHash','responseHash','turnId'].sort())
      ||result.caseId!==testCase.id||result.turnId!==testCase.turnId||result.requestHash!==hash(testCase))fail('saved_turn_drift');
    const envelope=checkedEnvelope(result.envelope,plan,testCase);
    if(result.responseHash!==hash(envelope))fail('saved_response_drift');
    const expected=[{id:testCase.turnId+':user',caseId:testCase.id,role:'user',content:testCase.question},
      {id:testCase.turnId+':assistant',caseId:testCase.id,role:'assistant',content:envelope.body.answer}];
    if(!isDeepStrictEqual(state.turns.slice(i*2,i*2+2),expected))fail('saved_history_drift');
  }
  if(state.pending){
    const index=state.results.length,testCase=plan.cases[index];if(!testCase)fail('saved_pending_drift');
    const expected={caseId:testCase.id,turnId:testCase.turnId,requestHash:hash({...testCase,history:historyFrom({turns:state.turns.slice(0,index*2)})})};
    if(!isDeepStrictEqual(state.pending,expected)||!isDeepStrictEqual(state.turns.at(-1),{id:testCase.turnId+':user',caseId:testCase.id,role:'user',content:testCase.question}))fail('saved_pending_drift');
  }
  return state;
}
export function gradeTranscriptReplay(plan,saved,{reviews=[]}={}){
  plan=validatePlan(plan);const state=validateState(saved,plan);
  if(!Array.isArray(reviews)||reviews.length>2||new Set(reviews.map(row=>row?.binding?.caseId)).size!==reviews.length
    ||reviews.some(row=>!plan.cases.some(testCase=>testCase.expected.guidanceRubric&&testCase.id===row?.binding?.caseId)))fail('invalid_reviews');
  const results=state.results.map((saved,index)=>{
    const testCase={...plan.cases[index],history:historyFrom({turns:state.turns.slice(0,index*2)})},envelope=saved.envelope;
    const binding=testCase.expected.guidanceRubric?buildGuidanceReviewBinding({runId:plan.runId,finalSuiteHash:plan.suiteHash,
      sourceRevision:plan.sourceRevision,testCase,envelope,fixtureStateHash:plan.fixtureStateHash}):null;
    const independentReview=binding?validateGuidanceReview({testCase,envelope,binding,artifact:reviews.find(row=>row.binding.caseId===testCase.id)}):undefined;
    return {turnId:testCase.turnId,caseId:testCase.id,requestHash:saved.requestHash,responseHash:saved.responseHash,
      ...gradeCase(testCase,envelope,{independentReview}),...(binding?{guidanceReviewBinding:binding,independentReview}:{})};
  });
  const complete=state.results.length===4&&state.pending===null;
  return {packetId:plan.packetId,runId:plan.runId,sessionId:plan.sessionId,sourceRevision:plan.sourceRevision,suiteHash:plan.suiteHash,
    complete,executedTurns:state.results.length,behaviorPassed:complete&&results.every(row=>row.passed),results,
    execution:'offline',liveReady:false,releaseReady:false,persistence:'injected store round-trip only',requiredLiveProof:transcriptReplayManifest.requiredLiveProof};
}

/** Store must supply read(sessionId) and CAS write({session,expectedRevision}). All dependencies are offline. */
export async function replayTranscriptOffline(plan,{dispatch,store,timeoutMs=5000,signal}={}){
  plan=validatePlan(plan);
  if(typeof dispatch!=='function'||!store||typeof store.read!=='function'||typeof store.write!=='function'
    ||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||signal!==undefined&&!(signal instanceof AbortSignal))fail('invalid_dependencies');
  const controller=new AbortController(),composed=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  let timer;const wait=async operation=>{
    if(composed.aborted)fail('cancelled');
    let aborted;
    try{const result=await Promise.race([Promise.resolve().then(()=>operation(composed)),new Promise((_,reject)=>{timer=setTimeout(()=>{
      controller.abort();const error=new Error('Offline dependency deadline exceeded.');error.code='dependency_timeout';reject(error);
    },timeoutMs);}),new Promise((_,reject)=>{aborted=()=>reject(new Error('Offline replay cancelled.'));composed.addEventListener('abort',aborted,{once:true});})]);
      if(composed.aborted)fail('cancelled');return result;
    }catch{fail(composed.aborted?'dependency_timeout_or_cancelled':'dependency_failed');}
    finally{clearTimeout(timer);if(aborted)composed.removeEventListener('abort',aborted);}
  };
  let state=await wait(s=>store.read(plan.sessionId,{signal:s}));
  state=state===null?initialState(plan):validateState(state,plan);
  if(state.pending)fail('uncertain_pending_turn');
  const save=async next=>{
    const before=state.revision;next=validateState(next,plan);
    await wait(s=>store.write({session:structuredClone(next),expectedRevision:before,signal:s}));
    const actual=bounded(await wait(s=>store.read(plan.sessionId,{signal:s})));
    if(!isDeepStrictEqual(actual,next))fail('store_readback_mismatch');
    state=next;
  };
  for(let index=state.results.length;index<4;index++){
    const testCase={...plan.cases[index],history:historyFrom(state)},requestHash=hash(testCase);
    const pending={...state,revision:state.revision+1,pending:{caseId:testCase.id,turnId:testCase.turnId,requestHash},
      turns:[...state.turns,{id:testCase.turnId+':user',caseId:testCase.id,role:'user',content:testCase.question}]};
    await save(pending);
    let raw;
    try{raw=await wait(s=>dispatch({sessionId:plan.sessionId,turnId:testCase.turnId,testCase:structuredClone(testCase),
      fixture:transcriptReplayFixture(plan),signal:s}));}catch{fail(composed.aborted?'dispatch_timeout_or_cancelled':'dispatch_failed');}
    const envelope=checkedEnvelope(raw,plan,testCase),result={caseId:testCase.id,turnId:testCase.turnId,requestHash,envelope,responseHash:hash(envelope)};
    await save({...state,revision:state.revision+1,pending:null,results:[...state.results,result],
      turns:[...state.turns,{id:testCase.turnId+':assistant',caseId:testCase.id,role:'assistant',content:envelope.body.answer}]});
  }
  return {session:structuredClone(state),report:gradeTranscriptReplay(plan,state)};
}

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runAnswerVerification} from '../../server/answerVerification.js';
import {reviewMatchesEvidence,answerLinksSupported,validEvidence,verifyEvidenceAnswer} from '../../server/answerVerificationModel.js';
import {accountEvidence,planAccountLookup,publicTopics} from '../../server/answerVerificationAccount.js';

const draft={status:'answered',answer:'The unpaid balance is NT$900.',citations:[],proposedAction:{kind:'create_task',label:'Review fees',payload:{title:'Review fees'}}};
const evidence=[{id:'fees',content:'Tuition 1000, paid 400, balance 600.',url:'/school-affairs/records'}];

test('LangGraph rejects a wrong draft, reloads records, corrects, and verifies a second time',async()=>{
  const order:string[]=[],steps:any[]=[];
  const result=await runAnswerVerification({question:'What do I owe?',initialAnswer:draft,
    loadEvidence:async({attempt})=>{order.push('read:'+attempt);return evidence;},
    verify:async({candidate})=>{order.push('verify');return {ok:candidate.answer==='NT$600 remains.'};},
    repair:async({candidate})=>{order.push('correct');return {...candidate,answer:'NT$600 remains.'};},
    onProgress:step=>steps.push(step),
  });
  assert.deepEqual(order,['read:1','verify','read:2','correct','verify']);
  assert.equal(result.answer,'NT$600 remains.');
  assert.deepEqual(result.verification,{status:'verified',attempts:2});
  assert.deepEqual(result.proposedAction,draft.proposedAction); // Only proposed, never executed.
  assert.ok(steps.some(step=>step.kind==='verification-retry'));
  assert.deepEqual(result.activity?.map(step=>step.kind),['verification-1','verification-retry','verification-2']);
});

test('a second unsupported draft is withheld together with its proposed action',async()=>{
  let reads=0,repairs=0;
  const result=await runAnswerVerification({question:'What do I owe?',initialAnswer:draft,
    loadEvidence:async()=>{reads++;return evidence;},verify:async()=>({ok:false}),repair:async()=>{repairs++;return draft;},
  });
  assert.equal(reads,2);assert.equal(repairs,1);
  assert.equal(result.status,'abstained');assert.equal(result.verification.status,'unverified');
  assert.match(result.answer,/could not verify/);assert.doesNotMatch(result.answer,/900/);
  assert.equal(result.proposedAction,undefined);assert.deepEqual(result.citations,[]);
});

test('supported answers finish without a correction or duplicate read',async()=>{
  let reads=0;
  const result=await runAnswerVerification({question:'Fees?',initialAnswer:draft,loadEvidence:async()=>{reads++;return evidence;},verify:async()=>({ok:true}),repair:async()=>{throw new Error('must not repair');}});
  assert.equal(reads,1);assert.equal(result.verification.attempts,1);
});

test('expired budget and hung readers never release the draft',async()=>{
  const result=await runAnswerVerification({question:'Fees?',initialAnswer:draft,deadline:Date.now()+510,
    loadEvidence:async()=>new Promise(()=>{}),verify:async()=>({ok:true}),repair:async()=>draft});
  assert.equal(result.verification.status,'unverified');assert.equal(result.proposedAction,undefined);
});

test('unavailable verifier fails closed; broken progress callbacks do not affect validity',async()=>{
  const result=await runAnswerVerification({question:'Fees?',initialAnswer:draft,loadEvidence:async()=>evidence,
    verify:async()=>{throw new Error('provider down');},repair:async()=>draft,onProgress:()=>{throw new Error('closed stream');}});
  assert.equal(result.verification.status,'unverified');assert.equal(result.verification.attempts,2);
});

test('verbatim evidence quotes and every material claim must pass independently',()=>{
  const good={supported:true,answersQuestion:true,claims:[{claim:'600 remains',supported:true,evidenceId:'fees',quote:'balance 600'}]};
  assert.equal(reviewMatchesEvidence(good,evidence),true);
  assert.equal(reviewMatchesEvidence({...good,answersQuestion:false},evidence),false);
  assert.equal(reviewMatchesEvidence({...good,claims:[{...good.claims[0],quote:'balance 900'}]},evidence),false);
  assert.equal(reviewMatchesEvidence({...good,claims:[{...good.claims[0],evidenceId:'another-account'}]},evidence),false);
  assert.equal(reviewMatchesEvidence({...good,claims:[]},evidence),false);
  assert.equal(reviewMatchesEvidence({...good,claims:[...good.claims,{...good.claims[0],supported:false}]},evidence),false);
  assert.equal(validEvidence([...evidence,...evidence]),false);
});

test('image-derived approval needs an actual attached image; links require an exact supplied source',()=>{
  const review={supported:true,answersQuestion:true,claims:[{claim:'image claim',supported:true,evidenceId:'attached-image',quote:''}]};
  assert.equal(reviewMatchesEvidence(review,[],false),false);
  assert.equal(reviewMatchesEvidence(review,[],true),true);
  assert.equal(answerLinksSupported('[Records](/school-affairs/records)',evidence),true);
  assert.equal(answerLinksSupported('[Pay](https://evil.test/pay?token=secret)',evidence),false);
  assert.equal(answerLinksSupported('Visit https://evil.test/pay',evidence),false);
});

test('JSON evidence accepts formatting-only spaces but rejects changed field values or invented joins',()=>{
 const sources=[{id:'fees',content:JSON.stringify({amountDue:28000,amountPaid:5000,label:'Sample tuition',currency:'TWD'})}];
 const review=(quote:string)=>({supported:true,answersQuestion:true,claims:[{claim:'23000 remains',supported:true,evidenceId:'fees',quote}]});
 assert.equal(reviewMatchesEvidence(review('"amountDue": 28000, "amountPaid": 5000'),sources),true);
 assert.equal(reviewMatchesEvidence(review('Sample tuition'),sources),true);
 assert.equal(reviewMatchesEvidence(review('"amountDue": 999999, "amountPaid": 5000'),sources),false);
 assert.equal(reviewMatchesEvidence(review('"amountDue": 28000, "currency": "TWD"'),sources),false);
 assert.equal(reviewMatchesEvidence(review('"label": "Sampletuition"'),sources),false);
 assert.equal(reviewMatchesEvidence(review('"amountDue":28000..."amountPaid":5000'),sources),false);
});

test('private projection excludes admin records, health, contact and another user even when a snapshot includes them',()=>{
  const snapshot={checkedAt:'2026-11-12T01:00:00Z',profile:{userId:'mine',role:'student',email:'mine@example.test'},
    admin:{secret:'not-for-this-tool'},studentAid:{records:[{userId:'mine',subsidyAmount:500,phone:'private-phone',maskedIdentityNumber:'private-id'},{userId:'someone-else',subsidyAmount:999}]},
    housing:{applications:[{userId:'mine',receiptNumber:'receipt',healthNotes:'private-health',address:'private-address'}]},
  };
  const sources=accountEvidence(snapshot,['studentAid','housing']);
  const text=JSON.stringify(sources);
  assert.match(text,/receipt/);assert.match(text,/500/);
  for(const secret of ['not-for-this-tool','private-phone','private-id','someone-else','999','private-health','private-address','mine@example.test'])assert.ok(!text.includes(secret),secret);
  assert.ok(!sources.some(source=>source.id==='account:profile'));
});

test('oversized collections explicitly report omitted rows and do not imply a complete history',()=>{
  const rows=Array.from({length:500},(_,i)=>({title:'assignment-'+i,details:'x'.repeat(1000)}));
  const source=accountEvidence({assignments:rows},['assignments']).find(item=>item.id==='account:assignments')!;
  const data=JSON.parse(source.content);
  assert.equal(data.excerpted,true);assert.equal(data.availableRows,500);assert.ok(data.includedRows<500);
  assert.ok(source.content.length<26000);
});

test('missing provider configuration cannot silently mark a factual draft verified',async()=>{
  const old=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
  try {await assert.rejects(()=>verifyEvidenceAnswer({question:'Fees?',candidate:draft,evidence,deadline:Date.now()+10000}));}
  finally {if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

test('planner validates capability names and falls back to own-record tools only',async()=>{
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='test';
  globalThis.fetch=async()=>new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({tools:['arbitrary_sql'],publicTopics:['https://evil.test']})}]}]}));
  try {
    const plan=await planAccountLookup('My balance and school rules',[],'',Date.now()+10000);
    assert.equal(plan.degraded,true);assert.ok(!plan.tools.includes('arbitrary_sql'));assert.deepEqual(plan.publicTopics,[]);
    assert.ok(Object.values(publicTopics).every(query=>query.startsWith('Shu-Te University')));
  } finally {globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});

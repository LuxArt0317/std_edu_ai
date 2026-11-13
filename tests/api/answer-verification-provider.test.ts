import assert from 'node:assert/strict';
import {test} from 'node:test';
import {verificationModelCall,verifyEvidenceAnswer} from '../../server/answerVerificationModel.js';
import {runAnswerVerification} from '../../server/answerVerification.js';

test('detailed report reviews have capacity for independent claims without changing planner budgets',async()=>{
 const savedFetch=globalThis.fetch,savedKey=process.env.OPENAI_API_KEY;
 const requests:any[]=[];
 const records=Array.from({length:48},(_,index)=>({label:'Synthetic row '+index,credits:index/2}));
 const claims=records.map((record,index)=>({claim:record.label+' credits '+record.credits,supported:true,evidenceId:'report',quotes:[],jsonPaths:[`/records/${index}/label`,`/records/${index}/credits`]}));
 process.env.OPENAI_API_KEY='test';
 globalThis.fetch=async(_url,init)=>{
  const request=JSON.parse(String(init?.body));requests.push(request);
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported:true,answersQuestion:true,claims})}]}]});
 };
 try {
  const result=await verifyEvidenceAnswer({question:'Show the saved report',candidate:{status:'answered',answer:claims.map(claim=>claim.claim).join('\n'),citations:[]},evidence:[{id:'report',content:JSON.stringify({records})}],deadline:Date.now()+55000});
  assert.equal(result.ok,true);
  assert.equal(requests[0].max_output_tokens,8192);
  assert.ok(requests[0].text.format.schema.properties.claims.maxItems>=claims.length);
  assert.equal(requests[0].store,false);
  await verificationModelCall('account_lookup_plan',{},'Plan only',{},Date.now()+5000);
  assert.equal(requests[1].max_output_tokens,2400);
 } finally {globalThis.fetch=savedFetch;if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;}
});

test('incomplete reviews remain withheld with safe diagnostic codes and no record or provider text in logs',async()=>{
 const savedFetch=globalThis.fetch,savedKey=process.env.OPENAI_API_KEY,savedWarn=console.warn;
 const logs:unknown[][]=[];process.env.OPENAI_API_KEY='test';console.warn=(...args)=>logs.push(args);
 globalThis.fetch=async()=>Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[{content:[{type:'output_text',text:'PRIVATE_RECORD_SENTINEL'}]}]});
 try {
  const draft={status:'answered',answer:'Private candidate',citations:[],proposedAction:{kind:'create_task'}};
  const result=await runAnswerVerification({question:'My report',initialAnswer:draft,loadEvidence:async()=>[{id:'record',content:'Private evidence'}],
   verify:async()=>verificationModelCall('answer_evidence_review',{},'',{},Date.now()+5000),repair:async()=>draft});
  assert.equal(result.status,'abstained');assert.equal(result.verification.attempts,2);
  assert.equal(result.verification.reason,'verification_output_limit');assert.equal(result.proposedAction,undefined);
  assert.deepEqual(result.citations,[]);assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_RECORD|Private candidate|Private evidence/);
  globalThis.fetch=async()=>{throw new DOMException('PRIVATE_NETWORK_SENTINEL','TimeoutError');};
  await assert.rejects(()=>verificationModelCall('answer_evidence_review',{},'',{},Date.now()+5000),{code:'VERIFICATION_TIMEOUT'});
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_NETWORK/);
 } finally {globalThis.fetch=savedFetch;console.warn=savedWarn;if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;}
});

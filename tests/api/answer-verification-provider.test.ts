import assert from 'node:assert/strict';
import {test} from 'node:test';
import {repairEvidenceAnswer,verificationModelCall,verifyEvidenceAnswer} from '../../server/answerVerificationModel.js';
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
  assert.equal(requests[1].reasoning.effort,'low');
  const previousEscalation=process.env.OPENAI_VERIFICATION_ESCALATION_MODEL;
  process.env.OPENAI_VERIFICATION_ESCALATION_MODEL='test-deeper-model';
  try{
    await verificationModelCall('correct_grounded_answer',{},'Use the same evidence',{},Date.now()+5000,[],true);
    assert.equal(requests[2].model,'test-deeper-model');
    assert.equal(requests[2].reasoning.effort,'medium');
    assert.equal(requests[2].max_output_tokens,4096);
    assert.equal(requests[2].store,false);
  }finally{
    if(previousEscalation===undefined)delete process.env.OPENAI_VERIFICATION_ESCALATION_MODEL;
    else process.env.OPENAI_VERIFICATION_ESCALATION_MODEL=previousEscalation;
  }
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

test('replacement and independent review both require precise missing fields without echoing unsupported values',async()=>{
 const originalFetch=globalThis.fetch,savedKey=process.env.OPENAI_API_KEY;
 const requests:{instructions:string;text:{format:{name:string}}}[]=[];
 process.env.OPENAI_API_KEY='test';
 globalThis.fetch=async(_url,init)=>{
  const request=JSON.parse(String(init?.body));requests.push(request);
  const result=request.text.format.name==='correct_grounded_answer'
    ?{status:'answered',answer:'The quota and the announcement date are unavailable in this directory.',sourceIds:['directory']}
    :{supported:true,answersQuestion:true,claims:[{claim:'The directory provides no quota or announcement date.',supported:true,evidenceId:'directory',
      quotes:['Campus directory: Computer Center and Academic Affairs.'],jsonPaths:[]}]};
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
 };
 try{
  const question='What is the storage quota and its announcement date?';
  const evidence=[{id:'directory',title:'Campus directory',url:'/school-affairs',content:'Campus directory: Computer Center and Academic Affairs.'}];
  const deadline=Date.now()+15000;
  const candidate=await repairEvidenceAnswer({question,candidate:{status:'answered',answer:'20 GB from March 1, 2026.',citations:[]},
    evidence,deadline,feedback:['The source has no storage notice.'],deeperReview:true});
  assert.doesNotMatch(candidate.answer,/20 GB|March 1/u);
  assert.equal((await verifyEvidenceAnswer({question,candidate,evidence,deadline,deeperReview:true})).ok,true);
  assert.deepEqual(requests.map(row=>row.text.format.name),['correct_grounded_answer','answer_evidence_review']);
  assert.match(requests[0].instructions,/Omit unsupported candidate values even in examples, alternatives and disclaimers/u);
  assert.match(requests[1].instructions,/Reject a draft that repeats an unsupported candidate value/u);
 }finally{
  globalThis.fetch=originalFetch;
  if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;
 }
});

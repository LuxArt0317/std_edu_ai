import {withAssistantModel} from '../../server/assistantModelConfig.js';
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

test('quota exhaustion stops model retries while a transient rate limit can still get another check',async t=>{
 const savedKey=process.env.OPENAI_API_KEY;
 process.env.OPENAI_API_KEY='test';
 t.after(()=>{if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;});
 const warning=t.mock.method(console,'warn',()=>{});
 let requests=0;
 let code='credit_balance_exhausted',type='insufficient_quota';
 t.mock.method(globalThis,'fetch',async()=>{
  requests++;
  if(requests===1)return Response.json({error:{code,type,message:'RAW PROVIDER TEXT'}},{status:429});
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"ok":true}'}]}]});
 });
 const candidate={status:'answered',answer:'Saved record',citations:[]};
 let repairs=0;
 const run=()=>runAnswerVerification({question:'What is saved?',initialAnswer:candidate,
  loadEvidence:async()=>[{id:'record',content:'Saved record'}],
  verify:()=>verificationModelCall('answer_evidence_review',{},'',{},Date.now()+5000),
  repair:async()=>{repairs++;return candidate;}});
 const exhausted=await run();
 assert.equal(exhausted.status,'abstained');
 assert.deepEqual(exhausted.verification,{status:'unverified',attempts:1,reason:'provider_quota_exhausted'});
 assert.equal(requests,1);
 assert.equal(repairs,0);
 assert.match(exhausted.answer,/AI service has run out of credits/u);
 assert.doesNotMatch(exhausted.answer,/try again in a moment/u);
 assert.ok(exhausted.activity?.some(step=>step.label==='Answer checker unavailable'&&step.status==='unavailable'));
 assert.match(JSON.stringify(exhausted.activity),/automatic evidence reviewer is unavailable/u);
 assert.doesNotMatch(JSON.stringify([exhausted,warning.mock.calls.map(call=>call.arguments)]),/RAW PROVIDER TEXT/u);
 requests=0;code='rate_limit_exceeded';type='rate_limit_error';
 const recovered=await run();
 assert.deepEqual(recovered.verification,{status:'verified',attempts:2});
 assert.equal(requests,2);
 assert.equal(repairs,1);
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

test('verified public captures use bounded public composition without replacing mixed account instructions', async()=>{
 const savedFetch=globalThis.fetch,savedKey=process.env.OPENAI_API_KEY,requests:any[]=[];
 process.env.OPENAI_API_KEY='test';
 globalThis.fetch=async(_url,init)=>{requests.push(JSON.parse(String(init?.body)));return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"ok":true}'}]}]});};
 const schema={type:'object',properties:{sourceIds:{type:'array',items:{type:'string'}}}};
 try{
  await verificationModelCall('compose_grounded_answer',schema,'ACCOUNT CONTRACT SENTINEL',{evidence:[{id:'public-page:verified',content:'Published content'}]},Date.now()+40000);
  assert.doesNotMatch(requests[0].instructions,/ACCOUNT CONTRACT SENTINEL/);
  assert.deepEqual(requests[0].text.format.schema.properties.sourceIds.items.enum,['public-page:verified']);
  assert.match(requests[0].instructions,/exact values.*url or urls/);
  await verificationModelCall('compose_grounded_answer',schema,'ACCOUNT CONTRACT SENTINEL',{evidence:[{id:'public-page:verified',content:'Published content'},{id:'account:grades',content:'Owned record'}]},Date.now()+40000);
  assert.equal(requests[1].instructions,'ACCOUNT CONTRACT SENTINEL');
  assert.equal(requests[1].text.format.schema.properties.sourceIds.items.enum,undefined);
 }finally{globalThis.fetch=savedFetch;if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;}
});

test('focus-only repair still rejects the draft and requires valid references',async()=>{
 const savedFetch=globalThis.fetch,savedKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test';
 const evidence=[{id:'public-document:test',content:JSON.stringify({rule:'Complete and sign the application form.'})}],candidate={status:'answered',answer:'Complete and sign the application form.',citations:[]};
 let reference='/rule';
 globalThis.fetch=async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported:true,answersQuestion:false,claims:[{claim:candidate.answer,supported:true,evidenceId:evidence[0].id,quotes:[],jsonPaths:[reference]}]})}]}]});
 try{
  const verdict=await verifyEvidenceAnswer({question:'Explain the requirements',candidate,evidence,deadline:Date.now()+10000});
  assert.equal(verdict.ok,false);assert.equal(verdict.answerFocusOnly,true);assert.ok(verdict.feedback?.length);
  reference='/missing';
  const invalid=await verifyEvidenceAnswer({question:'Explain the requirements',candidate,evidence,deadline:Date.now()+10000});assert.equal(invalid.answerFocusOnly,false);
 }finally{globalThis.fetch=savedFetch;if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;}
});
test('public review is scoped while mixed account review retains its contracts',async()=>{
 const savedFetch=globalThis.fetch,savedKey=process.env.OPENAI_API_KEY,requests:any[]=[];process.env.OPENAI_API_KEY='test';
 globalThis.fetch=async(_url,init)=>{requests.push(JSON.parse(String(init?.body)));return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"ok":true}'}]}]});};
 try{
  await verificationModelCall('answer_evidence_review',{},'ACCOUNT CONTRACT SENTINEL',{evidence:[{id:'public-document:test',content:'Published facts'}]},Date.now()+10000);
  assert.doesNotMatch(requests[0].instructions,/ACCOUNT CONTRACT SENTINEL/);assert.match(requests[0].instructions,/RFC6901/);
  await verificationModelCall('answer_evidence_review',{},'ACCOUNT CONTRACT SENTINEL',{evidence:[{id:'public-document:test',content:'Published facts'},{id:'account:grades',content:'Private record'}]},Date.now()+10000);
  assert.equal(requests[1].instructions,'ACCOUNT CONTRACT SENTINEL');
 }finally{globalThis.fetch=savedFetch;if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;}
});

test('an answer-model selection preserves the independently configured source auditor',async()=>{
 const nativeFetch=globalThis.fetch,names=['OPENAI_API_KEY','OPENAI_VERIFICATION_MODEL'] as const;
 const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 process.env.OPENAI_API_KEY='unit-test';process.env.OPENAI_VERIFICATION_MODEL='independent-review-model';
 const requests:any[]=[];
 globalThis.fetch=async(_url,options)=>{requests.push(JSON.parse(String(options?.body)));return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{}'}]}]});};
 try{
  await withAssistantModel({model:'selected-answer-model',reasoning:'medium'},async()=>{
   await verificationModelCall('compose_grounded_answer',{},'Compose',{},Date.now()+5000);
   await verificationModelCall('answer_evidence_review',{},'Review',{},Date.now()+5000);
  });
  assert.equal(requests[0].model,'selected-answer-model');assert.equal(requests[1].model,'independent-review-model');
 }finally{globalThis.fetch=nativeFetch;for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {prepareEvaluationJudgeContext} from './judge-context.mjs';
import {createEvaluationLab} from './server.mjs';
import {faqImportVersion,faqDocumentHash} from './cases.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const publicRun={id:'fixture-public-run',caseId:'survey-faq-q45',scope:'public',question:'When does enrollment start?',expectedAnswer:'A historical document deadline is listed.',expected:{noAction:true},statusCode:200,response:{answer:'Applications opened May 20, 2026 for this historical cohort.',citations:[{url:'/source-documents/ipiac-115/index.html'}],verification:{status:'verified'}}};

test('public context adds checked source facts without trusting a saved verification flag',async()=>{
 const context=await prepareEvaluationJudgeContext(root,publicRun);
 assert.equal(context.methodVersion,'public-source-context-v1');
 assert.match(JSON.stringify(context.input.independentPublicSources.sources),/May 20|5 月 20|5月20/u);
 assert.equal(context.input.reference,publicRun.expectedAnswer);assert.equal(context.input.response,publicRun.response.answer);
 assert.equal(context.input.verification,undefined);
 assert.ok(context.evidenceSummary.sources.every(source=>/^[a-f0-9]{64}$/u.test(source.checksum)));
 assert.equal(JSON.stringify(context.evidenceSummary).includes('excerpt'),false);
 const account=await prepareEvaluationJudgeContext(root,{...publicRun,scope:'account'});
 assert.equal(account.methodVersion,'reference-only-v1');assert.equal(account.input.independentPublicSources,undefined);
});

test('shared judge endpoint versions context and appends history without changing weights or older results',async()=>{
 const beforeFetch=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test';
 const prior={score:65,model:'gpt-6.1-terra',summary:'Preserved older review'};
 let state={version:1,faqImportVersion,faqDocumentHash:faqDocumentHash(),cases:[],runs:[{...structuredClone(publicRun),judge:prior,judgeHistory:[prior]}]};let reviewed=false;
 globalThis.fetch=async(url,options)=>{
  if(String(url)==='https://api.openai.com/v1/models')return Response.json({data:[{id:'gpt-6.1-terra'}]});
  assert.equal(String(url),'https://api.openai.com/v1/responses');const request=JSON.parse(options.body);
  assert.equal(request.text.format.name,'evaluation_match_review');
  const input=JSON.parse(request.input[0].content[0].text);assert.ok(input.independentPublicSources.sources.length>0);
  assert.match(request.instructions,/not required student-facing content/u);reviewed=true;
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({correctness:4,completeness:4,relevance:4,communication:4,summary:'Test review',strengths:[],gaps:[]})}]}]});
 };
 try{
  const handler=createEvaluationLab(root,{storage:{load:async()=>structuredClone(state),save:async value=>{state=structuredClone(value);}}});
  let result,status;const response={setHeader(){},set statusCode(value){status=value;},end(value){result=JSON.parse(value);}};
  await handler({url:'/__evaluation_lab/judge',method:'POST',headers:{host:'127.0.0.1:5173','content-type':'application/json'},body:{runId:publicRun.id,model:'gpt-6.1-terra'}},response);
  assert.equal(status,200);assert.equal(reviewed,true);assert.equal(result.judge.score,80);
  assert.equal(result.judge.methodVersion,'public-source-context-v1');assert.equal(state.runs[0].judgeHistory.length,2);
  assert.deepEqual(state.runs[0].judgeHistory[0],prior);assert.equal(state.runs[0].response.answer,publicRun.response.answer);
 }finally{globalThis.fetch=beforeFetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('private current reconstruction is ephemeral, method-versioned and explicitly not historical proof',async()=>{
 const evidence=[{id:'account:charges',url:'/school-affairs/services/39-1',content:JSON.stringify({amountDue:12345.67})}];
 const summary={methodVersion:'account-source-context-v1',actorAttested:false,temporalComparability:'current-reconstruction-only',sources:[{id:'account:charges',checksum:'a'.repeat(64)}]};
 const result=await prepareEvaluationJudgeContext(root,{...publicRun,scope:'account'},{accountContext:{evidence,summary}});
 assert.equal(result.methodVersion,'account-source-context-v1');assert.deepEqual(result.input.independentAccountSources.evidence,evidence);
 assert.match(result.instructions,/record drift/u);assert.match(result.instructions,/absent from the reference/u);
 assert.doesNotMatch(JSON.stringify(result.evidenceSummary),/12345/u);
 const missing=await prepareEvaluationJudgeContext(root,{...publicRun,scope:'account'},{accountContext:{evidence:[],summary:{reason:'different_actor'}}});
 assert.equal(missing.methodVersion,'reference-only-v1');assert.equal(missing.input.independentAccountSources,undefined);
});
test('private judge resolver receives exact case snapshot and request, stores only redacted summary and preserves prior reviews',async()=>{
 const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test';
 const row={id:'survey-faq-q03',version:7,scope:'account',route:'/school-affairs/services/39-1',question:'Can I see my real-time tuition and fee payment status?'};
 const prior={score:45,summary:'Prior reference-only review'};
 const run={...publicRun,id:'private-fixture',caseId:row.id,caseVersion:row.version,scope:'account',question:row.question,actor:{id:'server-current-caller'},judge:prior,judgeHistory:[prior]};
 let state={version:1,faqImportVersion,faqDocumentHash:faqDocumentHash(),cases:[row],runs:[run]};let calls=0;
 const summary={methodVersion:'account-source-context-v1',sources:[{id:'account:charges',checksum:'b'.repeat(64)}],actorAttested:false,temporalComparability:'current-reconstruction-only'};
 globalThis.fetch=async(url,options)=>{
  if(String(url)==='https://api.openai.com/v1/models')return Response.json({data:[{id:'gpt-6.1-terra'}]});
  assert.equal(String(url),'https://api.openai.com/v1/responses');const request=JSON.parse(options.body),input=JSON.parse(request.input[0].content[0].text);
  assert.match(JSON.stringify(input.independentAccountSources),/EPHEMERAL_PRIVATE_SOURCE/u);
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({correctness:4,completeness:4,relevance:4,communication:4,summary:'Current evidence reviewed',strengths:[],gaps:[]})}]}]});
 };
 try{
  const handler=createEvaluationLab(root,{resolveAccountJudgeEvidence:async(saved,snapshot,request)=>{calls++;assert.equal(saved.id,run.id);assert.equal(snapshot.version,7);assert.equal(snapshot.route,row.route);assert.equal(request.headers.authorization,'Bearer SERVER_SESSION');return {evidence:[{id:'account:charges',content:'EPHEMERAL_PRIVATE_SOURCE'}],summary};},storage:{load:async()=>structuredClone(state),save:async value=>{state=structuredClone(value);}}});
  let status,result;const response={setHeader(){},set statusCode(value){status=value;},end(value){result=JSON.parse(value);}};
  await handler({url:'/__evaluation_lab/judge',method:'POST',headers:{host:'127.0.0.1:5173',authorization:'Bearer SERVER_SESSION','content-type':'application/json'},body:{runId:run.id,model:'gpt-6.1-terra'}},response);
  assert.equal(status,200);assert.equal(calls,1);assert.equal(result.judge.score,80);assert.equal(result.judge.methodVersion,'account-source-context-v1');
  assert.deepEqual(state.runs[0].judgeHistory[0],prior);assert.equal(state.runs[0].judgeHistory.length,2);
  assert.doesNotMatch(JSON.stringify(state),/EPHEMERAL_PRIVATE_SOURCE|SERVER_SESSION/u);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

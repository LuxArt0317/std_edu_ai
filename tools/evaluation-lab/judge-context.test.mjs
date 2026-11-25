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

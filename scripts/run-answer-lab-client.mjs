/** One local browser-client evaluation; reference text goes only to the judge. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const args=process.argv.slice(2), option=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1]};
const origin='http://127.0.0.1:5173';
const caseId=option('only',''),label=option('label','client-'+Date.now());
if(!/^survey-faq-q\d{2}$/.test(caseId)||!/^[-a-zA-Z0-9_]{1,80}$/.test(label))throw Error('Specify one --only survey-faq-qNN and a safe --label.');
const request=async(op,value)=>{const response=await fetch(origin+'/__evaluation_lab/'+op,{method:value?'POST':'GET',headers:value?{'Content-Type':'application/json'}:{},body:value?JSON.stringify(value):undefined,signal:AbortSignal.timeout(65000)});const body=await response.json();if(!response.ok)throw Error(body.error||'Lab request failed');return body};
const state=await request('state'),item=state.cases.find(c=>c.id===caseId&&!c.archivedAt);
if(!item)throw Error('Question not found');
if(item.scope==='account')throw Error('A verified browser account session is required; guest runner cannot claim account acceptance.');
const priorId=option('history-run','');
const prior=priorId?state.runs.find(run=>run.id===priorId&&run.caseId===item.id&&typeof run.response?.answer==='string'):null;
if(priorId&&!prior)throw Error('History run must be a saved answer for this question.');
if(item.attachments?.length)throw Error('This focused runner does not hydrate attachments; run this case in the lab UI.');
const history=prior?[{role:'user',content:prior.question},{role:'assistant',content:prior.response.answer}]:(item.history||[]);
const model=option('model','gpt-6-luna'),evaluatorModel=option('evaluator-model','gpt-6.1-terra'),reasoning='medium';
const browser=await chromium.launch({headless:true,channel:"chrome"});
try{
 // Execute the shared client on the real origin without mounting Vite's HMR
 // application: unrelated local edits must not destroy an in-flight paid run.
 const page=await browser.newPage();
 await page.route(origin+'/__answer_lab_runner__',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Answer Lab client runner</title>'}));
 await page.goto(origin+'/__answer_lab_runner__',{waitUntil:'domcontentloaded'});
 const start=Date.now();
 const outcome=await page.evaluate(async({question,history,route,model,reasoning})=>{
  const {askWebsiteAssistant}=await import('/src/services/websiteAssistant.ts');
  const {createLabChatTransport}=await import('/tools/evaluation-lab/chat-transport.mjs');
  const dispatched=[],execution={client:'website-assistant',authenticated:false,entryPoint:'public-client',route,dispatched};
  try{return {response:await askWebsiteAssistant({question,history,route,transport:createLabChatTransport({model,reasoning,onDispatch:path=>dispatched.push(path)}),signal:AbortSignal.timeout(90000)}),statusCode:200,execution,error:null};}
  catch(error){return {response:{},statusCode:error.status||0,error:error.message,execution};}
 },{question:item.question,history,route:item.route,model,reasoning});
 const {run}=await request('result',{caseId:item.id,caseVersion:item.version,batchId:label,model,reasoning,...outcome,elapsedMs:Date.now()-start});
 console.log(JSON.stringify({event:'answer-saved',caseId,runId:run.id,statusCode:outcome.statusCode,error:outcome.error}));
 const result={runId:run.id,caseId,caseVersion:item.version,historyRunId:prior?.id||null,...outcome};
 if(outcome.response.answer&&!outcome.error){try{const {judge}=await request('judge',{runId:run.id,model:evaluatorModel,reasoning});result.judge=judge;}catch(error){result.judgeError=error.message;}}
 const directory='.evaluation-lab/client-runs';await fs.mkdir(directory,{recursive:true,mode:0o700});await fs.writeFile(directory+'/'+label+'.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({event:'finished',caseId,score:result.judge?.score??null,answer:outcome.response.answer,judge:result.judge}));
}finally{await browser.close();}

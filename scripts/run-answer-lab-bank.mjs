/** Local evaluation-bank runner. References travel only to the separate judge. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {runParallelCases,createPacedDispatch} from '../tools/evaluation-lab/parallel-runs.mjs';
const args=process.argv.slice(2), option=(name,fallback)=>{const at=args.indexOf('--'+name);return at<0?fallback:args[at+1]};
const origin=option('origin','http://127.0.0.1:5173'), url=new URL(origin);
if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/'||url.username||url.password)throw Error('Only a loopback local lab is supported.');
const scope=option('scope','public');if(!['public','account','all'].includes(scope))throw Error('Invalid scope');
const label=option('label','bank-'+Date.now());if(!/^[a-zA-Z0-9_-]{1,80}$/.test(label))throw Error('Invalid label');
const concurrency=Number(option('concurrency','3')),only=option('only','').split(',').filter(Boolean);
const directory=path.resolve('.evaluation-lab/bank-runs',label);await fs.mkdir(directory,{recursive:true,mode:0o700});
const leasePath=path.join(directory,'active.lock');const lease=await fs.open(leasePath,'wx',0o600).catch(()=>{throw Error('This run is active or has an unresolved lock; inspect its PID before resuming.');});await lease.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await lease.close();
const controller=new AbortController();process.on('SIGINT',()=>controller.abort());process.on('SIGTERM',()=>controller.abort());
let token=process.env.STU_LAB_ACCOUNT_TOKEN||'';
if(option('token-file','')){const secret=JSON.parse(await fs.readFile(option('token-file'), 'utf8'));token=secret.access_token||secret.token||'';}
const request=async(op,body,timeout=45000)=>{const r=await fetch(origin+'/__evaluation_lab/'+op,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error||'Lab request failed'),{status:r.status});return value};
const write=async(name,value)=>{const target=path.join(directory,name),temp=target+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await fs.rename(temp,target)};
const emit=value=>console.log(JSON.stringify({...value,at:new Date().toISOString()}));
try{
 const state=await request('state');
 const model=option('model',state.model||'gpt-6-luna'),evaluatorModel=option('evaluator-model',state.evaluatorModel||'gpt-6.1-terra'),reasoning=option('reasoning','medium');
 const cases=state.cases.filter(c=>!c.archivedAt&&(scope==='all'||c.scope===scope)&&(!only.length||only.includes(c.id))).sort((a,b)=>a.id.localeCompare(b.id));
 const batchId='bank-'+randomUUID(),manifest={label,origin,model,evaluatorModel,reasoning,batchId,createdAt:new Date().toISOString(),cases:cases.map(({id,version,scope})=>({id,version,scope})),executionMethod:'api-only; no browser, UI or signed-in client acceptance is implied',referencePolicy:'Question reference is sent only to the separate judge via saved run ID, never to the answering endpoint.'};
 await write('manifest.json',manifest);emit({event:'start',label,cases:cases.length,model,evaluatorModel,concurrency});
 const pace=createPacedDispatch(5200);const observed=[];
 const pool=await runParallelCases(cases,{concurrency,signal:controller.signal,run:async(item,control)=>{
  const prior=await fs.readFile(path.join(directory,item.id+'.json'),'utf8').then(JSON.parse).catch(()=>null);
  if(prior?.caseVersion===item.version&&prior.judge?.score!==undefined){observed.push(prior);emit({event:'resume',caseId:item.id,score:prior.judge.score});return;}
  if(item.scope==='account'&&!token){const value={caseId:item.id,caseVersion:item.version,skipped:'No verified account session supplied.'};observed.push(value);await write(item.id+'.json',value);emit({event:'skipped',caseId:item.id,reason:value.skipped});return;}
  if(!await pace(controller.signal)||control.isStopped())return;
  emit({event:'answer-start',caseId:item.id});const start=Date.now();let body={},statusCode=0,error=null;
  try{
   const images=await Promise.all((item.attachments||[]).map(async(file)=>{const r=await fetch(origin+'/__evaluation_lab/attachment?id='+encodeURIComponent(file.id));if(!r.ok)throw Error('Attachment unavailable');return{name:file.name,dataUrl:'data:'+(r.headers.get('Content-Type')||'image/png')+';base64,'+Buffer.from(await r.arrayBuffer()).toString('base64')}}));
   const r=await fetch(origin+item.endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-STU-Evaluation-Model':model,'X-STU-Evaluation-Reasoning':reasoning,...(item.scope==='account'?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({question:item.question,route:item.route,history:item.history||[],images,stream:false,consentedResearchUse:false}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(125000)])});statusCode=r.status;body=await r.json();if(!r.ok)error=body.error||'Assistant failed';
   if(r.ok&&r.headers.get('X-STU-Evaluation-Model')!==model)error='Selected model was not acknowledged';
  }catch(e){error=e.message;}
  const execution={client:'api-only',entryPoint:'api-only',route:item.route,dispatched:[item.endpoint]};
  const saved=await request('result',{caseId:item.id,caseVersion:item.version,batchId,execution,response:body,statusCode,model,reasoning,elapsedMs:Date.now()-start,error});
  const value={caseId:item.id,caseVersion:item.version,runId:saved.run.id,execution,model,evaluatorModel,statusCode,error,answer:body.answer||'',response:body,elapsedMs:Date.now()-start};
  observed.push(value);await write(item.id+'.json',value);emit({event:'answer-saved',caseId:item.id,statusCode,error,ms:value.elapsedMs});
  if(statusCode===429){control.stop();return;}
  if(body.answer&&!error&&!control.isStopped()){
   try{const result=await request('judge',{runId:saved.run.id,model:evaluatorModel,reasoning},50000);value.judge=result.judge;}
   catch(e){value.judgeError=e.message;if(e.status===429)control.stop();}
   await write(item.id+'.json',value);emit({event:'scored',caseId:item.id,score:value.judge?.score??null,error:value.judgeError||null});
  }
 }});
 const summary={...manifest,finishedAt:new Date().toISOString(),stopped:pool.stopped,errors:pool.errors.map(({index,error})=>({caseId:cases[index].id,error:error.message})),completed:observed.length,atLeast70:observed.filter(r=>r.judge?.score>=70).length,below70:observed.filter(r=>r.judge&&r.judge.score<70).map(r=>({caseId:r.caseId,score:r.judge.score})),unscored:observed.filter(r=>!r.judge).map(r=>r.caseId)};await write('summary.json',summary);emit({event:'finished',completed:summary.completed,atLeast70:summary.atLeast70,below70:summary.below70,unscored:summary.unscored,errors:summary.errors});
}finally{token='';await fs.rm(leasePath,{force:true});}

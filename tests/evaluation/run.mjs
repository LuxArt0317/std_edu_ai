import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {discoverSurfaces} from './surface-inventory.mjs';
import {buildPublicCases} from './public-cases.mjs';
import {buildServiceCases} from './service-cases.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {fixtureForCase} from './fixtures.mjs';
import {gradeCase} from './grading.mjs';
import {assessCoverage} from './coverage.mjs';

process.umask(0o077);
const root=fileURLToPath(new URL('../../',import.meta.url));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function options(args){
  const result={mode:'inventory',only:'',domain:'',now:new Date().toISOString(),origin:'https://stu.best',maxCases:Infinity};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(!['--mode','--only','--domain','--now','--origin','--out','--fixture-module','--max-cases','--browser-acceptance'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Unknown or incomplete option: '+key);
    const value=args[++i];result[{'--fixture-module':'fixtureModule','--max-cases':'maxCases','--browser-acceptance':'browserAcceptance'}[key]||key.slice(2)]=value;
  }
  if(!['inventory','retrieval','draft','live'].includes(result.mode))throw new Error('Mode must be inventory, retrieval, draft or live.');
  if(!Number.isFinite(Date.parse(result.now)))throw new Error('Provide an ISO evaluation time.');
  if(result.maxCases!==Infinity){result.maxCases=Number(result.maxCases);if(!Number.isInteger(result.maxCases)||result.maxCases<1)throw new Error('max-cases must be a positive integer.');}
  return result;
}
export async function sourceIdentity(){
  const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const changes=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});
  const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(Boolean))].sort();
  const digest=createHash('sha256');
  for(const file of files){digest.update(file+'\0');try{for await(const chunk of createReadStream(resolve(root,file)))digest.update(chunk);}catch(error){if(error.code!=='ENOENT')throw error;digest.update('DELETED');}digest.update('\0');}
  return {sourceRevision,workingTreeHash:digest.digest('hex'),dirty:changes.length>0};
}
export async function evaluationSuite(now){
  const inventory=await discoverSurfaces();
  const cases=[...buildServiceCases(),...buildAccountCases({now}),...buildPublicCases(inventory)];
  const ids=new Set();
  for(const item of cases){if(!item.id||ids.has(item.id))throw new Error('Duplicate or missing case ID: '+item.id);ids.add(item.id);}
  return {inventory,cases,suiteHash:hash(cases)};
}
async function saveReport(path,report){
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const temp=path+'.tmp';await writeFile(temp,JSON.stringify(report,null,2),{mode:0o600});await rename(temp,path);
}
export async function readReply(response){
  const text=await response.text();
  if(text.length>2_000_000)throw new Error('Assistant response exceeds the evaluation limit.');
  if(!response.headers.get('content-type')?.includes('text/event-stream'))return {body:JSON.parse(text),events:[]};
  const events=[];let body,terminal=false;
  for(const block of text.split(/\r?\n\r?\n/)){
    const type=block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
    if(!data)continue;
    const value=JSON.parse(data);
    if(terminal)throw new Error('Assistant emitted data after its terminal stream event.');
    if(type==='result'){body=value;terminal=true;}
    else if(type==='progress'){if(events.length>=100)throw new Error('Assistant emitted too many progress events.');events.push(value);}
    else if(type==='error'){body={error:value.error||'Stream failed'};terminal=true;}
  }
  if(!body)throw new Error('Assistant stream ended without a result.');
  return {body,events};
}
export function validateFixtureAdapter(adapter){
  if(!adapter||!['prepare','forCase','cleanup'].every(key=>typeof adapter[key]==='function'))throw new Error('A live fixture adapter must implement prepare, forCase and verified cleanup before any fixture is created.');
}
export async function deploymentIdentity(origin,signal){
  try{
    const target=new URL(origin);
    if(origin!==target.origin||target.username||target.password||!(target.origin==='https://stu.best'||['localhost','127.0.0.1'].includes(target.hostname)))throw new Error('Unexpected deployment origin');
    const response=await fetch(new URL('/release.json',origin),{redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});
    if(response.status!==200||response.redirected||response.url&&response.url!==new URL('/release.json',origin).href||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw new Error('No deployment manifest');
    const reader=response.body?.getReader();if(!reader)throw new Error('No manifest body');
    const chunks=[];let bytes=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096)throw new Error('Oversized manifest');chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    // Match the build-generated schema; a local HEAD or test-supplied SHA is not
    // evidence of what an independently deployed endpoint is running.
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='builtAt,environment,revision,source,version'||
      value.version!==1||!/^[a-f0-9]{40}$/.test(value.revision||'')||value.source!=='vercel-git'||
      !['production','preview'].includes(value.environment)||target.origin==='https://stu.best'&&value.environment!=='production'||
      typeof value.builtAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.builtAt)||!Number.isFinite(Date.parse(value.builtAt))||new Date(value.builtAt).toISOString()!==value.builtAt)throw new Error('Invalid deployment manifest');
    return {verified:true,sourceRevision:value.revision};
  }catch{return {verified:false,sourceRevision:'unknown'};}
}
export function gradeRetrievalCase(testCase,evidence,metadata={}){
  const expected=testCase.expected?.retrieval;
  const required=expected?.requiredText||[],forbidden=expected?.forbiddenText||[];
  const text=JSON.stringify(expected?.sourceId?evidence.filter(row=>row.id===expected.sourceId):evidence);
  const checks=[...required.map(value=>({id:'retrieval.required',passed:text.includes(String(value)),detail:String(value)})),
    ...forbidden.map(value=>({id:'retrieval.forbidden',passed:!text.includes(String(value)),detail:String(value)}))];
  if(expected?.sourceId)checks.unshift({id:'retrieval.source',passed:evidence.some(row=>row.id===expected.sourceId),detail:expected.sourceId});
  if(!required.length&&!forbidden.length){
    return {caseId:testCase.id,domain:testCase.domain,...metadata,execution:'deterministic',executed:false,passed:false,failureKind:'setup',checks:[],failures:[{id:'retrieval.noAssertions',detail:'This case has no independent retrieval content assertions; run its endpoint behavior evaluation instead.'}]};
  }
  return {caseId:testCase.id,domain:testCase.domain,...metadata,execution:'deterministic',executed:true,passed:checks.every(row=>row.passed),failureKind:checks.some(row=>!row.passed)?'behavior':null,checks,failures:checks.filter(row=>!row.passed)};
}
export function assessRun(report,{cases,inventory,requestedSuite,sourceRevision,browserAcceptance}){
  const assessment=assessCoverage({cases,results:report.results,inventory,requestedSuite,sourceRevision,browserAcceptance,requireLive:true});
  const integrity=[];
  if(report.runFailure)integrity.push({id:'run.executionFailed',detail:report.runFailure});
  if(report.results.some(row=>row.response?.fixtureIntegrityFailed))integrity.push({id:'run.fixtureReadbackFailed',detail:'Post-request fixture integrity could not be verified.'});
  if(report.cleanup?.complete!==true)integrity.push({id:'run.cleanupUnverified',detail:'Disposable fixture cleanup has not been verified.'});
  if(report.sourceUnchanged!==true)integrity.push({id:'run.sourceChanged',detail:'Release inputs changed during evaluation.'});
  if(report.dirty!==false)integrity.push({id:'run.dirtySource',detail:'The evaluated source has uncommitted changes.'});
  if(report.mode==='live'&&(!report.deployment?.verified||report.deployment.sourceRevision!==sourceRevision))integrity.push({id:'run.deploymentMismatch',detail:'The target deployment could not be matched to the evaluated source revision.'});
  assessment.integrity={passed:integrity.length===0,failures:integrity};
  assessment.failures.push(...integrity);
  if(integrity.length){assessment.releaseReady=false;assessment.passed=false;assessment.releaseBlockers.push(...integrity.map(row=>row.id));}
  return assessment;
}
export async function main(args=process.argv.slice(2)){
  const opt=options(args),identity=await sourceIdentity(),suite=await evaluationSuite(opt.now),runId=randomUUID();
  const selected=suite.cases.filter(row=>(!opt.only||row.id.startsWith(opt.only))&&(!opt.domain||row.domain===opt.domain)).slice(0,opt.maxCases);
  if(!selected.length)throw new Error('No cases match.');
  const out=resolve(root,opt.out||`artifacts/assistant-evaluation/${opt.mode}-${runId}.json`);
  if(relative(resolve(root,'artifacts/assistant-evaluation'),out).startsWith('..')||!out.endsWith('.json'))throw new Error('Reports must be JSON under artifacts/assistant-evaluation.');
  let browserAcceptance;
  if(opt.browserAcceptance){
    const path=resolve(root,opt.browserAcceptance),contents=await readFile(path,'utf8');
    if(contents.length>2_000_000)throw new Error('Browser acceptance proof exceeds the evaluation limit.');
    browserAcceptance=JSON.parse(contents);
  }
  const report={version:1,runId,mode:opt.mode,startedAt:new Date().toISOString(),evaluationTime:opt.now,...identity,suiteHash:suite.suiteHash,inventoryHash:suite.inventory.hash,
    browserEvidence:browserAcceptance?{sha256:hash(browserAcceptance),sourceRevision:browserAcceptance.sourceRevision}:null,
    selectedCases:selected.map(row=>row.id),totalCases:suite.cases.length,inventory:suite.inventory,results:[],cleanup:{required:opt.mode==='live',complete:opt.mode!=='live'}};
  if(opt.mode==='inventory'){
    report.cases=suite.cases;report.assessment=assessCoverage({cases:suite.cases,results:[],inventory:suite.inventory,sourceRevision:identity.sourceRevision,requireLive:true});
    await saveReport(out,report);console.log(JSON.stringify({mode:opt.mode,cases:suite.cases.length,services:suite.inventory.services.length,tools:suite.inventory.tools.length,publicPages:suite.inventory.publicPages.length,report:relative(root,out),releaseReady:false}));return report;
  }
  const controller=new AbortController();const interrupt=()=>controller.abort();process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  let adapter;
  try{
    if(opt.mode==='live'){
      const config=JSON.parse(await readFile(resolve(root,'deployment.json'),'utf8')),origin=new URL(opt.origin);
      if(origin.origin!==config.vercel.productionUrl&&!['127.0.0.1','localhost'].includes(origin.hostname))throw new Error('Live evaluation must target the exact configured client origin or loopback.');
      report.deployment=await deploymentIdentity(opt.origin,controller.signal);
      if(opt.fixtureModule){
        const modulePath=resolve(root,opt.fixtureModule);
        if(relative(resolve(root,'tests/evaluation'),modulePath).startsWith('..'))throw new Error('Fixture adapters must be repository evaluation modules.');
        adapter=await import(pathToFileURL(modulePath).href);
        validateFixtureAdapter(adapter);
        await adapter.prepare({runId,cases:selected,now:opt.now,origin:opt.origin,signal:controller.signal});
      }else if(selected.some(row=>row.fixtureKey!=='anonymous'))throw new Error('Signed-in live cases require an explicit disposable fixture adapter; no real account is inferred.');
    }
    const modules=opt.mode==='draft'||opt.mode==='retrieval'?await Promise.all([import('../../server/affairsAnswer.js'),import('../../server/answerVerificationAccount.js'),import('../../server/schoolAffairsDirectory.js')]):null;
    for(const testCase of selected){
      if(controller.signal.aborted)break;
      const started=Date.now();let envelope,fixtureReady=false,executed=false,phase='setup';
      try{
        if(opt.mode==='live'){
          const context=testCase.fixtureKey==='anonymous'?{}:await adapter.forCase(testCase,{signal:controller.signal});
          fixtureReady=testCase.fixtureKey!=='anonymous';
          if(testCase.fixtureKey!=='anonymous'&&typeof context.token!=='string')throw new Error('Private live fixture did not supply its own session.');
          const endpoint=testCase.endpoint||(testCase.fixtureKey==='anonymous'?'/api/research-assistant':'/api/affairs-assistant');
          if(!['/api/research-assistant','/api/affairs-assistant'].includes(endpoint))throw new Error('Unsupported evaluation endpoint.');
          phase='infrastructure';executed=true;
          const response=await fetch(new URL(endpoint,opt.origin),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(context.token?{Authorization:'Bearer '+context.token}:{})},
            body:JSON.stringify({question:testCase.question,history:testCase.history||[],route:testCase.route,stream:true,consentedResearchUse:false}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(65000)])});
          envelope={statusCode:response.status,...await readReply(response),execution:'live-model',fixtureKey:testCase.fixtureKey,sourceRevision:report.deployment.sourceRevision};
          const expectedStatus=testCase.expected.expectedStatusCode||testCase.expected.statusCode;
          if(response.status>=500||response.status===429||envelope.body?.error&&response.status!==expectedStatus)envelope.failureKind='infrastructure';
        }else{
          if(testCase.expected.expectedStatusCode===401)throw new Error('Authentication behavior requires endpoint execution; draft mode does not simulate successful denial.');
          const snapshot=testCase.mode==='navigation'?null:fixtureForCase(testCase,{now:opt.now});
          if(opt.mode==='retrieval'){
            const evidence=modules[1].accountEvidence(snapshot,testCase.expected.requiredTools||[],{question:testCase.question,route:testCase.route,history:testCase.history||[]});
            const result=gradeRetrievalCase(testCase,evidence,{sourceRevision:identity.sourceRevision,fixtureKey:testCase.fixtureKey,elapsedMs:Date.now()-started});
            report.results.push(result);await saveReport(out,report);continue;
          }
          executed=true;phase='infrastructure';
          const body=testCase.mode==='navigation'?modules[2].answerDirectoryQuestion(testCase.question,testCase.route):await modules[0].answerPrivateAffairsQuestion(testCase.question,snapshot,testCase.history||[],testCase.route,{draftOnly:true});
          envelope={statusCode:200,body:body||{status:'abstained',answer:'No deterministic answer'},events:[],execution:'deterministic',fixtureKey:testCase.fixtureKey,sourceRevision:identity.sourceRevision};
        }
      }catch(error){envelope={statusCode:0,body:{error:error instanceof Error?error.message:'Evaluation request failed'},events:[],failureKind:phase,execution:opt.mode==='live'?'live-model':'deterministic',fixtureKey:testCase.fixtureKey,sourceRevision:opt.mode==='live'?report.deployment?.sourceRevision||'unknown':identity.sourceRevision};}
      finally{
        if(fixtureReady&&adapter?.afterCase){
          try{await adapter.afterCase(testCase,envelope,{signal:controller.signal});}
          catch(error){envelope.statusCode=0;envelope.body={error:error instanceof Error?error.message:'Fixture readback failed'};envelope.fixtureIntegrityFailed=true;envelope.failureKind='infrastructure';}
        }
      }
      envelope.elapsedMs=Date.now()-started;
      envelope.executed=executed;
      const result=gradeCase(testCase,envelope);report.results.push({...result,executed,failureKind:envelope.failureKind||(result.passed?null:'behavior'),response:envelope});
      console.log(JSON.stringify({case:testCase.id,passed:result.passed,failures:result.failures.map(row=>row.id),ms:envelope.elapsedMs}));
      await saveReport(out,report);
    }
  }catch(error){
    report.runFailure=error instanceof Error?error.message:'Evaluation initialization failed';
    throw error;
  }finally{
    if(adapter?.cleanup){try{const proof=await adapter.cleanup();report.cleanup.complete=proof?.verified===true;report.cleanup.proof=proof?.verified===true?{verified:true}:null;}catch(error){report.cleanup.complete=false;report.cleanup.error=error instanceof Error?error.message:'Fixture cleanup failed';}}
    else report.cleanup.complete=true;
    process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
    report.finishedAt=new Date().toISOString();
    const finalIdentity=await sourceIdentity();
    report.sourceUnchanged=finalIdentity.sourceRevision===identity.sourceRevision&&finalIdentity.workingTreeHash===identity.workingTreeHash;
    report.assessment=assessRun(report,{cases:suite.cases,inventory:suite.inventory,sourceRevision:identity.sourceRevision,browserAcceptance,requestedSuite:selected.length===suite.cases.length?'full':'subset'});
    await saveReport(out,report);
  }
  console.log(JSON.stringify({report:relative(root,out),...report.assessment.totals,releaseReady:report.assessment.releaseReady,cleanup:report.cleanup.complete}));
  if(!report.assessment.releaseReady)process.exitCode=1;
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});

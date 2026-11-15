import {lstat,mkdir,mkdtemp,readFile,rename,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCounselingHostedEvaluation} from './live-fixtures.mjs';
import {main as runEvaluation,sourceIdentity} from './run.mjs';
import {counselingHostedCases} from './counseling-appointment-hosted.mjs';
import {healthMetadataFamily,healthMetadataLiveCases} from './health-examination-live.mjs';
import {createTrustedPreviewFetch,isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const packetCases={health:healthMetadataLiveCases().map(row=>row.id),counseling:counselingHostedCases().map(row=>row.id)};
const packets=Object.keys(packetCases);

export function packetVerdict(packet,report,origin,sourceRevision){
  const expected=packetCases[packet],health=packet==='health';
  const pin=health?report?.deploymentPin:report?.deployment;
  const cleanup=health?report?.cleanup?.complete===true&&report?.cleanup?.proof?.verified===true:report?.cleanup?.verified===true;
  const terminal=health?Boolean(report?.finishedAt)&&report?.sourceUnchanged===true
    &&report.mode==='live'&&report.caseFamily===healthMetadataFamily&&report.injectedDependencies===false:report?.terminal===true;
  const results=Array.isArray(report?.results)?report.results:[];
  const observed=new Map(results.filter(row=>expected.includes(row?.caseId)&&(!health||row.executed===true)).map(row=>[row.caseId,row]));
  const passed=Array.from(observed.values()).filter(row=>row.passed===true).length;
  const complete=terminal&&cleanup&&report?.sourceRevision===sourceRevision&&pin?.origin===origin&&pin?.sourceRevision===sourceRevision
    &&pin.status==='finished'&&pin.issued===expected.length&&pin.completed===expected.length
    &&results.length===expected.length&&results.every((row,index)=>row?.caseId===expected[index]
      &&typeof row.passed==='boolean'&&(health?row.executed===true&&row.response?.fixtureReadback?.verified===true:row.requestIndex===index+1));
  const accepted=complete&&passed===expected.length&&(health||report.liveAcceptance===true);
  return {status:accepted?'passed':complete&&passed<expected.length?'failed':'incomplete',
    expected:expected.length,executed:observed.size,passed,failed:observed.size-passed,cleanup:cleanup?'verified':'unproven'};
}

async function privateDirectory(path){
  try{await mkdir(path,{mode:0o700});}
  catch(error){if(error.code!=='EEXIST')throw error;}
  const info=await lstat(path);
  if(!info.isDirectory()||info.uid!==process.getuid()||(info.mode&0o077)!==0)
    throw new Error('The evaluation output directory must be owned by you and have owner-only permissions.');
}

async function writePrivateReport(path,value){
  const temp=path+'.next';
  await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  await rename(temp,path);
}

async function readPrivateReport(path){
  try{
    const info=await lstat(path);
    if(!info.isFile()||info.uid!==process.getuid()||(info.mode&0o077)!==0||info.size>16_000_000)return null;
    return JSON.parse(await readFile(path,'utf8'));
  }catch{return null;}
}

async function runHealth({origin,path}){
  const previousExitCode=process.exitCode;
  try{
    // The generic runner reports a subset as ineligible to release the entire
    // application. Packet acceptance is graded below, independently of that.
    await runEvaluation(['--mode','live','--case-family',healthMetadataFamily,'--origin',origin,
      '--approved-preview-origin',origin,'--preview-auth','oidc','--fixture-module','tests/evaluation/live-fixtures.mjs','--out',path]);
  }finally{process.exitCode=previousExitCode;}
}

async function runCounseling({origin,sourceRevision,path,signal}){
  await writePrivateReport(path,{sourceRevision,origin,terminal:false,results:[],cleanup:null});
  await runCounselingHostedEvaluation({origin,sourceRevision,previewToken:process.env.VERCEL_OIDC_TOKEN,
    signal,onCheckpoint:value=>writePrivateReport(path,value)});
}

export async function runAccountPacketCli(args,{selection=packets}={}){
  const [origin,sourceRevision,option,...extra]=args;
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??'')
    ||option!==undefined&&option!=='--preflight'||extra.length)
    throw new Error('Supply the exact protected Preview origin and full deployed revision. Add --preflight for a local check.');
  const identity=await sourceIdentity();
  if(identity.dirty||identity.sourceRevision!==sourceRevision)
    throw new Error('Use the exact clean deployed checkout before running a protected packet.');
  if(option==='--preflight'){
    const result={mode:'preflight',sourceRevision,packets:selection.map(packet=>({packet,cases:packetCases[packet].length})),dispatched:0};
    console.log(JSON.stringify(result));
    return result;
  }

  createTrustedPreviewFetch({origin,token:process.env.VERCEL_OIDC_TOKEN});
  const artifacts=join(root,'artifacts'),reportRoot=join(artifacts,'assistant-evaluation');
  await privateDirectory(artifacts);
  await privateDirectory(reportRoot);
  const directory=await mkdtemp(join(reportRoot,'protected-account-'+sourceRevision.slice(0,12)+'-'));
  const manifest=join(directory,'summary.json');
  const controller=new AbortController();
  const interrupt=()=>controller.abort();
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  const rows=selection.map(packet=>({packet,path:join(directory,packet+'.json'),status:'pending',
    expected:packetCases[packet].length,executed:0,passed:0,failed:0,cleanup:'not-started'}));
  const result=()=>({mode:'protected-preview',sourceRevision,manifest,packets:rows,passed:rows.every(row=>row.status==='passed')});
  try{
    await writePrivateReport(manifest,result());
    console.log(JSON.stringify(result()));
    for(const row of rows){
      const {packet,path}=row,health=rows.find(other=>other.packet==='health');
      if(controller.signal.aborted||packet==='counseling'&&health&&health.cleanup!=='verified'){
        row.status='blocked';
      }else{
        let rejected=false;
        row.status='running';row.cleanup='unproven';
        await writePrivateReport(manifest,result());
        try{
          const run=packet==='health'?runHealth:runCounseling;
          await run({origin,sourceRevision,path,signal:controller.signal});
        }catch{rejected=true;}
        Object.assign(row,packetVerdict(packet,await readPrivateReport(path),origin,sourceRevision));
        if(rejected)row.status='incomplete';
      }
      await writePrivateReport(manifest,result());
    }
    const summary=result();
    console.log(JSON.stringify(summary));
    if(!summary.passed)process.exitCode=1;
    return summary;
  }finally{process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runAccountPacketCli(process.argv.slice(2)).catch(error=>{
    console.error(error.message);process.exitCode=1;
  });
}

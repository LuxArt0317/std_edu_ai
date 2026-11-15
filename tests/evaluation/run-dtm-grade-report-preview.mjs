import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {runDtmGradeReportPreview} from './live-fixtures.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const [origin,sourceRevision,mode,...extra]=process.argv.slice(2);
if(extra.length||mode!==undefined&&mode!=='--overview'||!isEvaluationPreviewOrigin(origin)||!(/^[a-f0-9]{40}$/u.test(sourceRevision??'')))
  throw new Error('Supply the exact protected Preview origin, full source revision and optionally --overview.');
const suite=mode==='--overview'?'overview':'report';
const directory=resolve('artifacts/assistant-evaluation');
await mkdir(directory,{recursive:true,mode:0o700});
const controller=new AbortController();
const cancel=()=>controller.abort();
process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
try{
  const result=await runDtmGradeReportPreview({origin,sourceRevision,suite,previewToken:process.env.VERCEL_OIDC_TOKEN,
    signal:AbortSignal.any([controller.signal,AbortSignal.timeout(6*60_000)])});
  const path=resolve(directory,`dtm-grade-${suite}-${sourceRevision.slice(0,12)}-${result.runId}.json`);
  await writeFile(path,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({path,passed:result.liveAcceptance,cases:result.results.length,
    passedCases:result.results.filter(row=>row.passed).length,cleanup:result.cleanup,...(result.failure?{failure:result.failure}:{})}));
  if(!result.liveAcceptance)process.exitCode=1;
}catch(error){console.error(error.message);process.exitCode=1;}
finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}

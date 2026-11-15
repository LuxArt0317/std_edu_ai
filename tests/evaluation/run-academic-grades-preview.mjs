import {chmod,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {runAcademicGradesPreview} from './live-fixtures.mjs';
import {academicGradesPreviewCases} from './academic-grades-preview.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--preflight'){
  console.log(JSON.stringify({mode:'preflight',mounted:academicGradesPreviewCases().length}));
}else{
  const [origin,sourceRevision]=args;
  if(args.length!==2||!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
    throw new Error('Supply the exact protected Preview origin and full source revision.');
  const directory=resolve('artifacts/assistant-evaluation/academic-grades');
  await mkdir(directory,{recursive:true,mode:0o700});
  await chmod(directory,0o700);
  const controller=new AbortController(),cancel=()=>controller.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  try{
    const result=await runAcademicGradesPreview({origin,sourceRevision,previewToken:process.env.VERCEL_OIDC_TOKEN,
      signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10*60_000)])});
    const path=resolve(directory,sourceRevision.slice(0,12)+'-'+result.runId+'.json');
    await writeFile(path,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({path,cases:result.results.length,passed:result.liveAcceptance,cleanup:result.cleanup,
      ...(result.failure?{failure:result.failure}:{})}));
    if(!result.liveAcceptance)process.exitCode=1;
  }finally{
    process.off('SIGINT',cancel);process.off('SIGTERM',cancel);
  }
}

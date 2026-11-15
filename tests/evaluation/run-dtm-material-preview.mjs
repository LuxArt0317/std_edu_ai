import {lstat,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {dtmMaterialPreviewCases,dtmMaterialPreviewGaps} from './dtm-material-preview.mjs';
import {runDtmMaterialPreview} from './live-fixtures.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const [origin,sourceRevision,...extra]=process.argv.slice(2);
if(origin==='--preflight'&&sourceRevision===undefined){
  console.log(JSON.stringify({mode:'preflight',mounted:dtmMaterialPreviewCases().length,gaps:dtmMaterialPreviewGaps}));
}else{
  if(extra.length||!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
    throw new Error('Supply the exact protected Preview origin and full source revision.');
  const directory=resolve('artifacts/assistant-evaluation/dtm-materials');
  await mkdir(directory,{recursive:true,mode:0o700});
  const info=await lstat(directory);
  if(!info.isDirectory()||info.uid!==process.getuid()||(info.mode&0o777)!==0o700)
    throw new Error('Use an owner-only directory for Moodle material proof.');
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  try{
    const result=await runDtmMaterialPreview({origin,sourceRevision,previewToken:process.env.VERCEL_OIDC_TOKEN,
      signal:AbortSignal.any([controller.signal,AbortSignal.timeout(9*60_000)])});
    const path=resolve(directory,'dtm-material-'+sourceRevision.slice(0,12)+'-'+result.runId+'.json');
    await writeFile(path,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({path,liveAcceptance:result.liveAcceptance,cases:result.results.length,
      passedCases:result.results.filter(row=>row.passed).length,cleanup:result.cleanup,...(result.failure?{failure:result.failure}:{})}));
    if(!result.liveAcceptance)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}
  finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
}

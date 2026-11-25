import {mkdir,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {runClearanceStatusPreview} from './live-fixtures.mjs';
import {assertClearanceStatusTermIds} from './clearance-status-preview.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const [origin,sourceRevision,...termIds]=process.argv.slice(2);
if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
  throw new Error('Supply the exact protected Preview origin and full source revision.');
assertClearanceStatusTermIds(termIds);
const directory=resolve('artifacts/assistant-evaluation');
await mkdir(directory,{recursive:true,mode:0o700});
const controller=new AbortController();
const cancel=()=>controller.abort();
process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
let path;
try{
  const result=await runClearanceStatusPreview({origin,sourceRevision,termIds,previewToken:process.env.VERCEL_OIDC_TOKEN,
    signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10*60_000)]),
    async onCheckpoint(report){
      path??=resolve(directory,'clearance-status-'+sourceRevision.slice(0,12)+'-'+report.runId+'.json');
      await writeFile(path+'.tmp',JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
      await rename(path+'.tmp',path);
    },
  });
  console.log(JSON.stringify({path,passed:result.liveAcceptance,cases:result.results.length,cleanup:result.cleanup,
    ...(result.failure?{failure:result.failure}:{})}));
  if(!result.liveAcceptance)process.exitCode=1;
}catch{
  console.error('Graduation clearance evaluation could not complete.');
  process.exitCode=1;
}finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}

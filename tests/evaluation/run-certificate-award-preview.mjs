import {mkdir,mkdtemp,rename,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {certificateAwardPreviewManifest} from './certificate-award-preview.mjs';
import {runCertificateAwardPreview} from './live-fixtures.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const [origin,sourceRevision,...extra]=process.argv.slice(2);
if(origin==='--preflight'&&sourceRevision===undefined){
  console.log(JSON.stringify({mounted:certificateAwardPreviewManifest(),modelAcceptance:false,browserDispatchAcceptance:false},null,2));
}else{
  if(extra.length||!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
    throw new Error('Supply the exact protected Preview origin and full source revision.');
  const root=resolve('artifacts/assistant-evaluation');
  await mkdir(root,{recursive:true,mode:0o700});
  const path=join(await mkdtemp(join(root,'certificate-award-')),'report.json');
  const controller=new AbortController(),cancel=()=>controller.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  try{
    const result=await runCertificateAwardPreview({origin,sourceRevision,previewToken:process.env.VERCEL_OIDC_TOKEN,
      signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5*60_000)]),
      async onCheckpoint(report){
        await writeFile(path+'.tmp',JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
        await rename(path+'.tmp',path);
      }});
    console.log(JSON.stringify({path,passed:result.liveAcceptance,cases:result.results.length,cleanupVerified:result.cleanup.verified,
      ...(result.failure?{failure:result.failure}:{})}));
    if(!result.liveAcceptance)process.exitCode=1;
  }finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
}

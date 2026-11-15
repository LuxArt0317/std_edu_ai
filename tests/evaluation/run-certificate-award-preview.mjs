import {mkdir,mkdtemp,rename,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {certificateAwardPreviewManifest,certificateBrowserCaseIds} from './certificate-award-preview.mjs';
import {runCertificateAwardPreview} from './live-fixtures.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--preflight'){
  console.log(JSON.stringify({mounted:certificateAwardPreviewManifest(),browserCaseIds:certificateBrowserCaseIds,
    modelAcceptance:false,browserDispatchAcceptance:false},null,2));
}else{
  const browser=args[0]==='--browser';
  const [origin,sourceRevision,...extra]=browser?args.slice(1):args;
  if(extra.length||!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
    throw new Error('Supply the exact protected Preview origin and full source revision.');
  const root=resolve('artifacts/assistant-evaluation');
  await mkdir(root,{recursive:true,mode:0o700});
  const controller=new AbortController(),cancel=()=>controller.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  try{
    for(const browserCase of browser?certificateBrowserCaseIds:[undefined]){
      const artifactDirectory=await mkdtemp(join(root,browser?'certificate-browser-':'certificate-award-'));
      const path=join(artifactDirectory,'report.json');
      const result=await runCertificateAwardPreview({origin,sourceRevision,previewToken:process.env.VERCEL_OIDC_TOKEN,
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5*60_000)]),
        ...(browserCase?{browserCase,artifactDirectory}:{}),
        async onCheckpoint(report){
          await writeFile(path+'.tmp',JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
          await rename(path+'.tmp',path);
        }});
      console.log(JSON.stringify({path,browserCase,passed:result.liveAcceptance,cases:result.results.length,
        browserDispatchAcceptance:result.browserDispatchAcceptance,cleanupVerified:result.cleanup.verified,
        ...(result.failure?{failure:result.failure}:{})}));
      if(!result.liveAcceptance)process.exitCode=1;
      if(!result.cleanup.verified)break;
    }
  }finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
}

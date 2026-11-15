import {mkdir,mkdtemp,rename,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {confirmedAssignmentTrackerContract} from './confirmed-assignment-tracker-preview.mjs';
import {runConfirmedAssignmentTrackerPreview} from './live-fixtures.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const [origin,sourceRevision,...extra]=process.argv.slice(2);
if(origin==='--preflight'&&sourceRevision===undefined){
  console.log(JSON.stringify({contract:confirmedAssignmentTrackerContract,liveAcceptance:false,modelAcceptance:false,browserDispatchAcceptance:false},null,2));
}else{
  if(extra.length||!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
    throw new Error('Supply the exact protected Preview origin and full source revision.');
  const root=resolve('artifacts/assistant-evaluation');
  await mkdir(root,{recursive:true,mode:0o700});
  const path=join(await mkdtemp(join(root,'confirmed-assignment-tracker-')),'report.json');
  const controller=new AbortController(),cancel=()=>controller.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  try{
    const result=await runConfirmedAssignmentTrackerPreview({origin,sourceRevision,previewToken:process.env.VERCEL_OIDC_TOKEN,
      signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5*60_000)]),
      async onCheckpoint(report){
        await writeFile(path+'.tmp',JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
        await rename(path+'.tmp',path);
      }});
    console.log(JSON.stringify({path,passed:result.liveAcceptance,proposals:result.result?.proposalsChecked,
      confirmations:result.result?.actionRequestsChecked,cleanupVerified:result.cleanup.verified,
      ...(result.failure?{failure:result.failure}:{})}));
    if(!result.liveAcceptance)process.exitCode=1;
  }finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
}

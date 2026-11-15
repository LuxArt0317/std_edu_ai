import {mkdir,mkdtemp,rename,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {clubAttendanceBrowserCaseIds,findClubAttendanceBrowserCase} from './club-attendance-browser-preview.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--preflight'){
  const cases=await Promise.all(clubAttendanceBrowserCaseIds.map(findClubAttendanceBrowserCase));
  console.log(JSON.stringify({cases:cases.map(({id,mode,question,route})=>({id,mode,question,route})),
    liveAcceptance:false,browserDispatchAcceptance:false,modelAcceptance:false},null,2));
}else{
  const [origin,sourceRevision,browserCase,...rest]=args;
  if(rest.length||!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??'')
    ||!clubAttendanceBrowserCaseIds.includes(browserCase))
    throw new Error('Supply the exact protected Preview origin, full source revision, and one frozen Club Attendance case ID.');
  const {runClubAttendancePreview}=await import('./live-fixtures.mjs');
  const root=resolve('artifacts/assistant-evaluation');
  await mkdir(root,{recursive:true,mode:0o700});
  const artifactDirectory=await mkdtemp(join(root,'club-attendance-browser-'));
  const path=join(artifactDirectory,'report.json');
  const controller=new AbortController(),cancel=()=>controller.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  try{
    const result=await runClubAttendancePreview({origin,sourceRevision,previewToken:process.env.VERCEL_OIDC_TOKEN,
      signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5*60_000)]),browserCase,artifactDirectory,
      async onCheckpoint(report){
        await writeFile(path+'.tmp',JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
        await rename(path+'.tmp',path);
      }});
    console.log(JSON.stringify({path,browserCase,passed:result.liveAcceptance,cleanupVerified:result.cleanup.verified,
      ...(result.failure?{failure:result.failure}:{})}));
    if(!result.liveAcceptance)process.exitCode=1;
  }finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
}

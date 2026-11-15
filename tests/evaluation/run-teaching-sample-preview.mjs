import {mkdir,mkdtemp,rename,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildTeachingFeedbackNativeCases} from './teaching-feedback-native-cases.mjs';
import {teachingOriginalProtectedCases,teachingSampleCases} from './teaching-feedback-sample-hosted.mjs';
import {runTeachingSamplePreview} from './live-fixtures.mjs';

async function main(args){
  const original=args[0]==='--original';
  if(original)args=args.slice(1);
  const selectCases=original?teachingOriginalProtectedCases:teachingSampleCases;
  if(args.length===1&&args[0]==='--preflight'){
    const cases=selectCases();
    console.log(JSON.stringify({originalCases:buildTeachingFeedbackNativeCases().length,
      ...(original?{mountedOriginalCases:cases.length,zeroReadCases:cases.filter(row=>!row.views.length).length}:{sampleCases:cases.length}),
      nativeReadCases:cases.filter(row=>row.views.length).length,pairedOwnerVariants:[...new Set(cases.map(row=>row.variant))]}));
    return;
  }
  const [origin,sourceRevision,option,selected,...extra]=args;
  if(!origin||!sourceRevision||extra.length||option!==undefined&&(option!=='--cases'||!selected))
    throw new Error('Usage: node tests/evaluation/run-teaching-sample-preview.mjs [--original] <protected-preview-origin> <source-revision> [--cases case-id,case-id] or [--original] --preflight');
  const caseIds=selected?.split(',');
  selectCases(caseIds);
  const base=fileURLToPath(new URL('../../artifacts/assistant-evaluation/',import.meta.url));
  await mkdir(base,{recursive:true,mode:0o700});
  const reportPath=join(await mkdtemp(join(base,original?'teaching-original-':'teaching-feedback-')),'report.json');
  async function onCheckpoint(report){
    await writeFile(reportPath+'.tmp',JSON.stringify(report,null,2)+'\n',{mode:0o600});
    await rename(reportPath+'.tmp',reportPath);
  }
  const controller=new AbortController(),abort=()=>controller.abort();
  process.once('SIGINT',abort);
  process.once('SIGTERM',abort);
  try{
    const report=await runTeachingSamplePreview({origin,sourceRevision,caseIds,original,previewToken:process.env.VERCEL_OIDC_TOKEN,
      signal:controller.signal,onCheckpoint});
    console.log(JSON.stringify({reportPath,checked:report.results.length,passed:report.results.filter(row=>row.passed).length,
      cleanup:report.cleanup.verified,liveAcceptance:report.liveAcceptance}));
    if(!report.liveAcceptance)process.exitCode=1;
  }finally{
    process.off('SIGINT',abort);
    process.off('SIGTERM',abort);
  }
}
await main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});

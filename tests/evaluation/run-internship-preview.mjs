import {mkdir,mkdtemp,rename,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {internshipHostedCases,internshipFixtureKindForCase} from './internship-native-hosted.mjs';
import {runInternshipPreview} from './live-fixtures.mjs';

async function main(args){
  if(args.length===1&&args[0]==='--preflight'){
    const cases=internshipHostedCases();
    console.log(JSON.stringify({registered:30,mounted:cases.length,signed:cases.filter(row=>row.auth!=='anonymous').length,
      chargeCompanionCases:cases.filter(row=>row.observationExpectation.companion==='charges').length,exactReadCases:cases.filter(row=>row.observationExpectation.read).length,fixtureStates:[...new Set(cases.map(internshipFixtureKindForCase))]}));
    return;
  }
  const [origin,sourceRevision,option,selected,...extra]=args;
  if(!origin||!sourceRevision||extra.length||option!==undefined&&(option!=='--cases'||!selected))
    throw new Error('Usage: node tests/evaluation/run-internship-preview.mjs <protected-preview-origin> <source-revision> [--cases case-id,case-id] or --preflight');
  const caseIds=selected?.split(',');
  internshipHostedCases(caseIds);
  const directory=fileURLToPath(new URL('../../artifacts/assistant-evaluation/',import.meta.url));
  await mkdir(directory,{recursive:true,mode:0o700});
  const reportPath=join(await mkdtemp(join(directory,'internship-')),'report.json');
  async function onCheckpoint(report){
    await writeFile(reportPath+'.tmp',JSON.stringify(report,null,2)+'\n',{mode:0o600});
    await rename(reportPath+'.tmp',reportPath);
  }
  const controller=new AbortController(),abort=()=>controller.abort();
  process.once('SIGINT',abort);
  process.once('SIGTERM',abort);
  try{
    const report=await runInternshipPreview({origin,sourceRevision,caseIds,previewToken:process.env.VERCEL_OIDC_TOKEN,
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

import {runCounselingHostedEvaluation} from './live-fixtures.mjs';

const [origin,sourceRevision,...extra]=process.argv.slice(2);
if(!origin||!sourceRevision||extra.length){
  console.error('Usage: node tests/evaluation/run-counseling-preview.mjs <protected-preview-origin> <source-revision>');
  process.exitCode=2;
}else{
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  try{
    const report=await runCounselingHostedEvaluation({origin,sourceRevision,previewToken:process.env.VERCEL_OIDC_TOKEN,signal:controller.signal});
    console.log(JSON.stringify(report,null,2));
    if(!report.liveAcceptance)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}
  finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
}

import {runClubEquipmentPreview} from './live-fixtures.mjs';

const [origin,sourceRevision,mode,...extra]=process.argv.slice(2);
if(!origin||!sourceRevision||mode!==undefined&&mode!=='--confirmed-cancellation'||extra.length){
  console.error('Usage: node tests/evaluation/run-club-equipment-preview.mjs <protected-preview-origin> <source-revision> [--confirmed-cancellation]');
  process.exitCode=2;
}else{
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  try{
    const report=await runClubEquipmentPreview({origin,sourceRevision,previewToken:process.env.VERCEL_OIDC_TOKEN,signal:controller.signal,confirmedCancellation:mode==='--confirmed-cancellation'});
    console.log(JSON.stringify(report,null,2));
    if(!report.liveAcceptance)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}
  finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
}

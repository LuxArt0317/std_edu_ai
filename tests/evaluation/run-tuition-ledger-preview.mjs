import {stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {runTuitionLedgerPreview} from './live-fixtures.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const [origin,sourceRevision,...extra]=process.argv.slice(2);
if(extra.length||!isEvaluationPreviewOrigin(origin)||!(/^[a-f0-9]{40}$/u.test(sourceRevision??'')))
  throw new Error('Supply the exact protected Preview origin and full source revision.');
const path=resolve('artifacts/assistant-evaluation',`tuition-ledger-preview-${sourceRevision.slice(0,12)}.json`);
try{await stat(path);throw new Error('A tuition ledger report already exists for this revision.');}
catch(error){if(error.code!=='ENOENT')throw error;}

const controller=new AbortController();
const cancel=()=>controller.abort();
process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
try{
  const result=await runTuitionLedgerPreview({origin,sourceRevision,previewToken:process.env.VERCEL_OIDC_TOKEN,
    signal:AbortSignal.any([controller.signal,AbortSignal.timeout(6*60_000)])});
  await writeFile(path,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({path,passed:result.liveAcceptance,ownReads:result.ownHistoryReads,
    crossedReads:result.crossedHistoryReads,monthlyAnswers:result.verifiedMonthlyAnswers,anonymousDenial:result.anonymousDenial,
    cleanup:result.cleanup.tuitionLedgerCleanup,staffHttpVerified:result.staffHttpVerified}));
  if(!result.liveAcceptance)process.exitCode=1;
}catch(error){console.error(error.message);process.exitCode=1;}
finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}

import {writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {runConfirmedTaskPreview} from './live-fixtures.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const [origin,sourceRevision,...extra]=process.argv.slice(2);
if(extra.length||!isEvaluationPreviewOrigin(origin)||!(/^[a-f0-9]{40}$/u.test(sourceRevision??'')))
  throw new Error('Supply the exact protected Preview origin and full source revision.');
const path=resolve('artifacts/assistant-evaluation',`confirmed-tasks-${sourceRevision.slice(0,12)}.json`);
try{await stat(path);throw new Error('The exact confirmed task report already exists.');}
catch(error){if(error.code!=='ENOENT')throw error;}

const result=await runConfirmedTaskPreview({origin,sourceRevision,previewToken:process.env.VERCEL_OIDC_TOKEN,
  signal:AbortSignal.timeout(6*60_000)});
await writeFile(path,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify({path,passed:result.passed,proposals:result.proposalsChecked,requests:result.actionRequestsChecked,
  cleanup:result.cleanup.verified&&result.cleanup.taskActionCleanup}));

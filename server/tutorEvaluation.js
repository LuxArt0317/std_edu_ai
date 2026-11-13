import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {readFeeRemissionJson as readBoundedJson} from './feeRemissionContract.js';
import {parseTutorEvaluation,parseTutorEvaluationReceipt,validTutorEvaluation} from './tutorEvaluationContract.js';

async function tutorRpc(account,name,payload) {
  const remaining = Math.min(12000,(account.requestDeadline ?? Date.now()+12000)-Date.now());
  if (remaining <= 0) throw new AffairsWorkspaceError('Tutor evaluation timed out.');
  let response;
  try {
    response = await fetch(`${account.url}/rest/v1/rpc/${name}`,{
      method:'POST',headers:{apikey:account.key,Authorization:`Bearer ${account.token}`,'Content-Type':'application/json'},
      body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(remaining),
    });
  } catch {
    throw new AffairsWorkspaceError('Tutor evaluation is temporarily unavailable.');
  }
  if (!response.ok) {
    void response.body?.cancel().catch(()=>{});
    if (response.status === 409) throw new AffairsWorkspaceError('Tutor evaluation already submitted.',409);
    if ([400,413,422].includes(response.status)) throw new AffairsWorkspaceError('Check the evaluation responses.',400);
    if ([401,403].includes(response.status)) throw new AffairsWorkspaceError('Tutor evaluation is unavailable to this account.',403);
    throw new AffairsWorkspaceError('Tutor evaluation is temporarily unavailable.');
  }
  return readBoundedJson(response);
}

export async function loadTutorEvaluation(account) {
  return parseTutorEvaluation(await tutorRpc(account,'affairs_read_tutor_evaluation',{}),account.user.id);
}

export async function submitTutorEvaluation(account,payload) {
  if (!validTutorEvaluation(payload)) throw new AffairsWorkspaceError('Check the evaluation responses.',400);
  return parseTutorEvaluationReceipt(await tutorRpc(account,'affairs_submit_tutor_evaluation',{p_payload:payload}),
    account.user.id,payload.request_id);
}

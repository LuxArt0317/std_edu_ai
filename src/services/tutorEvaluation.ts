import {affairsClient} from '../features/public/affairs/authClient';
import {readFeeRemissionJson as readBoundedJson} from '../../server/feeRemissionContract.js';
import {parseTutorEvaluation,parseTutorEvaluationReceipt,tutorEvaluationKind,validTutorEvaluation,
  type TutorEvaluationSubmission} from '../../server/tutorEvaluationContract.js';

export class TutorEvaluationError extends Error {
  readonly status:number;
  constructor(status:number) {
    super('Tutor evaluation request failed.');
    this.status=status;
  }
}

async function request(userId:string,signal:AbortSignal,submission?:TutorEvaluationSubmission) {
  const bounded = AbortSignal.any([signal,AbortSignal.timeout(25000)]);
  async function currentToken() {
    bounded.throwIfAborted();
    const current = await affairsClient?.auth.getSession();
    bounded.throwIfAborted();
    if (!current || current.error || current.data.session?.user.id !== userId) throw new TutorEvaluationError(401);
    return current.data.session.access_token;
  }
  const token = await currentToken();
  const response = await fetch(submission ? '/api/affairs-action' : '/api/affairs-data?scope=tutor-evaluation',{
    method:submission?'POST':'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(submission?{'Content-Type':'application/json'}:{})},
    body:submission?JSON.stringify({kind:tutorEvaluationKind,payload:submission}):undefined,
    credentials:'omit',redirect:'error',cache:'no-store',signal:bounded,
  });
  if (!response.ok) {
    void response.body?.cancel().catch(()=>{});
    throw new TutorEvaluationError(response.status);
  }
  const result = await readBoundedJson(response);
  await currentToken();
  return result;
}
export async function readTutorEvaluation(userId:string,signal:AbortSignal) {
  return parseTutorEvaluation(await request(userId,signal),userId);
}
export async function saveTutorEvaluation(userId:string,submission:TutorEvaluationSubmission,signal:AbortSignal) {
  if (!validTutorEvaluation(submission)) throw new TutorEvaluationError(400);
  return parseTutorEvaluationReceipt(await request(userId,signal,submission),userId,submission.request_id);
}

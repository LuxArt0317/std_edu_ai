import {affairsClient} from '@/features/public/affairs/authClient';
import {creditTransferScope,creditTransferReview,parseCreditTransferRows,parseCreditTransferRow,
  type CreditTransferWrite} from '../../server/creditTransferContract.js';

export class CreditTransferError extends Error {
  readonly status:number;
  constructor(status:number) {
    super('Credit transfer request failed.');
    this.status=status;
  }
}

async function token(userId:string,signal:AbortSignal) {
  signal.throwIfAborted();
  const result=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(!result||result.error||result.data.session?.user.id!==userId)throw new CreditTransferError(401);
  return result.data.session.access_token;
}

async function request(userId:string,signal:AbortSignal|undefined,path:string,body?:CreditTransferWrite) {
  const timeout=AbortSignal.timeout(20000);
  const bounded=signal?AbortSignal.any([signal,timeout]):timeout;
  const access=await token(userId,bounded);
  const response=await fetch(path,{
    method:body?'POST':'GET',headers:{Authorization:'Bearer '+access,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',redirect:'error',signal:bounded,
  });
  if(!response.ok)throw new CreditTransferError(response.status);
  const value:unknown=await response.json();
  await token(userId,bounded);
  return value;
}

const scope='/api/affairs-data?scope='+creditTransferScope;

export async function readCreditTransfers(userId:string,signal:AbortSignal,selected?:string) {
  const result=await request(userId,signal,selected?scope+'-admin&'+new URLSearchParams({user_id:selected}):scope);
  const target=selected??userId;
  if(!result||typeof result!=='object'||!('userId' in result)||result.userId!==target||!('rows' in result))throw new CreditTransferError(503);
  return parseCreditTransferRows(result.rows,target);
}

export async function saveCreditTransfer(userId:string,target:string,signal:AbortSignal,action:CreditTransferWrite) {
  const value=await request(userId,signal,action.kind===creditTransferReview?'/api/affairs-manage':'/api/affairs-action',action);
  const row=parseCreditTransferRow(value,target);
  if(row.id!==action.payload.id||row.version!==action.payload.expected_version+1)throw new CreditTransferError(503);
  return row;
}

export function readCreditTransferAnswer(userId:string,question:string,signal?:AbortSignal) {
  return request(userId,signal,scope+'&answer='+(/[\u3400-\u9fff]/u.test(question)?'zh':'en'));
}

import {affairsClient} from '@/features/public/affairs/authClient';
import {
  withdrawalScope,withdrawalChange,withdrawalWindowChange,parseWithdrawalSnapshot,parseWithdrawalReceipt,
  type WithdrawalTerm,type WithdrawalAction,type WithdrawalWindowAction,type WithdrawalAnswer,
} from '../../server/courseWithdrawalContract.js';

export class CourseWithdrawalError extends Error {
  readonly status:number;
  constructor(status:number) {
    super('Course withdrawal request failed.');
    this.status=status;
  }
}

async function token(userId:string,signal:AbortSignal) {
  signal.throwIfAborted();
  const session=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(!session||session.error||session.data.session?.user.id!==userId)throw new CourseWithdrawalError(401);
  return session.data.session.access_token;
}

async function request(userId:string,signal:AbortSignal|undefined,path:string,body?:object) {
  const timeout=AbortSignal.timeout(20000);
  const bounded=signal?AbortSignal.any([signal,timeout]):timeout;
  const access=await token(userId,bounded);
  const response=await fetch(path,{
    method:body?'POST':'GET',headers:{Authorization:'Bearer '+access,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',redirect:'error',signal:bounded,
  });
  if(!response.ok)throw new CourseWithdrawalError(response.status);
  const result=await response.json();
  await token(userId,bounded);
  return result;
}

const dataPath='/api/affairs-data?scope='+withdrawalScope;

export async function readCourseWithdrawal(userId:string,signal:AbortSignal,term?:WithdrawalTerm) {
  const path=term?dataPath+'-admin&'+new URLSearchParams({year:String(term.academicYear),semester:String(term.semester)}):dataPath;
  return parseWithdrawalSnapshot(await request(userId,signal,path),userId,term);
}

export async function saveCourseWithdrawal(userId:string,signal:AbortSignal,payload:WithdrawalAction) {
  const result=await request(userId,signal,'/api/affairs-action',{kind:withdrawalChange,payload});
  return parseWithdrawalReceipt(result,userId,withdrawalChange,payload);
}

export async function saveWithdrawalWindow(userId:string,signal:AbortSignal,payload:WithdrawalWindowAction) {
  const result=await request(userId,signal,'/api/affairs-manage',{kind:withdrawalWindowChange,payload});
  return parseWithdrawalReceipt(result,userId,withdrawalWindowChange,payload);
}

export function readWithdrawalAnswer(userId:string,view:WithdrawalAnswer,question:string,signal?:AbortSignal) {
  return request(userId,signal,dataPath+'&'+new URLSearchParams({answer:view,lang:/[\u3400-\u9fff]/u.test(question)?'zh':'en'}));
}

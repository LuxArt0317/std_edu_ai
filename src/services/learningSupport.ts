import {affairsClient} from '@/features/public/affairs/authClient';
import type {LearningSupportReceipt,LearningSupportStatus,LearningSupportView} from '../../server/learningSupport.js';

export const learningSupportLabels:Record<LearningSupportStatus,string>={
  submitted:'待審查 · Submitted',
  in_review:'站內審查中 · In site review',
  reviewed:'站內審查完成 · Site review complete',
  withdrawn:'已撤回 · Withdrawn',
};
export type LearningSupportAction=
  |{kind:'submit_learning_support';payload:{request_id:string;topic:string;details:string}}
  |{kind:'withdraw_learning_support';payload:{request_id:string;id:string;expected_version:number}}
  |{kind:'review_learning_support';payload:{request_id:string;id:string;expected_version:number;status:'in_review'|'reviewed';note:string}};

export class LearningSupportError extends Error{
  readonly status:number;
  constructor(message:string,status:number){super(message);this.status=status;}
}

async function session(userId:string,signal:AbortSignal){
  signal.throwIfAborted();
  const verified=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(verified?.error||verified?.data.session?.user.id!==userId)
    throw new LearningSupportError('請重新登入校務系統。 Sign in to School Affairs again.',401);
  return verified.data.session.access_token;
}

async function request<T>(userId:string,path:string,signal:AbortSignal,action?:LearningSupportAction){
  const bounded=AbortSignal.any([signal,AbortSignal.timeout(20000)]);
  const token=await session(userId,bounded);
  const response=await fetch(path,{method:action?'POST':'GET',signal:bounded,cache:'no-store',credentials:'omit',redirect:'error',
    headers:{Authorization:'Bearer '+token,...(action?{'Content-Type':'application/json'}:{})},
    ...(action?{body:JSON.stringify(action)}:{})});
  const data=await response.json().catch(()=>null);
  await session(userId,bounded);
  if(!response.ok||!data)throw new LearningSupportError(typeof data?.error==='string'?data.error:'暫時無法載入站內申請。',response.status);
  return data as T;
}

export async function loadLearningSupport(userId:string,review:boolean,page:number,signal:AbortSignal){
  const path='/api/affairs-data?'+new URLSearchParams({scope:review?'learning-support-review':'learning-support',page:String(page)});
  const result=await request<LearningSupportView>(userId,path,signal);
  if(result.userId!==userId||result.view!==(review?'review':'mine')||result.page!==page||typeof result.canReview!=='boolean'
    ||review&&!result.canReview||!Number.isSafeInteger(result.total)||result.total<0||!Array.isArray(result.rows)||result.rows.length>25
    ||result.rows.some(row=>!row||typeof row.id!=='string'||!Object.hasOwn(learningSupportLabels,row.status)
      ||!Number.isFinite(Date.parse(row.updatedAt))||(!review&&row.ownerId!==userId)))
    throw new LearningSupportError('無法驗證站內申請。 Could not verify your requests.',502);
  return result;
}

export async function changeLearningSupport(userId:string,action:LearningSupportAction,signal:AbortSignal){
  const submit=action.kind==='submit_learning_support';
  const path=action.kind==='review_learning_support'?'/api/affairs-manage':'/api/affairs-action';
  const result=await request<LearningSupportReceipt>(userId,path,signal,action);
  const status=submit?'submitted':action.kind==='withdraw_learning_support'?'withdrawn':action.payload.status;
  if(typeof result.id!=='string'||result.requestId!==action.payload.request_id||result.status!==status
    ||(submit?result.version!==1:result.id!==action.payload.id||result.version!==action.payload.expected_version+1))
    throw new LearningSupportError('無法驗證操作回條。 Could not verify the request receipt.',502);
  return result;
}

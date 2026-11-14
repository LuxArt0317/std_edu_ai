import {affairsClient} from '@/features/public/affairs/authClient';
import {repairId,repairStatuses,type RepairStatus} from '@/features/public/affairs/facilityRepair.js';
import type {AssistantResponse} from './researchAssistant';

export type RepairFields={building:string;location:string;item:string;description:string};
export type RepairRow=Omit<RepairFields,'description'>&{id:string;user_id:string;status:RepairStatus;version:number;created_at:string;updated_at:string};
export type RepairDetail={userId:string;detail:RepairRow&Pick<RepairFields,'description'>;events:Array<{status:RepairStatus;version:number;note:string;occurred_at:string}>};
export type RepairList={userId:string;rows:RepairRow[];total:number;page:number;pageSize:number};
export type RepairAction={kind:'submit_facility_repair';payload:RepairFields&{request_id:string;confirmed:true}}
  |{kind:'cancel_facility_repair';payload:{id:string;version:number;request_id:string}}
  |{kind:'review_facility_repair';payload:{id:string;version:number;request_id:string;status:'in_progress'|'resolved';note:string}};

export class RepairError extends Error{
  readonly status:number;
  constructor(message:string,status:number){super(message);this.status=status;}
}

async function token(userId:string,signal:AbortSignal){
  signal.throwIfAborted();
  const session=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(session?.error||session?.data.session?.user.id!==userId)throw new RepairError('請重新登入校務系統。',401);
  return session.data.session.access_token;
}
async function request<T>(userId:string,path:string,signal?:AbortSignal,action?:RepairAction){
  const timeout=AbortSignal.timeout(20000),bounded=signal?AbortSignal.any([signal,timeout]):timeout;
  const access=await token(userId,bounded);
  const response=await fetch(path,{method:action?'POST':'GET',signal:bounded,cache:'no-store',credentials:'omit',redirect:'error',
    headers:{Authorization:'Bearer '+access,...(action?{'Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify(action)}:{})});
  const data=await response.json().catch(()=>null);
  await token(userId,bounded);
  if(!response.ok||!data)throw new RepairError(typeof data?.error==='string'?data.error:'報修資料暫時無法載入。',response.status);
  return data as T;
}
const path=(view:'mine'|'manage',fields:Record<string,string>)=>'/api/affairs-data?'+new URLSearchParams({scope:'facility-repairs',view,...fields});
const validRow=(row:RepairRow,userId:string,manage:boolean)=>repairId(row?.id)&&Object.hasOwn(repairStatuses,row.status)&&(manage||row.user_id===userId);
export async function loadRepairList(userId:string,manage:boolean,page:number,status:string,signal:AbortSignal){
  const result=await request<RepairList>(userId,path(manage?'manage':'mine',{page:String(page),...(status?{status}:{})}),signal);
  if(result.userId!==userId||!Array.isArray(result.rows)||!result.rows.every(row=>validRow(row,userId,manage))||
    result.page!==page||result.pageSize!==25||!Number.isSafeInteger(result.total))throw Error('無法確認報修資料。');
  return result;
}
export async function loadRepairDetail(userId:string,manage:boolean,id:string,signal:AbortSignal){
  const result=await request<RepairDetail>(userId,path(manage?'manage':'mine',{id}),signal);
  if(result.userId!==userId||result.detail?.id!==id||!validRow(result.detail,userId,manage)||
    !Array.isArray(result.events)||result.events.some(event=>!Object.hasOwn(repairStatuses,event.status)))throw Error('無法確認報修資料。');
  return result;
}
export async function writeRepair(userId:string,action:RepairAction,signal:AbortSignal){
  const result=await request<{id:string;status:RepairStatus;version:number}>(userId,
    action.kind==='review_facility_repair'?'/api/affairs-manage':'/api/affairs-action',signal,action);
  const initial=action.kind==='submit_facility_repair';
  const expected=initial?'submitted':action.kind==='cancel_facility_repair'?'cancelled':action.payload.status;
  if(!repairId(result.id)||result.status!==expected||
    (initial?result.version!==1:result.id!==action.payload.id||result.version!==action.payload.version+1)){
    throw new RepairError('無法確認報修結果，請重試。',502);
  }
  return result;
}
export async function readRepairAnswer(userId:string,question:string,signal?:AbortSignal,id?:string){
  const result=await request<AssistantResponse>(userId,path('mine',{answer:/[\u3400-\u9fff]/u.test(question)?'zh':'en',...(id?{id}:{})}),signal);
  if(typeof result.answer!=='string'||result.grounding?.source!=='account')throw Error('Could not verify your repair status.');
  return result;
}

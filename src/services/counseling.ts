import {affairsClient} from '@/features/public/affairs/authClient';
import {counselingKinds,counselingScope,counselingStatus,type CounselingWorkspace,type CounselingQueueRow} from '../../server/counselingContract.js';
import {feeRemissionUuid as uuid} from '../../server/feeRemissionContract.js';

async function access(userId:string,signal:AbortSignal){
  signal.throwIfAborted();
  const result=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(result?.error||result?.data.session?.user.id!==userId)throw new Error('請重新登入校務系統。');
  return result.data.session.access_token;
}
export class CounselingError extends Error{
  readonly status:number;
  constructor(status:number){
    super(status===403?'此帳戶無權使用此功能。':status===409?'預約狀態已更新或目前無法受理。請重新載入。':'無法處理諮商預約。');
    this.status=status;
  }
}
async function request(userId:string,signal:AbortSignal,path:string,body?:object){
  const bounded=AbortSignal.any([signal,AbortSignal.timeout(18000)]);
  const token=await access(userId,bounded);
  const response=await fetch(path,{method:body?'POST':'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:bounded,
    headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!response.ok){void response.body?.cancel().catch(()=>{});throw new CounselingError(response.status);}
  const result=await response.json();
  await access(userId,bounded);
  return result;
}
type View='mine'|'queue'|'access';
export type CounselingViews={mine:CounselingWorkspace;queue:Omit<CounselingWorkspace,'rows'>&{rows:CounselingQueueRow[]};
  access:Omit<CounselingWorkspace,'rows'>&{rows:string[]}};
export async function loadCounseling<V extends View>(userId:string,view:V,signal:AbortSignal):Promise<CounselingViews[V]>{
  const value=await request(userId,signal,'/api/affairs-data?'+new URLSearchParams({scope:counselingScope,view}));
  if(value?.userId!==userId||typeof value.available!=='boolean'||typeof value.canCoordinate!=='boolean'||!Array.isArray(value.rows))
    throw new CounselingError(503);
  const validRow=(row:Record<string,unknown>)=>row&&uuid(row.id)&&Number.isSafeInteger(row.version)
    &&typeof row.kind==='string'&&Object.hasOwn(counselingKinds,row.kind)
    &&typeof row.status==='string'&&Object.hasOwn(counselingStatus,row.status)
    &&typeof row.preferred_on==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.preferred_on)
    &&(row.preferred_period==='morning'||row.preferred_period==='afternoon')
    &&(row.scheduled_at===null||(typeof row.scheduled_at==='string'&&Number.isFinite(Date.parse(row.scheduled_at))));
  const valid=view==='access'?value.rows.every(uuid):value.rows.every((row:Record<string,unknown>)=>
    validRow(row)&&(view!=='queue'||(uuid(row.user_id)&&typeof row.contact_email==='string')));
  if(!valid)throw new CounselingError(503);
  return value;
}

export async function changeCounseling(userId:string,op:'request'|'cancel'|'review'|'access',payload:Record<string,unknown>,signal:AbortSignal){
  const path=op==='review'||op==='access'?'/api/affairs-manage':'/api/affairs-action';
  const result=await request(userId,signal,path,{kind:'counseling_'+op,payload});
  if(op==='access'){
    if(result?.userId!==payload.user_id||result.enabled!==payload.enabled)throw new CounselingError(503);
  }else if(!uuid(result?.id)||!Number.isSafeInteger(result.version)||!['requested','scheduled','cancelled','closed'].includes(result.status)||
    (op!=='request'&&result.id!==payload.id)||op==='cancel'&&(Object.keys(result).length!==3||result.status!=='cancelled'
      ||!Number.isSafeInteger(payload.expected_version)||result.version!==Number(payload.expected_version)+1))throw new CounselingError(503);
  return result;
}

import { affairsClient } from '@/features/public/affairs/authClient';
import { clubScope, validClubReceipt, validClubWorkspace, type ClubAction, type ClubView } from '../../server/clubServicesContract.js';

async function token(userId:string, signal:AbortSignal) {
  signal.throwIfAborted();
  const result=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if (result?.error || result?.data.session?.user.id!==userId) throw new Error('請重新登入校務系統。');
  return result.data.session.access_token;
}
async function request(userId:string,url:string,cancel:AbortSignal,action?:ClubAction) {
  const signal=AbortSignal.any([cancel,AbortSignal.timeout(18000)]);
  const auth=await token(userId,signal);
  const response=await fetch(url,{
    method:action?'POST':'GET',credentials:'omit',redirect:'error',cache:'no-store',signal,
    headers:{Authorization:'Bearer '+auth,...(action?{'Content-Type':'application/json'}:{})},
    body:action?JSON.stringify(action):undefined,
  });
  const value=await response.json().catch(()=>null);
  await token(userId,signal);
  if (!response.ok) throw new Error(
    typeof value?.error==='string'&&value.error.length<220 ? value.error : '暫時無法完成操作，請重試。',
  );
  return value as unknown;
}
export async function loadClubServices(userId:string,view:ClubView,signal:AbortSignal,month?:string) {
  const params=new URLSearchParams({scope:clubScope,view});
  if(month)params.set('month',month);
  const value=await request(userId,'/api/affairs-data?'+params,signal);
  if(!validClubWorkspace(value,userId,view))throw new Error('無法確認社團資料。');
  return value;
}
export async function writeClubEquipment(userId:string,action:ClubAction,signal:AbortSignal) {
  const endpoint=action.kind==='review_club_equipment'?'/api/affairs-manage':'/api/affairs-action';
  const receipt=await request(userId,endpoint,signal,action);
  if(!validClubReceipt(receipt))throw new Error('無法確認借用結果。請重試。');
  if(action.kind!=='submit_club_equipment'&&(action.payload.id!==receipt.id||action.payload.expected_version+1!==receipt.version))
    throw new Error('無法確認借用紀錄。請重新整理。');
  const expected=action.kind==='cancel_club_equipment'?'cancelled':
    action.kind==='review_club_equipment'?action.payload.status:'submitted';
  if(receipt.status!==expected)throw new Error('無法確認借用紀錄。請重新整理。');
  return receipt;
}

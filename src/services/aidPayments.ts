import {affairsClient} from '@/features/public/affairs/authClient';
import {aidPaymentsScope,validAidPayments,type AidPaymentView,type AidPaymentResult} from '../../server/aidPaymentsContract.js';

export async function loadAidPayments(userId:string,view:AidPaymentView,page:number,signal?:AbortSignal):Promise<AidPaymentResult>{
  const deadline=AbortSignal.timeout(18000);
  const bounded=signal?AbortSignal.any([signal,deadline]):deadline;
  async function access(){
    bounded.throwIfAborted();
    const result=await affairsClient?.auth.getSession();
    bounded.throwIfAborted();
    if(result?.error||result?.data.session?.user.id!==userId)throw new Error('請重新登入校務系統。');
    return result.data.session.access_token;
  }
  const params=new URLSearchParams({scope:aidPaymentsScope,view,page:String(page)});
  const response=await fetch('/api/affairs-data?'+params,{credentials:'omit',redirect:'error',cache:'no-store',signal:bounded,
    headers:{Authorization:'Bearer '+await access()}});
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    throw new Error('無法讀取助學請領紀錄。');
  }
  const result=await response.json();
  await access();
  if(!validAidPayments(result,userId,view))throw new Error('無法確認助學請領紀錄。');
  return result;
}

import {affairsClient} from '@/features/public/affairs/authClient';
import {
  chargePaymentHistoryScope,parseChargePaymentHistory,
  type ChargePaymentHistory,type ChargePaymentSelection,
} from '../../server/chargePaymentContract.js';

import {chargePaymentHistoryParams} from '@/features/public/affairs/chargePaymentHistoryRoute';

export async function loadChargePaymentHistory(userId:string,selection:ChargePaymentSelection,signal:AbortSignal):Promise<ChargePaymentHistory>{
  const bounded=AbortSignal.any([signal,AbortSignal.timeout(18000)]);
  async function access(){
    bounded.throwIfAborted();
    const result=await affairsClient?.auth.getSession();
    bounded.throwIfAborted();
    if(result?.error||result?.data.session?.user.id!==userId)throw new Error('請重新登入校務系統。');
    return result.data.session.access_token;
  }
  const params=new URLSearchParams({scope:chargePaymentHistoryScope});
  chargePaymentHistoryParams(selection).forEach((value,key)=>params.set(key,value));
  const response=await fetch('/api/affairs-data?'+params,{
    headers:{Authorization:'Bearer '+await access()},credentials:'omit',redirect:'error',cache:'no-store',signal:bounded,
  });
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    throw new Error('無法讀取繳費紀錄。');
  }
  const value:unknown=await response.json();
  await access();
  return parseChargePaymentHistory(value,userId,selection);
}

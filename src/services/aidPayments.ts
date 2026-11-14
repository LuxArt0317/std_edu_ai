import {affairsClient} from '@/features/public/affairs/authClient';
import {aidPaymentsPaths,aidPaymentsScope,validAidPayments,type AidPaymentView,type AidPaymentResult} from '../../server/aidPaymentsContract.js';
import type {AssistantResponse} from './researchAssistant';

export async function loadAidPayments(userId:string,view:AidPaymentView,page:number,signal?:AbortSignal,summary=false):Promise<AidPaymentResult>{
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
  if(summary)params.set('summary','1');
  const response=await fetch('/api/affairs-data?'+params,{credentials:'omit',redirect:'error',cache:'no-store',signal:bounded,
    headers:{Authorization:'Bearer '+await access()}});
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    throw new Error('無法讀取助學請領紀錄。');
  }
  const result=await response.json();
  await access();
  if(!validAidPayments(result,userId,view))throw new Error('無法確認助學請領紀錄。');
  if(summary&&result.rows.length)throw new Error('無法確認助學請領摘要。');
  return result;
}

export async function answerAidPayments(userId:string,view:AidPaymentView,question:string,signal?:AbortSignal):Promise<AssistantResponse>{
  const data=await loadAidPayments(userId,view,1,signal,true);
  const zh=/[\u3400-\u9fff]/u.test(question);
  const title=view==='claims'?(zh?'請款查詢':'Student aid claims'):(zh?'薪資查詢':'Student salary');
  const summary=zh?`您的 stu.best 帳戶有 ${data.total} 筆${title}紀錄。`:
    `Your stu.best account has ${data.total} saved ${view==='claims'?'student aid claim':'student salary'} record${data.total===1?'':'s'}.`;
  const url=aidPaymentsPaths[view];
  return {status:'answered',answer:summary+'\n\n['+title+']('+url+')',
    citations:[{chunkId:'account:aid-payments:'+view,title,url,claim:summary,sourceName:'stu.best',
      locator:null,effectiveAt:null,reviewedAt:null}],suggestedQuestions:[],grounding:{source:'account',webSearched:false}};
}

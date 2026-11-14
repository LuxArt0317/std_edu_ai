import {aidPaymentsPagePath} from './aidPaymentsContract.js';

export function aidPaymentsUnsupportedAction(question,{selection,otherQuestion}){
  if(!selection||otherQuestion)return null;
  if(/^(?:please\s+)?(?:can (?:you|i)\s+)?(?:download|issue|generate|print|send me|give me)\b[^.!?。！？]*(?:certificate|receipt|official\s+(?:statement|document)|PDF)\s*[.!?]*$|^(?:請|请)?(?:下載|下载|列印|開立|开立)[^。！？]*(?:證明|证明|收據|收据|PDF)[。！？]?$/iu.test(question))return 'document';
  if(/^(?:please\s+)?(?:can you\s+)?(?:approve|reject|pay|process|transfer|disburse)\b[^.!?。！？]*\s*[.!?]*$|^(?:請|请)?(?:核准|駁回|驳回|付款|匯款|汇款)[^。！？]*[。！？]?$/iu.test(question))return 'write';
  return null;
}

export function aidPaymentsGuide(question,{selection,foreign,excluded},navigation=null){
  const zh=/[\u3400-\u9fff]/u.test(question);
  const t=(en,zhText)=>zh?zhText:en;
  const result={status:'handoff',answer:'',citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
  if(foreign) return {...result,answer:t('I can only check your signed-in stu.best account. I can’t show another student’s salary or aid claim records.','我只能查詢自己的 stu.best 帳戶，無法查看其他學生的薪資或助學請款紀錄。')};
  if(excluded) return {...result,answer:t('I skipped the salary or aid claim records you asked me to leave out.','已略過你要求不要查看的薪資或助學請款紀錄。')};
  if(selection?.reason) return {...result,status:'clarification',answer:selection.reason==='invalid_page'
    ?t('Which page should I check? Enter a page from 1 to 201.','要查看哪一頁？請輸入 1 到 201 之間的頁碼。')
    :t('Which one page should I check for each record type?','每種紀錄要查看哪一頁？請各指定一頁。')};
  const views=navigation?[navigation]:selection?.views??[];
  const citations=views.map(view=>{
    const path=aidPaymentsPagePath(view,navigation?1:selection?.pages[view]??1);
    const url=navigation?path:'/school-affairs/login?next='+encodeURIComponent(path);
    const name=view==='salary'?t('student salary records','學生薪資紀錄'):t('student aid claims','助學請款紀錄');
    const title=navigation?t('Open '+name,'開啟'+name):t('Sign in to check your '+name,'登入後查看'+name);
    return {chunkId:'directory:aid-payments-'+view,title,url,claim:title,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null};
  });
  return {...result,status:navigation?'answered':'handoff',answer:citations.map(({title,url})=>'['+title+']('+url+')').join('\n\n'),citations};
}

export function aidPaymentsCapabilityGuide(question,scope,action){
  const guide=aidPaymentsGuide(question,scope,scope.selection?.views[0]??null);
  const zh=/[\u3400-\u9fff]/u.test(question);
  const limitation=action==='document'
    ?zh?'這裡無法下載官方薪資或助學給付證明。':'I can’t download an official salary or aid payment certificate from stu.best.'
    :zh?'這裡無法核准或支付薪資與助學請款。':'I can’t approve or pay student salary or aid claims from stu.best.';
  return {...guide,status:'handoff',answer:[limitation,guide.answer].filter(Boolean).join('\n\n')};
}

import {teachingFeedbackPaths} from './teachingFeedbackContract.js';

/** No private records are queried for navigation or access guidance. */
export function teachingFeedbackGuide(question,{views=[],navigation=null,reason=null,signedIn=false,excluded=false}={}){
  const zh=/[\p{Script=Han}]/u.test(question);
  const t=(en,zhText)=>zh?zhText:en;
  const result={status:'handoff',answer:'',citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
  if(reason==='foreign_request')return {...result,answer:t('I can check teaching feedback saved to your own stu.best account. I can’t show another student’s records.','你可以查詢自己的 stu.best 教學意見。這裡沒有其他帳號的存取權限，因此無法查看其他學生的紀錄。')};
  if(excluded)return {...result,status:'answered',answer:t('I did not read the teaching feedback records you asked me to leave out.','我沒有讀取你要求略過的教學意見紀錄。')};
  const navigationViews=Array.isArray(navigation)?navigation:navigation?[navigation]:[];
  const selected=Array.from(new Set(navigationViews.length?navigationViews:views)).filter(view=>Object.hasOwn(teachingFeedbackPaths,view));
  const direct=signedIn||navigationViews.length>0;
  const citations=selected.map(view=>{
    const path=teachingFeedbackPaths[view];
    const url=direct?path:'/school-affairs/login?next='+encodeURIComponent(path);
    const title=view==='survey'
      ?direct?t('Open the teaching evaluation questionnaire','開啟教學意見問卷'):t('Sign in to check teaching evaluations','登入後查看教學意見問卷')
      :direct?t('Open immediate teaching feedback','開啟即時教學意見'):t('Sign in to check immediate teaching feedback','登入後查看即時教學意見');
    return {chunkId:'directory:teaching-feedback-'+view,title,url,claim:title,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null};
  });
  const detail=reason==='unsupported_operation'
    ?t('I cannot submit your teaching feedback here. No submission was made. Open the School Affairs form to send your response.','我無法提交你的教學意見。請在校務系統表單送出你的回應。')
    :reason==='invalid_route'
      ?t('Open your own School Affairs teaching feedback page and ask again.','請開啟你自己的校務教學意見頁面後再詢問。')
      :reason==='ambiguous_selector'
        ?t('Which saved course or questionnaire do you mean? Send the exact course code or title.','請提供要查詢的課程代碼或課程名稱。')
        :reason==='outside_scope'
          ?t('You can see your own questionnaire completion status. Anonymous responses are unavailable for individual lookup, and students cannot access administrator results.','你可以查看自己的問卷完成狀態。無法查詢個別匿名填答，學生也無法存取管理員的統計結果。')
          :'';
  const answer=[detail,...citations.map(({title,url})=>'['+title+']('+url+')')].filter(Boolean).join('\n\n');
  return {...result,status:navigationViews.length?'answered':reason==='ambiguous_selector'?'clarification':'handoff',
    answer:answer||t('Open School Affairs and choose the teaching feedback service you need.','請開啟校務系統並選擇要查詢的教學意見服務。'),citations};
}

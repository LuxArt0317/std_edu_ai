import {teachingFeedbackPaths} from './teachingFeedbackContract.js';

/** No private records are queried for navigation or access guidance. */
export function teachingFeedbackGuide(question,{views=[],navigation=null,reason=null,signedIn=false,excluded=false}={}){
  const zh=/[\p{Script=Han}]/u.test(question);
  const t=(en,zhText)=>zh?zhText:en;
  const result={status:'handoff',answer:'',citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
  if(reason==='foreign_request')return {...result,answer:t('I can check teaching feedback saved to your own stu.best account. I can’t show another student’s records.','我可以查詢你自己的 stu.best 教學意見紀錄，無法查看其他學生的紀錄。')};
  if(excluded)return {...result,answer:t('I skipped the teaching feedback records you asked me to leave out.','已略過你要求不要查詢的教學意見紀錄。')};
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
    ?t('Open the School Affairs form to submit your response. No submission was made.','請在校務系統表單送出你的回應。目前尚未送出。')
    :reason==='invalid_route'
      ?t('Open your own School Affairs teaching feedback page and ask again.','請開啟你自己的校務教學意見頁面後再詢問。')
      :reason==='ambiguous_selector'
        ?t('Which saved course or questionnaire do you mean? Send the exact course code or title.','請提供要查詢的課程代碼或課程名稱。')
        :reason==='outside_scope'
          ?t('The questionnaire can show your saved completion status. Anonymous ratings, questionnaire responses and staff results are unavailable here.','可查看你自己的問卷完成狀態。匿名評分、填答內容和教職員統計無法在此查詢。')
          :'';
  const answer=[detail,...citations.map(({title,url})=>'['+title+']('+url+')')].filter(Boolean).join('\n\n');
  return {...result,status:navigationViews.length?'answered':reason==='ambiguous_selector'?'clarification':'handoff',
    answer:answer||t('Open School Affairs and choose the teaching feedback service you need.','請開啟校務系統並選擇要查詢的教學意見服務。'),citations};
}

import {tutorEvaluationPath} from '../src/features/public/affairs/studentServices.js';
import {supplementalAnswerLanguage} from './supplementalAccountAnswers.js';

export function tutorEvaluationGuide(question,signedIn=false,reason=null,trackingNote=false,navigation=false){
  const zh=supplementalAnswerLanguage(question)==='zh-TW';
  const t=(en,zht)=>zh?zht:en;
  const grounding={source:'directory',webSearched:false};
  if(reason==='foreign_request')return {status:'handoff',answer:t('I can only check the tutor evaluation saved to your own stu.best account.','我只能查詢你自己的 stu.best 帳戶所儲存的導師問卷。'),
    citations:[],suggestedQuestions:[],grounding};
  const path=trackingNote?tutorEvaluationPath+'/notes':tutorEvaluationPath;
  const url=signedIn||navigation?path:'/school-affairs/login?next='+encodeURIComponent(path);
  const title=trackingNote?t('Sign in to open your tutor evaluation notes','登入後開啟導師問卷追蹤筆記')
    :signedIn||navigation?t('Open tutor evaluation','開啟導師評量問卷'):t('Sign in to open tutor evaluation','登入後開啟導師評量問卷');
  const detail=reason==='unsupported_operation'?t('Use the form to submit your questionnaire.','請在問卷頁面送出填答。')
    :reason==='ambiguous_selector'?t('Give me the question number from 1 to 10.','請提供 1 到 10 的問卷題號。')
    :reason==='outside_scope'?t('The form holds your saved response. I can check its status, submission time, numbered ratings, or saved comment.','此問卷保留你的填答。可以查詢儲存狀態、送出時間、各題評分或意見。')
      :'';
  return {status:signedIn||navigation?'answered':'handoff',answer:[detail,`[${title}](${url})`].filter(Boolean).join('\n\n'),
    citations:[{chunkId:'directory:tutor-evaluation',title,url,claim:title,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null}],suggestedQuestions:[],grounding};
}

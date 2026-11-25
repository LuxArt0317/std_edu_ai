import {composeEvidenceAnswer,verifyEvidenceAnswer,repairEvidenceAnswer} from './answerVerificationModel.js';
import {runAnswerVerification,unverifiedAnswer} from './answerVerification.js';
export function isImageDescriptionQuestion(question){
  return typeof question==='string'&&question.length<=2000
    &&/\b(?:what can you (?:see|read)|describe (?:this|the|my)|what (?:does|is|are).{0,60}(?:image|screenshot|picture)|(?:read|explain|summari[sz]e|transcribe|extract|(?:give|show|tell) me (?:the )?contents? of).{0,50}(?:image|screenshot|picture))\b|(?:描述|說明|说明|看|讀|读).{0,20}(?:圖片|图片|截圖|截图)|(?:圖片|图片|截圖|截图).{0,20}(?:內容|内容|看見|看到)/iu.test(question);
}
export async function answerAttachedImage({question,images,history,deadline,onProgress}){
  const activity=[];
  const emit=step=>{activity.push(step);try{onProgress?.(step);}catch{}};
  const seed={status:'answered',answer:'',citations:[],grounding:{source:'attached-image',webSearched:false}};
  emit({kind:'attached-image',label:'Reading your attached image',detail:'Using the image in this message; no account-record or school web lookup is needed to describe it.',status:'running'});
  try{
    const draft=await composeEvidenceAnswer({question,candidate:seed,evidence:[],history,deadline},images);
    emit({kind:'attached-image',label:'Read your attached image',detail:'Prepared a description for an independent check against the same image.',status:'complete'});
    return await runAnswerVerification({question,initialAnswer:{...draft,activity},deadline,onProgress,
      loadEvidence:async()=>[],verify:context=>verifyEvidenceAnswer(context,images),repair:context=>repairEvidenceAnswer(context,images)});
  }catch(error){
    const reason=error?.code==='VERIFICATION_QUOTA_EXHAUSTED'?'provider_quota_exhausted'
      :error?.code==='VERIFICATION_TIMEOUT'?'verification_timeout':'verifier_unavailable';
    emit({kind:'attached-image',label:'Could not finish reading your image',detail:reason==='provider_quota_exhausted'
      ?'The image was received, but the model provider reported exhausted credits.':'The image was received, but image processing did not complete.',status:'unavailable'});
    return unverifiedAnswer(question,seed,activity,0,reason);
  }
}

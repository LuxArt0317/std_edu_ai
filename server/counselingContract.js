export const counselingPath='/school-affairs/services/29-1';
export const counselingAppointmentsPath=counselingPath+'/appointments';
export const counselingScope='counseling-appointments';
export const counselingConsentVersion='stu-best-2026-11-14';
export const counselingStatus={
  requested:['待安排','Awaiting scheduling'],scheduled:['已安排','Scheduled'],
  cancelled:['已取消','Cancelled'],closed:['已結案','Closed'],
};
export const counselingKinds={counseling:'心理諮商',assessment:'心理測驗'};
export function counselingDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value)||value.startsWith('0000'))return false;
  const parsed=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===value;
}
export function counselingQuestion(question){
  const text=question.normalize('NFKC').trim();
  if(!/\bcounsel(?:ing|ling)\b|\bpsychological (?:assessment|test(?:ing)?)\b|心理(?:諮商|測驗)|諮商/u.test(text.toLowerCase()))return null;
  if(!/\b(?:appointment|book|schedule|contact|where|how|status|cancel)\b|預約|聯絡|電話|在哪|如何|進度|取消|狀態/iu.test(text))return null;
  if(/\b(?:write code|python|javascript|another student|password)\b|他人|密碼/iu.test(text))return null;
  const status=/\b(?:status|when is my|was my|is my|do i have|did i|have i)\b|進度|我的.{0,20}(?:狀態|時間)|我.{0,20}(?:有預約|已預約)/iu.test(text);
  return status?'status':'guide';
}

export function counselingGuide(question,intent,signedIn=false){
  const zh=/[\u3400-\u9fff]/u.test(question),title=zh?'心理諮商與心理測驗預約':'Counseling and assessment appointments';
  const url=intent==='status'&&!signedIn?'/school-affairs/login?next='+encodeURIComponent(counselingPath+'/appointments'):
    intent==='status'?counselingPath+'/appointments':counselingPath;
  const summary=intent==='status'?(zh?'請在私人預約頁查看您已儲存的預約狀態。':'Open your private appointments page to check your saved appointment status.'):
    (zh?'校務系統的諮商頁有預約入口與校方聯絡方式。':'The School Affairs counseling page has the appointment entry and university contact information.');
  return {status:intent==='status'?'handoff':'answered',answer:summary+'\n\n'+`[${title}](${url})`,
    citations:[{chunkId:'directory:counseling-appointments',claim:summary,title,url,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

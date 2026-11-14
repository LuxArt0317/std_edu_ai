export const elearningPath='/elearning';
export const elearningServicePath='/school-affairs/services/4-2';
export const elearningOrigin='https://elearning.stu.edu.tw';
export const elearningScope='elearning-workspace';
export const joinElearningCourse='elearning_join';
export const elearningCoursePath=id=>elearningPath+'/course/'+id;
export function elearningQuestion(question,route=''){
  const text=question.normalize('NFKC').trim();
  if(/\b(?:write code|python|javascript|password|another student)\b|他人|密碼|寫程式/iu.test(text))return null;
  const explicit=/數位學園|遠距教學(?:平台|研習)|\b(?:digital academy|e-learning|elearning|remote[- ]learning(?: Moodle)?)\b/iu.test(text);
  const contextual=/^\/elearning(?:\/|\?|$)/u.test(route) && !/數位教材|\bdtm\b/iu.test(text);
  const records=/\b(?:assignments?|grades?|marks?|submissions?)\b|作業|成績|繳交/iu.test(text);
  if(!explicit&&!(contextual&&(records||/\b(?:my courses|what.*courses|my enrollments)\b|我的課程|我的選課/iu.test(text))))return null;
  if(records)return 'records';
  if(/\b(?:my|enrolled|enrollments|did i join|what.*taking)\b|我的|我有|我選了|我報名/u.test(text.toLowerCase()))return 'mine';
  if(/\b(?:where|open|find|moodle|course|catalog|notice|login|sign in|platform)\b|首頁|入口|登入|哪|課程|公告|數位學園/u.test(text.toLowerCase()))return 'guide';
  return null;
}
export function elearningGuide(question,intent,signedIn=false){
  const zh=/[\u3400-\u9fff]/u.test(question);
  const destination=intent==='mine'?elearningPath+'/my-courses':elearningPath;
  const url=intent==='mine'&&!signedIn?elearningPath+'/login':destination;
  const title=zh?'數位學園':'Remote-learning Moodle';
  const summary=intent==='records'
    ? (zh?'本站尚未連結數位學園作業或成績。':'Assignment and grade records for remote-learning Moodle have not been linked here.')
    : intent==='mine'&&!signedIn
      ? (zh?'請登入數位學園查看本站選課。':'Sign in to remote-learning Moodle to see your stu.best enrollments.')
      : (zh?'開啟數位學園查看系統公告與歷年課程。':'Open remote-learning Moodle to browse notices and archived course categories.');
  return {
    status:intent==='guide'?'answered':'handoff',answer:summary+'\n\n'+`[${title}](${url})`,
    citations:[{chunkId:'directory:elearning',title,claim:summary,url,sourceName:'Digital Academy',locator:null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false},
  };
}

export const elearningCatalogScope='elearning-catalog';
export const elearningCatalogPageSize=20;

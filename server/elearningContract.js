export const elearningPath='/elearning';
export const elearningServicePath='/school-affairs/services/4-2';
export const elearningOrigin='https://elearning.stu.edu.tw';
export const elearningScope='elearning-workspace';
export const joinElearningCourse='elearning_join';
export const elearningCoursePath=id=>elearningPath+'/course/'+id;
export const elearningActivityPath=(course,id)=>elearningCoursePath(course)+'/activity/'+id;
export function elearningCourseLocation(path){
  const match=/^\/elearning\/course\/([1-9]\d{0,9})(?:\/activity\/([1-9]\d{0,9}))?\/?(?:[?#]|$)/u.exec(path);
  if(!match||Number(match[1])>2147483647||Number(match[2])>2147483647)return null;
  return {courseId:Number(match[1]),activityId:match[2]?Number(match[2]):null};
}
export function elearningOutlineCourse(question,route=''){
  const location=elearningCourseLocation(route);
  if(!location)return null;
  const text=question.normalize('NFKC').trim();
  return /^(?:(?:what|which) (?:is (?:the course outline|in this course)|(?:videos|slides|materials|activities|sections) (?:are (?:listed|available)|does this course have))|(?:show|list) (?:me )?(?:the )?(?:course outline|course activities|course materials|videos|slides)|where (?:is|can i find) (?:the )?(?:course )?feedback (?:form|link)|(?:本課程|這門課)(?:有)?哪些(?:教材|影片|活動|章節|簡報)|(?:顯示|查看|列出)?(?:課程大綱|本週大綱)|(?:課程)?回饋單在哪(?:裡|里)?)[?？。.!]?$/iu.test(text)
    ?location.courseId:null;
}
export function elearningOutlineFilter(question){
  const text=question.normalize('NFKC');
  if(/\bvideos?\b|影片/iu.test(text))return 'video';
  if(/\bslides?\b|簡報/iu.test(text))return 'slides';
  if(/\bfeedback\b|回饋單/iu.test(text))return 'feedback';
  return null;
}
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
export const elearningOutlineScope='elearning-course-outline';
export function elearningActivityUrl(activity){
  return activity&&(activity.kind==='url'||activity.kind==='attendanceregister')&&
    Number.isSafeInteger(activity.id)&&activity.id>0&&activity.id<=2147483647
    ? elearningOrigin+'/mod/'+activity.kind+'/view.php?id='+activity.id : null;
}
export function isElearningOutline(outline,userId,courseId){
  return outline?.userId===userId&&outline?.courseId===courseId&&Array.isArray(outline.sections)&&outline.sections.length<=64&&
    outline.sections.every(section=>Number.isSafeInteger(section?.position)&&section.position>0&&section.position<=64&&
      typeof section.title==='string'&&section.title.trim().length>0&&section.title.length<=400&&
      Array.isArray(section.activities)&&section.activities.length<=100&&section.activities.every(activity=>
        elearningActivityUrl(activity)!==null&&typeof activity.title==='string'&&activity.title.trim().length>0&&activity.title.length<=480&&
        (activity.purpose===undefined||(activity.kind==='url'
          ?['link','video','slides','feedback'].includes(activity.purpose):['link','attendance'].includes(activity.purpose)))));
}

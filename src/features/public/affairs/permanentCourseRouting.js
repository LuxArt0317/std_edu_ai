export const permanentCoursesPath='/school-affairs/services/12-2';
const courseCodePattern=/\b[A-Z]{2}[UGJ]\d{5}\b/gi;

export function permanentCourseQuestion(question) {
  if (/\b(?:my|enrolled|grades?|assignments?|tuition|password|token)\b|我的|已選|成績|作業|密碼/iu.test(question)) return null;
  const codes=[...new Set([...question.matchAll(courseCodePattern)].map(match=>match[0].toUpperCase()))];
  const topic=/\b(?:permanent course|course description)\b|永久課程|課程簡介/iu.test(question);
  const simpleCode=codes.length===1&&(question.trim().toUpperCase()===codes[0]||/\b(?:about|describe|credits?|what is|tell me)\b|介紹|學分|是什麼/iu.test(question));
  return topic||simpleCode?{code:codes.length===1?codes[0]:''}:null;
}

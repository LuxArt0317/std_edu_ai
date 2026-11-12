const localPath='/school-affairs/services/11-3';
const topic=/超減修|超修|減修|\b(?:credit[ -]load|overload|underload|over[ -]credit|under[ -]credit)\b/i;
export const creditLoadHistoryNavigation={
  id:'credit-load-history',match:topic,title:['歷年超減修申請紀錄','Credit-load application history'],
  officialUrl:'https://infosys.stu.edu.tw/WebSelectCourse/Login/AspLogin/AppCreditHistory',localUrl:localPath,
  description:['在 stu.best 查看您的站內超減修申請紀錄。紀錄由站內管理員維護，非校方申請或資格判定。',
    'View your local credit-load history on stu.best. Site administrators maintain these demonstration records; they are not university applications or eligibility decisions.'],
};
export function mapCreditLoadHistory(rows) {
  return {records:rows.map(row=>({
    id:row.id,userId:row.user_id,academicYear:Number(row.academic_year),semester:Number(row.semester),
    category:row.category,requestedCredits:Number(row.requested_credits),
    processText:row.process_text ?? null,resultText:row.result_text ?? null,sourceMode:row.source_mode,
    version:Number(row.version),createdAt:row.created_at,updatedAt:row.updated_at,
  }))};
}
export function isCreditLoadHistoryQuestion(question,route='',history=[]) {
  const explicit=topic.test(question);
  const anotherTopic=/\b(?:scholarships?|financial aid|student aid|housing|dormitory|assignments?|homework|dtm|moodle|grades?|scores?|tuition|fees?|charges?|timetables?|schedules?|attendance|leave|internships?|tasks?|announcements?|notices?|graduation|transfer credits?|courses?|classes|subjects?|enrollments?)\b|獎學金|獎助學金|助學|住宿|宿舍|作業|功課|成績|學費|繳費|課表|出席|請假|實習|待辦|公告|畢業學分|抵免|課程|科目|選課紀錄/i;
  if(!explicit && anotherTopic.test(question))return false;
  const personal=/\b(?:my|mine|our|me|i|records?|applications?|status|history|result|progress|credits?|review|semester|term|eligible|eligibility)\b|我|申請|審核|紀錄|進度|結果|學分|學期|資格/i;
  if(explicit && personal.test(question))return true;
  const followup=/\b(?:status|history|result|progress|credits?|review|applications?|records?|semester|term)\b|申請|審核|紀錄|進度|結果|學分|學期/i.test(question);
  return followup && (route===localPath || topic.test(history.filter(item=>item.role==='user').at(-1)?.content || ''));
}
export function answerCreditLoadHistory(question,snapshot,route='',history=[]) {
  if(!isCreditLoadHistoryQuestion(question,route,history))return null;
  const zh=/[\u3400-\u9fff]/.test(question),userId=snapshot.profile?.userId;
  const records=userId?(snapshot.creditLoadHistory?.records ?? []).filter(row=>row.userId===userId):[];
  const missing=zh?'未記錄':'not recorded';
  const lines=records.map(row=>zh
    ? `${row.academicYear} 學年第 ${row.semester} 學期 · ${row.category==='over'?'超修':'減修'} ${row.requestedCredits} 學分；申請進度：${row.processText || missing}；審核結果：${row.resultText || missing}。`
    : `Academic year ${row.academicYear}, semester ${row.semester} · ${row.category==='over'?'over-load':'under-load'} ${row.requestedCredits} credits; progress: ${row.processText || missing}; result: ${row.resultText || missing}.`);
  return {
    answer:(zh?'您的 stu.best 超減修申請紀錄（站內示範）：':'Your stu.best credit-load history (local demonstration):')+'\n'+
      (lines.length?lines.join('\n'):(zh?'尚無超減修申請紀錄。':'No credit-load history records.'))+'\n'+
      (zh?'本頁僅查詢由站內管理員維護的紀錄；不判定申請資格、不送出校方申請，也不變更選課。':'This page only displays records maintained by the site administrator; it does not determine eligibility, submit university applications, or change course selections.'),
    title:zh?'我的超減修申請紀錄':'My credit-load history',url:localPath,
  };
}

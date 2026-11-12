import {studentAidPath,officialStudentAidUrl} from '../src/features/public/affairs/studentAidLinks.js';

const aidTopic=/\b(?:student aid|financial aid|(?:my|our) aid|disadvantaged (?:student )?aid|need[ -]based aid|living assistance)\b|不利處境|弱勢助學|生活助學|(?<!獎)助學(?:申請|紀錄|狀態|補助|金)/i;
export const studentAidNavigation={
  id:'student-aid',match:aidTopic,title:['不利處境學生助學申請','Student aid records'],
  officialUrl:officialStudentAidUrl,localUrl:studentAidPath,
  description:['在 stu.best 查看您的站內助學紀錄。校方服務另提供正式助學辦理資訊。',
    'View your local student aid records on stu.best. The university service provides its official aid workflow.'],
};
export function mapStudentAidRecords(rows) {
  return {records:rows.map(row=>({
    id:row.id,userId:row.user_id,applicantLabel:row.applicant_label,studentName:row.student_name,
    maskedIdentityNumber:row.masked_identity_number,departmentName:row.department_name,phone:row.phone,
    applicationKind:row.application_kind,relativeCount:row.relative_count==null?null:Number(row.relative_count),
    subsidyAmount:row.subsidy_amount==null?null:Number(row.subsidy_amount),studentRecordLocked:row.student_record_locked,
    schoolReviewStatus:row.school_review_status,ministryReviewStatus:row.ministry_review_status,
    academicYear:row.academic_year,semester:row.semester,sourceMode:row.source_mode,version:row.version,updatedAt:row.updated_at,
  }))};
}
export function isStudentAidRecordQuestion(question,route='',history=[]) {
  const explicit=aidTopic.test(question);
  const anotherTopic=/\b(?:scholarships?|assignments?|homework|dtm|moodle|courses?|subjects?|classes|grades?|scores?|tuition|fees?|charges?|timetables?|schedules?|attendance|leave|internships?|tasks?|announcements?|notices?)\b|獎助學金|境外|獎學金|作業|功課|數位教材|課程|科目|課表|成績|學費|繳費|出席|請假|假單|實習|任務|待辦|公告/i;
  if(!explicit && anotherTopic.test(question))return false;
  const personal=/\b(?:my|mine|our|me|i|records?|applications?|status|history|amount|subsidy|review|locked|semester|term)\b|我|申請|審核|紀錄|金額|補助|鎖|學期/i.test(question);
  if(explicit && personal)return true;
  const followup=/\b(?:status|history|amount|subsidy|review|locked|applications?|records?|semester|term)\b|申請|審核|紀錄|金額|補助|鎖|學期/i.test(question);
  return followup && (route===studentAidPath || aidTopic.test(history.filter(item=>item.role==='user').at(-1)?.content || ''));
}
export function answerStudentAidRecords(question,snapshot,route='',history=[]) {
  if(!isStudentAidRecordQuestion(question,route,history))return null;
  const chinese=/[\u3400-\u9fff]/.test(question);
  const records=(snapshot.studentAid?.records || []).filter(row=>!snapshot.profile?.userId || row.userId===snapshot.profile.userId);
  const missing=chinese?'未記錄':'not recorded';
  const lines=records.map(row=>{
    const amount=row.subsidyAmount==null?missing:'NT$'+Number(row.subsidyAmount).toLocaleString(chinese?'zh-TW':'en-US');
    const locked=row.studentRecordLocked==null?missing:row.studentRecordLocked?(chinese?'已鎖定':'locked'):(chinese?'未鎖定':'unlocked');
    return chinese
      ? `${row.academicYear} 學年第 ${row.semester} 學期 · ${row.applicationKind}：實際補助金額 ${amount}；學校審核 ${row.schoolReviewStatus || missing}；教育部審核 ${row.ministryReviewStatus || missing}；學生紀錄 ${locked}。`
      : `Academic year ${row.academicYear}, semester ${row.semester} · ${row.applicationKind}: subsidy ${amount}; school review ${row.schoolReviewStatus || missing}; ministry review ${row.ministryReviewStatus || missing}; student record ${locked}.`;
  });
  const prefix=chinese?'您的 stu.best 不利處境學生助學紀錄（站內示範）：':'Your stu.best student aid records (local demonstration):';
  return {
    answer:prefix+'\n'+(lines.length?lines.join('\n'):(chinese?'尚無助學紀錄。':'No student aid records.'))+'\n'+
      (chinese?'此頁提供紀錄查詢；紀錄由站內管理員維護。':'This page provides record lookup; the site administrator maintains these records.'),
    title:chinese?'我的不利處境學生助學紀錄':'My student aid records',url:studentAidPath,
  };
}

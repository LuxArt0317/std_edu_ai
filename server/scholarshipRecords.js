import {schoolServiceEntries} from '../src/features/public/affairs/studentServices.js';

/** Describe the implemented page; no evaluation reference or personal value. */
export function scholarshipPageGuide(){
 const entry=schoolServiceEntries.find(row=>row.id==='9-1');
 if(!entry||entry.group!=='aca'||entry.kind!=='input')return null;
 return {title:entry.title,url:entry.localUrl,
  menu:['校務資訊系統','教務系統','申請輸入程式',entry.section,entry.title],
  sections:[{title:'申請期間',collection:'periods',fields:['termLabel','opensAt','closesAt']},
   {title:'歷史申請紀錄',collection:'applications',periodJoin:'applications.periodId = periods.id',fields:['status','submittedAt','reviewedAt','awardAmount','reviewNote']}],
  statusMeaning:{pending:'Awaiting review, not approval or payment.',approved:'Award approved; this collection contains no payment receipt.',rejected:'Application not approved.',cancelled:'Application cancelled.'},
  missingData:'An absent period or application does not establish rejection, approval, payment or eligibility.'};
}

export function mapScholarshipRecords(periods,applications) {
  return {
    periods:periods.map(row=>({id:row.id,termLabel:row.term_label,opensAt:row.opens_at,closesAt:row.closes_at,
      published:row.published,instructions:row.instructions,sourceMode:row.source_mode,version:row.version})),
    applications:applications.map(row=>({id:row.id,periodId:row.period_id,userId:row.user_id,status:row.status,
      awardAmount:row.award_amount==null?null:Number(row.award_amount),requiredHours:row.required_hours==null?null:Number(row.required_hours),
      actualHours:row.actual_hours==null?null:Number(row.actual_hours),reviewNote:row.review_note,submittedAt:row.submitted_at,
      reviewedAt:row.reviewed_at,cancelledAt:row.cancelled_at,version:row.version})),
  };
}

export function isScholarshipRecordQuestion(question,route='',history=[]) {
  const topic=/scholarships?|獎助學金|獎學金/i;
  const contextual=/application|status|history|award|amount|hours|period|deadline|apply|cancel|申請|審核|紀錄|金額|時數|期間|截止|取消/i;
  // A previous topic or open page is weaker evidence than an explicit new topic.
  const anotherTopic=/\b(?:assignments?|homework|coursework|submissions?|dtm|moodle|materials?|courses?|subjects?|classes|lessons?|grades?|scores?|tuition|fees?|charges?|balance|payments?|timetables?|schedules?|attendance|absences?|leave|internships?|tasks?|todos?|announcements?|notices?|profiles?|student (?:id|number)|enrollments?)\b|作業|功課|繳交|數位教材|教材網|課程|科目|課表|成績|學費|繳費|出席|缺曠|請假|假單|實習|任務|待辦|公告|學籍|學號|選課/i;
  if (!topic.test(question) && anotherTopic.test(question)) return false;
  return (topic.test(question) && /\b(?:my|our|me|i)\b|我|application|status|history|award|amount|hours|period|deadline|apply|cancel|申請|審核|紀錄|金額|時數|期間|截止|取消/i.test(question)) || (contextual.test(question) && (
    route==='/school-affairs/services/9-1' || topic.test(history.filter(item=>item.role==='user').slice(-1)[0]?.content || '')
  ));
}

export function answerScholarshipRecords(question,snapshot,route='',history=[]) {
  if (!isScholarshipRecordQuestion(question,route,history)) return null;
  const records=snapshot.scholarship || {periods:[],applications:[]};
  const chinese=/[\u3400-\u9fff]/.test(question);
  const periods=new Map(records.periods.map(period=>[period.id,period]));
  const date=value=>new Intl.DateTimeFormat(chinese?'zh-TW':'en-US',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  const labels=chinese?{pending:'待審核',approved:'審核通過',rejected:'審核未通過',cancelled:'已取消申請'}:
    {pending:'pending review',approved:'approved',rejected:'rejected',cancelled:'cancelled'};
  const lines=records.applications.map(row=>{
    const title=periods.get(row.periodId)?.termLabel || (chinese?'未載入學期':'Term unavailable');
    const amounts=row.status==='approved'?(chinese?`；獎助金額 NT$${row.awardAmount}；應服務 ${row.requiredHours} 小時，實際 ${row.actualHours} 小時`:
      `; award NT$${row.awardAmount}; required service ${row.requiredHours} hours, actual ${row.actualHours} hours`):'';
    return `${title}: ${labels[row.status]}${amounts}${row.reviewNote?` (${row.reviewNote})`:''}`;
  });
  const periodLines=records.periods.filter(period=>period.published).map(period=>{
    const now=Date.parse(snapshot.checkedAt);
    const state=now<Date.parse(period.opensAt)?(chinese?'尚未開始':'upcoming'):now<Date.parse(period.closesAt)?(chinese?'申請中':'open'):(chinese?'已截止':'closed');
    return `${period.termLabel}: ${date(period.opensAt)} – ${date(period.closesAt)} (${state})`;
  });
  const answer=chinese
    ? `你已儲存的獎助學金申請：\n${lines.length?lines.join('\n'):'尚無申請紀錄。'}\n${periodLines.length?'申請期間（臺北時間）：\n'+periodLines.join('\n'):'管理員尚未公布站內申請期間。'}\n請在獎助學金頁面確認後申請或取消；僅在申請期間內、尚未審核的申請可取消。`
    : `Your saved scholarship applications:\n${lines.length?lines.join('\n'):'No application history.'}\n${periodLines.length?'Application periods (Taipei time):\n'+periodLines.join('\n'):'No local application period has been published.'}\nApply or cancel after reviewing the scholarship page. Cancellation is available only during the application period before review.`;
  const guide=scholarshipPageGuide();
  const navigation=guide&&/\b(?:where|find|locate|navigate|which page)\b|哪裡|哪里|何處|何处|怎麼查|怎么查/iu.test(question)
    ?chinese?`可以從「${guide.menu.join(' → ')}」開啟[${guide.title}](${guide.url})。對照申請期間與下方歷史申請紀錄的狀態；待審核不代表已核准或已付款。`
      :`Open [${guide.title}](${guide.url}) under School Affairs → Academic Affairs → Application/Input Programs → International Students. Match the application period with its entry in application history and check its status. Pending review does not mean approved or paid.`:'';
  return {answer:[navigation,answer].filter(Boolean).join('\n\n'),title:chinese?'我的獎助學金申請':'My scholarship applications',url:'/school-affairs/services/9-1'};
}

const historyPath='/school-affairs/services/11-1',timetablePath='/school-affairs/services/11-2';
const historyTopic=/選課(?:紀錄|記錄|歷史)|\b(?:course[ -]selection|selection history|registration history)\b/i;
const timetableTopic=/課表|功課表|\b(?:timetables?|weekly schedule|class schedule|course schedule)\b/i;
const otherTopic=/\b(?:dtm|moodle|elearning|grades?|scores?|gpa|fees?|tuition|charges?|scholarships?|financial aid|student aid|housing|dormitory|assignments?|homework|attendance|leave|internships?|catalog|offerings?|offered|syllabus|credit[ -]load|overload|underload)\b|成績|分數|學費|繳費|欠費|獎學金|助學|宿舍|住宿|作業|出席|請假|實習|開課|課程大綱|超修|減修|抵免|畢業學分/i;
const currentSchedule=/\b(?:today|tomorrow|(?:next|this|current|upcoming|future|past|previous) (?:class|course|lesson|term|semester|week|timetable|schedule)|(?:past|previous|historical|completed|old|upcoming|future|current) (?:classes|subjects|courses|lessons)|currently enrolled)\b|今天|今日|明天|明日|下一堂|下一門課|下堂|目前修課|本學期|這學期|下學期|上學期|目前課表|現在課表|本週|下週|本周|下周/i;
const phases=[
  {key:'initial',zh:'初選',en:'initial selection',match:/初選|\binitial(?: selection)?\b/i},
  {key:'add_drop',zh:'加退選',en:'add/drop',match:/加退選|\badd[\s_/-]*drop\b/i},
  {key:'withdrawal',zh:'棄選',en:'withdrawal',match:/棄選|\bwithdrawal\b/i},
  {key:'summer1',zh:'暑一',en:'summer 1',match:/暑一|\bsummer[\s_-]*1\b|\bfirst summer\b/i},
];
export const courseSelectionPeriods=[
  {period:'1',time:'08:10~09:00'},{period:'2',time:'09:10~10:00'},
  {period:'3',time:'10:10~11:00'},{period:'4',time:'11:10~12:00'},
  {period:'午',time:'12:10~13:00'},{period:'5',time:'13:10~14:00'},
  {period:'6',time:'14:10~15:00'},{period:'7',time:'15:10~16:00'},
  {period:'8',time:'16:10~17:00'},{period:'傍',time:'17:10~18:00'},
  {period:'A',time:'18:20~19:10'},{period:'B',time:'19:15~20:05'},
  {period:'C',time:'20:10~21:00'},{period:'D',time:'21:05~21:55'},
];
export const courseSelectionNavigation=[
  {id:'course-selection-history',match:historyTopic,title:['選課記錄查詢','Course-selection history'],
    officialUrl:'https://infosys.stu.edu.tw/WebSelectCourse/Login/AspLogin/SelectCourse',localUrl:historyPath,
    description:['查詢您的站內學年、學期與選課階段紀錄。','View your local course selections by academic year, semester and selection phase.']},
  {id:'weekly-timetable',match:timetableTopic,title:['我的課表','My weekly timetable'],
    officialUrl:'https://infosys.stu.edu.tw/WebSelectCourse/Login/AspLogin/QryMyCourse',localUrl:timetablePath,
    description:['查詢您的站內選課階段課表與未排課科目。','View your local phase-specific weekly timetable and unscheduled courses.']},
];

export function mapCourseSelection(rows) {
  return {records:rows.map(row=>({
    id:row.id,userId:row.user_id,academicYear:Number(row.academic_year),semester:Number(row.semester),
    selectionPhase:row.selection_phase,termCourseCode:row.term_course_code,courseTitle:row.course_title,
    requiredElectiveText:row.required_elective_text ?? null,credits:Number(row.credits),
    instructorOne:row.instructor_one ?? null,remarkText:row.remark_text ?? null,rowOrder:Number(row.row_order),
    timetableIncluded:row.timetable_included===true,
    meetings:(row.meetings ?? []).map(slot=>({weekday:Number(slot.weekday),period:slot.period,room:slot.room})),
    sourceMode:row.source_mode,version:Number(row.version),createdAt:row.created_at,updatedAt:row.updated_at,
  }))};
}
export function courseSelectionFilters(text) {
  const year=text.match(/(?:academic\s+year|學年)\s*[:：]?\s*([1-9]\d{0,3})\b/i)?.[1]
    ?? text.match(/(?:^|[^\d])([1-9]\d{0,3})\s*(?:學年|academic\s+year\b)/i)?.[1];
  const semester=text.match(/(?:semester|學期)\s*[:：]?\s*(one\b|two\b|summer\b|[123](?!\d)|[一二暑])/i)?.[1]
    ?? text.match(/(?:^|[^\d])第?\s*([123一二暑])\s*學期/)?.[1]
    ?? (/暑期/.test(text)?'暑':undefined);
  const numericSemester=text.match(/(?:semester|學期)\s*[:：]?\s*(\d+)/i)?.[1]
    ?? text.match(/第?\s*(\d+)\s*學期/)?.[1];
  const matched=phases.filter(phase=>phase.match.test(text));
  return {academicYear:year?Number(year):undefined,
    semester:semester?({one:1,two:2,summer:3,'一':1,'二':2,'暑':3}[semester.toLowerCase()] ?? Number(semester)):undefined,
    selectionPhase:matched.length===1?matched[0].key:undefined,ambiguousPhase:matched.length>1,
    invalidSemester:numericSemester!==undefined && !/^[123]$/.test(numericSemester)};
}
function hasFilters(question) {
  const value=courseSelectionFilters(question);
  return Boolean(value.academicYear || value.semester || value.selectionPhase || value.ambiguousPhase || value.invalidSemester);
}
function contextualQuestion(question) {
  return /\b(?:show|records?|history|which|courses?|subjects?|semester|year|phase|stage|room|where|when|time|credits?|schedule|details|result)\b|紀錄|記錄|哪些|哪裡|教室|時間|學年|學期|階段|科目|學分|查詢|顯示|結果/i.test(question) || hasFilters(question);
}
export function isCourseSelectionQuestion(question,route='',history=[]) {
  if(otherTopic.test(question) || currentSchedule.test(question))return false;
  // Navigation and registration instructions belong to the public directory;
  // route context alone must not turn them into a private empty-record answer.
  if(/\b(?:how (?:do|can|to)|where (?:can|do) i (?:find|open)|where is|navigate|open (?:the|a))\b|如何選課|怎麼選課|如何加選|去哪選課|選課系統在哪|開啟選課/i.test(question)
    && !/\b(?:my|mine|our|records?|history)\b|我的|紀錄|記錄|歷史/.test(question))return false;
  if(historyTopic.test(question) || timetableTopic.test(question))return /\b(?:my|mine|our|me|records?|history|show|list|which|when|where|all|every|credits?|semester|year|phase|stage)\b|我的|紀錄|記錄|歷史|查詢|顯示|全部|所有|歷年|學年|學期|階段|學分/i.test(question) || hasFilters(question);
  const previous=history.filter(item=>item.role==='user').at(-1)?.content || '';
  const context=route===historyPath || route===timetablePath || historyTopic.test(previous) || timetableTopic.test(previous);
  return context && contextualQuestion(question);
}
function scopeKey(row) {return `${row.academicYear}/${row.semester}/${row.selectionPhase}`;}
function scopeLabel(row,zh) {
  const phase=phases.find(item=>item.key===row.selectionPhase);
  return zh?`${row.academicYear} 學年 · ${row.semester===3?'暑期':`第 ${row.semester} 學期`} · ${phase?.zh || row.selectionPhase}`
    :`Academic year ${row.academicYear} · ${row.semester===3?'summer semester':`semester ${row.semester}`} · ${phase?.en || row.selectionPhase}`;
}

export function answerCourseSelection(question,snapshot,route='',history=[]) {
  if(!isCourseSelectionQuestion(question,route,history))return null;
  const zh=/[\u3400-\u9fff]/.test(question),userId=snapshot.profile?.userId;
  const previous=history.filter(item=>item.role==='user').at(-1)?.content || '';
  const timetable=timetableTopic.test(question) || (!historyTopic.test(question) &&
    (route===timetablePath || timetableTopic.test(previous)));
  const own=userId?(snapshot.courseSelection?.records ?? []).filter(row=>row.userId===userId):[];
  const explicit=courseSelectionFilters(question),prior=(historyTopic.test(previous) || timetableTopic.test(previous) ||
    ((route===historyPath || route===timetablePath) && !otherTopic.test(previous) && hasFilters(previous)))?courseSelectionFilters(previous):{};
  const selected={academicYear:explicit.academicYear ?? prior.academicYear,semester:explicit.semester ?? prior.semester,
    selectionPhase:explicit.selectionPhase ?? prior.selectionPhase};
  const rows=own.filter(row=>(selected.academicYear===undefined || row.academicYear===selected.academicYear) &&
    (selected.semester===undefined || row.semester===selected.semester) &&
    (selected.selectionPhase===undefined || row.selectionPhase===selected.selectionPhase))
    .sort((a,b)=>b.academicYear-a.academicYear || b.semester-a.semester || a.selectionPhase.localeCompare(b.selectionPhase) ||
      a.rowOrder-b.rowOrder || a.id.localeCompare(b.id));
  const scopes=[...new Map(rows.map(row=>[scopeKey(row),row])).values()];
  const title=zh?(timetable?'我的課表':'選課記錄查詢'):(timetable?'My weekly timetable':'Course-selection history');
  const result=answer=>({answer,title,url:timetable?timetablePath:historyPath});
  const provenance=zh?'站內示範紀錄，由管理員維護；不代表校方選課或即時同步。'
    :'Local demonstration records maintained by the site administrator; they do not represent university registration or live synchronization.';
  if(explicit.invalidSemester)return result((zh?'請指定第一、第二或暑期學期。':'Please specify semester 1, semester 2 or the summer semester.')+'\n'+provenance);
  if(explicit.ambiguousPhase || (scopes.length>1 && (timetable || !/\b(?:all|every)\b|全部|所有|歷年/i.test(question)))) {
    return result((zh?'請指定學年、學期與一個選課階段，以免混合不同階段的紀錄。':'Please specify the academic year, semester and one selection phase so different snapshots are not mixed.')+
      (scopes.length?'\n'+scopes.map(row=>scopeLabel(row,zh)).join('\n'):'')+'\n'+provenance);
  }
  const visible=timetable?rows.filter(row=>row.timetableIncluded):rows;
  if(!visible.length)return result((zh?(timetable?'沒有符合條件的課表紀錄。':'沒有符合條件的選課紀錄。')
    :(timetable?'No timetable records match these filters.':'No course-selection records match these filters.'))+'\n'+provenance);
  const missing=zh?'未記錄':'not recorded';
  const weekdays=zh?['周一','周二','周三','周四','周五','周六','周日']:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const lines=visible.map(row=>{
    const heading=`${scopeLabel(row,zh)} · ${row.termCourseCode} · ${row.courseTitle}`;
    if(!timetable)return heading+(zh?`；必選修：${row.requiredElectiveText || missing}；${row.credits} 學分；教師一：${row.instructorOne || missing}；備註：${row.remarkText || missing}。`
      :`; required/elective: ${row.requiredElectiveText || missing}; ${row.credits} credits; instructor: ${row.instructorOne || missing}; remark: ${row.remarkText || missing}.`);
    const meetings=[...row.meetings].sort((a,b)=>a.weekday-b.weekday ||
      courseSelectionPeriods.findIndex(item=>item.period===a.period)-courseSelectionPeriods.findIndex(item=>item.period===b.period));
    return heading+' — '+(meetings.length?meetings.map(slot=>`${weekdays[slot.weekday-1]} ${zh?'節次':'period'} ${slot.period} `+
      `${courseSelectionPeriods.find(item=>item.period===slot.period)?.time || ''} · ${zh?'教室':'room'} ${slot.room || missing}`).join('; ')
      :(zh?'未排課科目':'Unscheduled course'));
  });
  return result(lines.join('\n')+'\n'+provenance);
}

// Browser-safe validation and private-record presentation; no database side effects.
export const academicAttendancePaths={statistics:'/school-affairs/services/14-1',detail:'/school-affairs/services/14-1/detail'};
export const academicAttendanceReadSources=[
  {key:'statistics',table:'affairs_academic_attendance_statistics',order:'academic_year.desc,semester.desc,row_order.asc,id.asc'},
  {key:'details',table:'affairs_academic_attendance_details',order:'academic_year.desc,semester.desc,row_order.asc,id.asc'},
  {key:'metadata',table:'affairs_academic_attendance_metadata',order:'user_id.asc,id.asc'},
];
export const academicAttendanceMaxPayloadBytes=8000;
export const academicAttendanceFields={
  save_academic_attendance_statistic:['academic_year','semester','student_number','student_name','course_code','course_title','total_teaching_hours','current_teaching_weeks','current_teaching_hours','absence_hours','unexcused_absence_hours','row_order'],
  save_academic_attendance_detail:['academic_year','semester','course_code','course_title','teacher_name','absence_type_text','course_date','period_text','roll_called_at','row_order'],
  save_academic_attendance_metadata:['current_academic_year','current_semester'],
};
const textLimits={student_number:80,student_name:160,course_code:80,course_title:160,teacher_name:160,absence_type_text:80,period_text:80};
const hourFields=['total_teaching_hours','current_teaching_weeks','current_teaching_hours','absence_hours','unexcused_absence_hours'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const integer=(value,min,max)=>typeof value==='number' && Number.isInteger(value) && value>=min && value<=max;
const numeric=value=>value===null || typeof value==='number' && Number.isFinite(value) && value>=0 && value<=9999.99 && Number(value.toFixed(2))===value;
function validText(value,max,required=false){
  if(value===null)return !required;
  if(typeof value!=='string' || [...value].length>max || required && !value.trim())return false;
  return [...value].every(character=>{const point=character.codePointAt(0);return point!==0 && !(point>=0xd800 && point<=0xdfff);});
}
function dateOnly(value){
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number),days=[31,year%4===0 && (year%100!==0 || year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0 && month>=1 && month<=12 && day>=1 && day<=days[month-1];
}
function timestamp(value){return typeof value==='string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](0\d|1[0-5]):[0-5]\d)$/.test(value) && dateOnly(value.slice(0,10));}
export function academicAttendancePayloadBytes(value){
  try{
    if(!value || typeof value!=='object' || Array.isArray(value))return Infinity;
    const entries=Object.entries(value);
    if(entries.some(([,item])=>item!==null && !['string','number','boolean'].includes(typeof item) || typeof item==='number' && !Number.isFinite(item)))return Infinity;
    return new TextEncoder().encode('{'+entries.map(([key,item])=>JSON.stringify(key)+': '+JSON.stringify(item)).join(', ')+'}').byteLength;
  }catch{return Infinity;}
}
export function validateAcademicAttendancePayload(kind,value){
  if(typeof kind!=='string' || !Object.hasOwn(academicAttendanceFields,kind))return 'Invalid attendance operation.';
  const fields=academicAttendanceFields[kind];
  if(!fields || !value || typeof value!=='object' || Array.isArray(value))return 'Invalid attendance operation.';
  const keys=['id','user_id','request_id','expected_version',...fields];
  if(Object.keys(value).length!==keys.length || !keys.every(key=>Object.hasOwn(value,key)))return 'Attendance payload must contain exactly the approved fields, including nullable fields.';
  if(!['id','user_id','request_id'].every(key=>typeof value[key]==='string' && uuid.test(value[key])) || !integer(value.expected_version,0,999999999))return 'Invalid account, record, request ID or expected version.';
  if(kind==='save_academic_attendance_metadata'){
    if(!(value.current_academic_year===null && value.current_semester===null) && !(integer(value.current_academic_year,1,9999) && integer(value.current_semester,1,3)))return 'Current academic year and semester must both be valid, or both null.';
  }else{
    if(!integer(value.academic_year,1,9999) || !integer(value.semester,1,3) || !integer(value.row_order,0,999999))return 'Invalid academic year, semester or row order.';
    for(const key of fields){
      if(Object.hasOwn(textLimits,key) && !validText(value[key],textLimits[key],['course_code','course_title'].includes(key)))return `Invalid attendance text field: ${key}.`;
      if(hourFields.includes(key) && !numeric(value[key]))return `Invalid attendance numeric field: ${key}; use null or 0..9999.99 with at most two decimals.`;
    }
    if(kind==='save_academic_attendance_detail'){
      if(value.course_date!==null && !dateOnly(value.course_date))return 'Course date must be null or an actual YYYY-MM-DD date.';
      if(value.roll_called_at!==null && !timestamp(value.roll_called_at))return 'Roll-call time must be null or an actual zoned ISO timestamp.';
    }
  }
  return academicAttendancePayloadBytes(value)>academicAttendanceMaxPayloadBytes?'Attendance operation exceeds the 8000-byte JSONB limit.':null;
}
const nullableNumber=value=>value===null || value===undefined?null:Number(value);
const common=row=>({id:row.id,userId:row.user_id,sourceMode:row.source_mode,version:Number(row.version),createdAt:row.created_at,updatedAt:row.updated_at});
const term=row=>({academicYear:Number(row.academic_year),semester:Number(row.semester),rowOrder:Number(row.row_order)});
export function mapAcademicAttendance(statistics=[],details=[],metadata=[]){return {
  statistics:statistics.map(row=>({...common(row),...term(row),studentNumber:row.student_number ?? null,studentName:row.student_name ?? null,
    courseCode:row.course_code,courseTitle:row.course_title,totalTeachingHours:nullableNumber(row.total_teaching_hours),currentTeachingWeeks:nullableNumber(row.current_teaching_weeks),
    currentTeachingHours:nullableNumber(row.current_teaching_hours),absenceHours:nullableNumber(row.absence_hours),unexcusedAbsenceHours:nullableNumber(row.unexcused_absence_hours)})),
  details:details.map(row=>({...common(row),...term(row),courseCode:row.course_code,courseTitle:row.course_title,teacherName:row.teacher_name ?? null,
    absenceTypeText:row.absence_type_text ?? null,courseDate:row.course_date ?? null,periodText:row.period_text ?? null,rollCalledAt:row.roll_called_at ?? null})),
  metadata:metadata.map(row=>({...common(row),currentAcademicYear:nullableNumber(row.current_academic_year),currentSemester:nullableNumber(row.current_semester)})),
};}
const topic=/\b(?:attendance|absences?|absent|roll[ -]?calls?|missed (?:classes|lessons)|unexcused)\b|\b(?:classes|lessons)\b.{0,25}\bmissed\b|缺曠|缺課|曠課|出席|缺席|點名/i;
const otherTopic=/\b(?:dtm|moodle|elearning|e-learning|assignments?|grades?|transcripts?|gpa|rankings?|course[ -]selection|selection history|timetables?|fees?|tuition|scholarships?|housing|dormitory|credit[ -]load|overload|underload|graduation|leave (?:applications?|requests?|status))\b|數位教材|教材網|作業|成績|選課紀錄|選課記錄|課表|學費|繳費|獎學金|住宿|宿舍|超修|減修|畢業|請假(?:申請|狀態|進度|紀錄|記錄)/i;
const context=/\b(?:my|records?|statistics|details?|hours?|weeks?|periods?|when|dates?|teacher|course|year|semester|term|current)\b|我的|統計|明細|時數|週次|節次|日期|老師|課號|學年|學期|當期/i;
const relative=/\b(?:current|currently|now)\b|\bthis (?:term|semester|year)\b|目前|當期|當學期|本學期|這學期|今年/i;
export const academicAttendanceNavigation={id:'academic-attendance',match:topic,title:['學生缺曠課查詢','Academic attendance'],
  officialUrl:'https://infosys.stu.edu.tw/StuOffclass/Login/AspLogin/2',localUrl:academicAttendancePaths.statistics,
  description:['查看您的站內當學期缺曠課統計與明細。','View your local current-term absence statistics and detail records.']};
export function isAcademicAttendanceQuestion(question,route='',history=[]){
  if(otherTopic.test(question))return false;
  if(/^(?:please\s+)?(?:remind me|add (?:a )?task|create (?:a )?task|complete (?:my |the )?task)|新增待辦|建立任務|完成任務/i.test(question))return false;
  if(/\b(?:where (?:can|do) i (?:find|open)|where is|(?:link|url|website) for|how (?:do|can) i (?:open|find|access))\b|(?:連結|網址)|哪裡開啟/i.test(question))return false;
  const previous=history.filter(item=>item.role==='user').at(-1)?.content || '';
  const dtmContext=/^\/dtm(?:\/|$)/i.test(route) || (!Object.values(academicAttendancePaths).includes(route) && /\b(?:dtm|moodle|elearning|e-learning)\b|數位教材|教材網/i.test(previous));
  if(dtmContext && !/\b(?:academic attendance|StuOffclass)\b|缺曠|缺課|曠課/i.test(question))return false;
  if(topic.test(question))return true;
  const selected=filters(question);
  return (context.test(question) || selected.academicYear!==undefined || selected.semester!==undefined || selected.invalid)
    && (Object.values(academicAttendancePaths).includes(route) || !otherTopic.test(previous) && topic.test(previous));
}
function filters(question){
  const year=question.match(/(?:academic\s+year|學年)\s*[:：]?\s*(\d+)/i)?.[1] ?? question.match(/(?:^|[^\d])(\d+)\s*(?:學年|academic\s+year\b)/i)?.[1];
  const raw=question.match(/(?:semester|學期)\s*[:：]?\s*(\d+|one\b|two\b|summer\b|[一二暑])/i)?.[1] ?? question.match(/(?:^|[^\d])第?\s*(\d+|[一二暑])\s*學期/)?.[1];
  const semester=raw?({one:1,two:2,summer:3,'一':1,'二':2,'暑':3}[raw.toLowerCase()] ?? Number(raw)):undefined;
  return {academicYear:year?Number(year):undefined,semester,invalid:Boolean(year && !/^[1-9]\d{0,3}$/.test(year) || raw && ![1,2,3].includes(semester))};
}
// The caller supplies already owner-scoped metadata/rows. This selector does
// not authorize data; both answers and evidence apply their own boundary first.
export function academicAttendanceQuery(question,metadata=[],route='',history=[]){
  route=route.split(/[?#]/)[0].replace(/\/+$/,'');
  const clauses=question.split(/\s+(?:and|also)\s+|[;；\n]|以及|還有/i).filter(part=>!otherTopic.test(part));
  const scopes=clauses.map(part=>({...filters(part),
    view:/\b(?:details?|dates?|periods?|when|roll[ -]?calls?)\b|明細|日期|節次|點名|\b\d{4}-\d{2}-\d{2}\b/i.test(part)?'details':/\bstatistics\b|統計/i.test(part)?'statistics':undefined,
    courseCode:part.match(/(?:course\s*code|課號)\s*[:：]?\s*([A-Za-z0-9._-]+)/i)?.[1]?.toLowerCase()}));
  const multipleScopes=['view','academicYear','semester','courseCode'].some(key=>new Set(scopes.map(scope=>scope[key]).filter(value=>value!==undefined)).size>1);
  if(clauses.length)question=clauses.join(' and ');
  const previous=history.filter(item=>item.role==='user').at(-1)?.content || '',hasContext=!otherTopic.test(previous) && topic.test(previous);
  const requestedDates=[...new Set([...question.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map(match=>match[1]))];
  const detail=requestedDates.length>0 || /\b(?:details?|dates?|periods?|when|roll[ -]?calls?)\b|明細|日期|節次|點名/i.test(question) ||
    !/\bstatistics\b|統計/i.test(question) && (route===academicAttendancePaths.detail || hasContext && /\bdetails?\b|明細/i.test(previous));
  const subTermPeriod=/\b(?:daily|weekly|monthly|today|yesterday|tomorrow|(?:this|last|next|past|previous|each|per) (?:day|week|month)|week\s*\d+|last\s+\d+\s+days?)\b|今天|昨天|明天|每天|每週|每月|本週|這週|上週|下週|本月|這個月|上個月|下個月|第\s*\d+\s*週/i.test(question);
  const explicit=filters(question),prior=hasContext?filters(previous):{},selected={academicYear:explicit.academicYear ?? prior.academicYear,semester:explicit.semester ?? prior.semester};
  let reason=null;
  if(multipleScopes)reason='multiple_scopes';
  else if((subTermPeriod || requestedDates.length>0) && /\b(?:hours?|statistics|totals?)\b|時數|小時|統計|總計/i.test(question))reason='subterm_hours_unavailable';
  else if(requestedDates.length>1 || requestedDates.some(value=>!dateOnly(value)))reason='invalid_date';
  else if(subTermPeriod && !requestedDates.length)reason='date_required';
  else if(explicit.invalid)reason='invalid_term';
  else if(/\b(?:last|previous|next) (?:term|semester|year)\b|上學期|下學期|去年|明年/i.test(question) && (explicit.academicYear===undefined || explicit.semester===undefined))reason='relative_term';
  const meta=metadata.length===1?metadata[0]:undefined;
  if(!reason && (relative.test(question) || selected.academicYear===undefined && selected.semester===undefined)){
    if(meta?.currentAcademicYear==null || meta?.currentSemester==null)reason='current_term_missing';
    else if(relative.test(question) && (selected.academicYear!==undefined && selected.academicYear!==meta.currentAcademicYear || selected.semester!==undefined && selected.semester!==meta.currentSemester))reason='current_term_conflict';
    else {selected.academicYear=meta.currentAcademicYear;selected.semester=meta.currentSemester;}
  }
  if(!reason && (selected.academicYear===undefined || selected.semester===undefined))reason='term_required';
  return {view:detail?'details':'statistics',...selected,courseDate:requestedDates.length===1?requestedDates[0]:null,
    courseCode:question.match(/(?:course\s*code|課號)\s*[:：]?\s*([A-Za-z0-9._-]+)/i)?.[1]??null,reason};
}
export function academicAttendanceMatchingRows(rows,query,question){
  if(query.reason)return [];
  let selected=rows.filter(row=>row.academicYear===query.academicYear && row.semester===query.semester)
    .sort((a,b)=>a.rowOrder-b.rowOrder || String(a.id).localeCompare(String(b.id)));
  if(query.courseDate)selected=selected.filter(row=>row.courseDate===query.courseDate);
  if(query.courseCode)selected=selected.filter(row=>typeof row.courseCode==='string'&&row.courseCode.toLowerCase()===query.courseCode.toLowerCase());
  else {const named=selected.filter(row=>typeof row.courseTitle==='string'&&row.courseTitle.trim().length>=3&&question.toLowerCase().includes(row.courseTitle.trim().toLowerCase()));if(named.length)selected=named;}
  return selected;
}
export function answerAcademicAttendance(question,snapshot,route='',history=[]){
  if(!isAcademicAttendanceQuestion(question,route,history))return null;
  const zh=/[\u3400-\u9fff]/.test(question),userId=snapshot.profile?.userId,missing=zh?'未記錄':'not recorded';
  const own=rows=>userId?(rows ?? []).filter(row=>row.userId===userId):[],data=snapshot.academicAttendance ?? {};
  const query=academicAttendanceQuery(question,own(data.metadata),route,history),detail=query.view==='details';
  const title=zh?(detail?'缺曠課明細':'缺曠課統計'):(detail?'Absence details':'Absence statistics'),url=detail?academicAttendancePaths.detail:academicAttendancePaths.statistics;
  const provenance=zh?'站內示範紀錄，由管理員維護；統計值獨立儲存，不由明細或站內請假狀態推算。'
    :'Local demonstration records maintained by the site administrator; statistics are stored explicitly, not derived from details or local leave status.';
  const result=answer=>({answer:answer+'\n'+provenance,title,url});
  if(query.reason==='multiple_scopes')return result(zh?'您指定了不同的缺曠課查詢種類、學期或課號。請一次選擇一個查詢範圍；本回覆尚未查選或合併紀錄。'
    :'You requested different attendance views, terms or course codes. Please choose one scope at a time; no records have been selected or merged for this reply.');
  if(query.reason==='subterm_hours_unavailable')return result(
    (zh?'站內僅儲存明列的學期時數統計，沒有每日、每週或每月時數加總。不能由明細筆數或節次換算時數。可查看原始缺曠課明細：'
      :'Only explicit term-level hour statistics are stored; daily, weekly and monthly hour totals are unavailable. Detail row counts and period labels cannot be converted into hours. View the recorded absence details: ')+academicAttendancePaths.detail);
  if(query.reason==='invalid_date')return result(zh?'請指定一個有效的 YYYY-MM-DD 課程日期；不會將多個日期視為已套用的日期範圍。'
    :'Specify one actual YYYY-MM-DD course date; multiple dates are not treated as an applied date range.');
  if(query.reason==='date_required')return result(zh?'請指定 YYYY-MM-DD 課程日期以查詢明細；不推算相對日期或週次。'
    :'Specify a YYYY-MM-DD course date for detail records; relative dates and week ranges are not inferred.');
  if(query.reason==='invalid_term')return result(zh?'請指定有效學年與第一、第二或暑期學期。':'Specify a valid academic year and semester 1, 2 or summer.');
  if(query.reason==='relative_term')
    return result(zh?'請指定學年與學期；本查詢不推算相對學期。':'Specify the academic year and semester; this query does not infer relative terms.');
  if(query.reason==='current_term_missing')return result(zh?'尚未明確指定您的當學期。請指定學年與學期，或由管理員維護當期設定；不會將最新歷史資料視為當期。'
      :'Your current term has not been explicitly designated. Specify an academic year and semester, or have an administrator maintain that setting; the latest history is not assumed current.');
  if(query.reason==='current_term_conflict')
      return result(zh?'指定的學年學期與明列當期設定不同，請確認查詢範圍。':'The specified term differs from the explicitly designated current term. Please clarify which term to query.');
  if(query.reason==='term_required')return result(zh?'請同時指定學年與學期。':'Specify both the academic year and semester.');
  const rows=academicAttendanceMatchingRows(own(detail?data.details:data.statistics),query,question);
  const label=zh?`${query.academicYear} 學年第 ${query.semester} 學期`:`Academic year ${query.academicYear}, semester ${query.semester}`;
  if(!rows.length)return result(label+'\n'+(zh?'沒有符合條件的站內紀錄。這不表示校方紀錄為空。':'No local records match these filters. This does not establish that your university records are empty.'));
  const shown=rows.slice(0,20),display=value=>value ?? missing;
  const lines=[label,...shown.map(row=>detail
    ? (zh?`${row.courseCode} · ${row.courseTitle}；老師 ${display(row.teacherName)}；類別 ${display(row.absenceTypeText)}；課程日期 ${display(row.courseDate)}；節次 ${display(row.periodText)}；點名時間 ${display(row.rollCalledAt)}。`
      :`${row.courseCode} · ${row.courseTitle}; teacher ${display(row.teacherName)}; type ${display(row.absenceTypeText)}; course date ${display(row.courseDate)}; period ${display(row.periodText)}; roll-call time ${display(row.rollCalledAt)}.`)
    : (zh?`${row.courseCode} · ${row.courseTitle}；本學期授課總時數 ${display(row.totalTeachingHours)}；目前授課總週次 ${display(row.currentTeachingWeeks)}；目前授課總時數 ${display(row.currentTeachingHours)}；目前缺課時數 ${display(row.absenceHours)}；目前曠課時數 ${display(row.unexcusedAbsenceHours)}。`
      :`${row.courseCode} · ${row.courseTitle}; term teaching hours ${display(row.totalTeachingHours)}; current teaching weeks ${display(row.currentTeachingWeeks)}; current teaching hours ${display(row.currentTeachingHours)}; absence hours ${display(row.absenceHours)}; unexcused absence hours ${display(row.unexcusedAbsenceHours)}.`))];
  lines.push(zh?`顯示 ${shown.length} / ${rows.length} 筆符合條件的紀錄。`:`Showing ${shown.length} of ${rows.length} matching records.`);
  if(shown.length<rows.length)lines.push(zh?`此回覆僅顯示部分紀錄；完整站內資料：${url}`:`This reply shows only part of the records; complete local records: ${url}`);
  return result(lines.join('\n'));
}

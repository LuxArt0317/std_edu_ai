import {studyCalendar} from './affairsSchedule.js';
import {internshipPath, leavePath} from '../src/features/public/affairs/studentServices.js';
import {selectAccountEvidence,selectServiceRecords,ownEvidenceRows} from './accountEvidenceSelection.js';

const dtmWords = /\b(?:dtm|moodle|digital teaching materials)\b|數位教材|教材網/i;
const assignmentWords = /\b(?:assignments?|homework|coursework|submissions?)\b|作業|功課|繳交/i;
const gradeWords = /\b(?:grades?|scores?|gradebook|marks|feedback)\b|成績|分數|評語|回饋/i;
const courseWords = /\b(?:subjects?|courses?|class(?:es)?|lessons?|academic (?:year|term)|semesters?)\b|科目|課程|學年度|學期/i;
const materialWords = /\b(?:materials?|resources?|slides|lecture notes)\b|教材|講義/i;
const attendanceWords = /\b(?:attendance|absences?|absent|meetings?|sessions?)\b|出席|缺課|缺席|上課紀錄|下堂課|今天上課|明天上課/i;
const classWords = /\b(?:class(?:es)?|lessons?)\b|課堂|上課|什麼課|有哪些課/i;
const scheduleWords = /\b(?:next|today|tomorrow|miss(?:ed)?|schedule|timetable)\b|下一節|今天|明天/i;
const missedWords = /\b(?:miss(?:ed)?|absent|last (?:meeting|class|lesson|session))\b|缺席|缺課|上次上課/i;
const pendingWords = /\b(?:unfinished|incomplete|outstanding|pending|not (?:yet )?(?:been )?(?:finish(?:ed)?|done|submit(?:ted)?)|haven['’]t (?:yet )?(?:finished|done|submitted)|still (?:need|left)|overdue)\b|未完成|未繳|尚未交|待繳|逾期/i;
const followUp = /^(?:and\b|how about\b|what about\b|also\b|那|還有)/i;
const onDtm = route => /^\/(?:dtm(?:\/|$)|school-sites\/dtm\.stu\.edu\.tw(?:\/|$))/.test(route);
const noticeWords = /\b(?:notices?|announcements?)\b|公告/i;
const recordTopic = q => [assignmentWords, gradeWords, courseWords, materialWords, attendanceWords, noticeWords, /\brole\b|角色/i].some(pattern=>pattern.test(q));
const localized = q => /[\u3400-\u9fff]/.test(q);
const dateFrom = q => /\b(20\d{2}-\d{2}-\d{2})\b/.exec(q)?.[1];
const escape = value => String(value ?? '').replace(/[\r\n]+/g,' ').replace(/[\\<>\x60*_[\]()~#!|]/g,'\\$&');
const link = (title,path) => '[' + escape(title) + '](' + path + ')';
const coursePath = course => '/dtm/course/' + encodeURIComponent(course.id);
const normalized=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
function names(question,value) {
  const name=normalized(value),q=normalized(question);
  if(name.length<2)return false;
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(?:^|[^a-z0-9])'+escaped+'(?=$|[^a-z0-9])','i').test(q);
}
const vagueFollowUp=q=>followUp.test(q)||/\b(?:what feedback|what (?:was|were|is) (?:it|that|the score)|what about (?:it|that))\b|那個|評語呢/i.test(q);

function previousQuestion(history) {
  return [...history].reverse().find(row=>row.role==='user')?.content || '';
}

export function isDtmRecordQuestion(question,route='',history=[]) {
  const previous = vagueFollowUp(question) ? previousQuestion(history) : '';
  return (recordTopic(question) && (dtmWords.test(question) || onDtm(route) || dtmWords.test(previous)))
    || (missedWords.test(question) && (assignmentWords.test(question) || /what.{0,15}missed|缺課|缺席/i.test(question)))
    || (assignmentWords.test(question) && pendingWords.test(question));
}

function dueLabel(due, zh,iso=false) {
  if(due&&!Number.isFinite(Date.parse(due)))return zh?'未記錄有效截止日期':'no valid deadline recorded';
  if(due&&iso){const day=studyCalendar([],due).day,time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(due));return day+' '+time+(zh?'（臺灣時間）':' Taipei');}
  return due ? new Intl.DateTimeFormat(zh?'zh-TW':'en-GB',{
    timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short',
  }).format(new Date(due)) + (zh?'（臺灣時間）':' Taipei') : (zh?'無截止日期':'no deadline');
}
const assignmentStatus = {open:['未完成','open'],submitted:['已記錄繳交','marked submitted'],graded:['已記錄評分','marked graded']};
const attendanceStatus = {unknown:['未記錄','unrecorded'],present:['出席','present'],absent:['缺席','absent'],excused:['請假','excused'],late:['遲到','late']};

export function answerDtmRecords(question,snapshot,route='',history=[]) {
  const owner=snapshot.profile?.userId;
  const context={question,route,history};
  const dtmSelection=selectAccountEvidence(snapshot,'dtm',context);
  const courses=selectAccountEvidence(snapshot,'dtm',{question:'List all my Moodle courses',route:'',history:[]}).records.courses;
  const previous=previousQuestion(history);
  const selected=dtmSelection.records.courses;
  const ids = new Set(selected.map(course=>course.id));
  const courseMap = new Map(selected.map(course=>[course.id,course]));
  const assignments=selectAccountEvidence(snapshot,'assignments',context).records.filter(item=>ids.has(item.dtmCourseId));
  const meetings = selected.flatMap(course=>(course.meetings || []).map(row=>({...row,course})));
  const materials = selected.flatMap(course=>(course.materials || []).map(row=>({...row,course})));
  const grades = selected.flatMap(course=>(course.grades || []).map(row=>({...row,course})));
  const namedAssignments=assignments.filter(row=>names(question,row.title));
  const namedMaterials=materials.filter(row=>names(question,row.title));
  const namedMeetings=meetings.filter(row=>names(question,row.title));
  let namedGrades=grades.filter(row=>names(question,row.label));
  if(!namedGrades.length&&vagueFollowUp(question)&&previous)namedGrades=grades.filter(row=>names(previous,row.label));
  const assignmentGradeTargets=namedAssignments.length?namedAssignments:!namedGrades.length&&vagueFollowUp(question)?assignments.filter(row=>names(previous,row.title)):[];
  const wantsMaterials=materialWords.test(question)||namedMaterials.length>0;
  const wantsAssignments=assignmentWords.test(question)||namedAssignments.length>0||missedWords.test(question)&&/\b(?:work|assigned)\b|指派|要做/i.test(question);
  const wantsGrades=gradeWords.test(question)||namedGrades.length>0&&!wantsMaterials;
  const wantsMeetings=attendanceWords.test(question)||classWords.test(question)&&scheduleWords.test(question)||namedMeetings.length>0;
  const personal=courses.some(course=>course.sourceMode==='personal');
  const hasPersonalMeetings=courses.some(course=>course.sourceMode==='personal'&&course.meetings?.length);
  const schoolAffairs=/\bschool affairs\b|校務系統/i.test(question);
  if(schoolAffairs&&!dtmWords.test(question))return null;
  const personalTopic=personal&&(wantsAssignments||wantsGrades||wantsMaterials||wantsMeetings&&hasPersonalMeetings);
  const namedTopic=(onDtm(route)||dtmWords.test(question))&&(namedAssignments.length||namedMaterials.length||namedMeetings.length||namedGrades.length);
  if(!isDtmRecordQuestion(question,route,history)&&!personalTopic&&!namedTopic)return null;
  const zh=localized(question),t=(chinese,english)=>zh?chinese:english;
  const selectedPath=selected.length===1?coursePath(selected[0]):'/dtm';
  const prefix=selected.some(course=>course.sourceMode==='sample')
    ? t('以下為 stu.best 範例紀錄。','These are stu.best sample records.')
    : t('以下依您儲存在 stu.best 的 DTM 紀錄。','Based on your saved stu.best DTM records.');
  const result=(body,url,title)=>({answer:prefix+'\n\n'+body,url,title});
  if(noticeWords.test(question)&&(dtmWords.test(question)||onDtm(route)||vagueFollowUp(question)&&dtmWords.test(previous))){
    const notices=ownEvidenceRows(dtmSelection.records.notices,owner),named=notices.filter(row=>names(question,row.title));
    const rows=(named.length?named:notices).slice(0,10).map(row=>'- '+escape(row.title)+': '+escape(row.body));
    return result((rows.length?rows.join('\n'):t('沒有已儲存的 DTM 公告。','No DTM notices are saved.'))+'\n\n'+link(t('開啟 DTM','Open DTM'),'/dtm'),'/dtm',t('DTM 公告','DTM notices'));
  }
  if(!selected.length)return result(
    (courses.length?t('找不到符合的課程。','No saved DTM courses match this request.'):
      t('目前沒有已儲存的課程。請先新增課程，再匯入 Moodle 行事曆或手動輸入紀錄。','You have no saved DTM courses yet. Add a course to enter records or import Moodle calendar deadlines.'))
    +'\n\n'+link(t('開啟儀表板','Open dashboard'),'/dtm/dashboard'),'/dtm/dashboard',t('DTM 儀表板','DTM dashboard'));
  const now=Date.parse(snapshot.checkedAt),today=studyCalendar([],snapshot.checkedAt).day;
  const startTime=row=>Date.parse(row.date+'T'+(row.startsAt||'00:00').slice(0,5)+':00+08:00');
  const isoDates=/YYYY-MM-DD/i.test(question);
  const detail=(value,limit=2400)=>typeof value==='string'&&value.trim()?escape(value.slice(0,limit))+(value.length>limit?t('…（完整內容請開啟紀錄）','… (open the record for the complete text)'):''):null;
  const assignmentLine=(item,withDetails=false)=>{
    const course=courseMap.get(item.dtmCourseId),path=coursePath(course)+'/assignments'+(item.id?'#assignment-'+encodeURIComponent(item.id):'');
    const status=assignmentStatus[item.status]?.[zh?0:1]||escape(item.status);
    const late=item.status==='open'&&item.dueAt&&Date.parse(item.dueAt)<now?t('，逾期',', overdue'):'';
    return '- '+escape(course.code)+' · '+link(item.title,path)+' · '+status+late+' · '+dueLabel(item.dueAt,zh,isoDates)
      +(withDetails?'\n  '+t('說明：','Instructions: ')+(detail(item.details)||t('未記錄作業說明。','No assignment instructions are recorded.')):'');
  };
  const meetingLine=meeting=>'- '+link(meeting.course.code+' · '+meeting.title,coursePath(meeting.course)+'/meetings#meeting-'+encodeURIComponent(meeting.id))
    +' · '+meeting.date+(meeting.startsAt&&!meeting.startsAt.startsWith('00:00')?' '+meeting.startsAt.slice(0,5)+t('（臺灣時間）',' Taipei'):'')
    +' · '+(attendanceStatus[meeting.attendance]?.[zh?0:1]||t('未記錄','unrecorded'))
    +'\n  '+t('筆記：','Notes: ')+(detail(meeting.notes)||t('未記錄課堂筆記。','No meeting notes are recorded.'));
  // Tracker status cannot establish actual uploaded bytes or a graded revision.
  if(wantsAssignments&&/\b(?:upload(?:ed)?|files?|revision|submission receipt)\b|上傳|檔案|版本|收件證明/i.test(question)){
    return result(t('這份紀錄不包含可驗證的上傳檔案或評分版本資料；作業追蹤中的「已記錄繳交」不能證明檔案已送出。',
      'This record snapshot has no verifiable uploaded-file or graded-revision information. A personal tracker marked submitted does not prove a file was uploaded.')
      +'\n\n'+link(t('查看作業','Open assignments'),selected.length===1?selectedPath+'/assignments':'/dtm/assignments'),selectedPath+'/assignments',t('DTM 作業','DTM assignments'));
  }
  if(missedWords.test(question)&&(wantsAssignments||/what.{0,15}missed|缺課|缺席/i.test(question))){
    const explicitDate=dateFrom(question);
    const past=(namedMeetings.length?namedMeetings:meetings).filter(meeting=>(!explicitDate||meeting.date===explicitDate)&&
      (meeting.date<today||meeting.date===today&&startTime(meeting)<=now)).sort((a,b)=>startTime(b)-startTime(a));
    const asksAboutAnAbsence=/\b(?:absent|miss(?:ed)?)\b|缺席|缺課/i.test(question);
    const namesLastMeeting=/\blast (?:meeting|class|lesson|session)\b|上次上課/i.test(question);
    const candidates=asksAboutAnAbsence&&!namesLastMeeting&&!explicitDate&&!namedMeetings.length?past.filter(row=>['absent','excused'].includes(row.attendance)):past;
    const latest=candidates[0],url=selected.length===1?selectedPath+'/meetings':'/dtm/dashboard';
    if(!latest)return result(t('找不到符合的已儲存上課紀錄。請先記錄上課日期，再將作業連結到該堂課。','I found no matching saved class meeting. Record the meeting date and link its assignments to see what you missed.')
      +'\n\n'+link(t('開啟上課紀錄','Open class meetings'),url),url,t('上課紀錄','Class meetings'));
    const sameSlot=candidates.filter(row=>row.date===latest.date&&row.startsAt===latest.startsAt);
    const body=sameSlot.slice(0,4).map(meeting=>{
      const linked=assignments.filter(item=>item.meetingId===meeting.id);
      return meetingLine(meeting)+'\n\n'+(linked.length?linked.slice(0,10).map(item=>assignmentLine(item,true)).join('\n'):
        t('這堂課沒有已連結的作業。','There are no assignments linked to this meeting.'));
    }).join('\n\n');
    return result(body,coursePath(latest.course)+'/meetings',t('上課紀錄','Class meetings'));
  }
  const blocks=[];
  if(wantsAssignments){
    const pending=pendingWords.test(question),overdueOnly=/\boverdue\b|逾期/i.test(question);
    const submittedOnly=!pending&&/\bsubmitted\b|已繳交|已提交/i.test(question);
    const importedOnly=/\b(?:calendar import|import(?:ed)? (?:from|via)|came from.{0,20}calendar)\b|匯入|匯出的行事曆/i.test(question);
    const relativeDays=[...(/\btoday\b|今天/i.test(question)?[0]:[]),...(/\btomorrow\b|明天/i.test(question)?[1]:[])];
    const dueDays=new Set(relativeDays.map(offset=>studyCalendar([],new Date(now+offset*86_400_000).toISOString()).day));
    const explicitDate=dateFrom(question);if(!dueDays.size&&explicitDate)dueDays.add(explicitDate);
    const matches=(namedAssignments.length?namedAssignments:assignments).filter(item=>(!pending||item.status==='open')&&(!submittedOnly||item.status==='submitted')&&
      (!overdueOnly||item.dueAt&&Date.parse(item.dueAt)<now)&&(!importedOnly||item.origin==='moodle_calendar')&&
      (!dueDays.size||item.dueAt&&Number.isFinite(Date.parse(item.dueAt))&&dueDays.has(studyCalendar([],item.dueAt).day)));
    const url=selected.length===1?selectedPath+'/assignments':'/dtm/assignments';
    const withDetails=namedAssignments.length>0||/\b(?:instructions?|details|assigned|what.{0,15}do)\b|說明|要求|內容/i.test(question);
    const summary=matches.length?(pending?t('未完成作業','Unfinished assignments'):t('作業','Assignments'))+' ('+matches.length+')\n\n'+matches.slice(0,12).map(item=>assignmentLine(item,withDetails)).join('\n'):
      pending?t('沒有符合的未完成作業。','No matching unfinished assignments are saved.'):t('沒有符合的已儲存作業。','No matching assignments are saved for these courses.');
    blocks.push({body:summary+'\n\n'+link(t('查看作業','Open assignments'),url),url,title:t('DTM 作業','DTM assignments')});
  }
  if(wantsGrades){
    const url=selected.length===1?selectedPath+'/grades':'/dtm/grades';
    if(assignmentGradeTargets.length&&!namedGrades.length)blocks.push({body:t('這份作業追蹤紀錄沒有可驗證的對應評量或評語；其他課程評量的分數與評語不能當作此作業的結果。','This assignment tracker has no verifiable linked assessment or feedback. Other course assessment scores and feedback do not establish this assignment’s result.')+'\n\n'+link(t('查看成績','Open grade report'),url),url,title:t('DTM 成績','DTM grade report')});
    else if(/\b(?:official|final|weighted|gpa)\b|正式|總成績|加權|平均績點/i.test(question))blocks.push({body:t('目前只有個別評量紀錄，沒有可驗證的正式期末總成績、加權規則或 GPA。','Only individual assessment records are available; no official final grade, weighting rule or GPA is recorded.')+'\n\n'+link(t('查看成績','Open grade report'),url),url,title:t('DTM 成績','DTM grade report')});
    else{
      const requestedLabel=/\b(?:quiz|exam|test|assessment)\s+[a-z0-9]+(?:\s*[-:]\s*[a-z0-9]+)?\b/i.exec(question)?.[0];
      const matchingGrades=namedGrades.length?namedGrades:requestedLabel?grades.filter(row=>normalized(row.label)===normalized(requestedLabel)):grades;
      const rows=matchingGrades.slice(0,12).map(grade=>{
        const scoreValid=typeof grade.score==='number'&&Number.isFinite(grade.score),maximumValid=typeof grade.maximum==='number'&&Number.isFinite(grade.maximum)&&grade.maximum>0;
        const score=scoreValid&&maximumValid?grade.score+'/'+grade.maximum+' ('+((grade.score/grade.maximum)*100).toFixed(1)+'%)':t('未記錄有效分數或滿分','Score or maximum is not recorded');
        return '- '+link(grade.course.code+' · '+grade.label,coursePath(grade.course)+'/grades#grade-'+encodeURIComponent(grade.id))+' · '+score+'\n  '+t('評語：','Feedback: ')+(detail(grade.feedback)||t('未記錄評語。','No feedback is recorded.'));
      });
      blocks.push({body:(rows.length?rows.join('\n'):requestedLabel?t('沒有符合指定評量的成績紀錄。','No recorded grade matches the requested assessment.'):t('這些課程沒有已儲存的成績。','No grades are saved for these courses.'))+'\n\n'+link(t('查看成績','Open grade report'),url),url,title:t('DTM 成績','DTM grade report')});
    }
  }
  if(wantsMaterials){
    const topic=/(?:discuss|cover|mention|about)\s+(.+?)(?:[?!.。？]|$)/i.exec(question)?.[1]||/(?:關於|提到|涵蓋)([^？?。]+)/.exec(question)?.[1];
    const matching=namedMaterials.length?namedMaterials:topic?materials.filter(row=>normalized(row.title+' '+row.summary).includes(normalized(topic))):materials;
    const rows=matching.slice(0,12).map(row=>'- '+link(row.course.code+' · '+row.title,coursePath(row.course))+'\n  '+(detail(row.summary)||t('未記錄教材內容。','No material content is recorded.')));
    blocks.push({body:(rows.length?rows.join('\n'):t('沒有符合的已儲存教材。','No matching materials are saved.'))+'\n\n'+link(t('查看教材','Open materials'),selectedPath),url:selectedPath,title:t('DTM 教材','DTM materials')});
  }
  if(wantsMeetings){
    const next=/\bnext\b.{0,20}\b(?:class|meeting|lesson|session)\b|下堂課|下一節/i.test(question);
    const relativeDay=/\btomorrow\b|明天/i.test(question)?1:/\btoday\b|今天/i.test(question)?0:null;
    const day=relativeDay===null?dateFrom(question):studyCalendar([],new Date(now+relativeDay*86_400_000).toISOString()).day;
    let matching=namedMeetings.length?namedMeetings:meetings;
    if(day)matching=matching.filter(row=>row.date===day);
    if(next)matching=matching.filter(row=>startTime(row)>now).sort((a,b)=>startTime(a)-startTime(b)).slice(0,1);
    else if(missedWords.test(question)&&!namedMeetings.length&&!day)matching=matching.filter(row=>['absent','excused'].includes(row.attendance));
    else matching=[...matching].sort((a,b)=>startTime(a)-startTime(b));
    blocks.push({body:matching.length?matching.slice(0,12).map(meetingLine).join('\n'):t('找不到符合的已儲存上課或出席紀錄。','No matching class meetings or attendance entries are saved.'),url:selected.length===1?selectedPath+'/meetings':'/dtm/dashboard',title:t('上課紀錄','Class meetings')});
  }
  if(blocks.length)return result(blocks.map(block=>block.body).join('\n\n'),blocks[0].url,blocks.map(block=>block.title).join(' · '));
  const rows=selected.slice(0,15).map(course=>'- '+link(course.code+' '+course.title,coursePath(course))+' · '+escape(course.term)
    +(/\brole\b|角色/i.test(question)?' · '+t('角色：','Role: ')+(course.role?escape(course.role):t('未記錄','not recorded')):''));
  return result(rows.join('\n'),selectedPath,t('DTM 課程','DTM courses'));
}

export function answerStudentServiceRecords(question,snapshot,route='',history=[]) {
  const owned=ownEvidenceRows(snapshot.serviceRecords,snapshot.profile?.userId).filter(row=>['leave','internship'].includes(row.serviceKey));
  const named=owned.filter(row=>names(question,row.title));
  const recordIntent=/\b(?:status|history|records?|saved|draft|requests?|filed|progress|review|dates?|when|show|list)\b|狀態|進度|紀錄|記錄|儲存|草稿|申請|審核|日期|何時|顯示|列出/i.test(question);
  const unrelated=/\b(?:dtm|moodle|grades?|transcripts?|scores?|gpa|tuition|fees?|payments?|credits?|assignments?|homework|scholarships?|housing|dormitory|attendance)\b|數位教材|成績|分數|學費|繳費|學分|作業|獎學金|宿舍|出席|缺曠/i.test(question);
  const explicitLeave=/\b(?:leave (?:status|history|records?|draft|requests?)|my leave)\b|我的假單|請假紀錄|請假進度|假單狀態/i.test(question);
  const explicitInternship=/\b(?:my internship|internship (?:status|records?|history))\b|我的實習|實習紀錄/i.test(question);
  const routeKey=/^\/school-affairs\/services\/(leave|internship)(?:\/|[?#]|$)/.exec(route)?.[1];
  if(unrelated||explicitLeave&&explicitInternship)return null;
  if(!explicitLeave&&!explicitInternship&&!(recordIntent&&(named.length||routeKey)))return null;
  const selection=selectServiceRecords({...snapshot,serviceRecords:owned},{question,route,history});
  if(selection.selection.serviceKeys.some(key=>!['leave','internship'].includes(key)))return null;
  const keys=explicitLeave?['leave']:explicitInternship?['internship']:named.length?[...new Set(named.map(row=>row.serviceKey))]:[routeKey];
  // A multipart query should reach the broader read planner instead of silently
  // discarding one of two independently named native service domains.
  if(keys.length!==1)return null;
  const key=keys[0],leave=key==='leave';
  const zh = localized(question);
  const url = leave ? leavePath+'/history' : internshipPath;
  const title = leave ? (zh?'我的假單':'My leave records') : (zh?'我的實習紀錄':'My internship records');
  const states = {draft:['草稿','draft'],filed:['自行標記已向校方送出','marked filed by you'],withdrawn:['已取消追蹤','withdrawn']};
  const reviews = {open:['站內待審','awaiting stu.best review'],in_review:['站內審核中','in stu.best review'],resolved:['站內已處理','stu.best review resolved']};
  const entries=selection.records.filter(row=>row.serviceKey===key);
  const rows = entries.slice(0,10).map(row=>'- '+escape(row.title)+(row.startsOn?' · '+row.startsOn+' → '+row.endsOn:'')
    +' · '+(states[row.status]?.[zh?0:1] || escape(row.status))
    +(reviews[row.reviewStatus]?' · '+reviews[row.reviewStatus][zh?0:1]:''));
  const context = zh?'這些是您的 stu.best 私人追蹤紀錄。':'These are your private tracking records on stu.best.';
  const body = rows.length ? rows.join('\n') : zh?'尚無已儲存的紀錄。':'No records are saved yet.';
  return {answer:context+'\n\n'+body+'\n\n'+link(title,url),url,title};
}

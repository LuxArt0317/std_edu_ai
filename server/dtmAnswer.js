import {studyCalendar} from './affairsSchedule.js';
import {internshipPath, leavePath} from '../src/features/public/affairs/studentServices.js';

const dtmWords = /\b(?:dtm|moodle|digital teaching materials)\b|數位教材|教材網/i;
const assignmentWords = /\b(?:assignments?|homework|coursework|submissions?)\b|作業|功課|繳交/i;
const gradeWords = /\b(?:grades?|scores?|gradebook|marks)\b|成績|分數/i;
const courseWords = /\b(?:subjects?|courses?|academic (?:year|term)|semesters?)\b|科目|課程|學年度|學期/i;
const materialWords = /\b(?:materials?|resources?|slides|lecture notes)\b|教材|講義/i;
const attendanceWords = /\b(?:attendance|absences?|meetings?|sessions?|classes|lessons|next class)\b|出席|缺課|缺席|上課紀錄|下堂課|今天上課/i;
const missedWords = /\b(?:miss(?:ed)?|absent|last (?:meeting|class|lesson|session))\b|缺席|缺課|上次上課/i;
const pendingWords = /\b(?:unfinished|incomplete|outstanding|pending|not (?:yet )?(?:finish(?:ed)?|done|submit(?:ted)?)|still (?:need|left)|overdue)\b|未完成|未繳|尚未交|待繳|逾期/i;
const followUp = /^(?:and\b|how about\b|what about\b|also\b|那|還有)/i;
const onDtm = route => /^\/(?:dtm(?:\/|$)|school-sites\/dtm\.stu\.edu\.tw(?:\/|$))/.test(route);
const recordTopic = q => [assignmentWords, gradeWords, courseWords, materialWords, attendanceWords].some(pattern=>pattern.test(q));
const localized = q => /[\u3400-\u9fff]/.test(q);
const dateFrom = q => /\b(20\d{2}-\d{2}-\d{2})\b/.exec(q)?.[1];
const escape = value => String(value ?? '').replace(/[\r\n]+/g,' ').replace(/[\\<>\x60*_[\]()~#!|]/g,'\\$&');
const link = (title,path) => '[' + escape(title) + '](' + path + ')';
const coursePath = course => '/dtm/course/' + encodeURIComponent(course.id);

function previousQuestion(history) {
  return [...history].reverse().find(row=>row.role==='user')?.content || '';
}

export function isDtmRecordQuestion(question,route='',history=[]) {
  const previous = followUp.test(question) ? previousQuestion(history) : '';
  return (recordTopic(question) && (dtmWords.test(question) || onDtm(route) || dtmWords.test(previous)))
    || (missedWords.test(question) && (assignmentWords.test(question) || /what.{0,15}missed|缺課|缺席/i.test(question)))
    || (assignmentWords.test(question) && pendingWords.test(question));
}

function selectCourses(courses, question, route, previous) {
  const q = question.normalize('NFKC').toLowerCase();
  const named = courses.filter(course=>[course.code,course.title].some(value=>
    typeof value==='string' && value.length>=3 && q.includes(value.normalize('NFKC').toLowerCase())));
  if (named.length) return named;
  const namedTerms = courses.filter(course=>course.term && q.includes(course.term.normalize('NFKC').toLowerCase()));
  if (namedTerms.length) return namedTerms;
  const year = /\b(1[0-9]{2})\b\s*(?:學年|academic year|school year)|(?:academic year|school year)\s*(1[0-9]{2})\b/i.exec(q);
  if (year) return courses.filter(course=>course.term.startsWith((year[1]||year[2])+'學年度'));
  if (!/\b(?:all|every) (?:my )?courses\b|全部課程|所有課程/i.test(question)) {
    const routeId = /\/dtm\/course\/([a-z0-9-]+)/i.exec(route)?.[1];
    const fromRoute = courses.find(course=>course.id===routeId);
    if (fromRoute) return [fromRoute];
    if (followUp.test(question) && previous) {
      const prior = previous.normalize('NFKC').toLowerCase();
      const priorCourses = courses.filter(course=>[course.code,course.title].some(value=>
        typeof value==='string' && value.length>=3 && prior.includes(value.normalize('NFKC').toLowerCase())));
      if (priorCourses.length) return priorCourses;
    }
  }
  const personal = courses.filter(course=>course.sourceMode==='personal');
  return personal.length ? personal : courses;
}

function dueLabel(due, zh) {
  return due ? new Intl.DateTimeFormat(zh?'zh-TW':'en-GB',{
    timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short',
  }).format(new Date(due)) + (zh?'（臺灣時間）':' Taipei') : (zh?'無截止日期':'no deadline');
}
const assignmentStatus = {open:['未完成','open'],submitted:['已記錄繳交','marked submitted'],graded:['已記錄評分','marked graded']};
const attendanceStatus = {unknown:['未記錄','unrecorded'],present:['出席','present'],absent:['缺席','absent'],excused:['請假','excused'],late:['遲到','late']};

export function answerDtmRecords(question,snapshot,route='',history=[]) {
  const courses = snapshot.dtm?.courses || [];
  const personal = courses.some(course=>course.sourceMode==='personal');
  const wantsAssignments = assignmentWords.test(question);
  if (!isDtmRecordQuestion(question,route,history) &&
      !(personal && wantsAssignments && !/\bschool affairs\b|校務系統/i.test(question))) return null;
  const zh = localized(question), t = (chinese, english) => zh ? chinese : english;
  const selected = selectCourses(courses,question,route,previousQuestion(history));
  const ids = new Set(selected.map(course=>course.id));
  const courseMap = new Map(selected.map(course=>[course.id,course]));
  const selectedPath = selected.length===1 ? coursePath(selected[0]) : '/dtm';
  const prefix = selected.some(course=>course.sourceMode==='sample')
    ? t('以下為 stu.best 範例紀錄。','These are stu.best sample records.')
    : t('以下依您儲存在 stu.best 的 DTM 紀錄。','Based on your saved stu.best DTM records.');
  const result = (body,url,title) => ({answer:prefix + '\n\n' + body,url,title});
  if (!selected.length) return result(
    t('目前沒有已儲存的課程。請先新增課程，再匯入 Moodle 行事曆或手動輸入紀錄。','You have no saved DTM courses yet. Add a course to enter records or import Moodle calendar deadlines.')
    + '\n\n' + link(t('開啟儀表板','Open dashboard'),'/dtm/dashboard'),
    '/dtm/dashboard',t('DTM 儀表板','DTM dashboard'),
  );
  const assignments = (snapshot.assignments || []).filter(item=>ids.has(item.dtmCourseId));
  const meetings = selected.flatMap(course=>(course.meetings || []).map(meeting=>({...meeting,course})));
  const now = new Date(snapshot.checkedAt).getTime();
  const startTime = meeting => Date.parse(meeting.date+'T'+(meeting.startsAt||'00:00').slice(0,5)+':00+08:00');
  const line = item => {
    const course = courseMap.get(item.dtmCourseId);
    const path = coursePath(course) + '/assignments' + (item.id ? '#assignment-' + encodeURIComponent(item.id) : '');
    const status = assignmentStatus[item.status]?.[zh?0:1] || escape(item.status);
    const late = item.status==='open' && item.dueAt && Date.parse(item.dueAt)<now ? t('，逾期',', overdue') : '';
    return '- ' + escape(course.code) + ' · ' + link(item.title,path) + ' · ' + status + late + ' · ' + dueLabel(item.dueAt,zh);
  };
  if (missedWords.test(question) && (wantsAssignments || /what.{0,15}missed|缺課|缺席/i.test(question))) {
    const explicitDate = dateFrom(question);
    const today = studyCalendar([],snapshot.checkedAt).day;
    const past = meetings.filter(meeting=>(!explicitDate || meeting.date===explicitDate) &&
      (meeting.date<today || meeting.date===today && startTime(meeting)<=now))
      .sort((a,b)=>(b.date+(b.startsAt||'')).localeCompare(a.date+(a.startsAt||'')));
    const asksAboutAnAbsence = /\b(?:absent|miss(?:ed)?)\b|缺席|缺課/i.test(question);
    const namesLastMeeting = /\blast (?:meeting|class|lesson|session)\b|上次上課/i.test(question);
    const candidates = asksAboutAnAbsence && !namesLastMeeting && !explicitDate
      ? past.filter(meeting=>['absent','excused'].includes(meeting.attendance)) : past;
    const latest = candidates[0];
    const sessionsUrl = selected.length===1 ? selectedPath+'/meetings' : '/dtm/dashboard';
    if (!latest) return result(
      t('找不到符合的已儲存上課紀錄。請先記錄上課日期，再將作業連結到該堂課。','I found no matching saved class meeting. Record the meeting date and link its assignments to see what you missed.')
      + '\n\n' + link(t('開啟上課紀錄','Open class meetings'),sessionsUrl),sessionsUrl,t('上課紀錄','Class meetings'),
    );
    const sameSlot = candidates.filter(meeting=>meeting.date===latest.date && meeting.startsAt===latest.startsAt);
    const body = sameSlot.slice(0,4).map(meeting=>{
      const linked = assignments.filter(item=>item.meetingId===meeting.id);
      const url = coursePath(meeting.course)+'/meetings#meeting-'+encodeURIComponent(meeting.id);
      const heading = link(meeting.course.code+' · '+meeting.title,url) + ' · ' + meeting.date + ' · '
        + (attendanceStatus[meeting.attendance]?.[zh?0:1] || t('未記錄','unrecorded'));
      return heading + '\n\n' + (linked.length ? linked.slice(0,10).map(line).join('\n') :
        t('這堂課沒有已連結的作業。','There are no assignments linked to this meeting.'));
    }).join('\n\n');
    return result(body,coursePath(latest.course)+'/meetings',t('上課紀錄','Class meetings'));
  }
  if (wantsAssignments) {
    const pending = pendingWords.test(question);
    const overdueOnly = /\boverdue\b|逾期/i.test(question);
    const matches = assignments.filter(item=>(!pending || item.status==='open') &&
      (!overdueOnly || item.dueAt && Date.parse(item.dueAt)<now));
    const url = selected.length===1 ? selectedPath+'/assignments' : '/dtm/assignments';
    const summary = matches.length
      ? (pending ? t('未完成作業','Unfinished assignments') : t('作業','Assignments')) + ' (' + matches.length + ')\n\n' + matches.slice(0,12).map(line).join('\n')
      : pending ? t('沒有符合的未完成作業。','No matching unfinished assignments are saved.') : t('沒有已儲存的作業。','No assignments are saved for these courses.');
    return result(summary+'\n\n'+link(t('查看作業','Open assignments'),url),url,t('DTM 作業','DTM assignments'));
  }
  if (gradeWords.test(question)) {
    const rows = selected.flatMap(course=>(course.grades || []).map(grade=>
      '- ' + link(course.code+' · '+grade.label,coursePath(course)+'/grades#grade-'+encodeURIComponent(grade.id)) +
      ' · ' + grade.score + '/' + grade.maximum + ' (' + ((grade.score/grade.maximum)*100).toFixed(1) + '%)'));
    const url = selected.length===1 ? selectedPath+'/grades' : '/dtm/grades';
    return result((rows.length?rows.slice(0,12).join('\n'):t('這些課程沒有已儲存的成績。','No grades are saved for these courses.'))
      +'\n\n'+link(t('查看成績','Open grade report'),url),url,t('DTM 成績','DTM grade report'));
  }
  if (attendanceWords.test(question)) {
    const next = /\bnext (?:class|meeting|lesson)\b|下堂課|下一節/i.test(question);
    const today = /\btoday\b|今天/i.test(question);
    const selectedMeetings = next ? meetings.filter(item=>startTime(item)>now).sort((a,b)=>startTime(a)-startTime(b)).slice(0,1)
      : today ? meetings.filter(item=>item.date===studyCalendar([],snapshot.checkedAt).day) : meetings;
    const rows = selectedMeetings.slice(0,12).map(meeting=>'- '+link(meeting.course.code+' · '+meeting.title,coursePath(meeting.course)+'/meetings#meeting-'+encodeURIComponent(meeting.id))
      +' · '+meeting.date+' · '+(attendanceStatus[meeting.attendance]?.[zh?0:1] || escape(meeting.attendance)));
    return result(rows.length?rows.join('\n'):t('找不到符合的已儲存上課或出席紀錄。','No matching class meetings or attendance entries are saved.'),
      selected.length===1?selectedPath+'/meetings':'/dtm/dashboard',t('上課紀錄','Class meetings'));
  }
  const rows = selected.slice(0,15).map(course=>{
    const materials = materialWords.test(question) && course.materials?.length
      ? ' · ' + course.materials.slice(0,8).map(item=>escape(item.title)).join(', ') : '';
    return '- '+link(course.code+' '+course.title,coursePath(course))+' · '+escape(course.term)+materials;
  });
  return result(rows.join('\n'),selectedPath,t('DTM 課程','DTM courses'));
}

export function answerStudentServiceRecords(question,snapshot) {
  const leave = /\b(?:leave (?:status|history|records?|draft|requests?)|my leave)\b|我的假單|請假紀錄|請假進度|假單狀態/i.test(question);
  const internship = /\b(?:my internship|internship (?:status|records?|history))\b|我的實習|實習紀錄/i.test(question);
  if (!leave && !internship) return null;
  const zh = localized(question);
  const key = leave ? 'leave' : 'internship';
  const url = leave ? leavePath+'/history' : internshipPath;
  const title = leave ? (zh?'我的假單':'My leave records') : (zh?'我的實習紀錄':'My internship records');
  const states = {draft:['草稿','draft'],filed:['自行標記已向校方送出','marked filed by you'],withdrawn:['已取消追蹤','withdrawn']};
  const reviews = {open:['站內待審','awaiting stu.best review'],in_review:['站內審核中','in stu.best review'],resolved:['站內已處理','stu.best review resolved']};
  const entries = (snapshot.serviceRecords || []).filter(row=>row.serviceKey===key);
  const rows = entries.slice(0,10).map(row=>'- '+escape(row.title)+(row.startsOn?' · '+row.startsOn+' → '+row.endsOn:'')
    +' · '+(states[row.status]?.[zh?0:1] || escape(row.status))
    +(reviews[row.reviewStatus]?' · '+reviews[row.reviewStatus][zh?0:1]:''));
  const context = zh?'這些是您的 stu.best 私人追蹤紀錄。':'These are your private tracking records on stu.best.';
  const body = rows.length ? rows.join('\n') : zh?'尚無已儲存的紀錄。':'No records are saved yet.';
  return {answer:context+'\n\n'+body+'\n\n'+link(title,url),url,title};
}

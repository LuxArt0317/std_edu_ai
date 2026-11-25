import {assistantLanguage} from '../src/services/assistantLanguage.js';
import { studentLeaveLookupContext, studentLeaveBasePath } from './studentLeaveEvidenceIntent.js';
import { isOwnFeeBalanceQuestion, ownFeeBalanceLabel } from './pendingFeesAnswer.js';
import { isServiceNoteNextClass } from './serviceNoteIntent.js';
import { dtmNativeClauseScope } from './dtmNativeClauseScope.js';
import { schoolSubjectRecordsPath } from '../src/features/public/affairs/studentServices.js';

const exactGradeOverview=/^(?:(?:please )?(?:show|list|check) my (?:(?:saved|local) )?(?:moodle|dtm) grade overview|(?:請)?(?:顯示|查詢|查看)我的(?:已儲存的)?(?:Moodle|DTM|數位教材網)成績綜覽)[.?!。！？]*$/iu;

const nextClass = value => isServiceNoteNextClass(value) || /^(?:please )?show(?: me)? my next class$/iu.test(value);
const leavePages = ['', '/index', '/history', '/archive', '/periods'].map(path => studentLeaveBasePath + path);

export function studentLeaveAssistantPlan(question, route, history = []) {
  const lookup = studentLeaveLookupContext(question, route, history);
  const independentNext = !lookup.selection && !lookup.excluded && !lookup.navigation
    && leavePages.includes(route?.replace(/^https:\/\/stu\.best|\/$/gu, '')) && nextClass(lookup.otherQuestion);
  if (!lookup.selection && !lookup.excluded && !lookup.navigation && !independentNext) return null;
  const clauses = lookup.otherQuestion.split(/\.\s+/u).filter(Boolean);
  let feeQuestion = '', classQuestion = '', gradeQuestion = '';
  const unknown = [];
  for (const clause of clauses) {
    if (/^(?:(?:please\s+)?(?:do not|don['’]t|never|skip|avoid|exclude)|without|not|excluding|(?:請|请)?不要|排除|不含)\b/iu.test(clause)) continue;
    const label = ownFeeBalanceLabel(clause);
    const tuitionLabel = label && /\b(?:tuition|fees?|charges?)\b|學費|学费|費用|费用/iu.test(label);
    if (!feeQuestion && (isOwnFeeBalanceQuestion(clause) || tuitionLabel)) feeQuestion = clause;
    else if (!classQuestion && nextClass(clause)) classQuestion = clause;
    else if (!gradeQuestion && /\b(?:moodle|dtm)\b|數位教材|数位教材/iu.test(clause)) {
      const grade = dtmNativeClauseScope(clause, '/dtm/grades', []);
      if (grade.recognized && grade.grades) gradeQuestion = grade.grades.question;
      else unknown.push(clause);
    }
    else if (!/^(?:use|format) YYYY-MM-DD for dates[.!]?$/iu.test(clause)) unknown.push(clause);
  }
  const {selection}=lookup;
  const exactLeave = Boolean(selection && !selection.reason && !selection.title
    && !lookup.foreign && !lookup.navigation && !lookup.excluded && !unknown.length);
  const exactLeaveRead = exactLeave && !feeQuestion && !classQuestion;
  const deterministicRead = exactLeaveRead && !gradeQuestion;
  const deterministicCompanion = Boolean(independentNext || (exactLeave && !selection.countOnly && !gradeQuestion
    && Boolean(feeQuestion) !== Boolean(classQuestion)
    && selection.from === 'question' && selection.view === 'history' && !selection.range && selection.fields.join() === 'dates'
    && Object.values(selection.filters).every(filter => !filter.included.length && !filter.excluded.length)));
  const companion = feeQuestion || classQuestion;
  const companionFirst = Boolean(companion && question.normalize('NFKC').trimStart().startsWith(companion));
  const deterministicGradePair=Boolean(exactLeaveRead&&selection.from==='question'&&selection.view==='history'
    &&!selection.countOnly&&selection.range===null&&selection.fields.join()==='dates'
    &&Object.values(selection.filters).every(filter=>!filter.included.length&&!filter.excluded.length)
    &&exactGradeOverview.test(lookup.otherQuestion)&&exactGradeOverview.test(gradeQuestion));
  return {
    ...lookup,
    feeQuestion, feeLabel: feeQuestion ? ownFeeBalanceLabel(feeQuestion) : null,
    classQuestion, gradeQuestion, hasOtherQuestion: unknown.length > 0, deterministicRead, deterministicGradePair,
    deterministicCompanion, companionFirst,
  };
}

export function studentLeaveSelectedTools(plan) {
  return [
    ...(plan.selection&&!plan.selection.reason?['leaveRecords']:[]),
    ...(plan.feeQuestion?['charges']:[]),
    ...(plan.classQuestion?['courses']:[]),
    ...(plan.gradeQuestion?['dtmGradeReport']:[]),
  ];
}

/** Classify only the branch that terminates before any protected reader. */
export function studentLeaveZeroReadDisposition(plan) {
  if (plan.hasOtherQuestion || studentLeaveSelectedTools(plan).length) return null;
  if (plan.navigation) return 'navigation';
  if (plan.excluded) return 'excluded';
  return plan.selection?.reason ?? null;
}

export function studentLeaveBoundary(plan, question) {
  const zh = assistantLanguage(question)==='zh-Hant';
  const say = (en, cn) => zh ? cn : en;
  const messages = [];
  if (plan.formNavigation) {
    messages.push(say(
      'Open School Affairs → Student Affairs → Student Leave form to prepare and save your request on stu.best. A saved draft is not an approved leave. Official submissions require the university’s Student Leave system.',
      '請開啟校務系統的學生請假表單，在 stu.best 填寫並儲存假單。正式請假請使用校方請假系統。'));
  } else if (plan.navigation) {
    messages.push(say(
      'School Affairs keeps saved leave history, older records, and leave periods in separate views.',
      '校務系統提供已儲存的請假紀錄、舊紀錄與請假節次。'));
  } else if (plan.foreign || plan.selection?.reason === 'foreign_request') {
    messages.push(say('I can only check your own saved leave records.', '我只能查詢你自己的請假紀錄。'));
  } else if (plan.excluded) {
    messages.push(say('I skipped the leave records as requested.', '已略過你要求排除的請假紀錄。'));
  } else switch (plan.selection?.reason) {
    case 'unsupported_operation':
      messages.push(say('You can create or edit a saved leave form in School Affairs.', '你可以在校務系統新增或編輯請假表單。'));
      break;
    case 'requires_attendance_source':
      messages.push(say('Leave records alone cannot verify your class attendance.', '僅憑請假紀錄無法確認課堂出席狀況。'));
      break;
    case 'unsupported_field':
      messages.push(say('The requested detail is unavailable in saved leave records.', '已儲存的請假紀錄無法提供此項資料。'));
      break;
    case 'invalid_route':
    case 'ambiguous_selector':
      messages.push(say('Open the saved form or specify the exact record or date range you want to check.', '請開啟已儲存的表單，或指定要查詢的紀錄或日期範圍。'));
      break;
  }
  if (plan.hasOtherQuestion) messages.push(say(
    'The other part needs its own lookup. Ask it separately so I can check the right records.',
    '另一部分需要單獨查詢。請另行提問，以便查核對應的紀錄。'));
  return messages.join('\n\n');
}

export function studentLeaveNavigation(plan, question) {
  if (!plan.navigation) return null;
  const zh = assistantLanguage(question)==='zh-Hant';
  const links = [[studentLeaveBasePath, zh ? '請假表單' : 'Student Leave form']];
  if (!plan.formNavigation) links.push(
    [studentLeaveBasePath+'/history', zh ? '請假紀錄' : 'Leave history'],
    [studentLeaveBasePath+'/archive', zh ? '舊請假紀錄' : 'Archived leave'],
    [studentLeaveBasePath+'/periods', zh ? '請假節次' : 'Leave periods'],
  );
  return {status:'answered',answer:[studentLeaveBoundary(plan,question),...links.map(([url,title])=>'['+title+']('+url+')')].join('\n\n'),
    citations:links.map(([url,title])=>({title,url})),suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

export function studentLeaveGuestAnswer(plan, question) {
  const nav = studentLeaveNavigation(plan, question);
  const zh = assistantLanguage(question)==='zh-Hant';
  const selection = plan.selection;
  const links = [];
  if (selection && !selection.reason) {
    const path = selection.view==='record' ? studentLeaveBasePath+'/edit/'+selection.id : studentLeaveBasePath+'/'+selection.view;
    links.push([path,zh?'登入查看請假紀錄':'Sign in to view your leave records']);
  }
  if (plan.feeQuestion) links.push(['/school-affairs/services/39-1',zh?'登入查看學雜費':'Sign in to check your fee balance']);
  if (plan.classQuestion) links.push([schoolSubjectRecordsPath,zh?'登入查看課表':'Sign in to check your next class']);
  if (plan.gradeQuestion) links.push(['/dtm/grades',zh?'登入查看 Moodle 成績':'Sign in to view your Moodle grades']);
  const signIn = links.map(([path,title])=>({title,url:'/school-affairs/login?next='+encodeURIComponent(path)}));
  return {status:signIn.length||plan.foreign?'handoff':nav?.status??'clarification',
    answer:[nav?.answer??studentLeaveBoundary(plan,question),...signIn.map(({title,url})=>'['+title+']('+url+')')].filter(Boolean).join('\n\n'),
    citations:[...(nav?.citations??[]),...signIn],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

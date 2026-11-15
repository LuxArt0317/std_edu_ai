import {runAnswerVerification} from './answerVerification.js';
import {loadDtmAssignmentList} from './dtmCourseResource.js';
import {dtmAssignmentListSelection} from './dtmAssignmentListIntent.js';

const sourceId='account:dtmAssignmentList';
const localeTime={timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'};
const dateFormatter=new Intl.DateTimeFormat('sv-SE',localeTime);
const trackerLabels={open:['Open','未完成'],submitted:['Marked submitted','已標記繳交'],graded:['Marked graded','已標記評分']};
const titleLiteral=value=>value.replace(/[&<>"'\x60*_[\]()#!~|]/gu,character=>'&#'+character.codePointAt(0)+';');

function assignmentListReply(question,selection,{rows,total,courseScope}){
  const zh=/\p{Script=Han}/u.test(question),t=(en,cn)=>zh?cn:en;
  const listTitle=t('Open saved Moodle assignments','開啟已儲存的 Moodle 作業');
  const citations=[{chunkId:sourceId,title:listTitle,url:selection.path}];
  const lines=[];
  const hasFilters=selection.mode!=='all'||selection.period!==null;
  if(!total)lines.push(t('No matching saved assignments were found in this view.','此頁找不到相符的已儲存作業。'));
  else lines.push(t('Matching saved assignments: ','相符的已儲存作業筆數：')+total+'.');
  if(courseScope==='personal')lines.push(t('This list follows the My assignments view for your personal courses.','此清單依「我的作業」頁顯示個人課程。'));
  if(courseScope==='sample')lines.push(t('This view shows sample courses because this account has no saved personal courses.','此帳戶沒有個人課程，此頁顯示範例課程。'));
  if(hasFilters) {
    const matching={all:['All','全部'],open:['Open','未完成'],done:['Marked submitted or graded','已標記繳交或評分'],
      submitted:['Marked submitted','已標記繳交'],graded:['Marked graded','已標記評分']};
    if(selection.mode!=='all')lines.push(t('Tracker filter: ','追蹤狀態篩選：')+matching[selection.mode][zh?1:0]+'.');
    const dates={today:['Today','今天'],tomorrow:['Tomorrow','明天'],overdue:['Earlier than now','已過截止時間']};
    if(selection.period)lines.push(t('Deadline filter: ','截止時間篩選：')+(dates[selection.period]?.[zh?1:0]??selection.period)+t(' (Taipei time).','（臺北時間）。'));
  }
  const entries=[];
  let remaining=6500;
  for(const row of rows){
    const url='/dtm/course/'+row.courseId+'/assignment/'+row.id;
    const title=titleLiteral(row.title),course=selection.courseId?'':' · '+titleLiteral(row.courseCode);
    const values=['- ['+title+']('+url+')'+course+(row.sourceMode==='sample'?t(' · Sample',' · 範例'):'')];
    if(selection.dates)values.push('  - '+t('Saved deadline: ','已儲存截止時間：')+(row.dueAt
      ?dateFormatter.format(new Date(row.dueAt))+t(' Taipei',' 臺北時間'):t('No saved deadline','沒有已儲存截止時間')));
    if(selection.statuses)values.push('  - '+t('Tracker status: ','追蹤狀態：')+trackerLabels[row.trackerStatus][zh?1:0]);
    const line=values.join('\n');
    remaining-=line.length;
    if(remaining<0)break;
    entries.push(line);
  }
  if(entries.length)lines.push(entries.join('\n'));
  if(!selection.countOnly&&entries.length<total)lines.push(t('Showing '+entries.length+' of '+total+' matching rows.','顯示 '+total+' 筆中的 '+entries.length+' 筆。'));
  if(selection.statuses||selection.mode!=='all')lines.push(t(
    'Tracker status is saved locally. It does not verify committed files, a university submission or a grade report.',
    '追蹤狀態儲存在本站，無法據此驗證已提交檔案、校方繳交或成績報告。'));
  lines.push('['+listTitle+']('+selection.path+')');
  return {status:'answered',answer:lines.join('\n\n'),citations,
    suggestedQuestions:[],grounding:{source:'account',webSearched:false}};
}

/** Deterministic record projection. The verification retry repeats the same
 * selection with the same caller and reference clock. No model is needed. */
export async function answerDtmAssignmentList({account,selection,question,deadline,onProgress},load=loadDtmAssignmentList){
  const expected=dtmAssignmentListSelection(question,selection.path);
  if(!expected||expected.reason||JSON.stringify(selection)!==JSON.stringify(expected))throw new TypeError('Invalid Moodle assignment list selection.');
  const caller=Object.freeze({...account,requestDeadline:Math.min(deadline,account.requestDeadline??Infinity),user:Object.freeze({id:account.user.id})});
  const asOf=Date.now(),attempts=[];
  const read=async attempt=>{
    const kind='account-read:dtmAssignmentList:'+attempt,label='Checked saved Moodle assignments';
    const saved=await load(caller,{...expected,asOf}).catch(()=>null);
    const step={kind,label,status:saved?'complete':'unavailable',
      detail:saved?'Checked the selected saved Moodle assignment records.':'The selected Moodle assignment records could not be loaded.'};
    attempts.push(step);
    try {onProgress?.(step);} catch {/* Stream disconnected. */}
    return saved?[saved]:[];
  };
  const first=await read(1);
  const format=evidence=>assignmentListReply(question,expected,evidence[0]);
  const initial=first.length?format(first):{status:'abstained',answer:'',citations:[],grounding:{source:'account',webSearched:false}};
  const checked=await runAnswerVerification({
    question,initialAnswer:initial,deadline,onProgress,
    loadEvidence:async({attempt})=>attempt===1?first:read(attempt),
    verify:async({candidate,evidence})=>{
      if(!evidence.length)return {ok:false,reason:'evidence_unavailable'};
      const actual=format(evidence);
      return {ok:candidate.answer===actual.answer&&JSON.stringify(candidate.citations)===JSON.stringify(actual.citations)};
    },
    repair:async({evidence})=>evidence.length?format(evidence):initial,
  });
  return {...checked,activity:[...attempts,...(checked.activity||[])]};
}

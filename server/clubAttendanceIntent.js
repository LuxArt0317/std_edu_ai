import {clubPath} from './clubServicesContract.js';
import {clubStudentQuestion} from './clubStudentContract.js';

export const clubAttendancePath=clubPath+'/my-attendance';
export const clubAttendanceRoute=/^\/school-affairs\/services\/40-1\/my-attendance\/?(?:\?[A-Za-z0-9_%=&.+-]{1,80})?$/u;
const pagePattern=/^(?:[1-9]\d{0,2}|1000)$/u;
const event=/\b(?:club|student club)\s+(?:events?|activit(?:y|ies))\b|社團活動/iu;
const attending=/\b(?:attend(?:ed|ance)?|participat(?:ed|ion|ing)|joined)\b|參與|參加|出席|签到|簽到/iu;
const foreign=/\b(?:another|other|different) (?:students?|users?|people|person)\b|\b(?:everyone|all (?:students|members|attendees)|their|his|her)\b|\bwho (?:has |had )?(?:attended|participated)\b|\b(?:student|user|account) (?:id|number|email)\b|他人|其他學生|別人|同學的|所有學生|誰(?:參與|參加|出席)/iu;
const own=/\b(?:my|mine|i|me)\b|我的|我(?:有|參加|參與|出席)/iu;
const named=/[\p{L}\p{N}_]+['’]s\s+(?:saved\s+)?(?:(?:student )?club(?: activity)? |activity )?(?:attendance|participation)|[\p{Script=Han}]{2,10}的(?:社團|活動)(?:出席|參與|參加)/iu;
const routeCue=/\b(?:this page|these (?:entries|records|rows)|page\s+\d|attendance|attended|participation|earlier entries|who attended)\b|這(?:一)?頁|第\s*\d+\s*頁|這些(?:紀錄|記錄)|出席|參與|誰參加/iu;
const academicAttendance=/\b(?:class|course|lecture|moodle|dtm)\b|課堂|課程|上課|缺課/iu;
const nav=/^(?:(?:when and )?where (?:can|do|should) i|how (?:can|do|should) i (?:find|see|check|view)|(?:give|show|send) me (?:the|a) link|如何(?:查看|查詢)|怎麼(?:查看|查詢)|哪裡|在哪|給我.{0,25}連結)/iu;
const action=/\b(?:mark|record|edit|change|update|delete|add|remove|submit|approve|publish|register|check me in)\b.{0,36}\b(?:attendance|participation|attended)\b|\b(?:mark me|log me|check me in)\b|\b(?:and|also|then)\s+(?:please\s+)?(?:change|edit|update|delete|mark|remove|submit)\s+(?:it|that|one|the record)\b|(?:登錄|新增|修改|刪除|補登|更正|簽到|打卡).{0,8}(?:出席|參與|參加|紀錄|記錄)/iu;
const exclude=/^(?:(?:please\s+)?(?:do not|don['’]t|never)\s+(?:show|check|read|list|look up)|skip|exclude|不要|請不要|略過|排除)|\b(?:exclude|skip|without)\s+(?:my )?(?:club |student club )?(?:attendance|participation)\b|(?:不要|排除|略過).{0,12}(?:活動參與|社團出席)/iu;
const separate=/[;；！？。\n]|\.(?:\s|$)|\b(?:and|plus|also|along with|as well as)\b|以及|還有|並且|另外/iu;
const otherTopic=/\b(?:tuition|balance|fees?|grades?|subjects?|timetable|next class|assignments?|homework|memberships?|equipment|foundation|leave|catalog|registrar|wi-?fi|weather)\b|學費|成績|課表|下一堂|科目|作業|社團參與紀錄|器材|成立社團|請假|招生/iu;
const filter=/\b(?:today|yesterday|tomorrow|this (?:week|month|year|semester|term)|last (?:week|month|year|semester|term)|between|since|before|after|only)\b|\b(?:did|have) i (?:attend|participate in) (?!any\b|club events?\b|club activities\b)\S|\b(?:filter|find|search)\b.{0,28}\b(?:named|titled|for)\b|(?<!\d)\d{4}[-/]\d|今天|昨天|明天|這學期|上學期|本學期|上週|本週|只(?:看|列)|(?:民國\s*)?\d{2,4}\s*(?:年|學年)/iu;
const hidden=/\b(?:review notes?|approved|approval|proof|certif(?:y|icate|ied)|hours?|credits?|contact|roster|roles?|names? of attendees)\b|審核|核准|證明|時數|學分|名單|角色|聯絡/iu;
const forNamedPerson=/\bfor\s+(?!(?:me|my own|my records|this|last|next|the|an?|any|each|page|today|yesterday|tomorrow|week|month|school)\b)[\p{L}][\p{L}\d'’_-]*(?:\s+[\p{L}][\p{L}\d'’_-]*){0,2}\s*[.!?]?$/iu;
const eventFilter=/\b(?:for|from|at)\s+(?:the |my )?(?:[\p{L}\d_-]+\s+){0,3}(?:club|event|workshop|activity)\b|["“「『][^"”」』]+["”」』]/iu;
const attendanceTopic=text=>clubStudentQuestion(text)==='my-attendance'||event.test(text)&&attending.test(text)
  ||/社團.{0,8}(?:出席|簽到)|我.{0,8}(?:參與|參加)過?哪些.{0,4}活動/iu.test(text);

export function clubAttendanceSelection(question,route=''){
  if(typeof question!=='string'||!question||question.length>2600)return null;
  const text=question.normalize('NFKC').trim();
  let url;
  try{url=new URL(route||'/','https://stu.best');}catch{return null;}
  const here=url.origin==='https://stu.best'&&url.pathname.replace(/\/$/u,'')===clubAttendancePath;
  const studentIntent=clubStudentQuestion(text);
  const isNamed=named.test(text.replace(/我(?:自己)?的(?=社團|活動)/gu,' '));
  const direct=attendanceTopic(text);
  if(!direct&&!(here&&routeCue.test(text)&&!academicAttendance.test(text)))return null;
  const boundary=(reason,page=1)=>({page,reason,latest:false,countOnly:false,partial:false});
  if(foreign.test(text)||isNamed||/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(text))return boundary('foreign');
  const fromRoute=here?url.searchParams.getAll('page'):[];
  const mentioned=[...new Set([...text.matchAll(/\bpage\s+([+-]?\d+(?:\.\d+)?)\b|第\s*([+-]?\d+(?:\.\d+)?)\s*[頁页]/giu)].map(match=>match[1]??match[2]))];
  if(here&&(url.hash||url.username||url.password||[...url.searchParams.keys()].some(key=>key!=='page'))||fromRoute.length>1||mentioned.length>1
    ||fromRoute.concat(mentioned).some(value=>!pagePattern.test(value))||fromRoute.length&&mentioned.length&&fromRoute[0]!==mentioned[0])return boundary('scope');
  const page=Number(mentioned[0]??fromRoute[0]??'1');
  if(exclude.test(text))return boundary('excluded',page);
  if(nav.test(text))return boundary('navigation',page);
  if(action.test(text))return boundary('action',page);
  if(!here&&!own.test(text)&&studentIntent!=='my-attendance')return boundary('navigation',page);
  const clauses=text.split(separate).map(clause=>clause.trim()).filter(Boolean);
  const companion=clauses.length>1&&clauses.some(clause=>otherTopic.test(clause)&&!attendanceTopic(clause));
  const attendanceText=companion?clauses.find(attendanceTopic)??text:text;
  const latest=/\b(?:latest|most recent|last (?:club event|club activity))\b|最近一筆|最新|最後一次/iu.test(attendanceText);
  if(filter.test(attendanceText)||eventFilter.test(attendanceText)||latest&&page!==1)return boundary('scope',page);
  if(forNamedPerson.test(attendanceText))return boundary('foreign',page);
  return {page,reason:null,latest,countOnly:/\b(?:how many|count|number of)\b|有幾|多少|幾筆|筆數/iu.test(attendanceText),partial:companion||hidden.test(text)};
}

export function clubAttendancePage(page){return clubAttendancePath+(page===1?'':'?page='+page);}

export function clubAttendanceBoundary(selection,question,signedIn){
  const zh=/\p{Script=Han}/u.test(question),say=(en,cn)=>zh?cn:en;
  const neutral={citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
  if(selection.reason==='foreign')return {...neutral,status:'handoff',answer:say('I can only read club activity attendance saved for your own account.','我只能查看你自己帳戶儲存的活動參與紀錄。')};
  if(selection.reason==='excluded')return {...neutral,status:'answered',answer:say('I did not open club activity attendance.','我沒有開啟活動參與紀錄。')};
  const path=clubAttendancePage(selection.page),url=signedIn?path:'/school-affairs/login?next='+encodeURIComponent(path);
  const title=say('Club activity attendance','活動參與紀錄');
  const detail=selection.reason==='scope'?say('Choose one page from 1 to 1,000. This view supports page lookups and the latest record from page 1. Ask without a date or event filter.','請選擇第 1 到 1,000 頁中的一頁。此頁只支援分頁和第一頁的最新紀錄。查詢時請移除日期或活動篩選。')
    :selection.reason==='action'?say('I can read saved attendance. Changes use the club attendance workflow.','我可以查詢已儲存的出席紀錄。若要修改出席資料，請使用社團出席登錄流程。')
      :signedIn?say('Open your saved student attendance page.','開啟你的學生出席紀錄。'):say('Sign in to see attendance saved for your account.','請登入後查看你的出席紀錄。');
  return {...neutral,status:signedIn?(selection.reason==='scope'?'clarification':selection.reason==='action'?'handoff':'answered'):'handoff',answer:detail+'\n\n['+title+']('+url+')',
    citations:[{chunkId:'directory:club-activity-attendance',title,url,claim:detail,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null}]};
}

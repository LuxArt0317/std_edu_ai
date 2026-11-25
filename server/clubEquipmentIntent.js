import {clubPath,clubUuid,mentionsClub} from './clubServicesContract.js';
import {isOwnFeeBalanceQuestion,ownFeeBalanceLabel} from './pendingFeesAnswer.js';

export const clubEquipmentPath=clubPath+'/equipment';
export const clubEquipmentRoute=/^\/school-affairs\/services\/40-1\/equipment(?:\/new)?\/?(?:\?edit=[a-f\d-]{36})?$/iu;
const topic=/\b(?:equipment|borrowed (?:items|gear)|loaned gear)\b|器材|器具|設備借用/iu;
const personal=/\b(?:my|me|i)\b|我|本人/iu;
const followup=/\b(?:status|pickup|return|due|approved|declined|cancelled|these requests|this (?:page|request)|those items)\b|狀態|領取|歸還|核准|駁回|幾筆|這(?:頁|筆)/iu;
const navigation=/^(?:(?:please )?where (?:can|do|should) i (?:see|view|find|check|open)|how (?:can|do) i (?:see|view|find|check)|(?:give|send|show) me (?:the|a) link|哪裡|在哪|如何(?:查看|查詢)|怎麼(?:查看|查詢))/iu;
const excluded=/\b(?:do not|don['’]t|never)\s+(?:check|read|show|look up|list)\b|\b(?:exclude|skip)\b|不要查|不要顯示|排除|略過/iu;
const action=/(?:^|\b(?:please|then|and|also|can you|could you|i want you to)\s+)(?:submit|apply|place|book|reserve|edit|change|update|cancel|delete|approve|decline|mark|return)\b(?!\s*(?:dates?|status|time|deadline)\b)|\b(?:submit|cancel|edit|delete|modify|approve|decline)\s+(?:my|the|this|that|it)\b|(?:幫我|替我|請你|並且)\s*(?:提交|送出|申請|取消|修改|刪除|核准|駁回)|^(?:提交|送出|申請|取消|修改|刪除|核准|駁回)/iu;
const foreign=/\b(?:other students?|another (?:student|user|person)|someone else|(?:his|her|their)\s+(?:club|equipment|borrowing|request)|my (?:friend|classmate|roommate)|student (?:id|number)\s*[#:]?\s*[a-z]*\d+|all (?:students|members|applicants)|review queue|admin(?:istrator)? queue|as (?:a |the )?(?:manager|admin)|(?:owed|requested|borrowed) by (?!me\b)|[\p{L}\d._%+-]+@[\p{L}\d.-]+\.[\p{L}]{2,})\b|其他(?:學生|人|帳戶)|別人|(?:他|她|他們|她們)的|審核清單|全校|所有學生/iu;
const names=/[\p{L}\p{N}_]+['’]s\s+(?:(?:club|saved|borrowing)\s+)*(?:equipment|request)|\b(?:requests?|reservations?)\s+for\s+(?!(?:me|my|this|that|the|an?|now|today|tomorrow|pickup|return|equipment)\b)[\p{L}][\p{L}'’ -]*[.!?]?$|[\p{Script=Han}]{2,10}的(?:社團)?器材借用紀錄/iu;
const unsupported=/\b(?:availability|available|reserve now|inventory|all clubs|phone|mobile|student number|student id|student name|applicant name|collateral|purpose|notes?|reviewer|signature|review reason|fees|fines?|penalt(?:y|ies)|official(?:ly)?)\b|庫存|可借用|電話|手機|學號|姓名|抵押品|借用目的|備註|審核人|退件原因|罰款|校方/iu;
const otherTopic=/\b(?:tuition|balance|payments?|next class|grades?|homework|assignments?|attendance|leave|housing|wi-?fi|venue)\b|學費|餘額|下一堂|成績|作業|出席|請假|住宿|場地/iu;
const unsupportedFilters=/\b(?:between|since|before|after|overdue|upcoming|next (?:return|pickup)|late return|yesterday|tomorrow|today|this (?:week|month|year|term|semester)|last (?:week|month|year|term|semester)|by (?:date|status|club))\b|逾期|下一次|下一筆|昨天|明天|今天|這週|本週|這學期|本月|上學期|下學期|依(?:日期|社團|狀態)|\d{4}-\d{2}-\d{2}/iu;
const requestId=/(?<![\p{L}\p{N}-])[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}(?![\p{L}\p{N}-])/giu;
const equipmentLanguage=question=>/\p{Script=Han}/u.test(question);

function selection(question,route,history){
  const text=question.normalize('NFKC').trim();
  let url;
  try{url=new URL(route||'/','https://stu.best');}catch{return null;}
  const path=url.origin==='https://stu.best'?url.pathname.replace(/\/$/u,''):'';
  const here=path===clubEquipmentPath||path===clubEquipmentPath+'/new';
  if(path==='/school-affairs/services/30-2'||/\b(?:student health|30-2)\b|衛保組|衛生保健|健康中心/iu.test(text))return null;
  const direct=topic.test(text)&&mentionsClub(text);
  const routeCue=here&&(topic.test(text)||!otherTopic.test(text)&&(followup.test(text)
    ||/^(?:show|list|check) (?:my |these )?(?:saved )?(?:requests?|records?)[.!?]?$|^(?:查詢|顯示|列出)(?:我的)?(?:紀錄|記錄|申請)/iu.test(text)));
  const priorUser=history.filter(item=>item.role==='user').at(-1)?.content;
  const prior=!direct&&!topic.test(text)&&!otherTopic.test(text)&&followup.test(text)&&typeof priorUser==='string'&&priorUser.length<=2600&&priorUser!==question?selection(priorUser,route,[]):null;
  if(!direct&&!routeCue&&!prior)return null;

  if(foreign.test(text)||names.test(text.replace(/(?:我自己|我|本人)的(?=社團|器材)/gu,' '))||prior?.reason==='foreign')return {reason:'foreign'};
  if(excluded.test(text))return {reason:'excluded'};
  if(action.test(text))return {reason:'action'};
  if(navigation.test(text))return {reason:'navigation'};
  if(!here&&!personal.test(text)&&!prior)return null;
  if(unsupported.test(text)||/\b(?:where|address|location)\b|\b(?:when|what date) did i return\b|地點|哪裡|實際歸還日期/iu.test(text))return {reason:'detail'};
  if(otherTopic.test(text))return {reason:'mixed'};
  if(unsupportedFilters.test(text)||/\b(?:requests?|borrowing)\s+for\s+(?:the|an?)\s+[^.!?]+[.!?]?$/iu.test(text)||prior?.reason||path===clubPath+'/equipment/review')return {reason:'scope'};

  const ids=[...new Set([...text.matchAll(requestId)].map(match=>match[0].toLowerCase()))];
  const edit=here?url.searchParams.getAll('edit'):[];
  if(here&&(url.hash||[...url.searchParams.keys()].some(key=>key!=='edit')||edit.length>1||edit.length&&path!==clubEquipmentPath+'/new')
    ||edit.some(value=>!clubUuid.test(value))||ids.length>1||ids[0]&&edit[0]&&ids[0]!==edit[0].toLowerCase()
    ||!ids.length&&/\b(?:request (?:id|number)|reservation (?:id|number))\b|申請(?:編號|號碼)/iu.test(text))return {reason:'scope'};
  const id=ids[0]??edit[0]?.toLowerCase()??prior?.id??null;
  const latest=Boolean(!id&&prior?.latest)||/\b(?:latest|most recent|last (?:club |equipment |borrowing )?(?:loan|request|entry))\b|最新|最近一筆/iu.test(text);
  const countOnly=/\b(?:how many|count|number of)\b|有幾筆|總筆數|多少筆/iu.test(text);
  const requested={
    status:/\b(?:status|approv\w*|declin\w*|pending|cancelled|returned)\b|狀態|簽核|核准|審核|駁回|取消|已歸還/iu.test(text),
    pickup:/\b(?:pick[ -]?up|collect(?:ion)? date)\b|領取|取件/iu.test(text),
    return:/\b(?:return|due date|due back|due (?:on|when))\b|歸還|繳回|到期/iu.test(text),
    items:/\b(?:which|what)\s+(?:(?:are )?the )?(?:items|gear|equipment)\b|\b(?:item list|item labels|borrowed items)\b|(?:哪些|什麼)器材|借用細項/iu.test(text),
  };
  const listStatus=/\b(?:show|list|count|how many|which)\b|顯示|列出|幾筆|多少筆|哪些/iu.test(text)
    &&!/\b(?:whether|did|were|are|was|is)\b.{0,40}\b(?:approved|declined|returned|cancelled)\b|是否|有沒有/iu.test(text);
  if(listStatus&&/\b(?:pending|approved|declined|rejected|canceled|cancelled|returned)\s+and\s+(?:pending|approved|declined|rejected|canceled|cancelled|returned)\b|(?:已核准|待審核|未核准|已取消|已歸還)(?:和|及|與)(?:已核准|待審核|未核准|已取消|已歸還)/iu.test(text))return {reason:'scope'};
  const statusPrefixes={submitted:/\b(?:submitted|pending)\s+(?:club |equipment |borrowing )|待審核的/iu,
    approved:/\bapproved\s+(?:club |equipment |borrowing )|已核准的/iu,
    declined:/\b(?:declined|rejected)\s+(?:club |equipment |borrowing )|(?:未核准|已駁回)的/iu,
    cancelled:/\b(?:canceled|cancelled)\s+(?:club |equipment |borrowing )|已取消的/iu,
    returned:/\breturned\s+(?:club |equipment |borrowing )|已歸還的/iu};
  const statuses=listStatus?Object.keys(statusPrefixes).filter(status=>statusPrefixes[status].test(text)):[];
  if(statuses.length>1)return {reason:'scope'};
  return {reason:null,id,latest,countOnly,status:statuses[0]??null,fields:['status','pickup','return','items'].filter(field=>!Object.values(requested).some(Boolean)||requested[field])};
}

export function clubEquipmentPlan(question,route='',history=[]){
  if(typeof question!=='string'||!question||question.length>2600)return null;
  const parts=question.split(/[;；。！？\n]|[.!?](?:\s+|$)|\s+(?:and|also|plus)\s+(?=(?:(?:please|also)\s+)?(?:show|tell|check|what|how|my|the)\b)|以及|並且|還有/iu)
    .map(part=>part.trim().replace(/^(?:also|and)\s+/iu,'')).filter(Boolean);
  const feeIndexes=parts.flatMap((part,index)=>isOwnFeeBalanceQuestion(part)||ownFeeBalanceLabel(part)!==null?[index]:[]);
  if(parts.length===2&&feeIndexes.length===1){
    const feeIndex=feeIndexes[0],equipment=selection(parts[1-feeIndex],route,history);
    if(equipment&&!equipment.reason)return {selection:equipment,feeQuestion:parts[feeIndex],feeFirst:feeIndex===0};
  }
  const equipment=selection(question,route,history);
  return equipment?{selection:equipment,feeQuestion:null,feeFirst:false}:null;
}

export function clubEquipmentBoundary(question,selection,signedIn){
  const zh=equipmentLanguage(question),say=(en,cn)=>zh?cn:en;
  const reason=selection.reason;
  const title=say('Club equipment borrowing','社團器材借用');
  const url=signedIn?clubEquipmentPath:'/school-affairs/login?next='+encodeURIComponent(clubEquipmentPath);
  const message={
    foreign:say('I can check equipment requests saved for your own account.','只能查詢你自己帳戶儲存的社團器材借用紀錄。'),
    excluded:say('I skipped your club equipment requests.','已略過你的社團器材借用紀錄。'),
    action:say('Use the equipment borrowing page to review and confirm changes.','請到器材借用頁面確認並送出變更。'),
    navigation:say('Open the club equipment borrowing page.','開啟社團器材借用頁面。'),
    detail:say('I can check saved request status, pickup and return dates, and item names. For other details, open the borrowing page.','我可以查詢已儲存的狀態、領取及歸還日期與器材名稱。其他資訊請查看借用頁面。'),
    scope:say('Ask for your saved requests, the latest request, or one exact request ID.','請查詢你的借用紀錄、最新一筆，或提供一個確切的申請編號。'),
    mixed:say('Ask about your club equipment requests separately from those other details.','請分開詢問社團器材借用與其他資料。'),
  }[reason]??say('Sign in to check equipment requests saved for your account.','請登入後查詢自己帳戶儲存的器材借用紀錄。');
  const link=reason!=='foreign'&&reason!=='excluded';
  return {status:!signedIn||reason==='foreign'||reason==='action'?'handoff':reason==='navigation'||reason==='excluded'?'answered':'clarification',
    answer:[message,link?'['+title+']('+url+')':''].filter(Boolean).join('\n\n'),
    citations:link?[{chunkId:'directory:club-equipment',title,url}]:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

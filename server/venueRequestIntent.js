import {isOwnFeeBalanceQuestion} from './pendingFeesAnswer.js';
import {venueDate,venuePaths,venuePeriods,moveVenueDate} from '../src/features/public/affairs/venueContract.js';

const requestTopic=/\b(?:(?:venue|room|classroom)\s+(?:booking|reservation|request|application)s?|venue\s+(?:records?|history)|my (?:saved )?venue status|(?:rooms?|venues?|classrooms?)\s+(?:(?:did i |have i |i )?(?:book(?:ed)?|reserve(?:d)?))|(?:booked|reserved)\s+(?:rooms?|venues?|classrooms?)|(?:did i|i have|i) (?:book|booked|reserve|reserved) (?:a |the )?(?:room|venue|classroom))\b|場地(?:借用|預約|申請|審核)|教室(?:借用|預約|申請|審核)/iu;
const roomTopic=/\b(?:venues?|rooms?|classrooms?)\b|場地|教室/iu;
const guidance=/\b(?:rules?|polic(?:y|ies)|requirements?|procedures?)\b|辦法|規定|注意事項|申請須知/iu;
const personal=/\b(?:my|mine|i|our)\b|我的|我(?:有|的|借|申請|預約|送出)/iu;
const followup=/^(?:(?:and|also|what about|how about)\s+)*(?:status\b|(?:was|is) (?:it|that) (?:approved|declined|cancelled)\b|(?:which|what) (?:date|period|room|venue)\b|(?:when|what time) (?:is|was|did)\b|(?:show|list)\b.{0,32}\b(?:requests?|reservations?|bookings?)\b|(?:how many|any pending)\b|(?:那|還有)?(?:狀態|進度|哪天|哪個節次|幾筆|有幾筆|核准了嗎))/iu;
const availability=/\b(?:availability|available|free|occupied|schedule|can i book)\b|空堂|空閒|使用狀況|有空/iu;
const nav=/^(?:where (?:can|do|should) i|how (?:can|do|should) i|(?:give|show) me (?:the|a) link|如何|怎麼|哪裡|在哪|請問哪裡)/iu;
const explicitForeign=/\b(?:another|other|different) (?:student|user|person)|\b(?:student|user|owner|account) (?:id|number|email)\b|\b(?:everyone|all students|all users|their|his|her|your)\b|(?:別人|他人|其他學生|全校|他們|她們|替同學)/iu;
const foreignPossessive=/(?<![\p{L}\p{N}_])(?!(?:my|my own|our|venue|room|classroom|school|university|campus|today|tomorrow|stu\.best)['’]s\b)[\p{L}\p{N}_]+['’]s\s+(?:saved\s+)?(?:venue|room|classroom|booking|reservation|request)|[\p{Script=Han}]{2,12}的(?:場地|教室)(?:借用|預約|申請)/iu;
const action=/^(?:(?:please|can you|could you|would you|help me|幫我|請)\s*)*(?:cancel|submit|approve|reject|decline|edit|update|delete|withdraw|create|make|book|reserve|取消|送出|核准|駁回|修改|刪除|撤回|新增|預約)\b|^(?:(?:幫我|請)\s*)?(?:取消|送出|核准|駁回|修改|刪除|撤回|新增|預約)|(?:[;；。.!?！？]\s*|\b(?:and|also|then)\s+)(?:please\s+)?(?:cancel|submit|approve|reject|decline|edit|update|delete|withdraw|book|reserve)\b|(?:以及|並且|然後|還要)(?:請|幫我)?(?:取消|送出|核准|駁回|修改|刪除|撤回|新增|預約)/iu;
const negative=/^(?:(?:please\s+)?(?:do not|don['’]t|never)\s+(?:show|check|read|list|look up)|skip|exclude|without|不要|請不要|略過|排除)/iu;
const excludedClause=/\b(?:but|and|also)\s+(?:do not|don['’]t|never|exclude|skip|not)\b|\b(?:without|excluding|except)\b|(?:但是|和|以及|並且)?(?:不要|不含|排除)/iu;
const privateDetails=/\b(?:purpose|reason|review notes?|staff notes?|comments?|contact|identity|attachments?|why.{0,35}(?:declin|reject|approv|pending))\b|用途|事由|原因|審核備註|審核意見|備註|聯絡|附件/iu;
const companion=/[;；。!?！？]\s*[^\s]|\.\s+(?:also|what|when|where|why|show|tell|my|check)\b|\b(?:and|also|plus|along with)\s+(?:(?:show|tell me|list|check)\s+)?(?:(?:about|what is)\s+)?(?:(?:my|the)\s+)?(?:tuition|fees?|balance|next class|grades?|courses?|subjects?|class schedule|moodle|leave|wifi|registrar|(?:venue\s+)?availability)\b|(?:以及|和|還有|並且)(?:我的)?(?:學費|下一堂|課表|課程|成績|作業|請假|場地空堂)/iu;
const uuidPattern=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const recordToken=/(?<![A-Za-z0-9-])[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}(?![A-Za-z0-9-])/giu;
const roomCode=/^[A-Z0-9-]{2,10}$/u;
const statusWords={submitted:/\b(?:pending|submitted|awaiting (?:review|approval))\b|待審|已送出/iu,approved:/\bapproved\b|已核准|核准的/iu,
  declined:/\b(?:declined|rejected)\b|未核准|已駁回/iu,cancelled:/\b(?:cancelled|canceled)\b|已取消/iu};
const statuses=Object.keys(statusWords);
const listCue=/\b(?:list|show|which|how many|all|count|any)\b|列出|顯示|查詢|有幾|幾筆|哪些|全部/iu;

function roomFilter(text){
  const encoded=[...new Set([...text.matchAll(/\b[A-Za-z]{1,4}-?\d{2,8}\b/gu)].map(match=>match[0].toUpperCase()))];
  const named=/(?:\b(?:room|venue|classroom)\s+code\s*[:#]?\s*|(?:場地|教室)代碼\s*[:：]?\s*)([A-Za-z0-9-]+)|\bfor\s+(?:(?:room|venue|classroom)\s+)([A-Za-z0-9-]*[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9-]+)\b/iu.exec(text);
  const code=(named?.[1]??named?.[2])?.toUpperCase();
  if(code&&!roomCode.test(code))return false;
  if(code)encoded.push(code);
  const distinct=[...new Set(encoded)];
  return distinct.length>1?false:distinct[0]??null;
}
function dateFilter(text,now){
  const dates=[...new Set(text.match(/(?<![\p{L}\p{N}-])\d{4}-\d{1,2}-\d{1,2}(?![\d-])/gu)??[])];
  const today=/\btoday\b|今天/iu.test(text),tomorrow=/\btomorrow\b|明天/iu.test(text),upcoming=/\b(?:upcoming|future)\b|即將|接下來/iu.test(text);
  const last=/\b(?:past|previous)\b|過去/iu.test(text);
  if(dates.some(date=>!venueDate(date))||dates.length>2||Number(today)+Number(tomorrow)+Number(upcoming)+Number(last)+(dates.length?1:0)>1)return false;
  if(dates.length===2)return dates[0]<=dates[1]&&/\b(?:from|between|through|to)\b|至|到/iu.test(text)?{from:dates[0],through:dates[1]}:false;
  if(dates.length===1){
    if(/\b(?:since|after|before|from|until|through)\b|以前|以後|之前|之後/iu.test(text))return false;
    return {from:dates[0],through:dates[0]};
  }
  if(/\b(?:yesterday|last (?:week|month|term|semester)|(?:this|next) (?:week|month|term|semester)|since|before|after|\d{1,4}[/.]\d+|on \d{1,2}-\d)\b|昨天|上週|上月|本週|下週|學期/iu.test(text))return false;
  if(!today&&!tomorrow&&!upcoming&&!last)return null;
  if(!Number.isFinite(now)||!Number.isFinite(new Date(now).getTime()))return false;
  const taipei=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const start=tomorrow?moveVenueDate(taipei,1):taipei;
  return {from:last?null:start,through:last?moveVenueDate(taipei,-1):upcoming?null:start};
}
function periodFilter(text){
  const periods=[...new Set([...text.matchAll(/\b(?:period|slot)\s*[:#]?\s*([A-Za-z0-9]{1,3})\b|第\s*([A-Za-z0-9]{1,3})\s*節/giu)]
    .map(match=>(match[1]??match[2]).toUpperCase()).filter(value=>!['IS','WAS','DID','FOR','HAS'].includes(value)))];
  if(periods.length>1||periods.some(period=>!venuePeriods.some(([code])=>code===period)))return false;
  return periods[0]??null;
}

export function venueRequestSelection(question,route='',history=[],now=Date.now()){
  if(typeof question!=='string'||!question||question.length>2600)return null;
  const text=question.normalize('NFKC').trim();
  let page;
  try{page=new URL(route||'/','https://stu.best');}catch{return null;}
  const here=page.origin==='https://stu.best'&&page.pathname.replace(/\/$/u,'')===venuePaths.apply;
  const lastUser=Array.isArray(history)?history.slice(-6).reverse().find(row=>row?.role==='user'&&typeof row.content==='string'):null;
  const prior=followup.test(text)&&lastUser?venueRequestSelection(lastUser.content,route,[],now):null;
  const isForeign=explicitForeign.test(text)||foreignPossessive.test(text.replace(/(?:我的|我(?:今天|明天|最近)的|(?:今天|明天|最近|待審|已送出|已核准|未核准|已駁回|已取消|即將|過去|最新|相符)的)(?=場地|教室)/gu,''));
  const direct=requestTopic.test(text)||roomTopic.test(text)&&isForeign&&/\b(?:bookings?|reservation|approval)\b|申請|預約|審核|核准/iu.test(text);
  if(!direct&&!(here&&followup.test(text))&&!prior)return null;
  if(guidance.test(text)&&!personal.test(text)&&!isForeign&&!prior)return null;
  if(availability.test(text)&&!requestTopic.test(text)&&!isForeign&&!action.test(text))return null;
  if(availability.test(text)&&!personal.test(text)&&!isForeign&&!action.test(text)&&!nav.test(text)&&!prior)return null;
  const boundary=reason=>({reason});
  if(isForeign||prior?.reason==='foreign')return boundary('foreign');
  if(here&&(page.search||page.hash||page.username||page.password)
    ||[...page.searchParams.keys()].some(key=>/^(?:user(?:_?id)?|owner(?:_?id)?|token|authorization)$/iu.test(key)))return boundary('scope');
  if(negative.test(text)||excludedClause.test(text))return boundary('excluded');
  if(nav.test(text))return boundary('navigation');
  if(action.test(text))return boundary('action');
  if(privateDetails.test(text))return boundary('detail');
  if(companion.test(text)||availability.test(text))return boundary('mixed');
  if(prior?.reason&&!direct)return boundary('scope');
  const match=/\b(?:request|reservation|booking) (?:id|number|#)\s*[:#]?\s*([a-z0-9-]+)|(?:申請(?:編號|號碼)|預約(?:編號|號碼))\s*[:：#]?\s*([a-z0-9-]+)/iu.exec(text);
  const tokens=[...new Set([...text.matchAll(recordToken)].map(token=>token[0].toLowerCase()))];
  if(tokens.length>1)return boundary('scope');
  const id=(match?.[1]??match?.[2])?.toLowerCase()??tokens[0]??null;
  if(!id&&/\b(?:request|reservation|booking) (?:id|number)\b|申請(?:編號|號碼)|預約(?:編號|號碼)/iu.test(text))return boundary('scope');
  const namedTarget=/\bfor\s+(?!(?:my|me|now|this|that|next|today|tomorrow|room|venue|classroom)\b)[A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,2}(?=[.!?]|$)/iu.test(text);
  if(namedTarget)return boundary('foreign');
  const scopeText=id&&uuidPattern.test(id)?text.replace(recordToken,' '):text;
  const room=roomFilter(scopeText),range=dateFilter(scopeText,now),period=periodFilter(scopeText);
  const checkStatus=/\b(?:(?:show|check|tell me) (?:me )?(?:whether|if)|did .{0,45}(?:get|become))\b|是否|有沒有(?:核准|駁回)/iu.test(text);
  const statusMatches=listCue.test(text)&&!checkStatus?statuses.filter(status=>statusWords[status].test(text)):[];
  if(id&&!uuidPattern.test(id)||room===false||range===false||period===false||statusMatches.length>1)return boundary('scope');
  const sincePrevious=prior&&!prior.reason&&!direct;
  return {reason:null,id:id??(sincePrevious?prior.id:null),room:room??(sincePrevious?prior.room:null),
    range:range??(sincePrevious?prior.range:null),period:period??(sincePrevious?prior.period:null),
    status:statusMatches[0]??(sincePrevious?prior.status:null),latest:/\b(?:latest|most recent|last (?:(?:venue|room|classroom) )?(?:request|reservation|booking))\b|最新|最近一筆/iu.test(text),
    countOnly:/\b(?:how many|count|number of)\b|有幾|幾筆|筆數|多少/iu.test(text),
    submittedAt:/\b(?:when.{0,24}submit|submitted (?:at|on)|submission (?:date|time))\b|送出時間|申請時間/iu.test(text)};
}

/** A pair needs two independently recognizable read-only clauses. The fee
 * words never supply a room, date or another owner to the venue selector. */
export function venueRequestPlan(question,route,history,now=Date.now()){
  const whole=venueRequestSelection(question,route,history,now);
  if(typeof question!=='string'||question.length>2600||whole?.reason&&whole.reason!=='mixed')
    return whole?{selection:whole,feeQuestion:null,feeFirst:false}:null;
  const parts=question.normalize('NFKC').split(/[;；。！？\n]|[.!?](?:\s+|$)|,\s+(?=(?:and|also|show|check|what|how)\b)|\s+(?:and|also|plus)\s+|以及、?|並且|還有/iu)
    .map(part=>part.trim().replace(/^(?:also|and)\s+/iu,'')).filter(Boolean);
  const feeIndexes=parts.map((part,index)=>isOwnFeeBalanceQuestion(part)
    || /^(?:show|check|tell me) (?:the )?(?:school |tuition )?fee balance recorded on my account[.!?]?$/iu.test(part)?index:-1).filter(index=>index!==-1);
  if(parts.length===2&&feeIndexes.length===1){
    const feeIndex=feeIndexes[0],selected=venueRequestSelection(parts[1-feeIndex],route,history,now);
    if(selected&&!selected.reason)return {selection:selected,feeQuestion:parts[feeIndex],feeFirst:feeIndex===0};
  }
  if(whole&&!whole.reason&&parts.length>1
    &&parts.some(part=>/\b(?:fees?|tuition|balance|payments?|grades?|moodle|next class|availability)\b|學費|餘額|課表|成績|作業|可用時段/iu.test(part)))
    return {selection:{reason:'mixed'},feeQuestion:null,feeFirst:false};
  return whole?{selection:whole,feeQuestion:null,feeFirst:false}:null;
}

export const isVenueRequestQuestion=(question,route,history)=>Boolean(venueRequestPlan(question,route,history));

export function venueRequestBoundary(selection,question,signedIn){
  const zh=/\p{Script=Han}/u.test(question),say=(en,cn)=>zh?cn:en;
  const reason=selection.reason;
  const title=signedIn?say('Open my venue requests','開啟我的場地申請'):say('Sign in to see my venue requests','登入後查看我的場地申請');
  const url=signedIn?venuePaths.apply:'/school-affairs/login?next='+encodeURIComponent(venuePaths.apply);
  const messages={
    foreign:say('I can only check venue requests saved under your own account.','只能查詢你自己帳戶的場地申請。'),
    scope:say('Please give one exact venue code, period, request ID or ISO date range.','請提供一個明確的場地代碼、節次、申請編號或日期範圍。'),
    excluded:say('I skipped your venue requests.','已略過你的場地申請。'),
    action:say('Use the venue request page to review and confirm changes. No venue action ran here.','請在場地申請頁面確認變更。此處未執行任何場地操作。'),
    detail:say('I can check saved request status, date and period here. Open your request page for the purpose or review notes.','此處可查詢儲存的申請狀態、日期與節次。用途或審核備註請在申請頁面查看。'),
    mixed:say('Ask about your saved venue request separately from availability or other records.','請分開詢問已儲存的場地申請、可用時段或其他紀錄。'),
  };
  const link=[null,'navigation','action','detail','scope','mixed'].includes(reason)&&(!signedIn||reason!==null);
  const message=messages[reason];
  return {status:reason==='foreign'||!signedIn?'handoff':reason==='navigation'?'answered':'clarification',
    answer:[message,link?'['+title+']('+url+')':''].filter(Boolean).join('\n\n'),
    citations:link?[{chunkId:'directory:venue-requests',title,url}]:[],suggestedQuestions:[],
    grounding:{source:signedIn&&reason!=='navigation'?'account':'directory',webSearched:false}};
}

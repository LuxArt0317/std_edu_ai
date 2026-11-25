import {runAnswerVerification} from './answerVerification.js';
import {chargePaymentCents,chargePaymentHistoryPath} from './chargePaymentContract.js';

export {chargePaymentHistoryPath};
const sourceId='account:paymentHistory';
const localClock=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'numeric',day:'numeric'});
const moneyFormat=new Intl.NumberFormat('en-US');
const monthNames='jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const englishMonthPattern=new RegExp('\\b('+monthNames+')\\.?(?: +(\\d{1,2})(?:st|nd|rd|th)?(?!\\d),?)?(?:(?: +of +| *)(\\d+))?\\b','giu');
const monthIndex=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const chineseMonthIndex=['一','二','三','四','五','六','七','八','九','十','十一','十二'];
const tuition=/\btuition\b|[學学][雜杂]?[費费]/u;
const chargeTopic=/\b(?:tuition|(?:school|student) fees?|my (?:fee|charge) payments?|my (?:payment|fee|charge) (?:history|ledger|transactions?|records?))\b|[學学][雜杂]?[費费]|校務繳費|校务缴费/u;
const historyTopic=/\b(?:payments? (?:history|records?|ledger|transactions?|dates?)|payment history|(?:latest|last|recent|previous|recorded|saved|dated) (?:tuition )?payments?|payments? (?:did|have) (?:i|we) (?:make|made)|payments? (?:to|for) (?:my )?tuition|tuition payments? (?:did|have) i|payments? (?:did i make|i made)|payments? were (?:made|recorded)|did (?:i|we) (?:pay|make)|(?:i|we) (?:paid|have paid)|how much (?:have )?i (?:paid|pay)|when (?:was|were) (?:my|the|i) (?:tuition |school )?(?:payments?|paid)|(?:monthly|past) (?:tuition )?payments?)\b|[繳缴][費费](?:[紀记記][錄录]|明[細细]|[歷历]史|日期|[時时][間间])|[付缴繳]了多少|付過|付过|已[繳缴]|我.{0,10}(?:何[時时]|哪天|[什甚][麼么][時时]候).{0,8}[繳缴][費费]?/u;
const datedOwnPayment=/\b(?:(?:how much|when) did i (?:(?:actually|last) )?pay|(?:what|which) payments? did i make|my (?:last|latest|recent) payment)\b|我.{0,16}(?:繳了多少|缴了多少|最近一筆付款)/u;
const otherPaymentTopic=/\b(?:salary|aid|scholarship|payroll|rent|shopping|groceries)\b|薪資|薪资|獎學金|奖学金|房租/u;
const monthlyFollowup=new RegExp('^(?:(?:and|also|what about|how about|show me|for|in)\\s+)*\\s*(?:today|yesterday|(?:this|last|previous|next) month|(?:上|下|本)(?:個|个)?月|(?:民國|民国)?\\s*\\d{1,4}(?:[-年]\\d{1,2})?[-月日\\d]*|(?:'+monthNames+')\\.?(?: *\\d+)?)[?.!？。]*$','u');
const foreign=/\b(?:another|other) (?:student|person|user)|\b(?:his|her|their|someone else's) (?:\w+ ){0,3}(?:tuition|payments?|fees?)\b|\b(?:student|account) (?:number|id)\b|(?:[他她]人|其他[學生学]|別人|别人|他的|她的|帳號|账号)/iu;
const namedOwner=/\b[\p{L}\p{N}]+['’]s\s+(?:(?:last|latest|recent|previous|saved|dated|school)\s+){0,3}(?:tuition|payment|payments|fees?)\b/iu;
const writeRequest=/^(?:(?:please|could you|can you|would you)\s+)?(?:pay|settle|send|transfer|submit|process|record|reverse|delete|refund|cancel)\b|^(?:請|请)?(?:幫我|帮我|替我|代我)?(?:[繳缴]清|付款|支付|[轉转][帳账]|登記|登记|退款|刪除|删除|撤銷|撤销)/iu;
const tuitionCategories=new Set(['tuition','tuition fee','tuition fees','school tuition','tuition and miscellaneous fees','tuition & miscellaneous fees','學費','学费','學雜費','学杂费']);
const safeLabel=value=>value.replace(/[\p{Cc}\p{Cf}]/gu,' ').trim().slice(0,100)
  .replace(/[&<>"'\x60*_[\]()#!~|/.:]/gu,letter=>'&#'+letter.codePointAt(0)+';');
const exactDate=/^(?:19\d{2}|20\d{2}|2100)-\d{2}-\d{2}$/u;

function isoDay(year,month,day){
  if(year<1900||year>2100||month<1||month>12||day<1||day>31)return null;
  const instant=new Date(Date.UTC(year,month-1,day));
  return instant.getUTCMonth()===month-1&&instant.getUTCDate()===day?instant.toISOString().slice(0,10):null;
}

function monthRange(year,month){
  const from=isoDay(year,month,1);
  return from?{from,through:isoDay(year,month,new Date(Date.UTC(year,month,0)).getUTCDate())}:null;
}

function periodSelection(question,now){
  const parts=Object.fromEntries(localClock.formatToParts(now).map(item=>[item.type,Number(item.value)]));
  const dates=[...question.matchAll(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/gu)];
  const numericMonths=[...question.matchAll(/(?<!\d)(\d{4})-(\d{2})(?![-\d])/gu)];
  const englishMonths=[...question.matchAll(englishMonthPattern)];
  const chineseMonths=[...question.matchAll(/(?:(?:民國|民国)?\s*(\d{2,4})\s*年\s*)?(\d{1,2}|[一二三四五六七八九十]{1,2})\s*月(?:\s*(\d{1,2})\s*[日號号])?/gu)];
  const relativeMonths=[...question.matchAll(/\b(last|previous|this|current|next) month\b|上(?:個|个)?月|本月|[這这](?:個|个)?月|下(?:個|个)?月/gu)];
  const relativeDays=[...question.matchAll(/\b(?:today|yesterday|tomorrow)\b|今天|昨天|明天/gu)];
  const ranges=[];
  if(dates.length){
    const parsed=dates.map(item=>exactDate.test(item[0])&&isoDay(...item[0].split('-').map(Number)));
    if(parsed.some(day=>!day)||dates.length>2)return null;
    if(dates.length===2){
      const between=question.slice(dates[0].index+dates[0][0].length,dates[1].index);
      if(!/^\s*(?:to|through|and|至|到|–|—)\s*$/u.test(between)||parsed[0]>parsed[1])return null;
    }
    ranges.push({from:parsed[0],through:parsed.at(-1)});
  }
  for(const [,year,month] of numericMonths)ranges.push(monthRange(Number(year),Number(month)));
  for(const match of englishMonths){
    const [,month,day,year]=match;
    if(month==='may'&&!year&&!day&&/^\s+(?:i|we|you)\b/u.test(question.slice(match.index+month.length)))continue;
    if(year&&year.length!==4)return null;
    const y=Number(year||parts.year),m=monthIndex.indexOf(month.slice(0,3))+1;
    const selected=day&&isoDay(y,m,Number(day));
    ranges.push(day?(selected?{from:selected,through:selected}:null):monthRange(y,m));
  }
  for(const [,year,month,day] of chineseMonths){
    const y=year?Number(year)+(year.length<4?1911:0):parts.year;
    const m=/^\d/u.test(month)?Number(month):chineseMonthIndex.indexOf(month)+1;
    const selected=day&&isoDay(y,m,Number(day));
    ranges.push(day?(selected?{from:selected,through:selected}:null):monthRange(y,m));
  }
  for(const [word] of relativeMonths){
    const delta=/^(?:last|previous|上)/u.test(word)?-1:/^(?:next|下)/u.test(word)?1:0;
    const month=new Date(Date.UTC(parts.year,parts.month-1+delta,1));
    ranges.push(monthRange(month.getUTCFullYear(),month.getUTCMonth()+1));
  }
  for(const [word] of relativeDays){
    const delta=/^(?:yesterday|昨)/u.test(word)?-1:/^(?:tomorrow|明)/u.test(word)?1:0;
    const from=new Date(Date.UTC(parts.year,parts.month-1,parts.day+delta)).toISOString().slice(0,10);
    ranges.push(exactDate.test(from)?{from,through:from}:null);
  }
  if(/\b(?:(?:last|past|previous|next) \d+ (?:days?|weeks?|months?|years?)|this (?:week|year|semester|term)|last (?:week|year|semester|term)|semester \d)\b|(?:這|这|本|上)(?:週|周|學期|学期)|(?:過去|过去|最近)\d+[個个]?[月天]/u.test(question))return null;
  if(/\b(?:days?|weeks?|months?|years?) ago\b|[月日前]之前/u.test(question)
    ||dates.length<2&&/\b(?:since|before|after|until|through|between|starting)\b|(?:自|從|从).{0,12}(?:起|以後|以后)|以前|之後|之后/u.test(question))return null;
  if(!ranges.length)return /(?<!\d)\d{4}(?!\d)/u.test(question)?null:{};
  return ranges.every(range=>range&&range.from===ranges[0]?.from&&range.through===ranges[0]?.through)?ranges[0]:null;
}

export function selectChargePaymentHistory(question,route='',history=[],now=Date.now()){
  if(typeof question!=='string'||!Array.isArray(history)||!Number.isFinite(now)||!Number.isFinite(new Date(now).getTime()))return null;
  const q=question.normalize('NFKC').trim().toLowerCase();
  const pathname=typeof route==='string'?route.split(/[?#]/u,1)[0]:'';
  const privateRoute=pathname===chargePaymentHistoryPath||pathname==='/school-affairs/services/39-1';
  const ownedPayment=datedOwnPayment.test(q),topic=tuition.test(q)||!otherPaymentTopic.test(q)&&(chargeTopic.test(q)||privateRoute||ownedPayment);
  const followup=monthlyFollowup.test(q);
  const prior=followup&&history.findLast(item=>item?.role==='user')?.content;
  const antecedent=typeof prior==='string'?prior.normalize('NFKC').toLowerCase():'';
  const ledgerOperation=writeRequest.test(q)&&(/\b(?:record|reverse|delete|refund|cancel)\b.{0,80}\bpayments?\b/u.test(q)
    ||/(?:登記|登记|退款|刪除|删除|撤銷|撤销).{0,18}(?:繳費|缴费|付款)/u.test(q));
  const priorPayment=chargeTopic.test(antecedent)&&historyTopic.test(antecedent)||datedOwnPayment.test(antecedent)&&!otherPaymentTopic.test(antecedent);
  if(!(topic&&(ownedPayment||historyTopic.test(q)||ledgerOperation))
    &&!(followup&&priorPayment&&!foreign.test(antecedent)&&!namedOwner.test(antecedent)&&!writeRequest.test(antecedent)))return null;
  const zh=/\p{Script=Han}/u.test(q);
  const namedTarget=/payment (?:history|records|ledger) (?:for|of) ([\p{Lu}][\p{L}'’-]+)\b/u.exec(question)?.[1];
  if(namedTarget&&!monthIndex.includes(namedTarget.toLowerCase().slice(0,3))||foreign.test(q)||namedOwner.test(q.replace(/\b(?:what|when|where|who|that|it)['’]s\b/gu,'')))return {reason:'foreign',zh};
  if(writeRequest.test(q))return {reason:'write',zh};
  const filter=periodSelection(q,now);
  if(!filter)return {reason:'period',zh};
  return {reason:null,zh,filter,onlyTuition:tuition.test(q)||followup&&tuition.test(antecedent),
    monthly:/\bmonthly\b|按月|每月/u.test(q),latest:/\b(?:latest|last|most recent) (?:tuition )?payment\b|最後一筆|最后一笔|最近一筆|最近一笔/u.test(q),
    alsoBalance:/\b(?:owe|remaining balance|still unpaid)\b|還欠|还欠|待繳餘額|待缴余额/u.test(q)};
}

function linkFor(filter={}){
  const query=new URLSearchParams(filter).toString();
  return chargePaymentHistoryPath+(query?'?'+query:'');
}

export function chargePaymentHistoryBoundary(selection){
  const t=(en,zh)=>selection.zh?zh:en;
  const reason=selection.reason;
  return {status:reason==='period'?'clarification':'handoff',citations:[],suggestedQuestions:[],
    grounding:{source:'account',webSearched:false},
    answer:reason==='foreign'?t('I can only show payment entries saved under your own sign-in.','我只能顯示目前登入帳戶的繳費紀錄。')
      :reason==='write'?t('I can look up saved entries. Recording, reversing, or sending a payment is unavailable here.','我可以查詢已儲存的紀錄。此處無法登記、撤銷或支付款項。')
      :t('Which month or date should I check? Try 2026-11, 2026-11-05, or an inclusive range such as 2026-11-01 to 2026-11-15.',
        '要查詢哪一個月或日期？例如 2026-11、2026-11-05，或 2026-11-01 至 2026-11-15。')};
}

const cents=amount=>BigInt(chargePaymentCents(amount));
function money(value){
  const magnitude=value<0n?-value:value;
  return (value<0n?'-':'')+'TWD '+moneyFormat.format(magnitude/100n)+'.'+String(magnitude%100n).padStart(2,'0');
}

function paymentHistoryAnswer(selection,record){
  const {filter,zh,onlyTuition,monthly,latest,alsoBalance}=selection,t=(en,cn)=>zh?cn:en;
  const title=t('Saved payment history','已儲存的繳費紀錄'),url=linkFor(filter);
  const period=filter.from===filter.through?filter.from:[filter.from,filter.through].filter(Boolean).join(t(' to ',' 至 '));
  const scope=period?t(' for '+period,'（'+period+'）'):'';
  const partial=record.rows.length<record.total;
  const tagged=row=>typeof row.chargeCategory==='string'&&tuitionCategories.has(row.chargeCategory.normalize('NFKC').trim().toLowerCase());
  const selected=onlyTuition?record.rows.filter(tagged):record.rows;
  const uncategorized=onlyTuition?record.rows.filter(row=>!row.chargeCategory?.trim()):[];
  const mainRows=latest?selected.filter(row=>row.entryKind==='payment').slice(0,1):selected;
  const lines=[];
  if(!record.studentRecordFound)lines.push(t('This sign-in has no linked student record for payment history.','目前登入帳戶沒有可供查詢繳費紀錄的學生資料。'));
  else if(latest&&mainRows.length){
    const [payment]=mainRows;
    lines.push(t('Latest recorded payment'+scope+': '+payment.paidOn+' · '+safeLabel(payment.chargeLabel)+' · '+money(cents(payment.amount))+'.',
      '最近一筆已記錄的繳費'+scope+'：'+payment.paidOn+' · '+safeLabel(payment.chargeLabel)+' · '+money(cents(payment.amount))+'。'));
    if(selected.some(row=>row.reversesPaymentId===payment.id))lines.push(t('A reversal is also saved for this entry in the selected dates.','選定日期內也有這筆繳費的撤銷紀錄。'));
  }else if(!mainRows.length){
    if(partial)lines.push(t('No '+(onlyTuition?'tuition-tagged ':'')+'payment '+(latest?'event':'entry')+' appears on the page read'+scope+'. More entries may be available.',
      '已讀取頁面'+scope+'沒有'+(onlyTuition?'標記為學費的':'')+'繳費資料；其餘頁面可能還有紀錄。'));
    else lines.push(t('No dated '+(onlyTuition?'tuition-tagged ':'')+'payment '+(latest?'event was':'entries were')+' found'+scope+'.',
      '未找到'+scope+(onlyTuition?'標記為學費的':'')+'有日期繳費紀錄。'));
  }else lines.push(t('Saved '+(onlyTuition?'tuition-tagged ':'')+'payment history'+scope+':','已儲存的'+(onlyTuition?'學費分類':'')+'繳費紀錄'+scope+'：'));
  if(onlyTuition&&record.studentRecordFound)lines.push(t('Tuition totals use entries whose saved charge category is tuition.','學費合計僅使用費用分類為學費的紀錄。'));

  const actionLabel=row=>row.entryKind==='reversal'?t('Reversal','撤銷'):t('Payment','繳費');
  const renderedRows=rows=>rows.map(row=>'- '+row.paidOn+' · '+safeLabel(row.chargeLabel)+' · '+actionLabel(row)+' · '+money(cents(row.amount))).join('\n');
  if(!latest&&mainRows.length)lines.push(renderedRows(mainRows));
  if(uncategorized.length)lines.push(t('Uncategorized entries shown separately:','未分類的繳費紀錄另列：')+'\n'+renderedRows(uncategorized));
  if(!partial&&!latest&&selected.length){
    const buckets=new Map();
    for(const row of selected){
      const key=monthly?row.paidOn.slice(0,7):'';
      const sum=buckets.get(key)??{payments:0n,reversals:0n};
      sum[row.entryKind==='payment'?'payments':'reversals']+=cents(row.amount);
      buckets.set(key,sum);
    }
    for(const [key,sum] of buckets){
      lines.push((key?key+' · ':'')+t('Recorded payments: ','已記錄繳費：')+money(sum.payments)+
        (sum.reversals? t(' · Reversals: ',' · 撤銷：')+money(sum.reversals)+t(' · Net recorded change: ',' · 紀錄淨變動：')+money(sum.payments-sum.reversals):''));
    }
  }
  if(partial)lines.push(t('Only '+record.rows.length+' of '+record.total+' dated entries in the selected scope were read. Complete totals are unavailable.',
    '選定範圍共 '+record.total+' 筆有日期的紀錄，已讀取 '+record.rows.length+' 筆，無法提供完整合計。'));
  if(record.hasUndatedPaidAmount)lines.push(t('Some saved paid amounts have no payment date. These date-based results exclude them.','部分已儲存的已繳金額沒有繳費日期，因此不計入這些日期結果。'));
  if(alsoBalance)lines.push(t('See [current fee balance](/school-affairs/services/39-1) for amounts still due.','未繳金額可至[目前待繳費用](/school-affairs/services/39-1)查看。'));
  lines.push('['+title+']('+url+')');

  return {status:'answered',answer:lines.join('\n\n'),citations:[{chunkId:sourceId,title,url}],
    grounding:{source:'account',webSearched:false},suggestedQuestions:[]};
}

export async function answerChargePaymentHistory({account,selection,question,deadline,onProgress},load){
  const attempts=[];
  const read=async attempt=>{
    let value;
    try{value=await load({...account,requestDeadline:Math.min(deadline,account.requestDeadline??Infinity)},selection.filter);}
    catch{/* The graph owns the evidence retry. */}
    const step={kind:'account-read:paymentHistory:'+attempt,
      label:selection.zh?'查詢繳費明細':'Checked saved payment history',status:value?'complete':'unavailable',
      detail:value?(selection.zh?'已核對所選付款紀錄。':'Read the selected payment entries.')
        :(selection.zh?'無法讀取繳費明細。':'The selected payment entries could not be read.')};
    attempts.push(step);
    try{onProgress?.(step);}catch{/* Stream disconnected. */}
    return value?[value]:[];
  };
  const first=await read(1);
  const format=rows=>paymentHistoryAnswer(selection,rows[0]);
  const initial=first.length?format(first):{status:'abstained',answer:'',citations:[],grounding:{source:'account',webSearched:false}};
  const checked=await runAnswerVerification({question,initialAnswer:initial,deadline,onProgress,
    loadEvidence:async({attempt})=>attempt===1?first:read(attempt),
    repair:async({evidence})=>evidence.length?format(evidence):initial,
    verify:async({candidate,evidence})=>{
      if(!evidence.length)return {ok:false,reason:'evidence_unavailable'};
      const expected=format(evidence);
      return {ok:expected.answer===candidate.answer&&JSON.stringify(expected.citations)===JSON.stringify(candidate.citations)};
    },
  });
  const answer=checked.verification?.status==='verified'?checked.answer:selection.zh
    ?'目前無法讀取並核對已儲存的繳費明細。請稍後重試。'
    :'I couldn’t read and verify your saved payment history. Please try again in a moment.';
  return {...checked,answer,activity:[...attempts,...(checked.activity||[])]};
}

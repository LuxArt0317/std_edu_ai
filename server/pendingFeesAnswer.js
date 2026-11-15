import {asksAboutOfficialRecords} from './accountAnswerLanguage.js';

const feesPath='/school-affairs/services/39-1';
const feeTopic=/\b(?:tuition|fees?|charges?|balance|payments?|unpaid|arrears)\b|學費|費用|繳費|待繳|欠費/i;
const followup=/\b(?:where|contact|extension|unit|how much|amount|when|date|deadline|due)\b|哪|誰|聯絡|連絡|分機|單位|金額|多少|日期|期限/i;
const anotherTopic=/\b(?:courses?|subjects?|class(?:es)?|schedules?|timetables?|assignments?|grades?|scholarships?|housing|dormitory|leave|attendance)\b|課程|科目|課表|作業|成績|獎學金|宿舍申請|住宿申請|請假|出席/i;
const cents=value=>Math.round(Number(value)*100);
const balance=row=>Math.max(0,cents(row.amountDue)-cents(row.amountPaid));

const directTuitionPayment=/^(?:(?:please|(?:can|could|would) you(?: please)?) )?(?:(?:pay|settle) (?:(?:my|the) )?(?:(?:remaining|outstanding|unpaid|pending|current) )?(?:tuition(?: (?:fees?|bill|balance|charges?))?|(?:school|student) fees?)|(?:make|submit|process) (?:(?:a|my|the) )?(?:tuition|school fees?) payment)(?: (?:for me|on my behalf))?(?: (?:right )?now| today| please)?$/iu;
const directTuitionPaymentZh=/^(?:請|请)?(?:幫我|帮我|替我|代我|為我|为我)?(?:現在|现在|立即|馬上|马上)?(?:繳清|繳交|繳納|繳付|缴清|缴交|缴纳|缴付|支付|付清)(?:我的)?(?:剩餘|剩余|未繳|未缴|待繳|待缴|本學期的|本学期的)?(?:學費|學雜費|学费|学杂费)(?:吧|謝謝|谢谢)?$/u;

/** A payment command has no registered action. Answer it without opening
 * private records. Anchors leave read, navigation and mixed turns alone. */
export function answerDirectTuitionPayment(question) {
  if(typeof question!=='string')return null;
  const text=question.normalize('NFKC').trim().replace(/[?.!。！？]+$/u,'').trim();
  const zh=directTuitionPaymentZh.test(text.replace(/[\t ]+/gu,''));
  if(!zh&&!directTuitionPayment.test(text.replace(/[\t ]+/gu,' ')))return null;
  return {status:'handoff',
    answer:zh?`我無法代你繳交學費。你可以到[學雜費待繳查詢](${feesPath})查看待繳費用。`
      :`I can’t pay tuition on your behalf. You can review pending charges in [Tuition balance](${feesPath}).`,
    citations:[],suggestedQuestions:[],grounding:{source:'account',webSearched:false},
  };
}

/** Local account data only. Never infer a due date, payment confirmation, or bank details. */
export function isPendingFeeQuestion(question,route='',history=[]) {
  // "Balance my class schedule" is not a monetary balance inquiry.
  if(/\bbalance\b/i.test(question) && anotherTopic.test(question) && !feeTopic.test(question.replace(/\bbalance\b/gi,'')))return false;
  return feeTopic.test(question)||(followup.test(question)&&!anotherTopic.test(question)&&(route===feesPath||feeTopic.test(history.filter(item=>item.role==='user').at(-1)?.content||'')));
}
// An exact read-only balance question can bypass the broad workspace load.
// Other clauses, public procedures and account actions stay with the planner.
export function isOwnFeeBalanceQuestion(question) {
  if(typeof question!=='string')return false;
  const text=question.normalize('NFKC').trim().replace(/[?.!。！？]+$/u,'').trim();
  return /^how much(?: (?:school |tuition )?fees?| tuition)? do i (?:still )?owe(?: (?:at|in|for) (?:the )?(?:school|tuition))?$/iu.test(text)
    ||/^how much tuition and fees (?:remain(?:s)? unpaid|do i (?:still )?owe)$/iu.test(text)
    || /^(?:(?:(?:please )?(?:show(?: me)?|list|tell me|check)|what is|what's|how much is) )?my (?:(?:remaining|outstanding|unpaid|pending) )?(?:(?:school|tuition) )?(?:fees?|charges|balance)(?: (?:at|in|for) (?:the )?school)?$/iu.test(text)
    ||/^(?:請問|請查詢|幫我查|顯示)?(?:我(?:的|目前)?)(?:學雜費|學費|費用|待繳)(?:還(?:要繳|有|欠)|尚欠|剩餘|待繳|餘額|還剩)?(?:多少|金額|明細)?$/u.test(text);
}

/** Resolve only an explicit follow-up to the immediately preceding user topic. */
export function savedFeeBalanceFollowup(question,history=[]){
  if(typeof question!=='string'||!Array.isArray(history))return null;
  const latest=history.findLast(item=>item?.role==='user')?.content;
  if(!isOwnFeeBalanceQuestion(latest))return null;
  const text=question.normalize('NFKC').trim().replace(/[?.!。！？]+$/u,'');
  if(/^how much (?:is (?:still )?due|do i still owe|is left|remains unpaid)$/iu.test(text))return 'How much is my remaining balance in school?';
  if(/^(?:還要繳多少|還欠多少|剩多少|还有多少未缴|還有多少未繳)$/u.test(text))return '我的學費還要繳多少';
  return null;
}

/** Restrict a named balance to one literal saved charge label. */
export function ownFeeBalanceLabel(question) {
  if(typeof question!=='string')return null;
  const match=/^(?:what remains unpaid for|(?:(?:what is|show(?: me)?) )?(?:my|the) (?:unpaid|remaining|outstanding) balance (?:of|for)|how much is unpaid for) (.{3,162}?)\s*[?!.]?$/iu.exec(question.normalize('NFKC').trim());
  if(!match)return null;
  const quoted=/^(?:"([^"]+)"|“([^”]+)”)$/u.exec(match[1].trim());
  const label=(quoted?(quoted[1]??quoted[2]):match[1]).trim();
  if(label.length<3||label.length>160||!/[\p{L}\p{N}]/u.test(label))return null;
  return (quoted?!/[\p{Cc}\p{Zl}\p{Zp}“”\x22]/u.test(label):/^[\p{L}\p{N}][\p{L}\p{N} -]*$/u.test(label))?label:null;
}

// Do not interpret a second clause as part of an unquoted charge label.
export function standaloneFeeBalanceLabel(question){
  const label=ownFeeBalanceLabel(question);
  return label&&(/["”]\s*[?!.]?\s*$/u.test(question.normalize('NFKC'))||!/\b(?:and|or|also|then|but)\b/iu.test(label))?label:null;
}

export function answerPendingFees(question,snapshot,route='',history=[]) {
  const exactFeeBalance=isOwnFeeBalanceQuestion(question);
  if(!exactFeeBalance&&!isPendingFeeQuestion(question,route,history))return null;
  const contextual=!exactFeeBalance&&!feeTopic.test(question);
  const chinese=/[\u3400-\u9fff]/.test(question);
  const authority=asksAboutOfficialRecords(question)
    ? (chinese?'此處可以查詢已儲存的費用金額，校方正式餘額需另行確認。':'I can show the saved fee amounts here. The official balance requires separate verification.')+'\n\n'
    : '';
  if(snapshot.chargeReadUnavailable)return {
    answer:chinese?'無法讀取已儲存的費用紀錄，因此無法確認餘額。':'I couldn’t read your saved fee records, so I can’t confirm your balance.',
    title:chinese?'我的待繳費用':'My pending payments',url:feesPath,
  };
  if(snapshot.studentRecordFound===false)return {
    answer:chinese?'此帳戶尚未連結站內學生紀錄，因此無法查詢待繳金額。請開啟待繳費用頁面確認。':
      'This account has no linked stu.best student record, so I can’t verify a remaining balance. Open My Pending Payments to check.',
    title:chinese?'我的待繳費用':'My pending payments',url:feesPath,
  };
  const missing=chinese?'未記錄':'not recorded';
  const pending=/\b(?:unpaid|pending|outstanding|arrears|remaining|owe)\b|待繳|未繳|欠費|餘額/i.test(question)||contextual;
  const rows=(snapshot.charges||[]).filter(row=>Number.isFinite(Number(row.amountDue))&&Number.isFinite(Number(row.amountPaid)));
  const selected=pending?rows.filter(row=>balance(row)>0):rows;
  const sums=new Map();
  for(const row of selected){const currency=row.currency||'TWD';sums.set(currency,(sums.get(currency)||0)+balance(row));}
  const money=(value,currency='TWD')=>`${currency==='TWD'?'NT$':currency+' '}${(value/100).toLocaleString(chinese?'zh-TW':'en-US',{maximumFractionDigits:2})}`;
  const contact=/contact|extension|where|unit|pay|聯絡|連絡|分機|哪|單位|繳/i.test(question);
  const date=/date|when|deadline|due|日期|何時|期限|哪天/i.test(question);
  const lines=selected.slice(0,20).map(row=>{
    const amount=money(balance(row),row.currency);
    const sample=['sample','local_demo'].includes(row.sourceMode)?(chinese?'（範例）':' (sample)'):'';
    const parts=[chinese?`${row.label}：待繳 ${amount}${sample}（應繳 ${money(cents(row.amountDue),row.currency)}；已繳 ${money(cents(row.amountPaid),row.currency)}）`:
      `${row.label}\n  Remaining balance ${amount}${sample}\n  Saved amount due ${money(cents(row.amountDue),row.currency)}\n  Saved amount paid ${money(cents(row.amountPaid),row.currency)}`];
    if(contact)parts.push(chinese?`連絡單位 ${row.contactUnit||missing}；分機 ${row.contactExtension||missing}；繳費單位 ${row.paymentUnit||missing}`:
      `contact unit ${row.contactUnit||missing}; extension ${row.contactExtension||missing}; payment unit ${row.paymentUnit||missing}`);
    if(date)parts.push(chinese?`發生日期 ${row.occurrenceOn||missing}；繳費期限 ${row.dueOn||missing}`:
      `occurrence date ${row.occurrenceOn||missing}; due date ${row.dueOn||missing}`);
    return parts.join(' · ');
  });
  const prefix=chinese?'stu.best 已儲存的費用紀錄：':'Your saved stu.best fee records:';
  const empty=chinese?(pending?'已儲存的紀錄中目前沒有待繳項目。':'尚無費用紀錄。'):(pending?'No pending payments appear in your saved fee records.':'No fee records are saved.');
  const total=chinese?'待繳合計：':'Total remaining: ';
  const more=selected.length>20?(chinese?`\n顯示前 20 / ${selected.length} 筆；合計包含全部項目。完整紀錄見下方連結。`:`\nShowing 20 of ${selected.length} records; totals include every item. Open the linked page for the full list.`):'';
  return {answer:authority+prefix+'\n'+(lines.length?lines.join('\n')+'\n'+total+[...sums].map(([currency,amount])=>money(amount,currency)).join('; '):empty)+more,
    title:chinese?'我的待繳費用':'My pending payments',url:feesPath};
}

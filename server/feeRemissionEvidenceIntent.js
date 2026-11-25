// Browser-safe intent only. No identity, credentials or database access.
const topic=/\b(?:(?:tuition|school|education|educational)[ -]+(?:fee[ -]+)?(?:remission|reduction|waiver|exemption)|fee[ -]+(?:remission|reduction|waiver|exemption))\b|學雜費(?:優待)?減免|学杂费(?:优待)?减免|學費(?:優待)?減免|学费(?:优待)?减免|就學費用減免/iu;
const other=/\b(?:grades?|gpa|assignments?|courses?|classes|housing|dormitory|student loan|salary|payroll|wifi|wi-fi)\b|成績|成绩|作業|作业|課程|课程|宿舍|住宿|學貸|就學貸款|薪資|薪资/iu;
const text=value=>typeof value==='string'&&value.length<=12000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))?value.normalize('NFKC').trim():'';
const negative=/^(?:(?:please\s+)?(?:do not|don['’]t|never)\s+(?:show|list|read|check|include)|not(?!\s+only)\b|without\b|exclude\b|excluding\b|except\b|(?:請|请)?不要(?:顯示|显示|列出|查詢|查询|包含)|排除|不含)/iu;
const clauses=value=>value.split(/[;；。!?！？\n,，]|\.(?:\s+|$)|\s+(?:also|but|and then)\s+|\s+and\s+(?=(?:do not|don['’]t|never|exclude|excluding|without|not(?!\s+only))\b)|\s+(?=(?:not(?!\s+only)|without|excluding|except)\b)|但是|還有|还有|(?:並且|并且|而且|以及)(?=(?:請|请)?不要|排除|不含)|(?=排除|不含)/iu).map(part=>part.trim()).filter(Boolean);
const foreign=/\b(?:another|other) (?:student|user|account|person)\b|\b(?:his|her|their)\s+(?:(?:saved|personal|local|own|tuition|school|fee)\s+){0,4}(?:remission|reduction|waiver|exemption|records?|status|amount)\b|\bmy (?:friend|classmate|sister|brother|mother|father|parent|roommate|partner|colleague)\b|\b(?!(?:school|student|university|remission|waiver)['’]s\b)[\p{L}][\p{L}’-]*['’]s\b|\b(?:remission|waiver|reduction|exemption|records?|status|amount) (?:of|for) (?!(?:me|my|this|that|the|academic|school|year|semester|term)\b|(?:low[ -]income|disadvantaged|disabled|indigenous|international|domestic|graduate|undergraduate)\s+students?\b)[\p{L}][\p{L}’-]*\b|別人|他人|其他學生|同學的|(?:他|她|他們|她們)的/iu;
const ownChinese=value=>/^(?:我(?:們|们)?(?:本人|自己)?|本人|自己)$/u.test(value.replace(/^(?:請|请|麻煩|麻烦|幫我|帮我|替我|可以|能否|我想|我要|顯示|显示|查看|查詢|查询|列出|檢查|检查|提供|看看|給我|给我)+/u,''));
const foreignOwner=value=>foreign.test(value)||[...value.matchAll(/([\p{Script=Han}]{1,20})的\s*(?:學雜費|学杂费|學費|学费)(?:優待|优待)?減免/gu)].some(match=>!ownChinese(match[1]));
const follow=/^(?:(?:and|also|then)\s+)?(?:(?:show|check|list|read)\s+(?:me\s+)?(?:my|the|its|this|that)?\s*(?:saved\s+|recorded\s+)?(?:records?|history|status|result|amount|category|notes|student number)|what (?:is|was|about) (?:my|the|its|this|that)?\s*(?:status|result|amount|category|record)|what does (?:it|that|this) mean|(?:for\s+)?(?:academic year\s+\d{2,4}|semester\s+\d{1,2}))(?:\s+and\s+semester\s+\d{1,2})?[?.!]*$|^(?:顯示|查看|查詢)?(?:我的|目前|這個|它的)?(?:紀錄|狀態|結果|金額|類別|備註|學號)[？。！]*$/iu;
const personal=/\b(?:my|mine|me|i|saved|recorded)\b|我的|本人|我有|已存|記錄|紀錄/iu;
const generic=/^(?:what (?:is|are)|define|explain)\s+(?:(?:a|the)\s+)?(?:(?:tuition|school|education|educational)[ -]+(?:fee[ -]+)?|fee[ -]+)(?:remission|reduction|waiver|exemption)[?.!]*$|^(?:什麼是|什么是)(?:學雜費|学杂费|學費|学费)減免[？。！]*$/iu;
function contextRoute(route){
  if(route===undefined||route==='')return {valid:true,selected:false};
  if(typeof route!=='string'||route.length>3100||/[\p{Cc}\p{Cs}\s\\#]/u.test(route)||route.startsWith('//')||/%(?:2e|2f|5c)|\/(?:\.|\.\.)(?:\/|$|\?)/iu.test(route))return {valid:false,selected:false};
  try{const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||!route.startsWith('/')&&!route.startsWith('https://stu.best/'))return {valid:false,selected:false};
    if([...url.searchParams.keys()].some(key=>/^(?:user(?:_?id)?|owner(?:_?id)?|token|access_token|authorization)$/iu.test(key)))return {valid:false,selected:false};
    return {valid:true,selected:url.pathname.replace(/\/$/u,'')==='/school-affairs/services/21-3'};
  }catch{return {valid:false,selected:false};}
}
function previousUser(history){
  if(!Array.isArray(history))return '';
  for(let index=history.length-1;index>=Math.max(0,history.length-6);index--){
    const descriptor=Object.getOwnPropertyDescriptor(history,index),value=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;
    if(value&&typeof value==='object'&&Object.getOwnPropertyDescriptor(value,'role')?.value==='user')return text(Object.getOwnPropertyDescriptor(value,'content')?.value);
  }
  return '';
}
function periods(question){
  const yearExpression=/\b(?:academic\s+year|school\s+year|year)\s*[:#]?\s*(?:"([^"\n]{1,40})"|“([^”\n]{1,40})”|(\d{2,4})\b)|(?<!\d)(\d{2,4})\s*學年(?:度)?|(?<!\d)(\d{2,4})\s*学年(?:度)?/giu;
  const semesterExpression=/\b(?:semester|term)\s*[:#]?\s*(?:"([^"\n]{1,40})"|“([^”\n]{1,40})”|(\d{1,2})\b)|第\s*(\d{1,2})\s*學期|第\s*(\d{1,2})\s*学期/giu;
  const years=[...question.matchAll(yearExpression)].map(match=>match.slice(1).find(value=>value!==undefined));
  const semesters=[...question.matchAll(semesterExpression)].map(match=>match.slice(1).find(value=>value!==undefined));
  const remaining=question.replace(yearExpression,'').replace(semesterExpression,'');
  const currentPeriod=/\b(?:this|current|present)\s+(?:(?:academic|school)\s+)?(?:semester|term|year)\b|本學期|本学期|這學期|这学期|目前(?:的)?學期|目前(?:的)?学期|本學年|本学年/giu;
  const currentLabel=currentPeriod.test(remaining);currentPeriod.lastIndex=0;
  const invalid=/\bfor\s+(?:(?:academic|school)\s+)?(?:year|semester|term)\s+(?!is\b|was\b|recorded\b|shown\b)[^\s?.!,;]+|\b(?:academic year|school year|semester|term)\s*(?:[:#]\s*[^\s?.!,;]+|["“])|第\s*[^\d\s]{1,20}\s*(?:學期|学期)|\b(?:academic year|school year|semester|term)\s+(?!(?:is|was|are|were|recorded|saved|shown|label|labels|and|or|of|for|on|in|do|does|information|details|amount|status|fee|tuition)\b)[\p{L}\d][\p{L}\d-]*/iu.test(remaining.replace(currentPeriod,''))
    ||[...years,...semesters].some(value=>!value.trim());
  const contextOnly=(Boolean(years.length||semesters.length)||currentLabel)&&remaining.replace(currentPeriod,'').replace(/\b(?:for|in|and|of|during|the)\b|[\s,:.]/giu,'')===''
    ||invalid&&!other.test(question)&&/^(?:for\s+)?(?:(?:academic|school)\s+)?(?:year|semester|term)\b/iu.test(question);
  return {academicYear:years[0]??null,semester:semesters[0]??null,ambiguous:new Set(years).size>1||new Set(semesters).size>1,invalid,contextOnly};
}

export function isFeeRemissionPeriodClause(value) {
  const clause=text(value);
  return Boolean(clause)&&periods(clause).contextOnly;
}

/** Select only the local fee-remission history, never a tuition charge ledger. */
export function selectFeeRemissionEvidence(question,route='',history=[]){
  const current=text(question),context=contextRoute(route);if(!current)return null;
  const positive=clauses(current).filter(part=>!negative.test(part));
  const previous=previousUser(history),explicit=positive.filter(part=>topic.test(part));
  const publicGuide=/^(?:(?:where|how) (?:can|do|could|should) (?:i|we) (?:find|apply|submit|contact)|(?:who|what) (?:qualifies|is eligible|are eligible)|(?:where|what) is (?:the )?(?:office|contact))\b|^(?:如何|怎麼|怎么|哪裡|哪里).{0,18}(?:申請|申请|辦理|办理|聯絡|联系)/iu.test(current);
  if((generic.test(current)&&!personal.test(current))||publicGuide&&!/\b(?:my|mine|saved|recorded)\b|我的|本人|已存|記錄|紀錄/iu.test(current))return null;
  const contextual=!explicit.length&&follow.test(current)&&!other.test(current)
    &&(context.selected||topic.test(previous)&&!foreignOwner(previous)&&!clauses(previous).some(part=>negative.test(part)&&topic.test(part)));
  if(!explicit.length&&!contextual)return null;
  const selectedIndexes=new Set(positive.flatMap((part,index)=>topic.test(part)?[index]:[]));
  // Contiguous standalone period clauses qualify this source. An intervening
  // grades/charges clause prevents carrying its period to this collection.
  for(const index of [...selectedIndexes])for(const direction of [-1,1]){
    for(let cursor=index+direction;cursor>=0&&cursor<positive.length&&periods(positive[cursor]).contextOnly;cursor+=direction)selectedIndexes.add(cursor);
  }
  const selected=explicit.length?positive.filter((_,index)=>selectedIndexes.has(index)).join('\n'):current;
  // New period words override previous context. A bare status follow-up may
  // retain the previous literal period, but history never supplies facts.
  const currentPeriod=periods(selected),priorPeriod=periods(previous);
  const usePrior=contextual&&!currentPeriod.academicYear&&!currentPeriod.semester&&!/\b(?:current|this|present|all)\b|目前|本學期|這學期|所有/iu.test(selected);
  const period=usePrior?priorPeriod:currentPeriod;
  const currentTerm=/\b(?:this|current|present)\s+(?:(?:academic|school)\s+)?(?:semester|term|year)\b|本學期|本学期|這學期|这学期|目前(?:的)?學期|目前(?:的)?学期|本學年|本学年/iu.test(selected);
  let identityScope=contextual,studentNumber=false;
  for(const part of positive.flatMap(part=>part.split(/\s+and\s+|以及|和/iu))){
    if(negative.test(part.trim()))continue;
    if(topic.test(part))identityScope=true;
    else if(other.test(part)||/\b(?:profile|email|other account)\b|個人資料|个人资料/iu.test(part))identityScope=false;
    if(identityScope&&/\bstudent\s+(?:number|id)\b|學號|学号/iu.test(part))studentNumber=true;
  }
  const command=/^(?:(?:please|can you|could you|would you|help me)\s+)*(?:delete|erase|remove|change|edit|approve|submit|update|apply|pay)\b|刪除|刪掉|修改|核准|提交|更新|代(?:我)?申請|幫我申請|替我申請/iu;
  const operation=(explicit.length?explicit:[current]).some(part=>part.split(/\s+and\s+|以及|並且/iu).some(clause=>command.test(clause.trim())));
  const document=/\b(?:download|print|certificate|document|pdf|receipt)\b|下載|列印|證明|證明書|文件|收據/iu.test(selected);
  return {from:explicit.length?'question':context.selected?'route':'history',academicYear:period.academicYear,semester:period.semester,currentTerm,studentNumber,operation,document,
    reason:!context.valid?'invalid_route':foreignOwner(selected)||contextual&&!personal.test(current)&&topic.test(previous)&&foreignOwner(previous)?'foreign_request'
      :period.invalid?'invalid_period':period.ambiguous?'ambiguous_period':null};
}
export function isFeeRemissionEvidenceQuestion(question,route='',history=[]){return selectFeeRemissionEvidence(question,route,history)!==null;}

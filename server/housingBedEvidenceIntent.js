// Browser-safe selection only. No records, credentials, clock, or I/O.
const anchors=['academicYear','semester','bedNumber'];
const ordinary=[...anchors,'dormitory','bunk'];
const allFields=[...ordinary,'accommodationFee','deposit','subsidyAmount'];
const text=value=>typeof value==='string'&&value.length<=12000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))?value.normalize('NFKC').trim():'';
const bedTopic=/\b(?:(?:dormitory|dorm|housing|residence hall)[ -]+(?:beds?|assignments?|bed assignments?|fees?|deposits?|subsidies|history)|(?:saved|assigned|my|your)\s+(?:(?:dormitory|dorm|housing)\s+)?beds?|bed\s+(?:assignments?|records?|history|numbers?)|accommodation\s+(?:fees?|deposits?)|(?:move|assign)\s+me\s+to\s+(?:a\s+)?bed)\b|(?:住宿|宿舍)(?:床位|床號|床号)|床位(?:編號|编号|紀錄|记录|分配)|(?:我的|已分配的|儲存的|保存的)(?:床位|床號|床号)|住宿費|住宿费/iu;
const application=/\b(?:housing|dormitory|dorm|accommodation)\s+(?:application|receipt|application window|application period)s?\b|住宿申請|住宿申请|住宿收據|住宿收据|申請期間|申请期间/iu;
const conduct=/\b(?:dormitory|dorm|housing)\s+(?:conduct|discipline|rewards?|penalties)\b|宿舍獎懲|宿舍奖惩|宿舍紀律|宿舍纪律/iu;
const independent=/\b(?:tuition|(?:school\s+)?fee\s+(?:balance|amount due)|remaining balance in school|next\s+(?:(?:school affairs|scheduled)\s+)?class|courses?|classes|grades?|assignments?|homework|salary|aid claims?|counseling|health|student conduct|scholarship|clearance|leave|profile|student (?:number|name)|year level)\b|學費|学费|下一堂課|下一堂课|課程|课程|成績|成绩|作業|作业|薪資|薪资|諮商|咨询|健檢|健检|學生獎懲|学生奖惩|請假|请假|年級|年级/iu;
const negative=/^(?:(?:(?:please|also|but)\s+)*(?:do not|don['’]t|never)\s+(?:read|show|include|list|check|tell(?:\s+me)?)|not(?!\s+only)\b|nor\b|without\b|skip\b|exclude\b|excluding\b|except\b|(?:請|请)?不要|別(?:讀|顯示)|排除|不含)/iu;
const fieldOnly=/^(?:(?:and|also|then|please)\s+)*(?:(?:show|list|include|tell me|what (?:is|are|about|was|were)|how much (?:is|was))\s+)?(?:(?:my|the|its|their|saved|recorded|each|all)\s+)*(?:bed(?: number)?s?|dormitory(?: name)?s?|bunks?|upper|lower|academic year|school year|semester|term|accommodation fees?|housing fees?|fees?|deposits?|subsid(?:y|ies)(?: amount)?|amounts?|records?|history|status|details)(?:\b|$)|^(?:請|请|顯示|显示|列出|包含|我的|它的|儲存的|保存的)*(?:學年|学年|學期|学期|床位|宿舍名稱|宿舍名称|上下舖|上下铺|住宿費|住宿费|保證金|保证金|補助|补助|紀錄|记录)/iu;
const follow=/^(?:(?:and|also|then|please)\s+)*(?:(?:show|list|check)\s+(?:me\s+)?(?:my|the|its|those|these)?\s*(?:saved\s+|recorded\s+)?(?:bed|records?|history|details|fees?|deposit|subsidy)|what (?:is|are|was|were|about) (?:my|the|its|their)?\s*(?:bed|dormitory|bunk|fee|deposit|subsidy|academic year|semester|status)|how much (?:is|was) (?:my|the|its)?\s*(?:fee|deposit|subsidy)|which (?:bed|dormitory|bunk)|(?:the\s+)?(?:academic year|semester)\s+\d)|^(?:請|请|顯示|显示|列出|我的|它的)*(?:床位|上下舖|上下铺|住宿費|住宿费|保證金|保证金|補助|补助|紀錄|记录|學年|学年|學期|学期)/iu;
const clean=value=>value.replace(/^(?:(?:also|then|but)\s+)+/iu,'').replace(/[,，]\s*$/u,'').trim();
function clauses(value){
  const boundary=/[;；。!?！？\n]|\.(?:\s+|$)|[,，]\s*(?=(?:also\b|then\b|show\b|what\b|when\b|where\b|my\b|do not\b|don['’]t\b|never\b|not\b|without\b|exclude\b|excluding\b|except\b|for\b|請|请|不要|排除|不含))|\s+(?:and|also|but|nor)\s+(?=(?:show\b|what\b|when\b|where\b|do not\b|don['’]t\b|never\b|not\b|skip\b|my\b|tuition\b|(?:school )?fee balance\b|next (?:School Affairs )?class\b|current courses\b|year level\b|dormitory bed\b|bed history\b|[\p{L}\p{N}][\p{L}\p{N}_’-]*['’]s\b|the status of my\b|the balance of my\b))|(?<!do)\s+(?=(?:without|excluding|except|not(?!\s+only))\b)|還有|还有|以及(?=我的)|(?=排除|不含)/giu;
  const result=[];let start=0,priorBoundary='';
  for(const match of [...value.matchAll(boundary),{index:value.length,0:''}]){
    let part=clean(value.slice(start,match.index));
    if(part){
      if((/^nor$/iu.test(priorBoundary.trim())||/^and$/iu.test(priorBoundary.trim())&&negative.test(result.at(-1)??''))&&!/^(?:show|list|read|include|check|what|when|where|how|do not|don['’]t|never|請|请|顯示|显示)\b/iu.test(part))part='Do not show '+part;
      result.push(part);
    }
    start=match.index+match[0].length;priorBoundary=match[0];
  }
  return result;
}
function latest(history){
  if(!Array.isArray(history))return '';
  for(const row of history.slice(-12).reverse()){
    if(!row||typeof row!=='object')continue;
    const role=Object.getOwnPropertyDescriptor(row,'role'),content=Object.getOwnPropertyDescriptor(row,'content');
    if(role?.value==='user'&&typeof content?.value==='string')return text(content.value);
  }
  return '';
}
function routeContext(route){
  if(route===undefined||route==='')return {valid:true,bed:false};
  if(typeof route!=='string'||route.length>3100||/[\p{Cc}\p{Cs}\s\\#]/u.test(route)||route.startsWith('//')||/%(?:2e|2f|5c)|\/(?:\.|\.\.)(?:\/|$|\?)/iu.test(route))return {valid:false,bed:false};
  try{
    const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||!route.startsWith('/')&&!route.startsWith('https://stu.best/'))return {valid:false,bed:false};
    const bed=url.pathname.replace(/\/$/u,'')==='/school-affairs/services/34-1';
    if([...url.searchParams.keys()].some(key=>/^(?:user(?:_?id)?|owner(?:_?id)?|token|access_token|authorization)$/iu.test(key))||bed&&url.search)return {valid:false,bed};
    return {valid:true,bed};
  }catch{return {valid:false,bed:false};}
}
const hanTerm=/(?:\d+\s*(?:學年|学年)(?:度)?\s*)?(?:第\s*[12]\s*(?:學期|学期))|\d+\s*(?:學年度|学年度|學年|学年)/gu;
const relativeTerm=/\b(?:this|current|last|previous|next) (?:academic )?(?:semester|term|academic year)\b|\b(?:semester|term) (?:this|last|next) year\b|(?:本|這|这|上|下|當前|当前|目前)(?:個|个)?(?:學期|学期|學年|学年)/iu;
function ownHan(value){
  const remaining=value.replace(/^(?:請問|请问|請|请|幫我|帮我|替我|麻煩|麻烦|顯示|显示|查看|查詢|查询|查|列出|提供|看看|哪裡|哪里|可以|看)+/u,'')
    .replace(/的$/u,'');
  return !remaining||/^(?:我(?:自己|本人)?|本人|自己|我的|我(?:目前|現在|现在)|我在校方確認|我在校方确认)$/u.test(remaining);
}
function foreignOwner(value){
  const stripped=value.replace(/\b(what|where|when|who|how)['’]s\b/giu,'$1 is').replace(/\b(?:bed(?: number)?|room|dormitory(?: name)?)\s+["“][^"”]{1,80}["”]/giu,'bed');
  if(/\b(?:another|other)\s+(?:student|person|user|account)|\b(?:his|her|their|your)\s+(?:(?:own|saved|recorded|assigned|dormitory|housing|dorm)\s+){0,4}(?:bed|records?|assignment|fee|deposit)|\bmy\s+(?:friend|sister|brother|mother|father|parent|classmate|roommate|colleague|partner)\b|別人|别人|他人|其他學生|其他学生|(?:他|她|他們|她们)的/iu.test(stripped))return true;
  if(/\b(?!(?:student|university|school|dormitory|dorm)['’]s\b)[\p{L}\p{N}][\p{L}\p{N}_’-]*['’]s\b/iu.test(stripped))return true;
  if(/\b(?:does|did|has|is)\s+(?!(?:my|the|this|that|a|an|it|there|any|each|every|your|saved|recorded|assigned|i|me)\b)[\p{L}\p{N}][\p{L}\p{N}_’-]*\s+(?:have|receive|live|assigned|a\b|the\b)/iu.test(stripped))return true;
  if(/\b(?:for|of|assigned to|recorded for|belong(?:s|ing)? to)\s+(?:student\s+)?(?!(?:me|my|myself|this|that|the|each|every|academic|school|semester|term|year|upper|lower|bed|room|period|all)\b|\d{1,3}(?:\b|[-/]))[\p{L}\p{N}][\p{L}\p{N}_’-]*\b/iu.test(stripped))return true;
  if(/\b(?:for|of|assigned to|recorded for)\s+(?:the\s+)?student\s+(?!(?:me|myself|my)\b)[\p{L}\p{N}][\p{L}\p{N}_’-]*\b/iu.test(stripped))return true;
  if(/\bstudent\s+(?:id\s*[:#]?\s*)?[A-Za-z]*\d{4,}\b/iu.test(stripped)&&! /\bmy\s+(?:own\s+)?student\s+(?:id|number)\b/iu.test(stripped))return true;
  const normalizedHan=stripped.replace(hanTerm,'').replace(new RegExp(relativeTerm.source,'giu'),'');
  for(const match of normalizedHan.matchAll(/([\p{Script=Han}]+)(?:的)?(?:(?:住宿|宿舍)(?:床位|床號|床号)|床位分配)/gu))if(!ownHan(match[1]))return true;
  return false;
}
function isNav(value){
  const q=value.replace(/^(?:請問|请问)/u,'');
  if(/^(?:(?:我的)?(?:住宿|宿舍)(?:床位|床號|床号)(?:查詢|查询|紀錄|记录)?(?:頁面|页面)?)\s*(?:在哪(?:裡|里)?|怎麼查|怎么查|從哪裡查|从哪里查)$/u.test(q))return true;
  return /^(?:where (?:can|do) i (?:find|see|check|view|open)|(?:give|show) me (?:the |a )?link(?: to| for)?|open (?:the |my )?.*(?:page|form|records|history)|哪裡|哪里|去哪|(?:請|请)?(?:提供|給我|给我).*(?:連結|链接))/iu.test(value)
    &&! /\b(?:how much|amount|balance|paid|deposit|subsidy|academic year|semester|bed number|bunk)\b|多少|金額|金额|保證金|保证金|補助|补助|上下舖|上下铺/iu.test(value);
}
function termSelection(value){
  const years=[],semesters=[];
  for(const match of value.matchAll(/\b(?:academic|school)\s+year\s*[:=]?\s*([^\s,;]+)/giu))if(!/^(?:and|or|semester|term)$/iu.test(match[1]))years.push(match[1]);
  for(const match of value.matchAll(/(\d+)\s*學年(?:度)?|(\d+)\s*学年(?:度)?/gu))years.push(match[1]??match[2]);
  for(const match of value.matchAll(/\bsemester\s*[:=]?\s*([^\s,;]+)|第\s*(\d+)\s*學期|第\s*(\d+)\s*学期/giu))semesters.push(match[1]??match[2]??match[3]);
  for(const match of value.matchAll(/\b(?:term\s*)?(\d{1,4})\s*[-/]\s*(\d+)\b/giu)){years.push(match[1]);semesters.push(match[2]);}
  for(let i=0;i<years.length;i++)years[i]=years[i].replace(/\.$/u,'');
  for(let i=0;i<semesters.length;i++)semesters[i]=semesters[i].replace(/\.$/u,'');
  const validYear=years.every(item=>/^[1-9]\d{0,2}$/u.test(item)&&Number(item)<=300),validSemester=semesters.every(item=>/^[12]$/u.test(item));
  if(!validYear||!validSemester||new Set(years).size>1||new Set(semesters).size>1)return {term:{academicYear:null,semester:null},invalid:true};
  return {term:{academicYear:years.length?Number(years[0]):null,semester:semesters.length?Number(semesters[0]):null},invalid:false};
}
function requestedFields(parts){
  const fields=new Set(ordinary);
  for(const part of parts){
    const remove=negative.test(part);
    if(!remove&&/\bfees\b/iu.test(part)&&! /\b(?:accommodation|housing|dormitory|dorm)\s+fees\b/iu.test(part))['accommodationFee','deposit','subsidyAmount'].forEach(field=>fields.add(field));
    if(!remove&&/\b(?:all|every)\s+(?:saved\s+)?fields?\b|完整(?:紀錄|记录)|所有欄位|所有字段/iu.test(part))allFields.forEach(field=>fields.add(field));
    for(const [field,pattern]of [['dormitory',/\bdormitory(?: name)?\b|宿舍名稱|宿舍名称/iu],['bunk',/\bbunks?\b|upper|lower|上下舖|上下铺/iu],['accommodationFee',/\b(?:accommodation|housing|dormitory|dorm)\s+fees?\b|\bfees?\b|住宿費|住宿费/iu],['deposit',/\bdeposits?\b|保證金|保证金/iu],['subsidyAmount',/\bsubsid(?:y|ies)\b|補助|补助/iu]]){
      if(pattern.test(part)){if(remove)fields.delete(field);else fields.add(field);}
    }
  }
  return allFields.filter(field=>fields.has(field));
}
function unsupported(value){
  const result=[];
  if(/\b(?:currently live|live there (?:right )?now|current residence|current(?:ly)? (?:assigned )?bed|newest|latest bed)\b|目前(?:的)?(?:(?:住宿|宿舍)?床位|居住|住在)|現在住|现在住|最新床位/iu.test(value))result.push('current_residence');
  if(/\b(?:paid|payment|settled|bank|owe|due|balance)\b|已繳|已缴|付款|繳清|缴清|欠款|餘額|余额/iu.test(value))result.push('payment_confirmation');
  if(/\b(?:official|university (?:confirmed|confirmation)|confirm(?:ed)? (?:my |the )?(?:assignment|room)|guarantee|certificate|proof)\b|正式|校方確認|校方确认|證明|证明/iu.test(value))result.push('official_confirmation');
  if(/\b(?:move[- ]?in date|move[- ]?out date|tenancy|residence dates?|how long.*live|when.*(?:move|live))\b|入住日期|退宿日期|居住期間|居住期间/iu.test(value))result.push('tenancy_dates');
  return result;
}
function operation(value){return /^(?:(?:please|can you|could you|would you|help me)\s+)*(?:move|assign|reserve|change|update|delete|cancel|submit|pay|transfer|switch)\b|\b(?:and|then) (?:move|change|reserve|pay|cancel|update|delete|assign|switch)\b|(?:幫我|帮我|請|请)?(?:更改|調換|调换|換床|换床|預約床位|预约床位|取消床位|支付|繳費|缴费)/iu.test(value);}
function companion(value){
  const q=value.replace(/[?.!。！？]+$/u,'').replace(/^(?:(?:also|please|then)\s+)+/iu,'').replace(/^(what|when|where)['’]s\b/iu,'$1 is').replace(/^(show(?: me)?|check|tell me) next /iu,'$1 my next ');
  if(/^(?:(?:what|when|where) is (?:my|the)|(?:show(?: me)?|tell me(?: about)?|check) my|my)? ?next (?:(?:school affairs|scheduled) )?class(?:[, ]+(?:(?:the |its |and )?(?:date|start time|time|room|location)[, ]*)+)?$/iu.test(q)
    ||/^(?:請問|請顯示|请显示|告訴我|告诉我)?(?:我的|我)?下一堂課(?:是什麼|幾點|在哪裡|時間|教室)?$/u.test(q))return 'next_class';
  if(/^(?:(?:show|check|list)(?: me)?\s+)?(?:my\s+)?(?:tuition|school fee|fee)\s+(?:balance|remaining balance|amount due)$/iu.test(q)
    ||/^(?:what is|how much is)\s+(?:my\s+)?(?:remaining\s+)?(?:tuition|school fee)\s+(?:balance|amount due)$/iu.test(q)
    ||/^how much is (?:my|the) remaining balance in school$/iu.test(q)
    ||/^(?:請|请)?(?:顯示|显示|查詢|查询)?我的學費(?:餘額|余额|欠款)$/u.test(q))return 'fee_balance';
  return null;
}
function companionScope(parts){
  const states=new Map(),foreign=new Set();let companionOnly=true;
  for(const part of parts){
    const excluded=negative.test(part);
    const positive=excluded?part.replace(/^(?:(?:(?:please|also|but)\s+)*(?:do not|don['’]t|never)\s+(?:read|show|include|list|check|tell(?:\s+me)?)\s*|(?:not|nor|without|skip|exclude|excluding|except)\s+|(?:請|请)?(?:不要|別|别)(?:讀取|读取|讀|读|顯示|显示|列出|查詢|查询|包含|告訴我|告诉我)?\s*|(?:排除|不含)\s*)/iu,''):part;
    const owned=companion(positive.replace(/\s+(?:for|of)\s+(?:me|myself)[.?!]?$/iu,'')),other=owned?null:foreignCompanion(positive),kind=owned??other;
    if(other){if(!excluded)foreign.add(other);}
    else if(kind)states.set(kind,!excluded);
    else companionOnly=false;
  }
  const order=['next_class','fee_balance'];
  const companions=order.filter(kind=>states.get(kind)===true),excludedCompanions=order.filter(kind=>states.get(kind)===false);
  return {companions,excludedCompanions,foreignCompanions:order.filter(kind=>foreign.has(kind)),companionOnly,companion:companions.length===1?companions[0]:null};
}
function foreignCompanion(value){
  const postfix=/^(.*?)\s+(?:for|of|belong(?:s|ing)? to)\s+(?:(?:the\s+)?student\s+)?([\p{L}\p{N}][\p{L}\p{N}_’'-]*(?:\s+[\p{L}\p{N}][\p{L}\p{N}_’'-]*){0,2})[.?!]?$/iu.exec(value);
  if(postfix&&(/^my (?:mother|father|parents?|friend|sister|brother|classmate|roommate|colleague|partner)$/iu.test(postfix[2])
    ||!/^(?:me|myself|my|this|that|the|current|academic|school|semester|term|year|next|last|previous|every|each)\b|^\d{1,3}$/iu.test(postfix[2])))return companion(postfix[1]);
  const possessive=/^(?:(?:show|check|list|tell me)(?: me)?\s+)?(?:my\s+)?([\p{L}\p{N}][\p{L}\p{N}_’-]*)['’]s\s+(.+)$/iu.exec(value);
  if(possessive&&!/^(?:what|where|when|who|how|school|university)$/iu.test(possessive[1]))return companion(possessive[2]);
  const pronoun=/^(?:(?:show|check|list|tell me)(?: me)?\s+)?(?:his|her|their|your)\s+(.+)$/iu.exec(value);
  return pronoun?companion(pronoun[1]):null;
}
function priorScope(previous){
  if(!previous)return null;
  const parts=clauses(previous),own=parts.filter(part=>bedTopic.test(part)&&!application.test(part)&&!conduct.test(part));
  if(!own.length||parts.some(part=>(independent.test(part)||application.test(part)||conduct.test(part))&&!bedTopic.test(part)))return null;
  const last=own.at(-1);return negative.test(last)?null:{question:own.join('. '),foreign:foreignOwner(own.join('. '))};
}

export function housingBedLookupContext(question,route='',history=[]){
  const value=text(question),context=routeContext(route),previous=latest(history),prior=priorScope(previous);
  const empty={selection:null,question:'',otherQuestion:value,companion:null,companions:[],excludedCompanions:[],foreignCompanions:[],companionOnly:false,navigation:false,foreign:false,excluded:false};
  if(!value)return empty;
  const parts=clauses(value),explicit=parts.some(part=>bedTopic.test(part)&&!application.test(part)&&!conduct.test(part));
  const implicit=!explicit&&follow.test(value)&&!independent.test(value)&&!application.test(value)&&!conduct.test(value)
    &&(previous?Boolean(prior):context.bed);
  const scoped=[],other=[];let selected=false,excluded=false,navigation=false,foreign=false,fieldNegation=false;
  for(const part of parts){
    const isOther=(independent.test(part)||application.test(part)||conduct.test(part))&&!bedTopic.test(part);
    const named=bedTopic.test(part)&&!application.test(part)&&!conduct.test(part);
    const termOnly=/^(?:for\s+)?(?:(?:academic|school)\s+year\b|semester\b|term\s+\d|\d+\s*(?:學年|学年))/iu.test(part);
    const fieldPart=part.replace(/^(?:(?:please\s+)?(?:do not|don['’]t|never)\s+(?:read|show|include|list|check)\s+|(?:without|excluding|except|skip|not)\s+)/iu,'');
    const field=(fieldOnly.test(fieldPart)||termOnly)&&!isOther;
    if(isOther||!named&&!(implicit||field&&(explicit||selected))){other.push(part);fieldNegation=false;continue;}
    if(field&&!named&&fieldNegation&&!negative.test(part)&&! /^(?:show|list|include|tell|what|how|check|請|请|顯示|显示)/iu.test(part)){scoped.push('not '+part);continue;}
    if(named&&negative.test(part)){scoped.length=0;selected=false;navigation=false;foreign=false;excluded=true;fieldNegation=true;continue;}
    if(negative.test(part)){scoped.push(part);fieldNegation=true;continue;}
    fieldNegation=false;
    if(named){excluded=false;selected=true;}
    if(implicit||field)selected=true;
    scoped.push(part);foreign ||= foreignOwner(part);
    navigation ||= named&&isNav(part);
  }
  const scopedQuestion=scoped.join('. '),otherQuestion=other.join('. '),from=explicit?'question':prior?'history':'route';
  const companions=companionScope(other);
  if(!selected)return {...empty,otherQuestion,...companions,excluded};
  if(implicit&&prior?.foreign)foreign=true;
  const termQuestion=scopedQuestion+(implicit&&prior?'. '+prior.question:'');
  const terms=termSelection(termQuestion);
  const relative=relativeTerm.test(scopedQuestion)&&!(terms.term.academicYear!==null&&terms.term.semester!==null);
  const reason=!context.valid?'invalid_route':foreign?'foreign_request':operation(scopedQuestion)?'unsupported_operation':terms.invalid||relative?'ambiguous_selector':null;
  // A guide is public only when no requested literal fields or operation are attached.
  const pureNav=navigation&&scoped.every(part=>isNav(part))&&!reason;
  const selection=pureNav?null:{from,question:scopedQuestion,term:terms.term,fields:reason?[]:requestedFields(scoped),unsupported:unsupported(scopedQuestion),reason};
  return {selection,question:scopedQuestion,otherQuestion,...companions,navigation:pureNav,foreign,excluded:false};
}
export function selectHousingBedEvidence(question,route='',history=[]){return housingBedLookupContext(question,route,history).selection;}
export function isHousingBedEvidenceQuestion(question,route='',history=[]){return selectHousingBedEvidence(question,route,history)!==null;}
export function housingBedNavigation(question){const result=housingBedLookupContext(question);return result.navigation&&!result.otherQuestion;}
export function isHousingBedScopeQuestion(question,route='',history=[]){const result=housingBedLookupContext(question,route,history);return Boolean(result.selection||result.navigation||result.foreign||result.excluded);}

// This selector also runs in the browser. It has no account data or transport.
export const studentLeaveBasePath='/school-affairs/services/leave';
export const studentLeaveArchiveCutoff='2019-08-01';
export const studentLeaveFieldNames=Object.freeze(['title','dates','status','category','periods','reviewStatus']);
export const isStudentLeaveUuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value);

const normalize=value=>typeof value==='string'&&value.length<=12000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))?value.normalize('NFKC').trim():'';
const leave=/\b(?:student\s+leave|leave\s+(?:of\s+absence|forms?|requests?|records?|history|applications?|status|periods?|dates?|category|categories|types?|was|has been|is|id|number)|(?:type|category|status) of (?:my )?leave|(?:my|our|own|saved|recorded|filed|draft|withdrawn|approved|sick|personal|official|archived?|historical)\s+(?:(?:current|prior|recent|latest|saved|recorded)\s+)?leaves?|i\s+(?:have|request|filed?|submitted?|took|take)\s+(?:(?:for|any|a|some)\s+){0,2}leave|absence\s+(?:requests?|forms?))\b|請假|请假|假單|假单|假別|假别|病假|事假|公假|喪假|丧假|心理假|生理假|產假|产假|哺乳假/iu;
const external=/\b(?:tuition|fee balance|amount (?:due|owed)|next class|schedule|courses?|grades?|homework|assignments?|attendance|dormitory|internship|financial aid|salary|records? overview)\b|學費|学费|課表|课表|下一堂課|下一堂课|成績|成绩|作業|作业|出缺席|曠課|曠课|宿舍|薪資|薪资|實習|实习/iu;
const linkedAttendance=/\b(?:attendance|absent|excused absence|miss(?:ed)? (?:classes?|school|meeting)|make[- ]?up (?:class|work)|absence count)\b|出缺席|曠課|曠课|缺席(?:紀錄|记录)|補課|补课/iu;
const unavailableField=/\b(?:phone|contacts?|notes?|reasons?|attachments?|diagnosis|medical documentation|signed copies)\b|聯絡電話|联系电话|事由|理由|附件|診斷|诊断|證明文件|证明文件/iu;
const negative=/^(?:(?:please\s+)?(?:(?:do not|don['’]t|never)\s+(?:show|read|check|list|include|look up|access|retrieve|fetch|disclose|reveal|share)|avoid|skip|exclude)\s+|not(?!\s+only\b)\s+|without\s+|excluding\s+|except\s+|(?:請|请)?不要(?:顯示|显示|查詢|查询)?|排除|不含)/iu;
const publicTopic=/\b(?:policy|policies|rules?|regulations?|procedures?|requirements?|instructions? for|what counts as|which office|who handles|office that|office contact)\b|規則|规则|辦法|办法|規定|规定|承辦單位|承办单位/iu;
const explicitOwnRecord=/\b(?:my|our|own|saved|this|selected)\s+(?:(?:own|saved|recorded|archived)\s+){0,3}(?:leave|record|form|request)|我的|我本人|這筆|这笔/iu;
const command=/^(?:(?:please|can you|could you|would you|help me)\s+)*(?:create|save|edit|update|delete|remove|change|file|submit|withdraw|cancel|approve|reject|send)\b|^(?:請|请|幫我|帮我|替我)*(?:新增|建立|儲存|保存|更改|修改|刪除|删除|申請|申请|送出|提交|撤回|取消|核准|審核|审核)/iu;
const relativeTarget=/\b(?:it|this(?: (?:form|record|leave|request))?|that(?: (?:form|record|leave|request))?|them|those)(?:\s+(?:now|please))?$|(?:它|該筆|该笔|這筆|这笔)(?:資料|资料|紀錄|记录|假單|假单)?$/iu;
const navigation=/^(?:where (?:can|do) i (?:find|view|see|open|check)|how (?:can|do|should) i|(?:give|show) me (?:a|the) link|open .+(?:page|form|portal)|(?:請問|请问)?(?:哪裡|哪里|怎麼|怎么|如何)|(?:請|请)?(?:提供|給我|给我).*(?:連結|链接))/iu;
const archive=/\b(?:archive(?:d)?|historical(?:\s+leave)?)\b|歷史請假假單|历史请假假单|107\s*(?:學|学)年(?:度)?以前/iu;
const periodView=/\b(?:leave|class)\s+periods?\b|請假節次|请假节次/u;
const exactView=/\b(?:this|that|the (?:open|selected|current)|current|selected)\s+(?:saved\s+)?(?:leave|form|request|record)\b|(?:這|这|該|该|目前|這份|这份|這筆|这笔)(?:筆|笔|份|張|张)?(?:請假|请假|假單|假单|紀錄|记录)/iu;
const follow=/^(?:(?:and|also|what about|how about|show(?: me)?|check|list|please)\s+)*(?:(?:my|the|its|this|that|saved|their|recorded)\s+)*(?:dates?|status|review (?:status|progress)|periods?|category|type|details?|is it approved|was it approved|how many)\b|^(?:那|請|请|顯示|显示|查詢|查询|我的|它的|這筆|这笔)*(?:日期|起訖|起讫|節次|节次|假別|假别|類別|类别|狀態|状态|簽核|签核|核准|幾筆|几笔)/iu;
const fieldPatterns={
  title:/\b(?:title|record name)\b|假單名稱|假单名称/iu,
  dates:/\b(?:dates?|starts? on|ends? on|when|start(?:ing)?|end(?:ing)?)\b|日期|起訖|起讫|起始|結束|结束|何時|何时/iu,
  status:/\b(?:status|draft|filed|withdrawn|saved state)\b|紀錄狀態|记录状态|狀態|状态|草稿|撤回|已儲存|已保存/iu,
  category:/\b(?:categor(?:y|ies)|kind|type|sick|personal|bereavement|menstrual|nursing|maternity)\b|假別|假别|類別|类别|病假|事假|喪假|丧假|生理假|產假|产假/iu,
  periods:/\b(?:periods?|time slots?)\b|節次|节次|時段|时段/iu,
  reviewStatus:/\b(?:reviews?|approval|approv(?:e|ed)|decision|resolved|pending)\b|簽核|签核|審核|审核|核准|批准|處理進度|处理进度/iu,
};
const categoryValues={
  personal:/\bpersonal leaves?\b|事假/iu,
  sick:/\bsick leaves?\b|病假/iu,
  official:/\bofficial duty leaves?\b|公假/iu,
  bereavement:/\bbereavement leaves?\b|喪假|丧假/iu,
  nursing:/\bnursing leaves?\b|哺乳假/iu,
  mental_health:/\bmental(?: health)? leaves?\b|心理假/iu,
  maternity:/\bmaternity leaves?\b|產假|产假/iu,
  menstrual:/\bmenstrual leaves?\b|生理假/iu,
  other:/\bother leave category\b|其他假別|其他假别/iu,
};
const statusValues={
  draft:/\bdraft(?:\s+(?:sick|personal|bereavement|nursing|maternity|menstrual|official duty|mental health))?\s+leaves?\b|草稿假單|草稿假单/iu,
  filed:/\bfiled(?:\s+(?:sick|personal|bereavement|nursing|maternity|menstrual|official duty|mental health))?\s+leaves?\b|已(?:送出|提交)(?:的)?假[單单]/iu,
  withdrawn:/\bwithdrawn(?:\s+(?:sick|personal|bereavement|nursing|maternity|menstrual|official duty|mental health))?\s+leaves?\b|撤回(?:的)?假[單单]/iu,
};

function clauses(value){
  const boundary=/[;；。!?！？\n]|\.(?:\s+|$)|[,，]\s*(?=(?:also\b|then\b|what\b|when\b|where\b|show\b|do not\b|don['’]t\b|without\b|excluding\b|my\b|請|请|不要|排除))|\s+(?:and|also|plus|together with|as well as|but|then|&)\s+(?=(?:show\b|list\b|check\b|read\b|tell\b|when\b|what\b|where\b|how\b|do not\b|don['’]t\b|without\b|excluding\b|submit\b|edit\b|delete\b|cancel\b|approve\b|my\b|tuition\b|fee balance\b|next class\b|current courses\b|attendance\b|grades?\b|assignments?\b|(?:[\p{L}\p{N}_-]+)['’]s\b))|(?<!\bdo)\s+(?=(?:without|excluding|except|not(?!\s+only\b))\b)|還有|还有|並且|并且|但是|以及(?=我的)|(?=排除|不含|不要)/giu;
  const result=[];
  let start=0,priorBoundary='';
  for(const match of [...value.matchAll(boundary),{index:value.length,0:''}]){
    let part=value.slice(start,match.index).trim();
    if(/^(?:and|&|以及)$/iu.test(priorBoundary.trim())&&negative.test(result.at(-1)??'')
      &&!negative.test(part)&&!/^(?:show|read|check|list|tell|when|where|what|how|請|请|顯示|显示|查詢|查询)\b/iu.test(part))
      part='Do not show '+part;
    if(part)result.push(part);
    start=match.index+match[0].length;
    priorBoundary=match[0];
  }
  return result;
}

function routeContext(route){
  if(route===undefined||route==='')return {valid:true,view:null,id:null};
  if(typeof route!=='string'||route.length>3100||/[\p{Cc}\p{Cs}\s\\#]/u.test(route)||route.startsWith('//')
    ||/%(?:2e|2f|5c)|\/(?:\.|\.\.)(?:\/|$|\?)/iu.test(route))return {valid:false,view:null,id:null};
  try{
    const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||!route.startsWith('/')&&!route.startsWith('https://stu.best/'))
      return {valid:false,view:null,id:null};
    const path=url.pathname.replace(/\/$/u,'');
    if([...url.searchParams.keys()].some(key=>/^(?:user(?:_?id)?|owner(?:_?id)?|token|access_token|authorization)$/iu.test(key)))
      return {valid:false,view:null,id:null};
    if(path===studentLeaveBasePath||path===studentLeaveBasePath+'/index')return {valid:!url.search,view:null,id:null};
    if(!path.startsWith(studentLeaveBasePath+'/'))return {valid:true,view:null,id:null};
    const subpath=path.slice(studentLeaveBasePath.length+1);
    if(['history','archive','periods'].includes(subpath))return {valid:!url.search,view:subpath,id:null};
    const id=subpath.startsWith('edit/')?subpath.slice(5).toLowerCase():null;
    return isStudentLeaveUuid(id)&&!url.search?{valid:true,view:'record',id}:{valid:false,view:null,id:null};
  }catch{return {valid:false,view:null,id:null};}
}

function foreignTarget(value){
  const q=value.replace(/\b(what|where|when|who|how|it|that|there)['’]s\b/giu,'$1 is');
  if(/\b(?:another|other|different)\s+(?:student|account|person|user)|\b(?:our|his|her|their|your)\s+(?:own\s+|saved\s+|recorded\s+)?(?:leave|(?:absence\s+)?records?|dates?|status|request)|\bmy\s+(?:friend|roommate|classmate|parent|mother|father|sister|brother|partner)\b|別人|别人|他人|其他學生|其他学生|室友的|同學的|同学的|朋友的|(?:他|她|他們|她们)的/iu.test(q))return true;
  if(/\b(?!(?:student|university|school|today|yesterday|tomorrow|week|month|year|record|request|form|leave)['’]s\b)[\p{L}\p{N}][\p{L}\p{N}_’-]*['’]s\s+(?:(?:own|saved|recorded|student)\s+){0,3}(?:leave|records?|dates?|periods?|status|category|review)\b/iu.test(q))return true;
  if(/\b(?:for|of|belong(?:s|ing)? to|by)\s+(?:the\s+)?student\s+(?!(?:leave|records?|me|myself|my)\b)[\p{L}\p{N}_’-]+|\b(?:student|user|account)(?:\s+(?:id|number))?\s*[:#]?\s*[A-Za-z]*\d{4,}\b/iu.test(q))return true;
  if(/\b(?!(?:my|the|student|university|school)['’]s)\p{L}[\p{L}\p{N}_-]*['’]s\s+(?:(?:saved|recorded)\s+)?[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}\s+leave\b/u.test(q))return true;
  if(/\b(?:for|belong(?:s|ing)? to|by)\s+(?:all students|the whole class|everyone)\b|(?:替|幫|帮)(?!我|本人)[\p{Script=Han}]{2,12}(?:查詢|查询|查看)(?:請假|请假|假單|假单)/iu.test(q))return true;
  if(/\b(?:for|belong(?:s|ing)? to|by)\s+(?!(?:me|my(?:self)?|my\s+own|the|a|an|this|that|those|school|student|leave|review|dates?|periods?|(?:a[mp]|p[mp])|today|yesterday|tomorrow|last|next|[A-Za-z]+day|[0-9])\b)[\p{L}][\p{L}\p{N}_’-]+\b/iu.test(q))return true;
  return /[\p{Script=Han}]{1,12}的(?:請假|请假|假單|假单|假別|假别)/u.test(
    q.replace(/(?:我自己|我本人|本人|自己|我的|該筆|该笔|這筆|这笔)(?:的)?/gu,'').replace(/(?:儲存|保存|這張|这张|該張|该张|歷史|历史)的/gu,'')
  );
}

export const isStudentLeaveTitle=value=>typeof value==='string'&&value.length>0&&value.length<=120
  &&value===value.trim()&&!/[\p{Cc}\p{Cs}]/u.test(value);

function savedTitle(text){
  const quoted=/\b(?:leave(?: record| form| request)? (?:named|titled|called)|my (?:saved )?leave(?: record| form| request)?)\s+["“]([^"”]+)["”]/iu.exec(text);
  const named=/\b(?:my|saved)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}\s+leave)\b/u.exec(text);
  const value=(quoted?.[1]??named?.[1]??'').trim();
  if(!isStudentLeaveTitle(value)||Object.values(categoryValues).some(pattern=>pattern.test(value))
    ||/\b(?:student|my|recorded|current|archived)\s+leave\b/iu.test(value))return null;
  return value;
}

function latestUser(history){
  if(!Array.isArray(history))return '';
  for(const row of history.slice(-12).reverse()){
    const role=row&&Object.getOwnPropertyDescriptor(row,'role'),content=row&&Object.getOwnPropertyDescriptor(row,'content');
    if(role?.value==='user'&&typeof content?.value==='string')return normalize(content.value);
  }
  return '';
}

export function isStudentLeaveDate(value){
  if(typeof value!=='string'||!/^(?:20\d\d|2100)-\d\d-\d\d$/u.test(value))return false;
  const parsed=new Date(value+'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
const iso=date=>date.toISOString().slice(0,10);
function rangeFor(q,now){
  const dates=[...new Set([...q.matchAll(/(?<![\p{L}\p{N}-])(\d{4}-\d{1,2}-\d{1,2})(?![\d-])/gu)].map(match=>match[1]))];
  const relative=/\b(today|yesterday|tomorrow|this month|last month|this year|last year|this week|last week)\b|今天|昨日|昨天|明天|本月|上月|本週|本周|上週|上周|今年|去年/giu;
  const offsets={today:0,yesterday:-1,tomorrow:1,今天:0,昨天:-1,昨日:-1,明天:1};
  const temporal=[...new Set([...q.matchAll(relative)].map(match=>match[0].toLowerCase()))];
  if(dates.some(date=>!isStudentLeaveDate(date))||dates.length>2||temporal.length>1||dates.length&&temporal.length)return false;
  if(dates.length===2){
    if(!/\b(?:from|between|to|through|until)\b|至|到|~|–|—/iu.test(q)||dates[0]>dates[1])return false;
    return {from:dates[0],through:dates[1]};
  }
  if(dates.length===1){
    if(/\b(?:since|after|before|until|through|from|between)\b|以前|以後|以后|之前|之後|之后/iu.test(q))return false;
    return {from:dates[0],through:dates[0]};
  }
  if(temporal.length){
    const period=temporal[0],taipei=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
    if(!isStudentLeaveDate(taipei))return false;
    const day=new Date(taipei+'T00:00:00Z');
    if(Object.hasOwn(offsets,period)){
      day.setUTCDate(day.getUTCDate()+offsets[period]);
      const date=iso(day);
      return isStudentLeaveDate(date)?{from:date,through:date}:false;
    }
    if(/week|週|周/iu.test(period)){
      const prior=/last|上/iu.test(period)?7:0;
      day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7-prior);
      const from=iso(day);
      day.setUTCDate(day.getUTCDate()+6);
      const through=iso(day);
      return [from,through].every(isStudentLeaveDate)?{from,through}:false;
    }
    if(/month|月/iu.test(period)){
      const month=day.getUTCMonth()-(/last|上/iu.test(period)?1:0);
      const from=iso(new Date(Date.UTC(day.getUTCFullYear(),month,1)));
      const through=iso(new Date(Date.UTC(day.getUTCFullYear(),month+1,0)));
      return [from,through].every(isStudentLeaveDate)?{from,through}:false;
    }
    const year=day.getUTCFullYear()-(/last|去/iu.test(period)?1:0);
    const from=year+'-01-01',through=year+'-12-31';
    return [from,through].every(isStudentLeaveDate)?{from,through}:false;
  }
  const explicitYear=/\b(?:in|during|for)\s+((?:20\d\d|2100))\b|(?:西元|公元)?((?:20\d\d|2100))\s*年(?!度)/iu.exec(q);
  if(explicitYear){
    const year=explicitYear[1]??explicitYear[2];
    if(/20\d\d[-/]\d|\d{1,2}\s*月/u.test(q)||new Set(q.match(/\b(?:20\d\d|2100)\b/gu)).size>1)return false;
    return {from:year+'-01-01',through:year+'-12-31'};
  }
  if(/\b(?:on|in|during|last|next|this|between)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|semester|term)\b|\b(?:since|before|after|until)\s+\d{4}\b|\b\d{1,4}[/-]\d{1,2}\b|(?:這|这|本|上|下)(?:個|个)?學期|(?:本|上|下)(?:學|学)期|(?:20\d{2}|2100)[年/-]\d/iu.test(q))return false;
  return null;
}

function fieldsFor(parts,view){
  const selected=new Set();
  const excluded=new Set();
  for(const part of parts){
    for(const field of studentLeaveFieldNames){
      const terms=field==='status'?part.replace(/\b(?:review|approval)\s+status\b/giu,'').replace(/簽核狀態|签核状态|審核狀態|审核状态/gu,''):part;
      if(!fieldPatterns[field].test(terms))continue;
      if(negative.test(part)){selected.delete(field);excluded.add(field);}
      else {selected.add(field);excluded.delete(field);}
    }
  }
  // Generic history gives dates and saved state. Periods page gives dates and class periods.
  const defaults=view==='periods'?['dates','periods']:['dates','status'];
  if(!selected.size)for(const field of defaults)if(!excluded.has(field))selected.add(field);
  return studentLeaveFieldNames.filter(field=>selected.has(field));
}
function filterFor(parts,values,previous){
  const included=new Set(previous?.included),excluded=new Set(previous?.excluded);
  for(const part of parts){
    for(const [value,pattern] of Object.entries(values)){
      if(!pattern.test(part))continue;
      if(negative.test(part)){excluded.add(value);included.delete(value);}
      else{included.add(value);excluded.delete(value);}
    }
  }
  return {included:[...included],excluded:[...excluded]};
}

export function studentLeaveLookupContext(question,route='',history=[],now=Date.now()){
  const value=normalize(question);
  const empty={selection:null,otherQuestion:value,navigation:false,excluded:false};
  if(!value)return empty;
  const context=routeContext(route),parts=clauses(value),previous=latestUser(history);
  const explicit=parts.some(part=>leave.test(part)||savedTitle(part));
  const prior=previous&&clauses(previous).every(part=>leave.test(part)||savedTitle(part)||follow.test(part))&&(leave.test(previous)||savedTitle(previous))&&!foreignTarget(previous)&&!negative.test(previous);
  const implicit=!explicit&&Boolean(prior||!previous&&context.view)&&parts.some(part=>follow.test(part.replace(negative,''))&&!external.test(part));
  const scoped=[],other=[];
  let selected=false,excluded=false,denied=false,operation=false;
  for(const part of parts){
    const named=leave.test(part)||Boolean(savedTitle(part));
    const field=follow.test(part.replace(negative,''));
    const excludesSelected=selected&&negative.test(part)&&relativeTarget.test(part);
    if(publicTopic.test(part)&&!explicitOwnRecord.test(part)||!named&&!excludesSelected
      &&!((implicit||selected)&&field&&!external.test(part))){other.push(part);continue;}
    const foreign=foreignTarget(part);
    if(negative.test(part)){
      if(!selected)excluded=true;
      if(foreign)continue; // Excluding someone else's data does not alter the caller's read.
      if(excludesSelected||named&&!Object.values({...fieldPatterns,...categoryValues,...statusValues}).some(pattern=>pattern.test(part))){
        scoped.length=0;selected=false;excluded=true;denied=false;operation=false;
      }else if(selected||implicit)scoped.push(part);
      continue;
    }
    if(foreign){denied=true;continue;}
    selected=true;
    excluded=false;
    operation ||= command.test(part);
    scoped.push(part);
  }
  const companion=part=>!(selected&&command.test(part)&&relativeTarget.test(part));
  const otherQuestion=other.filter(companion).join('. ');
  if(!selected&&!denied)return {...empty,otherQuestion,excluded};
  const active=scoped.filter(part=>!negative.test(part)).join('. ');
  const titles=[...new Set(scoped.filter(part=>!negative.test(part)).map(savedTitle).filter(Boolean))];
  const nav=Boolean(active)&&scoped.every(part=>navigation.test(part))&&!denied;
  if(nav)return {...empty,otherQuestion,navigation:true};
  const previousSelection=implicit&&prior?studentLeaveLookupContext(previous,route,[],now).selection:null;
  const title=titles.length===1?titles[0]:previousSelection?.title??null;
  const explicitScope=archive.test(active)?'archive':periodView.test(active)?'periods'
    :/\b(?:full|all|every|history|leaves|forms|records|requests)\b|全部|所有|每[張张筆笔]/iu.test(active)?'history':null;
  let view=explicitScope??previousSelection?.view??context.view??'history',id=null;
  const ids=[...new Set(active.match(/(?<![A-Za-z0-9-])[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?![A-Za-z0-9-])/giu)?.map(id=>id.toLowerCase())??[])];
  const malformedId=/\b(?:leave|record|request|form)\s+(?:id|number|#)\s*[:#]?\s*[a-z0-9-]+|(?:假單|假单)(?:編號|编号)\s*[:：#]?\s*[a-z0-9-]+/iu.test(active)&&!ids.length;
  const explicitExact=ids.length>0||exactView.test(active);
  if(ids.length===1){view='record';id=ids[0];}
  else if(context.view==='record'&&(!explicitScope||explicitExact)){view='record';id=context.id;}
  else if(view==='record')id=previousSelection?.id??null;
  // A specific date is resolved here, before queries, and checked again against returned rows.
  let range=false;
  if(Number.isFinite(now)&&Number.isFinite(new Date(now).getTime()))
    range=rangeFor(active,now)??previousSelection?.range??null;
  const filters={categories:filterFor(scoped,categoryValues,previousSelection?.filters.categories),
    statuses:filterFor(scoped,statusValues,previousSelection?.filters.statuses)};
  const unavailableSubset=/\b(?:approved|rejected|pending|resolved|under review)\s+(?:(?:sick|personal|bereavement|nursing|maternity|menstrual|official duty|mental health)\s+)?leaves?\b|(?:已核准|未核准|已駁回|已驳回|簽核中|签核中)(?:的)?假[單单]/iu.test(active);
  const coordinatedCategory=/\b(?:sick|personal|bereavement|nursing|maternity|menstrual|official duty|mental health)\s+(?:or|and)\s+(?:sick|personal|bereavement|nursing|maternity|menstrual|official duty|mental health)\s+leaves?\b/iu.test(active);
  const reason=!context.valid?'invalid_route'
    :!selected&&denied?'foreign_request'
      :operation||other.some(part=>!companion(part))?'unsupported_operation'
        :linkedAttendance.test(active)?'requires_attendance_source'
          :unavailableSubset||unavailableField.test(active)&&!Object.values(fieldPatterns).some(pattern=>pattern.test(active))?'unsupported_field'
          :ids.length>1||titles.length>1||malformedId||explicitExact&&!id||range===false||previousSelection?.reason||coordinatedCategory
            ||context.view==='record'&&(ids.length===1&&exactView.test(active)&&id!==context.id||previousSelection?.id&&previousSelection.id!==context.id)
            ?'ambiguous_selector':null;
  const countRequest=/\b(?:how many|count (?:my|the|saved|leave)|number of .{0,15}(?:leave|requests?))\b|(?:幾|几|多少)(?:筆|笔|張|张)|請假(?:筆數|笔数|次數|次数)/iu;
  const countOnly=countRequest.test(active)
    &&!/\b(?:and|also)\s+(?:show|list|give|dates?|status|periods?|types?)\b|以及|還有|还有/iu.test(active)
    &&!scoped.some(part=>!negative.test(part)&&!countRequest.test(part)&&Object.values(fieldPatterns).some(pattern=>pattern.test(part)));
  const fields=reason||countOnly?[]:fieldsFor(scoped,view);
  if(title&&!reason&&!countOnly){
    if(!scoped.some(part=>negative.test(part)&&fieldPatterns.title.test(part)))fields.unshift('title');
    if(fields.includes('status')&&!fields.includes('reviewStatus')&&!scoped.some(part=>negative.test(part)&&fieldPatterns.reviewStatus.test(part)))fields.push('reviewStatus');
  }
  if(!fields.length&&!countOnly&&!reason)return {...empty,otherQuestion,excluded:true};
  const selection={from:explicit?'question':prior?'history':'route',question:active,view,id,range:range||null,
    filters,fields:[...new Set(fields)],countOnly,reason,...(title?{title}:{})};
  return {selection,otherQuestion,navigation:false,excluded:false,foreign:denied};
}

export function isStudentLeaveEvidenceQuestion(question,route='',history=[]){
  const context=studentLeaveLookupContext(question,route,history);
  return Boolean(context.selection||context.excluded);
}

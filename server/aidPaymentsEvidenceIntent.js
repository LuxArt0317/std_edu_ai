import {aidPaymentsPaths,aidPaymentsMaxPage} from './aidPaymentsContract.js';

// Shared browser/server selection only: no transport, credentials or Node APIs.
const views=['claims','salary'];
const validPage=value=>typeof value==='string'&&/^[1-9][0-9]*$/u.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)<=aidPaymentsMaxPage;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const data=value=>plain(value)&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const boundedText=value=>typeof value==='string'&&value.length<=12000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))?value.normalize('NFKC').trim():'';
const unrelated=/\b(?:tuition|fees?|balance|(?:disadvantaged\s+)?student aid application|financial aid application|scholarships?|loan|grades?|next class|classes|timetable|courses?|assignments?|housing|dormitory|leave|attendance|wifi|library|student profile|basic information)\b|學費|学费|弱勢助學|弱势助学|助學金申請|助学金申请|獎學金|奖学金|貸款|贷款|成績|成绩|課程|课程|作業|作业|宿舍|請假|请假|下一堂|下堂|課表|课表|基本資料/iu;
const followup=/\b(?:it|this|that|these|those|records?|amount|total|count|status|progress|net|gross|tax|deductions?|periods?|approval|pay|page|rate|units?|amounts?|claims?|payments?)\b|這|这|該|该|紀錄|記錄|记录|金額|金额|筆數|淨額|净额|稅|税|狀態|状态|給付起迄日|给付起迄日|請領金額|请领金额|給付淨額|给付净额|頁|页/iu;
const salaryTopic=/\b(?:salary|payroll|work[- ]study pay|campus job pay)\b|薪資|薪资|工讀給付|工读给付/iu;
const claimsTopic=/\b(?:student aid|financial aid)\s+(?:payments?|claims?)\b|助學金請款|助学金请款|請款查詢|请款查询|學生助學金查詢|学生助学金查询/iu;
const concept=/^(?:what (?:is|are)|define|explain)\s+(?:(?:a|the)\s+)?(?:student|work[- ]study|campus job|financial aid|student aid)\s+(?:payroll|salary|pay|payments?|claims?)\s*[?.!]*$/iu;
function routeContext(route){
  if(route===undefined||route==='')return {path:'',view:null,page:1,reason:null};
  if(typeof route!=='string'||route.length>3100||route.includes('\\')||/[\p{Cc}\s]/u.test(route)
    ||/(?:^|\/)(?:\.|%2e)(?:\.|%2e)?(?:\/|[?#]|$)/iu.test(route))return null;
  try{const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||url.hash)return null;
    for(const [key,value] of url.searchParams){
      if(/^(?:user(?:_?id)?|owner(?:_?id)?|student(?:_?id|_?number)?|account(?:_?id)?|authorization|access_?token|token)$/iu.test(key.normalize('NFKC'))
        ||/[\p{Cc}]/u.test(key+value))return null;
    }
    const path=url.pathname.replace(/\/+$/u,'')||'/',view=views.find(name=>aidPaymentsPaths[name]===path)??null;
    const pages=view?url.searchParams.getAll('page'):[];
    const reason=pages.length>1?'ambiguous_page':pages.length&&!validPage(pages[0])?'invalid_page':null;
    return {path,view,page:pages.length&&!reason?Number(pages[0]):1,reason};
  }catch{return null;}
}
function latestUser(history){
  if(!Array.isArray(history))return '';
  for(let index=history.length-1;index>=Math.max(0,history.length-24);index--){
    const item=Object.getOwnPropertyDescriptor(history,String(index))?.value;
    if(data(item)&&item.role==='user')return boundedText(item.content);
  }
  return '';
}
function foreignSubject(value){
  const text=value.replace(/獎助金薪資查詢|奖助金薪资查询|學生兼任助理薪資|学生兼任助理薪资|薪資查詢作業|薪资查询作业/gu,'薪資').replace(/(?:payment periods?|給付起迄日|给付起迄日|給付期間|给付期间)\s*[:=]?\s*["“][^"”\r\n]{1,160}["”]/giu,'payment period').replace(/\b(?:what|when|where|how|who|it|that|there|here|which)['’]s\b/giu,'');
  if(/\b(?:another|other)\s+(?:student|person|user|account)|\b(?:their|his|her)\s+(?:(?:saved|recorded|student|financial|aid)\s+)*(?:salary|payroll|aid|claims?|records?)|\bmy\s+(?:friend|classmate|roommate|sister|brother|mother|father|parent|colleague)\b|\b(?!student\b|school\b|university\b)[\p{L}][\p{L}\p{N}_’-]*['’]s\b|別人|他人|其他(?:學生|学生)|同學的|同学的|(?:他|她|他們|她們)的/iu.test(text))return true;
  if(/\b(?:student|user|account)(?:\s+(?:id|number))?\s*[:=#]?\s+(?=[\p{L}\p{N}_-]*\p{N})[\p{L}\p{N}][\p{L}\p{N}_-]*\b/iu.test(text))return true;
  if(/\b(?:does|did|has|have|is|was|can)\s+(?!(?:i|my|the|a|this|that|it|there|student|any|no|each)\b)[\p{L}][\p{L}\p{N}_’-]*(?:\s+[\p{L}][\p{L}\p{N}_’-]*)?\s+(?:have|has|receive|received|get|got|save|saved|own|access|a|any)\b/iu.test(text))return true;
  if(/\b(?:for|of|belong(?:s|ing)? to|recorded for|saved for)\s+(?!(?:me|my|mine|the|a|our|these|those|this|that|current|last|previous|next|each|every|academic|school|semester|term|year|salary|payroll|aid|claims?|records?|payments?|status|amount|net|gross|tax|deductions?|periods?|january|february|march|april|may|june|july|august|september|october|november|december)\b)[\p{L}][\p{L}\p{N}_’-]*\b|\b(?:for|of)\s+\d{5,}\b/iu.test(text))return true;
  for(const match of text.matchAll(/([\p{Script=Han}]{1,24})(?:的)?\s*(?:工讀薪資|工读薪资|學生薪資|学生薪资|薪資|薪资|助學金請款|助学金请款|請款紀錄|请款记录)/gu)){
    const owner=match[1].replace(/^(?:哪裡|哪里|在哪裡|在哪里|哪邊|哪边)(?:可以|能)?(?:查詢|查询|查看|找到|開啟|开启)?/u,'').replace(/^(?:但是|而是|還有|还有|以及|並且|并且)/u,'').replace(/^(?:(?:請|请)?(?:顯示|显示|查詢|查询|列出|告訴我|告诉我|讀取|读取|看看|給我看)|請|请|不要|不顯示|不显示|排除|不用)/u,'').replace(/(?:工讀|工读|學生|学生)$/u,'').replace(/的$/u,'');
    if(owner&&!/^(?:我|我本人|我自己|本人|自己|學生|学生|工讀|工读)$/u.test(owner))return true;
  }
  for(const match of text.matchAll(/([\p{Script=Han}]{1,24}|[A-Za-z][A-Za-z0-9_-]*)的(?:已儲存|已储存|已保存)?(?:紀錄|記錄|记录|狀態|状态|所得稅|所得税|請款|请款)/gu)){
    const owner=match[1].replace(/^(?:(?:請|请)?(?:顯示|显示|查詢|查询|列出|告訴我|告诉我|讀取|读取|看看|給我看)|請|请)/u,'');
    if(owner&&!/^(?:我|我本人|我自己|本人|自己|這|这|這些|这些|所有|全部|目前|本頁|本页)$/u.test(owner))return true;
  }
  return /(?:學生|学生|帳號|账号|學號|学号)\s*[:：#]?\s*[A-Za-z0-9_-]*[0-9][A-Za-z0-9_-]*\s*(?:的)?(?:工讀|工读|學生|学生)?(?:薪資|薪资|請款|请款)/u.test(text);
}
function excluded(question,index){
  const prefix=question.slice(0,index).replace(/[.;!?。；！？]+$/u,'').split(/[.;!?。；！？]|\b(?:but|instead)\b|但是|而是|但|[,，](?=\s*(?:show|list|include|read|retrieve|fetch)\b)/iu).at(-1).replace(/\bnot only\b/giu,'');
  return /\b(?:do not|don['’]t|never)\s+(?:show|list|include|read|retrieve|fetch)\b|\b(?:exclude|excluding|omit|skip|without)\b|\bnot\s+(?:(?:my|the|any|saved|recorded)\s*)?$|不要|不顯示|不显示|排除|不用/iu.test(prefix);
}
function explicitViews(question){
  const patterns={
    salary:/獎助金薪資查詢|奖助金薪资查询|學生兼任助理薪資|学生兼任助理薪资|薪資查詢作業|薪资查询作业|學生薪資|学生薪资|工讀薪資|工读薪资|工讀給付|工读给付|我的薪資|我的薪资|\b(?:(?:student|work[- ]study|campus job)\s+(?:payroll|salary|pay)|(?:my|saved|recorded)\s+(?:salary|payroll))\b/giu,
    claims:/學生助學金查詢|学生助学金查询|助學金請款|助学金请款|請款查詢|请款查询|\b(?:student aid|financial aid)\s+(?:payments?|claims?)\b/giu,
  };
  const matches=Object.fromEntries(views.map(view=>[view,[...question.matchAll(patterns[view])]]));
  if(matches.claims.length)matches.salary.push(...question.matchAll(/\b(?:salary|payroll)\s+records?\b/giu));
  return {views:views.filter(view=>{const last=matches[view].sort((a,b)=>a.index-b.index).at(-1);return last&&!excluded(question,last.index);}),mentioned:views.some(view=>matches[view].length)};
}
function pageSelection(current,selected,context){
  const pages=Object.fromEntries(selected.map(view=>[view,context.view===view?context.page:1]));
  if(context.reason&&selected.includes(context.view))return {pages:{},reason:context.reason};
  const assigned=new Map();
  const clauses=current.split(/[;；。!?！？\n]|\.(?=\s|$)|\s+(?:and|also|but|then)\s+(?=(?:show|list|my|the (?:status|amount|details?|records?) of|do not|don['’]t|never|skip|student aid|financial aid|salary|payroll|claims?)\b)/iu).map(value=>value.trim()).filter(Boolean);
  for(const [clauseIndex,clause] of clauses.entries()){
    if(unrelated.test(clause)&&!salaryTopic.test(clause)&&!claimsTopic.test(clause))continue;
    const named=views.filter(view=>view==='salary'?salaryTopic.test(clause):claimsTopic.test(clause));
    const active=explicitViews(clause);
    if(named.length&&!named.some(view=>selected.includes(view)&&(!active.mentioned||active.views.includes(view))))continue;
    const targets=selected.filter(view=>named.includes(view));
    if(excluded(clause,clause.length)&&!targets.length)continue;
    const pageExcluded=index=>/(?:\b(?:not|except|excluding|skip|without)(?:\s+the)?\s+|(?:不要|不含|排除)\s*)$/iu.test(clause.slice(0,index));
    const relative=[...clause.matchAll(/\b(next|previous|prior|preceding)\s+page\b|下(?:一)?頁|下(?:一)?页|上(?:一)?頁|上(?:一)?页/giu)].filter(match=>!pageExcluded(match.index));
    const numbered=[...clause.matchAll(/\bpage(?:\s+(?:number|no\.?))?\s*(?:[:=#]\s*)?([^\s,;!?。；！？]+)|第\s*([^頁页\s,，。]+)\s*[頁页]/giu)]
      .filter(match=>!pageExcluded(match.index)&&!/(?:next|previous|prior|preceding|this|current|that)\s+$/iu.test(clause.slice(0,match.index)));
    if(!relative.length&&!numbered.length)continue;
    let apply=targets;
    if(!apply.length){
      if(selected.length>1)return {pages:{},reason:'ambiguous_page'};
      // Standalone page selectors bind only an adjacent aid clause, never a different collection.
      const neighbor=clauses[clauseIndex-1]??clauses[clauseIndex+1];
      if(neighbor){
        if(unrelated.test(neighbor)&&!salaryTopic.test(neighbor)&&!claimsTopic.test(neighbor))continue;
        const adjacent=explicitViews(neighbor);
        if(adjacent.mentioned&&!adjacent.views.some(view=>selected.includes(view)))continue;
        apply=selected.filter(view=>view==='salary'?salaryTopic.test(neighbor):claimsTopic.test(neighbor));
      }
      if(!apply.length&&selected.length===1)apply=selected;
    }
    if(!apply.length)return {pages:{},reason:'ambiguous_page'};
    const requested=[];
    for(const match of numbered){const raw=(match[1]??match[2]).replace(/\.$/u,'');
      if(!validPage(raw))return {pages:{},reason:'invalid_page'};requested.push(Number(raw));}
    for(const match of relative){
      if(!context.view||apply.some(view=>view!==context.view))return {pages:{},reason:'ambiguous_page'};
      const delta=/^(?:next|下)/iu.test(match[0])?1:-1;const next=context.page+delta;
      if(next<1||next>aidPaymentsMaxPage)return {pages:{},reason:'invalid_page'};requested.push(next);
    }
    if(new Set(requested).size!==1)return {pages:{},reason:'ambiguous_page'};
    for(const view of apply){if(assigned.has(view)&&assigned.get(view)!==requested[0])return {pages:{},reason:'ambiguous_page'};assigned.set(view,requested[0]);pages[view]=requested[0];}
  }
  // A named page keyword without a value is never silently replaced by page one.
  if(/\bpage\s*[?.!]*$/iu.test(current)&&!/(?:next|previous|prior|preceding|this|current|that)\s+page/iu.test(current))return {pages:{},reason:'invalid_page'};
  return {pages,reason:null};
}
/** View and page selectors never authorize another owner or arbitrary query. */
export function selectAidPaymentsEvidence(question,route='',history=[]){
  try{
    const current=boundedText(question),context=routeContext(route);
    if(!current||!context||foreignSubject(current)||concept.test(current)||aidPaymentsNavigation(current))return null;
    const explicit=explicitViews(current);let selected=[],from='question';
    if(explicit.mentioned){if(!explicit.views.length)return null;selected=explicit.views;}
    else{
      if(unrelated.test(current)||!followup.test(current)||excluded(current,current.length))return null;
      const previous=latestUser(history);
      if(previous){
        if(foreignSubject(previous)||concept.test(previous)||unrelated.test(previous))return null;
        selected=explicitViews(previous).views;if(!selected.length)return null;from='history';
      }else{if(!context.view)return null;selected=[context.view];from='route';}
    }
    return {views:selected,question:current,...pageSelection(current,selected,context),from};
  }catch{return null;}
}
export function isAidPaymentsEvidenceQuestion(question,route='',history=[]){return selectAidPaymentsEvidence(question,route,history)!==null;}
export function isForeignAidPaymentsQuestion(question,route='',history=[]){
  try{
    const current=boundedText(question),context=routeContext(route);if(!current||!context)return false;
    const direct=salaryTopic.test(current)||claimsTopic.test(current),dependent=!unrelated.test(current)&&followup.test(current);
    if(foreignSubject(current))return direct||Boolean(context.view&&dependent)||Boolean(dependent&&(salaryTopic.test(latestUser(history))||claimsTopic.test(latestUser(history))));
    const previous=latestUser(history);
    return Boolean(dependent&&!explicitViews(current).mentioned&&previous&&foreignSubject(previous)&&(salaryTopic.test(previous)||claimsTopic.test(previous)));
  }catch{return false;}
}

/** Keeps independent personal/public clauses out of native financial projection.
 * The caller still verifies the complete original question against every source. */
export function aidPaymentsLookupContext(question,route='',history=[]){
  const current=boundedText(question),selection=selectAidPaymentsEvidence(current,route,history);
  const foreign=isForeignAidPaymentsQuestion(current,route,history);
  const clauses=current.split(/[;；。!?！？\n]|\.(?=\s|$)|[,，]\s*(?=(?:show|list|what|when|how|do not|don['’]t)\b)|\s+(?:and|also|but|then|plus)\s+(?=(?:my|the (?:status|amount|details?|records?) of|show|list|what|which|when|how|do not|don['’]t|never|skip|tuition|fees?|next class|courses?|assignments?|housing|grades?|library)\b)|但是|還有|还有|以及/iu).map(value=>value.trim()).filter(Boolean);
  const own=[],other=[];let excludedView=false;
  for(const clause of clauses){
    const direct=explicitViews(clause),aidTopic=salaryTopic.test(clause)||claimsTopic.test(clause);
    if(unrelated.test(clause)&&!aidTopic){other.push(clause);continue;}
    if(direct.mentioned&&!direct.views.length){excludedView=true;continue;}
    if(direct.mentioned&&selection&&!direct.views.some(view=>selection.views.includes(view)))continue;
    if(aidTopic||selection&&followup.test(clause)){own.push(clause);continue;}
    other.push(clause);
  }
  return {selection,question:foreign||excludedView&&!selection?'':own.join('. '),otherQuestion:other.join('. '),foreign,excluded:excludedView&&!selection};
}

/** Public form navigation never requires a private read; mixed requests are not shortcuts. */
export function aidPaymentsNavigation(question){
  try{
    const current=boundedText(question);if(!current||foreignSubject(current)||unrelated.test(current))return null;
    const explicit=explicitViews(current);if(explicit.views.length!==1)return null;
    if(/\b(?:status|amount|net|gross|tax|rate|units?|periods?|approval|paid|balance|how much|how many|and|also|then|but)\b|狀態|状态|金額|金额|淨額|净额|稅|税|頁|页|多少|以及|還有|还有|並且|并且/iu.test(current))return null;
    const english=/^(?:where\s+(?:(?:can|do|should)\s+i|is|are)\s+(?:(?:see|find|check|view|open|access)\s+)?|(?:show|give)\s+me\s+(?:the\s+)?link\s+(?:to|for)\s+)(?:(?:my|the|saved|local)\s+)*(?:(?:student|work[- ]study|campus job)\s+(?:salary|payroll|pay)|(?:student aid|financial aid)\s+(?:claims?|payments?)|salary|payroll)(?:\s+(?:records?|form|link|system|page))?(?:\s+(?:on|in)\s+stu\.best)?\s*[?.!]*$/iu.test(current);
    const chinese=/^(?:哪裡|哪里|在哪裡|在哪里|哪邊|哪边)(?:可以|能)?(?:查詢|查询|查看|找到|開啟|开启)?(?:我的|我|本人的)?(?:獎助金薪資查詢|奖助金薪资查询|學生兼任助理薪資|学生兼任助理薪资|薪資查詢作業|薪资查询作业|學生薪資|学生薪资|工讀薪資|工读薪资|薪資|薪资|學生助學金查詢|学生助学金查询|助學金請款|助学金请款|請款查詢|请款查询)(?:紀錄|記錄|记录|系統|系统|連結|链接)?[?？。!！]*$/u.test(current);
    return english||chinese?explicit.views[0]:null;
  }catch{return null;}
}
export function isAidPaymentsScopeQuestion(question,route='',history=[]){
  const context=aidPaymentsLookupContext(question,route,history);
  return Boolean(context.selection||context.foreign||context.excluded||aidPaymentsNavigation(question));
}

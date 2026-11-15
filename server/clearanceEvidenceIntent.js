import {clearancePaths} from './graduationClearanceContract.js';

const paths=Object.values(clearancePaths);
const topic=/\bgraduation clearance\b|畢業離校|毕业离校|離校(?:申請|手續|審核|紀錄)|离校(?:申请|手续|审核|记录)/iu;
const other=/\b(?:tuition|fees?|balance|grades?|courses?|next class|timetable|assignments?|counseling|health|enrollment certificate)\b|學費|余额|餘額|成績|課程|下.*課|課表|作業|諮商|健檢|在學證明/iu;
const negative=/^(?:(?:please|also|then)\s+)*(?:do not|don['’]t|never|not(?!\s+only)|without|excluding|except)\b|^(?:請|请)?(?:不要|不顯示|不显示|排除|不含)/iu;
const parts=value=>value.split(/[;；。!?！？\n,，]|\.(?:\s+|$)|\s+(?:also|but)\s+|\s+and\s+(?=(?:show|list|read|check|tell|what|when|where|how|my|never|do not|don['’]t|submit|cancel|change|approve|cashier|library|academic|department|career|advisor|thesis|international|the|its|their)\b)|(?<!\bdo)\s+(?=(?:not(?!\s+only)|without|excluding|except)\b)|但是|還有|(?=排除|不含)/iu).map(value=>value.trim()).filter(Boolean);
const text=value=>typeof value==='string'&&value.length<=12000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))?value.normalize('NFKC').trim():'';
const ownChinese=value=>/^(?:我(?:本人|自己)?|本人|自己)$/u.test(value.replace(/^(?:請|请|麻煩|麻烦|幫我|帮我|替我|可以|能否|我想|我要|顯示|显示|查看|查詢|查询|列出|檢查|检查|提供|看看|給我|给我)+/u,''));
const foreign=input=>{
  const value=input.replace(/\bmy\s+(graduation clearance(?:\s+application)?|clearance (?:application|record))['’]s\b/giu,'my $1')
    .replace(/\b(cashier|library|department|advisor|office|academic affairs|career center)['’]s\s+(?=(?:saved\s+)?(?:notes?|remarks?|status|decision|review)\b)/giu,'$1 ');
  return /\b(?:another|other) (?:student|account|person)\b|\bmy (?:friend|classmate|sister|brother|mother|father|parent|roommate|colleague)\b|\b(?:his|her|their)\s+(?:(?:saved|own|graduation|clearance|application)\s+){0,4}(?:records?|status|applications?|reviews?|notes?)\b|\b(?!(?:what|where|when|how|who|it|that|there|here|student|school|university)['’]s\b)[\p{L}][\p{L}’-]*['’]s\b|別人|他人|其他學生|(?:他|她|他們|她們)的/iu.test(value)
  ||/\b(?:graduation clearance|clearance (?:status|application|records?))(?:\s+(?:is|was|available|saved|submitted|recorded)){0,3}\s+(?:for|of|belonging to|by)\s+(?!(?:me|my|this|that|the|graduation|clearance)\b)[\p{L}][\p{L}’-]*\b/iu.test(value)
  ||/\b(?:show|list|read|check)\s+(?:me\s+)?(?!(?:my|our|the|these|those|saved|all|any|some|current|recent|previous|first|last|latest|local|recorded|own)\b)[\p{L}][\p{L}’-]*\s+graduation clearance\b/iu.test(value)
  ||[...value.matchAll(/([\p{Script=Han}]{1,20})的\s*(?:畢業離校|毕业离校|離校|离校)/gu)].some(match=>!ownChinese(match[1]))
  ||[...value.matchAll(/(?:^|[\s，,。])(?:請|请)?(?:顯示|显示|查看|查詢|查询|查|列出|提供)([\p{Script=Han}]{1,20}?)(?:畢業離校|毕业离校|離校|离校)/gu)].some(match=>
    !/^(?:(?:我(?:本人|自己)?|本人|自己)的?)?(?:目前|最近|最新|上次|所有|全部|學生|学生|已儲存|已保存)*$/u.test(match[1]));
};
const guide=value=>/\bwhere (?:can|do|should) i (?:find|open|view|apply)|\bhow (?:can|do) i (?:find|open|access|apply)|\b(?:give|show|send) me (?:the |a )?link|\b(?:what is|explain) graduation clearance\b|在哪|哪個(?:頁面|連結)|如何(?:開啟|進入|申請)|給我.*連結/iu.test(value);
const inquiry=/\b(?:my|our|for me|show|list|check|read|saved|recorded|status|history|note|notes|pending|review|offices?|when|window|period|submit|cancel|download|print)\b|我|本人|顯示|显示|查看|查詢|查询|列出|狀態|紀錄|說明|備註|審核|期間|申請/iu;
const note=/\b(?:notes?|remarks?|comments?|reason|reasons|explanation|explain why)\b|備註|备注|說明|说明|原因/iu;
const operation=value=>/(?:^(?:(?:please|then|also)\s+)*|\b(?:please|can you|could you|i want (?:you )?to|help me)\s+)(?:submit|cancel|approve|reject|clear|delete|edit|change|remove|create|update)\b|(?:請|请)?(?:取消|刪除|修改|更改|提交|送出|核准|駁回|批准|新增|更新)/iu.test(value);
const field=value=>/^(?:(?:show|list|read|include|tell me|explain|its|their|my|the|saved|recorded|office|each|all|cashier|library|academic|department|career|advisor|thesis|international)\s+)*(?:notes?|remarks?|comments?|status(?:es)?|reviews?|review dates?|submitted date|application date|windows?|periods?|why it needs action)(?:\s+(?:too|separately|for me|from each office))?$/iu.test(value)
  ||/^(?:請|请)?(?:顯示|显示|包含|說明|说明)?(?:我的|各單位|出納組|圖書館)?(?:備註|說明|狀態|審核時間|申請時間)$/u.test(value);
const continuation=value=>field(value)||operation(value)&&/\b(?:it|them|application|review|status)\b|申請|審核|狀態/u.test(value);
const follow=/^(?:(?:and|also|then)\s+)?(?:(?:what|how) (?:about|is|are) (?:my |the |its |their )?(?:status|note|notes|review|reviews|date|window|period)|(?:show|list|read|check)(?: me)?\s+(?:(?:my|the|these|those|saved)\s+)*(?:applications?|reviews?|notes?|status|periods?)|when (?:is|was) (?:it|my application))[?.!]*$|^(?:查看|顯示|查詢)?(?:我的|這個|它的)?(?:紀錄|狀態|備註|說明|時間|期間)(?:呢)?[？。！]*$/iu;
const officePatterns={library:/\blibrary(?!\s+thesis)(?: circulation)?\b|圖書館典閱|图书馆典阅|圖書館(?!論文)|图书馆(?!论文)/iu,
  academic:/\bacademic affairs\b|教務處|教务处/iu,department:/\bdepartment\b|系所/iu,cashier:/\bcashier\b|出納|出纳/iu,
  career:/\bcareer(?: and alumni)?\b|職涯|职涯|校友/iu,advisor:/\badvisor\b|指導教授|指导教授/iu,
  thesis:/\bthesis\b|論文審核|论文审核/iu,international:/\binternational(?: and housing)?\b|僑外陸生|侨外陆生|境外生/iu};
function routeContext(route){
  if(route===undefined||route==='')return {valid:true,selected:false};
  if(typeof route!=='string'||route.length>3100||/[\p{Cc}\p{Cs}\s\\#]/u.test(route)||route.startsWith('//')||/%(?:2e|2f|5c)|\/(?:\.|\.\.)(?:\/|$|\?)/iu.test(route))return {valid:false};
  try{const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||!route.startsWith('/')&&!route.startsWith('https://stu.best/'))return {valid:false};
    const selected=paths.includes(url.pathname.replace(/\/$/u,''));
    if(selected&&url.search||[...url.searchParams.keys()].some(key=>/^(?:user_?id|owner|token|view)$/iu.test(key)))return {valid:false};
    return {valid:true,selected};
  }catch{return {valid:false};}
}
/** Read-only saved clearance fields; no route, history or other clause grants note access. */
export function selectClearanceEvidence(question,route='',history=[]){
  const current=text(question);if(!current)return null;
  const context=routeContext(route),segments=parts(current),explicit=segments.filter(part=>topic.test(part)&&inquiry.test(part)&&!guide(part)&&!negative.test(part));
  const previous=Array.isArray(history)?text(history.slice(-6).findLast(item=>item?.role==='user'&&typeof item.content==='string')?.content):'';
  const past=parts(previous).filter(part=>topic.test(part)&&inquiry.test(part)&&!guide(part)&&!negative.test(part));
  const contextual=!explicit.length&&follow.test(current)&&!other.test(current)&&!negative.test(current)
    &&!(previous&&other.test(previous)&&!past.length)&&(context.selected||past.length>0&&!past.some(foreign));
  if(!explicit.length&&!contextual)return null;
  const indices=new Set(explicit.map(part=>segments.indexOf(part)));
  for(const index of [...indices])for(let cursor=index+1;segments[cursor]&&isClearanceFieldClause(segments[cursor]);cursor++)indices.add(cursor);
  const selected=explicit.length?segments.filter((_,index)=>indices.has(index)).join('\n'):current;
  const findOffices=value=>Object.entries(officePatterns).filter(([,pattern])=>pattern.test(value)).map(([key])=>key);
  const selectedParts=parts(selected),officeSource=contextual&&!findOffices(selected).length?past.join('\n'):selected;
  // A general status request plus a specific note request still includes every
  // office status; each note has its own stricter field allowlist below.
  const offices=explicit.some(part=>!findOffices(part).length)?[]:findOffices(officeSource);
  const noteParts=selectedParts.filter(part=>note.test(part));
  let noteOffices=noteParts.some(part=>!findOffices(part).length)?(contextual&&offices.length?offices:Object.keys(officePatterns)):[...new Set(noteParts.flatMap(findOffices))];
  const excludedNotes=segments.filter(part=>negative.test(part)&&note.test(part));
  if(excludedNotes.some(part=>!findOffices(part).length))noteOffices=[];
  else{const excluded=new Set(excludedNotes.flatMap(findOffices));noteOffices=noteOffices.filter(office=>!excluded.has(office));}
  const periodsRequested=/\b(?:windows?|periods?|opening|closing|opens?|closes?)\b|申請期間|开放|開放|截止/iu.test(selected);
  const applicationsRequested=!periodsRequested||/\b(?:application(?:s| status)?|reviews?|offices?|notes?|remarks?|comments?|history)\b|審核|備註|紀錄|說明/iu.test(selected);
  const reason=!context.valid?'invalid_route':foreign(selected)||contextual&&past.some(foreign)?'foreign_request':/\b(?:manage|manager|administrator|admin|queue|coordinator)\b|管理員|管理佇列|管理权限|管理權限/iu.test(selected)?'restricted_view':null;
  return {from:explicit.length?'question':context.selected?'route':'history',notesRequested:noteParts.length>0&&noteOffices.length>0,noteOffices,offices,periodsRequested,applicationsRequested,
    documentsRequested:/\b(?:download|print|pdf|document|certificate|official)\b|下載|列印|證書|證明|正式/iu.test(selected),operation:parts(selected).some(operation),reason};
}
export function isClearanceEvidenceQuestion(question,route='',history=[]){return selectClearanceEvidence(question,route,history)!==null;}

const exactReadWords=new Set(('a all an and any application applications are assigned at blank by can cashier career check clearance '
  +'comment comments department did display do each every for found give graduation have help i in include is it library '
  +'list may me my no note notes office offices of open opening own period periods please read record recorded records remark '
  +'remarks review reviewed reviews saved separately show status statuses submission submitted tell the time times to '
  +'view was what when window windows with without you academic affairs advisor thesis international housing alumni '
  +'exclude excluding except not also plus').split(' '));
const chineseClearanceTopic=/(?:畢業離校|毕业离校|離校(?:申請|审查|審核|紀錄)|离校(?:申请|审核|记录))/u;
const chineseReadPrefix=/請|请|麻煩|麻烦|幫我|帮我|可以|能否|顯示|显示|查看|查詢|查询|列出|檢查|检查|想知道|我(?:本人|自己)?的?|本人|自己/gu;
const chineseReadFields=/申請|申请|記錄|紀錄|记录|存檔|已儲存|已保存|有沒有|有哪些|的|與|和|及|暨|各|所有|全部|單位|单位|審核|审核|狀態|状态|進度|进度|備註|备注|說明|说明|日期|時間|时间|是否|期間|期间|是什麼|是什么|出納組|出纳组|圖書館|图书馆|教務處|教务处|系所|指導教授|指导教授|論文|论文|請|请|顯示|显示|列出|不含|排除|不需要|[。？！、，]/gu;

function exactChineseClearanceRead(value){
  const topic=chineseClearanceTopic.exec(value);
  return Boolean(topic&&!value.slice(0,topic.index).replace(chineseReadPrefix,'').trim()
    &&!value.slice(topic.index+topic[0].length).replace(chineseReadFields,'').trim());
}

export function exactClearanceVerification(question,route,history){
  const selection=selectClearanceEvidence(question,route,history);
  if(selection?.from!=='question'||selection.documentsRequested)return null;
  if(selection.reason==='restricted_view')return {selection,refusal:'restricted_view'};
  if(selection.reason)return null;
  if(selection.operation)return {selection,refusal:'unsupported_operation'};
  if(selection.applicationsRequested&&selection.periodsRequested)return null;
  // Named terms, a relative date, a quoted selector or an extra request need
  // their own resolution before a full-collection answer could answer them.
  const value=text(question).replace(/\bwhat['’]s\b/giu,'what is').replace(/([a-z])['’]s\b/giu,'$1');
  const explicitEnglish=/^(?:please\s+)?(?:(?:show|list|view|read|check|display|tell|give|what|when|do i have|can you|may i)\b)/iu.test(value);
  const eligible=exactChineseClearanceRead(value)||explicitEnglish&&/^[a-z\s,.!?;'-]+$/iu.test(value)
    &&(value.toLowerCase().match(/[a-z]+/gu)??[]).every(word=>exactReadWords.has(word));
  return eligible?{selection,refusal:null}:null;
}

export function isClearanceFieldClause(value){return Boolean(text(value))&&!other.test(value)&&!negative.test(value)&&continuation(value);}

export function clearanceNavigationView(question){
  const value=text(question);
  if(!value||!topic.test(value)||foreign(value)||negative.test(value)||other.test(value)
    ||parts(value).length!==1||/\b(?:and|also|plus)\b|以及|還有|並且/iu.test(value))return null;
  if(!guide(value)&&!/^(?:please )?(?:take me to|open) (?:the )?graduation clearance(?: (?:page|portal))?[.!?]?$/iu.test(value)
    &&!/(?:給我|請給我|連結|链接).{0,30}(?:離校|离校)|(?:離校|离校).{0,30}(?:連結|链接)/u.test(value))return null;
  const request=/\b(?:apply|submit|application form|where to file)\b|申請|申请/iu.test(value)
    &&!/\b(?:my|status|history)\b|我的|狀態|状态|紀錄|记录|進度/iu.test(value);
  return request?'apply':'status';
}

export function withoutExcludedClearanceClause(question){
  if(typeof question!=='string'||!topic.test(question))return question;
  const clauses=parts(question),positive=clauses.filter(part=>!negative.test(part)||!topic.test(part));
  return positive.length===1&&positive.length<clauses.length?positive[0]:question;
}

export function isExactClearanceNextClassQuestion(question){
  const value=text(question).replace(/^(?:(?:also|then|separately|please)\s+)+|[.!?。！？]+$/giu,'')
    .replace(/^(what|when|where)['’]s\b/iu,'$1 is');
  return /^(?:(?:what|when|where) is (?:my|the)|what do i have for my|(?:show(?: me)?|tell me(?: about)?|check) my|my) next (?:(?:school affairs|scheduled) )?class(?: (?:time|room|location))?$/iu.test(value)
    ||/^(?:請問|請顯示|告訴我)?(?:我的|我)?下一堂課(?:是什麼|幾點|在哪裡|時間|教室)?$/u.test(value);
}

export function clearanceTimetableQuestion(question,pageContext){
  if(pageContext.clearanceAndNextClass)return pageContext.otherQuestion;
  const residual=withoutExcludedClearanceClause(question);
  return residual!==question&&isExactClearanceNextClassQuestion(residual)?residual:null;
}

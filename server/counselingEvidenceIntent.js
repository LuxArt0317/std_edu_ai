const base='/school-affairs/services/29-1';
const topic=/\bcounsel(?:l)?ing\b|\bcounsel(?:l)?or\s+(?:session|therapy)\s+notes?\b|\bpsychological (?:assessment|test(?:ing)?)\b|心理(?:諮商|測驗|咨询|测验)|諮商/iu;
const other=/\b(?:tuition|fee|charges?|grades?|courses?|assignments?|health examination|student loan)\b|學費|費用|成績|課程|作業|健檢|學貸/iu;
// A charge/course title containing "Counseling" is not authorization to read
// appointments. With another named domain, require an actual appointment topic.
const trackerNote=value=>/\bcounsel(?:l)?ing\s+(?:(?:saved|tracking|tracker|service)\s+)*notes?\b/iu.test(value)
  &&!/\b(?:appointments?|history|clinical|clinic|therapy|sessions?)\b|預約|臨床|療程|會談/iu.test(value);
const nativeTopic=value=>topic.test(value)&&!trackerNote(value)&&(!other.test(value)||/\bcounsel(?:l)?ing\s+(?:appointments?|sessions?|records?|history|status|queue|access|coordinator)\b|\bpsychological (?:assessment|test(?:ing)?)\s+(?:appointments?|records?|history|status)\b|\b(?:appointments?|sessions?|records?|history|status)\s+(?:for|of|about|in)\s+(?:my\s+)?counsel(?:l)?ing\b|(?:心理)?(?:諮商|測驗|咨询|测验)(?:預約|紀錄|狀態)/iu.test(value));
const negative=/^(?:(?:also|then|please)\s+)*(?:do not|don['’]t|never|not(?!\s+only)|without|excluding|except)\b|^(?:請|请)?(?:不要|不顯示|不显示|排除|不含)/iu;
const parts=value=>value.split(/[;；。!?！？\n,，]|\.(?:\s+|$)|\s+(?:also|but)\s+|\s+and\s+(?=(?:never|do not|don['’]t|show|list|read|check|tell|cancel|book|schedule|reschedule|delete|change|upload|my|what|when|how)\b)|(?<!\bdo)\s+(?=(?:not(?!\s+only)|without|excluding|except)\b)|但是|還有|(?=排除|不含)/iu).map(value=>value.trim()).filter(Boolean);
const safeText=value=>typeof value==='string'&&value.length<=12000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))?value.normalize('NFKC').trim():'';
const ownChinese=value=>/^(?:我(?:本人|自己)?|本人|自己)$/u.test(value.replace(/^(?:請|请|麻煩|麻烦|幫我|帮我|替我|可以|能否|我想|我要|顯示|显示|查看|查詢|查询|列出|檢查|检查|提供|看看|給我|给我)+/u,''));
const foreign=input=>{
  // Interrogative contractions and an explicitly owned record's property are
  // not third-party owners. Do not strip Alice's or my friend's possessives.
  const value=input.replace(/\b(what|when|where|how|who)['’]s\b/giu,'$1 is')
    .replace(/\b(my|our)\s+(?:(?:saved|own|counseling|counselling|psychological|assessment)\s+){0,4}(appointment|request|record|session)['’]s\b/giu,'$1 $2');
  return /\b(?:another|other) (?:student|account|person)\b|\bmy (?:friend|classmate|sister|brother|mother|father|parent|roommate|colleague)\b|\b(?:his|her|their)\s+(?:(?:saved|own|counseling|counselling|counselor|counsellor|psychological|assessment)\s+){0,4}(?:appointments?|requests?|records?|sessions?|notes?|results?)\b|\b(?!(?:student|school|university)['’]s\b)[\p{L}][\p{L}’-]*['’]s\b|別人|他人|其他學生|同學的|(?:他|她|他們|她們)的/iu.test(value)
  ||/\b(?:appointments?|requests?|records?|sessions?|notes?|status)(?:\s+(?:is|are|available|scheduled|booked|requested|recorded|saved)){0,3}\s+(?:for|of|belonging to|by)\s+(?!(?:me|my|this|that|the|counseling|counselling|psychological|assessment|tomorrow|today)\b)[\p{L}][\p{L}’-]*\b/iu.test(value)
  ||/\b(?:appointments?|requests?|records?|sessions?)\s+(?:does|did|do)\s+(?!(?:i|we)\b)[\p{L}][\p{L}’-]*(?:\s+[\p{L}][\p{L}’-]*){0,3}\s+have\b/iu.test(value)
  ||/\b(?:appointments?|requests?|records?|sessions?)\s+(?:that|which)\s+(?!(?:i|we)\b)[\p{L}][\p{L}’-]*(?:\s+[\p{L}][\p{L}’-]*){0,3}\s+(?:own|owns|have|has)\b/iu.test(value)
  ||/\b(?:show|list|read|check)\s+(?:me\s+)?(?!(?:my|our|the|these|those|saved|all|any|some|current|recent|previous|first|last|latest|counseling|counselling|psychological|assessment|local|recorded|own)\b)[\p{L}][\p{L}’-]*\s+(?:counseling|counselling|psychological)\b/iu.test(value)
  ||[...value.matchAll(/([\p{Script=Han}]{1,20})的\s*(?:心理)?(?:諮商|測驗|咨询|测验)/gu)].some(match=>!ownChinese(match[1]))
  ||[...value.matchAll(/(?:^|[\s，,。])(?:請|请)?(?:顯示|显示|查看|查詢|查询|查|列出|提供)([\p{Script=Han}]{1,20})(?:心理)?(?:諮商|測驗|咨询|测验)/gu)].some(match=>
    !/^(?:(?:我(?:本人|自己)?|本人|自己)的?)?(?:目前|最近|最新|上次|本次|所有|全部|學生|学生|已儲存|已保存|這些|这些)*$/u.test(match[1]));
};
const guide=value=>/\bwhere (?:can|do|should) i (?:find|open|view|book)|\bhow (?:can|do) i (?:find|open|access|book)|\b(?:give|show|send) me (?:the |a )?link|\b(?:what is|explain) counseling\b|在哪|哪個(?:頁面|連結)|如何(?:開啟|進入|預約)|給我.*連結/iu.test(value);
const inquiry=/\b(?:my|our|for me|i have|i had|was i|show|list|check|read|recorded|saved|returned|how many|status|history|when|which|scheduled|requested|cancel|book|delete|queue|access)\b|我|本人|顯示|显示|列出|查看|查詢|查询|紀錄|狀態|預約|取消|刪除|佇列|權限/iu;
const follow=/^(?:(?:and|also|then)\s+)?(?:(?:show|list|check|read)(?: me)?\s+(?:(?:my|the|these|those|saved)\s+)*(?:appointments?|requests?|records?|status|history)|(?:what|how) (?:about|is|are) (?:my |the |its |their )?(?:status|date|time|appointments?|requests?)|when (?:is|was) (?:it|my appointment)|(?:is|was) (?:it|my appointment) (?:still )?scheduled|did i get a slot)[?.!]*$|^(?:查看|顯示|查詢)?(?:我的|這個|它的)?(?:預約|紀錄|狀態|時間|日期)(?:呢)?[？。！]*$/iu;
const field=/^(?:(?:show|list|include|tell me|its|their|my|the|saved|requested|preferred|scheduled|confirmed)\s+)*(?:dates?|times?|periods?|status|kind|service type|clinical (?:notes?|results?)|session (?:notes?|contents?)|(?:psychological )?diagnos(?:is|es)|documents?|(?:pdf )?reports?|pdf|student (?:number|name|identity)|(?:student|counselor) contact emails?|identity)(?:\s+(?:too|separately|for me))?$/iu;
const dependent=/^(?:separately from (?:my|the) (?:preferred|requested|scheduled) (?:date|time)|explain whether the saved time makes it active|is that my exact complete history|(?:show |include )?(?:the )?clinical notes or psychological diagnosis|download (?:their|its|the|my) report files|(?:tell me |explain )?their meaning)$/iu;
const operation=value=>/(?:^(?:(?:please|then|also)\s+)*|\b(?:please|can you|could you|i want (?:you )?to|help me)\s+)(?:cancel|book|schedule|reschedule|delete|erase|edit|change|remove|upload|submit|create|update)\b|(?:請|请)?(?:取消|刪除|刪掉|修改|更改|上傳|提交|新增|更新|幫我預約|替我預約)/iu.test(value);
const fieldOrOperation=value=>!negative.test(value)&&!other.test(value)&&(dependent.test(value)||value.split(/\s+and\s+/iu).every(part=>field.test(part))||operation(value)&&/\b(?:it|them|appointment|request|record|session)\b|預約|紀錄/u.test(value));
function routeContext(route){
  if(route===undefined||route==='')return {valid:true,selected:false,restricted:false};
  if(typeof route!=='string'||route.length>3100||/[\p{Cc}\p{Cs}\s\\#]/u.test(route)||route.startsWith('//')||/%(?:2e|2f|5c)|\/(?:\.|\.\.)(?:\/|$|\?)/iu.test(route))return {valid:false};
  try{const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||!route.startsWith('/')&&!route.startsWith('https://stu.best/'))return {valid:false};
    const pathname=url.pathname.replace(/\/$/u,''),selected=[base,base+'/consent',base+'/appointments',base+'/queue',base+'/access'].includes(pathname);
    if(selected&&url.search||[...url.searchParams.keys()].some(key=>/^(?:user_?id|owner|token|view)$/iu.test(key)))return {valid:false};
    return {valid:true,selected,restricted:[base+'/queue',base+'/access'].includes(pathname)};
  }catch{return {valid:false};}
}
/** Own appointment metadata only. Public counseling advice/navigation is not a private read. */
export function selectCounselingEvidence(question,route='',history=[]){
  const current=safeText(question);if(!current)return null;
  const context=routeContext(route),segments=parts(current),explicit=segments.filter(part=>nativeTopic(part)&&inquiry.test(part)&&!guide(part)&&!negative.test(part));
  const previous=Array.isArray(history)?safeText(history.slice(-6).findLast(item=>item?.role==='user'&&typeof item.content==='string')?.content):'';
  const past=parts(previous).filter(part=>nativeTopic(part)&&inquiry.test(part)&&!guide(part)&&!negative.test(part));
  const contextual=!explicit.length&&follow.test(current)&&!other.test(current)&&!negative.test(current)
    &&!(previous&&(other.test(previous)||trackerNote(previous))&&!past.length)&&(context.selected||past.length>0&&!past.some(foreign));
  if(!explicit.length&&!contextual)return null;
  const indices=new Set(explicit.map(part=>segments.indexOf(part)));
  for(const index of [...indices])for(let cursor=index+1;segments[cursor]&&fieldOrOperation(segments[cursor]);cursor++)indices.add(cursor);
  const selected=explicit.length?segments.filter((_,index)=>indices.has(index)).join('\n'):current;
  const restricted=/\b(?:queue|coordinator|administrator|admin|access|who (?:can|may) coordinate)\b|佇列|承辦人|管理員|管理權限|協調員/iu.test(selected);
  const reason=!context.valid?'invalid_route':foreign(selected)||contextual&&past.some(foreign)?'foreign_request':restricted||contextual&&context.restricted?'restricted_view':null;
  return {from:explicit.length?'question':context.selected?'route':'history',
    clinical:/\b(?:clinical|therapy notes?|session (?:notes?|contents?)|diagnos(?:is|es)|results?|what.*(?:discuss|said)|topics?|medical history)\b|臨床|診斷|結果|談話|諮商內容|病史/iu.test(selected),
    document:/\b(?:download|print|pdf|document|certificate|file)\b|下載|列印|文件|檔案|證明/iu.test(selected),
    identity:/\b(?:student (?:number|name)|identity|email|phone|contact|name|class)\b|學號|姓名|信箱|電話|身分|班級/iu.test(selected),
    operation:parts(selected).some(operation),reason};
}
export function isCounselingEvidenceQuestion(question,route='',history=[]){return selectCounselingEvidence(question,route,history)!==null;}
export function isCounselingNavigationQuestion(question){
  const current=safeText(question);return Boolean(current)&&topic.test(current)&&guide(current)&&!/^\s*(?:what is|explain)\b/iu.test(current)&&!other.test(current)&&!foreign(current)
    &&!negative.test(current)&&parts(current).length===1&&!/\b(?:and|also|plus)\b|以及|還有|並且/iu.test(current);
}
export function isOwnCounselingTrackingNoteQuestion(question){
  const current=safeText(question);
  return Boolean(current)&&trackerNote(current)&&!foreign(current)&&!negative.test(current)
    &&/\b(?:my|own)\b/iu.test(current)&&!other.test(current)&&parts(current).length===1
    &&!/\b(?:and|also|plus)\b|以及|還有|並且/iu.test(current);
}
export function isCounselingFieldClause(clause){const current=safeText(clause);return Boolean(current)&&fieldOrOperation(current);}
/** A negative counseling clause never authorizes a read; retain its sole positive fee clause. */
export function withoutExcludedCounselingClause(question){
  if(typeof question!=='string'||!topic.test(question))return question;
  const sections=parts(question),remaining=sections.filter(part=>!negative.test(part)||!topic.test(part));
  return remaining.length===1&&remaining.length<sections.length?remaining[0]:question;
}

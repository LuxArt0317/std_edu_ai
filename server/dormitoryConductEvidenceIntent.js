const topic=/\b(?:dormitory|dorm|housing|residence hall)[\s-]+(?:conduct|disciplin(?:e|ary)|rewards?(?:\s+and\s+penalt(?:y|ies))?|penalt(?:y|ies)|punishments?)\b|\b(?:conduct|disciplin(?:e|ary)|rewards?|penalt(?:y|ies))\s+(?:record\s+)?(?:in|for|at)\s+(?:my\s+|the\s+)?(?:dormitory|dorm|residence hall)\b|宿舍(?:獎懲|奖惩|操行|紀律|纪律)/iu;
const other=/\b(?:tuition|grades?|assignments?|courses?|next class|student conduct|bed|room|housing application|housing fee)\b|學費|成績|作業|課程|學生獎懲|床位|房間|住宿申請|住宿費/iu;
const foreign=/\b(?:another|other) (?:student|user|account|person)\b|\b(?:his|her|their)\s+(?:(?:saved|personal|local|own|dormitory|dorm)\s+){0,3}(?:conduct|records?|notice|status)\b|\bmy (?:friend|classmate|sister|brother|mother|father|parent|roommate|partner|colleague)\b|\b(?!(?:dormitory|dorm|school|student|university)['’]s\b)[\p{L}][\p{L}’-]*['’]s\b|\b(?:conduct|records?|notice|status) (?:of|for) (?!(?:me|my|this|that|the|dormitory|dorm)\b)[\p{L}][\p{L}’-]*\b|別人|他人|其他學生|同學的|(?:他|她|他們|她們)的/iu;
const ownChineseOwner=value=>/^(?:我(?:們|们)?(?:本人|自己)?|本人|自己)$/u.test(value.replace(
  /^(?:請|请|麻煩|麻烦|幫我|帮我|替我|可以|能否|我想|我要|顯示|显示|查看|查詢|查询|列出|檢查|检查|提供|看看|給我|给我)+/u,''));
const foreignOwner=value=>foreign.test(value)||[...value.matchAll(/([\p{Script=Han}]{1,20})的\s*宿舍(?:獎懲|奖惩|操行|紀律|纪律)/gu)]
  .some(match=>!ownChineseOwner(match[1]));
const follow=/^(?:(?:and|also|then)\s+)?(?:(?:show|check|list|read)\s+(?:me\s+)?(?:my|the|its|this|that)?\s*(?:saved\s+|recorded\s+)?(?:records?|status|result|notice)|what (?:is|was|about) (?:my|the|its|this|that)?\s*(?:status|result|record)|is (?:it|that|this) (?:empty|unknown)|what does (?:it|that|this) mean)[?.!]*$|^(?:顯示|查看|查詢)?(?:我的|目前|這個|它的)?(?:紀錄|狀態|結果|獎懲紀錄)[？。！]*$/iu;
const text=value=>typeof value==='string'&&value.length<=12000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))?value.normalize('NFKC').trim():'';
const negative=/^(?:(?:please\s+)?(?:do not|don['’]t|never)\s+(?:show|list|read|check|include)|not(?!\s+only)\b|without\b|exclude\b|excluding\b|except\b|(?:請)?不要(?:顯示|列出|查詢|包含)|排除|不含)/iu;
const clauses=value=>value.split(/[;；。!?！？\n,，]|\.(?:\s+|$)|\s+(?:also|but|and then)\s+|\s+(?=(?:not(?!\s+only)|without|excluding|except)\b)|但是|還有|(?=排除|不含)/iu).map(part=>part.trim()).filter(Boolean);
function contextRoute(route){
  if(route===undefined||route==='')return {valid:true,selected:false};
  if(typeof route!=='string'||route.length>3100||/[\p{Cc}\p{Cs}\s\\#]/u.test(route)||route.startsWith('//')
    ||/%(?:2e|2f|5c)|\/(?:\.|\.\.)(?:\/|$|\?)/iu.test(route))return {valid:false,selected:false};
  try{
    const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||!route.startsWith('/')&&!route.startsWith('https://stu.best/'))return {valid:false,selected:false};
    if([...url.searchParams.keys()].some(key=>/^(?:user(?:_?id)?|owner(?:_?id)?|token|access_token|authorization)$/iu.test(key)))return {valid:false,selected:false};
    return {valid:true,selected:url.pathname.replace(/\/$/u,'')==='/school-affairs/services/34-2'};
  }catch{return {valid:false,selected:false};}
}

/** Separate from beds, housing applications and the student's general conduct register. */
export function selectDormitoryConductEvidence(question,route='',history=[]){
  const current=text(question),context=contextRoute(route);
  if(!current)return null;
  const positive=clauses(current).filter(part=>!negative.test(part));
  const previous=Array.isArray(history)?text(history.slice(-6).findLast(item=>item?.role==='user'&&typeof item.content==='string')?.content):'';
  const explicit=positive.filter(part=>topic.test(part));
  const contextual=!explicit.length&&follow.test(current)&&!other.test(current)
    &&(context.selected||topic.test(previous)&&!foreignOwner(previous)&&!negative.test(previous));
  if(!explicit.length&&!contextual)return null;
  const selected=explicit.length?explicit.join('\n'):current;
  const reason=!context.valid?'invalid_route':foreignOwner(selected)?'foreign_request':null;
  const operation=/^(?:(?:please|can you|could you|would you|help me)\s+)*(?:delete|erase|remove|change|edit|approve|clear|submit|update)\b|\b(?:how (?:can|do) i|please) (?:delete|erase|remove|change|edit|approve|clear|submit|update)\b|刪除|刪掉|修改|核准|清除|提交|更新/iu.test(selected);
  const document=/\b(?:download|print|certificate|document|pdf|official proof)\b|下載|列印|證明|證明書|文件/iu.test(selected);
  return {from:explicit.length?'question':context.selected?'route':'history',operation,document,reason};
}
export function isDormitoryConductEvidenceQuestion(question,route='',history=[]){return selectDormitoryConductEvidence(question,route,history)!==null;}

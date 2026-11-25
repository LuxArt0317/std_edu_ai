const path='/school-affairs/services/36-1';
const topic=/\b(?:health|medical)(?:[ -]+(?:check[- ]?ups?|exam(?:ination)?s?))?[ -]+(?:records?|reports?|results?)\b|\b(?:health|medical)[ -]+(?:check[- ]?ups?|exam(?:ination)?s?)\b|健檢|健康檢查|健康检查/iu;
const other=/\b(?:tuition|grades?|assignments?|courses?|next class|counseling|counselling)\b|學費|成績|作業|課程|諮商/iu;
const negative=/^(?:(?:also|then|please)\s+)*(?:(?:do not|don['’]t|never)\s+(?:show|list|read|check|include)|not(?!\s+only)\b|without\b|excluding\b|except\b|(?:請|请)?不要|排除|不含)/iu;
const parts=value=>value.split(/[;；。!?！？\n,，]|\.(?:\s+|$)|\s+(?:also|but)\s+|\s+and\s+(?=(?:never|do not|don['’]t|what|where|when|how|show|list|check|read|tell|my|our)\b)|(?<!\bdo)\s+(?=(?:not(?!\s+only)|without|excluding|except)\b)|但是|還有|(?=排除|不含)/iu).map(v=>v.trim()).filter(Boolean);
const text=value=>typeof value==='string'&&value.length<=12000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))?value.normalize('NFKC').trim():'';
const foreign=/\b(?:another|other) (?:student|account|person)\b|\bmy (?:friend|classmate|sister|brother|mother|father|parent|roommate|colleague)\b|\b(?:his|her|their)\s+(?:(?:saved|own|health|medical|examination)\s+){0,4}(?:records?|reports?|results?)\b|\b(?!(?:student|school|university)['’]s\b)[\p{L}][\p{L}’-]*['’]s\b|\b(?:records?|reports?|results?) (?:for|of|belonging to) (?!(?:me|my|this|that|the|health|medical)\b)[\p{L}][\p{L}’-]*\b|別人|他人|其他學生|同學的|(?:他|她|他們|她們)的/iu;
const ownChinese=value=>/^(?:我(?:本人|自己)?|本人|自己)$/u.test(value.replace(/^(?:請|请|麻煩|麻烦|幫我|帮我|替我|可以|能否|我想|我要|顯示|显示|查看|查詢|查询|列出|檢查|检查|提供|看看|給我|给我)+/u,''));
const foreignOwner=value=>foreign.test(value)
  ||/\b(?:records?|reports?|results?|examinations?|exams?|check[- ]?ups?)(?:\s+(?:is|are|available|ready|recorded|saved)){0,3}\s+(?:for|of|belonging to)\s+(?!(?:me|my|this|that|the|health|medical|download|printing|viewing)\b)[\p{L}][\p{L}’-]*\b/iu.test(value)
  ||/\b(?:records?|reports?|results?)\s+(?:does|did|do)\s+(?!(?:i|we)\b)[\p{L}][\p{L}’-]*(?:\s+[\p{L}][\p{L}’-]*){0,3}\s+have\b|\b(?:records?|reports?|results?)\s+(?:that|which)\s+(?!(?:i|we)\b)[\p{L}][\p{L}’-]*(?:\s+[\p{L}][\p{L}’-]*){0,3}\s+(?:own|owns|has|have)\b/iu.test(value)
  ||/\b(?:show|list|read|check)\s+(?:me\s+)?(?!(?:my|our|the|these|those|saved|all|any|some|current|recent|previous|first|last|latest|health|medical|available|local|recorded|own)\b)[\p{L}][\p{L}’-]*\s+(?:health|medical)\b/iu.test(value)
  ||[...value.matchAll(/([\p{Script=Han}]{1,20})的\s*(?:健檢|健康檢查|健康检查)/gu)].some(match=>!ownChinese(match[1]))
  ||[...value.matchAll(/(?:^|[\s，,。])(?:請|请)?(?:顯示|显示|查看|查詢|查询|查|列出|提供)([\p{Script=Han}]{1,20})(?:健檢|健康檢查|健康检查)/gu)].some(match=>
    !/^(?:(?:我(?:本人|自己)?|本人|自己)的?)?(?:目前|最近|最新|上次|本次|所有|全部|學生|学生|已儲存|已保存|這些|这些)*$/u.test(match[1]));
const linkOnly=value=>/\b(?:student health card|where (?:can|do|should) i (?:find|open|view)|where is (?:the|my)|how (?:can|do) i (?:find|open|access)|(?:give|show|send) me (?:the |a )?link|which page|what is a health|what is a medical)\b|學生健康資料卡|学生健康资料卡|在哪(?:裡|里)?|哪個頁面|哪個連結|如何(?:開啟|開啓|進入)|給我.*連結/iu.test(value);
const inquiry=/\b(?:my|our|i have|i had|for me|show|list|check|read|recorded|saved|available|download|print|delete|edit|change|remove)\b|我|本人|顯示|显示|列出|查看|查詢|查询|下載|下载|列印/iu;
const follow=/^(?:(?:and|also|then)\s+)?(?:(?:show|check|list|read)\s+(?:me\s+)?(?:my|the|these|those)?\s*(?:saved\s+)?(?:records?|reports?|results?|page\b.*)|what (?:about|are|is)\s+(?:my|the|its)?\s*(?:reports?|results?|availability|page\b.*)|(?:is|are) (?:my|the|it|they|this|these)\s*(?:reports?\s+)?(?:available|ready)(?: for download)?|(?:next|previous) page)[?.!]*$|^(?:查看|顯示|查詢)?(?:我的|這個|它的)?(?:紀錄|報告|結果|第.*頁|下一頁|上一頁)[？。！]*$/iu;
const continuation=/^(?:(?:include|show(?: me)?|list|give me|the|its|my|any|all|available|saved|associated|their|total)\s+)*(?:examination codes?|report availability|(?:clinical|medical) (?:results?|details?)|(?:examination|exam) dates?|(?:pdf |report )?(?:documents?|files?|reports?)|(?:student |class )?(?:names?|number|label)|class|(?:record )?count|number of (?:saved )?records)(?:\s+(?:too|separately))?$/iu;
const contentFollowup=/^(?:(?:show|tell)(?: me)?\s+)?(?:(?:the|its|their)\s+)?(?:contents? of (?:it|the report)|contents?)$|^(?:tell me )?whether (?:my )?(?:blood|clinical|medical)(?: (?:test|examination))? results? (?:is|are) normal$/iu;
const reportOperation=/^(?:upload|submit|edit|change|remove|delete)\s+(?:(?:a|the|my|an|its|replacement|existing|health)\s+)*(?:examination |medical )?(?:reports?|records?|pdfs?)$/iu;

function routeContext(route){
  if(route===undefined||route==='')return {valid:true,selected:false,page:1};
  if(typeof route!=='string'||route.length>3100||/[\p{Cc}\p{Cs}\s\\#]/u.test(route)||route.startsWith('//')||/%(?:2e|2f|5c)|\/(?:\.|\.\.)(?:\/|$|\?)/iu.test(route))return {valid:false,selected:false,page:1};
  try{
    const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||!route.startsWith('/')&&!route.startsWith('https://stu.best/'))return {valid:false,selected:false,page:1};
    const selected=url.pathname.replace(/\/$/u,'')===path;
    if(!selected)return {valid:true,selected:false,page:1};
    const keys=[...url.searchParams.keys()],page=url.searchParams.get('page')??'1';
    if(keys.some(key=>key!=='page')||keys.length>1||!/^([1-9]\d{0,2})$/u.test(page)||Number(page)>201)return {valid:false,selected:true,page:1};
    return {valid:true,selected:true,page:Number(page)};
  }catch{return {valid:false,selected:false,page:1};}
}
function requestedPage(value){
  if(/\b(?:next|previous|last|first) page\b|下一頁|上一頁|最後一頁|第一页|第一頁/iu.test(value))return {reason:'invalid_selector'};
  const found=[...value.matchAll(/\bpage\s+([^\s,;?!]+)|第\s*([^\s頁页，,。]+)\s*[頁页]/giu)];
  if(!found.length)return {page:null};
  const pages=found.map(match=>(match[1]??match[2]).replace(/\.$/u,''));
  if(pages.some(page=>!/^([1-9]\d{0,2})$/u.test(page)||Number(page)>201))return {reason:'invalid_selector'};
  return new Set(pages).size===1?{page:Number(pages[0])}:{reason:'ambiguous_selector'};
}

/** Explicit saved-health metadata only; navigation and public health guidance stay outside private reads. */
export function selectHealthExaminationEvidence(question,route='',history=[]){
  const current=text(question);if(!current)return null;
  const context=routeContext(route),segments=parts(current),positive=segments.filter(part=>!negative.test(part));
  const explicit=positive.filter(part=>topic.test(part)&&inquiry.test(part)&&!linkOnly(part));
  const previous=Array.isArray(history)?text(history.slice(-6).findLast(item=>item?.role==='user'&&typeof item.content==='string')?.content):'';
  const historyParts=parts(previous).filter(part=>!negative.test(part)&&topic.test(part)&&inquiry.test(part)&&!linkOnly(part));
  const contextual=!explicit.length&&follow.test(current)&&!other.test(current)&&!linkOnly(current)&&!negative.test(current)
    &&(context.selected||historyParts.length>0&&!foreignOwner(historyParts.join('\n')));
  if(!explicit.length&&!contextual)return null;
  // A standalone page clause belongs only to its adjacent health request. A
  // selector beside another collection cannot silently change this read.
  let pageAmbiguous=false;
  const pages=explicit.length?segments.filter((part,index)=>{
    if(!isHealthExaminationPageClause(part))return false;
    const adjacent=[segments[index-1],segments[index+1]].filter(Boolean);
    if(!adjacent.some(value=>explicit.includes(value)))return false;
    if(adjacent.some(value=>!explicit.includes(value)&&!isHealthExaminationPageClause(value))){pageAmbiguous=true;return false;}
    return true;
  }):[];
  const adjacent=new Set(explicit.map(part=>segments.indexOf(part)));
  for(const index of [...adjacent])for(let cursor=index+1;segments[cursor]&&isHealthExaminationFieldClause(segments[cursor]);cursor++)adjacent.add(cursor);
  const selected=explicit.length?[...new Set([...explicit,...pages,...segments.filter((_,index)=>adjacent.has(index))])].join('\n'):current;
  const parsed=requestedPage(selected),prior=contextual&&!context.selected?requestedPage(historyParts.join('\n')):{page:null};
  const ownerText=explicit.length?explicit.join('\n'):selected;
  const reason=!context.valid?'invalid_route':foreignOwner(ownerText)||!explicit.length&&historyParts.some(foreignOwner)?'foreign_request':pageAmbiguous?'ambiguous_selector':parsed.reason??prior.reason??null;
  const page=reason?null:parsed.page??(context.selected?context.page:prior.page??1);
  return {from:explicit.length?'question':context.selected?'route':'history',page,
    clinical:/\b(?:results?|diagnos(?:is|es)|blood|cholesterol|normal|abnormal|what does.*say|contents?|exam(?:ination)? date|when.*examin)\b|結果|診斷|血|正常|異常|內容|檢查日期|健檢日期/iu.test(selected),
    document:/\b(?:download|print|pdf|document|file)\b|下載|下载|列印|文件|檔案/iu.test(selected),
    operation:/\b(?:delete|erase|edit|change|remove|upload|submit|update)\b|刪除|刪掉|修改|上傳|提交|更新/iu.test(selected),reason};
}
export function isHealthExaminationEvidenceQuestion(question,route='',history=[]){return selectHealthExaminationEvidence(question,route,history)!==null;}

export function isHealthExaminationPageClause(clause){
  return /^(?:(?:on|from|at)\s+)?page\s+\S+$|^第[^頁页]+[頁页]$/iu.test(clause);
}

export function isHealthExaminationFieldClause(clause){
  return clause.split(/\s+and\s+/iu).every(field=>continuation.test(field)||contentFollowup.test(field)||reportOperation.test(field));
}

/** Keep public navigation on the guide, while independently named questions use the planner. */
export function isHealthExaminationNavigationQuestion(question){
  const current=text(question);
  return Boolean(current)&&linkOnly(current)&&(topic.test(current)||/\bstudent health card\b|學生健康資料卡|学生健康资料卡/iu.test(current))&&!other.test(current)
    &&!/\b(?:and|plus|also)\b|以及|還有|並且/iu.test(current)&&parts(current).length===1&&!foreignOwner(current)&&!negative.test(current);
}

/** A negative-only health clause cannot authorize a read. Preserve a separate exact fee request. */
export function withoutExcludedHealthClause(question){
  if(typeof question!=='string'||!topic.test(question))return question;
  const sections=parts(question);
  const remaining=sections.filter(part=>!negative.test(part)||!topic.test(part));
  return remaining.length===1&&remaining.length<sections.length?remaining[0]:question;
}

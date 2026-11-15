const path='/school-affairs/services/28-1';
const topic=/\b(?:tutor|advis[eo]r|mentor)(?:['’]s)?\s+(?:evaluation|survey|questionnaire|feedback)\b|導師(?:評量|評價|問卷|回饋)|导师(?:评价|问卷|反馈)/iu;
const other=/\b(?:tuition|fees?|balance|next class|courses?|timetable|grades?|assignments?|counseling|health|clearance|teaching evaluation|student profile|year level|student information)\b|學費|餘額|下.*課|課表|課程|成績|作業|諮商|健檢|離校|教學評量|學生基本資料|學籍資料/iu;
const negative=/^(?:(?:please|also|then)\s+)*(?:do not|don['’]t|never|not(?!\s+only)|without|excluding|except)\b|^(?:請|请)?(?:不要|不顯示|不显示|排除|不含)/iu;
const clean=value=>typeof value==='string'&&value.length<=12000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))?value.normalize('NFKC').trim():'';
const parts=value=>value.split(/[;；。!?！？\n]|\.(?:\s+|$)|\s+(?:also|but)\s+|[,，]\s*(?=(?:then|also|show|list|read|check|tell|what|when|how|do not|don['’]t|never|not|without|excluding)\b)|\s+and\s+(?=(?:show|list|read|check|tell|what|when|how|do not|don['’]t|never|my|submit|change|delete|cancel|update)\b)|(?<!\bdo)\s+(?=(?:not(?!\s+only)|without|excluding|except)\b)|但是|還有|(?=排除|不含)/iu).map(value=>value.trim()).filter(Boolean);
const tracker=value=>/\b(?:tracking|tracker|service)\s+(?:notes?|records?|status)\b|\b(?:private|personal)\s+(?:saved\s+)?notes?\b|(?:私人|站內|本地)?(?:追蹤|追踪)(?:備註|备注|筆記|紀錄|记录)|私人筆記/iu.test(value);
const comment=value=>/\b(?:comment|comments|remark|remarks|free[- ]text|written response|what (?:did|have) i (?:write|written))\b|(?:填寫|填了|寫了|儲存|保存)的?(?:意見|建议|建議)|意見欄|評語|留言|備註|写了什么|寫了什麼/iu.test(value);
const ratings=value=>/\b(?:ratings?|scores?|answers?|responses?|questions?\s*(?:number\s*)?(?:#?\s*\d|one|two|three|four|five|six|seven|eight|nine|ten)|q\s*#?\s*\d)\b|評分|评分|分數|第?[一二三四五六七八九十\d]+題|填答內容/iu.test(value);
const guide=value=>/\bwhere (?:can|do|should) i (?:find|open|view|access|fill)|\bhow (?:can|do) i (?:find|open|access|fill|submit|complete)|\b(?:give|show|send) me (?:the |a )?link|\b(?:open|link to) (?:my |the )?(?:tutor|advis[eo]r|mentor)\s+(?:evaluation|survey|questionnaire)|在哪|哪個(?:頁面|連結)|如何(?:開啟|進入|填寫|提交)|給我.*連結/iu.test(value);
const inquiry=/\b(?:my|our|i|me|show|list|read|check|saved|recorded|submitted|status|when|what|ratings?|scores?|comment|submit|cancel|approve|download|change)\b|我|本人|顯示|显示|查看|查詢|查|列出|提交|送出|儲存|保存|評分|分數|狀態|意見/iu;
const operation=value=>/(?:^(?:(?:please|then|also)\s+)*|\b(?:can you|could you|would you|help me|i want you to)\s+)(?:submit|send|save|cancel|approve|delete|edit|change|remove|create|update|fill|rate|set)\b|(?:請|请)?(?:取消|刪除|修改|更改|提交|送出|送出|核准|批准|新增|更新|代填)/iu.test(value);
const field=value=>/^(?:(?:and|also|please|show|list|read|check|include|tell me|my|the|its|their|saved|recorded)\s+)*(?:status|submission (?:date|time)|submitted (?:date|time)|ratings?|scores?|answers?|responses?|comments?|remarks?|free[- ]text|question(?:s)?\s+.+|q\s*#?\s*\d.+|when (?:did|have) i submit(?: it)?|have i submitted(?: it)?|did i submit(?: it)?|what (?:did|have) i (?:write|written)|what about (?:its |the |my )?(?:status|comment|ratings?))(?:\s+(?:too|please|for me))?$/iu.test(value)
  ||/^(?:請|请)?(?:顯示|显示|查看|查詢|查询)?(?:我的|它的|這個|这个)?(?:狀態|状态|提交時間|提交时间|評分|评分|分數|分数|意見|評語|留言|第?[一二三四五六七八九十\d]+題)(?:呢)?$/u.test(value);
const dependent=value=>/^(?:(?:and|also|then)\s+)?(?:did it reach my (?:tutor|advisor|adviser)|(?:can|may) i download (?:a |the |my )?(?:official )?(?:receipt|certificate)|download (?:its|the|my) (?:official )?(?:receipt|certificate)|(?:was|is) it (?:approved|official|anonymous)|(?:show|include)(?: my| the| its)? (?:approval|official receipt|tutor name|student name)|what is (?:my|the) (?:tutor|advisor|adviser) name|who (?:can|will) read (?:my|the|its) (?:comment|ratings|response)|paired with question numbers|(?:what|which) (?:ratings?|scores?) (?:did|have) i (?:save|saved|give|given) (?:for|on) (?:questions?|q)\s*[\d\s,andto–#-]+)$/iu.test(value);
const follow=value=>field(value)||dependent(value)||/^(?:when (?:was|did) (?:it|i) (?:submitted|submit)(?: it)?|(?:was|is) it (?:saved|submitted)|what (?:is|was) (?:its|my|the) (?:status|comment)|what did i (?:rate|answer)(?: (?:on|for))? (?:question\s*|q)\d+|what about (?:question\s*|q)\d+)[?.!]*$/iu.test(value);
function foreign(input){
  const value=input.replace(/\b(what|when|where|how|who)['’]s\b/giu,'$1 is')
    .replace(/\bmy\s+(tutor|advisor|adviser|mentor)['’]s\s+(evaluation|survey|questionnaire)\b/giu,'my $1 $2')
    .replace(/\bmy\s+((?:tutor|advisor|adviser|mentor)\s+(?:evaluation|survey|questionnaire))['’]s\b/giu,'my $1');
  const ownChinese=word=>/^(?:我(?:本人|自己)?|本人|自己)$/u.test(word.replace(/^(?:請|请|麻煩|麻烦|幫我|帮我|替我|可以|能否|我想|我要|顯示|显示|查看|查詢|查询|列出|檢查|检查|提供|看看|給我|给我|提交|送出|修改|更改|刪除|取消)+/u,''));
  return /\b(?:another|other) (?:student|account|person)\b|\bmy (?:friend|classmate|sister|brother|mother|father|parent|colleague|roommate)\b|\b(?:his|her|their)\s+(?:(?:saved|own|tutor|advisor|adviser)\s+){0,4}(?:evaluation|survey|questionnaire|ratings?|scores?|comments?|records?)\b|\b(?!(?:student|school|university)['’]s\b)[\p{L}][\p{L}’-]*['’]s\b|別人|他人|其他學生|(?:他|她|他們|她們)的/iu.test(value)
    ||/\b(?:evaluation|survey|questionnaire|ratings?|scores?|comments?|status|records?)(?:\s+(?:is|are|was|were|available|submitted|saved|recorded)){0,3}\s+(?:for|of|belonging to|belongs? to|by)\s+(?!(?:me|my|this|that|the|tutor|advisor|adviser|questions?|q\d+)\b)[\p{L}][\p{L}’-]*\b/iu.test(value)
    ||/\b(?:did|has|does|what did)\s+(?!(?:i|we)\b)[\p{L}][\p{L}’-]*(?:\s+[\p{L}][\p{L}’-]*){0,2}\s+(?:submit|write|rate|answer|give|have|has|submitted|written|rated)\b/iu.test(value)
    ||/\b(?:show|list|read|check)\s+(?:me\s+)?(?!(?:my|our|the|these|those|saved|all|current|latest|local|recorded|own)\b)[\p{L}][\p{L}’-]*\s+(?:tutor|advisor|adviser|mentor)\s+(?:evaluation|survey|questionnaire)/iu.test(value)
    ||[...value.matchAll(/([\p{Script=Han}]{1,20})的\s*(?:導師|导师)(?:評量|評價|問卷|评价|问卷)/gu)].some(match=>!ownChinese(match[1]))
    ||[...value.matchAll(/(?:^|[\s，,。])(?:請|请)?(?:顯示|显示|查看|查詢|查询|查|列出|提供)([\p{Script=Han}]{1,20}?)(?:導師|导师)(?:評量|評價|問卷|评价|问卷)/gu)].some(match=>! /^(?:(?:我(?:本人|自己)?|本人|自己)的?)?(?:目前|最近|最新|所有|全部|已儲存|已保存)*$/u.test(match[1]));
}
function routeContext(route){
  if(route===undefined||route==='')return {valid:true,selected:false};
  if(typeof route!=='string'||route.length>3100||/[\p{Cc}\p{Cs}\s\\#]/u.test(route)||route.startsWith('//')||/%(?:2e|2f|5c)|\/(?:\.|\.\.)(?:\/|$|\?)/iu.test(route))return {valid:false};
  try{const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||!route.startsWith('/')&&!route.startsWith('https://stu.best/'))return {valid:false};
    const pathname=url.pathname.replace(/\/$/u,''),selected=pathname===path;
    if((selected||pathname===path+'/notes')&&url.search||pathname.startsWith(path+'/')&&pathname!==path+'/notes'||[...url.searchParams.keys()].some(key=>/^(?:user_?id|owner|token|view)$/iu.test(key)))return {valid:false};
    return {valid:true,selected};
  }catch{return {valid:false};}
}
const numberWords={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
function questionPositions(value){
  const found=[];let malformed=false;
  const add=raw=>{const n=Object.hasOwn(numberWords,raw.toLowerCase())?numberWords[raw.toLowerCase()]:Number(raw);
    if(!Number.isInteger(n)||n<1||n>10)malformed=true;else found.push(n);return n;};
  // Number selectors are parsed only from the tutor clause, never an adjacent
  // timetable/fee clause. A malformed explicit selector cannot become "all".
  const patterns=[/\bq(?!uestion)\s*#?\s*([\p{L}\d]+)(?:\s*[-–至到]\s*(?:q\s*)?([\p{L}\d]+))?/giu,
    /\bquestions?\b\s*(?:numbers?\b\s*)?#?\s*([\p{L}\d]+(?:\s*(?:,|and|&|to|through|[-–])\s*(?:(?:questions?|q)\b\s*)?[\p{L}\d]+)*)/giu,
    /第?([一二三四五六七八九十\d]+)(?:\s*[-–至到]\s*第?([一二三四五六七八九十\d]+))?題/gu,
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+question\b/giu];
  for(const [index,pattern]of patterns.entries())for(const match of value.matchAll(pattern)){
    if(index===1){
      const list=match[1].replace(/\b(?:questions?|q)\b\s*/giu,'').trim();
      if(/^(?:numbers?|ratings?|scores?|answers?|responses?|status|was|is|did|have|submitted)$/iu.test(list))continue;
      const range=/^([\p{L}\d]+)\s*(?:to|through|[-–])\s*([\p{L}\d]+)$/iu.exec(list);
      if(range){const a=add(range[1]),b=add(range[2]);if(a>b)malformed=true;else if(!malformed)for(let n=a;n<=b;n++)found.push(n);}
      else for(const token of list.split(/\s*(?:,|\band\b|&)\s*/iu))add(token);
    }else{const a=add(match[1]);if(match[2]){const b=add(match[2]);if(a>b)malformed=true;else if(!malformed)for(let n=a;n<=b;n++)found.push(n);}}
  }
  if(/\bq\s*#?\s*(?:[.,;!?]|$)|\bquestion\s*(?:number\s*)?#\s*(?:[.,;!?]|$)/iu.test(value))malformed=true;
  if(/\b(?:q|questions?\s*(?:numbers?\s*)?)\s*#?\s*(?:-\d|\d+\.\d)/iu.test(value))malformed=true;
  return {positions:[...new Set(found)].sort((a,b)=>a-b),malformed};
}
const unsupported=value=>/\b(?:tutor|advis[eo]r|mentor|student) (?:name|named|email|phone|identity|number)\b|\b(?:approved|approval|official|certificate|download|pdf|anonymous|semesters?|academic year|historical|questionnaire version|teacher feedback|average|mean|total score)\b|\bwhich term\b|\b(?:reach|delivered to|received by|sent to) my (?:tutor|advisor|adviser)\b|\bwho (?:can|will) (?:read|see|view)\b|導師姓名|導師電話|學號|学生姓名|學生姓名|核准|批准|官方|證明|證書|下載|歷年|往年|學期|版本|平均|總分/iu.test(value);
const finish=value=>Object.freeze({...value,positions:Object.freeze(value.positions)});

/** A native read is status/time-only unless ratings or the comment are named.
 * Generic tracker notes remain serviceRecords, never questionnaire evidence. */
export function selectTutorEvaluationEvidence(question,route='',history=[]){
  const current=clean(question);if(!current)return null;
  const context=routeContext(route),segments=parts(current);
  const native=value=>topic.test(value)&&!tracker(value)&&!negative.test(value)&&inquiry.test(value);
  const explicit=segments.map((value,index)=>({value,index})).filter(({value})=>native(value)&&!guide(value));
  const latest=Array.isArray(history)?clean(history.slice(-6).findLast(item=>item?.role==='user'&&typeof item.content==='string')?.content):'';
  const past=parts(latest).filter(native),blockedContext=Boolean(latest&&!past.length
    &&(tracker(latest)||other.test(latest)||!follow(latest.replace(/[?.!？。！]+$/u,''))));
  const fieldCurrent=current.replace(/[?.!？。！]+$/u,'');
  const contextual=!explicit.length&&follow(fieldCurrent)&&!other.test(current)&&!negative.test(current)&&!blockedContext
    &&(context.selected||past.length>0);
  const publicAnchor=segments.findIndex(value=>native(value)&&guide(value));
  const linked=publicAnchor>=0&&segments.slice(publicAnchor+1).some(isTutorEvaluationFieldClause);
  if(!explicit.length&&!contextual&&!linked)return null;
  const indices=new Set(explicit.map(row=>row.index));
  if(linked)indices.add(publicAnchor);
  for(const index of [...indices])for(let i=index+1;segments[i]&&!other.test(segments[i])&&(isTutorEvaluationFieldClause(segments[i])||negative.test(segments[i]));i++)indices.add(i);
  const selected=explicit.length||linked?segments.filter((_,index)=>indices.has(index)&&!negative.test(segments[index])).join('\n'):fieldCurrent;
  const projectable=selected.split(/\n|\s+and\s+/iu).filter(value=>!unsupported(value)).join(' and ');
  const excluded=segments.filter(value=>negative.test(value)),positionSelection=questionPositions(projectable);
  const excludedPositions=excluded.flatMap(value=>questionPositions(value).positions),excludedRatings=excluded.some(value=>ratings(value)&&!questionPositions(value).positions.length);
  const askedRatings=ratings(projectable),selectedPositions=positionSelection.positions.length?positionSelection.positions:askedRatings?Array.from({length:10},(_,i)=>i+1):[];
  const supportedClause=selected.split(/\n|\s+and\s+/iu).some(value=>!unsupported(value)&&(ratings(value)||comment(value)||/\b(?:status|submitted|submission|submit)\b|狀態|提交時間/iu.test(value)));
  const reason=!context.valid?'invalid_route':foreign(selected)||contextual&&past.some(foreign)?'foreign_request':parts(selected).some(operation)?'unsupported_operation':positionSelection.malformed?'ambiguous_selector':unsupported(selected)&&!supportedClause?'outside_scope':null;
  return finish({from:explicit.length||linked?'question':past.length?'history':'route',
    positions:reason?[]:excludedRatings?[]:selectedPositions.filter(number=>!excludedPositions.includes(number)),
    commentRequested:!reason&&comment(projectable)&&!excluded.some(comment),unavailableDetails:unsupported(selected),reason});
}
export function isTutorEvaluationEvidenceQuestion(question,route='',history=[]){return selectTutorEvaluationEvidence(question,route,history)!==null;}
/** A distinct compatibility path for own generic notes, never questionnaire
 * comments. The dedicated notes URL supplies only the service scope. */
export function isOwnTutorEvaluationTrackingNoteQuestion(question,route=''){
  const current=clean(question);if(!current||!tracker(current)||foreign(current)||negative.test(current)||operation(current)||other.test(current)
    ||parts(current).length!==1||/\b(?:and|also|plus)\b|以及|還有|並且/iu.test(current)
    ||!/\b(?:my|mine|own)\b|我的|我自己|我本人/iu.test(current))return false;
  const notes=[path+'/notes',path+'/notes/','https://stu.best'+path+'/notes','https://stu.best'+path+'/notes/'].includes(route);
  return (topic.test(current)&&routeContext(route).valid)||notes;
}
export function isTutorEvaluationFieldClause(clause){const value=clean(clause);return Boolean(value)&&!negative.test(value)&&!other.test(value)
  &&(field(value)||dependent(value)||operation(value)&&/\b(?:it|them|evaluation|survey|questionnaire|rating|comment)\b|評量|問卷|評分|意見/u.test(value));}
export function withoutExcludedTutorEvaluationClause(question){
  const value=clean(question);if(!value||!topic.test(value))return question;
  const sections=parts(value),remaining=sections.filter(part=>!negative.test(part)||!topic.test(part));
  return remaining.length===1&&remaining.length<sections.length?remaining[0].replace(/[,，]\s*$/u,'').trimEnd():question;
}
/** Pure local form navigation. It performs no read and cannot swallow a second
 * question about a private record or a different service. */
export function tutorEvaluationNavigation(question){
  const current=clean(question);return current&&topic.test(current)&&guide(current)&&parts(current).length===1
    &&!foreign(current)&&!negative.test(current)&&!tracker(current)&&!other.test(current)
    &&!/\b(?:and|also|plus)\b|以及|還有|並且/iu.test(current)?path:null;
}

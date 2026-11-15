import {teachingFeedbackPaths} from './teachingFeedbackContract.js';

const survey=/\b(?:teaching|course)\s+(?:evaluations?|surveys?|questionnaires?)\b|教學(?:成效|意見)(?:問卷(?:調查)?|问卷(?:调查)?)|教學(?:評量|评价|評價)(?:問卷(?:調查)?|问卷(?:调查)?)?|教學評估/iu;
const immediate=/\b(?:(?:immediate|real[- ]time)\s+)?teaching\s+feedback\b|即時(?:反應)?教學意見|即时(?:反应)?教学意见|教學意見反應/iu;
const weakImmediate=/\bcourse\s+feedback\b/iu;
const dtm=/\b(?:moodle|dtm|quiz|assignment|homework|gradebook)\b|作業|測驗|數位教材|教材網/iu;
const tracker=/\b(?:tracking|tracker|service|personal|private)\s+(?:saved\s+)?notes?\b|\b(?:private|personal)\b[^.!?]{0,60}\bnotes?\b|追蹤(?:備註|筆記|紀錄)|追踪(?:备注|笔记|记录)|私人筆記/iu;
const negative=/^(?:(?:please|also|then|but)\s+)*(?:do\s+not|don['’]t|never|not(?!\s+only)|without|exclude|excluding|except|skip)\b|^(?:請|请)?(?:不要|別|不顯示|不显示|排除|不含)/iu;
const comment=/\b(?:comments?|remarks?|written (?:feedback|response)|what (?:did|have) i (?:write|written)|comment text)\b|評語|留言|評論|寫了什麼|写了什么|(?:已儲存|已保存|填寫|填了)的?(?:意見|意见)|意見內容/iu;
const unsupported=/\b(?:ratings?|scores?|averages?|aggregate|anonymous answers?|survey answers?|questionnaire answers?|original (?:answers?|responses?)|official|receipt|pdf|download|teacher (?:name|email)|student (?:name|number|identity)|who (?:wrote|submitted)|other students)\b|評分|分數|平均|匿名(?:答案|填答|回覆)|原始(?:答案|填答)|官方|收據|下載|教師姓名|學生姓名|學號/iu;
const supported=/\b(?:status|state|completed|completion|submission|reviewed|review|when|open|closes?|closed|scheduled|window|period|remaining|unfinished|pending|available|have i|did i|has my|records?|history)\b|狀態|状态|填答狀態|已填答|未填答|完成|已送出|送出時間|檢閱|開放|關閉|截止|紀錄|記錄|什么时候|何時/iu;
const unscopedOutcome=/\b(?:teacher|instructor)\s+(?:has\s+)?(?:read|see|saw|says?|received|replied|changed)\b|\b(?:mean|means|imply|implies|who reviewed|prove|guarantee|deliver(?:y|ed)|resolv(?:e|ed|ution)|list only|latest|most recent|(?:since|before|after)\s+\d|this (?:week|month|semester|term)|last (?:week|month|semester|term))\b|\b\d{4}-\d{2}-\d{2}\b|(?:老師|教師).{0,8}(?:看過|閱讀|收到|回覆|改善)|送達|最新|最近|本(?:週|月|學期)|上(?:週|月|學期)/iu;
const isoFormat=/^(?:use|show|in)\s+(?:the\s+)?(?:saved\s+)?ISO\s+(?:format|timestamps?)$/iu;
// Survey responses are anonymous content, not the caller's completion metadata.
// A source adjective between "anonymous" and "responses" must not authorize a
// metadata read; nor should generic response "status/history" wording do so.
const anonymousResponses=/\banonymous(?:ly)?(?:[\s-]+[\p{L}\p{N}]+){0,8}[\s-]+(?:answers?|responses?|comments?|ratings?)\b|\b(?:answers?|responses?|comments?|ratings?)\b[^.!?\n]{0,100}\banonymous(?:ly)?\b|匿名[^。！？\n]{0,40}(?:答案|填答|回覆|回應|回答|評語|留言)/iu;
const explicitSurveyCompletion=/\b(?:completion|(?:did|have) i (?:already )?(?:complete|completed)|(?:which|my) courses? (?:are |were )?completed|(?:opening|closing|survey)\s+window)\b|(?:問卷|評量)(?:的)?(?:完成|填答狀態)|是否(?:已)?(?:完成|填答)/iu;
const navigation=/\bwhere (?:can|do|should) i (?:find|open|view|see|access|check|fill)|\bhow (?:can|do) i (?:find|open|access|fill|submit|complete)|\b(?:give|show|send) me (?:the |a )?link|\b(?:link to|open) (?:my |the )?(?:teaching|course|immediate|real[- ]time)\b|在哪|哪個(?:頁面|連結)|如何(?:開啟|進入|填寫)|給我.*連結/iu;
const operation=/^(?:(?:please|also|then)\s+)*(?:submit|send|post|publish|save|cancel|delete|edit|change|remove|create|update|fill|rate|mark|release|approve)\b|\b(?:(?:can|could|would) you|i (?:want|need) you to|help me(?: to)?)\s+(?:submit|send|post|publish|save|cancel|delete|edit|change|update|fill|rate|mark|release|approve)\b|(?:請|请)?(?:幫我|替我)?(?:取消|刪除|修改|更改|提交|送出|核准|批准|新增|更新|代填|標記已檢閱)/iu;
const independent=/\b(?:tuition|fees?|balance|payments?|next class|year level|what year|which year|housing|dormitory|scholarship|salary|counseling|health|clearance|tutor evaluation|mentor evaluation|timetable|schedule|grades?|assignments?|homework|moodle|dtm|quiz)\b|學費|餘額|下堂課|下一堂|年級|幾年|宿舍|助學|薪資|諮商|健檢|離校|導師評量|課表|成績|作業|數位教材|測驗/iu;
const clean=value=>typeof value==='string'&&value.length<=12000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))?value.normalize('NFKC').trim():'';
const latestUser=history=>Array.isArray(history)?clean(history.slice(-6).findLast(item=>item?.role==='user'&&typeof item.content==='string')?.content):'';
function masked(value){
  let quote=null;const result=value.split('');
  for(let i=0;i<value.length;i++){
    const char=value[i];
    if(quote){result[i]=' ';if(char===quote)quote=null;}
    else if(char==='"'||char==='“'||char==="'"&&(i===0||/[\s:]/u.test(value[i-1]))&&value.indexOf("'",i+1)>i+1){quote=char==='“'?'”':char;result[i]=' ';}
  }
  return result.join('');
}
function parts(value){
  // A completed/incomplete contrast is one field request, not an exclusion.
  const hidden=masked(value).replace(/\band\s+which\s+are\s+not(?:\s+completed)?(?=\s*(?:[.!?]|$))/giu,
    phrase=>' '.repeat(phrase.length)),pattern=/[;；。?!？！\n]|\.(?=\s|$)|[,，]\s*(?=(?:show|list|read|check|tell|what|when|which|how|do\s+not|don['’]t|never|not|without|excluding|then|also|my)\b)|\s+(?:and|also|plus|but|alongside)\s+(?=(?:show|list|read|check|tell|what|when|which|how|did|has|is|was|can|do\s+not|don['’]t|never|not|without|excluding|then|my|the (?:status|teaching|immediate|course)|immediate|teaching|course|submit|cancel|change|delete|mark|download)\b)|\s+(?=(?:without|excluding|except)\b)|(?<!\bdo)(?<!\s)\s+(?=not(?!\s+only)\b)|以及|還有|並且|但是|(?=排除|不含)/giu;
  const result=[];let start=0;
  for(const match of hidden.matchAll(pattern)){const part=value.slice(start,match.index).trim();if(part)result.push(part);start=match.index+match[0].length;}
  const tail=value.slice(start).trim();if(tail)result.push(tail);return result;
}
function routeScope(route){
  if(route===''||route===undefined)return {valid:true,view:null};
  if(typeof route!=='string'||route.length>3100||/[\p{Cc}\p{Cs}\s\\#]/u.test(route)||route.startsWith('//')||/%(?:2e|2f|5c)|\/(?:\.|\.\.)(?:\/|$|\?)/iu.test(route))return {valid:false,view:null};
  try{const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||!route.startsWith('/')&&!route.startsWith('https://stu.best/'))return {valid:false,view:null};
    const path=url.pathname.replace(/\/$/u,''),view=Object.keys(teachingFeedbackPaths).find(key=>teachingFeedbackPaths[key]===path)||null;
    if(view&&url.search||[...url.searchParams.keys()].some(key=>/^(?:user_?id|owner|token|view)$/iu.test(key)))return {valid:false,view};
    if(Object.values(teachingFeedbackPaths).some(base=>path.startsWith(base+'/')&&path!==base+'/notes'))return {valid:false,view};
    return {valid:true,view};
  }catch{return {valid:false,view:null};}
}
function views(value,contextual=false){
  const source=masked(value),result=[];
  if(dtm.test(source))return result;
  if(survey.test(source))result.push('survey');
  if(immediate.test(source)||contextual&&weakImmediate.test(source)&&!dtm.test(source))result.push('immediate');
  return result;
}
function foreign(value){
  const q=masked(value).replace(/\b(what|where|when|how|who)['’]s\b/giu,'$1 is')
    .replace(/\bmy\s+((?:(?:immediate|real[- ]time)\s+)?teaching\s+(?:feedback|evaluation|survey|questionnaire))['’]s\b/giu,'my $1');
  if(/\b(?:another|other)\s+(?:student|account|person)|\bmy\s+(?:friend|sister|brother|mother|father|colleague|classmate|student)\b|\b(?:his|her|their)\s+(?:(?:saved|own|teaching|immediate|course)\s+){0,4}(?:feedback|evaluation|survey|questionnaire|comments?|records?|status)\b|別人|他人|其他學生|(?:他|她|他們|她們)的/iu.test(q))return true;
  if(/\b(?!(?:student|school|university)['’]s\b)[\p{L}\p{N}_-]+['’]s\b/iu.test(q))return true;
  if(/\b(?:feedback|evaluation|survey|questionnaire|comments?|status|records?|completion)(?:\s+(?:is|are|was|were|available|submitted|saved|recorded)){0,3}\s+(?:for|of|by|to|belonging to|belongs to)\s+(?!(?:me|myself|my|this|that|the (?:current|course|survey)|course|each|all)\b)[\p{L}\p{N}_-]+/iu.test(q))return true;
  if(/\b(?:did|has|does|what did)\s+(?!(?:i|we|my\b|the\b))[\p{L}\p{N}_-]+(?:\s+[\p{L}\p{N}_-]+){0,2}\s+(?:submit|write|have|has|submitted|written|complete|completed)\b/iu.test(q))return true;
  const self=word=>/^(?:我(?:本人|自己)?|本人|自己)$/u.test(word.replace(/^(?:請|请|麻煩|幫我|替我|可以|能否|我想|我要|顯示|显示|查看|查詢|查询|列出|檢查|提供|給我)+/u,''));
  return [...q.matchAll(/([\p{Script=Han}]{1,20})的\s*(?:即時(?:反應)?教學意見|教學意見反應|教學評量|教學意見問卷)/gu)].some(match=>!self(match[1]))
    ||[...q.matchAll(/(?:^|[\s，,。])(?:請|请)?(?:顯示|显示|查看|查詢|查询|列出)([\p{Script=Han}]{1,20}?)(?:即時(?:反應)?教學意見|教學意見反應|教學評量|教學意見問卷)/gu)].some(match=>! /^(?:(?:我(?:本人|自己)?|本人|自己)的?)?(?:目前|最近|最新|所有|全部|已儲存|匿名)*$/u.test(match[1]));
}
const eligibility=/\b(?:eligible|available)\s+courses?\b|\b(?:courses? (?:are |is )?eligible|course eligibility)\b|\bwhich\s+(?:(?:of )?my\s+)?courses?\s+can\s+i\s+(?:give|leave|submit|send|provide)\b[^.!?\n]{0,60}\bfeedback\b|(?:哪些|哪幾門|所有)?課程.{0,16}(?:可以|可|能)(?:填寫|填答|提供|送出)|可(?:填寫|填答|提供|送出).{0,20}課程|適用課程/iu;
const feedbackState=/\b(?:status|review(?:ed)?|submitted|history|saved (?:feedback|records?)|when did i|did i (?:submit|send))\b|狀態|已送出|送出時間|檢閱|已儲存|紀錄/iu;

/** An eligibility list and submitted feedback are separate collections within
 * the native immediate view. Explicit requests can ask for both. */
export function teachingFeedbackImmediateFields(question){
  const clauses=parts(clean(question)).filter(part=>!negative.test(part));
  const courses=clauses.some(part=>eligibility.test(masked(part)));
  const feedback=!courses||clauses.some(part=>feedbackState.test(masked(part))||comment.test(masked(part)));
  const completeness=clauses.some(part=>/\b(?:exhaustive|complete list|all eligible courses|total|how many)\b|完整|全部|總數|多少門/iu.test(masked(part)));
  return {courses,feedback,completeness};
}

export function isTeachingFeedbackFieldClause(clause){
  const q=clean(clause);if(!q||independent.test(q)||tracker.test(q))return false;
  return /^(?:(?:and|also|then|please|show|list|read|check|include|tell me|my|the|its|their|saved|recorded)\s+)*(?:records?|history|status|state|completion|submission|submitted|reviewed|comments?|remarks?|written feedback|opening|closing|window|period|pending|unfinished|remaining|which courses? (?:remain|are)|which are not|when (?:did|was|is|will)|did i|have i|has it|was it|is it|is the list exhaustive|what (?:is|was) (?:its|my|the) (?:status|comment)|what (?:comment|comments|remarks?) did i (?:save|write)|what (?:did|have) i (?:write|written)|what about|ratings?|scores?|original answers?|anonymous (?:answers?|responses?|comments?|ratings?)|download|receipt|course (?:title|code))\b/iu.test(q)
    ||/^(?:請|请)?(?:顯示|显示|查看|查詢|查询)?(?:我的|它的|這個|这个)?(?:狀態|状态|完成|填答|提交|送出|檢閱|評語|留言|意見內容|開放|截止|評分|分數|匿名答案|課程(?:名稱|代碼))/u.test(q)
    ||operation.test(q)&&/\b(?:it|them|feedback|evaluation|survey|questionnaire|comment)\b|意見|問卷|評量/u.test(q);
}
function selectionCourse(question){
  const value=question,selected={},found=[];
  const add=(field,text)=>{const result=text.trim();if(!result||result.length>(field==='code'?80:600)||Object.hasOwn(selected,field)&&selected[field]!==result)return false;selected[field]=result;return true;};
  const quoted=/(?:\b(?:for\s+)?course(?:\s+(?:title|name))?|\bfor|課程(?:名稱|名稱為|名|名稱是)?)\s*[:：=]?\s*(?:"([^"]*)"|“([^”]*)”|'([^']*)')/giu;
  for(const match of value.matchAll(quoted)){if(!add('title',match[1]??match[2]??match[3]))return {invalid:true};found.push([match.index,match.index+match[0].length]);}
  const codes=/\b(?:for\s+)?course\s+code\s*[:=]?\s*(?:["“']([\p{L}\p{N}._-]+)["”']|([\p{L}\p{N}._-]+))|課程(?:代碼|代號)\s*[:：=]?\s*(?:["“']([\p{L}\p{N}._-]+)["”']|([\p{L}\p{N}._-]+))/giu;
  for(const match of value.matchAll(codes)){if(!add('code',match[1]??match[2]??match[3]??match[4]))return {invalid:true};found.push([match.index,match.index+match[0].length]);}
  let rest=value;for(const [start,end] of found.sort((a,b)=>b[0]-a[0]))rest=rest.slice(0,start)+' '.repeat(end-start)+rest.slice(end);
  if(/\bcourse\s+(?:title|name|code)\b|課程(?:名稱|代碼|代號)|\b(?:for|course)\s*["“']|\bfor\s+(?!(?:me|myself|each|all|this|that|the (?:current|survey)|my|immediate|teaching|real[- ]time)\b)\S+/iu.test(rest))return {invalid:true};
  return {invalid:false,...(Object.keys(selected).length?{course:Object.freeze(selected)}:{})};
}
const empty=()=>({selection:null,question:'',otherQuestion:'',foreign:false,excluded:false,navigation:[]});
const courseClause=value=>/^(?:(?:for|regarding|about)\s+)?course\s+(?!(?:feedback|evaluation|survey|questionnaire)\b)\S+|^for\s+\S+|^["“']|^課程(?:名稱|代碼|代號)?\s*["“'：:]/iu.test(value);

/** Field continuations inherit only the most recent user subject, never an
 * earlier teaching page after the user has moved to a different collection. */
export function teachingFeedbackLookupContext(question,route='',history=[]){
  const input=clean(question);if(!input)return Object.freeze(empty());
  const routeInfo=routeScope(route),latest=latestUser(history),prior=parts(latest);
  const priorState=new Set();let unrelatedPrior=false;
  for(const part of prior){
    const named=views(part);
    if(tracker.test(part))unrelatedPrior=true;
    else if(named.length)for(const view of named){if(negative.test(part))priorState.delete(view);else priorState.add(view);}
    else if(!isTeachingFeedbackFieldClause(part)&&!(negative.test(part)&&isTeachingFeedbackFieldClause(part.replace(negative,''))))unrelatedPrior=true;
  }
  const priorViews=unrelatedPrior?[]:[...priorState];
  const current=parts(input),contextView=priorViews.length===1?priorViews[0]:!latest?routeInfo.view:null;
  const weakContext=contextView==='immediate';
  const states=new Map(),nativeParts=[],otherParts=[],guides=new Set(),pending=[];let excluded=false,from='question',lastViews=[];
  for(const [index,part] of current.entries()){
    const named=views(part,weakContext||routeInfo.view==='immediate'&&!latest),isNegative=negative.test(part);
    if(tracker.test(part)){otherParts.push(part);lastViews=[];continue;}
    if(named.length){
      if(/^(?:what (?:is|are)|explain|define|tell me about)\s+(?:a |the )?/iu.test(part)&&!/\b(?:my|i|saved|status|completed|submitted|records?|history)\b/iu.test(part)&&!comment.test(part)){otherParts.push(part);lastViews=[];continue;}
      lastViews=named;
      if(isNegative){excluded=true;for(const view of named){states.delete(view);guides.delete(view);for(const row of nativeParts)row.views=row.views.filter(candidate=>candidate!==view);}continue;}
      if(navigation.test(masked(part))&&!foreign(part)&&!comment.test(part)&&!(/\b(?:my saved|submitted|completed|reviewed|status|amount)\b|已送出|已填答|狀態/u.test(part))){for(const view of named)guides.add(view);continue;}
      for(const view of named)states.set(view,true);
      for(const field of pending.splice(0))nativeParts.push({part:field,views:named});
      nativeParts.push({part,views:named});continue;
    }
    const unnegated=part.replace(negative,'').trim(),courseField=courseClause(isNegative?unnegated:part);
    const forwardView=courseField&&current.slice(index+1).some(value=>views(value).length&&!negative.test(value)&&!tracker.test(value));
    if(courseField&&!lastViews.length&&(!contextView||forwardView)&&!independent.test(part)&&!/\bmy\s+(?:current\s+)?(?:courses?|subjects?|classes)\b/iu.test(part)){pending.push(part);continue;}
    const eligibleField=eligibility.test(masked(unnegated));
    if(eligibleField&&!lastViews.length&&current.slice(index+1).some(value=>views(value).includes('immediate')&&!negative.test(value))){pending.push(part);continue;}
    const eligibleContext=eligibleField&&(lastViews.includes('immediate')||contextView==='immediate');
    const dependent=isTeachingFeedbackFieldClause(part)||courseField||eligibleContext
      ||isoFormat.test(part)&&/\b(?:when|opens?|closes?|timestamps?|submitted|reviewed)\b/iu.test(nativeParts.at(-1)?.part??'')
      ||isNegative&&isTeachingFeedbackFieldClause(unnegated);
    if(dependent&&(lastViews.length||contextView)&&!independent.test(part)){
      const inherited=lastViews.length?lastViews:[contextView];
      if(!lastViews.length)from=priorViews.length?'history':'route';
      lastViews=inherited;
      if(!isNegative)for(const view of inherited)states.set(view,true);
      nativeParts.push({part,views:inherited});continue;
    }
    otherParts.push(...pending.splice(0),part);lastViews=[];
  }
  otherParts.push(...pending);
  const requestedViews=[...states.keys()],activeRows=nativeParts.filter(row=>row.views.some(view=>states.has(view))),questionParts=activeRows.map(row=>row.part);
  // A latest explicit foreign subject cannot become the caller's record merely
  // because the next user asks for its status or saved comment.
  const nativeQuestion=questionParts.join('\n'),stoppedForeign=Boolean(requestedViews.length&&(foreign(nativeQuestion)||from==='history'&&prior.some(foreign)));
  const hasExplicit=Boolean(nativeQuestion),ownCourse=selectionCourse(nativeQuestion),inheritedCourse=from==='history'&&!ownCourse.course&&!ownCourse.invalid?selectionCourse(prior.join('\n')):null;
  const course=inheritedCourse?.course||inheritedCourse?.invalid?inheritedCourse:ownCourse;
  const excludedCourse=activeRows.some(row=>negative.test(row.part)&&courseClause(row.part.replace(negative,'').trim()));
  const positiveParts=questionParts.filter(part=>!negative.test(part));
  const commentFor=view=>activeRows.some(row=>row.views.includes(view)&&!negative.test(row.part)&&comment.test(masked(row.part)))
    &&!activeRows.some(row=>row.views.includes(view)&&negative.test(row.part)&&comment.test(row.part));
  const commentsRequested=commentFor('immediate');
  const anonymousSurveyRow=row=>row.views.includes('survey')&&anonymousResponses.test(masked(row.part));
  const unavailableDetails=positiveParts.some(part=>unsupported.test(masked(part)))||commentFor('survey')||activeRows.some(row=>!negative.test(row.part)&&anonymousSurveyRow(row));
  const support=activeRows.some(row=>!negative.test(row.part)&&supported.test(masked(row.part))&&(!anonymousSurveyRow(row)||explicitSurveyCompletion.test(masked(row.part))))||commentsRequested;
  const reason=!routeInfo.valid?'invalid_route':stoppedForeign?'foreign_request':positiveParts.some(part=>operation.test(masked(part)))?'unsupported_operation':excludedCourse||course.invalid?'ambiguous_selector':unavailableDetails&&!support?'outside_scope':null;
  const selection=hasExplicit&&requestedViews.length?Object.freeze({views:Object.freeze(reason?[]:requestedViews),requestedViews:Object.freeze(requestedViews),from,question:nativeQuestion,
    commentRequested:!reason&&requestedViews.includes('immediate')&&commentsRequested,unavailableDetails,reason,...(!reason&&course.course?{course:course.course}:{})}):null;
  return Object.freeze({selection,question:nativeQuestion,otherQuestion:otherParts.join('\n'),foreign:stoppedForeign,excluded,
    navigation:Object.freeze([...guides].filter(view=>!states.has(view)))});
}
export function selectTeachingFeedbackEvidence(question,route='',history=[]){return teachingFeedbackLookupContext(question,route,history).selection;}
export function teachingFeedbackSurveyPresentation(question){
  const text=clean(question).replace(/[.!?。！？]+$/u,'').replace(/\s+/gu,' ');
  if(!survey.test(text)||operation.test(text)||unsupported.test(masked(text)))return null;
  const compare=/^does completing ([a-z]+[a-z0-9._-]*[0-9][a-z0-9._-]*) in my midterm teaching (?:evaluation|survey|questionnaire) also mean my final (?:teaching )?(?:evaluation|survey|questionnaire) is complete$/iu.exec(text);
  if(compare&&compare[1].length<=80)return {kind:'comparison',code:compare[1]};
  const phases=[...(/\bmidterm\b|期中/iu.test(text)?['midterm']:[]),...(/\bfinal\b|期末/iu.test(text)?['final']:[])];
  if(phases.length===1&&/\bopening and closing dates?\b|開放.{0,8}截止/iu.test(text)
    &&!/\b(?:status|state|complet\w*|responses?)\b|狀態|完成|填答/iu.test(text))return {kind:'dates',phases};
  if(phases.length===1&&/\bwhich courses are completed and which are not(?: completed)?\b/iu.test(text)
    &&!/\b(?:dates?|window|state|status)\b|日期|開放|截止/iu.test(text))return {kind:'completion',phases};
  if(/\bsurvey windows are available\b|\b(?:window|opening) (?:state|status)\b|開放狀態/iu.test(text)
    &&!/(?:\b(?:dates?|complet\w*|responses?|ratings?)\b|完成|填答|日期|時間)/iu.test(text))return {kind:'state',phases};
  return null;
}
export function exactTeachingFeedbackRead(context){
  const selection=context.selection;
  const comparison=selection?.views[0]==='survey'&&teachingFeedbackSurveyPresentation(selection.question)?.kind==='comparison';
  return selection?.views.length===1&&!selection.reason&&!selection.unavailableDetails&&!context.otherQuestion
    &&!context.excluded&&!context.foreign&&!context.navigation.length&&(comparison||!unscopedOutcome.test(masked(selection.question)))
      ?selection:null;
}
export function isTeachingFeedbackEvidenceQuestion(question,route='',history=[]){return selectTeachingFeedbackEvidence(question,route,history)!==null;}
export function teachingFeedbackNavigation(question){
  const context=teachingFeedbackLookupContext(question);
  return !context.selection&&!context.foreign&&!context.excluded&&!context.otherQuestion&&context.navigation.length===1?teachingFeedbackPaths[context.navigation[0]]:null;
}
export function isTeachingFeedbackScopeQuestion(question,route='',history=[]){
  const context=teachingFeedbackLookupContext(question,route,history);
  return Boolean(context.selection||context.foreign||context.excluded||context.navigation.length);
}

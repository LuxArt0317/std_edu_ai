const number=value=>/^[1-9]\d{0,9}$/u.test(value)&&Number(value)<=2147483647?Number(value):null;
const clean=value=>typeof value==='string'&&value.length<=12000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\n\r\t]/gu,''))?value.normalize('NFKC').trim():'';
const remote=/\b(?:remote[- ]learning|e-learning|elearning|digital academy)\b|數位學園|遠距教學/iu;
const dtm=/\bdtm\b|digital teaching materials|數位教材|教材網/iu;
const subject=/\b(?:outline|videos?|slides?|materials?|activities|activity|sections?|feedback (?:form|link)|attendance (?:form|link|register))\b|課程大綱|影片|簡報|教材|活動|章節|回饋單|出席(?:統計|連結|登记|登記)/iu;
const foreign=/\b(?:another|other) (?:student|person|user|account)\b|\b(?:his|her|their)\s+(?:(?:remote[- ]learning|e-learning|elearning|digital academy|saved|personal|local|own)\s+){0,3}(?:courses?|outline|videos?|slides?|materials?|activities|activity|sections?|feedback (?:form|link)|attendance (?:form|link|register)|records?)\b|\bmy (?:friend|classmate|sister|brother|mother|father|parent|roommate|partner|colleague)\b|\b(?!(?:course|section|activity|student|university|school)['’]s\b)[\p{L}][\p{L}’-]*['’]s\b|\b(?:outline|videos?|slides?|materials?) (?:of|for) (?!(?:me|my|this|that|the|course|section|activity)\b)[\p{L}][\p{L}’-]*\b|別人|他人|其他學生|同學的|(?:他|她|他們|她們)的/iu;
const negated=/^(?:(?:please\s+)?(?:do not|don['’]t|never)\s+(?:show|list|read|include)|not(?!\s+only)\b|except\b|excluding\b|exclude\b|without\b|(?:請)?不要(?:顯示|列出|讀取|包含)|排除|不含)/iu;
function pieces(value){
  // Literal titles must not become conjunctions or exclusion instructions.
  const quoted=[];
  const masked=value.replace(/["“「][^"”」]*["”」]/gu,match=>{quoted.push(match);return '\ue000'+(quoted.length-1)+'\ue001';});
  return masked.split(/[;；。!?！？\n,，]|\.(?:\s+|$)|\s+(?:and|also|but|plus)\s+|\s+(?=(?:not(?!\s+only)|without|except|excluding)\b)|以及|還有|但是|(?=排除|不含)/iu)
    .map(part=>part.replace(/\ue000(\d+)\ue001/gu,(_,index)=>quoted[Number(index)]).trim()).filter(Boolean);
}
const follow=/^(?:(?:and|also)\s+)?(?:what about|how about|show (?:me )?(?:those|them)|where (?:is|are) (?:it|they))\b|^(?:那|還有|還有哪些|它的|那些)/iu;
const all=/\b(?:all|entire|whole)\b|全部|所有|整(?:門|份)/iu;

function routeLocation(route){
  if(route===undefined||route==='')return {valid:true,location:null};
  if(typeof route!=='string'||route.length>3100||/[\p{Cc}\p{Cs}\s\\]/u.test(route)||route.includes('#')||route.startsWith('//')
    ||/%(?:2e|2f|5c)|\/(?:\.|\.\.)(?:\/|$|\?)/iu.test(route))return {valid:false,location:null};
  try{
    const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||!route.startsWith('/')&&!route.startsWith('https://stu.best/'))return {valid:false,location:null};
    if([...url.searchParams.keys()].some(key=>/^(?:user(?:_?id)?|owner(?:_?id)?|token|access_token|authorization)$/iu.test(key)))return {valid:false,location:null};
    const match=/^\/elearning\/course\/([1-9]\d{0,9})(?:\/activity\/([1-9]\d{0,9}))?\/?$/u.exec(url.pathname);
    if(!match)return {valid:true,location:null};
    const courseId=number(match[1]),activityId=match[2]?number(match[2]):null;
    return courseId&&(!match[2]||activityId)?{valid:true,location:{courseId,activityId}}:{valid:false,location:null};
  }catch{return {valid:false,location:null};}
}
function references(text){
  const courses=[...text.matchAll(/(?:\bcourse\s*(?:(?:id|number|#)\s*)?|課程\s*(?:編號\s*)?)(\d+)\b|\/elearning\/course\/(\d+)(?:\b|\/)/giu)].map(match=>number(match[1]??match[2]));
  const activities=[...text.matchAll(/(?:\bactivity\s*(?:(?:id|number|#)\s*)?|活動\s*(?:編號\s*)?)(\d+)\b|\/activity\/(\d+)\b/giu)].map(match=>number(match[1]??match[2]));
  const sections=[...text.matchAll(/(?:\bsection\s*(?:#\s*)?|第\s*)(\d+)(?:\s*章節|\b)/giu)].map(match=>Number(match[1]));
  const sectionTitles=[...text.matchAll(/(?:\bsection|章節)\s*["“「]([^"”」]+)["”」]/giu)].map(match=>match[1].trim());
  const activityTitles=[...text.matchAll(/(?:\bactivity|活動)\s*["“「]([^"”」]+)["”」]/giu)].map(match=>match[1].trim());
  const unresolvedCourse=/\bcourse\s*["“「]|課程\s*["“「]|\b(?:course (?:called|named|titled)|in (?:my )?course (?!\d|id\b|number\b|#))\b/iu.test(text);
  const explicitTokens=[...text.matchAll(/(?:\b(?:course|activity|section)\s*(?:id\b|number\b|#)|(?:課程|活動|章節)\s*編號)\s*([^\s,;!?]*)/giu),
    ...text.matchAll(/\b(?:course|activity|section)\s+([+-]?\d[^\s,;!?]*)/giu)].map(match=>match[1].replace(/\.$/u,''));
  const quotedSelectors=[...text.matchAll(/(?:\b(?:course|activity|section)|課程|活動|章節)\s*["“「]([^"”」]*)(["”」]|$)/giu)];
  const invalidExplicit=explicitTokens.some(token=>number(token)===null)||quotedSelectors.some(match=>!match[1].trim()||!match[2]);
  return {courses:[...new Set(courses)],activities:[...new Set(activities)],sections:[...new Set(sections)],sectionTitles:[...new Set(sectionTitles)],activityTitles:[...new Set(activityTitles)],unresolvedCourse,invalidExplicit};
}
function positiveParts(text){
  let suppress=false;
  return pieces(text).filter(part=>{
    if(negated.test(part)){suppress=true;return false;}
    if(suppress&&/^(?:the\s+)?(?:videos?|slides?|materials?|activities|sections?|feedback(?: form| link)?)(?:\s+too)?$/iu.test(part))return false;
    suppress=false;return true;
  });
}

/** Browser-safe selector: only an exact course identifier, never a catalog search or an account override. */
export function selectElearningOutlineEvidence(question,route='',history=[]){
  const text=clean(question),location=routeLocation(route);
  if(!text)return null;
  const previous=Array.isArray(history)?clean(history.slice(-6).findLast(item=>item?.role==='user'&&typeof item.content==='string')?.content):'';
  const parts=positiveParts(text),eligible=parts.filter(part=>!dtm.test(part)||remote.test(part)),requested=eligible.filter(part=>subject.test(part));
  // A coordinated "course 9408 and course 9098 videos" must not lose the
  // identifier-only clause and silently read just one course.
  const query=eligible.filter(part=>subject.test(part)||references(part).courses.length||references(part).unresolvedCourse||foreign.test(part)).join('\n');
  const current=references(query),prior=references(previous);
  const context=remote.test(query)||location.location||current.courses.length||follow.test(text)&&remote.test(previous);
  if(!requested.length||!context)return null;
  const result={courseId:null,activityId:null,sectionPosition:null,sectionTitle:null,activityTitle:null,purposes:[],from:'none',reason:null};
  if(!location.valid)return {...result,reason:'invalid_route'};
  if(foreign.test(query))return {...result,reason:'foreign_request'};
  if(current.invalidExplicit||current.courses.some(id=>id===null)||current.activities.some(id=>id===null)||current.sections.some(id=>id<1||id>64)
    ||current.sectionTitles.some(title=>title.length>200)||current.activityTitles.some(title=>title.length>240))return {...result,reason:'invalid_selector'};
  if(current.courses.length>1||current.activities.length>1||current.sections.length>1||current.sectionTitles.length>1||current.activityTitles.length>1)return {...result,reason:'ambiguous_selector'};
  if(current.unresolvedCourse)return {...result,reason:'choose_course'};
  if(current.courses.length){result.courseId=current.courses[0];result.from='question';}
  else if(location.location){result.courseId=location.location.courseId;result.from='route';}
  else if(follow.test(text)&&!foreign.test(previous)&&!prior.unresolvedCourse&&prior.courses.length===1&&prior.courses[0]){
    result.courseId=prior.courses[0];result.from='history';
  }
  if(!result.courseId)return {...result,reason:'choose_course'};
  result.activityId=current.activities[0]??(!all.test(query)&&/\b(?:this|current|the) activity\b|這個活動|本活動/iu.test(query)&&location.location?.courseId===result.courseId?location.location.activityId:null);
  result.sectionPosition=current.sections[0]??null;
  result.sectionTitle=current.sectionTitles[0]??null;
  result.activityTitle=current.activityTitles[0]??null;
  const purposePatterns=[['video',/\bvideos?\b|影片/iu],['slides',/\bslides?\b|簡報/iu],['feedback',/\bfeedback (?:form|link)\b|回饋單/iu],['attendance',/\battendance (?:form|link|register)\b|出席(?:統計|連結|登记|登記)/iu]];
  // A quoted literal title is a selector, not evidence of an activity's kind.
  const purposeQuery=query.replace(/["“「][^"”」]+["”」]/gu,'');
  result.purposes=purposePatterns.filter(([,pattern])=>pattern.test(purposeQuery)).map(([purpose])=>purpose);
  return result;
}
export function isElearningOutlineEvidenceQuestion(question,route='',history=[]){return selectElearningOutlineEvidence(question,route,history)!==null;}

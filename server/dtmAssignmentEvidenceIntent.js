// Browser-safe selection only. Native assignment IDs never authorize access.
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const topic=/\b(?:assignment|homework)\b|作業|作业/iu;
const fields=/\b(?:due|deadline|instructions?|details?|description|title|tracker|status)\b|\bwhat (?:do|should) i (?:need to )?do\b|截止|期限|說明|说明|內容|内容|標題|标题|追蹤|追踪/iu;
const independent=/\b(?:tuition|fees?|balance|charges?|grades?|grade report|feedback|transcript|classes|courses|timetable|schedule|housing|health|loan|salary|files?|uploads?|revisions?|reviews?|submitted|submissions?)\b|學費|餘額|課表|宿舍|健檢|貸款|薪資|檔案|上傳|評閱/iu;
const negative=/\b(?:do not|don['’]t|never|without|exclude|excluding|not)\b|不要|不需|排除/iu;
const operation=/\b(?:delete|submit|upload|replace|change|update|edit|save|mark|complete)\b|刪除|删除|提交|上傳|修改|儲存|标记|標記/iu;
const foreign=/\b(?:another|other)\s+(?:student|person|user|account)|\b(?:his|her|their)\s+(?:(?:saved|dtm|moodle)\s+)*(?:assignment|homework|deadline|due date)|\bmy\s+(?:friend|sister|brother|mother|father|classmate|colleague|roommate)\b|\b[\p{L}\d_-]+['’]s\s+(?:(?:saved|dtm|moodle)\s+)*(?:assignment|homework|deadline)|\b(?:for|of|belonging to|owned by)\s+(?:student\s+|user\s+|account\s+)?(?!me\b|myself\b|my\b|this\b|that\b|the\b|completion\b|submission\b|assignment\b|homework\b)[\p{L}\d_-]+\b|(?:他人|別人|其他學生|同學|同学|朋友)的|(?:顯示|显示|查詢|查询)\s*[\p{Script=Han}]{2,6}(?:自己|本人)?的作業/iu;
const foreignField=/\b(?:his|her|their)\s+(?:instructions?|details?|due date|tracker status)|\b(?!(?:assignment|homework|it|what|this|that)\b)[\p{L}\d_-]+['’]s\s+(?:instructions?|details?|due date|tracker status)|^(?!我|本人|這|这)[\p{Script=Han}]{2,6}(?:自己|本人)?的(?:作業|作业|期限|截止|說明|说明)/iu;
const clean=value=>typeof value==='string'&&value.length<=8000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\n\t\r]/gu,''))?value.trim():'';
export function dtmAssignmentRoute(route=''){
  if(typeof route!=='string'||route.length>3100||/[\\%\s?#]/u.test(route)||/(?:^|\/)\.{1,2}(?:\/|$)/u.test(route))return null;
  try{const url=new URL(route||'/','https://stu.best');if(url.origin!=='https://stu.best'||url.username||url.password)return null;
    const match=new RegExp('^/dtm/course/('+uuid+')/assignment/('+uuid+')(?:/edit)?/?$','u').exec(url.pathname);
    return match?{courseId:match[1],assignmentId:match[2],url:'/dtm/course/'+match[1]+'/assignment/'+match[2]}:undefined;
  }catch{return null;}
}
function previous(history){
  if(!Array.isArray(history))return '';
  for(let i=history.length-1;i>=Math.max(0,history.length-24);i--){const row=Object.getOwnPropertyDescriptor(history,String(i))?.value;
    if(row&&Object.getOwnPropertyDescriptor(row,'role')?.value==='user')return clean(Object.getOwnPropertyDescriptor(row,'content')?.value);}
  return '';
}
function requestedFields(question){
  const selected=[];
  if(/\btitle\b|標題|标题/iu.test(question))selected.push('title');
  if(/\b(?:instructions?|details?|description)\b|\bwhat (?:do|should) i (?:need to )?do\b|說明|说明|內容|内容/iu.test(question))selected.push('details');
  if(/\b(?:due|deadline)\b|截止|期限/iu.test(question))selected.push('dueAt');
  if(/\btracker\b|追蹤|追踪/iu.test(question)){
    selected.push('trackerStatus');
    if(/\b(?:time|date|when|submitted)\b|時間|日期/iu.test(question))selected.push('trackerSubmittedAt');
  }
  return selected;
}
export function dtmAssignmentLookupContext(question,route='',history=[]){
  const q=clean(question),path=dtmAssignmentRoute(route),prior=previous(history);
  const result={selection:null,otherQuestion:q,excluded:false};
  if(!q)return result;
  const contextual=fields.test(q)&&!independent.test(q)&&(topic.test(prior)||path&&!prior);
  const explicitTarget=/\b(?:course|assignment)\s+id\b/iu.test(q);
  const detailContext=path||typeof route==='string'&&/(?:^|:\/\/[^/]+)\/dtm\/course\/.*\/assignment\//u.test(route);
  if(!detailContext&&!explicitTarget&&!/\b(?:dtm|moodle)\s+(?:assignment|homework)\b|數位教材(?:網)?作業|数位教材(?:网)?作业/iu.test(q))return result;
  if(!topic.test(q)&&!contextual)return result;
  const stop=reason=>({...result,otherQuestion:'',selection:{courseId:path?.courseId??null,assignmentId:path?.assignmentId??null,fields:[],question:q,reason}});
  if(path===null)return stop('invalid_route');
  const ownerText=q.replace(new RegExp('\\bfor\\s+(?:course|assignment)\\s+id\\s*[:=]?\\s*'+uuid+'\\b','giu'),'for this assignment');
  if(foreign.test(ownerText)||foreignField.test(ownerText)||!topic.test(q)&&(foreign.test(prior)||foreignField.test(prior)))return stop('foreign_request');
  const pieces=q.split(/[;；。!?！？\n]|\.(?:\s+|$)|\s+(?:and|also|plus|then|but)\s+|以及|並且|还有|還有/iu).map(v=>v.trim()).filter(Boolean);
  const native=[],scoped=[],other=[],includedFields=new Set(),excludedFields=new Set();
  let excluded=false,negativeScope=false;
  for(const part of pieces){
    if(/^(?:please\s+)?(?:show|tell|list|read|check|what|when)\b|^(?:請|顯示|查詢)/iu.test(part)&&!negative.test(part))negativeScope=false;
    if(negative.test(part))negativeScope=true;
    const metadata=/\b(?:due|deadline|instructions?|details?|description|title|tracker)\b|截止|期限|說明|说明|內容|内容|標題|标题|追蹤|追踪/iu.test(part);
    const own=topic.test(part)&&(!independent.test(part)||metadata)||fields.test(part)&&!independent.test(part);
    if(!own){
      if(negativeScope){excluded=true;continue;}
      if(native.length&&operation.test(part)&&!independent.test(part))return stop('unsupported_operation');
      other.push(part);continue;
    }
    if(negativeScope){
      excluded=true;
      const fields=requestedFields(part);
      scoped.push(negative.test(part)?part:'Do not show '+part);
      if(!fields.length){
        native.length=0;
        includedFields.clear();
      }
      for(const field of fields){includedFields.delete(field);excludedFields.add(field);}
      continue;
    }
    if(operation.test(part))return stop('unsupported_operation');
    native.push(part);scoped.push(part);
    for(const field of requestedFields(part)){excludedFields.delete(field);includedFields.add(field);}
  }
  if(!native.length)return {...result,otherQuestion:other.join(' and '),excluded};
  const nativeQuestion=native.join(' and ');
  const identifiers=[...nativeQuestion.matchAll(/\b(?:course|assignment)\s+id\b/giu)];
  const literal=identifiers.length>0;
  const courseMatch=new RegExp('\\bcourse\\s+id\\s*[:=]?\\s*('+uuid+')(?![\\w-])','iu').exec(nativeQuestion);
  const assignmentMatch=new RegExp('\\bassignment\\s+id\\s*[:=]?\\s*('+uuid+')(?![\\w-])','iu').exec(nativeQuestion);
  if(literal&&(identifiers.length!==2||!courseMatch||!assignmentMatch))return stop('ambiguous_selector');
  const target=literal?{courseId:courseMatch[1].toLowerCase(),assignmentId:assignmentMatch[1].toLowerCase()}:path;
  if(!target)return stop('ambiguous_selector');
  // A newly named assignment cannot silently inherit an unrelated open route.
  if(/\b(?:assignment|homework)\s+(?!(?:id|details?|instructions?|due|deadline|title|tracker|status|and|when|what|for|in|is|has|can|do|please|saved|personal)\b)(?:["“][^"”]+["”]|[A-Z][\p{L}\d_-]+)|(?:作業|作业)[「『]/iu.test(nativeQuestion))return stop('ambiguous_selector');
  const wanted=native.some(part=>requestedFields(part).length)?includedFields:new Set(['details','dueAt']);
  const chosen=['title','details','dueAt','trackerStatus','trackerSubmittedAt']
    .filter(field=>!excludedFields.has(field)&&(field==='title'||wanted.has(field)));
  if(!chosen.length)return {...result,otherQuestion:other.join(' and '),excluded:true};
  return {selection:{courseId:target.courseId,assignmentId:target.assignmentId,fields:chosen,question:scoped.join('. '),reason:null},otherQuestion:other.join(' and '),excluded};
}
export const selectDtmAssignmentEvidence=(question,route='',history=[])=>dtmAssignmentLookupContext(question,route,history).selection;
export const isDtmAssignmentEvidenceQuestion=(question,route='',history=[])=>Boolean(selectDtmAssignmentEvidence(question,route,history));

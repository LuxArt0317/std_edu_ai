// Shared grade-report intent. No authentication, storage or network dependencies.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const dataObject=value=>plain(value)&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const text=value=>typeof value==='string'&&value.length<=12000?value.trim():'';
const topic=/\b(?:grades?|marks?|gradebook|feedback|weights?|percentages?|ranks?|report items?|course totals?)\b|成績|成绩|評語|评语|權重|权重|百分比|排名|課程總分|课程总分/iu;
export const dtmGradeNativeTopic=/\b(?:dtm|moodle|grade reports?)\b|數位教材|数位教材|成績報告|成绩报告/iu;
const personal=/\b(?:my|mine|me|i|saved|recorded)\b|我的|本人|我有|我在|已存|紀錄|记录|記錄/iu;
const recordAsk=/\b(?:show|list|read|check|report|overview|received|earned|recorded|saved|score|grade|feedback|weight|rank|total)\b|顯示|显示|列出|查詢|查询|報告|报告|綜覽|总览|成績|成绩|評語|评语/iu;
export const dtmGradeOtherDomain=/\b(?:tuition|fees?|loan|leave|attendance|certificate|scholarship|wifi|wi-fi|transcript|graduation|academic affairs)\b|學費|学费|貸款|贷款|請假|请假|出席|在學證明|畢業|毕业|歷年成績|历年成绩/iu;
const foreignOwner=/\b(?:another|other) (?:student|person|user|account)|\b(?:their|her|his) (?:moodle |dtm )?(?:grades?|report)|\b(?:friend|classmate|roommate)['’]s\b|\b(?:student|user|account)\s+(?:id\s*[:=]?\s*)?(?:[0-9a-f]{8}-[0-9a-f-]{27,}|s\d{7,}|\d{8,})|別人|他人|其他(?:學生|学生)|同學的|同学的/iu;
const trackerOnly=/\b(?:grade tracker|personal grade entries|practice grades?|submission reviews?|file revisions?|submitted file|graded file)\b|個人成績紀錄|个人成绩记录|練習成績|练习成绩|檔案評閱/iu;
const explicitReport=/\b(?:native (?:dtm |moodle )?grade(?:book| reports?)|(?:dtm |moodle )?grade reports?|(?:user|overview) report|gradebook)\b|用戶報告|使用者報告|綜覽報告|總覽報告|成績報告|成绩报告/iu;
const dtmName=/\b(?:dtm|moodle)\b|數位教材|数位教材/iu;
const nativeGradeField=/\b(?:grades?|marks?|gradebook|report weights?|course totals?)\b|成績|成绩|課程總分|课程总分/iu;
const independentDtmWork=/\b(?:assignments?|homework|coursework|meetings?|materials?|notices?|attendance)\b|作業|功課|教材|公告|出席/iu;
const submissionDetail=/\b(?:files?|attachments?|revisions?|uploads?|uploaded|submissions?|submitted|file reviews?)\b|檔案|档案|附件|上傳|上传|繳交|缴交|提交|版本/iu;
const nativeRoute=/^\/dtm\/(?:grades|course\/[0-9a-f-]+\/grades(?:\/overview)?)$/u;
const leadingReportScope=/^in\s+(?:(?:my|the|this)\s+)?(?:(?:native|saved|local)\s+){0,2}(?:(?:moodle|dtm)\s+)?grade report(?:\s+for\s+([^,，]+))?[,，]\s*(.+)$/iu;
const unsafeReportQualifier=/\b(?:and|also|plus|then|but|except|without|with|including|show|list|read|check|tell|what|which)\b|[,，:：/;；。!?！？\n]/iu;
const concept=/^(?:what (?:is|are)|define|explain)\s+(?:(?:a|the)\s+)?(?:moodle |dtm )?(?:grades?|grade reports?|gradebook|weighted grades?)\s*[?.!]*$/iu;
const implicitDetail=/^(?:and\s+)?(?:(?:what|which)\s+)?(?:(?:is|was|are|were)\s+)?(?:(?:my|the|its|that|this)\s+)?(?:feedback|weights?|rank|percentage|(?:course )?total)(?:\s+(?:did I (?:get|receive)|(?:was|is|were|are) (?:saved|recorded)|(?:does|did) it (?:say|show)))?\s*[?.!]*$|^(?:那|還有)?(?:評語|评语|權重|权重|總分|总分)(?:呢|是什麼|是甚麼)?[？?。！!]*$/iu;
export const dtmGradeFollowup=/\b(?:it|its|this|that|these|those|report|feedback|weight|percentage|rank|total|say|show|record)\b|這|这|該|该|報告|报告|評語|评语|權重|权重|總分|总分/iu;
const chineseCourseTotal=/^(?:我的)?(?:Moodle|DTM|數位教材網)(?:的)?成績報告(?:中|裡)?(?:儲存的)?課程總分(?:是多少|是什麼|是甚麼|有記錄嗎)[？?。！!]*$/iu;
const chineseReportAvailability=/^(?:這門課有(?:已儲存的)?(?:Moodle|DTM|數位教材網)成績報告嗎|請(?:顯示|查詢)(?:我的)?(?:Moodle|DTM|數位教材網)課程[「『][^」』\n]+[」』]的成績報告)[？?。！!]*$/iu;
const englishCourseTotal=/^(?:(?:please )?(?:show|check) (?:my |the )?(?:saved |recorded )?course total|what (?:course )?total (?:is|was) (?:saved|recorded)|what is (?:my |the )?course total)(?: (?:in|for) (?!.*\b(?:and|also|plus|with|including|but)\b)[^.!?;]+)?[.?!]*$/iu;
const withoutSpaces=value=>value.replace(/ +/gu,'');
export const asksOnlyDtmCourseTotal=question=>englishCourseTotal.test(text(question))||chineseCourseTotal.test(withoutSpaces(text(question)));
export const explicitDtmGradeOverview=/\boverview\b|\b(?:all|every)\s+(?:(?:of|my|the|saved|moodle|dtm)\s+){0,4}(?:courses?|subjects?)\b|綜覽|综览|總覽|总览|(?:所有|全部).{0,8}(?:課程|课程|科目)/iu;
export function dtmGradeRouteInfo(route){
  if(route===undefined||route==='')return {path:'',courseId:null};
  if(typeof route!=='string'||route.length>3100||route.includes('\\')||[...route].some(char=>char.codePointAt(0)<=32))return null;
  try{const url=new URL(route,'https://stu.best');if(url.origin!=='https://stu.best'||url.username||url.password||url.search||url.hash)return null;
    const path=url.pathname.replace(/\/+$/,'')||'/',match=/^\/dtm\/course\/([0-9a-f-]+)(?:\/grades(?:\/overview)?)?$/.exec(path);
    return {path,courseId:match&&uuid.test(match[1])?match[1]:null};
  }catch{return null;}
}
export function previousDtmGradeQuestion(history){
  if(!Array.isArray(history))return '';
  for(let i=history.length-1;i>=Math.max(0,history.length-24);i--){
    const descriptor=Object.getOwnPropertyDescriptor(history,String(i)),item=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;
    if(dataObject(item)&&item.role==='user')return text(item.content);
  }
  return '';
}
export function currentDtmGradeIntent(question,route){
  if(!question||foreignOwner.test(question)||concept.test(question)&&!personal.test(question))return false;
  if(trackerOnly.test(question)&&!explicitReport.test(question))return false;
  if(dtmGradeOtherDomain.test(question)&&!dtmGradeNativeTopic.test(question))return false;
  return topic.test(question)&&(dtmGradeNativeTopic.test(question)&&(personal.test(question)||recordAsk.test(question))
    ||/^\/dtm(?:\/|$)/.test(route.path)&&(personal.test(question)||recordAsk.test(question)));
}
export function isDtmGradeReportEvidenceQuestion(question,route='',history=[]){
  try{const current=text(question),parsed=dtmGradeRouteInfo(route);if(!parsed||!current||foreignOwner.test(current))return false;
    if(currentDtmGradeIntent(current,parsed))return true;
    const previous=previousDtmGradeQuestion(history);
    if(implicitDetail.test(current)&&currentDtmGradeIntent(previous,{path:'/dtm',courseId:null})
      &&(dtmName.test(previous)||explicitReport.test(previous)))return true;
    if(topic.test(current)||dtmGradeOtherDomain.test(current)||trackerOnly.test(current)||!dtmGradeFollowup.test(current))return false;
    return /\/grades(?:\/overview)?$/.test(parsed.path)||currentDtmGradeIntent(previous,{path:'/dtm',courseId:null});
  }catch{return false;}
}
export function isForeignDtmGradesQuestion(question,route=''){
  const current=text(question);
  return Boolean(current&&foreignOwner.test(current)&&topic.test(current)
    &&(dtmGradeNativeTopic.test(current)||/^\/dtm(?:\/|$)/u.test(dtmGradeRouteInfo(route)?.path??'')));
}

/** Moodle grades refer to native reports. The separate tracker remains selectable by name. */
export function shouldReadNativeDtmGrades(question,route='',history=[]){
  const current=text(question),parsed=dtmGradeRouteInfo(route);
  if(!parsed||!isDtmGradeReportEvidenceQuestion(current,route,history))return false;
  if(!parsed.path.startsWith('/dtm')&&!dtmName.test(current)
    &&/\b(?:school affairs|academic affairs|transcript)\b|校務|教務|歷年成績/iu.test(current))return false;
  const previous=previousDtmGradeQuestion(history);
  const contextual=explicitReport.test(previous)||dtmName.test(previous)&&nativeGradeField.test(previous);
  return explicitReport.test(current)||dtmName.test(current)&&nativeGradeField.test(current)
    ||nativeRoute.test(parsed.path)||contextual&&dtmGradeFollowup.test(current);
}

export function needsSeparateDtmTracker(question,route='',history=[]){
  const parts=text(question).split(/[!?;；\n]|\s+(?:and|also|plus)\s+|以及|還有/iu).filter(part=>part.trim());
  return parts.some(part=>trackerOnly.test(part)
    ||independentDtmWork.test(part)&&!shouldReadNativeDtmGrades(part,route,history)
      &&!/^(?:\s*(?:my|the)\s+)?(?:assignment|quiz|coursework)\s+(?:mark|grade|feedback|weight|score|rank)\b/iu.test(part));
}

export function mentionsDtmSubmissionDetail(question,history=[]){
  const current=text(question);
  return submissionDetail.test(current)
    ||dtmGradeFollowup.test(current)&&submissionDetail.test(previousDtmGradeQuestion(history));
}

/** A deliberately bounded fast path. This only decides whether the base
 * snapshot can be omitted; the native reader still validates course ownership
 * and every display cell. Unrecognized or compound clauses keep normal planning.
 */
export function isNativeDtmGradeOnlyQuestion(question,route='',history=[]){
  const current=text(question);
  if(!shouldReadNativeDtmGrades(current,route,history)||needsSeparateDtmTracker(current,route,history)
    ||dtmGradeOtherDomain.test(current))return false;
  const compact=withoutSpaces(current);
  if(chineseCourseTotal.test(compact)||chineseReportAvailability.test(compact))return true;
  const parts=current.split(/[;；。!?！？\n]|\.(?:\s+|$)/u).map(part=>part.trim()).filter(Boolean);
  if(!parts.length)return false;
  return parts.every(part=>{
    const leading=leadingReportScope.exec(part);
    if(leading?.[1]&&unsafeReportQualifier.test(leading[1]))return false;
    const request=leading?.[2]??part;
    // A literal course/item qualifier may name saved rows, but cannot conceal
    // an independent request after a conjunction or sentence boundary.
    const qualifier=/\s+(?:for|in)\s+(.+)$/iu.exec(request);
    let fields=request;
    if(qualifier){
      if(unsafeReportQualifier.test(qualifier[1]))return false;
      fields=request.slice(0,qualifier.index);
    }
    // Every coordinated field clause must itself describe report data. A
    // separate "and my courses" request cannot inherit the first grade noun.
    if(!fields.split(/\s+(?:and|also)\s+/iu).every(field=>/\b(?:grades?|marks?|feedback|weights?|percentages?|ranks?|totals?|report|overview)\b/iu.test(field)))return false;
    const allowed=new Set(('show list read check tell me what which how many is are was were does did do i my mine the a an this that its these those there '+
      'all every each of and also please native local saved recorded literal displayed moodle dtm course courses '+
      'grade grades mark marks gradebook feedback weight weights percentage percentages rank ranks total totals '+
      'report reports overview item items assessment assessments text cell cells score maximum range contribution '+
      'get receive received earned save have has say says').split(' '));
    return fields.toLowerCase().replace(/[-,:]/gu,' ').split(/\s+/u).every(word=>allowed.has(word));
  });
}

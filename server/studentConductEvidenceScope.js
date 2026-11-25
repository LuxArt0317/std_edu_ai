// Browser-safe scope selection only. The native reader remains responsible for
// caller authorization, literal field projection, deadlines and all transport.
import {studentConductPath as path} from './studentConductContract.js';
const topic=/\b(?:student conduct|conduct (?:records?|history|details?|code|name|quantity|status)|disciplinary (?:records?|history)|(?:merits?|demerits?)(?: records?)?|(?:student )?rewards? (?:and |or )?(?:punishments?|discipline)|student (?:rewards?|discipline)(?: records?)?)\b|獎懲|奖惩|操行/iu;
const dorm=/\b(?:dorm(?:itory)?|housing|residence hall)\b|宿舍|住宿/iu;
const tracking=/\b(?:(?:tracking|tracker|service)\s+(?:notes?|records?|status)|(?:private|personal|local|saved)\s+(?:(?:student\s+)?conduct\s+)?(?:tracking\s+)?notes?)\b|追蹤備註|追踪备注|私人備註|私人备注/iu;
const own=/\b(?:my|mine|me|i)\b|我的|我自己|我本人|本人|我有|我在/iu;
const ask=/\b(?:show|list|read|check|records?|history|status|details?|code|name|quantity|void|download|print|submit|delete|update|change|have|saved|recorded)\b|顯示|显示|列出|查詢|查询|記錄|紀錄|记录|狀態|状态|內容|内容|代碼|代码|名稱|名称|下載|下载|列印|修改|刪除|删除|有沒有|是否/iu;
const concept=/^(?:(?:what (?:is|are)|define|explain)\s+(?:(?:a|the)\s+)?(?:student conduct|merits?|demerits?|disciplinary records?)|(?:什麼是|什么是)(?:學生|学生)?(?:獎懲|奖惩|操行))[?.!。！？]*$/iu;
const negative=/^(?:(?:please|and|then|also)\s+)*(?:do not|don['’]t|never|not(?!\s+only)|without|excluding|exclude|omit)\b|^(?:請|请)?(?:不要|不含|排除|不用|不查)/iu;
const navigation=/\b(?:where|how) (?:can|do|should) i (?:find|open|view|access|check|download|print)|\b(?:give|send|show) me (?:the |a )?link|\b(?:open|link to) (?:my |the )|在哪|哪個(?:頁面|連結)|哪儿|如何(?:開啟|查詢|下載)|給我.*連結/iu;
const follow=/^(?:(?:and|also|then)\s+)?(?:what (?:about|is|are|does|do)|how (?:about|many)|show|list|read|check|tell me).{0,90}\b(?:it|its|this|that|these|those|records?|status|details?|name|number|code|quantity|void|history|date|term|semester|year|reason)\b|^(?:那|還有|还有)?(?:這些|这些|它|該|该|紀錄|记录|記錄|狀態|状态|代碼|代码|數量|数量|事由|學號|学号|姓名|日期|學期|学期).{0,30}$/iu;
const independent=/\b(?:tuition|fees?|balance|salary|payroll|loan|scholarship|next class|classes|courses?|timetable|assignments?|grades?|attendance|leave|wifi|library|housing|dormitory|counseling|certificate|health|repair|rental|insurance|profile|basic information)\b|學費|学费|餘額|余额|薪資|貸款|奖学金|獎學金|課程|课程|課表|课表|下一堂|下堂|作業|作业|成績|成绩|出勤|請假|请假|宿舍|住宿|諮商|证书|證書|健檢|報修|保險|基本資料/iu;
const field=/^(?:(?:and|also|then|please|show|list|read|check|include|tell me|what is|what are|what about|what|which|how many|not|without|excluding|exclude|omit|do not (?:show|include)|don['’]t (?:show|include))\s+)*(?:(?:my|the|its|their|saved|recorded|student|academic|full|exact|current|previous|last|this)\s+)*(?:name|number|id|reason|quantity|code|void status|status|date|year|semester|term|rows?|records?|details?|history)(?:\b|$)|^(?:還有|还有|以及|顯示|显示|列出|不要(?:顯示|显示)?|不顯示|不显示|不含|排除)?(?:我的|學生|学生|已存)?(?:姓名|學號|学号|事由|數量|数量|代碼|代码|狀態|状态|日期|學年|学年|學期|学期|紀錄|记录)/iu;
const split=/[;；。!?！？\n]|\.(?=\s|$)|[,，]\s*(?=(?:show|list|read|check|tell|what|which|when|how|where|do not|don['’]t|never)\b)|\s+(?:and|plus|also|but|then)\s+(?=(?:my|show|list|read|check|tell|include|what|which|when|how|where|do not|don['’]t|never|not|without|excluding|tuition|fees?|balance|salary|next class|classes|courses?|timetable|assignments?|grades?|attendance|leave|wifi|library|housing|dormitory|counseling|certificate|health|repair|rental|insurance|student conduct)\b)|(?<!\bdo)\s+(?=(?:without|excluding|not(?!\s+only))\s+)|\s+(?:together\s+)?with\s+(?=my\s+(?:student|dormitory)\s+conduct)|以及|還有|还有|並且|但是|(?=排除|不含|不要)/iu;
const bounded=value=>typeof value==='string'&&value.length<=4000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))?value.normalize('NFKC').trim():'';
// This matches a whole row-count question. Period filters and quantities are
// separate fields in the report and do not mean its total row count.
const savedRows='(?:saved )?(?:(?:student |personal )?conduct |disciplinary )?(?:records|rows|entries)';
const countRows=new RegExp('^(?:(?:please )?how many (?:of my |my )?'+savedRows+
  '(?: do i have| are (?:saved|recorded)(?: (?:in|on|under|for) my account)?| are there(?: (?:in|on|under|for) my account)?)?'+
  '|(?:(?:please )?count|what is the (?:total )?number of|what is the count of) (?:my |the )?'+savedRows+')$','iu');
export function isStudentConductCountQuestion(question){
  const value=bounded(question).replace(/[?.!。！？]+$/u,'').trim();
  return countRows.test(value)||/^(?:請問|请问)?(?:(?:我的|我有|我|本人)?(?:已儲存|已保存)?(?:學生個人|学生个人|學生|学生|個人|个人)?(?:獎懲|奖惩|操行)(?:紀錄|記錄|记录|資料|资料)?(?:共有|總共有|总共有|有|是)?(?:幾筆|几笔|多少筆|多少笔)(?:紀錄|記錄|记录)?|(?:我有|我的|本人有)(?:幾筆|几笔|多少筆|多少笔)(?:已儲存|已保存)?(?:學生個人|学生个人|學生|学生|個人|个人)?(?:獎懲|奖惩|操行)(?:紀錄|記錄|记录)?)$/u.test(value);
}
const parts=value=>{
  const clauses=value.split(split).map(part=>part.trim()).filter(Boolean),result=[];let denied=false;
  for(const clause of clauses){
    const explicit=/^(?:please\s+)?(?:show|list|read|check|tell|include|what|which|when|how|where|do not|don['’]t|never|not|without|excluding)\b|^(?:請|请)?(?:顯示|显示|查詢|查询|列出|不要|不含|排除)/iu.test(clause);
    const inherited=denied&&!explicit&&(localTopic(clause)||independent.test(clause));
    const value=inherited?'Do not show '+clause:clause;result.push(value);
    denied=negative.test(value);
  }
  return result;
};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const data=value=>plain(value)&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const base=question=>({selected:false,foreign:false,excluded:false,navigation:false,question:'',otherQuestion:question,from:null,reason:null});
function routeContext(route){
  if(route===undefined||route==='')return {valid:true,conduct:false};
  if(typeof route!=='string'||route.length>3100||route.includes('\\')||/[\p{Cc}\s]/u.test(route)
    ||/(?:^|\/)(?:\.|%2e)(?:\.|%2e)?(?:\/|[?#]|$)/iu.test(route))return {valid:false,conduct:false};
  try{const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||url.hash)return {valid:false,conduct:false};
    const pathname=url.pathname.replace(/\/+$/u,'');
    if(pathname.startsWith(path+'/')||pathname===path&&url.search)return {valid:false,conduct:false};
    return {valid:true,conduct:pathname===path};
  }catch{return {valid:false,conduct:false};}
}
function latestUser(history){
  if(!Array.isArray(history))return '';
  for(let index=history.length-1;index>=Math.max(0,history.length-6);index--){
    const item=Object.getOwnPropertyDescriptor(history,String(index))?.value;
    if(data(item)&&item.role==='user')return bounded(item.content);
  }
  return '';
}
function foreignSubject(value){
  if(isStudentConductCountQuestion(value))return false;
  const text=value.replace(/\b(?:what|when|where|how|who|it|that|there|here|which)['’]s\b/giu,'');
  if(/\b(?:another|other) (?:student|person|user|account)|\bmy (?:friend|classmate|roommate|sister|brother|mother|father|parent|colleague)\b|\bmy student(?!\s+(?:conduct|name|number|id|rewards?|discipline)\b)\b|\b(?:their|his|her)\s+(?:(?:saved|recorded|student)\s+)*(?:conduct|disciplinary|merit|demerit|reward|punishment|records?|history)|\b(?!student\b|school\b|university\b)[\p{L}][\p{L}\p{N}_’-]*['’]s\b|別人|他人|其他(?:學生|学生)|(?:他|她|他們|她們)的/iu.test(text))return true;
  if(/\b(?:does|did|has|have|is|was|can)\s+(?!(?:i|my|the|a|this|that|it|there|student|conduct|any|no|each)\b)[\p{L}][\p{L}\p{N}_’-]*(?:\s+[\p{L}][\p{L}\p{N}_’-]*)?\s+(?:have|has|receive|received|get|got|save|saved|own|access|a|any|merits?|demerits?)\b/iu.test(text))return true;
  if(/\b(?:records?|history|report|student conduct)\s+(?:for|of|belong(?:s|ing)? to|saved by)\s+(?!(?:me|my|the|a|this|that|our|these|those|this|current|last|previous|next|academic|school|semester|term|year|january|february|march|april|may|june|july|august|september|october|november|december)\b)[\p{L}][\p{L}\p{N}_’-]*\b/iu.test(text))return true;
  // A named target may follow a selected field or "recorded for", not just
  // the record noun: own row filters must never substitute for that subject.
  if(/\b(?:for|of|belong(?:s|ing)? to|recorded for|saved for)\s+(?!(?:me|my|mine|the|a|our|these|those|this|that|current|last|previous|next|academic|school|semester|term|year|conduct|disciplinary|merits?|demerits?|records?|history|status|quantity|reason|code|name|number|january|february|march|april|may|june|july|august|september|october|november|december)\b)[\p{L}][\p{L}\p{N}_’-]*\b/iu.test(text))return true;
  // Explicit alphanumeric/numeric student or account identifiers are not an
  // authorization claim, even when the native reader can only load our caller.
  if(/\b(?:student|account|user)(?:\s+(?:id|number))?\s*[:#]?\s+(?=[\p{L}\p{N}_-]*\p{N})[\p{L}\p{N}][\p{L}\p{N}_-]*\b|(?:學生|学生|帳號|账号|學號|学号)\s*[:：#]?\s*[A-Za-z0-9_-]*[0-9][A-Za-z0-9_-]*\s*(?:的)?(?:學生|学生)?(?:獎懲|奖惩|操行)/iu.test(text))return true;
  if(/\b(?:for|of|belong(?:s|ing)? to|saved by)\s+[0-9]{5,}(?:[\p{L}\p{N}_-]*)\b|\b[0-9]{5,}(?:[\p{L}\p{N}_-]*)['’]s\b/iu.test(text))return true;
  for(const match of text.matchAll(/([\p{Script=Han}]{1,24})(?:的)?\s*(?:學生|学生)?(?:獎懲|奖惩|操行)/gu)){
    const owner=match[1].replace(/^(?:(?:請|请)?(?:顯示|显示|查詢|查询|列出|告訴我|告诉我|讀取|读取|看看|給我看)|請|请)/u,'').replace(/(?:學生|学生)?個人$/u,'').replace(/(?:學生|学生)$/u,'').replace(/的$/u,'');
    if(owner&&!/^(?:我|我本人|我自己|本人|自己|學生|学生|個人|个人)$/u.test(owner))return true;
  }
  return false;
}
function localTopic(clause){return topic.test(clause)&&!dorm.test(clause);}

/** Returns an independently scoped native question plus every unrelated clause.
 * Explicit tracker notes remain residual; they are not native conduct cells. */
export function studentConductScope(question,route='',history=[]){
  const current=bounded(question),result=base(current),context=routeContext(route);
  if(!current)return result;
  if(!context.valid)return {...result,reason:'invalid_route'};
  if(concept.test(current)&&!own.test(current))return result;
  const clauses=parts(current),positive=[],rest=[];let anchored=false;
  for(const clause of clauses){
    if(!localTopic(clause)||tracking.test(clause)){rest.push(clause);continue;}
    anchored=true;
    if(negative.test(clause)&&!field.test(clause)){positive.length=0;result.excluded=true;continue;}
    if(foreignSubject(clause)){result.foreign=true;continue;}
    if(navigation.test(clause)){result.navigation=true;continue;}
    if(own.test(clause)||ask.test(clause)||isStudentConductCountQuestion(clause)||/^student conduct$/iu.test(clause)){
      positive.push(clause);result.excluded=false;
    }else rest.push(clause);
  }
  if(result.foreign)return {...result,reason:'foreign_request',otherQuestion:rest.join('. '),from:'question'};
  // Preserve identity exclusions and selected native fields attached to a real
  // native clause, never treating an independent profile/finance request as one.
  if(positive.length){
    const remaining=[];
    for(const clause of rest){
      if(!independent.test(clause)&&field.test(clause)&&!navigation.test(clause)){
        if(foreignSubject(clause))return {...result,foreign:true,reason:'foreign_request',otherQuestion:'',from:'question'};
        positive.push(clause);
      }else remaining.push(clause);
    }
    return {...result,selected:true,question:positive.join('. '),otherQuestion:remaining.join('. '),from:'question'};
  }
  if(anchored)return {...result,otherQuestion:rest.join('. '),from:'question'};
  if(independent.test(current)||tracking.test(current)||!follow.test(current)&&!isStudentConductCountQuestion(current))return result;
  const previous=latestUser(history);
  if(previous){
    const prior=studentConductScope(previous,'',[]);
    if(prior.foreign)return {...result,foreign:true,reason:'foreign_request',otherQuestion:'',from:'history'};
    if(prior.selected&&!prior.otherQuestion)return {...result,selected:true,question:current,otherQuestion:'',from:'history'};
    return result;
  }
  if(context.conduct){
    if(foreignSubject(current))return {...result,foreign:true,reason:'foreign_request',otherQuestion:'',from:'route'};
    if(negative.test(current))return {...result,excluded:true,otherQuestion:'',from:'route'};
    return {...result,selected:true,question:current,otherQuestion:'',from:'route'};
  }
  return result;
}
export function isStudentConductScopeQuestion(question,route='',history=[]){
  const result=studentConductScope(question,route,history);
  return result.selected||result.foreign||result.excluded||result.navigation;
}

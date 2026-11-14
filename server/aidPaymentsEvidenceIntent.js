import {aidPaymentsPaths} from './aidPaymentsContract.js';

// Shared browser/server selection only: no transport, credentials or Node APIs.
const views=['claims','salary'];
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const data=value=>plain(value)&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const boundedText=value=>typeof value==='string'&&value.length<=12000?value.normalize('NFKC').trim():'';
const foreign=/\b(?:another|other)\s+(?:student|person|user|account)|\b(?:their|his|her)\s+(?:salary|payroll|aid|claims?)|\bmy\s+(?:friend|classmate)['’]?s?\b|\b(?:student|user|account)\s+(?:id\s*[:=]?\s*)?(?:[0-9a-f]{8}-[0-9a-f-]{27,}|s\d{7,}|\d{8,})|別人|他人|其他(?:學生|学生)|同學的|同学的/iu;
const unrelated=/\b(?:tuition|scholarships?|loan|grades?|courses?|assignments?|housing|dormitory|leave|attendance|wifi|library)\b|學費|学费|獎學金|奖学金|貸款|贷款|成績|成绩|課程|课程|作業|作业|宿舍|請假|请假/iu;
const followup=/\b(?:it|this|that|these|those|records?|amount|total|count|status|progress|net|gross|tax|deductions?|periods?|approval|pay)\b|這|这|該|该|紀錄|記錄|记录|金額|金额|筆數|淨額|净额|稅|税|狀態|状态/iu;
const concept=/^(?:what (?:is|are)|define|explain)\s+(?:(?:a|the)\s+)?(?:student|work[- ]study|campus job|financial aid|student aid)\s+(?:payroll|salary|pay|payments?|claims?)\s*[?.!]*$/iu;
function pathOf(route){
  if(route===undefined||route==='')return '';
  if(typeof route!=='string'||route.length>3100||route.includes('\\')||[...route].some(char=>char.codePointAt(0)<=32))return null;
  try{const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||url.hash)return null;
    for(const [key,value] of url.searchParams){
      if(/^(?:user(?:_?id)?|owner(?:_?id)?|student(?:_?id|_?number)?|account(?:_?id)?|authorization|access_?token|token)$/iu.test(key.normalize('NFKC'))
        ||[...key,...value].some(char=>char.codePointAt(0)<32||char.codePointAt(0)===127))return null;
    }
    return url.pathname.replace(/\/+$/,'')||'/';
  }catch{return null;}
}
function excluded(question,index){
  const prefix=question.slice(0,index).replace(/[.;!?。；！？]+$/u,'').split(/[.;!?。；！？]|\b(?:but|instead)\b|但是|而是|但|[,，](?=\s*(?:show|list|include|read|retrieve|fetch)\b)/iu).at(-1).replace(/\bnot only\b/giu,'');
  return /\b(?:do not|don't|never)\s+(?:show|list|include|read|retrieve|fetch)\b|\b(?:exclude|excluding|omit|without)\b|\bnot\s+(?:(?:my|the|any|saved|recorded)\s*)?$|不要|不顯示|不显示|排除|不用/iu.test(prefix);
}
function explicitViews(question){
  const patterns={
    salary:/學生薪資|工讀薪資|工讀給付|\b(?:(?:student|work[- ]study|campus job)\s+(?:payroll|salary|pay)|(?:my|saved|recorded)\s+(?:salary|payroll))\b/giu,
    claims:/學生助學金查詢|助學金請款|請款查詢|\b(?:student aid|financial aid)\s+(?:payments?|claims?)\b/giu,
  };
  const matches=Object.fromEntries(views.map(view=>[view,[...question.matchAll(patterns[view])]]));
  if(matches.claims.length)matches.salary.push(...question.matchAll(/\b(?:salary|payroll)\s+records?\b/giu));
  return {views:views.filter(view=>matches[view].some(match=>!excluded(question,match.index))),mentioned:views.some(view=>matches[view].length)};
}
/** A positive explicit view survives unrelated mixed clauses; a negated view
 * cannot be silently restored by the current page or previous conversation. */
export function selectAidPaymentsEvidence(question,route='',history=[]){
  try{
    const current=boundedText(question),path=pathOf(route);
    if(!current||path===null||foreign.test(current)||concept.test(current))return null;
    const explicit=explicitViews(current);
    if(explicit.mentioned)return explicit.views.length?{views:explicit.views,question:current}:null;
    if(unrelated.test(current)||!followup.test(current)||excluded(current,current.length))return null;
    const page=views.find(view=>aidPaymentsPaths[view]===path);
    if(page)return {views:[page],question:current};
    if(!Array.isArray(history))return null;
    for(let index=history.length-1;index>=Math.max(0,history.length-24);index--){
      const descriptor=Object.getOwnPropertyDescriptor(history,String(index)),item=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;
      if(!data(item)||item.role!=='user')continue;
      const previous=boundedText(item.content);
      if(!previous||foreign.test(previous)||concept.test(previous))return null;
      const selected=explicitViews(previous).views;
      return selected.length?{views:selected,question:current}:null;
    }
    return null;
  }catch{return null;}
}
export function isAidPaymentsEvidenceQuestion(question,route='',history=[]){return selectAidPaymentsEvidence(question,route,history)!==null;}
export function isForeignAidPaymentsQuestion(question){
  const current=boundedText(question);
  return Boolean(current&&foreign.test(current)&&(explicitViews(current).mentioned||/\b(?:salary|payroll)\b|學生薪資|工讀薪資|工讀給付/iu.test(current)));
}

import {isExactClearanceNextClassQuestion} from './clearanceEvidenceIntent.js';
import {isOwnFeeBalanceQuestion,ownFeeBalanceLabel} from './pendingFeesAnswer.js';

export const internshipEvidencePath='/school-affairs/services/internship';
export const internshipRecordTypes=Object.freeze({contract:'contract',self_assessment:'self_assessment',company:'company',directory:'company'});
export const internshipFields=Object.freeze(['title','status','startsOn','endsOn','notes','reviewStatus']);
const views=Object.keys(internshipRecordTypes);
const nativePath=/^\/school-affairs\/services\/internship(?:\/(contract|self_assessment|company|directory))?\/?$/u;
const legacyTopic=/\b(?:internships?|off[ -]campus placement)\b|實習|实习/iu;
const recordRequest=/\b(?:my|own|saved|recorded|list|show|read|check|which|how many|what|when|status|date|find)\b|我的|我有|本人|已儲存|已保存|顯示|查詢|列出|哪些|幾筆|幾件|状态|狀態|日期|何時/iu;
const pageRecord=/\b(?:on|in|from) (?:this|the current) (?:page|view|screen)\b|^(?:(?:show|list|read|check|quote)(?: me)?|what (?:is|are)(?: (?:about|saved for|recorded in))?|which (?:ones|items|records) (?:are|were))\s+(?:(?:my|own|its|the|this|these|saved|recorded|local|site|tracking)\s+)*(?:records?|applications?|status|dates?|notes?|reviews?|reflection|title|entries)(?:\s+(?:here|on this page|please|(?:are|were) saved))?$|^(?:(?:幫我|帮我|請|请)?(?:顯示|显示|查詢|查询|列出|查看))?(?:我的|本頁的?|這個|这个|它的?)?(?:已儲存|已保存|站內|站内)?(?:紀錄|记录|申請|申请|狀態|状态|日期|備註|备注|反思|審核|审核)(?:呢)?$/iu;
const savedContext=/\b(?:my|own|saved|recorded|local|on this page|on my account)\b|我的|本人|已儲存|已保存|站內|站内|本頁|本页/iu;
const publicGuidance=/\b(?:rules?|polic(?:y|ies)|regulations?|requirements?|eligibility|definition|guide(?:lines)?|how (?:do|can|should) (?:i|students?) (?:apply|prepare|complete|fill))\b|^what (?:is|are) (?:a |an |the )?(?:internship |off[ -]campus placement )?(?:contracts?|self[ -]?assessments?)(?: for students)?$|辦法|办法|規章|规章|申請條件|申请条件|資格條件|资格条件|填寫說明|填写说明/iu;
const navigation=/^(?:where (?:is|are|can i (?:find|open|access|go to))|how (?:do|can) i (?:find|open|access|download)|open (?:the|my)|(?:請|请)?(?:如何|怎麼|怎么)(?:打開|打开|開啟|进入|查詢)|(?:我的)?(?:校外)?實習.{0,12}(?:在哪裡|在哪里|頁面連結|页面链接))/iu;
const mutation=/^(?:(?:please|also|then)\s+)*(?:(?:can|could|would) you\s+|(?:help me|i want (?:you )?to)\s+)?(?:edit|write|change|submit|approve|reject|delete|withdraw|update|sign|file|upload|mark|add|create|save)(?:\s|$)|^(?:請|请|幫我|帮我|替我|請幫我|请帮我)?(?:送出|提交|上傳|上传|刪除|删除|撤回|核准|審核|审核|簽署|签署|更新|修改|新增|儲存|保存)/iu;
const negative=/^(?:(?:please|then|also)\s+)*(?:do not|don['’]t|never|not(?! only)|without|exclude|excluding|no need to)\b|^(?:請|请)?(?:不要|不顯示|不显示|排除|不含)/iu;
const foreign=/\b(?:my (?:friend|classmate|roommate|sister|brother|colleague|partner)|another (?:student|user|account|person)|(?:all|other|every) (?:students?|users?|accounts?|people)|(?:his|her|their) (?:own |saved |local |internship )*(?:internship|contract|placement|assessment|company|application|records?|notes?|status|reviews?|dates?)|(?:student|owner|user|account)\s+(?:id|uuid|number|email)|(?:belonging|owned) (?:to|by) (?!me\b|my\b)|(?!(?:it|what|who|there|this|that|kind|student|school|university)['’]s\b)[\p{L}\d_-]+['’]s\s+(?:(?:saved|local|own|internship|placement|company)\s+){0,4}(?:internship|contract|application|records?|notes?|status|self[ -]assessment))\b|他人|別人|别人|其他學生|其他学生|所有學生|所有学生|朋友的|同學的|同学的|(?:他|她)的|(?:查詢|查询|顯示|显示|列出)[\p{Script=Han}]{2,6}的(?:實習|实习)|(?:學號|学号)\s*[A-Za-z0-9]/iu;
const institution=/\b(?:official (?:application|approval|decision|record|review|registry|registration|directory|submission|university)|(?:institutional|university)[ -]wide|all (?:partner|approved|registered|enrolled|eligible) (?:companies|enterprises|employers)|(?:university|school) (?:approved|accredited|registered|partner)|(?:officially|legally) (?:filed|signed|registered|approved|submitted|enrolled))\b|全校.*(?:企業|企业|廠商|厂商)|(?:正式|校方)(?:核准|審核|审核|簽約|签约|送出|提交|名錄|名录)|認證企業|认证企业/iu;
const reviewText=/\b(?:reviewer|supervisor|coordinator|employer)(?:['’]s)?\s+(?:review\s+)?(?:comments?|notes?|feedback|opinion)|\b(?:site|local|stu\.best)\s+review\s+(?:notes?|remarks?|comments?|feedback)\b|(?:審核|审核|主管|導師|导师)(?:評語|评语|意見|意见|備註|备注)/iu;
const outside=/\b(?:tuition|fees?|balance|charges?|timetable|schedule|courses?|subjects?|class(?:es)?|assignments?|grades?|attendance|leave|housing|dormitory|salary|health|loan|certificate|wifi|interview|student profile)\b|學費|学费|餘額|余额|課表|课表|下一堂|課程|课程|成績|成绩|作業|作业|請假|请假|宿舍|薪資|薪资|健檢|健检|面試|面试/iu;
const models={
  directory:/\b(?:company|enterprise|employer) (?:directory|list)(?!\s+(?:application|request))\b|\binternship directory\b|\blist of (?:enterprises|companies|employers)\b|企業(?:名錄|目錄|列表|清單)|企业(?:名录|目录|列表|清单)/iu,
  company:/\b(?:company (?:list )?(?:applications?|submissions?|requests?|records?)|enterprise applications?|partner company applications?)\b|(?:企業|企业|公司)(?:名單|名单)?申請|(?:企業|企业|公司)申請记录/iu,
  self_assessment:/\b(?:self[ -]?assessment|self[ -]?evaluation|internship reflection)\b|自評表|自评表|自我(?:評量|评量|評估|评估|評核|评核)|實習反思|实习反思/iu,
  contract:/\b(?:contracts?|agreements?|placement dates?)\b|合約|合约|契約|契约|實習起訖|实习起讫/iu,
};
const fieldPatterns={
  status:/\b(?:tracking|tracker|record|contract|application) status\b|\b(?:status|stage|progress)\b|狀態|状态|進度|进度/iu,
  dates:/\b(?:dates?|starts?|ends?|from when|until when|when (?:did|does|will)|time period)\b|日期|起訖|起讫|起迄|開始|开始|結束|结束|何時|何时/iu,
  notes:/\b(?:notes?|remarks?|reflection|reflections|comments?)\b|備註|备注|反思|心得/iu,
  reviewStatus:/\b(?:site|stu\.best|local|on[ -]site) review\b|\b(?:review status|review stage)\b|站內審核|站内审核|本站審核|本站审核|審核狀態|审核状态/iu,
};
const literal=/"[^"\r\n]*"|“[^”\r\n]*”|「[^」\r\n]*」|『[^』\r\n]*』/gu;
const pairedDates=/\bstart(?:ing)?(?: dates?)? and end(?:ing)? dates?\b/iu;
const singleClauseText=new RegExp(literal.source+'|'+pairedDates.source,'giu');
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const explicitId=/\b(?:record|contract|assessment|application|company)\s+(?:id|reference|ref)\s*[:#]?\s*([A-Za-z0-9_-]*)|(?:紀錄|记录|合約|合约|申請)\s*(?:編號|编号)\s*[:：#]?\s*([A-Za-z0-9_-]*)/giu;
const foreignQualifier=/\b(?:contracts?|self[ -]assessments?|company applications?|internship records?)\s+(?:for|of)\s+(?!(?:me|myself|my|the|this|that|all|an?|each|every)\b)[\p{L}][\p{L}\d_-]*|(?:查看|查閱|查阅)[\p{Script=Han}]{2,6}的(?:實習|实习)/iu;
const inlineNegative=/\b(?:do not|don['’]t|never|without|excluding|except)\b|不要|不顯示|不显示|不含|排除/iu;
const titleOnly=/\b(?:only (?:the )?titles?|titles? only)\b|只(?:顯示|显示|列出)(?:名稱|名称|標題|标题)/iu;
const mask=value=>value.replace(literal,'quoted-value');
function clean(value){
  return typeof value==='string'&&value.length<=2000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))?value.normalize('NFKC').trim():'';
}
function detectViews(value){
  // Directory and company application observe the same subtype through different native views.
  return views.filter(view=>models[view].test(value));
}
function clauses(question){
  const values=[];
  const safe=question.replace(singleClauseText,text=>{values.push(text);return '\uE000'+(values.length-1)+'\uE001';});
  return safe.split(/[;；。!?！？\n]|\.(?:\s+|$)|\s+(?:and|also|plus|but|then)\s+|以及|並且|并且|還有|还有|但是/iu)
    .map(part=>part.trim().replace(/\uE000(\d+)\uE001/gu,(_,index)=>values[Number(index)])).filter(Boolean);
}
function splitQuestions(text,hasContext){
  const attached=[],remaining=[];
  let previous=null;
  for(const clause of clauses(text)){
    const masked=mask(clause),domain=legacyTopic.test(masked)||hasContext&&detectViews(masked).length!==0;
    const context=!outside.test(masked)&&(hasContext&&!attached.length&&pageRecord.test(masked)||previous==='native'&&!navigation.test(masked)
      &&(Object.values(fieldPatterns).some(pattern=>pattern.test(masked))||mutation.test(masked)||[...masked.matchAll(explicitId)].length!==0));
    if(domain||context){attached.push(clause);previous='native';}
    else {remaining.push(clause);previous='other';}
  }
  return {native:attached.join(' and '),remaining};
}
function selectedFields(parts,view){
  if(titleOnly.test(mask(parts)))return ['title'];
  const requested=new Set(['title','status']);
  function apply(value,deny){
    for(const [name,pattern]of Object.entries(fieldPatterns)){
      if(!pattern.test(value))continue;
      const fields=name==='dates'&&view==='contract'?['startsOn','endsOn']:name==='dates'?[]:[name];
      for(const field of fields)if(deny)requested.delete(field);else requested.add(field);
    }
  }
  for(const clause of clauses(parts)){
    const value=mask(clause),boundary=value.search(inlineNegative);
    if(negative.test(value))apply(value,true);
    else if(boundary<0)apply(value,false);
    else {apply(value.slice(0,boundary),false);apply(value.slice(boundary),true);}
  }
  return internshipFields.filter(field=>requested.has(field));
}
function companionTool(value){
  const text=value.replace(/^(?:(?:also|then|separately)\s+)+|[?!.。！？，,]+$/giu,'').trim();
  if(isOwnFeeBalanceQuestion(text)||ownFeeBalanceLabel(text)!==null
    ||/^(?:please )?(?:tell me|show(?: me)?|check|what is) the (?:school |tuition )?(?:fee |tuition )?balance i still owe$/iu.test(text))return 'charges';
  if(isExactClearanceNextClassQuestion(text)
    ||/^(?:(?:what is|show(?: me)?|list|tell me|check) )?my next (?:school affairs )?class(?:,\s*date,\s*(?:start )?time and room)?$/iu.test(text))return 'courses';
  return null;
}

/** Known views bind one subtype and only the requested fields. Non-internship
 * text is reserved for its own reader; no historical assistant answer is authority. */
export function internshipLookupContext(question,route='',history=[]){
  const q=clean(question),empty={recognized:false,selection:null,reason:null,question:'',otherQuestion:q,companion:null};
  if(!q||typeof route!=='string'||!Array.isArray(history))return empty;
  const routeMatch=nativePath.exec(route),ownView=routeMatch?.[1]??null;
  const remembered=clean(history.findLast(row=>row?.role==='user')?.content);
  const following=/^(?:and |also |what about |how about |show (?:me )?(?:the |my )?|when (?:did|does|will) (?:it|this) |它的|那(?:這|这)?|還有|还有)/iu.test(q);
  const historyViews=following&&legacyTopic.test(mask(remembered))&&!foreign.test(mask(remembered))&&!mutation.test(mask(remembered))?detectViews(mask(remembered)):[];
  const contextual=Boolean(routeMatch)||historyViews.length===1;
  const {native,remaining}=splitQuestions(q,contextual);
  if(!native)return empty;
  const parts=clauses(native),masked=mask(native),selectedViews=detectViews(masked);
  const companions=remaining.join(' and ');
  const companion=negative.test(companions)||foreign.test(mask(companions))?null:companionTool(companions);
  const pending={recognized:true,selection:null,reason:null,question:native,otherQuestion:companions,companion};
  const deny=reason=>({...pending,reason});
  if(foreign.test(masked)||foreignQualifier.test(masked))return deny('foreign_request');
  if(parts.some(value=>mutation.test(mask(value))))return deny('unsupported_operation');
  if(institution.test(masked))return deny('unsupported_authority');
  if(publicGuidance.test(masked)&&!savedContext.test(masked))return empty;
  if(parts.some(value=>/\b(?:for|from)\s+(?:student|account|user)\b/iu.test(mask(value))))return deny('foreign_request');
  if(reviewText.test(masked))return deny('unsupported_field');
  if(parts.every(value=>negative.test(mask(value))))return deny('excluded');
  if(navigation.test(masked)||!recordRequest.test(masked))return empty;
  if(!routeMatch&&route.includes(internshipEvidencePath)&&route!=='')return deny('invalid_route');
  if(selectedViews.length>1||selectedViews.length===1&&ownView&&selectedViews[0]!==ownView)return deny('ambiguous_selector');
  const view=selectedViews[0]??ownView??historyViews[0];
  if(!view||outside.test(masked))return deny('ambiguous_selector');
  const references=[...masked.matchAll(explicitId)].map(match=>(match[1]??match[2]).toLowerCase());
  if(references.some(value=>!uuid.test(value))||new Set(references).size>1)return deny('invalid_reference');
  if(view!=='contract'&&fieldPatterns.dates.test(masked))return deny('unsupported_field');
  const selection={view,recordType:internshipRecordTypes[view],route:internshipEvidencePath+'/'+view,
    recordId:references[0]??null,fields:selectedFields(native,view)};
  return {...pending,selection};
}

export function isInternshipEvidenceQuestion(question,route='',history=[]){
  return internshipLookupContext(question,route,history).recognized;
}

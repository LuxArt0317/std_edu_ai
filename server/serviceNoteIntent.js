import {isOwnFeeBalanceQuestion,ownFeeBalanceLabel} from './pendingFeesAnswer.js';

/** Private local tracking notes supported by these School Affairs pages. */
const topics = {
  '27-1': /\b(?:learning[- ]support|study rewards?|learning rewards?|study assistance)\b|完善就學|學習輔導/iu,
  '30-1': /\b(?:emergency (?:injury|illness|report)|injury (?:report|notes?|record)|emergency injury)\b|緊急傷病/iu,
  '30-2': /\b(?:equipment|items?) (?:borrow\w*|loan|checkout|return|reservation)\b|物品借用/iu,
  '31-1': /\b(?:international|foreign|overseas)[- ]student.{0,30}\b(?:work|employment)|\bwork permits?\b|工作證|境外(?:學生|生)工作/iu,
  '31-2': /\b(?:rentals?|renting|lease)\b|租屋/iu,
  '32-1': /\b(?:campus|school)[- ]service(?: (?:hours?|notes?|track\w*|records?|tasks?|participation))?\b|愛校服務|爱校服务/iu,
  '35-1': /\b(?:(?:group|student)[- ]insurance|insurance (?:notes?|track\w*|claim|coverage)|my insurance)\b|團體保險|团体保险/iu,
};
export const serviceNoteKeys = Object.freeze(Object.keys(topics));
const otherTopic = /\b(?:insurance|notes? on|housing|dorm(?:itory)?|room(?:s)?|leave|internship|counseling|tutor|scholarship|graduation|grades?|class|course|assignment|meeting|medical|clinic|health|tuition|fees?)\b|宿舍|請假|實習|諮商|導師|學費|成績|課表|作業|學習資料|健康/iu;
const note = /\bnotes?\b|\b(?:(?:saved|local|personal|private|self.marked)\s+(?:service\s+)?track\w*|track\w*\s+(?:records?|status|reference))\b|備註|备注|筆記|笔记|(?:私人|本地|站內|已儲存|自己標記).{0,6}(?:追蹤|紀錄|狀態)/iu;
const own = /\b(?:my|mine|our|i|me|own)\b|我|本人|自己/iu;
const omitText = /^(?:(?:please|also|then)\s+)*(?:do not|don['’]t|never|without|not)\s+(?:(?:show|display|include|read|repeat|quote)\s+)?(?:the |my |its |their )?(?:note (?:text|content|contents|body)|text|details|contents|body)\b|^(?:請)?(?:不要|不顯示|不含).{0,6}(?:備註|筆記)?內容$/iu;
const statusOnly = /\b(?:status only|only (?:the |my )?(?:tracking )?status|just (?:the |my )?(?:tracking )?status)\b|只(?:顯示|查詢|要).{0,5}狀態/iu;
const nominal = /^(?:my |our |the |saved |local |private |own )*(?:[\p{L}\p{N} -]+\s)?(?:notes?|tracking records?)\s*$/iu;
const negative = /^(?:(?:please|and|then|also)\s+)*(?:do not|don['’]t|never|not(?!\s+only)|without|excluding|except)\b|^(?:請|请)?(?:不要|不含|排除|不用|不查)/iu;
const navigation = /\b(?:where|how) (?:can|do|should) i (?:find|open|view|access|file|apply|submit|check)|\b(?:give|send|show) me (?:the |a )?link|\b(?:open|link to) (?:my |the )|在哪|哪個(?:頁面|連結)|如何(?:開啟|申請|填寫|提交)|給我.*連結/iu;
const status = /\b(?:records?|history|policy|provider|insurer|expir\w*|reimburse\w*|approval|approved|official|eligib\w*|award|paid|payment|coverage|covered|claim|balance|validat\w*|verified|authorization|authorized|valid|diagnos\w*|scheduled|reserved|available|returned|submitted|complete|completed|status|check[- ]out)\b|紀錄|記錄|历史|歷史|校方|正式|核准|資格|理賠|理赔|保障|薪資|診斷|預約|已歸還|狀態|完成/iu;
const actual = /\b(?:approval|approved|official|eligib\w*|covered|coverage|paid|payment|payout|validat\w*|verified|authoriz\w*|diagnos\w*|inventory|available|reserved|returned|university)\b|校方|正式|核准|資格|理賠|理赔|保障|薪資|診斷|庫存/iu;
const write = /^(?:(?:please|then|also|can you|could you|would you|help me)\s+)*(?:submit|file|send|create|save|update|edit|delete|cancel|withdraw|approve|pay|apply|change|mark)\b|^(?:請|请|幫我|帮我|請幫我)?(?:提交|送出|送件|新增|儲存|保存|修改|刪除|取消|撤回|核准|支付|繳費|申請|標記)/iu;
const actionTarget = /\b(?:application|claim|injury|borrowing|rental|permit|hours?|record|notes?)\b|申請|事故|借用|租屋|工時|紀錄|備註/iu;
const follow = /^(?:(?:and|also|then)\s+)?(?:(?:what|how) about (?:the |my |its )?(?:status|reference|notes?|next step)|(?:what|which) (?:did i (?:save|record|write)|(?:note|reference|status) did i (?:save|record|write))|show (?:its|the|my) (?:notes?|saved reference|tracking status)|what is (?:its|the) (?:status|reference)|what (?:status|reference) did i (?:set|save|write|record) for it)$|^(?:那|還有)?(?:備註|筆記|追蹤狀態|編號|下一步)(?:呢|是什麼)?$/iu;
const command = '(?:my|our|the|show|list|read|check|tell|include|what|which|when|how|where|is|am|do|did|can|never|do not|don[\'’]t|not|without|excluding|except|submit|create|delete|change|mark)';
const split = new RegExp('[;；。!?！？\\n]|\\.(?=\\s|$)|[,，]\\s*(?='+command+'\\b)|\\b(?:also|but|then)\\s+(?='+command+'\\b)|\\s+(?:and|plus)\\s+(?='+command+'\\b)|(?<!\\bdo)\\s+(?=(?:not(?!\\s+only)|without|excluding|except)\\s+)|以及|還有|並且|但是|(?=排除|不含|不要)', 'iu');
const clean = value => typeof value==='string'&&value.length<=4000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''))
  ? value.normalize('NFKC').replace(/\r\n?/gu,'\n').trim() : '';
const parts = value => value.split(split).map(part=>part.trim()).filter(Boolean);
const sentenceParts = value => value.split(/[;；。!?！？\n]|\.(?=\s|$)/u).flatMap(sentence=>{
  let exclusion=false;
  return parts(sentence).map(part=>{
    if(negative.test(part)){exclusion=true;return part;}
    if(exclusion&&nominal.test(part))return 'Do not show '+part;
    exclusion=false;return part;
  });
});

function mentionedKeys(value) {
  const subject=value.split(/\s(?:titled|named|called)\s|(?:標題|名稱)為/iu,1)[0].replace(/["“][^"”]+["”]/gu,'');
  const codes=subject.match(/(?<![\p{L}\d_-])\d{1,3}-\d{1,3}(?![\p{L}\d_-])/gu)||[];
  const explicit=serviceNoteKeys.filter(key=>codes.includes(key));
  return codes.length?explicit:serviceNoteKeys.filter(key=>topics[key].test(subject));
}
function pathKey(route) {
  if(typeof route!=='string'||route.length>3100||/[\p{Cc}\p{Cs}\s\\#]/u.test(route))return null;
  const key=/^(?:https:\/\/stu\.best)?\/school-affairs\/services\/(\d{1,3}-\d{1,3})\/?(?:\?[^#]*)?$/u.exec(route)?.[1];
  return serviceNoteKeys.includes(key)?key:null;
}
function foreign(value) {
  const text=value.replace(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+(?:-[A-Z0-9]+)*\b/gu,'')
    .replace(/\b(?:their|its) (?:references?|titles?|dates?|statuses|contents?)\b/giu,'')
    .replace(/\b(?:for|from|in) (?:january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/giu,'')
    .replace(/\b(?:what|when|where|how|who|it|that|there|here|which|student|school|university)['’]s\b/giu,'');
  return /\b(?:did|does|has|is|was|can|could)\s+(?!(?:i|we|my|our|the|this|that|it|there|any|anyone|you|anybody)\b)[\p{L}][\p{L}’-]*(?:\s+[\p{L}][\p{L}’-]*){0,2}\s+(?:have|has|save|saved|submit|submitted|write|written|file|filed)\b|\b(?:another|other) (?:student|account|person)|\b(?:his|her|their|someone else['’]s)\b|\bmy (?:friend|classmate|roommate|sister|brother|mother|father|parent)\b|\b[\p{L}][\p{L}’-]*['’]s\b|\b(?:for|of|(?:saved|written|submitted|filed|recorded) by|belong(?:s|ing)? to)\s+(?!(?:me|my|the|a|this|that|our|insurance|yourself|stu\.best|it|them|service|services|campus|reference|official|records|notes)\b)[\p{Lu}][\p{L}’-]*\b|別人|他人|其他學生|(?:他|她|他們|她們)的/iu.test(text)
    || [...text.matchAll(/([\p{Script=Han}]{1,24})的\s*(?:完善就學|學習輔導|緊急傷病|物品借用|境外(?:學生|生)工作|工作證|租屋|愛校服務|(?:學生)?團體保險|備註|筆記)/gu)]
      .some(match=>! /^(?:(?:請|请)?(?:顯示|显示|查看|查詢|查询|查|列出|檢查|检查|提供|看看|給我|给我|我想|想看|幫我|帮我))*?(?:我(?:自己|本人)?|本人|自己)(?:已儲存|已保存|私人|站內)?$/u.test(match[1])&&!/^(?:已)?(?:儲存|保存|記錄|記下|標記|留下|填寫|寫下|寫|填)$/u.test(match[1]));
}

/** Route/history can resolve an explicit note request, never change its owner. */
export function serviceNoteLookup(question,route='',history=[]) {
  const current=clean(question),clauses=sentenceParts(current),routeScope=pathKey(route);
  const latest=Array.isArray(history)?clean(history.slice(-6).findLast(row=>row?.role==='user')?.content):'';
  const antecedent=sentenceParts(latest).filter(clause=>note.test(clause)&&!negative.test(clause)&&!navigation.test(clause));
  const linked=antecedent.length===1?mentionedKeys(antecedent[0]):[];
  const keys=new Set(),boundaryKeys=new Set(),noteClauses=[],rest=[];
  let foreignRequest=false,excluded=false,operation=false,invalidService=false,statusProjection=false;
  for(const clause of clauses){
    const direct=mentionedKeys(clause),matchesFollow=follow.test(clause);
    if(!direct.length&&note.test(clause)&&/(?:\bservice(?:\s+(?:id|number|code))?\s*#?\s*|服務(?:編號)?)\d{1,3}-\d{1,3}\b/iu.test(clause)){
      invalidService=true;continue;
    }
    if(omitText.test(clause)){statusProjection=true;continue;}
    if(!direct.length&&(isOwnFeeBalanceQuestion(clause)||ownFeeBalanceLabel(clause)!==null)){rest.push(clause);continue;}
    const selected=direct.length?direct:matchesFollow&&linked.length?linked:(note.test(clause)&&!otherTopic.test(clause)||matchesFollow)&&routeScope?[routeScope]:[];
    if(!selected.length||navigation.test(clause)){rest.push(clause);continue;}
    if(negative.test(clause)){
      excluded=true;
      for(const key of selected)keys.delete(key);
      continue;
    }
    if((note.test(clause)||status.test(clause)||write.test(clause)||matchesFollow)&&foreign(clause)||matchesFollow&&linked.length&&!direct.length&&foreign(antecedent[0])){foreignRequest=true;continue;}
    if(write.test(clause)&&actionTarget.test(clause)||!note.test(clause)&&!matchesFollow&&own.test(clause)&&status.test(clause)){
      for(const key of selected)boundaryKeys.add(key);
      operation ||= write.test(clause)&&note.test(clause);
      continue;
    }
    if((note.test(clause)||matchesFollow)&&(own.test(clause)||direct.length||matchesFollow||routeScope)){
      for(const key of selected)keys.add(key);
      statusProjection ||= statusOnly.test(clause);
      noteClauses.push({clause,selected});
      if(actual.test(clause)&&!(/\b(?:what did i (?:save|write|record)|what (?:does|did) (?:my|the) note say)\b/iu.test(clause)))
        for(const key of selected)boundaryKeys.add(key);
    }else rest.push(clause);
  }
  const selected=foreignRequest?[]:[...keys];
  const boundary=[...boundaryKeys];
  return {keys:selected,noteQuestion:noteClauses.filter(row=>row.selected.some(key=>keys.has(key))).map(row=>row.clause).join('\n'),
    otherQuestion:rest.join('. '),foreign:foreignRequest,excluded,invalidService,statusOnly:statusProjection,officialOnly:boundary.length>0&&!selected.length,operation,boundaryKeys:boundary};
}
export function isServiceNoteEvidenceQuestion(question,route='',history=[]) {
  const lookup=serviceNoteLookup(question,route,history);
  return lookup.foreign||lookup.invalidService||lookup.excluded||lookup.keys.length>0||lookup.officialOnly;
}

export const isServiceNoteNextClass = value => /^(?:(?:(?:please|show me|tell me|what(?: time)?(?: is|['’]s)|when is)\s+)*(?:my\s+)?next (?:scheduled )?class|(?:what|which) class do i have next)$|^(?:告訴我|請問|查詢|我的)*(?:下一堂課|下堂課)(?:是什麼|是甚麼|的時間)?$/iu.test(value);

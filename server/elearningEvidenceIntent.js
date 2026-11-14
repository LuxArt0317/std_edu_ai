const remoteName=/\b(?:digital academy|e-learning|elearning|remote[- ]learning(?: Moodle)?)\b|數位學園|远程学习|遠距教學/iu;
const localDtm=/\b(?:dtm|digital teaching materials)\b|數位教材|数位教材|教材網/iu;
const personal=/\bmy\s+(?:(?:saved|recorded|local|remote[- ]learning|e-learning|elearning|Moodle|current|past|future|upcoming|unfinished|completed|pending|all|DTM|digital academy|school affairs)\s+){0,6}(?:courses?|classes|enrollments?|grades?|marks?|assignments?|submissions?|attendance|records?)\b|\bmine\b|\b(?:i (?:am|was|have|joined|enrolled|take|took)|(?:am|was|did|do|have|can) i)\b|(?:我的|本人(?:的)?)(?:數位學園|遠距教學|已儲存|已保存|未完成|本學期|目前|所有)*(?:課程|课程|選課|选课|成績|成绩|作業|作业|出席|考勤|紀錄|记录)|我(?:有|選|选|报|報|加入|修)/iu;
const foreign=/\b(?:another|other)\s+(?:student|user|account|person)\b|\b(?:his|her|their)\s+(?:(?:remote[- ]learning|e-learning|elearning|Moodle|saved|local|current)\s+){0,4}(?:courses?|classes|enrollments?|grades?|assignments?)\b|\b(?:classmate|friend|roommate|sister|brother|mother|father|parent|partner)(?:['’]s|\s+(?:(?:is|was)\s+)?(?:enrolled|taking|joined|take|takes))\b|\bmy\s+[\p{L}]+\s+(?:(?:is|was)\s+)?(?:enrolled|taking|joined|take|takes)\b|\b(?:courses?|classes|enrollments?)\s+of\s+my\s+[\p{L}]+\b|\b[\p{L}][\p{L}’-]*['’]s\s+(?:(?:remote[- ]learning|e-learning|elearning|Moodle|saved|local|current)\s+){0,4}(?:courses?|classes|enrollments?|grades?|assignments?)\b|\b(?:is|was|has|does|did)\s+(?!(?:i|my|the|this|that|it|there|your)\b)[\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,2}\s+(?:enrolled|taking|joined)\b|別人|他人|其他(?:學生|学生)|同學的|同学的|(?:他|她|他們|她們)的/iu;
const operation=/^(?:(?:please|could you|can you)\s+)*(?:join|enroll(?: me)?|unenroll|withdraw|submit|upload|delete|change|share)\b|\bhow (?:do|can|should) i (?:join|enroll|withdraw|submit|upload)\b|^(?:請|请)?(?:幫我|帮我|替我)?(?:加選|加选|退選|退选|加入|報名|报名|繳交|提交|上傳|上传)/iu;
const privateRecord=/\b(?:assignments?|grades?|marks?|submissions?|attendance)\b|作業|作业|成績|成绩|出席|考勤|繳交|提交/iu;
const followUp=/^(?:(?:and|also|what about)\s+)?(?:list (?:them|those)|when did i (?:enroll|join)|what are (?:their|the) names|how many (?:are there|did i join))[?.!]*$|^(?:那些呢|什麼時候加入|哪時候加入|共有幾門)[？。！]*$/iu;
const suppress=/^(?:(?:please\s+)?(?:do not|don't|never)\s+(?:show|list|read|check|include|look up)|(?:exclude|excluding|without)\b|(?:請|请)?不要(?:顯示|显示|列出|查詢|查询|包含))/iu;
const clauses=value=>value.split(/[?？!！;；。\n,，、]|\.(?:\s+|$)|\s+(?:and\s+then|and|also|plus|but)\s+|以及|還有|还有|但是/iu).map(part=>part.trim()).filter(Boolean);
const questionText=value=>typeof value==='string'&&value.length<=12000?value.normalize('NFKC').trim():'';
const enrollmentRecord=/\b(?:courses?|classes|enrollments?|enrolled|join(?:ed)?|taking)\b|課程|课程|選課|选课|修課|加入|報名|报名/iu;
const continuation=/^(?:(?:my|the|all|saved|recorded|current|unfinished|pending|completed|their|its|remote[- ]learning|e-learning|elearning|Moodle|DTM|school affairs)\s+)*(?:courses?|classes|enrollments?|grades?|marks?|assignments?|submissions?|attendance|enrollment dates?|joined dates?|names)(?:[.!]|\s+(?:too|as well))?$|^(?:我的|已儲存|已保存|未完成|已完成|數位學園|遠距教學|數位教材)*(?:課程|课程|選課|选课|成績|成绩|作業|作业|出席|考勤|繳交|提交|加入時間)[。！]*$/iu;
const contextualRoute=route=>typeof route==='string'&&/^\/elearning(?:\/|\?|$)/u.test(route);
const otherService=/\b(?:tuition|fees?|balance|school affairs|transcript|next class|scheduled class|facility repair|housing|dormitory)\b|學費|学费|校務|歷年成績|缺曠|報修|宿舍/iu;

function analyze(question,route='',history=[]){
  const current=questionText(question);
  if(!current)return [];
  const previous=Array.isArray(history)?questionText(history.slice(-6).findLast(item=>item?.role==='user'&&typeof item.content==='string')?.content):'';
  const priorOwn=previous?analyze(previous,route,[]).some(part=>part.enrollment):false;
  let sharedSource=null,sharedOwner=false,sharedSuppressed=false;
  return clauses(current).map(part=>{
    const explicit=localDtm.test(part)?'dtm':otherService.test(part)?'other':remoteName.test(part)?'remote':null;
    const continued=continuation.test(part),follow=followUp.test(part)&&priorOwn;
    const suppressed=suppress.test(part)||Boolean(continued&&!explicit&&sharedSuppressed),blocked=suppressed||operation.test(part);
    const source=explicit||(continued?sharedSource:null)||(contextualRoute(route)?'remote':null);
    const owned=personal.test(part)||(continued&&sharedOwner)||follow;
    // "my courses and their enrollment dates" refers to the named own courses;
    // an independent "their remote-learning enrollments" still has no own scope.
    const foreignSubject=foreign.test(part)&&!(continued&&!explicit&&sharedOwner&&sharedSource==='remote');
    if(explicit||!continued){sharedSource=source;sharedOwner=!blocked&&personal.test(part)&&!foreignSubject;sharedSuppressed=suppressed;}
    // A shared qualifier belongs to a coordinated noun list, never an unrelated
    // full new sentence. A new explicit service always resets its source.
    const remote=source==='remote'||follow;
    return {part,source,suppressed,foreign:foreignSubject,enrollment:!blocked&&!foreignSubject&&remote&&owned&&(enrollmentRecord.test(part)||follow),
      unsupported:!blocked&&!foreignSubject&&remote&&owned&&privateRecord.test(part)};
  });
}

/** Source/ownership inheritance is limited to coordinated record nouns. */
export function selectElearningEvidence(question,route='',history=[]){
  if(isForeignElearningRecordsQuestion(question,route))return null;
  const parts=analyze(question,route,history),enrollment=parts.some(part=>part.enrollment),unsupported=parts.some(part=>part.unsupported);
  return enrollment||unsupported?{enrollment,unsupported}:null;
}

export function isElearningEvidenceQuestion(question,route='',history=[]){
  return selectElearningEvidence(question,route,history)!==null;
}

export function isForeignElearningRecordsQuestion(question,route=''){
  return analyze(question,route,[]).some(({part,source,suppressed,foreign:subject})=>!suppressed&&subject
    &&source==='remote'&&(enrollmentRecord.test(part)||privateRecord.test(part)));
}

/** Remote-learning coursework must never select the DTM tracker by accident. */
export function hasIndependentDtmWork(question,route='',history=[]){
  return analyze(question,route,history).some(part=>!part.suppressed&&!part.enrollment&&!part.unsupported
    &&part.source!=='other'&&privateRecord.test(part.part));
}

export function independentElearningQuestion(question,route='',history=[]){
  return analyze(question,route,history).filter(part=>!part.suppressed&&!part.enrollment&&!part.unsupported).map(part=>part.part).join('\n');
}

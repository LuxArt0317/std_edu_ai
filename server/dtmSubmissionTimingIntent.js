import {dtmAssignmentRoute} from './dtmAssignmentEvidenceIntent.js';

const timing=/\b(?:late|lateness|on[ -]time|early|before (?:its|the) deadline|(?:after|past) (?:its|the) deadline|(?:meet|met|miss(?:ed)?) (?:its|the) deadline)\b|遲交|迟交|逾期|準時|准时|超過截止|超过截止|晚了|多晚|提早/iu;
const submission=/\b(?:submi(?:t|tted|ssions?)|assignments?|homework|uploads?|uploaded|files?|hand(?:ed)? (?:it |this assignment )?in|turn(?:ed)? (?:it |this assignment )?in)\b|作業|作业|繳交|缴交|提交|上傳|上传/iu;
const shortTiming=/^(?:please[ ,]+)?(?:(?:was|were) (?:it|i|we|this|that) (?:really )?(?:late|early|on time|past the deadline)|how (?:late|early) (?:was|were) (?:it|i|we)|did i (?:miss|meet) the deadline|(?:有|是否|是不是)?(?:遲交|迟交|逾期|準時|准时)(?:了)?(?:嗎|吗)?)[?!.？。！]*$/iu;
const exactPage=/^\/dtm\/course\/[^/]+\/assignment\//u;
const explicitDtm=/\b(?:dtm|moodle|digital teaching materials)\b|數位教材|数位教材/iu;
const anotherService=/\b(?:tuition|fees?|aid|scholarships?|loan|leave (?:application|request)|housing|counseling|attendance|grade(?:s|book)?|feedback|digital academy|e-learning|elearning|remote[ -]learning)\b|學費|学费|獎學金|奖学金|請假|请假|住宿|成績|成绩|評語|评语|數位學園/iu;
const foreign=/\b(?:his|her|their|someone else['’]s|another (?:person|student|user)|other (?:person|student|user))\b|\bmy\s+(?:friend|classmate|roommate|brother|sister)\b|\b(?!(?:assignment|submission|homework|upload|file|it|that|this)\b)[\p{L}\d_-]+['’]s\s+(?:assignment|homework|submission|upload|file)\b|(?:他人|別人|别人|其他學生|其他学生|同學|同学|朋友|他|她)的(?:作業|作业|繳交|缴交|提交)|(?:[\p{Script=Han}]{2,6})(?:同學|同学)的/iu;
const earlier=/\b(?:first|original|initial|old|older|earlier|previous|prior|retired|every|all)\s+(?:submission|revision|file|upload|attempt|version)\b|\b(?:revision|version|attempt)\s*#?\s*\d+|\bbefore (?:i|the file was) (?:replaced|resubmit(?:ted)?)\b|首次|初次|第一次|上一(?:次|版)|前一(?:次|版)|舊版|旧版|原版|歷次|历次/iu;
const operation=/^(?:(?:please|can you|could you|would you)\s+)*(?:mark|set|change|edit|delete|replace|record|submit|upload)\b|^(?:請|请)?(?:幫我|帮我|替我)?(?:標記|标记|修改|刪除|删除|登記|登记|上傳|上传|提交)/iu;
const policy=/\b(?:can|may|could|should|will|would) i (?:still )?(?:submit|upload|turn|hand)\b|\b(?:late (?:submission|work) policy|grace period|late penalty)\b|能否|可以補交|可以补交|遲交規則|迟交规则|遲交扣分|迟交扣分/iu;
const exclude=/\b(?:do not|don't|never)\s+(?:show|tell|check|read|look up)\b|(?:請|请)?不要(?:顯示|显示|告訴|告诉|查詢|查询)/iu;
const explicitTarget=/\b(?:course|assignment|upload|revision|submission)\s+id\b|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b|["“][^"”]+["”]|「[^」]+」/iu;
const currentPage=/\b(?:this|current|latest|most recent)\s+(?:saved\s+)?(?:assignment|submission|upload|file|revision|attempt)\b|這(?:份|個|个|次)|本次|目前|最新/iu;
const priorContext=/\b(?:deadline|due date|submission time)\b|期限|截止|繳交時間|提交时间/iu;
const wallClock=/^(?:(?:and|what about|how about)\s+)?(?:in\s+)?(?:utc|taipei(?: time)?|taiwan(?: time)?)[?!.]*$|^(?:那)?(?:換成|换成|改用|顯示|显示)?(?:utc|臺灣時間|台灣時間|台湾时间|台北時間)[？。！]*$/iu;
const utc=/\butc\b/iu, taipei=/\b(?:taipei|taiwan)\b|臺灣時間|台灣時間|台湾时间|台北時間/iu;
const sameTimingClause=/\b(?:by how (?:much|long)|how (?:late|early|long)(?: was (?:it|i))?|in (?:utc|taipei(?: time)?|taiwan(?: time)?))\b|遲了多久|迟了多久|差了多久|晚了多久|逾期多久|多晚|(?:utc|臺灣時間|台灣時間|台湾时间|台北時間)/iu;
const previousQuestion=history=>Array.isArray(history)?history.slice(-6).findLast(item=>item?.role==='user'&&typeof item.content==='string')?.content??'':'';

export function selectDtmSubmissionTiming(question,route='',history=[]){
  if(typeof question!=='string'||question.length>2000)return null;
  const text=question.normalize('NFKC').trim();
  const prior=previousQuestion(history).normalize('NFKC');
  const path=dtmAssignmentRoute(route);
  const onAssignment=path||exactPage.test(route);
  const clauses=text.split(/[?？;；\n]|\s+(?:and|also|plus|then)\s+|以及|還有|还有/iu).map(value=>value.trim()).filter(Boolean);
  const primary=(clauses[0]??'').replace(/\s+in (?:utc|taipei(?: time)?|taiwan(?: time)?)\s*$/iu,'').replace(/[, ]+$/u,'');
  const followup=shortTiming.test(primary)||wallClock.test(text);
  if(!(onAssignment||explicitDtm.test(text))||exclude.test(text)||policy.test(text)||anotherService.test(text))return null;
  if(!((timing.test(text)&&(submission.test(text)||shortTiming.test(primary)))||(onAssignment&&wallClock.test(text)&&timing.test(prior))))return null;
  // Leave unrelated clauses to the existing mixed-source handler.
  if(clauses.slice(1).some(clause=>!sameTimingClause.test(clause)&&!shortTiming.test(clause)))return null;
  const reason=foreign.test(text)||followup&&foreign.test(prior)?'foreign':operation.test(text)?'operation'
    :earlier.test(text)||followup&&earlier.test(prior)?'history'
    :!path||explicitTarget.test(text)||followup&&prior&&(anotherService.test(prior)||explicitTarget.test(prior)
      ||!(submission.test(prior)||timing.test(prior)||priorContext.test(prior)))
      ||!currentPage.test(text)&&/\b(?:for|on)\s+(?:assignment|homework|upload|submission)\s+\S|(?:作業|作业)[「『]/iu.test(text)?'choose':null;
  const zone=utc.test(text)&&taipei.test(text)?'both':utc.test(text)?'utc':'taipei';
  return {path:path?.url??null,courseId:path?.courseId??null,assignmentId:path?.assignmentId??null,zone,reason};
}

export function dtmSubmissionTimingBoundary(selection,question,signedIn=true){
  const zh=/\p{Script=Han}/u.test(question);
  const t=(en,cn)=>zh?cn:en;
  const {path,reason}=selection;
  const login='/dtm/login'+(path?'?next='+encodeURIComponent(path):'');
  const loginTitle=t('Sign in to DTM','登入數位教材網');
  const needsSignIn=!signedIn&&(!reason||reason==='choose');
  const answer=reason==='foreign'?t('I can only check the submission saved under your own account.','我只能查詢目前登入帳戶的繳交資料。')
    :reason==='operation'?t('This lookup reads submission timing. Use the assignment page to manage the saved submission.','這項查詢只會讀取繳交時間。請從作業頁管理繳交資料。')
    :reason==='history'?t('The deadline saved with a prior file revision is unavailable. I can check the timing of the currently saved file.','先前檔案版本的截止時間無法查詢。我可以核對目前儲存檔案的繳交時間。')
    :needsSignIn?t('Sign in to check when your saved file was submitted.','請登入以查詢您的檔案繳交時間。')+'\n\n['+loginTitle+']('+login+')'
    :t('Open the exact assignment page and ask about the saved submission there.','請開啟指定作業頁，再詢問該作業的繳交時間。');
  return {status:reason==='choose'&&signedIn?'clarification':'handoff',answer,
    citations:needsSignIn?[{chunkId:'directory:dtm-signin',title:loginTitle,url:login}]:[],suggestedQuestions:[],
    grounding:{source:signedIn?'account':'directory',webSearched:false}};
}

import {studentConductScope} from './studentConductEvidenceScope.js';
import {selectTutorEvaluationEvidence,isTutorEvaluationFieldClause,withoutExcludedTutorEvaluationClause} from './tutorEvaluationEvidenceIntent.js';
import {tutorEvaluationEvidenceMaxBytes,unavailableTutorEvaluationEvidence} from './accountTutorEvaluationEvidence.js';
import {selectClearanceEvidence,isClearanceFieldClause,withoutExcludedClearanceClause,isExactClearanceNextClassQuestion} from './clearanceEvidenceIntent.js';
import {clearanceEvidenceMaxBytes,unavailableClearanceEvidence} from './accountClearanceEvidence.js';
import {selectCounselingEvidence,isCounselingFieldClause,withoutExcludedCounselingClause} from './counselingEvidenceIntent.js';
import {counselingEvidenceMaxBytes,unavailableCounselingEvidence} from './accountCounselingEvidence.js';
import {selectFeeRemissionEvidence,isFeeRemissionPeriodClause} from './feeRemissionEvidenceIntent.js';
import {feeRemissionEvidenceMaxBytes,unavailableFeeRemissionEvidence} from './accountFeeRemissionEvidence.js';
import {selectHealthExaminationEvidence,isHealthExaminationPageClause,isHealthExaminationFieldClause,withoutExcludedHealthClause} from './healthExaminationEvidenceIntent.js';
import {healthExaminationEvidenceMaxBytes,unavailableHealthExaminationEvidence} from './accountHealthExaminationEvidence.js';
import {isOwnFeeBalanceQuestion,ownFeeBalanceLabel} from './pendingFeesAnswer.js';
import {isStudentConductEvidenceQuestion,studentConductEvidenceMaxBytes} from './accountStudentConductEvidence.js';
import {isStudentLoanEvidenceQuestion,studentLoanEvidenceMaxBytes} from './accountStudentLoanEvidence.js';
import {isAidPaymentsEvidenceQuestion,aidPaymentsEvidenceMaxBytes} from './accountAidPaymentsEvidence.js';
import {aidPaymentsPageSize,aidPaymentsPaths} from './aidPaymentsContract.js';
import {dtmGradeReportEvidenceMaxBytes,unavailableDtmGradeReportEvidence} from './accountDtmGradeReportEvidence.js';
import {mentionsDtmSubmissionDetail,shouldReadNativeDtmGrades} from './dtmGradeEvidenceIntent.js';
import {elearningEvidenceMaxBytes,unavailableElearningEvidence} from './accountElearningEvidence.js';
import {independentElearningQuestion,isElearningEvidenceQuestion} from './elearningEvidenceIntent.js';
import {isCatalogEvidenceQuestion} from './accountCatalogEvidence.js';
import {isCertificateEvidenceQuestion} from './accountCertificateEvidence.js';
import {isSubmissionEvidenceQuestion} from './accountSubmissionEvidence.js';
import {isTuitionEvidenceQuestion} from './accountTuitionEvidence.js';
import {normalizeSyllabusSearchQuery} from './syllabusSearch.js';
import {formatSupplementalAccountAnswers} from './supplementalAccountAnswers.js';
import {isFacilityRepairEvidenceQuestion} from './facilityRepairEvidenceIntent.js';
import {selectDormitoryConductEvidence,isDormitoryConductEvidenceQuestion} from './dormitoryConductEvidenceIntent.js';
import {selectElearningOutlineEvidence,isElearningOutlineEvidenceQuestion} from './elearningOutlineEvidenceIntent.js';
import {dormitoryConductEvidenceMaxBytes,unavailableDormitoryConductEvidence} from './accountDormitoryConductEvidence.js';
import {elearningOutlineEvidenceMaxBytes,unavailableElearningOutlineEvidence} from './accountElearningOutlineEvidence.js';
import {facilityRepairEvidenceMaxBytes,unavailableFacilityRepairEvidence} from './accountFacilityRepairEvidence.js';

export const supplementalAccountTools=Object.freeze({
  courseCatalog:'Published local sample course offerings and syllabus plans, independent of enrollment. Supports exact offering IDs and validated keyword/term/department/theme search.',
  enrollmentCertificate:'Own saved enrollment-certificate assessment, literal independent pending-fee flag/status and individually requested identity fields; no issuance/download capability.',
  dtmSubmissions:'Own saved DTM assignment file metadata and revision-specific reviews; current files, retained older reviews and pending reservations are distinct. No file content or upload action.',
  studentConduct:'Own saved student conduct rows, including reason, quantity and void text. Different from dormitory conduct or official clearance.',
  studentLoan:'Own saved student loan application state, progress and history metadata. No disbursement, payment or official approval.',
  tuition:'Own literal saved tuition settlement statements/periods at49-1, plus explicit unavailable file capabilities at48-1/48-3 and extended-study records at48-2; not charges, balances or payment ledger.',
  aidPayments:'Own saved student aid claims and salary records, with separate counts, exact periods, amounts, deductions and approval text. Independent from financial aid applications, student loans, tuition, and bank transfers.',
  dtmGradeReport:'Own native DTM grade report and grades overview. Literal report items, feedback and saved total values. Separate from the personal grade tracker, file reviews, and School Affairs transcript.',
  elearningEnrollments:'Saved local remote-learning Moodle course enrollments and joined times. Separate from DTM and School Affairs. Does not contain personal remote-learning grades, assignments, submissions or attendance.',
  facilityRepairs:'Own saved local facility-repair reports and exact status; requested latest saved handling note with unknown event author. Separate from housing and generic service trackers. No cancellation, technician messaging, dispatch or proof of physical repair.',
  dormitoryConduct:'Own saved dormitory conduct notice metadata at34-2, distinct from student conduct and housing beds/fees. Empty notice metadata does not establish complete disciplinary history, clearance or an official document. Read-only.',
  feeRemission:'Own saved local fee reduction history at service 21-3, with literal year, semester, category, amount and check status. Separate from the charge balance, eligibility, approval and payment. Read-only.',
  tutorEvaluation:'Own saved tutor questionnaire submission, requested numbered ratings and explicit comment. Read-only.',
  graduationClearance:'Own saved graduation clearance application status and requested office notes, plus assigned application periods. Separate from the graduation requirements report. Read-only.',
  counselingAppointments:'Own saved counseling and psychological-assessment appointment dates, preferred periods and status. No notes, documents, staff queue or appointment actions.',
  healthExaminations:'Own saved health examination codes and report availability, scoped to the selected page at service 36-1. No clinical results, dates, identity details, file access or writes.',
  elearningOutline:'Authorized local remote-learning course outline, section/activity titles and local video/slides/feedback/attendance-form links. No personal attendance, grades, submissions, video contents or completion records. Read-only.',
});
const predicates={courseCatalog:isCatalogEvidenceQuestion,enrollmentCertificate:isCertificateEvidenceQuestion,dtmSubmissions:isSubmissionEvidenceQuestion,tuition:isTuitionEvidenceQuestion,studentConduct:isStudentConductEvidenceQuestion,studentLoan:isStudentLoanEvidenceQuestion,aidPayments:isAidPaymentsEvidenceQuestion,dtmGradeReport:shouldReadNativeDtmGrades,elearningEnrollments:isElearningEvidenceQuestion,facilityRepairs:isFacilityRepairEvidenceQuestion,dormitoryConduct:isDormitoryConductEvidenceQuestion,elearningOutline:isElearningOutlineEvidenceQuestion,feeRemission:selectFeeRemissionEvidence,healthExaminations:selectHealthExaminationEvidence,counselingAppointments:selectCounselingEvidence,graduationClearance:selectClearanceEvidence,tutorEvaluation:selectTutorEvaluationEvidence};
const keys=Object.keys(supplementalAccountTools),plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const sourceLimits={courseCatalog:18000,enrollmentCertificate:12000,dtmSubmissions:24000,tuition:16000,studentConduct:studentConductEvidenceMaxBytes,studentLoan:studentLoanEvidenceMaxBytes,aidPayments:aidPaymentsEvidenceMaxBytes,dtmGradeReport:dtmGradeReportEvidenceMaxBytes,elearningEnrollments:elearningEvidenceMaxBytes,facilityRepairs:facilityRepairEvidenceMaxBytes,dormitoryConduct:dormitoryConductEvidenceMaxBytes,elearningOutline:elearningOutlineEvidenceMaxBytes,feeRemission:feeRemissionEvidenceMaxBytes,healthExaminations:healthExaminationEvidenceMaxBytes,counselingAppointments:counselingEvidenceMaxBytes,graduationClearance:clearanceEvidenceMaxBytes,tutorEvaluation:tutorEvaluationEvidenceMaxBytes};
export const supplementalEvidenceBudget=54000;
export const withoutExcludedNativePageClause=question=>withoutExcludedTutorEvaluationClause(withoutExcludedClearanceClause(withoutExcludedCounselingClause(withoutExcludedHealthClause(question))));
/** One shared server-side boundary for API snapshot loading and graph planning.
 * Recognized repair clauses do not authorize unrelated account collections.
 * Preserve unknown independent clauses for normal planning, never silently
 * claim a repair-only answer covers them. This text is query context, not fact. */
export function facilityRepairLookupContext(question,route='',history=[]){
  if(!isFacilityRepairEvidenceQuestion(question,route,history))return {selected:false,repairOnly:false,scheduleOnly:false,otherQuestion:question,repairQuestion:question};
  const independent=/\b(?:salary|tuition|fees?|grades?|courses?|class(?:es)?|assignments?|scholarships?|loans?|leave|enrollments?|certificates?|clubs?|housing|dormitory|tasks?|announcements?|profile)\b|薪資|學費|成績|課程|作業|請假|社團|住宿|獎學金|下一堂|課表/iu;
  const repairContext=[{role:'user',content:question}];
  const other=[],repairParts=[];let priorScope='repair';
  for(const part of question.split(/[.!?;；。！？\n]|\s+(?:and|also|plus)\s+|以及|還有|並且/iu).map(part=>part.trim()).filter(Boolean)){
    const explicitRepair=/\b(?:repairs?|maintenance)\b|報修|报修/iu.test(part)&&isFacilityRepairEvidenceQuestion(part,route,repairContext);
    // Bare continuations such as "and room" belong to the preceding class
    // clause; they must not become permission to read a repair's location.
    if(independent.test(part)||priorScope==='other'&&!explicitRepair){other.push(part);priorScope='other';continue;}
    if(explicitRepair||isFacilityRepairEvidenceQuestion(part,route,repairContext)
      ||/^(?:(?:list|show|include|each|every|all|the|my|reference|references|count|total|exact|saved|status|statuses)\b|[\s,:-])+$/iu.test(part)
      ||/\b(?:technician|handling note|note author|author role|authorship|physical repair)\b|技師|技工|處理註記|作者|實際修復/iu.test(part)){
      repairParts.push(part);priorScope='repair';
    }else{other.push(part);priorScope='other';}
  }
  const otherQuestion=other.join(' and ');
  const schedule=/\b(?:class(?:es)?|timetable|schedule)\b|下一堂|課表/iu.test(otherQuestion);
  const scheduleWords=/^(?:(?:when|where|what|which|is|are|does|do|i|my|me|the|a|an|next|scheduled|school|affairs|class|classes|course|courses|timetable|schedule|date|day|time|start|starts|room|location|in|on|at|have|show|tell|remind|please|also|and)\b|[\s,:-])+$/iu;
  const scheduleOnly=schedule&&(scheduleWords.test(otherQuestion)||/^(?:請問|請|顯示|告訴我|我|的|下一堂|課|課表|時間|教室|在哪裡|幾點|以及|和|[，、\s])+$/u.test(otherQuestion));
  return {selected:true,repairOnly:!otherQuestion,scheduleOnly,otherQuestion,repairQuestion:otherQuestion&&repairParts.length?repairParts.join(' and '):question};
}
function isFeeRemissionFollowup(part,operation){
  const [field,period]=part.split(/\s+(?=(?:for|in|during)\s+)/iu);
  const fieldOnly=/^(?:(?:(?:show|include|check)\s+)?(?:my|the|its|saved|recorded)\s+)*(?:categor(?:y|ies)|amount|check status|notes?|student (?:number|id)|approval|eligibility|payout|payment|refund|(?:record )?count|number of (?:saved )?(?:remission )?records)(?:\s+(?:too|separately))?$/iu;
  return fieldOnly.test(field)&&(!period||isFeeRemissionPeriodClause(part.slice(field.length).trim()))
    ||operation&&/^(?:submit|send)\s+(?:it|that|this)\s+to\s+(?:the\s+)?(?:school|university)$/iu.test(part);
}

/** Isolate these native page requests from independent clauses. The original
 * selectors still decide identity/IDs. Residual text is untrusted query context,
 * never evidence; uncertain clauses stay with the normal planner. */
export function nativePageLookupContext(question,route='',history=[]){
  const studentConduct=studentConductScope(question,route,history);
  const selections={studentConduct:studentConduct.selected||studentConduct.foreign?studentConduct:null,dormitoryConduct:selectDormitoryConductEvidence(question,route,history),elearningOutline:selectElearningOutlineEvidence(question,route,history),feeRemission:selectFeeRemissionEvidence(question,route,history),healthExaminations:selectHealthExaminationEvidence(question,route,history),counselingAppointments:selectCounselingEvidence(question,route,history),graduationClearance:selectClearanceEvidence(question,route,history),tutorEvaluation:selectTutorEvaluationEvidence(question,route,history)};
  const tools=Object.keys(selections).filter(key=>selections[key]);
  if(tools.length===1&&selections.studentConduct){
    const residual=studentConduct.otherQuestion;
    const feeChargeLabel=ownFeeBalanceLabel(residual);
    return {tools,selected:true,readerOnly:!residual,otherQuestion:residual,questions:{studentConduct:studentConduct.question},
      foreign:studentConduct.foreign,feeAndBalance:feeChargeLabel!==null||isOwnFeeBalanceQuestion(residual),feeChargeLabel,
      clearanceAndNextClass:isExactClearanceNextClassQuestion(residual)};
  }
  if(!tools.length)return {tools,selected:false,readerOnly:false,otherQuestion:question,questions:{},foreign:false,feeAndBalance:false,feeChargeLabel:null,clearanceAndNextClass:false};
  const unquoted=value=>value.replace(/["]([^"\n]*)["]|“[^”]*”|「[^」]*」/gu,'');
  const comparative=/\b(?:compare|versus|difference between)\b|比較/iu.test(question);
  const quoted=[];let masked=question.replace(/["]([^"\n]*)["]|“[^”]*”|「[^」]*」/gu,match=>{quoted.push(match);return '\ue000'+(quoted.length-1)+'\ue001';});
  masked=masked.replace(/\s+(?:including|together with|along with|as well as)\s+(?=(?:my|our|the|student|school|housing|tuition)\b)/giu,' and ');
  if(comparative)masked=masked.replace(/\s+(?:with|versus|vs\.?)\s+/giu,' and ');
  const parts=masked.split(/[;；。!?！？\n,，]|\.(?:\s+|$)|\s+(?:and|also|plus|but)\s+|\s+(?=(?:without|except|excluding)\b)|(?<!\bdo)(?<!\s)\s+(?=not(?!\s+only)\b)|以及|還有|並且|(?=排除|不含)/iu)
    .map(part=>part.replace(/\ue000(\d+)\ue001/gu,(_,index)=>quoted[Number(index)]).trim()).filter(Boolean);
  const collected=Object.fromEntries(tools.map(key=>[key,[]])),other=[];
  const independent=/\b(?:tuition|salary|grades?|gpa|scholarships?|school affairs|student conduct|next (?:scheduled )?class|timetable|class schedule|housing application|housing fees?|assigned beds?|dormitory beds?|enrollments?|joined|dtm|digital teaching materials|unpaid|charges?)\b|學費|薪資|獎學金|校務|學生獎懲|下一堂|課表|住宿申請|住宿費|床位|選課|加入時間|數位教材/iu;
  const feeClauses=new Set();
  if(selections.feeRemission){
    parts.forEach((part,index)=>{if(selectFeeRemissionEvidence(part))feeClauses.add(index);});
    for(const index of [...feeClauses])for(const direction of [-1,1]){
      for(let cursor=index+direction;parts[cursor]&&isFeeRemissionPeriodClause(parts[cursor]);cursor+=direction)feeClauses.add(cursor);
    }
  }
  const healthClauses=new Set();
  if(selections.healthExaminations){
    parts.forEach((part,index)=>{if(selectHealthExaminationEvidence(part))healthClauses.add(index);});
    for(const index of [...healthClauses])for(const direction of [-1,1]){
      for(let cursor=index+direction;parts[cursor]&&(isHealthExaminationPageClause(parts[cursor])||isHealthExaminationFieldClause(parts[cursor]));cursor+=direction)healthClauses.add(cursor);
    }
  }
  const counselingClauses=new Set();
  if(selections.counselingAppointments){
    parts.forEach((part,index)=>{if(selectCounselingEvidence(part))counselingClauses.add(index);});
    for(const index of [...counselingClauses]){
      for(let cursor=index+1;parts[cursor]&&isCounselingFieldClause(parts[cursor]);cursor++)counselingClauses.add(cursor);
    }
  }
  const clearanceClauses=new Set();
  if(selections.graduationClearance){
    parts.forEach((part,index)=>{if(selectClearanceEvidence(part))clearanceClauses.add(index);});
    for(const index of [...clearanceClauses]){
      for(let cursor=index+1;parts[cursor]&&isClearanceFieldClause(parts[cursor]);cursor++)clearanceClauses.add(cursor);
    }
  }
  const studentConductClauses=new Set();
  if(selections.studentConduct){
    parts.forEach((part,index)=>{if(studentConductScope(part,'',[]).selected)studentConductClauses.add(index);});
  }
  const tutorClauses=new Set();
  if(selections.tutorEvaluation){
    parts.forEach((part,index)=>{if(selectTutorEvaluationEvidence(part))tutorClauses.add(index);});
    for(const index of [...tutorClauses])for(const direction of [-1,1]){
      for(let cursor=index+direction;parts[cursor]&&isTutorEvaluationFieldClause(parts[cursor]);cursor+=direction)tutorClauses.add(cursor);
    }
  }
  let previous=null,suppressed=false;
  for(const [index,part] of parts.entries()){
    if(/^(?:(?:also|then|separately|please)\s+)*(?:(?:please\s+)?(?:do not|don['’]t|never)\s+(?:show|list|read|check|include)|not(?!\s+only)\b|without\b|exclude\b|excluding\b|except\b|(?:請)?不要(?:顯示|列出|查詢|包含)|排除|不含)/iu.test(part)){
      if(previous&&!independent.test(unquoted(part)))collected[previous].push(part);
      suppressed=true;continue;
    }
    if(suppressed&&!/^(?:(?:also|then|please|now)\s+)*(?:show|list|check|read|tell|explain|include|what|which|where|when|how|can|could|do|does|is|are|compare)\b|^(?:請|還有|現在)?(?:顯示|列出|查詢|告訴|什麼|何時|怎麼|哪)/iu.test(part))continue;
    suppressed=false;
    if(feeClauses.has(index)){collected.feeRemission.push(part);previous='feeRemission';continue;}
    if(healthClauses.has(index)){collected.healthExaminations.push(part);previous='healthExaminations';continue;}
    if(counselingClauses.has(index)){collected.counselingAppointments.push(part);previous='counselingAppointments';continue;}
    if(studentConductClauses.has(index)){collected.studentConduct.push(part);previous='studentConduct';continue;}
    if(tutorClauses.has(index)){collected.tutorEvaluation.push(part);previous='tutorEvaluation';continue;}
    if(clearanceClauses.has(index)){collected.graduationClearance.push(part);previous='graduationClearance';continue;}
    const domain=tools.filter(key=>key==='dormitoryConduct'?Boolean(selectDormitoryConductEvidence(part,'',[]))
      :key==='elearningOutline'&&Boolean(selectElearningOutlineEvidence(part,route,history)));
    if(independent.test(unquoted(part))){other.push(part);previous=null;continue;}
    if(domain.length){for(const key of domain)collected[key].push(part);previous=domain.length===1?domain[0]:null;continue;}
    if(previous==='feeRemission'&&isFeeRemissionFollowup(part,selections.feeRemission.operation)){
      collected.feeRemission.push(part);continue;
    }
    if(previous==='healthExaminations'&&isHealthExaminationFieldClause(part)){
      collected.healthExaminations.push(part);continue;
    }
    if(previous==='dormitoryConduct'&&(/^(?:(?:its|the|my|all|each|every|saved|recorded)\s+)*(?:dates?|reasons?|penalt(?:y|ies)|details?)(?:\s+(?:recorded|saved|for|me|my|account))*$/iu.test(part)
      ||/^(?:its|this notice['’]s|that notice['’]s)\s+(?:(?:downloadable|official|printed|saved)\s+)*(?:certificate|document|pdf|proof)$/iu.test(part))){collected[previous].push(part);continue;}
    if(previous&&(/^(?:(?:list|show|tell|explain|me|all|one|two|three|four|five|six|seven|eight|nine|ten|each|every|with|their|its|the|my|local|exact|saved|recorded)\s+)*(?:links|urls|titles|names|meaning|status|records)[.!?]?$/iu.test(part)
      ||/^(?:(?:their|its|the|my|all|each|every|exact|local|saved|recorded|with|include|including|list|show|please|only)\s+)*(?:links?|urls?|titles?|names?|meaning|status|records?|rewards?|penalties|videos?|slides?|materials?|activities|sections?)(?:\s+(?:too|as well))?$/iu.test(part)
      ||/^(?:course|activity|section)\s+(?:(?:id|number|#)\s*)?\d+$/iu.test(part)
      ||/^(?:not|without|except|exclude|excluding|do not|don['’]t|不要|排除|不含)\b/iu.test(part))){collected[previous].push(part);continue;}
    other.push(part);previous=null;
  }
  // A short contextual follow-up can have no independently named subject.
  if(parts.length===1&&!independent.test(unquoted(question))&&tools.length===1){collected[tools[0]]=[question];other.length=0;}
  const questions=Object.fromEntries(tools.map(key=>[key,key==='studentConduct'?studentConduct.question:key==='feeRemission'||key==='healthExaminations'||key==='counselingAppointments'||key==='graduationClearance'||key==='tutorEvaluation'?question:collected[key].length?collected[key].join(' and '):question]));
  const balanceQuestion=other.length===1?other[0].replace(/^(?:(?:also|then|separately|please)\s+)+|\s+separately$/giu,''):'';
  const scopedBalance=Boolean(selections.feeRemission||selections.healthExaminations||selections.counselingAppointments||selections.tutorEvaluation||selections.studentConduct);
  const feeChargeLabel=scopedBalance?ownFeeBalanceLabel(balanceQuestion):null;
  const feeAndBalance=scopedBalance&&(isOwnFeeBalanceQuestion(balanceQuestion)||feeChargeLabel!==null);
  const clearanceAndNextClass=Boolean(selections.graduationClearance||selections.studentConduct)&&other.length===1&&isExactClearanceNextClassQuestion(other[0]);
  return {tools,selected:true,readerOnly:other.length===0,otherQuestion:other.join(' and '),questions,feeAndBalance,feeChargeLabel,clearanceAndNextClass,
    foreign:tools.some(key=>selections[key].reason==='foreign_request')};
}
export function requiredSupplementalTools(question,route='',history=[]){
  const pages=nativePageLookupContext(question,route,history),remaining=pages.selected?pages.otherQuestion:question;
  const remote=Boolean(remaining)&&isElearningEvidenceQuestion(remaining,route,history);
  const otherQuestion=remote?independentElearningQuestion(remaining,route,history):remaining;
  const nativeGradeOnly=shouldReadNativeDtmGrades(otherQuestion,route,history)&&!mentionsDtmSubmissionDetail(otherQuestion,history);
  return [...new Set([...pages.tools,...keys.filter(key=>!pages.tools.includes(key)&&(key==='elearningEnrollments'?remote:otherQuestion&&(key!=='dtmSubmissions'||!nativeGradeOnly)&&predicates[key](otherQuestion,route,history)))])];
}
const queryKeys=['id','search_scope','keyword','term','department','themes','page','page_size','sort','direction'];
export const catalogReadPlanSchema={anyOf:[{type:'null'},{type:'object',additionalProperties:false,properties:Object.fromEntries(queryKeys.map(key=>[key,{type:['string','null'],...(key==='search_scope'?{enum:['current','historical',null]}:key==='direction'?{enum:['asc','desc',null]}:{})}])),required:queryKeys}]};
/** Only named search fields, never a table/owner/URL. Reader independently
 * validates the complete route and conflicts before any transport. */
export function validateCatalogReadPlan(value){
  if(value===null||value===undefined)return null;
  if(!plain(value)||Object.keys(value).some(key=>!queryKeys.includes(key)||!(value[key]===null||typeof value[key]==='string')))throw new TypeError('Invalid catalog read selectors.');
  const query=Object.fromEntries(Object.entries(value).filter(([,value])=>value!==null));
  if(query.id!==undefined){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.id)||Object.keys(query).length!==1)throw new TypeError('Invalid catalog read selectors.');return query;}
  if(query.themes&&new Set(query.themes.split(',')).size!==query.themes.split(',').length)throw new TypeError('Invalid catalog read selectors.');
  const args=normalizeSyllabusSearchQuery({search_scope:'historical',page_size:'20',...query});
  if(args.p_page_size>50||args.p_page>1000)throw new TypeError('Invalid catalog read selectors.');
  return query;
}
function catalogRouteContext(route,question){
  const url=new URL(route||'/','https://stu.best');
  if(url.origin!=='https://stu.best'||!/^\/school-affairs\/services\/(?:12-3|12-4)\/?$/.test(url.pathname))return false;
  if([...url.searchParams].some(([key,value])=>['course','syllabus','keyword','term','department','themes','yr','dep','search_scope','searched'].includes(key)&&value))return true;
  return /^(?:show|list|browse)\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:course\s+)?(?:catalog(?:ue)?|offerings?|available courses)\s*[.!?]?$/i.test(question.trim())||/\b(?:this page|this catalog|these offerings)\b|這個頁面|本頁|這些課程/.test(question);
}
function unavailable(key,reason){
  if(key==='tutorEvaluation')return unavailableTutorEvaluationEvidence(reason);
  if(key==='graduationClearance')return unavailableClearanceEvidence(reason);
  if(key==='counselingAppointments')return unavailableCounselingEvidence(reason);
  if(key==='feeRemission')return unavailableFeeRemissionEvidence(reason);
  if(key==='healthExaminations')return unavailableHealthExaminationEvidence(reason);
  if(key==='dormitoryConduct')return unavailableDormitoryConductEvidence(reason);
  if(key==='elearningOutline')return unavailableElearningOutlineEvidence(reason);
  if(key==='facilityRepairs')return unavailableFacilityRepairEvidence(reason);
  if(key==='dtmGradeReport')return unavailableDtmGradeReportEvidence(reason);
  if(key==='elearningEnrollments')return unavailableElearningEvidence(reason);
  const checkedAt=new Date().toISOString(),common={checkedAt,rules:'This selected lookup is unavailable. No record absence or successful account read can be inferred.'};
  let payload,url;
  if(key==='courseCatalog'){url='/school-affairs/services/12-4';payload={...common,collection:'courseCatalog',readState:'unavailable',reason,provenance:{sourceMode:'sample',officialUniversityData:false,enrollmentEvidence:false},rows:[],omittedFields:[],counts:{total:null,returnedRows:null,includedRows:null,complete:false}};}
  else if(key==='enrollmentCertificate'){url='/school-affairs/services/17-1';payload={...common,collection:'enrollmentCertificate',sourceMode:'local_demo',readState:'unavailable',assessment:null};}
  else if(key==='dtmSubmissions'){url='/dtm';payload={...common,officialUniversityData:false,selection:{scope:'unavailable',requiresClarification:false,choices:[]},counts:{available:null,selected:null,requested:null,loaded:null,included:null,omitted:null,unavailable:null},complete:false,records:[],unavailable:[]};}
  else if(key==='aidPayments'){
    url=aidPaymentsPaths.claims;payload={...common,collection:key,readState:'unavailable',
      selection:{views:[],summaryOnly:false,scope:'owned_first_page_per_view',page:1,pageSize:aidPaymentsPageSize},
      provenance:{source:'saved_local',officialUniversityData:false,synchronizationVerified:false,currency:null},
      counts:{viewsSelected:0,viewsLoaded:0,viewsUnavailable:0,available:null,included:0,omitted:null},
      complete:false,recordsComplete:false,excerpted:false,views:[],
      capabilities:{read:true,write:false,approve:false,pay:false,bankAccess:false,verifiedDocument:false}};
  }
  else if(key==='studentConduct'||key==='studentLoan'){
    url=key==='studentConduct'?'/school-affairs/services/38-1':'/school-affairs/services/21-1';
    payload={...common,collection:key,sourceMode:'local_demo',readState:'unavailable',unavailableReason:reason,complete:false,excerpted:false,
      counts:{available:null,matching:null,included:0,omitted:null},...(key==='studentConduct'?{records:[]}:{record:null,recordPresent:null})};
  }
  else{url='/school-affairs/services/49-1';payload={...common,collection:'tuition',sourceMode:'local_demo',readState:'unavailable',coverageScope:'selected_settlement_records_and_periods_only',selection:{view:'settlement',requestedViews:['settlement'],scope:'unavailable',requiresClarification:false,choices:[]},serviceAvailability:[{view:'settlement',url,capability:'literal_settlement_records'}],counts:{available:null,matching:null,included:null,omitted:null},complete:false,excerpted:false,records:{periods:[],settlements:[]}};}
  const provenance=key==='aidPayments'?'saved_local':['tuition','enrollmentCertificate','studentConduct','studentLoan'].includes(key)?'local_demo':null;
  return {readState:'unavailable',reason,evidence:{id:'account:'+key,title:supplementalAccountTools[key],url,urls:[url],...(provenance?{provenance}:{}),content:JSON.stringify(payload)}};
}
function trimOne(result){
  const p=JSON.parse(result.evidence.content),key=result.evidence.id.slice(8);
  if(key==='courseCatalog'&&p.rows.length>1){p.rows.pop();p.counts.includedRows--;p.counts.complete=false;p.readState='partial';p.reason='evidence_budget';result.readState='partial';result.reason='evidence_budget';}
  else if(key==='dtmSubmissions'){
    const old=[...p.records].reverse().find(row=>row.reviewedRetiredFiles.length);
    if(old){old.reviewedRetiredFiles.pop();old.reviewHistory.included--;old.reviewHistory.omitted++;old.reviewHistory.completeRetainedHistory=false;}
    else if(p.records.length>1){p.records.pop();p.counts.included--;p.counts.omitted++;}
    else return false;
    p.complete=false;result.readState='partial';result.reason='evidence_budget';
  }else if(key==='tuition'&&p.records.periods.length>1){
    p.records.periods.pop();if(p.records.settlements.length)p.records.settlements.pop();p.counts.included--;p.counts.omitted++;p.complete=false;p.excerpted=true;
  }else if(key==='studentConduct'&&p.records.length>1){
    p.records.pop();p.counts.included--;p.counts.omitted++;p.complete=false;p.excerpted=true;
  }else return false;
  result.evidence.content=JSON.stringify(p);return true;
}
/** Whole validated rows/lineage only. Keep one source record where possible;
 * if even that cannot fit, mark that source unavailable, never empty. */
export function boundSupplementalResults(input,budget=supplementalEvidenceBudget){
  if(!Array.isArray(input)||input.length>keys.length||!Number.isSafeInteger(budget)||budget<6000||budget>supplementalEvidenceBudget)throw new TypeError('Invalid supplemental budget.');
  const results=structuredClone(input);
  for(const result of results){if(bytes(result)>(sourceLimits[result?.evidence?.id?.slice(8)]||0))throw new TypeError('Invalid supplemental source budget.');formatSupplementalAccountAnswers([result]);}
  if(new Set(results.map(result=>result.evidence.id)).size!==results.length)throw new TypeError('Duplicate supplemental sources.');
  const replaced=new Set();
  while(bytes(results)>budget){
    const ranked=results.map((result,index)=>({result,index,size:bytes(result)})).sort((a,b)=>b.size-a.size);
    if(ranked.some(({result})=>trimOne(result)))continue;
    const candidate=ranked.find(({index})=>!replaced.has(index));
    if(!candidate)throw new RangeError('Supplemental metadata exceeds aggregate budget.');
    results[candidate.index]=unavailable(candidate.result.evidence.id.slice(8),'aggregate_evidence_budget');
    replaced.add(candidate.index);
  }
  return results;
}
/** API closures capture verified credentials; this context never carries them.
 * Two concurrent read-only callbacks share the request's absolute deadline. */
export async function readSupplementalLookups({tools,readers={},question,route='',history=[],snapshot,deadline,attempt=1,catalogQuery=null,onProgress=()=>{}}){
  const selected=[...new Set(tools.filter(key=>keys.includes(key)))],results=new Array(selected.length);
  readers={...readers};history=history.map(row=>({...row}));catalogQuery=catalogQuery===null?null:structuredClone(catalogQuery);
  const pageContext=nativePageLookupContext(question,route,history);
  const residual=pageContext.selected?pageContext.otherQuestion:question;
  const deadlineExceeded=Symbol('Supplemental account read timed out');
  let next=0;
  const emit=(key,status,detail)=>{try{onProgress({kind:`account-read:${key}:${attempt}`,label:(status==='running'?'Reading ':'Checked ')+supplementalAccountTools[key],detail,status});}catch{/* Disconnected progress cannot approve a read. */}};
  const worker=async()=>{while(next<selected.length){
    const index=next++,key=selected[index];let timer,result;
    try{
      if(!Number.isFinite(deadline)||Date.now()>=deadline)result=unavailable(key,'deadline_exceeded');
      else if(typeof readers[key]!=='function')result=unavailable(key,'reader_unavailable');
      else if(key==='courseCatalog'&&catalogQuery===null&&!catalogRouteContext(route,question))result=unavailable(key,'catalog_selection_unavailable');
      else{
        const query=key==='courseCatalog'?validateCatalogReadPlan(catalogQuery):null;
        emit(key,'running','Starting the selected authorized reader. No action is executed.');
        result=await Promise.race([
          Promise.resolve().then(()=>readers[key]({question:key==='facilityRepairs'?facilityRepairLookupContext(residual,route,history).repairQuestion:pageContext.questions[key]||residual||question,route,history:history.map(row=>({...row})),snapshot,deadline,...(query===null?{}:{catalogQuery:query})})),
          new Promise((_,reject)=>{timer=setTimeout(()=>reject(deadlineExceeded),Math.max(1,deadline-Date.now()));}),
        ]);
        if(Date.now()>=deadline)throw deadlineExceeded;
        result=structuredClone(result);
        if(result?.evidence?.id!=='account:'+key)throw new TypeError('Reader source mismatch.');
        if(bytes(result)>sourceLimits[key])throw new TypeError('Reader source exceeds its fixed budget.');
        formatSupplementalAccountAnswers([result],{question});
      }
    }catch(error){result=unavailable(key,error===deadlineExceeded||Date.now()>=deadline?'deadline_exceeded':'read_failed');}
    finally{if(timer!==undefined)clearTimeout(timer);}
    results[index]=result;
    const payload=JSON.parse(result.evidence.content),limited=result.readState==='partial'||payload.complete===false||payload.counts?.complete===false||payload.selection?.requiresClarification;
    emit(key,result.readState==='unavailable'?'unavailable':'complete',result.readState==='unavailable'?'The selected lookup is unavailable. No absent record was inferred.':limited?'The lookup returned limited evidence or requires a choice; omitted records remain unknown.':result.readState==='empty'?'The authorized lookup completed with no matching saved records in its stated scope.':'The selected authorized lookup completed. Only its returned scope can support the answer.');
  }};
  await Promise.all(Array.from({length:Math.min(2,selected.length)},worker));
  const bounded=boundSupplementalResults(results);
  for(let i=0;i<bounded.length;i++)if(bounded[i].evidence.content!==results[i].evidence.content||bounded[i].readState!==results[i].readState)emit(selected[i],bounded[i].readState==='unavailable'?'unavailable':'complete','The aggregate evidence limit omitted complete records; missing values remain unknown.');
  return bounded;
}

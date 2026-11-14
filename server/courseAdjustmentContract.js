import {feeRemissionUuid as uuid} from './feeRemissionContract.js';

export const adjustmentScope = 'course-adjustment';
export const adjustmentNoticeScope = 'late-add-notice';
export const adjustmentAction = 'set_course_adjustment_eligibility';
export const adjustmentPaths = {add_drop:'/school-affairs/services/6-2',late_add:'/school-affairs/services/6-3',summer:'/school-affairs/services/6-5'};
export const summerNoticeScope='summer-selection-notice';
export const adjustmentPhases = ['add_drop','late_add','summer'];
export const adjustmentDecisions = ['eligible','ineligible','unverified'];
const exact = (row,keys) => !!row && typeof row==='object' && !Array.isArray(row) &&
  Object.keys(row).length===keys.length && keys.every(key=>Object.hasOwn(row,key));
export const validAcademicYear=year=>Number.isInteger(year)&&year>=100&&year<=999;
const fields = ['user_id','phase','academic_year','semester','decision'];

export function adjustmentTerm(instant = new Date(),phase) {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',year:'numeric',month:'numeric'}).formatToParts(instant);
  const year = Number(parts.find(part=>part.type==='year').value);
  const month = Number(parts.find(part=>part.type==='month').value);
  return {academicYear:year-1911-(month<8?1:0),semester:phase==='summer'?3:month>=2&&month<=7?2:1};
}

export function validAdjustmentSelector(phase,year,semester) {
  return adjustmentPhases.includes(phase) && validAcademicYear(year) && (phase==='summer'?semester===3:[1,2].includes(semester));
}

function validFields(row) {
  return uuid(row.user_id) && validAdjustmentSelector(row.phase,row.academic_year,row.semester) &&
    (adjustmentDecisions.includes(row.decision)||(row.phase==='summer'&&row.decision==='missing_college'));
}

export function validAdjustmentPayload(row) {
  return exact(row,[...fields,'expected_version','request_id']) && validFields(row) && uuid(row.request_id) &&
    Number.isInteger(row.expected_version) && row.expected_version>=0 && row.expected_version<1000000;
}

export function parseAdjustmentRow(row,userId,phase,year,semester) {
  if (!exact(row,[...fields,'checked_on','version']) || !validFields(row) ||
      row.user_id!==userId || row.phase!==phase || row.academic_year!==year || row.semester!==semester ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(row.checked_on) || !Number.isFinite(Date.parse(row.checked_on)) ||
      !Number.isInteger(row.version) || row.version<1 || row.version>1000000) throw new Error('Invalid course adjustment record.');
  return row;
}

export function adjustmentQuestion(question) {
  const q=question.normalize('NFKC').trim();
  const late=/\blate[ -]add\b|補加選/iu.test(q);
  const drop=/\badd\s*(?:[/–-]|and)\s*drop\b|加退選/iu.test(q);
  if(late===drop || /password|access_token|refresh_token|密碼/iu.test(q))return null;
  if(/^(?:am i eligible|do i qualify|can i|what is my eligibility|show (?:me )?my eligibility)|我(?:可|能|有資格)|我的.{0,10}資格/iu.test(q) &&
      /eligible|qualify|eligibility|\b(?:add|drop)\b|資格|加選|退選/iu.test(q)) {
    if(/\b(?:20\d\d|1\d\d|last|previous|next|historical)\b|上學期|下學期|歷年|去年|明年/iu.test(q))return null;
    return late?'late_add':'add_drop';
  }
  if(late && /^(?:who|what (?:are|is)|how does|list|explain)|規則|條件|哪些人/iu.test(q) &&
      !/\b(?:my|mine|our|i|me|records?|history)\b|我|紀錄|記錄/iu.test(q))return 'rules';
  return null;
}

const summerSubject=/暑修|暑期(?:課程|選課|開班)|\bsummer (?:course(?:s| selection)?|class(?:es)?|registration|enrol(?:l)?ment|selection|term|semester|study|school)\b/iu;
const summerPrivate=/\b(?:my|mine|am i|can i|could i|may i|do i|did i|for me|our)\b|我的|我能|我可|我有|我是否|幫我/iu;
const summerHistory=/\b(?:history|records?|grades?|schedule|timetable|assignments?)\b|歷史|紀錄|記錄|成績|課表|作業|選了/iu;

export function summerSelectionQuestion(question) {
  const q=question.normalize('NFKC').trim();
  if(!summerSubject.test(q)||/password|access_token|refresh_token|密碼|\b(?:dtm|moodle|write code|python|javascript)\b/iu.test(q))return null;
  if(summerHistory.test(q))return null;
  const years=[...new Set([...q.matchAll(/(?<![0-9])([1-9][0-9]{2})(?![0-9])(?=\s*(?:學年|academic year|年|暑|summer|[?？.]?$|[ /,]))/giu)].map(match=>Number(match[1])))];
  const explicitYear=q.match(/\bacademic year\s*[:：]?\s*([1-9][0-9]{2})(?![0-9])/iu)?.[1];
  if(explicitYear&&!years.includes(Number(explicitYear)))years.push(Number(explicitYear));
  const ambiguousYear=years.length>1 || /\b(?:19|20)[0-9]{2}\b|\b(?:last|next|previous) (?:academic year|summer|term)\b|去年|明年|下學年|上一學年/iu.test(q);
  const year=years[0];
  if(/\beligib(?:le|ility)\b|\bqualif(?:y|ication)\b|資格|學籍|學院代碼/iu.test(q)||
     /^(?:can|could|may) i (?:take|choose|register|enrol|enroll|select)\b|我(?:可|能|是否).{0,12}(?:暑修|暑期選課)/iu.test(q))
    return {view:summerPrivate.test(q)?'mine':'notice',year,ambiguousYear};
  if(summerPrivate.test(q)&&!/^(?:where|how) (?:can|do) i (?:open|find|apply|register|sign up)\b|去哪|在哪|怎麼申請/iu.test(q))return null;
  if(/\b(?:fees?|cost|tuition|rules?|requirements?|minimum|announcements?|policy|how much)\b|學費|收費|費用|規則|規定|門檻|公告|多少/iu.test(q))
    return {view:'notice',year,ambiguousYear};
  if(/\b(?:where|link|open|find|how to register|how (?:can|do) i register)\b|在哪|去哪|開啟|如何選課|怎麼選課/iu.test(q))
    return {view:'navigation'};
  return null;
}

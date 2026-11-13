import {feeRemissionUuid as uuid} from './feeRemissionContract.js';

export const adjustmentScope = 'course-adjustment';
export const adjustmentNoticeScope = 'late-add-notice';
export const adjustmentAction = 'set_course_adjustment_eligibility';
export const adjustmentPaths = {add_drop:'/school-affairs/services/6-2',late_add:'/school-affairs/services/6-3'};
export const adjustmentPhases = ['add_drop','late_add'];
export const adjustmentDecisions = ['eligible','ineligible','unverified'];
const exact = (row,keys) => !!row && typeof row==='object' && !Array.isArray(row) &&
  Object.keys(row).length===keys.length && keys.every(key=>Object.hasOwn(row,key));
const term = (year,semester) => Number.isInteger(year)&&year>=100&&year<=999&&[1,2].includes(semester);
const fields = ['user_id','phase','academic_year','semester','decision'];

export function adjustmentTerm(instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',year:'numeric',month:'numeric'}).formatToParts(instant);
  const year = Number(parts.find(part=>part.type==='year').value);
  const month = Number(parts.find(part=>part.type==='month').value);
  return {academicYear:year-1911-(month<8?1:0),semester:month>=2&&month<=7?2:1};
}

export function validAdjustmentSelector(phase,year,semester) {
  return adjustmentPhases.includes(phase) && term(year,semester);
}

function validFields(row) {
  return uuid(row.user_id) && validAdjustmentSelector(row.phase,row.academic_year,row.semester) && adjustmentDecisions.includes(row.decision);
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

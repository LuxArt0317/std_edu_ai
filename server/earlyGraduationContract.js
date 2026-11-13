import {feeRemissionUuid as uuid} from './feeRemissionContract.js';
import {validWithdrawalTerm} from './courseWithdrawalContract.js';

export const earlyGraduationPath='/school-affairs/services/7-4';
export const earlyGraduationScope='early-graduation';
export const earlyGraduationStudentActions=['submit_early_graduation','cancel_early_graduation'];
export const earlyGraduationManagerActions=['set_graduation_window','set_graduation_candidate','review_early_graduation'];

const termFields=['academic_year','semester'];
const identityFields=['user_id',...termFields,'study_track','department','student_number','graduation_year','graduation_semester'];
const eligibility=['unverified','eligible','ineligible'];
const review=['approved','rejected'];
const exact=(row,fields)=>row && typeof row==='object' && !Array.isArray(row) &&
  Object.keys(row).length===fields.length && fields.every(field=>Object.hasOwn(row,field));
const text=(value,max)=>typeof value==='string' && value.trim().length>0 && Array.from(value).length<=max;
const instant=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value));
const version=(value,min=1,max=1000000)=>Number.isInteger(value)&&value>=min&&value<=max;
const validWindow=(start,end)=>instant(start)&&instant(end)&&Date.parse(start)<Date.parse(end)&&
  Date.parse(end)-Date.parse(start)<=180*86400000;

function identity(row) {
  return uuid(row.user_id)&&validWithdrawalTerm(row.academic_year,row.semester)&&
    text(row.study_track,100)&&text(row.department,160)&&text(row.student_number,40)&&
    validWithdrawalTerm(row.graduation_year,row.graduation_semester)&&
    row.graduation_year*2+row.graduation_semester>=row.academic_year*2+row.semester;
}

export function validEarlyGraduationAction(kind,payload) {
  const fields={
    set_graduation_window:['opens_at','closes_at'],
    set_graduation_candidate:[...identityFields.filter(field=>!termFields.includes(field)),'eligibility'],
    review_early_graduation:['user_id','decision'],
    submit_early_graduation:['candidate_version'],
    cancel_early_graduation:[],
  };
  if(!Object.hasOwn(fields,kind)||!exact(payload,[...termFields,'request_id','expected_version',...fields[kind]])||
    !validWithdrawalTerm(payload.academic_year,payload.semester)||!uuid(payload.request_id)||
    !version(payload.expected_version,0,999999))return false;
  if(kind==='set_graduation_window')return validWindow(payload.opens_at,payload.closes_at)&&payload.opens_at.endsWith('Z')&&payload.closes_at.endsWith('Z');
  if(kind==='set_graduation_candidate')return identity(payload)&&eligibility.includes(payload.eligibility);
  if(kind==='review_early_graduation')return uuid(payload.user_id)&&payload.expected_version>0&&review.includes(payload.decision);
  if(kind==='submit_early_graduation')return payload.expected_version===0&&version(payload.candidate_version);
  return payload.expected_version>0;
}

function validWindowRow(row) {
  return exact(row,[...termFields,'opens_at','closes_at','version'])&&validWithdrawalTerm(row.academic_year,row.semester)&&
    validWindow(row.opens_at,row.closes_at)&&version(row.version);
}
function validCandidate(row,userId) {
  return exact(row,[...identityFields,'eligibility','version'])&&row.user_id===userId&&identity(row)&&
    eligibility.includes(row.eligibility)&&version(row.version);
}
function validApplication(row,userId) {
  return exact(row,[...identityFields,'applied_at','status','version'])&&row.user_id===userId&&identity(row)&&instant(row.applied_at)&&
    ['submitted','cancelled',...review].includes(row.status)&&version(row.version);
}

export function parseEarlyGraduation(data,userId,term) {
  if(!exact(data,['userId','academicYear','semester','state','window','candidate','records'])||data.userId!==userId||
    !validWithdrawalTerm(data.academicYear,data.semester)||term&&(data.academicYear!==term.academicYear||data.semester!==term.semester)||
    !['unconfigured','scheduled','open','closed'].includes(data.state)||(data.window===null)!==(data.state==='unconfigured')||
    !Array.isArray(data.records)||data.records.length>100)throw new Error('Invalid graduation history.');
  const matches=row=>row.academic_year===data.academicYear&&row.semester===data.semester;
  if(data.window!==null&&(!validWindowRow(data.window)||!matches(data.window)))throw new Error('Invalid graduation window.');
  if(data.candidate!==null&&(!validCandidate(data.candidate,userId)||!matches(data.candidate)))throw new Error('Invalid graduation candidate.');
  if(!data.records.every(row=>validApplication(row,userId)))throw new Error('Invalid graduation application.');
  return data;
}

export function parseEarlyGraduationReceipt(row,kind,payload,userId) {
  const valid=kind==='set_graduation_window'?validWindowRow(row):
    kind==='set_graduation_candidate'?validCandidate(row,userId):validApplication(row,userId);
  const status={submit_early_graduation:'submitted',cancel_early_graduation:'cancelled',review_early_graduation:payload.decision}[kind];
  if(!valid||row.academic_year!==payload.academic_year||row.semester!==payload.semester||row.version!==payload.expected_version+1||
    status&&row.status!==status)throw new Error('Invalid graduation receipt.');
  return row;
}

export function earlyGraduationQuestion(question) {
  const q=question.normalize('NFKC');
  return /\b(?:early graduation|graduate early)\b|提前畢業/iu.test(q) &&
    /\b(?:my|mine|me|i|status|result|history|eligible|eligibility|open|window|deadline)\b|我的|我可|我能|資格|狀態|結果|紀錄|開放|截止/iu.test(q) &&
    !/password|access_token|refresh_token|another student|密碼|幫我送出|替我取消|\b(?:please submit|submit my|cancel my)\b/iu.test(q);
}

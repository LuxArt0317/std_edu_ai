import {feeRemissionUuid as uuid} from './feeRemissionContract.js';

export const withdrawalPath = '/school-affairs/services/6-4';
export const withdrawalScope = 'course-withdrawal';
export const withdrawalChange = 'change_course_withdrawal';
export const withdrawalWindowChange = 'set_course_withdrawal_window';

const minute = 60000;
const isoDate = value => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u.test(value) && Number.isFinite(Date.parse(value));
const version = (value,max=999999999) => Number.isInteger(value) && value>=1 && value<=max;
const text = (value,max) => typeof value==='string' && value.trim() && Array.from(value).length<=max;
const nullableText = (value,max) => value===null || text(value,max);
const exact = (value,fields) => !!value && typeof value==='object' && !Array.isArray(value) &&
  Object.keys(value).length===fields.length && fields.every(key=>Object.hasOwn(value,key));

export function validWithdrawalTerm(year,semester) {
  return Number.isInteger(year) && year>=100 && year<=999 && [1,2].includes(semester);
}

export function withdrawalTime(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/u.test(value))return null;
  const instant=Date.parse(value+'+08:00');
  const calendar=Date.parse(value+'Z');
  if(!Number.isFinite(instant) || new Date(calendar).toISOString().slice(0,value.length)!==value)return null;
  return new Date(instant).toISOString();
}

export function withdrawalTaipeiInput(value) {
  if(!isoDate(value))return '';
  return new Date(Date.parse(value)+8*60*minute).toISOString().slice(0,19);
}

function validWindow(opensAt,closesAt) {
  return isoDate(opensAt) && isoDate(closesAt) && Date.parse(opensAt)<Date.parse(closesAt) &&
    Date.parse(closesAt)-Date.parse(opensAt)<=180*24*60*minute;
}

export function validWithdrawalPayload(kind,payload) {
  const manager=kind===withdrawalWindowChange;
  const fields=manager?['academic_year','semester','opens_at','closes_at']:['course_id','operation'];
  if((!manager&&kind!==withdrawalChange) || !exact(payload,[...fields,'expected_version','request_id']) || !uuid(payload.request_id))return false;
  if(manager)return validWithdrawalTerm(payload.academic_year,payload.semester) &&
    (payload.expected_version===0||version(payload.expected_version,999999)) &&
    validWindow(payload.opens_at,payload.closes_at) && payload.opens_at.endsWith('Z') && payload.closes_at.endsWith('Z');
  return uuid(payload.course_id) && ['withdraw','restore'].includes(payload.operation) && version(payload.expected_version,999999998);
}

function parseWindow(row) {
  if(!exact(row,['opensAt','closesAt','version']) || !validWindow(row.opensAt,row.closesAt) || !version(row.version,1000000))
    throw new Error('Invalid withdrawal window.');
  return row;
}

export function parseWithdrawalSnapshot(data,userId,term) {
  if(!exact(data,['userId','academicYear','semester','state','window','courses']) || data.userId!==userId ||
    !validWithdrawalTerm(data.academicYear,data.semester) ||
    (term&&(data.academicYear!==term.academicYear||data.semester!==term.semester)) ||
    !['unconfigured','scheduled','open','closed'].includes(data.state) || (data.window===null)!==(data.state==='unconfigured') ||
    !Array.isArray(data.courses) || data.courses.length>200 || (term&&data.courses.length))throw new Error('Invalid withdrawal workspace.');
  if(data.window!==null)parseWindow(data.window);
  const ids=new Set();
  for(const row of data.courses){
    if(!exact(row,['id','term_course_code','course_title','required_elective_text','credits','instructor_one','remark_text','version']) ||
      !uuid(row.id) || ids.has(row.id) || !text(row.term_course_code,80) || !text(row.course_title,160) ||
      !nullableText(row.required_elective_text,30) || !nullableText(row.instructor_one,160) || !nullableText(row.remark_text,300) ||
      typeof row.credits!=='number'||!Number.isFinite(row.credits)||row.credits<0||row.credits>999.99||!version(row.version,2147483647))
      throw new Error('Invalid withdrawal course.');
    ids.add(row.id);
  }
  return data;
}

export function parseWithdrawalReceipt(data,userId,kind,payload) {
  if(data?.userId!==userId||data.requestId!==payload.request_id)throw new Error('Invalid withdrawal receipt.');
  if(kind===withdrawalWindowChange){
    const window=parseWindow(data.window);
    if(!exact(data,['userId','requestId','academicYear','semester','window']) ||
      data.academicYear!==payload.academic_year || data.semester!==payload.semester || window.version!==payload.expected_version+1 ||
      Date.parse(window.opensAt)!==Date.parse(payload.opens_at) || Date.parse(window.closesAt)!==Date.parse(payload.closes_at))
      throw new Error('Invalid withdrawal window receipt.');
  } else if(!exact(data,['userId','requestId','courseId','version','remark']) ||
    data.courseId!==payload.course_id || data.version!==payload.expected_version+1 ||
    data.remark!==(payload.operation==='withdraw'?'Y(W)':null))throw new Error('Invalid withdrawal course receipt.');
  return data;
}

export function withdrawalQuestion(question) {
  const query=question.normalize('NFKC');
  if(/password|access_token|refresh_token|密碼|(?:\b(?:last|past|previous|next|academic year)\b|[12]\d{3}|歷年|上學期|下學期)/iu.test(query))return null;
  if(/(?:\bcourse withdrawals?\b|\bwithdraw(?:n|ing|al)?\b.{0,30}\b(?:class|course|subject)s?\b|\b(?:class|course|subject)s?\b.{0,30}\bwithdraw(?:n|ing|al)?\b|棄選)/iu.test(query) &&
    /\b(?:how|what|when|where|my|can i|show|list|have i|did i|which|open|close|deadline|window|status|restore)\b|我的|我可|我有|哪些|時間|何時|開放|截止|查詢|紀錄|如何|還原/iu.test(query)) {
    if(/\b(?:please withdraw|withdraw (?:me|my)|restore my|please restore|do it)\b|幫我棄選|替我棄選|幫我還原/iu.test(query))return null;
    if(/\b(?:when|open|close|deadline|window)\b|時間|何時|開放|截止/iu.test(query))return 'window';
    if(/\b(?:how|where)\b|如何|怎麼|哪裡/iu.test(query))return 'guide';
    return 'records';
  }
  return null;
}

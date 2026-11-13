import {feeRemissionUuid as uuid} from './feeRemissionContract.js';

export const creditTransferPath='/school-affairs/services/7-2';
export const creditTransferScope='credit-transfer';
export const creditTransferSave='save_credit_transfer';
export const creditTransferSubmit='submit_credit_transfer';
export const creditTransferReview='review_credit_transfer';
export const creditTransferReasons={
  external_transfer:'外校轉入',department_transfer:'轉系',returning_transfer:'轉學',minor:'輔系',double_major:'雙主修',freshman:'新生',
};
export const creditTransferDecisions={transferred:'抵修',waived:'免修',rejected:'不通過'};
const base=['id','expected_version','request_id'];
const states=['draft','submitted','reviewed'];
const isText=value=>typeof value==='string' && value.trim().length>0 && Array.from(value).length<=160;
const isCredits=value=>typeof value==='number' && /^[0-9]{1,2}(\.[0-9]{1,2})?$/u.test(String(value));
const isVersion=value=>Number.isInteger(value) && value>=0 && value<1000000;
const exact=(value,keys)=>value && typeof value==='object' && !Array.isArray(value) &&
  Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
const timestamp=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value));
const courses=rows=>Array.isArray(rows) && rows.length>=1 && rows.length<=20 && rows.every(row=>
  exact(row,['previous_title','previous_credits','requested_title','requested_credits','course_kind']) &&
  isText(row.previous_title) && isText(row.requested_title) && isCredits(row.previous_credits) &&
  isCredits(row.requested_credits) && ['required','elective'].includes(row.course_kind));
const decisions=rows=>Array.isArray(rows) && rows.length>=1 && rows.length<=20 &&
  rows.every(row=>typeof row==='string' && Object.hasOwn(creditTransferDecisions,row));

export function validCreditTransferAction(kind,payload) {
  if(![creditTransferSave,creditTransferSubmit,creditTransferReview].includes(kind))return false;
  const keys=kind===creditTransferSave?[...base,'reason','previous_school','courses']:kind===creditTransferReview?[...base,'decisions']:base;
  if(!exact(payload,keys)||!uuid(payload.id)||!uuid(payload.request_id)||!isVersion(payload.expected_version))return false;
  if(kind===creditTransferSave)return typeof payload.reason==='string' && Object.hasOwn(creditTransferReasons,payload.reason) &&
    isText(payload.previous_school) && courses(payload.courses);
  return payload.expected_version>0 && (kind!==creditTransferReview || decisions(payload.decisions));
}

export function parseCreditTransferRow(row,userId) {
  if(!exact(row,['id','user_id','reason','previous_school','courses','status','decisions','version','submitted_at','reviewed_at']) ||
    !uuid(row.id)||!uuid(row.user_id)||row.user_id!==userId||!Object.hasOwn(creditTransferReasons,row.reason)||!isText(row.previous_school) ||
    !courses(row.courses)||!states.includes(row.status)||!Number.isInteger(row.version)||!isVersion(row.version-1) ||
    (row.status==='draft'?row.submitted_at!==null:!timestamp(row.submitted_at)) ||
    (row.status==='reviewed'?(!timestamp(row.reviewed_at)||!decisions(row.decisions)||row.decisions.length!==row.courses.length)
      :(row.decisions!==null||row.reviewed_at!==null)))throw new Error('Invalid credit transfer record.');
  return row;
}

export function parseCreditTransferRows(rows,userId) {
  if(!Array.isArray(rows)||rows.length>6)throw new Error('Invalid credit transfer list.');
  const reasons=new Set();
  return rows.map(row=>{
    const item=parseCreditTransferRow(row,userId);
    if(reasons.has(item.reason))throw new Error('Duplicate credit transfer reason.');
    reasons.add(item.reason);
    return item;
  });
}

export function creditTransferQuestion(question) {
  const q=question.normalize('NFKC');
  if(/password|access_token|refresh_token|密碼|\b(?:someone else|another student)\b/iu.test(q))return false;
  return /\b(?:credit[ -]transfer|transfer(?:red)? credits?|credit exemptions?)\b|抵免|免修/iu.test(q) &&
    /\b(?:my|mine|me|i|did|status|result|records?|approved|rejected)\b|我的|我有|結果|核定|紀錄|記錄|狀態/iu.test(q) &&
    !/\b(?:how (?:do|can|to)|please submit|submit my|when|deadline|fees?|tuition|transcript)\b|怎麼|如何|何時|截止|學費|幫我送出/iu.test(q);
}

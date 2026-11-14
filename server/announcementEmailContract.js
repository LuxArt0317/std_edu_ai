import {feeRemissionUuid} from './feeRemissionContract.js';

export const announcementEmailPath='/school-affairs/services/2-1';
export const announcementEmailScope='announcement-email';
export const announcementEmailAction='save_announcement_email';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const version=value=>Number.isInteger(value)&&value>=0&&value<=2147483647;
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/u.test(value)&&Number.isFinite(Date.parse(value));

export function validAnnouncementEmailChange(value){
  return Boolean(exact(value,['enabled','expected_version','request_id'])&&typeof value.enabled==='boolean'&&
    version(value.expected_version)&&value.expected_version<2147483647&&feeRemissionUuid(value.request_id));
}
export function parseAnnouncementEmail(value,userId,expected){
  const fields=['userId','enabled','effectiveAt','version'];
  if(expected===undefined)fields.push('active');
  if(!exact(value,fields)||value.userId!==userId||typeof value.enabled!=='boolean'||!version(value.version)||
    (value.version===0?value.enabled||value.effectiveAt!==null:!timestamp(value.effectiveAt))||
    (expected===undefined?(typeof value.active!=='boolean'||value.active&&!value.enabled):
      (value.version!==expected.expected_version&&value.version!==expected.expected_version+1)||value.enabled!==expected.enabled))
    throw new Error('Invalid announcement email preference.');
  return value;
}
export function announcementEmailQuestion(question){
  const q=question.normalize('NFKC').trim();
  if(/\b(?:password|token|write code|javascript|python)\b|密碼/u.test(q.toLowerCase()))return null;
  if(!/\b(?:announcements?|campus notices?)\b|校園(?:最新)?公告/u.test(q.toLowerCase())||
    !/\b(?:e-?mails?|inbox)\b|信箱|電子郵件|郵件|e-?mail/iu.test(q))return null;
  if(/\b(?:is my|are my|am i|did i|have i|do i|will i|my settings?|my preferences?)\b|(?:我.{0,12}(?:是否|有沒有|會收到|已開啟|已啟用)|我的.{0,16}(?:設定|狀態))/iu.test(q))return 'status';
  return 'guide';
}

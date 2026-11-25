import {feeRemissionUuid} from './feeRemissionContract.js';

export const announcementEmailPath='/school-affairs/services/2-1';
export const announcementEmailScope='announcement-email';
export const announcementEmailAction='save_announcement_email';
export const announcementEmailInboxLimit='I can’t verify whether an announcement arrived in your Gmail inbox. This setting only shows your saved announcement email preference.';
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
  if(/\b(?:another student|someone else|other student)['’]s\b|其他同學|其他學生|他人的/iu.test(q))return 'foreign';
  if(/\b(?:is my|are my|am i|did i|have i|do i|will i|my settings?|my preferences?)\b|(?:我.{0,12}(?:是否|有沒有|會收到|已開啟|已啟用)|我的.{0,16}(?:設定|狀態))/iu.test(q))return 'status';
  return 'guide';
}

export function announcementEmailInboxQuestion(question){
  return /\b(?:Gmail|inbox)\b|信箱|收件匣/iu.test(question)
    &&/\b(?:arrived?|delivered?|reached?|received?|got|confirm|verify)\b|收到|寄到|寄達/iu.test(question);
}

export function announcementEmailForeignAnswer(question){
  const zh=/[\u3400-\u9fff]/u.test(question);
  const summary=zh?'無法查閱其他學生的公告郵件設定。':'I can’t check another student’s announcement email preference.';
  const title=zh?'校園公告 E-MAIL 設定':'Announcement email settings';
  return {status:'handoff',answer:`${summary}\n\n[${title}](${announcementEmailPath})`,
    citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false},
    activity:[{kind:'announcement-email-privacy',label:title,detail:summary,status:'complete'}]};
}

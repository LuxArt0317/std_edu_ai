import {clubPath} from './clubServicesContract.js';
export const clubMembershipPath=clubPath+'/my-memberships';

const membershipRequests=[
  /^(?:what are my (?:active )?club memberships|which of my club memberships are active)$/iu,
  /^(?:please )?(?:(?:show|list|check|see|tell me about) )?(?:my |student )?club memberships?(?: records?)?(?:,? and (?:which(?: memberships)? are active|whether they are active))?$/iu,
  /^(?:which|what) (?:student )?clubs? (?:am i (?:a member of|in)|(?:did|do|have) i (?:join|joined|belong to))(?:,? and which(?: memberships)? are active)?$/iu,
  /^我(?:目前|現在)?(?:加入|參加|隸屬)(?:了)?(?:哪些|什麼)社團(?:[，,]?(?:哪些|哪個)社團(?:仍)?(?:有效|啟用|運作中))?$/u,
  /^(?:(?:查看|顯示|列出)?我的)?社團參與紀錄$/u,
];
const subjectRequests=[
  /^(?:please )?(?:show(?: me)?|list|check|tell me) my current (?:semester |term )?(?:school affairs )?(?:subjects|courses|classes)$/iu,
  /^(?:please )?(?:show(?: me)?|list|check|tell me) my (?:subjects|courses|classes) (?:for )?this (?:semester|term)$/iu,
  /^(?:what|which) (?:subjects|courses|classes) (?:do i have|am i taking) (?:this (?:semester|term)|currently)$/iu,
  /^(?:請)?(?:顯示|查看|列出)?我(?:的)?(?:本學期|這學期)(?:有|的)?(?:哪些)?(?:課程|科目|修課)$/u,
];
const membershipTopic=/\bclub (?:student records|records|memberships?)\b|社團參與紀錄|\bclubs?\b.{0,60}\bmember\b|\bmember\b.{0,60}\bclubs?\b/iu;
const foreignTarget=/\b(?:(?:another|other) (?:students?|people|person|accounts?)(?:'s)?|someone else's|my (?:friend|classmate)'s)\b|別人|他人|另一位學生|其他學生|同學的/iu;
const contextualForeign=/^(?:please )?(?:show(?: me)?|list|check) (?:another|other) (?:student|person|account)'s records[.!?]?$|^(?:查看|顯示)(?:他人|其他學生|另一位學生)的?紀錄[。！？]?$/iu;
const currentMembershipContext=route=>typeof route==='string'&&route.split(/[?#]/u)[0].replace(/\/$/u,'')===clubMembershipPath;

export function clubMembershipSelection(question,route=''){
  if(typeof question!=='string'||question.length>2000)return null;
  const text=question.normalize('NFKC').replaceAll('’',"'").trim();
  if(foreignTarget.test(text)&&(membershipTopic.test(text)||currentMembershipContext(route)&&contextualForeign.test(text)))return {reason:'foreign'};
  const parts=text.split(/[.!?;。！？；]\s*|\s+(?:and )?also\s+|\s+and\s+(?=(?:show|list|check) my (?:current|subjects|courses|classes)\b)|[，,]?\s*(?:也請|另外請|另外幫我)/iu)
    .map(part=>part.replace(/^\s*(?:also|please also)\s+/iu,'').trim()).filter(Boolean);
  const main=parts.findIndex(part=>membershipRequests.some(pattern=>pattern.test(part)));
  if(main<0)return null;
  const companion=parts.findIndex((part,index)=>index!==main&&subjectRequests.some(pattern=>pattern.test(part)));
  return {courses:companion>=0,courseFirst:companion>=0&&companion<main,partial:parts.length>(companion>=0?2:1)};
}

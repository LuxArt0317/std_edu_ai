import {isDeepStrictEqual} from 'node:util';
import {announcementEmailInboxLimit,announcementEmailPath,announcementEmailScope,parseAnnouncementEmail} from '../../server/announcementEmailContract.js';
import {verifyProtectedNativeBrowserEgress,verifyProtectedNativeBrowserSave} from './certificate-browser-turn.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

export const announcementEmailBrowserProfile='announcement-email';
export const announcementEmailBrowserBootstrap='/api/affairs-data?scope='+announcementEmailScope;
const prefix='client:announcement-email:';
const question='Is my announcement email preference enabled and active yet?';
const inboxQuestion=question+' Also confirm whether an announcement has arrived in my Gmail inbox.';
export const announcementEmailBrowserCases=Object.freeze([
  Object.freeze({id:prefix+'record',role:'A',question,inbox:false}),
  Object.freeze({id:prefix+'multipart',role:'A',question:inboxQuestion,inbox:true}),
  Object.freeze({id:prefix+'empty',role:'B',question,inbox:false}),
]);
export function announcementEmailBrowserAnswerPath(inbox){
  return announcementEmailBrowserBootstrap+'&answer=en'+(inbox?'&inbox_receipt=requested':'');
}

const title='Announcement email settings',sourceName='My stu.best settings';
const availability='Announcement email delivery is currently unavailable.';
const off='Your announcement email preference is off.';
const on='Your announcement email preference is on.';
const pending='Your announcement email preference is enabled and scheduled to activate.';
const missing='This account has no saved announcement email preference. Email is off by default.';
const activationPrefix='Saved activation time: ';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;

export function inspectAnnouncementEmailBrowserBootstrap(reply,ownerId){
  check(reply&&typeof reply.deliveryConfigured==='boolean','invalid announcement email response');
  const {deliveryConfigured,...record}=reply;
  try{parseAnnouncementEmail(record,ownerId);}catch{check(false,'invalid announcement email response');}
  return {...record,deliveryConfigured};
}

export function inspectAnnouncementEmailBrowserReply(reply,{inbox}){
  check(exact(reply,'activity,answer,citations,grounding,status,suggestedQuestions')&&reply.status==='answered'
    &&exact(reply.grounding,'source,webSearched')&&reply.grounding.source==='account'&&reply.grounding.webSearched===false
    &&Array.isArray(reply.suggestedQuestions)&&reply.suggestedQuestions.length===0
    &&typeof reply.answer==='string'&&reply.answer.length<=8000
    &&Array.isArray(reply.citations)&&reply.citations.length===1
    &&Array.isArray(reply.activity)&&reply.activity.length===(inbox?2:1),'invalid announcement email response');
  const [receipt]=reply.citations,[read,gmail]=reply.activity,claim=read?.detail;
  const enabled=claim===on||claim===pending;
  check([on,off,pending,missing].includes(claim)
    &&isDeepStrictEqual(receipt,{chunkId:'account:announcement-email',claim,title,url:announcementEmailPath,sourceName})
    &&isDeepStrictEqual(read,{kind:'announcement-email',label:title,detail:claim,status:'complete'})
    &&(!inbox||isDeepStrictEqual(gmail,{kind:'announcement-email-inbox-receipt',label:'Inbox delivery confirmation',
      detail:announcementEmailInboxLimit,status:'unavailable'})),'invalid announcement email response');
  const paragraphs=reply.answer.split('\n\n'),link=paragraphs.pop(),summary=paragraphs[0];
  const activation=enabled?paragraphs[1]:null;
  check(link===`[${title}](${announcementEmailPath})`&&paragraphs.length===1+Number(enabled)+Number(inbox)
    &&(summary===claim||enabled&&summary===claim+' '+availability)
    &&(!enabled||activation.startsWith(activationPrefix)&&Number.isFinite(Date.parse(activation.slice(activationPrefix.length))))
    &&(!inbox||paragraphs.at(-1)===announcementEmailInboxLimit),'invalid announcement email response');
  return {summary,items:[],paragraphs:[...paragraphs,title],title,url:announcementEmailPath,sourceName};
}

export function gradeAnnouncementEmailBrowserReply({testCase,preference,reply}){
  const {inbox}=testCase,display=inspectAnnouncementEmailBrowserReply(reply,{inbox});
  const {enabled,active,version,effectiveAt,deliveryConfigured}=preference;
  const claim=version===0?missing:!enabled?off:active?on:pending;
  const expected=[claim+(enabled&&!deliveryConfigured?' '+availability:''),...(enabled?[activationPrefix+effectiveAt]:[]),
    ...(inbox?[announcementEmailInboxLimit]:[]),title];
  check(isDeepStrictEqual(display.paragraphs,expected),'announcement fixture mismatch');
  return {caseId:testCase.id,passed:true,enabled,active,stored:version>0,deliveryConfigured};
}

export function verifyProtectedAnnouncementEmailBrowserSave({payload,question,assistantResponse,requestSequence,inbox}){
  return verifyProtectedNativeBrowserSave({payload,question,assistantResponse,requestSequence,
    inspectReply:reply=>inspectAnnouncementEmailBrowserReply(reply,{inbox})});
}
export function verifyProtectedAnnouncementEmailBrowserEgress({evidence,mode,requestSequence}){
  return verifyProtectedNativeBrowserEgress({evidence,mode,requestSequence,scope:announcementEmailBrowserProfile});
}

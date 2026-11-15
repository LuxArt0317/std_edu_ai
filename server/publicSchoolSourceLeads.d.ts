import type {VerificationProgress} from './answerVerification.js';

type IndexedNotice={id:string;titleZh:string;titleEn:string;url:string;observedAt:string};
type LeadReply={answer?:string;citations?:ReadonlyArray<{url?:string}>;activity?:ReadonlyArray<{kind:string}>};
export function isSchoolSignInDestination(value:unknown):boolean;
export function officialSchoolLeadUrl(value:unknown):string|null;
export function findOfficialDtmNoticeLeads(question:string):IndexedNotice[];
export function createPublicSchoolSourceLeads(question:string):{
  indexed:IndexedNotice[];
  isBlocked(url:unknown):boolean;
  recordAccessRequired(lead:{url:string;title?:string}):void;
  recordReadable(url:unknown):void;
  append<T extends LeadReply>(reply:T):{reply:T;step:VerificationProgress|null};
};

import {createHash} from 'node:crypto';
import source from './data/publicCommunicationSource.json' with {type:'json'};
import {announcementEmailPath,announcementEmailInboxLimit} from './announcementEmailContract.js';
import {publicContactDirectory,publicContactDirectoryPath} from './publicContactDirectoryContract.js';

/** Discover existing channels without intercepting private reads or send actions. */
export function isPublicCommunicationQuestion(question){
 if(typeof question!=='string'||question.length>2000)return false;
 if(/\b(?:my|our)\s+(?:(?:unread|private|saved|recent|latest|student)\s+){0,3}(?:messages?|inbox|conversations?|email addresses?|notifications?)\b|我的(?:未讀|私人|已儲存|最近的)?(?:訊息|收件匣|對話|通知)/iu.test(question))return false;
 if(/^(?:(?:please\s+)?(?:send|email|publish|post|notify|message)\b|(?:can|could|would) you\s+(?:send|email|publish|post|notify|message)\b)|^(?:請|幫我|替我).{0,8}(?:寄|發送|傳送|發布|通知)/iu.test(question.trim()))return false;
 const topic=/\b(?:communicat\w*|contact|messag\w*|reach|notify|email|announcements?)\b|溝通|聯絡|聯繫|傳訊|通知|公告|電子郵件/iu.test(question);
 const audience=/\bstudents?\b|學生|同學/iu.test(question);
 const capability=/\b(?:can|could|way|how|where|provide|options?|features?|possible|available|website|site|portal|support\w*)\b|有哪些|如何|可以|能否|管道|網站|方式/iu.test(question);
 return topic&&audience&&capability;
}

/** Captured university navigation and implemented native capabilities stay separate. */
export function publicCommunicationContext(question){
 if(!isPublicCommunicationQuestion(question))return null;
 const home=source.home;
 const excerpt=source.links.map(link=>`${link.label}: ${link.url}`).join('\n');
 const metadata={pageTitle:home.title,localUrl:home.url,originalSource:home.source,capturedOn:home.capturedOn,sourceChecksum:home.checksum,
  contentAvailable:true,coverage:source.coverage,links:source.links,excerpt,excerptTruncated:false,totalCharacters:excerpt.length,includedCharacters:excerpt.length};
 const content=JSON.stringify(metadata),checksum=createHash('sha256').update(content).digest('hex');
 const native={
  scope:'Selected implemented stu.best navigation and tool boundaries, not a complete website feature inventory. This lookup does not establish whether a student messaging feature or recipient directory exists elsewhere. No university contact-site body, student/account rows or permission records were read by this public discovery.',
  navigation:[
   {title:publicContactDirectory.title,url:publicContactDirectoryPath,contents:'Source-backed school-office contacts displayed in this site catalog. It is not a student recipient list or a complete university extension book.'},
   {title:'通知訊息查詢',url:'/school-affairs/notifications',contents:'The caller-owned site service-request titles. This notification view is not a student-to-student conversation inbox.'},
   {title:'個人紀錄',url:'/school-affairs/records',contents:'The signed-in caller’s site records/service requests, not a student recipient directory.'},
   {title:'校園公告MAIL接收設定',url:announcementEmailPath,contents:'The caller’s saved incoming announcement-email preference, not arbitrary message composition or access to Gmail.'},
   {title:'校務資訊系統',url:'/school-affairs',contents:'Site announcements in the signed-in School Affairs view; reading an announcement does not establish recipient delivery.'},
  ],
  announcementProposal:{kind:'publish_announcement',scope:'A site announcement, not a student private message or proof of email delivery.',
   requirements:['Verified School Affairs sign-in','Saved administrator role','Separately verified content-management permission','Explicit user confirmation before the write','Matching successful operation receipt before claiming publication'],performed:false},
  availableRecipientData:[],accountDataRead:false,permissionCheckPerformed:false,messageSent:false,deliveryVerified:false,
  siteWideFeatureCoverage:{inventoryComplete:false,studentToStudentMessaging:'not_established',studentRecipientDirectory:'not_established'},
  notReadOrGrantedByThisLookup:['Student private conversations','Student recipient-email data','Gmail inbox contents','Recipient delivery receipts'],
  inboxBoundary:announcementEmailInboxLimit,
  channelSelectionNeeds:['Intended recipient group or office','Purpose of the communication','One-to-one conversation versus site announcement'],
 };
 return {page:{title:home.title,route:home.url,source:home.source,capturedOn:home.capturedOn},contentAvailable:true,
  evidence:{id:'public-page:communication-links:'+checksum.slice(0,16),title:'Homepage contact and Service Quality Mailbox links',url:home.url,urls:[home.url,...new Set(source.links.map(link=>link.url))],capturedOn:home.capturedOn,content},
  additionalEvidence:[{id:'published-guidance',title:'stu.best communication navigation and access boundaries',url:'/school-affairs',urls:native.navigation.map(page=>page.url),content:JSON.stringify(native)}]};
}

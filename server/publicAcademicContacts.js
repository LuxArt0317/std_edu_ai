import {createHash} from 'node:crypto';
import data from './data/academicContacts.json' with {type:'json'};
import {publicPageForRoute} from './publicPageContext.js';

const inquiryRoles=new Set(['semester_suspension','withdrawal_from_study']);

/** A real public contact destination, never a fabricated enrollment-change form. */
export function publicAcademicContactContext(roles=[]){
 const page=publicPageForRoute(data.url);
 if(!page||page.file!==data.captureFile||page.checksum!==data.captureChecksum||page.source!==data.source||page.capturedOn!==data.capturedOn)return null;
 const selectedRoles=[...new Set(Array.isArray(roles)?roles.filter(role=>inquiryRoles.has(role)):[])];
 const metadata={pageTitle:data.sourceTitle,localUrl:data.url,originalSource:data.source,capturedOn:data.capturedOn,sourceChecksum:data.captureChecksum,
  contentAvailable:true,contentStatus:'verified_snapshot',excerpt:data.text,excerptTruncated:true,totalCharacters:null,includedCharacters:data.text.length,
  contactSections:[{locator:data.locator,text:data.text}],contacts:data.contacts,
  contactViewTitle:data.title,scope:data.scope,
  ...(selectedRoles.length?{inquiryNavigation:{roles:selectedRoles,url:data.url,kind:'public_contact_inquiry',coverage:'A destination for asking Academic Affairs about the applicable formal process; this is contact navigation, not an application form, asserted exclusive authority or submission tool.'}}:{})};
 return {page:{title:data.sourceTitle,route:data.url,source:data.source,capturedOn:data.capturedOn},contentAvailable:true,
  evidence:{id:'public-page:'+createHash('sha256').update(data.url).digest('hex').slice(0,24),title:data.title,url:data.url,urls:[data.url],capturedOn:data.capturedOn,content:JSON.stringify(metadata)}};
}

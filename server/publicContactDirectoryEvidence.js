import {createHash} from 'node:crypto';
import {publicContactDirectory as data,publicContactDirectoryPath as route} from './publicContactDirectoryContract.js';

export function isPublicContactDirectoryQuestion(question){
 if(typeof question!=='string'||question.length>2000)return false;
 return /\b(?:contact|phone|telephone|extensions?|email|directory)\b|聯絡|電話|分機|信箱/iu.test(question)
  &&/\b(?:school|university|stu|offices?|departments?|campus|academic affairs|international affairs)\b|學校|樹德|校園|教務|總務|系辦|辦公室|分機表/iu.test(question)
  &&!/\b(?:my (?:email|inbox|messages?|address|grades?|records?)|another student|someone else's|student email list)\b|我的(?:信箱|郵件|訊息|地址|成績|紀錄)|其他學生|學生信箱名單/iu.test(question);
}

/** Native directory facts remain tied to their actual captured source rows. */
function directoryContext(){
 const navigation=[{title:'行政單位',url:'/%E8%A1%8C%E6%94%BF%E5%96%AE%E4%BD%8D/'},{title:'學術單位',url:'/%E5%AD%B8%E8%A1%93%E5%96%AE%E4%BD%8D/'}];
 const contacts=data.records.map(row=>({...row,extensionsStatus:row.extensions.length?'published_values':'not_recorded_in_selected_source'}));
 const excerpt=contacts.map(row=>[row.name,row.phone,row.extensions.length?'分機 '+row.extensions.join('、'):'',row.email||'',row.address||''].filter(Boolean).join(' · ')).join('\n');
 const dates=[...new Set(contacts.map(row=>row.source.capturedOn))];if(dates.length!==1)return null;
 const metadata={pageTitle:data.title,localUrl:route,capturedOn:dates[0],contentAvailable:true,contentStatus:'verified_public_contact_catalog',contacts,navigation,
  coverage:data.coverage,nativePageScope:'This site page displays only these source-backed contact rows. It replaces a broken imported directory route; it is not a claim that the complete original university extension book was copied.',
  excerpt,excerptTruncated:false,totalCharacters:excerpt.length,includedCharacters:excerpt.length};
 const content=JSON.stringify(metadata),checksum=createHash('sha256').update(content).digest('hex');
 return {page:{title:data.title,route,source:new URL(route,'https://stu.best').href,capturedOn:dates[0]},contentAvailable:true,
  evidence:{id:'public-document:contact-directory:'+checksum.slice(0,16),title:data.title,url:route,urls:[route,...navigation.map(row=>row.url),...contacts.flatMap(row=>[row.source.url,row.source.source])],capturedOn:dates[0],content}};
}

export function publicContactDirectoryContext(question){return isPublicContactDirectoryQuestion(question)?directoryContext():null;}
export function publicContactDirectoryPageContext(value){
 if(typeof value!=='string'||value.length>2000)return null;
 try{const url=new URL(value,'https://stu.best');if(url.origin!=='https://stu.best'||url.username||url.password||url.search||decodeURIComponent(url.pathname).replace(/\/$/u,'')!=='/分機表')return null;return directoryContext();}catch{return null;}
}

/** Coverage guidance for a real native catalog, not a substitute extension book. */
export function publicContactDirectoryResponseNeeds(question,evidence){
 if(!isPublicContactDirectoryQuestion(question)||!Array.isArray(evidence))return [];
 const notes=[];
 for(const item of evidence.slice(0,12)){
  if(typeof item?.id!=='string'||!/^public-document:contact-directory:[a-f0-9]{16}$/u.test(item.id)||typeof item.content!=='string'||item.content.length>100000)continue;
  let metadata;try{metadata=JSON.parse(item.content);}catch{continue;}
  if(metadata?.contentStatus!=='verified_public_contact_catalog'||metadata.localUrl!==route||!Array.isArray(metadata.contacts))continue;
  const allowed=new Set([item.url,...(Array.isArray(item.urls)?item.urls:[])]);
  if(!allowed.has(metadata.localUrl))continue;
  const rows=metadata.contacts.filter(row=>typeof row?.name==='string'&&typeof row.phone==='string'&&Array.isArray(row.extensions)&&row.extensions.every(value=>typeof value==='string')&&typeof row.source?.text==='string'&&allowed.has(row.source.url));
  if(!rows.length)continue;
  const cite=' Source: '+item.id+'.';
  notes.push('Start with the supplied native contact/extension catalog link. Describe its source-backed partial coverage; do not call it a complete university extension book. Ask which office or purpose the user needs when a narrower contact would help, without withholding the available catalog.'+cite);
  if(rows.some(row=>row.extensions.length&&row.source.text.includes(row.name.replace(/（.*$/u,''))))notes.push('When illustrating available contacts, prefer a named unit with published extension values and a source-stated purpose over an unqualified generic footer phone. Preserve the row’s purpose and attribution, particularly feedback-specific contacts; a published extension is not a universal contact for every process. Missing extension fields remain unknown.'+cite);
  if(rows.some(row=>/國際|International/iu.test(row.name)&&row.extensions.length&&allowed.has(row.source.url)))notes.push('When international-student support is relevant, surface the supplied verified international-office contact page and its applicable recorded fields. Do not infer that all questions belong to that office or invent contact fields missing from the selected row.'+cite);
 }
 return [...new Set(notes)].slice(0,3).map(note=>note.slice(0,650));
}

import source from './data/housingPolicy.json' with {type:'json'};
import {isPublicHousingPolicyQuestion} from './publicHousingPolicyIntent.js';
/** Preserve the heading that owns each published application clause. */
function applicationScope(document){
 const audiences=new Map([['新生申請','new students'],['舊生申請','continuing students'],['後補申請(轉學生/復學生申請)','transfer students or students resuming study after an interruption']]);
 const routes=[];let current=null;
 for(const section of document.sections){
  if(section.locator.startsWith('html:heading:')){
   current=audiences.has(section.text)?{heading:{locator:section.locator,text:section.text},audience:audiences.get(section.text),paragraphs:[]}:null;
   if(current)routes.push(current);
  }else if(current)current.paragraphs.push({locator:section.locator,text:section.text});
 }
 const newStudent=routes.find(route=>route.heading.text==='新生申請');
 const duration=newStudent?.paragraphs.find(paragraph=>/住宿契約/u.test(paragraph.text));
 return {applicationRoutes:routes,durationScope:duration?{
  audience:newStudent.audience,sourceHeading:newStudent.heading,literalClause:duration,
  applicability:'This contractual-duration clause belongs to the new-student application section. Its applicability to other applicant groups is not established by that section.',
 }:null};
}

export function publicHousingContext(question){
 if(!isPublicHousingPolicyQuestion(question))return null;
 const checkout=/\b(?:move out|check.?out|withdraw|refund)\b|退宿|退費/iu.test(question);
 const selected=checkout?source.documents.filter(row=>row.kind==='applications'):source.documents;
 const contexts=selected.map(document=>{
  const excerpt=document.sections.map(row=>`${row.locator}\n${row.text}`).join('\n');
  const scope=document.kind==='applications'?applicationScope(document):null;
  const metadata={pageTitle:document.title,localUrl:document.url,originalSource:document.source,capturedOn:document.capturedOn,sourceChecksum:document.checksum,contentAvailable:true,
   coverage:'Checksum-verified public housing instructions. Recurring application months are not proof of an open current window. Room-category prices are not an assigned room, personal invoice, paid balance or scholarship subsidy. Application, bed allocation, checkout permission and refunds are separate outcomes; no personal records were read.',
   terminology:document.kind==='applications'?{continuingStudents:{sourceLabel:'舊生',meaning:'continuing students'},resumingStudents:{sourceLabel:'復學生',meaning:'students resuming study after an interruption; distinct from continuing students'},waitlistHeading:'後補申請(轉學生/復學生申請)'}:undefined,
   ...(scope?{durationScope:scope.durationScope,...(!checkout?{applicationRoutes:scope.applicationRoutes}:{})}:{}),
   excerpt,excerptTruncated:false,totalCharacters:excerpt.length,includedCharacters:excerpt.length};
  return {page:{title:document.title,route:document.url,source:document.source,capturedOn:document.capturedOn},contentAvailable:true,evidence:{id:'public-document:housing:'+document.checksum.slice(0,16),title:document.title,url:document.url,urls:[document.url,document.source],capturedOn:document.capturedOn,content:JSON.stringify(metadata)}};
 });
 return contexts.length?{...contexts[0],additionalEvidence:contexts.slice(1).map(context=>context.evidence)}:null;
}

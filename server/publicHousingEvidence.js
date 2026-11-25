import source from './data/housingPolicy.json' with {type:'json'};
import {isPublicHousingPolicyQuestion} from './publicHousingPolicyIntent.js';
export function publicHousingContext(question){
 if(!isPublicHousingPolicyQuestion(question))return null;
 const checkout=/\b(?:move out|check.?out|withdraw|refund)\b|退宿|退費/iu.test(question);
 const selected=checkout?source.documents.filter(row=>row.kind==='applications'):source.documents;
 const contexts=selected.map(document=>{
  const excerpt=document.sections.map(row=>`${row.locator}\n${row.text}`).join('\n');
  const metadata={pageTitle:document.title,localUrl:document.url,originalSource:document.source,capturedOn:document.capturedOn,sourceChecksum:document.checksum,contentAvailable:true,
   coverage:'Checksum-verified public housing instructions. Recurring application months are not proof of an open current window. Room-category prices are not an assigned room, personal invoice, paid balance or scholarship subsidy. Application, bed allocation, checkout permission and refunds are separate outcomes; no personal records were read.',
   excerpt,excerptTruncated:false,totalCharacters:excerpt.length,includedCharacters:excerpt.length};
  return {page:{title:document.title,route:document.url,source:document.source,capturedOn:document.capturedOn},contentAvailable:true,evidence:{id:'public-document:housing:'+document.checksum.slice(0,16),title:document.title,url:document.url,urls:[document.url,document.source],capturedOn:document.capturedOn,content:JSON.stringify(metadata)}};
 });
 return contexts.length?{...contexts[0],additionalEvidence:contexts.slice(1).map(context=>context.evidence)}:null;
}

import document from './data/accounting115Fees.json' with {type:'json'};
import {publicProspectusContext} from './publicProspectusEvidence.js';

/** Registered public Accounting source; no evaluator reference data is imported. */
export function publicTuitionContext(question){
  if(typeof question!=='string'||question.length>2000||!/\b(?:tuition|fee standards?|tuition fees?)\b|學雜費|學費標準|學費多少/iu.test(question))return null;
  if(/\b(?:payment|pay|deadline|discount|remission|deduct(?:ions?|ed|ing)?)\b|繳費|繳款|截止|減免/iu.test(question))return null;
  // A table is not a personal balance, payment, or scholarship approval.
  if(/\b(?:my|our)\b.{0,30}\b(?:balance|outstanding|paid|payment|status|invoice)\b|我.{0,10}(?:欠費|繳費|餘額|繳了|帳單)/iu.test(question))return null;
  const metadata={pageTitle:document.title,localUrl:document.url,originalSource:document.source,capturedOn:document.capturedOn,
    provenance:document.scope,sourceChecksum:document.checksum,contentAvailable:true,
    coverage:`Complete extracted text of the ${document.pageCount}-page public PDF. Table layout may be lost; preserve the headings, study-level categories and exceptions. A published tariff is not a personal bill or an approved award.`,
    excerpt:document.pages.map(page=>`${page.locator}\n${page.text}`).join('\n\n'),excerptTruncated:false,totalCharacters:document.pages.reduce((n,p)=>n+p.text.length,0),includedCharacters:document.pages.reduce((n,p)=>n+p.text.length,0)};
  const prospectus=publicProspectusContext(question);
  return {page:{title:document.title,route:document.url,source:document.source,capturedOn:document.capturedOn},contentAvailable:true,
    evidence:{id:'public-document:accounting-115:'+document.checksum.slice(0,16),title:document.title,url:document.url,urls:[document.url,document.source],capturedOn:document.capturedOn,content:JSON.stringify(metadata)},
    additionalEvidence:prospectus?[prospectus.evidence]:[]};
}

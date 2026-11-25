/** Import the missing public draft, not the FAQ's composed expected answers. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {downloadSchoolAsset} from './lib/download-school-asset.mjs';
import {extractPdfSections} from '../server/knowledgeAcquisition.js';
const source='https://wpc.stu.edu.tw/wp-content/uploads/sites/60/2026/09/115學年度新南向國際學生產學合作專班招生簡章草案_資管.電通.資工中英0430-v4.pdf';
const directory='public/source-documents/ipiac-115';
const {buffer}=await downloadSchoolAsset(source);
if(buffer.subarray(0,5).toString()!=='%PDF-')throw new Error('Expected a PDF');
const parsed=await extractPdfSections(buffer);
if(!parsed.sections.length)throw new Error('Source has no extractable text');
const capturedOn=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const document={title:'115 IPIAC admission prospectus — source draft',source,capturedOn,
  checksum:createHash('sha256').update(buffer).digest('hex'),pageCount:parsed.pageCount,
  url:'/source-documents/ipiac-115/index.html',pdfUrl:'/source-documents/ipiac-115/prospectus.pdf',
  scope:'Source draft for 115 entry. Mixed year labels and cost subtotals require clarification; not a personal bill or another cohort’s rule.',
  pages:parsed.sections.map(section=>({locator:section.sourceLocator,text:section.content}))};
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; connect-src 'self' https:; object-src 'none'; base-uri 'none'"><title>${esc(document.title)}</title><style>body{margin:auto;max-width:940px;padding:32px 20px;font:16px/1.7 system-ui;color:#202925;background:#f8faf9}header,section{padding:24px;background:white;border:1px solid #dfe6e1;border-radius:12px;margin-bottom:20px}a{color:#137562}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}h1{font-size:28px}small{color:#5d6b64}</style><script defer src="/direct-school-assistant.js"></script></head><body><header><a href="/">University homepage</a><h1>${esc(document.title)}</h1><p>${esc(document.scope)}</p><p><a href="${document.pdfUrl}">Read the unchanged original PDF</a> · <a href="${esc(source)}">Source</a></p><small>Captured ${capturedOn}; ${document.pageCount} physical pages. Extracted text below may lose table layout; use the PDF for exact formatting.</small></header><main>${document.pages.map(page=>`<section id="${esc(page.locator.replaceAll(':','-'))}"><h2>${esc(page.locator)}</h2><pre>${esc(page.text)}</pre></section>`).join('')}</main></body></html>`;
document.captureFile='/school-pages/'+createHash('sha256').update(source).digest('hex').slice(0,20)+'.html';
document.captureChecksum=createHash('sha256').update(html).digest('hex');
await fs.mkdir('public/school-pages',{recursive:true});
await fs.writeFile('public'+document.captureFile,html);
await fs.mkdir(directory,{recursive:true});
await fs.writeFile(directory+'/prospectus.pdf',buffer);
await fs.writeFile(directory+'/index.html',html);
await fs.writeFile(directory+'/source.json',JSON.stringify(document,null,2)+'\n');
// The server uses a small, reviewed text copy; public source bytes stay unchanged.
await fs.mkdir('server/data',{recursive:true});
await fs.writeFile('server/data/ipiac115.json',JSON.stringify(document,null,2)+'\n');
console.log(JSON.stringify({url:document.url,pages:document.pageCount,bytes:buffer.length,checksum:document.checksum}));

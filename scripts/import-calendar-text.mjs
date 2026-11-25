/** Extract registered calendar PDFs, never evaluation reference answers. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {extractPdfSections} from '../server/knowledgeAcquisition.js';
const directory=JSON.parse(await fs.readFile('server/data/calendarDownloads.json','utf8'));
const assets=JSON.parse(await fs.readFile('src/features/public/mirror/assets.json','utf8'));
const documents=[];
for(const download of directory.downloads.filter(row=>row.edition==='english')){
 const asset=assets.find(row=>row.file===download.url);
 if(!asset)throw Error('Calendar PDF is not registered');
 const bytes=await fs.readFile('public'+download.url);
 const checksum=createHash('sha256').update(bytes).digest('hex');
 if(checksum!==download.checksum||checksum!==asset.checksum)throw Error('Calendar PDF checksum mismatch');
 const parsed=await extractPdfSections(bytes);
 if(!parsed.sections.length)throw Error('Calendar PDF has no readable content');
 const pages=parsed.sections.map(row=>({locator:row.sourceLocator,text:row.content}));
 const events=[];
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 for(const page of pages){
  const spring=/Spring semester\s*:/iu.test(page.text);
  const year=download.academicYear+1911+(spring?1:0);
  let ordinal=0;
  for(const match of page.text.matchAll(/\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s*[–-]\s*([\s\S]*?)(?=|Note\s*[：:]|$)/gu)){
   const month=months.indexOf(match[1])+1;
   const event=match[3].split(/\s+W\d+\b/u)[0].replace(/\s+\d+(?:\s+\d+){2}[\s\S]*$/u,'').trim();
   if(!event)continue;
   events.push({date:`${year+(!spring&&month<8?1:0)}-${String(month).padStart(2,'0')}-${match[2].padStart(2,'0')}`,event,locator:page.locator+':event:'+(++ordinal)});
  }
 }
 if(!events.length){console.warn('Skipped calendar without supported event markers:',download.academicYear);continue;}
 documents.push({...download,source:asset.source,capturedOn:directory.capturedOn,pageCount:parsed.pageCount,parserVersion:parsed.parserVersion,
  eventParserVersion:'calendar-bullets@1',events,notes:pages.map(page=>({locator:page.locator,text:page.text.split(/Note\s*[：:]/u)[1]?.trim()||''})).filter(row=>row.text),pages});
}
if(!documents.length)throw Error('No calendar has supported event markers');
await fs.writeFile('server/data/calendarText.json',JSON.stringify({directoryUrl:directory.url,documents},null,2)+'\n');
console.log('Extracted',documents.length,'registered calendar PDFs');

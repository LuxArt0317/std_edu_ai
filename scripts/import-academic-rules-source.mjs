/** Import an actual public academic-rules document linked by the registered regulations page. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {extractPdfSections} from '../server/knowledgeAcquisition.js';
const pages=JSON.parse(await fs.readFile('src/features/public/mirror/pages.json','utf8'));
const directory=pages.find(page=>page.source==='https://www.aca.stu.edu.tw/%E6%95%99%E5%8B%99%E6%B3%95%E8%A6%8F/');
if(!directory)throw Error('Academic regulations directory is not registered');
const html=await fs.readFile('public'+directory.file);
if(createHash('sha256').update(html).digest('hex')!==directory.checksum)throw Error('Academic regulations directory checksum mismatch');
const $=load(html),matches=$('a[href]').toArray().filter(element=>$(element).text().trim()==='AC05-3-101 學則(中英文版)_1150202.pdf');
if(matches.length!==1)throw Error('Academic rules source link is ambiguous');
const source=$(matches[0]).attr('href');
if(source!=='https://drive.google.com/open?id=1GOwdmwo7eSjgWDF72LXwpvhr5eBT486J&usp=drive_copy')throw Error('Academic rules source destination changed');
const url='/school-assets/e44f25b3f3d059cea3e3.pdf',checksum='e44f25b3f3d059cea3e31bc618cd09239def01feb4bb46ddb25a574f89ed1f2e';
const bytes=await fs.readFile('public'+url);
if(bytes.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==checksum)throw Error('Academic rules PDF checksum mismatch');
const parsed=await extractPdfSections(bytes);
if(parsed.pageCount!==28)throw Error('Academic rules edition/page count changed');
const full=parsed.sections.map(section=>section.content.replace(/^Page \d+ \/ \d+\s*/u,'')).join('\n');
const partTitle=full.match(/第二篇[\s\S]*?(?=第一章)/u)?.[0].trim();
if(!partTitle?.includes('Day Division'))throw Error('Academic rules division scope changed');
const selectors=[['23','第二十三條','第二十四條',[11]],['24','第二十四條','第五章',[11,12]],['25','第二十五條','第二十六條',[12]],['30','第三十條','第三十一條',[14,15]],['38','第三十八條','第三十九條',[18]],['40','第四十條','第三篇',[19]]];
const articles=selectors.map(([article,chineseMarker,end,pageNumbers])=>{
 const marker='Article '+article+' ',englishStart=full.indexOf(marker),start=full.lastIndexOf(chineseMarker,englishStart),stop=full.indexOf(end,englishStart);
 if(start<0||stop<=start||full.indexOf(marker,englishStart+marker.length)>=0)throw Error('Academic rules article boundary changed: '+article);
 const text=full.slice(start,stop).replace(/\s+/gu,' ').trim();
 if(text.length<100||text.length>6000)throw Error('Academic rules article size changed: '+article);
 return {article,pageNumbers,text};
});
const record={title:$(matches[0]).text().trim(),source,url,checksum,bytes:bytes.length,capturedOn:'2026-11-25',
 directory:{title:directory.title,url:directory.route,source:directory.source,checksum:directory.checksum,capturedOn:directory.capturedOn},
 pageCount:parsed.pageCount,parserVersion:parsed.parserVersion,part:{title:partTitle,pageNumber:2},articles,
 pages:parsed.sections.map(section=>({locator:section.sourceLocator,text:section.content}))};
await fs.writeFile('server/data/academicRules115.json',JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({academicRulesImported:true,pages:record.pageCount,articles:articles.map(row=>row.article),bytes:bytes.length,checksum}));

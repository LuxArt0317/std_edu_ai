/** Read actual linked regulations; never import a FAQ answer or evaluation reference. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {extractPdfSections} from '../server/knowledgeAcquisition.js';
const pages=JSON.parse(await fs.readFile('src/features/public/mirror/pages.json','utf8'));
const directory=pages.find(row=>row.source==='https://www.aca.stu.edu.tw/%E6%95%99%E5%8B%99%E6%B3%95%E8%A6%8F/');
if(!directory)throw Error('Academic regulations directory is not registered');
const html=await fs.readFile('public'+directory.file);
if(createHash('sha256').update(html).digest('hex')!==directory.checksum)throw Error('Academic regulations directory checksum mismatch');
const $=load(html);
const definitions=[
 {role:'semester_suspension',title:'AC05-3-601 學生休學辦法_1120426.pdf',id:'1fXoQ6C6YSvSh78OzkoxuUL68GeAWIDVU',checksum:'6bff0a223ccf7873e1f1c162fc6d1de60615e1e99b2650ef5634f397b11cd8b0',pageCount:2,selectors:[['5','第五條 學生休學','第六條 學生休學',[1]]]},
 {role:'credit_transfer',title:'AC05-3-L01 學生抵免學分辦法_1140910.pdf',id:'1LuhDk1I93iLm_vlTzCKzgeAREfICcq8T',checksum:'e4596ecbaaafd37a1a13f8045c1dade2b2bc95bb0994c811e9a608efd8065e94',pageCount:3,selectors:[['4','第四條 學生抵修學分數規定如下：','第五條 提高編級之規定如下：',[1,2]],['9','第九條 申請抵免學分之期限及程序：','第十條 抵免學分之審核：',[3]]]},
];
const documents=[];
for(const definition of definitions){
 const anchors=$('a[href]').toArray().filter(node=>$(node).text().trim()===definition.title);
 if(anchors.length!==1)throw Error('Study-option source link is missing or ambiguous');
 const source=$(anchors[0]).attr('href');
 if(source!=='https://drive.google.com/open?id='+definition.id+'&usp=drive_copy')throw Error('Study-option source destination changed');
 const url='/school-assets/'+definition.checksum.slice(0,20)+'.pdf',bytes=await fs.readFile('public'+url);
 if(bytes.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==definition.checksum)throw Error('Study-option PDF checksum mismatch');
 const parsed=await extractPdfSections(bytes);
 if(parsed.pageCount!==definition.pageCount)throw Error('Study-option page count changed');
 const text=parsed.sections.map(section=>section.content).join('\n');
 const sections=definition.selectors.map(([article,startMarker,endMarker,pageNumbers])=>{
  const start=text.indexOf(startMarker),end=text.indexOf(endMarker,start);
  if(start<0||end<=start||text.indexOf(startMarker,start+startMarker.length)>=0)throw Error('Study-option article boundary changed');
  return {article,pageNumbers,text:text.slice(start,end).replace(/\s+/gu,' ').trim()};
 });
 documents.push({title:definition.title,role:definition.role,url,source,checksum:definition.checksum,bytes:bytes.length,capturedOn:'2026-11-25',pageCount:parsed.pageCount,parserVersion:parsed.parserVersion,
  sections,pages:parsed.sections.map(section=>({locator:section.sourceLocator,text:section.content}))});
}
await fs.writeFile('server/data/academicStudyOptions.json',JSON.stringify({directory:{url:directory.route,source:directory.source,checksum:directory.checksum},documents},null,2)+'\n');
console.log(JSON.stringify({academicStudyOptionsImported:true,documents:documents.map(row=>({role:row.role,bytes:row.bytes,pages:row.pageCount}))}));

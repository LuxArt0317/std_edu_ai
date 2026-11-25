/** Project registered public housing pages, not the FAQ reference. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {publicPageForRoute} from '../server/publicPageContext.js';
import {detectAndExtractSource} from '../server/knowledgeAcquisition.js';
const documents=[];
for(const [kind,route] of [['prices','/school-sites/omh.sao.stu.edu.tw/房型-價目一覽/'],['applications','/school-sites/omh.sao.stu.edu.tw/申請-更換-退宿/']]){
 const page=publicPageForRoute(route);if(!page)throw Error('Housing page not registered');
 const bytes=await fs.readFile('public'+page.file);
 if(createHash('sha256').update(bytes).digest('hex')!==page.checksum)throw Error('Housing page checksum mismatch');
 const $=load(bytes.toString('utf8'));
 const root=$('#content').first().length?$('#content').first():$('main').first().length?$('main').first():$('article').first();
 if(!root.length)throw Error('Housing page has no supported content container');
 const extracted=await detectAndExtractSource(Buffer.from('<html><body><main>'+root.html()+'</main></body></html>'),'text/html','https://stu.best');
 const sections=extracted.sections.map(section=>({locator:section.sourceLocator,text:section.content.replace(/\s*\(https?:\/\/[^\s)]+\)/gu,'').trim()}));
 const unique=sections.filter((row,index)=>row.text&&sections.findIndex(other=>other.text===row.text)===index);
 documents.push({kind,title:page.title,url:page.route,source:page.source,capturedOn:page.capturedOn,checksum:page.checksum,sections:unique});
}
await fs.writeFile('server/data/housingPolicy.json',JSON.stringify({documents},null,2)+'\n');
console.log('Imported',documents.length,'checksum-verified housing pages');

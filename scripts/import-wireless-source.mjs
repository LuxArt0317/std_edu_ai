import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {publicPageForRoute} from '../server/publicPageContext.js';
const documents=[];
for(const route of ['/school-sites/www.ecc.stu.edu.tw/wireless/','/school-sites/help.ecc.stu.edu.tw/wireless-setting/']){
 const page=publicPageForRoute(route);if(!page)throw Error('Wireless source not registered');
 const bytes=await fs.readFile('public'+page.file);
 if(createHash('sha256').update(bytes).digest('hex')!==page.checksum)throw Error('Wireless source checksum mismatch');
 const $=load(bytes.toString('utf8'));$('script,style,nav,header,footer,input,textarea,select,noscript,template').remove();$('br').replaceWith('\n');
 const root=$('main').first().length?$('main').first():$('article').first().length?$('article').first():$('body');
 const text=root.text().replace(/\s+/gu,' ').trim();
 documents.push({title:page.title,url:page.route,source:page.source,capturedOn:page.capturedOn,checksum:page.checksum,text});
}
const wireless=documents[0];
const networks=[...new Set(wireless.text.match(/STU-Dorm-Mobile(?:-5G)?/gu)||[])];
const registrationRequired=/先至宿舍網路登錄系統.{0,160}註冊無線網路服務/u.test(wireless.text);
const email=wireless.text.match(/service@stu\.edu\.tw/u)?.[0];
const extension=wireless.text.match(/07-6158000\s*#\s*(\d{4})/u)?.[1];
if(networks.length!==2||!registrationRequired||!email||!extension||!/802\.1[Xx]/u.test(wireless.text))throw Error('Wireless source facts unavailable');
if(!/Windows/u.test(documents[1].text)||!/MacOS/u.test(documents[1].text)||!/宿舍/u.test(documents[1].text)||!/電腦/u.test(documents[1].text))throw Error('Computer/dorm setup choices unavailable');
const pages=JSON.parse(await fs.readFile('src/features/public/mirror/pages.json','utf8'));
const registrationCaptured=pages.some(page=>{try{return new URL(page.source).hostname==='dorm.stu.edu.tw'}catch{return false}});
await fs.writeFile('server/data/wirelessGuide.json',JSON.stringify({documents,networks,registrationRequired,registrationCaptured,email,extension},null,2)+'\n');
console.log('Imported two checked wireless pages; registration captured:',registrationCaptured);

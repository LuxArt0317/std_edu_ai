/** Derive a small public contact record from a checksum-pinned existing ACA footer. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {publicContactSections} from '../server/publicContactDetails.js';
const route='/school-sites/www.aca.stu.edu.tw/2024/02/01/%E5%AD%B8%E6%9C%9F%E6%88%90%E7%B8%BE%E9%96%8B%E6%94%BE%E6%9F%A5%E8%A9%A2%E5%8F%8A%E7%94%B3%E8%AB%8B%E5%88%97%E5%8D%B0/';
const pages=JSON.parse(await fs.readFile('src/features/public/mirror/pages.json','utf8'));
const page=pages.find(row=>row.route===route);
if(!page)throw Error('Academic contact source is not registered');
const bytes=await fs.readFile('public'+page.file);
if(createHash('sha256').update(bytes).digest('hex')!==page.checksum)throw Error('Academic contact source checksum mismatch');
const blocks=publicContactSections(bytes.toString('utf8')).filter(block=>/\bE-Mail[：:]|信箱/iu.test(block.text)&&/\bTel[：:]|電話/iu.test(block.text)).sort((a,b)=>a.text.length-b.text.length);
if(!blocks.length)throw Error('Academic contact block is unavailable');
const block=blocks[0],fax=block.text.indexOf('Fax'),text=(fax<0?block.text:block.text.slice(0,fax)).trim();
const email=text.match(/[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)*stu\.edu\.tw/u)?.[0];
const phone=text.match(/Tel[：:]\s*([+\d][\d\s()\-]+)\s*ext\./u)?.[1]?.trim();
const address=text.split('\n')[0].split('Contact Us')[1]?.trim();
if(!email||!phone||!address||!text.includes('行政大樓1樓'))throw Error('Academic contact fields changed; inspect the actual source');
const data={title:'Academic Affairs published contact details',sourceTitle:page.title,url:page.route,source:page.source,capturedOn:page.capturedOn,
 captureFile:page.file,captureChecksum:page.checksum,locator:block.locator,text,contacts:{email,phone,address},
 scope:'Published contact information only; no extension number, current opening hours, process authority, approval or native semester-status application is established.'};
await fs.writeFile('server/data/academicContacts.json',JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({academicContactImported:true,locator:data.locator,characters:text.length,sourceChecksum:page.checksum}));

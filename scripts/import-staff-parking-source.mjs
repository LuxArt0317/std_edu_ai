import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {load} from 'cheerio';
import {publicPageForRoute} from '../server/publicPageContext.js';

export const staffParkingProcedureRoute='/school-sites/things.stu.edu.tw/%E5%81%9C%E8%BB%8A%E8%AD%89%E7%94%B3%E8%BE%A6%E6%B5%81%E7%A8%8B/';
/** Literal staff blocks only: nearby student prices never become staff rates. */
export function extractStaffParkingSections(html){
 const $=load(html),root=$('.entry-content .elementor-widget-text-editor').first().clone();
 if(!root.length)throw Error('Parking article text block missing');
 root.find('script,style,nav,header,footer,input,textarea,select,noscript,template').remove();
 const text=root.text().replace(/\s+/gu,' ').trim();
 const start=text.search(/教職員[：:]/u),end=text.indexOf('學生:',start);
 if(start<0||end<=start)throw Error('Staff/student parking section boundary missing');
 const staff=text.slice(start,end),car=staff.match(/汽車[：:]\s*(.*?)(?=\(駐校\)|機車[：:])/u)?.[1]?.trim();
 const motorcycle=staff.match(/機車[：:]\s*(.*)$/u)?.[1]?.trim();
 const contact=text.match(/如有任何問題請電洽總務處事務組.*$/u)?.[0];
 const general=text.slice(0,start).trim();
 const phone=contact?.match(/\b0[2-8]-?\d{3,4}-?\d{4}\b/u)?.[0];
 const extensions=[...(contact||'').matchAll(/#(\d{4})/gu)].map(match=>match[1]);
 if(!car||!motorcycle||!contact||!phone||extensions.length!==2
  ||!/每學年/u.test(car)||!/單位主管蓋章/u.test(car)||!/教職員證/u.test(motorcycle))throw Error('Staff parking source facts missing');
 return {general:{locator:'汽（機）車停車申請 > 申辦週期',text:general},staffCar:{locator:'教職員 > 汽車',text:car},
  staffMotorcycle:{locator:'教職員 > 機車',text:motorcycle},contact:{locator:'如有任何問題請電洽總務處事務組',text:contact,phone,extensions}};
}

export async function importStaffParkingSource(){
 const page=publicPageForRoute(staffParkingProcedureRoute);if(!page)throw Error('Parking source is not registered');
 const root=new URL('../',import.meta.url),bytes=await readFile(new URL('public'+page.file,root));
 if(createHash('sha256').update(bytes).digest('hex')!==page.checksum)throw Error('Parking source checksum mismatch');
 const sections=extractStaffParkingSections(bytes.toString('utf8'));
 const record={version:1,title:page.title,url:page.route,source:page.source,capturedOn:page.capturedOn,captureFile:page.file,checksum:page.checksum,sections};
 const destination=new URL('server/data/staffParkingSource.json',root),temporary=new URL('server/data/staffParkingSource.json.tmp',root);
 await writeFile(temporary,JSON.stringify(record,null,2)+'\n');await rename(temporary,destination);
 return record;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const source=await importStaffParkingSource();console.log(JSON.stringify({staffParkingSource:true,checksum:source.checksum,sections:Object.keys(source.sections)}));
}

import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
const pages=JSON.parse(await fs.readFile('src/features/public/mirror/pages.json','utf8'));
const page=pages.find(row=>row.source.includes('www.aca.stu.edu.tw/')&&decodeURIComponent(row.route).includes('行事曆'));
if(!page)throw Error('Calendar capture is not registered');
const bytes=await fs.readFile('public'+page.file);
if(createHash('sha256').update(bytes).digest('hex')!==page.checksum)throw Error('Calendar capture checksum mismatch');
const $=load(bytes.toString('utf8'));$('script,style,header,footer,nav').remove();
const text=($('main').first().text()||$('article').first().text()||$('body').text()).replace(/\s+/gu,' ').trim();
const compact=text.replace(/\s+/gu,'');
const years=[...compact.matchAll(/(1\d{2})學年度行事曆\((20\d{2})[~～–-](20\d{2})\)/gu)].map(match=>({academicYear:Number(match[1]),start:Number(match[2]),end:Number(match[3])}));
if(!years.length)throw Error('Calendar academic-year headings unavailable');
const downloads=[];
for(const anchor of $('a[href]').toArray()){
 const url=$(anchor).attr('href'),title=$(anchor).text().replace(/\s+/gu,' ').trim();
 if(!/^\/school-assets\/[a-f0-9]{20}\.pdf$/u.test(url||''))continue;
 const edition=/教職員/u.test(title)?'staff':/學生/u.test(title)?'student':/Academic Calendar/iu.test(title)?'english':null;
 if(!edition)continue;
 const academicYear=Number(title.match(/(1\d{2})學年度/u)?.[1])||years.find(year=>title.includes(year.start+'-'+year.end))?.academicYear;
 if(!academicYear||!years.some(year=>year.academicYear===academicYear))throw Error('Unmatched calendar download year');
 const pdf=await fs.readFile('public'+url);if(!pdf.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('Calendar download is not a PDF');
 downloads.push({title,url,academicYear,edition,checksum:createHash('sha256').update(pdf).digest('hex')});
}
for(const year of years)for(const edition of ['student','staff','english'])if(downloads.filter(row=>row.academicYear===year.academicYear&&row.edition===edition).length!==1)throw Error('Ambiguous calendar editions');
await fs.writeFile('server/data/calendarDownloads.json',JSON.stringify({title:page.title,url:page.route,source:page.source,capturedOn:page.capturedOn,checksum:page.checksum,years,downloads},null,2)+'\n');
console.log('Imported',years.length,'published calendar years and',downloads.length,'validated PDF links');

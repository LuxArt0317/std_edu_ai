/** Build a small public contact catalog from registered, checksum-verified captures. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {extractStaffParkingSections} from './import-staff-parking-source.mjs';
import {publicContactSections} from '../server/publicContactDetails.js';
const pages=JSON.parse(await fs.readFile('src/features/public/mirror/pages.json','utf8'));
const read=async route=>{const page=pages.find(row=>decodeURI(row.route)===route);if(!page)throw Error('Contact capture missing: '+route);const bytes=await fs.readFile('public'+page.file);if(createHash('sha256').update(bytes).digest('hex')!==page.checksum)throw Error('Contact capture checksum mismatch');return{page,html:bytes.toString('utf8'),blocks:publicContactSections(bytes.toString('utf8'))};};
const proof=(page,locator,text)=>({title:page.title,url:page.route,source:page.source,captureFile:page.file,checksum:page.checksum,capturedOn:page.capturedOn,locator,text});
const records=[];
const home=await read('/'),homeBlock=home.blocks.find(block=>/電話聯絡/u.test(block.text)&&/615-8000/u.test(block.text));
if(!homeBlock)throw Error('Published school phone card missing');
const general=homeBlock.text.match(/\(\+886\)\s*7-615-8000/u)?.[0];if(!general)throw Error('School phone format changed');
records.push({id:'school-phone',name:'學校電話聯絡',phone:general,extensions:[],email:null,address:null,source:proof(home.page,homeBlock.locator,homeBlock.text)});
const academic=JSON.parse(await fs.readFile('server/data/academicContacts.json','utf8'));
const academicPage=pages.find(page=>page.route===academic.url);if(!academicPage||academicPage.checksum!==academic.captureChecksum)throw Error('Academic contact projection no longer matches its capture');
const academicCapture=await read(decodeURI(academic.url));
if(!academicCapture.blocks.some(block=>block.text.includes(academic.text))||!Object.values(academic.contacts).every(value=>academic.text.includes(value)))throw Error('Academic contact values lack direct source support');
records.push({id:'academic-affairs',name:'教務處',phone:academic.contacts.phone,extensions:[],email:academic.contacts.email,address:academic.contacts.address,source:proof(academicPage,academic.locator,academic.text)});
// Keep this course-feedback contact separate from the general ACA footer.
const teaching=await read('/school-sites/www.aca.stu.edu.tw/2019/06/13/教學意見反應管道宣導/');
const $=load(teaching.html);
const paragraphs=$('article#post-1602 p').toArray().map(node=>$(node).text().replace(/\s+/gu,' ').trim())
 .filter(text=>text.includes('提出課程教學上的問題')&&text.includes('教務處註冊課務組啟'));
if(paragraphs.length!==1)throw Error('Registrar course-feedback contact paragraph is missing or ambiguous');
const paragraph=paragraphs[0],clause=paragraph.match(/除了藉由校務資訊系統反應外[^。]+分機[\d\s,、，]+。/u)?.[0];
const teachingEmail=clause?.match(/[A-Za-z0-9._%+-]+@stu\.edu\.tw/u)?.[0];
const teachingExtensions=clause?.match(/分機\s*((?:\d{3,5}\s*[,、，]\s*)*\d{3,5})/u)?.[1].split(/\s*[,、，]\s*/u);
const teachingFooter=teaching.blocks.filter(row=>row.text.includes('course@stu.edu.tw')).sort((a,b)=>a.text.length-b.text.length)[0];
const teachingPhoneLine=teachingFooter?.text.split('\n').find(line=>/Tel[：:]/u.test(line));
const teachingPhone=teachingPhoneLine?.match(/Tel[：:]\s*([+\d][\d\s()\-]+)\s*ext\./u)?.[1]?.trim();
if(!clause||!teachingEmail||!teachingExtensions?.length||!teachingPhone||!teachingPhoneLine)throw Error('Registrar course-feedback contact fields changed');
const teachingProof=[clause,'教務處註冊課務組啟',teachingPhoneLine].join('\n');
records.push({id:'registrar-teaching-feedback',name:'教務處註冊課務組（課程教學意見反應）',phone:teachingPhone,extensions:teachingExtensions,email:teachingEmail,address:null,
 source:proof(teaching.page,'article#post-1602 p (course-teaching-feedback contact and attribution); '+teachingFooter.locator+' (same-page ACA phone)',teachingProof)});
const international=await read('/school-sites/www.oica.stu.edu.tw/聯絡資訊/');
const block=international.blocks.find(row=>row.text.includes('oica@stu.edu.tw'));if(!block)throw Error('International contact block missing');
const phone=block.text.match(/\+886-7-6158000/u)?.[0],email=block.text.match(/[A-Za-z0-9._%+-]+@stu\.edu\.tw/u)?.[0],address=block.text.match(/824[^\n]+\n行政大樓[^\n]+/u)?.[0];
const lines=block.text.split('\n'),offset=lines.findIndex(line=>/^分機\s+\d+$/u.test(line.trim()));
if(!phone||!email||!address||offset<0)throw Error('International contact fields changed');
const extensions=[lines[offset].replace(/^分機\s*/u,'').trim()];for(const line of lines.slice(offset+1)){if(!/^\d{3,5}$/u.test(line.trim()))break;extensions.push(line.trim());}
if(extensions.length!==3)throw Error('International contact extension count changed');
records.push({id:'international-affairs',name:'國際及兩岸事務處',phone,extensions,email,address,source:proof(international.page,block.locator,block.text)});
const parking=JSON.parse(await fs.readFile('server/data/staffParkingSource.json','utf8')),parkingPage=pages.find(page=>page.route===parking.url);
if(!parkingPage||parkingPage.checksum!==parking.checksum)throw Error('General Affairs source projection changed');const parkingCapture=await read(decodeURI(parking.url));
if(JSON.stringify(extractStaffParkingSections(parkingCapture.html))!==JSON.stringify(parking.sections))throw Error('General Affairs projection lacks direct source support');
const contact=parking.sections.contact;if(!contact.text.includes(contact.phone)||!contact.extensions.every(value=>contact.text.includes('#'+value)))throw Error('General Affairs contact fields lack source support');
records.push({id:'general-affairs',name:'總務處事務組',phone:contact.phone,extensions:contact.extensions,email:null,address:null,source:proof(parkingPage,contact.locator,contact.text)});
const value={version:1,title:'聯絡資訊與分機查詢',path:'/%E5%88%86%E6%A9%9F%E8%A1%A8/',records,
 coverage:'Only the listed public contacts from verified saved captures are included. This is not a complete university phone book or a live directory. Empty fields mean not recorded here, not that no contact exists. No staff role, recipient availability, office authority, delivery or private record is established.'};
await fs.writeFile('server/data/publicContactDirectory.json',JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({contactRecords:records.length,sourceChecksumsVerified:true}));

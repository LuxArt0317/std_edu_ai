import {createHash} from 'node:crypto';
import source from './data/staffParkingSource.json' with {type:'json'};
import {parkingPermitPath,parkingInstructionsPath} from '../src/features/public/affairs/parkingPermits.js';

export function isPublicStaffParkingQuestion(question){
 if(typeof question!=='string'||question.length>2000)return false;
 return /\b(?:teachers?|faculty|staff)\b|教職員|教師|教员|教員/iu.test(question)
  &&/\b(?:parking|permits?|car|motorcycle)\b|停車|停车|車證|车证/iu.test(question)
  &&!/\b(?:my (?:permit|parking (?:space|application|allocation))|another (?:person|student)|on my behalf|for me|approved|approval status)\b|我的(?:車證|车证|停車位|停车位|申請狀態)|幫我申請|帮我申请|其他(?:學生|学生)|核准狀態/iu.test(question);
}

/** Published staff process plus implemented entry navigation; no private permit is read. */
export function publicStaffParkingContext(question){
 if(!isPublicStaffParkingQuestion(question))return null;
 const includeCycle=/\b(?:when|deadline|dates?|month|period|start|academic year)\b|何時|何时|什麼時候|什么时候|期限|日期|申請期間|申请期间/iu.test(question);
 const sections={...(includeCycle?{general:source.sections.general}:{}),staffCar:source.sections.staffCar,
  staffMotorcycle:source.sections.staffMotorcycle,contact:source.sections.contact};
 const record={pageTitle:source.title,localUrl:source.url,originalSource:source.source,capturedOn:source.capturedOn,
  checksum:source.checksum,contentAvailable:true,contentStatus:'verified_staff_parking_sections',sections,
  coverage:'Selected literal staff parking and office-contact text from the published procedure. Student lottery rules, locations and prices are omitted and must not be applied to staff. The motorcycle rule has its stated academic year. These excerpts do not establish current application availability, a staff member\'s allocation, eligibility, role, approval, permit issue or completed application.',
  navigation:{scope:'Implemented stu.best entry and instructions navigation only. The entry links to the school parking service and explains its separate sign-in. It is not evidence of a native staff permit form, accessible staff option, a completed login, or authority to issue a permit.',pages:[
   {title:'汽機車證申請',url:parkingPermitPath},
   {title:'車證申請須知',url:parkingInstructionsPath},
  ]},excerpt:Object.values(sections).map(section=>section.locator+'\n'+section.text).join('\n\n'),excerptTruncated:true};
 const content=JSON.stringify(record),hash=createHash('sha256').update(content).digest('hex');
 return {page:{title:source.title,route:source.url,source:source.source,capturedOn:source.capturedOn},contentAvailable:true,
  evidence:{id:'public-document:staff-parking:'+hash.slice(0,16),title:source.title,url:source.url,
   urls:[source.url,source.source,parkingPermitPath,parkingInstructionsPath],capturedOn:source.capturedOn,content}};
}

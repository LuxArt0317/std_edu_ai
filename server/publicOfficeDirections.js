import {boundedPublicPageEvidence,publicPageForRoute} from './publicPageContext.js';

export function isPublicOfficeDirectionsQuestion(question){
 return typeof question==='string'&&question.length<=2000
  &&/\b(?:offices?|departments?|administrative units?)\b|辦公室|系辦|行政單位/iu.test(question)
  &&/\b(?:where|directions?|how (?:do|can|should) i get|building|floor|room|contact|phone|telephone|extension|email)\b|在哪|哪裡|怎麼走|樓層|位置|聯絡|電話|分機|信箱/iu.test(question)
  &&!/\b(?:my grades?|my records?|my appointment|another student|right now|open today|live location)\b|我的成績|我的紀錄|我的預約|其他學生|即時位置|今天開放/iu.test(question);
}

const officeRoutes=[
 '/',
 '/%E8%A1%8C%E6%94%BF%E5%96%AE%E4%BD%8D/',
 '/%E5%AD%B8%E8%A1%93%E5%96%AE%E4%BD%8D/',
 '/school-sites/www.aca.stu.edu.tw/2024/02/01/%E5%AD%B8%E6%9C%9F%E6%88%90%E7%B8%BE%E9%96%8B%E6%94%BE%E6%9F%A5%E8%A9%A2%E5%8F%8A%E7%94%B3%E8%AB%8B%E5%88%97%E5%8D%B0/',
 '/school-sites/www.oica.stu.edu.tw/%E8%81%AF%E7%B5%A1%E8%B3%87%E8%A8%8A/',
];

/** Choose a contact source for contact requests; a map for directions. */
export function publicOfficeCaptureRoute(question){
 return /\b(?:contact|phone|telephone|extensions?|email)\b|聯絡|電話|分機|信箱/iu.test(question)?officeRoutes[3]:'/school-sites/www.oica.stu.edu.tw/en/school-map/';
}

export function focusOfficeContactContext(context){
 if(!context?.contentAvailable)return context;
 const metadata=JSON.parse(context.evidence.content);
 if(!metadata.contactSections?.length)return context;
 const sections=metadata.contactSections.filter((section,index,all)=>!all.some((other,otherIndex)=>otherIndex!==index&&section.text!==other.text&&section.text.includes(other.text)));
 metadata.contactSections=sections;
 metadata.excerpt=sections.map(section=>section.text).join('\n');
 metadata.includedCharacters=metadata.excerpt.length;
 metadata.excerptTruncated=true;metadata.selection='Contact blocks selected from this verified page; not the full article.';
 return {...context,evidence:{...context.evidence,title:context.evidence.title+' · Contact section',content:JSON.stringify(metadata)}};
}

/** Read actual directory/contact captures; never infer a room from a menu label. */
export async function loadOfficeDirectionsEvidence(loadPage,deadline){
 const contexts=await Promise.all(officeRoutes.filter(route=>publicPageForRoute(route)).map(route=>loadPage(route,deadline,{includeContactSections:true,includeDirectoryLinks:true}).catch(()=>null)));
 return contexts.filter(context=>context?.contentAvailable).map(context=>boundedPublicPageEvidence(focusOfficeContactContext(context),{budget:7000}));
}

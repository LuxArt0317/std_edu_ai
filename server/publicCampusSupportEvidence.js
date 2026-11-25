import {boundedPublicPageEvidence,publicPageForRoute} from './publicPageContext.js';

export const campusSupportRoute='/school-sites/www.ssc.stu.edu.tw/';
export const campusEmergencyRoute='/school-sites/www.oica.stu.edu.tw/en/emergency-call/';
const administrativeDirectory='/%E8%A1%8C%E6%94%BF%E5%96%AE%E4%BD%8D/';

/** Public service guidance never establishes a recovered item or a safety verdict. */
export function publicCampusSupportIntent(question){
 if(typeof question!=='string'||question.length>2000)return null;
 const text=question.normalize('NFKC');
 if(/\b(?:another student's|someone else's|access.*records|my (?:grades|balance|attendance))\b|其他學生的|他人的|我的成績|我的餘額/iu.test(text))return null;
 if(/\blost[- ]and[- ]found\b|\blost (?:property|belongings|items?)\b|失物招領|遺失物|拾獲物/iu.test(text))return 'lost-property';
 if(/\b(?:school|campus|university|neighbou?rhood|location)\b/iu.test(text)&&/\b(?:safe|safety|security|dangerous|crime)\b/iu.test(text)
  ||/校園安全|學校(?:的)?(?:位置|周邊|附近)?.{0,5}安全|周邊安全|附近安全/u.test(text))return 'safety';
 return null;
}

/** Retain literal support-topic/footer lines; never turn excerpt omissions into absence. */
export function focusCampusSupportContext(context){
 if(!context?.contentAvailable)return context;
 try{
  const metadata=JSON.parse(context.evidence.content);
  if(typeof metadata.excerpt!=='string')return context;
  const selected=metadata.excerpt.split('\n').filter(line=>
   /^(?:校安緊急處理流程|校園安全|交通安全|諮商中心|健康中心|生輔組|學生申訴專區|Copyright ©|Emergency Call\s+\d)/u.test(line.trim()));
  if(!selected.length)return context;
  // Mirrored navigation labels are useful, but their embedded rewritten URLs
  // are not validated destinations. Only the source's supplied URLs may be linked.
  const excerpt=selected.map(line=>line.replace(/\s*\(https?:\/\/[^)]*\)\s*$/u,'')).join('\n');
  const contactLine=selected.find(line=>/^Copyright ©/u.test(line.trim()));
  const phone=contactLine?.match(/\b0[2-8][ -]?\d{3,4}[ -]?\d{4}\b/u)?.[0];
  const emergencyLine=selected.find(line=>/^Emergency Call\s+\d/u.test(line.trim()));
  const emergencyPhone=emergencyLine?.match(/\b0[2-8][ -]?\d{3,4}[ -]?\d{4}\b/u)?.[0];
  return {...context,evidence:{...context.evidence,content:JSON.stringify({...metadata,excerpt,
   excerptTruncated:true,includedCharacters:excerpt.length,
   ...(context.page.route===campusEmergencyRoute?{contactSections:[]}:{}),
   ...(emergencyPhone?{publishedEmergencyContact:{phone:emergencyPhone,sourceLine:emergencyLine,usage:'Emergency call contact printed in this source. This is not a current crime assessment or a guarantee of safety.'}}:{}),
   ...(phone?{publishedContact:{phone,sourceLine:contactLine,usage:'Phone printed on this public page. The source does not identify it as a lost-property desk or emergency line.'}}:{}),
   projection:'Selected campus-support labels and literal contact lines from a verified public capture; unvalidated embedded navigation URLs are omitted. Other content is omitted; this does not establish the absence of a service, incident or record.',
   supportScope:'These are public resource links and contact details, not a lost-property room, recovered-item record, collection procedure, current crime assessment, safety guarantee or emergency-response receipt.'})}};
 }catch{return context;}
}

/** Office listings support an inquiry route, not a claim that an office runs lost property. */
export function focusLostPropertyDirectoryContext(context){
 if(!context?.contentAvailable||context.page.route!==administrativeDirectory)return context;
 try{
  const metadata=JSON.parse(context.evidence.content);
  const office=metadata.directoryEntries?.find(entry=>entry.label==='學生事務處');
  const section=metadata.contactSections?.find(section=>typeof section.text==='string'&&section.text.includes('學生事務處'));
  if(!office||!section)return context;
  return {...context,evidence:{...context.evidence,content:JSON.stringify({...metadata,
   inquiryChannel:{officeLabel:office.label,englishLabel:'Student Affairs',directoryUrl:administrativeDirectory,sourceText:section.text,
    scope:'Student Affairs is listed in this administrative directory. It is a relevant student-support inquiry channel; this source does not identify it as a confirmed lost-property desk or establish a room, hours, collection process or recovered item.'},
   directoryEntries:[office],contactSections:[section],
   directoryScope:'Focused Student Affairs directory entry for a student-support inquiry, not General Affairs or a verified lost-property service location.'})}};
 }catch{return context;}
}

/** Reuse readable, checksum-verified site pages instead of the broken extensions page. */
export async function loadCampusSupportEvidence(loadPage,deadline,intent){
 const routes=intent==='safety'?[campusSupportRoute,administrativeDirectory,campusEmergencyRoute]:[campusSupportRoute,administrativeDirectory];
 const contexts=await Promise.all(routes.filter(route=>publicPageForRoute(route)).map(route=>
  loadPage(route,deadline,{includeContactSections:true,includeDirectoryLinks:true}).catch(()=>null)));
 return contexts.filter(context=>context?.contentAvailable).map(context=>boundedPublicPageEvidence(
  [campusSupportRoute,campusEmergencyRoute].includes(context.page.route)?focusCampusSupportContext(context):intent==='lost-property'?focusLostPropertyDirectoryContext(context):context,{budget:7000}));
}

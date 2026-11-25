import {isPublicGraduationAttendanceQuestion} from './publicAcademicRulesEvidence.js';

const policyRoles=new Set(['class_attendance_and_short_absence','semester_suspension','withdrawal_from_study','degree_requirements','credit_transfer']);
const formalRoles=['semester_suspension','withdrawal_from_study'];
const sourceId=/^(?:published-guidance|public-(?:page|document):[A-Za-z0-9:_-]{1,120})$/u;
const validClause=value=>value&&typeof value==='object'&&typeof value.quote==='string'&&value.quote.trim().length>=20
 &&Array.isArray(value.pageNumbers)&&value.pageNumbers.length>0&&value.pageNumbers.every(page=>Number.isInteger(page)&&page>0);
const mark=(map,role,id)=>{if(!map.has(role))map.set(role,new Set());map.get(role).add(id);};
const idsFor=(map,roles)=>[...new Set(roles.flatMap(role=>[...(map.get(role)||[])]))].sort();
const sources=(ids)=>ids.slice(0,2).join(', ');

/** Server-owned coverage notes, derived from the request and sources actually present.
 * These notes contain no answer, eligibility result, private value or FAQ reference. */
export function publicAcademicResponseNeeds(question,evidence){
 if(!isPublicGraduationAttendanceQuestion(question)||!Array.isArray(evidence))return [];
 const rules=new Map(),capabilities=new Map(),inquiries=new Map();
 for(const item of evidence.slice(0,12)){
  if(!item||typeof item.id!=='string'||!sourceId.test(item.id)||typeof item.content!=='string'||item.content.length>100000)continue;
  let data;try{data=JSON.parse(item.content);}catch{continue;}
  if(!data||typeof data!=='object'||Array.isArray(data))continue;
  for(const role of Array.isArray(data.policyRoles)?data.policyRoles:[]){
   if(policyRoles.has(role?.role)&&Array.isArray(role.clauses)&&role.clauses.some(validClause))mark(rules,role.role,item.id);
  }
  if(policyRoles.has(data.role)&&Array.isArray(data.clauses)&&data.clauses.some(validClause))mark(rules,data.role,item.id);
  const allowedUrls=new Set([item.url,...(Array.isArray(item.urls)?item.urls:[])].filter(url=>typeof url==='string'));
  for(const service of Array.isArray(data.services)?data.services:[]){
   if(typeof service?.url!=='string'||!allowedUrls.has(service.url)||typeof service.capability!=='string'||!service.capability.trim())continue;
   for(const role of Array.isArray(service.relatedPolicyRoles)?service.relatedPolicyRoles:[])if(policyRoles.has(role))mark(capabilities,role,item.id);
  }
  const inquiry=data.inquiryNavigation;
  if(inquiry?.kind==='public_contact_inquiry'&&typeof inquiry.url==='string'&&allowedUrls.has(inquiry.url)){
   for(const role of Array.isArray(inquiry.roles)?inquiry.roles:[])if(formalRoles.includes(role))mark(inquiries,role,item.id);
  }
 }
 const baseRoles=['class_attendance_and_short_absence','degree_requirements'].filter(role=>rules.has(role));
 const notes=[];
 if(baseRoles.length)notes.push('Answer the attendance/graduation feasibility question at the applicability of the cited clauses; a general rule is not an individual outcome. Sources: '+sources(idsFor(rules,baseRoles))+'.');
 const availableFormal=formalRoles.filter(role=>rules.has(role));
 if(rules.has('class_attendance_and_short_absence')&&availableFormal.length){
  notes.push('Distinguish the supported process scopes instead of substituting short absence for formal study change. Explain these choices conditionally when relevant to stopping study: '+availableFormal.join(', ')+'. Unknown personal selectors need not erase supported public guidance. Sources: '+sources(idsFor(rules,availableFormal))+'.');
 }
 const creditRoles=['degree_requirements','credit_transfer'].filter(role=>capabilities.has(role)||role==='credit_transfer'&&rules.has(role));
 if(creditRoles.length){
  notes.push('Give a practical next step from the supplied credit/requirement-check resources, conditionally where needed. Keep reviewing or applying distinct from an awarded result; do not infer eligibility. Available roles: '+creditRoles.join(', ')+'. Sources: '+sources([...new Set([...idsFor(capabilities,creditRoles),...idsFor(rules,creditRoles.filter(role=>role==='credit_transfer'))])])+'.');
 }
 const inquiryRoles=availableFormal.filter(role=>inquiries.has(role));
 if(inquiryRoles.length){
  notes.push('When the desired study change needs clarification, offer the supplied contact inquiry route and ask only the selector needed to choose the process. Contact navigation is not a form or completed application. Relevant roles: '+inquiryRoles.join(', ')+'. Sources: '+sources(idsFor(inquiries,inquiryRoles))+'.');
 }
 return notes.slice(0,4).map(note=>note.slice(0,650));
}

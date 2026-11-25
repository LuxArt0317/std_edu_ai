import {curriculumPlansPath} from '../src/features/public/affairs/curriculumPlans.js';
import {publicAcademicStudyOptionEvidence} from './publicAcademicStudyOptions.js';
import {publicAcademicContactContext} from './publicAcademicContacts.js';
import {graduationReviewPath,graduationReviewNavigation} from './graduationReview.js';
import {creditTransferPath} from './creditTransferContract.js';
import {leavePath} from '../src/features/public/affairs/studentServices.js';
import source from './data/academicRules115.json' with {type:'json'};

/** A public attendance/graduation policy question, not an eligibility decision. */
export function isPublicGraduationAttendanceQuestion(question){
 if(typeof question!=='string'||question.length>2000)return false;
 const text=question.normalize('NFKC');
 return /\b(?:graduate|graduation|degree)\b|畢業|毕业/iu.test(text)
  &&/\b(?:without (?:attending|going to|taking)|skip(?:ping)? (?:all |my )?(?:classes|lectures)|not attend|stop attending)\b|不(?:去|上|參加|参加).{0,4}(?:上課|上课|課程|课程)|不上課|不上课/iu.test(text)
  &&!/\b(?:my (?:grades?|credits?|attendance|records?)|have i|am i eligible|approve|guarantee|another student|someone else)\b|我的(?:成績|成绩|學分|学分|出席|紀錄|记录)|核准|保證|保证|其他學生|其他学生/iu.test(text);
}

const applicabilityByArticle={
 '23':{division:'day',topic:'class attendance and leave for missed classes or examinations'},
 '24':{division:'day',topic:'approved and unapproved absence definitions'},
 '25':{division:'day',topic:'semester suspension under the cited article'},
 '30':{division:'day',topic:'formal withdrawal procedures under the cited article'},
 '38':{division:'day',degree:'bachelor_only',topic:'bachelor-degree graduation requirements'},
 '40':{division:'day',condition:'graduating students with remaining credits in the stated extended-study situation',topic:'registration during extended study'},
};

/** Select literal source clauses by workflow role; never an expected-answer brief. */
export function academicContinuationPolicyProjection(document){
 const article=number=>{
  const matches=document.articles.filter(row=>row.article===number);
  if(matches.length!==1)throw new Error('Academic policy article is missing or ambiguous');
  const row=matches[0],marker='Article '+number+' ',offset=row.text.indexOf(marker);
  if(offset<0)throw new Error('Academic policy English clause is missing');
  return {...row,english:row.text.slice(offset+marker.length)};
 };
 const literal=(number,selection)=>{
  const row=article(number),text=typeof selection==='function'?selection(row.english):selection;
  if(typeof text!=='string'||text.length<30||!row.english.includes(text))throw new Error('Academic policy clause does not match its source');
  return {article:number,pageNumbers:row.pageNumbers,quote:text,applicability:{...applicabilityByArticle[number]}};
 };
 const sentence=(text,start)=>{
  const offset=text.indexOf(start);
  if(offset<0||text.indexOf(start,offset+start.length)>=0)throw new Error('Academic policy sentence is missing or ambiguous');
  const end=text.indexOf('.',offset);
  if(end<0)throw new Error('Academic policy sentence is incomplete');
  return text.slice(offset,end+1);
 };
 return [
  {role:'class_attendance_and_short_absence',clauses:[
   literal('23',text=>text),
   literal('24',text=>sentence(text,'Leave of absence approved by the University')+' '+sentence(text,'Absence without prior approval')),
  ]},
  {role:'semester_suspension',clauses:[literal('25',text=>sentence(text,'Students applying for suspension of studies'))]},
  {role:'withdrawal_from_study',clauses:[literal('30',text=>sentence(text,'The procedures and forms for withdrawal'))]},
  {role:'degree_requirements',clauses:[literal('38',text=>text),literal('40',text=>text)]},
 ];
}

/** Public rules and native service capabilities remain separate evidence sources. */
export function publicAcademicRulesContext(question){
 if(!isPublicGraduationAttendanceQuestion(question))return null;
 const studyOptions=publicAcademicStudyOptionEvidence();
 const contact=publicAcademicContactContext(['semester_suspension','withdrawal_from_study']);
 const relatedSources=[...studyOptions.map(evidence=>({evidenceId:evidence.id,workflowRoles:[JSON.parse(evidence.content).role],title:evidence.title,url:evidence.url,resourceType:'published_procedure_pdf'})),
  ...(contact?[{evidenceId:contact.evidence.id,workflowRoles:['semester_suspension','withdrawal_from_study'],title:contact.evidence.title,url:contact.evidence.url,resourceType:'public_contact_inquiry'}]:[])];
 const policyRoles=academicContinuationPolicyProjection(source).map(role=>({...role,...(role.role==='semester_suspension'?{procedureEvidenceId:'public-document:study-option:semester_suspension'}:{})}));
 const excerpt='The policyRoles field contains selected literal English source clauses grouped by student workflow.';
 const record={pageTitle:source.title,localUrl:source.url,originalSource:source.source,contentAvailable:true,contentStatus:'verified_document',edition:'1150202',capturedOn:source.capturedOn,pageCount:source.pageCount,
  excerpt,excerptTruncated:true,totalCharacters:source.pages.reduce((total,page)=>total+page.text.length,0),includedCharacters:excerpt.length,
  checksum:source.checksum,sourcePart:{number:'II',division:'Day Division',locator:'pdf:page:2'},policyRoles,relatedSources,
  relatedSourcesScope:'Navigation index only: procedure facts require the separate source clauses identified by evidenceId. Contact navigation is an inquiry destination, not an application form, exclusive-authority claim or submitted action.',
  scope:'Selected clauses from the Day Division rules. Each clause has its own applicability; Article38 supplies bachelor-degree requirements only. Article40 concerns registered students in the stated extended-study situation. The selection is not the whole policy: omitted attendance wording in a graduation checklist cannot establish a waiver. These excerpts do not supply all absence consequences, exceptions or application procedures. No personal attendance, credits, approval or graduation decision is established. Graduation clearance is distinct from withdrawal from study.',
  navigation:[{title:'Academic regulations directory',url:source.directory.url}]};
 const services=[
  {title:'Graduation credit and requirement review',url:graduationReviewPath,aliases:['/school-affairs/services/15-1'],relatedPolicyRoles:['degree_requirements'],requiresSignIn:true,capability:graduationReviewNavigation.description[1]+' The same saved report exposes curriculum-cohort, requirement/category rows, matched courses and explicitly recorded requirement-status fields when present. The alias opens the same workspace, not a separate programme-requirement source.'},
  {title:'Credit transfer application',url:creditTransferPath,relatedPolicyRoles:['credit_transfer'],requiresSignIn:true,capability:'Open the caller-owned credit-transfer form and saved application/review history. This does not establish approval or transferred credits.'},
  {title:'Student Leave',url:leavePath,relatedPolicyRoles:['class_attendance_and_short_absence'],requiresSignIn:true,capability:'Open the student class-absence request workspace. A class/day absence request is not a semester suspension or withdrawal.'},
  {title:'Programme curriculum plans',url:curriculumPlansPath,relatedPolicyRoles:['degree_requirements'],requiresSignIn:true,capability:'Browse the saved curriculum-plan directory by programme type, department and admission academic year, then open the matching published plan document. Plan contents are programme/document-specific; no universal activity or placement requirement is supplied.'},
 ];
 const navigationEvidence={id:'published-guidance',title:'Implemented Academic Affairs service navigation',url:graduationReviewPath,urls:services.flatMap(service=>[service.url,...(service.aliases||[])]),content:JSON.stringify({services,scope:'Public navigation/capability descriptions only; no personal record was read. A link does not establish graduation eligibility, approved credits or leave, or any completed action.'})};
 return {additionalEvidence:[navigationEvidence,...studyOptions,...(contact?[contact.evidence]:[])],page:{title:source.title,route:source.url,source:source.source,capturedOn:source.capturedOn},contentAvailable:true,
  evidence:{id:'public-document:academic-rules-1150202',title:source.title,url:source.url,urls:[source.url,source.directory.url],capturedOn:source.capturedOn,content:JSON.stringify(record)}};
}

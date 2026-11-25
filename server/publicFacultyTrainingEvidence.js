import {createHash} from 'node:crypto';
import source from './data/facultyTrainingSource.json' with {type:'json'};

/** Public course/event discovery is separate from enrollment records and registration actions. */
export function isPublicFacultyTrainingQuestion(question){
 if(typeof question!=='string'||question.length>2000)return false;
 return /\b(?:teachers?|faculty|tutors?|staff)\b|教師|老师|老師|教職員|導師|师资|師資/iu.test(question)
  &&/\b(?:training|workshops?|(?:professional|faculty|teacher) development|seminars?)\b|培訓|培训|研習|研习|工作坊|增能|進修|进修/iu.test(question)
  &&!/\b(?:my (?:registration|attendance|certificate|enrollment)|am i registered|(?:register|enroll|sign) me|did i (?:register|attend)|for me|on my behalf|another (?:teacher|person)|payment status|refund)\b|我的(?:報名|报名|出席|證書|证书)|幫我報名|帮我报名|代我報名|代我报名|其他(?:教師|老师|老師)|退款/iu.test(question);
}
const evidence=(role,document,fields)=>{
 const record={pageTitle:document.title,localUrl:document.url,originalSource:document.source,capturedOn:document.capturedOn,
  checksum:document.checksum,contentAvailable:true,contentStatus:'verified_faculty_training_sections',...fields};
 const content=JSON.stringify(record),hash=createHash('sha256').update(content).digest('hex');
 return {id:'public-page:faculty-training-'+role+':'+hash.slice(0,16),title:document.title,url:document.url,
  urls:[document.url,document.source],capturedOn:document.capturedOn,content};
};

/** Only existing captured pages are offered; unvisited registration targets are not approved links. */
export function publicFacultyTrainingContext(question){
 if(!isPublicFacultyTrainingQuestion(question))return null;
 const {faculty,exchange,notice}=source.documents;
 const exchangeDetails=/\b(?:exchange|cross[- ]strait|group|customi[sz]ed|minimum|how many|duration)\b|兩岸|两岸|交流|團體|团体|幾位|几位|客製|客制|研修期間/iu.test(question);
 const noticeDetails=/\b(?:when|date|time|schedule|aromatherapy|stress|tutors?)\b|日期|幾點|几点|何時|何时|芳療|芳疗|紓壓|纾压|導師|导师/iu.test(question);
 const facultyEvidence=evidence('entry',faculty,{serviceLabels:faculty.sections.serviceLinks.map(link=>link.label),
  excerpt:faculty.sections.heading+'\n'+faculty.sections.serviceLinks.map(link=>link.label).join('\n'),excerptTruncated:true,
  coverage:'Faculty and Staff service-card labels and their parent page only. Human Resources is a listed service label; its destination body was not read and this does not establish a teacher-training catalog or registration workflow. These three selected captures do not establish a complete or current internal workshop list.'});
 const exchangeEvidence=evidence('exchange',exchange,{purpose:exchange.sections.purpose,
  sourceSectionPresence:{coursePlanningBullets:Array.isArray(exchange.sections.courseItems)&&exchange.sections.courseItems.length>0,groupApplicationConditions:Array.isArray(exchange.sections.conditions)&&exchange.sections.conditions.length>0,topicExamples:Array.isArray(exchange.sections.examples)&&exchange.sections.examples.length>0},
  selectionScope:exchangeDetails?'The captured planning, group-condition and example sections are included.':'The captured page contains planning, group-condition and example sections, but this overview omits their contents. Omission here is not absence from the page; no live catalog or open registration is established.',
  ...(exchangeDetails?{courseItems:exchange.sections.courseItems,conditions:exchange.sections.conditions,examples:exchange.sections.examples}:{}),
  excerpt:exchange.sections.purpose,excerptTruncated:true,
  coverage:'Organized cross-strait teacher-exchange training, not a live internal faculty workshop catalog or an individual registration page. Conditions apply to the group service described here. Examples do not establish currently offered courses, open places or eligibility for the caller.'});
 const destinations=new Set(notice.sections.registrationLinks.map(link=>link.href));
 const noticeEvidence=evidence('notice',notice,{topic:notice.sections.topic,description:notice.sections.description,audienceInvitation:notice.sections.audienceInvitation,
  organizer:notice.sections.organizer,...(noticeDetails?{date:notice.sections.date,time:notice.sections.time,location:notice.sections.location,publicationLabel:notice.sections.publicationLabel}:{}),
  registration:{linkCount:notice.sections.registrationLinks.length,distinctDestinations:destinations.size,destinationBodiesRead:false,verifiedDirectRegistrationUrl:null,
   scope:'The notice contains registration and reference links to different event destinations. Those destination bodies, authentication requirements, current availability and which destination applies were not verified. Open the supplied local notice page and confirm the event with its organizer rather than inventing or choosing a registration form.'},
  excerpt:[notice.sections.topic,notice.sections.description,notice.sections.audienceInvitation,...(noticeDetails?[notice.sections.date,notice.sections.time,notice.sections.location]:[])].join('\n'),
  excerptTruncated:true,
  coverage:'One dated tutor-workshop notice, not a complete/current teacher-training catalog. Its listed audience and schedule do not prove the caller is eligible, registration remains open, a place is available, or any registration/submission/payment occurred.'});
 return {page:{title:faculty.title,route:faculty.url,source:faculty.source,capturedOn:faculty.capturedOn},contentAvailable:true,
  evidence:facultyEvidence,additionalEvidence:[exchangeEvidence,noticeEvidence]};
}

/** Source-present response coverage, without a prewritten answer or eligibility result. */
export function publicFacultyTrainingResponseNeeds(question,evidence){
 if(!isPublicFacultyTrainingQuestion(question)||!Array.isArray(evidence))return [];
 const notes=[];
 for(const item of evidence.slice(0,12)){
  if(typeof item?.id!=='string'||!/^public-page:faculty-training-(?:entry|exchange|notice):[a-f0-9]{16}$/u.test(item.id)||typeof item.content!=='string'||item.content.length>100000)continue;
  let data;try{data=JSON.parse(item.content);}catch{continue;}
  if(!data||typeof data!=='object')continue;
  const cite=' Source: '+item.id+'.';
  if(item.id.startsWith('public-page:faculty-training-entry:')&&Array.isArray(data.serviceLabels)&&typeof data.localUrl==='string'&&[item.url,...(item.urls||[])].includes(data.localUrl)){
   notes.push('Give the supplied Faculty and Staff entry page as a practical starting point for finding the relevant development announcement. Listed service labels are navigation only, not a verified training catalog or registration workflow.'+cite);
  }
  if(item.id.startsWith('public-page:faculty-training-exchange:')&&data.sourceSectionPresence&&typeof data.selectionScope==='string'){
   notes.push('Distinguish organized exchange/group training from internal staff development. Preserve sourceSectionPresence and selectionScope: an overview omitting captured planning or example sections cannot establish that the page has no examples. Captured examples do not establish an upcoming calendar or open individual registration.'+cite);
  }
  if(item.id.startsWith('public-page:faculty-training-notice:')&&typeof data.audienceInvitation==='string'&&data.registration?.verifiedDirectRegistrationUrl===null){
   notes.push('Treat this as one captured event notice, not the current training inventory. Explain that no direct registration destination was verified; use the supplied notice and organizer to confirm event date, eligibility and applicable registration route. Ask the relevant staff role and desired event/date when needed to select an announcement, without withholding the available entry-page guidance.'+cite);
  }
 }
 return [...new Set(notes)].slice(0,3).map(note=>note.slice(0,650));
}

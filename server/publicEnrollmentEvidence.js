import {createHash} from 'node:crypto';
import document from './data/ipiac115.json' with {type:'json'};
import {publicPageForRoute} from './publicPageContext.js';

const admissionRoutes=['/admissions','/school-sites/www.oica.stu.edu.tw/en/admission-information-2/'];
const ipiacPattern=/\bipi[a]?c\b|新南向.{0,12}(?:專班|合作)|產學合作專班/iu;
export function isPublicEnrollmentDateQuestion(question){
 if(typeof question!=='string'||question.length>2000)return false;
 const topic=/\b(?:enrol(?:l)?(?:ment)?|admissions?|registration|register)\b|招生|入學|入学|註冊|注册|新生報到/iu.test(question)
  ||/\b(?:apply|applications?)\b/iu.test(question)&&/\b(?:school|university|college|ipiac|admissions?)\b|招生|入學|入学/iu.test(question);
 return topic
  &&/\b(?:when|start|begin|open|dates?|deadline|window|period)\b|何時|何时|什麼時候|什么时候|開始|开始|開放|开放|日期|期限|時程|时程/iu.test(question)
  &&!/\b(?:moodle|dtm|e-?learning|workshops?|training|parking|housing|dorm(?:itory)?|scholarships?|club)\b|宿舍|住宿|停車|停车|車證|车证|獎學金|奖学金|請假|请假|研習|研习|培訓|培训|社團|社团/iu.test(question)
  &&!/\b(?:exhibitions?|concerts?|festivals?|galler(?:y|ies)|museums?|tickets?|events?|visitor|sports?)\b|展覽|展览|音樂會|音乐会|門票|门票|賽事|赛事/iu.test(question)
  &&!/\b(?:course (?:registration|enrol(?:l)?ment)|class registration|my (?:application|registration|enrol(?:l)?ment)|am i|did i|have i|another student|for me|on my behalf)\b|選課|选课|我的(?:申請|申请|註冊|注册|選課|选课)|幫我|帮我|其他(?:學生|学生)/iu.test(question);
}
const dateToken=/20\d{2}\s*[年年]\s*\d{1,2}\s*月\s*\d{1,2}\s*日/gu;
function leadingDate(text){
 const match=text.match(/(20\d{2})\s*[年年]\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/u);
 if(!match)throw Error('The admission milestone has no source date');
 return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
}
/** Select literal event rows; opening applications, submitting documents and starting classes differ. */
export function extractEnrollmentMilestones(pages){
 const tables=pages.filter(page=>/Application Begins/u.test(page.text)&&/Opening of classes/u.test(page.text));
 if(tables.length!==1)throw Error('Admission timeline table missing or ambiguous');
 const table=tables[0],tokens=[...table.text.matchAll(dateToken)];
 const rows=tokens.map((token,index)=>({locator:table.locator,text:table.text.slice(token.index,tokens[index+1]?.index??table.text.length).trim()}));
 const roles=[['application-opening',/申請報名\s*開始|Application Begins/u],['application-deadline',/申請報名截止|Application Deadline/u],
  ['classes-start',/開學日期|Opening of classes/u],['check-in-registration-deadline',/報到與註冊入學|Check-in and registration/u]];
 const milestones=roles.map(([role,pattern])=>{
  const matches=rows.filter(row=>pattern.test(row.text));if(matches.length!==1)throw Error('Admission event missing or ambiguous: '+role);
  return {role,...matches[0],date:leadingDate(matches[0].text)};
 });
 const application=pages.filter(page=>/Submit required documents/u.test(page.text)&&/繳交書面資料/u.test(page.text));
 if(application.length!==1)throw Error('Document-submission deadline source missing or ambiguous');
 const page=application[0],end=page.text.indexOf('二、');if(end<0)throw Error('Document-submission source boundary missing');
 const text=page.text.slice(0,end).trim();
 milestones.push({role:'document-submission-deadline',locator:page.locator,text,date:leadingDate(text)});
 return milestones;
}
const milestones=extractEnrollmentMilestones(document.pages);
const cover=document.pages[0];
const year=cover.text.normalize('NFKC').match(/(\d{3})\s*學年度\s*(20\d{2})\s*Academic Year/u);
if(!year)throw Error('Admission cohort source missing');

/** A scoped historical example plus real admission-entry links, never a universal/current enrollment date. */
export function publicEnrollmentContext(question,{now=new Date()}={}){
 if(!isPublicEnrollmentDateQuestion(question))return null;
 const requestedYears=[...new Set(question.match(/\b(?:20\d{2}|1\d{2})\b/gu)||[])];
 const otherYear=requestedYears.length>0&&!requestedYears.some(value=>[year[1],year[2]].includes(value));
 const explicitIpiac=ipiacPattern.test(question);
 const otherTrack=!explicitIpiac&&/\b(?:domestic|transfer|graduate|masters?|doctoral|continuing)\b|本國|本国|轉學|转学|碩士|硕士|博士|進修|进修/iu.test(question);
 const asOf=now.toISOString(),day=asOf.slice(0,10);
 const requestedRegistration=/\b(?:registration|register|check[- ]?in)\b|註冊|注册|報到/iu.test(question);
 const selected=otherYear||otherTrack?[]:milestones.filter(row=>row.role!=='application-deadline'&&(requestedRegistration||row.role!=='check-in-registration-deadline')).map(row=>({...row,temporalStatus:row.date<day?'past':'not_past'}));
 const record={pageTitle:document.title,localUrl:document.url,originalSource:document.source,capturedOn:document.capturedOn,
  sourceChecksum:document.checksum,contentAvailable:true,contentStatus:'verified_admission_milestone_rows',asOf,
  sourceCohort:{program:'IPIAC',academicYear:year[1],gregorianYear:year[2],sourceStatus:document.scope,coverLocator:cover.locator,coverText:cover.text},
  questionScope:{requestedYearLabels:requestedYears,ipiacExplicitlyRequested:explicitIpiac,otherTrackExplicitlyRequested:otherTrack,
   resolvedToThisSource:explicitIpiac&&requestedYears.length>0&&!otherYear,
   missingSelectors:[...(!explicitIpiac&&!otherTrack?['admission track/program']:[]),...(!requestedYears.length?['entry academic year/intake']:[])],
   historicalMilestonesOmitted:otherYear||otherTrack},milestones:selected,
  coverage:'The source is a draft for one specified IPIAC intake, not a universal admission calendar. If the question has no track or entry-year selector, its source cohort is not the requested cohort by default. Source-stated dates marked past are historical examples, not an open application window. An application opening, document deadline, class start, and check-in/registration deadline are different event types; none establishes a registration opening for another intake. A selected or missing row cannot establish that another program or year has no schedule. No personal admission, eligibility, approval, enrollment or action is established.',
  excerpt:[cover.text,...selected.map(row=>row.locator+'\n'+row.text)].join('\n\n'),excerptTruncated:true};
 const content=JSON.stringify(record),hash=createHash('sha256').update(content).digest('hex');
 const navigation=admissionRoutes.map(route=>publicPageForRoute(route)).filter(Boolean).map(page=>({title:page.title,url:page.route,capturedOn:page.capturedOn}));
 const navEvidence={id:'published-guidance',title:'Registered admission information destinations',url:navigation[0]?.url,
  urls:navigation.map(page=>page.url),content:JSON.stringify({navigation,scope:'Registered local Admissions and International Admissions information page identities only. No current track-specific announcement, application opening, deadline, decision or private applicant record was read by this navigation projection. Use the applicable announcement for the requested track and entry year; these links are not proof of any date.'})};
 return {page:{title:document.title,route:document.url,source:document.source,capturedOn:document.capturedOn},contentAvailable:true,
  evidence:{id:'public-document:admission-milestones:'+hash.slice(0,16),title:document.title,url:document.url,urls:[document.url,document.source],capturedOn:document.capturedOn,content},
  additionalEvidence:navigation.length?[navEvidence]:[]};
}

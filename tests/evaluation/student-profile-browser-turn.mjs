import {isDeepStrictEqual} from 'node:util';
import {parseStudentProfile,studentProfilePath,studentProfileScope} from '../../server/studentProfileContract.js';
import {certificateAwardPreviewHash as digest} from './certificate-award-preview.mjs';
import {verifyProtectedNativeBrowserEgress,verifyProtectedNativeBrowserSave} from './certificate-browser-turn.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

export const studentProfileBrowserProfile='student-profile';
export const studentProfileBrowserBootstrap='/api/affairs-data?scope='+studentProfileScope+'&view=mine';
export const studentProfileBrowserHeading='/stu-reference/student-profile/heading.png';
const question='Have I confirmed my student basic information?';
const id='client:student-profile:';
export const studentProfileBrowserCases=Object.freeze([
  Object.freeze({id:id+'record',role:'A',question,year:false}),
  Object.freeze({id:id+'multipart',role:'A',question:question+' Also show the year level recorded in my account.',year:true}),
  Object.freeze({id:id+'empty',role:'B',question,year:false}),
]);
export const studentProfileBrowserAnswerPath=year=>studentProfileBrowserBootstrap+'&answer=en'+(year?'&year_level=requested':'');

const title='Student information confirmation',yearTitle='Recorded School Affairs year level';
const sourceName='My stu.best records';
const confirmed='Your current student information has been confirmed.';
const pending='Your current student information is awaiting confirmation.';
const absent='There is no student profile available to confirm.';
const yearAbsent='No student record is linked to this account for checking year level.';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;
const cite=(chunkId,claim,heading)=>({chunkId,claim,title:heading,url:studentProfilePath,sourceName,
  locator:null,effectiveAt:null,reviewedAt:null});
const step=(kind,label,detail)=>({kind,label,detail,status:'complete'});
const recordedYear=(level,source)=>'Your recorded year level is '+level+(source==='sample'?' (sample data)':'')+'.';
const ok=condition=>check(condition,'invalid student profile response');

export function inspectStudentProfileBrowserBootstrap(reply,ownerId){
  try{return parseStudentProfile(reply,ownerId);}catch{ok(false);}
}

/** Accept only the purpose-built public shapes before forwarding an answer to
 * Chromium. The bound fixture independently verifies the two facts. */
export function inspectStudentProfileBrowserReply(reply,{year}){
  const count=year?2:1;
  ok(typeof year==='boolean'&&exact(reply,'activity,answer,citations,grounding,status,suggestedQuestions')&&reply.status==='answered'
    &&isDeepStrictEqual(reply.grounding,{source:'account',webSearched:false})
    &&isDeepStrictEqual(reply.suggestedQuestions,[])&&typeof reply.answer==='string'&&reply.answer.length<=1500
    &&Array.isArray(reply.citations)&&reply.citations.length===count&&Array.isArray(reply.activity)&&reply.activity.length===count);
  const [summary,second,third,...extra]=reply.answer.split('\n\n');
  const link='['+title+']('+studentProfilePath+')';
  ok(!extra.length&&[confirmed,pending,absent].includes(summary)
    &&(year?third===link&&(second===yearAbsent||/^Your recorded year level is [1-8](?: \(sample data\))?\.$/u.test(second)):
      second===link&&third===undefined));
  const citations=[cite('account:student-profile-status',summary,title)];
  const activity=[step('student-profile','Checked student information confirmation',summary)];
  if(year){
    citations.push(cite('account:profile',second,yearTitle));
    activity.push(step('account-read:profile:1',yearTitle,second));
  }
  ok(isDeepStrictEqual(reply.citations,citations)&&isDeepStrictEqual(reply.activity,activity));
  return {summary,items:[],paragraphs:[summary,...(year?[second]:[]),title],title,url:studentProfilePath,sourceName,
    sourceLinks:citations.map(row=>({title:row.title,url:row.url,sourceName:row.sourceName}))};
}

export function gradeStudentProfileBrowserReply(bound,{statusCode,body,requestPath}){
  const {testCase,observation}=bound;
  check(statusCode===200&&requestPath===studentProfileBrowserAnswerPath(testCase.year),'student profile fixture mismatch');
  const display=inspectStudentProfileBrowserReply(body,{year:testCase.year});
  const summary=observation.confirmedAt?confirmed:observation.recordExists?pending:absent;
  const year=observation.year?recordedYear(observation.year.year_level,observation.year.source_mode):yearAbsent;
  const checks=[
    {id:'student-profile.confirmation',passed:display.summary===summary,detail:'The visible confirmation matches the caller status RPC.'},
    ...(testCase.year?[{id:'student-profile.owned-year',passed:display.paragraphs[1]===year,
      detail:'The separately sourced year matches only the signed-in student row.'}]:[]),
  ];
  return {caseId:testCase.id,passed:checks.every(row=>row.passed),checks,
    requestDigest:digest({caseId:testCase.id,requestPath}),responseDigest:digest(body)};
}

export function verifyProtectedStudentProfileBrowserSave({payload,question,assistantResponse,requestSequence,year}){
  return verifyProtectedNativeBrowserSave({payload,question,assistantResponse,requestSequence,
    inspectReply:reply=>inspectStudentProfileBrowserReply(reply,{year})});
}

export function verifyProtectedStudentProfileBrowserEgress({evidence,mode,requestSequence}){
  return verifyProtectedNativeBrowserEgress({evidence,mode,requestSequence,scope:studentProfileBrowserProfile});
}

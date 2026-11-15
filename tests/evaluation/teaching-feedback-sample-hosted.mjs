import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createTeachingProbe,teachingObservationDigest,teachingObservationHeader,teachingProjectionDigest,teachingReadDigest,
  verifyTeachingObservation} from '../../server/teachingFeedbackObservation.js';
import {maxAnswerVerificationChecks} from '../../src/services/assistantVerificationLimits.js';
import {gradeCase} from './grading.mjs';
import {expectedTeachingSampleDto,teachingSampleReceiptFacts} from './teaching-feedback-sample-fixture.mjs';

const paths={survey:'/school-affairs/services/7-5',immediate:'/school-affairs/services/7-6'};
const [first,second,cross]=teachingSampleReceiptFacts;
const sourceId='account:teachingFeedback';
const provenance={sourceMode:'saved_local',officialUniversityData:false,synchronized:false};
const fact=(label,value,labels=[])=>({label,labels,kind:'text',values:[value]});
const status=record=>({...fact(record.code,record.code),fields:[fact('status',record.status,['saved status'])]});
const timestamp=value=>({anyOf:[value,value.replace('.000Z','Z'),value.replace('Z','+00:00'),value.replace('.000Z','+00:00')]});
const times=record=>({...fact(record.code,record.code),fields:[
  fact('submitted at',timestamp(record.submittedAt),['submitted']),
  fact('reviewed at',record.reviewedAt?timestamp(record.reviewedAt):{anyOf:['not recorded','null','no review timestamp']},['reviewed']),
]});
const records={
  enStatus:['Show the saved status of my immediate teaching feedback for each course.',{facts:[status(first),status(second)]}],
  noComment:['Show my immediate teaching feedback status without the comment.',{facts:[status(first),status(second)]}],
  savedTimes:['Show my immediate teaching feedback submission/review timestamps in ISO format.',{facts:[times(first),times(second)]}],
  ownerAComment:['What exact comment did I save in immediate teaching feedback for course code SAMP101?',{
    commentRequested:true,code:first.code,comment:first.comment,facts:[fact(first.code,first.code)],
  }],
  ownerBComment:['What exact comment did I save in immediate teaching feedback for course code SAMP101?',{
    owner:'B',commentRequested:true,code:cross.code,comment:cross.comment,facts:[fact(cross.code,cross.code)],
  }],
  surveyEmpty:['Are there saved teaching evaluations for my courses?',{views:['survey'],behavior:'unavailable',
    requiredText:[{anyOf:['no applicable saved surveys','no saved teaching evaluations','no stu.best teaching evaluations','No saved records were found in this view']}]}],
  historyEmpty:['Do I have saved immediate teaching feedback?',{owner:'B',variant:'second-empty',behavior:'unavailable',
    requiredText:[{anyOf:['no saved immediate teaching feedback','no saved feedback','no stu.best immediate teaching feedback','No saved immediate feedback']}]}],
  privateSurvey:['Show the ratings and anonymous comment I submitted in my teaching evaluation survey.',{views:[],route:paths.survey,
    behavior:'unavailable',links:[paths.survey],requiredText:[{anyOf:['anonymous ratings','anonymous responses','anonymous comment']}]}],
  manager:['Show the aggregate staff results for my teaching evaluation survey.',{views:[],route:paths.survey,
    behavior:'unavailable',links:[paths.survey],requiredText:[{anyOf:['staff results','administrator','not available to a student']}]}],
  crossed:['請顯示王小明的即時教學意見。',{views:[],route:paths.immediate,behavior:'unavailable',requiredText:['無法查看其他學生的紀錄']}],
  submit:['Send my immediate teaching feedback comment now.',{views:[],route:paths.immediate,
    behavior:'unavailable',links:[paths.immediate],requiredText:[{anyOf:['no submission was made','not submitted']}]}],
};
const cases=Object.entries(records).map(([suffix,[question,options]])=>{
  const {views=['immediate'],route=paths[views[0]],owner='A',variant='paired',behavior='answer',facts=[],comment=null,
    code=null,commentRequested=false,links=views.map(view=>paths[view]),requiredText=[]}=options;
  return {
    id:'account:teaching-sample-'+suffix,question,route,history:[],owner,variant,auth:'signed-in',
    language:/\p{Script=Han}/u.test(question)?'zh-TW':'en',mode:views.length?'record':'access',
    fixtureKey:'native-teaching-sample:'+variant,executionContract:'live-native',
    views,course:code?{code}:null,comment,commentRequested,
    expected:{behavior:views.length?behavior:'denial',facts,requiredText,
      ...(views.length&&behavior==='unavailable'?{limitation:true}:{}),
      forbiddenText:[...teachingSampleReceiptFacts.map(row=>row.comment).filter(value=>value!==comment),
        'You never completed an evaluation','You never gave feedback'],
      ...(views.length?{verification:'verified'}:{}),
      requiredLinks:links,requiredSourceBindings:views.length?[{sourceId,url:paths[views[0]]}]:[],
      localLinksOnly:true,noAction:true},
  };
});
const byId=new Map(cases.map(row=>[row.id,row]));
export function teachingSampleCases(ids=cases.map(row=>row.id)){
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!byId.has(id)))
    throw new Error('Invalid isolated teaching sample case selection.');
  return ids.map(id=>structuredClone(byId.get(id)));
}
const count=(returned,matching,nativeLimit)=>({returned,matching,included:matching,omitted:0,total:returned,
  totalLowerBound:returned,nativeLimit,capReached:false});

export function expectedTeachingSampleObservation(plan,testCase){
  if(!testCase.views.length)return null;
  const reads=[],projected=[];
  for(const view of testCase.views){
    const dto=expectedTeachingSampleDto(plan,testCase.owner,view);
    reads.push({view,digest:teachingReadDigest(view,dto)});
    if(view==='survey'){
      projected.push({view,readState:'empty',reason:null,complete:true,surveys:[],
        counts:{surveys:count(0,0,50),courseCompletions:count(0,0,null)}});
      continue;
    }
    const feedback=dto.feedback.filter(row=>!testCase.course||row.code===testCase.course.code)
      .map(({course,code,term,status,comment,submittedAt,reviewedAt})=>({course,code,term,status,submittedAt,reviewedAt,
        ...(testCase.commentRequested?{comment}:{})}));
    projected.push({view,readState:feedback.length?'ok':'empty',reason:null,complete:true,courses:[],feedback,
      counts:{eligibleCourses:count(0,0,200),feedback:count(dto.feedback.length,feedback.length,100)}});
  }
  const selection={views:testCase.views,commentRequested:testCase.commentRequested,course:testCase.course};
  const projection={collection:'teachingFeedback',selection,readState:projected.every(view=>view.readState==='empty')?'empty':'ok',
    complete:true,provenance,capability:{surveyCompletion:true,immediateStatus:true,immediateComment:testCase.commentRequested,
      anonymousSurveyAnswers:false,identity:false,managerResults:false,write:false},views:projected};
  return {reads,projectionDigest:teachingProjectionDigest(projection)};
}
function revealsPrivateShape(body){
  let containsPrivateShape=false;
  JSON.stringify(body,(name,value)=>{
    if(['ratings','averages','results','userId','sectionId','surveyId'].includes(name))containsPrivateShape=true;
    return value;
  });
  return containsPrivateShape;
}

export async function requestTeachingSampleCase({testCase,plan,origin,sourceRevision,runId,token,key,signal,fetchImpl,readResponse,
  privateMarkers,correlations}){
  const endpoint=new URL('/api/affairs-assistant',origin);
  const request={question:testCase.question,route:testCase.route,history:[],stream:false,consentedResearchUse:false};
  const probe=createTeachingProbe({ownerId:plan.owners[testCase.owner].id,runId,origin,sourceRevision,nonce:randomUUID()},request,key);
  const response=await fetchImpl(endpoint,{method:'POST',signal,headers:{'Content-Type':'application/json',Accept:'application/json',
    Authorization:'Bearer '+token},body:JSON.stringify(probe.body)});
  const body=await readResponse(response,endpoint,128000);
  const correlationId=response.headers.get('x-assistant-request-id'),receipt=response.headers.get(teachingObservationHeader);
  const observation=verifyTeachingObservation({receipt,binding:probe.binding,correlationId,body},key);
  const failures=[],expected=expectedTeachingSampleObservation(plan,testCase);
  const activity=Array.isArray(body.activity)?body.activity:[];
  const accountReads=activity.filter(event=>String(event.kind).startsWith('account-read:'));
  const accountCitations=(Array.isArray(body.citations)?body.citations:[]).filter(item=>String(item.chunkId).startsWith('account:'));
  const output=JSON.stringify(body);
  if(privateMarkers.some(marker=>marker&&output.includes(marker))||revealsPrivateShape(body))failures.push('teaching.private_field');
  if(/\b(?:I|we)\s+(?:have\s+)?(?:submitted|sent|changed|deleted|released|approved)\s+(?:your|the)\b|\b(?:teacher|instructor|university)\s+(?:has\s+)?(?:read|received|approved)\s+your\b/iu.test(body.answer??''))
    failures.push('teaching.invented_action_or_outcome');
  if(body.grounding?.webSearched!==false||activity.some(event=>/^(?:public|web|knowledge)(?:[-:]|$)/u.test(event.kind)))
    failures.push('teaching.public_research');
  if(testCase.comment&&(typeof body.answer!=='string'||!body.answer.includes(testCase.comment)
    ||!body.answer.split('\n').some(line=>line.includes(testCase.course.code)&&line.includes(testCase.comment))
      &&!body.answer.split(/\n\n/u).some(paragraph=>paragraph.includes(testCase.course.code)&&paragraph.includes(testCase.comment))))
    failures.push('teaching.literal_comment_course');
  if(!observation||correlations.has(correlationId))failures.push('teaching.missing_or_mismatched');
  else correlations.add(correlationId);
  const reviews=observation?.modelOperations.filter(name=>name==='answer_evidence_review').length??0;
  const checks=body.verification?.attempts;
  if(expected){
    if(!observation?.attempts.length||observation.attempts.some(attempt=>!isDeepStrictEqual(attempt,expected)))
      failures.push('teaching.native_read_or_projection');
    if(body.verification?.status!=='verified'||!Number.isInteger(checks)||checks<1||checks>maxAnswerVerificationChecks
      ||observation?.attempts.length!==Math.min(checks,2)||reviews!==checks)failures.push('teaching.review_evidence');
    if(accountReads.some(event=>!/^account-read:teachingFeedback:[12]$/u.test(event.kind)||!['running','complete'].includes(event.status))
      ||!Array.from({length:observation?.attempts.length??0},(_,index)=>index+1).every(attempt=>
        accountReads.some(event=>event.kind==='account-read:teachingFeedback:'+attempt&&event.status==='complete'))
      ||accountCitations.some(item=>item.chunkId!==sourceId))failures.push('teaching.wrong_tool_scope');
  }else if(observation?.attempts.length||observation?.modelOperations.length||accountReads.length||accountCitations.length)
    failures.push('teaching.hidden_reads');
  const execution=expected?reviews?'live-model':'unverified':'live-native';
  const outcome=gradeCase(testCase,{statusCode:response.status,execution,fixtureKey:testCase.fixtureKey,body,events:activity});
  failures.push(...outcome.failures.map(item=>item.id));
  return {caseId:testCase.id,passed:failures.length===0,execution,failures,
    attempts:observation?.attempts.length??null,completedEvidenceReviews:observation?reviews:null,
    ...(observation?{responseDigest:observation.responseDigest,receiptDigest:teachingObservationDigest(receipt),
      correlationId,readDigests:observation.attempts.flatMap(attempt=>attempt.reads.map(read=>read.digest)),
      projectionDigests:observation.attempts.map(attempt=>attempt.projectionDigest)}:{})};
}

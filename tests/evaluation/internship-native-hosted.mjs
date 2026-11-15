import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {
  createInternshipProbe,internshipObservationDigest,internshipObservationHeader,verifyInternshipObservation,
} from '../../server/internshipObservation.js';
import {gradeCase} from './grading.mjs';
import {maxAnswerVerificationChecks} from '../../src/services/assistantVerificationLimits.js';
import {internshipCaseHasProtectedBinding,internshipRunnerCases} from './internship-native-runner.mjs';
import {expectedInternshipChargeRead} from './internship-charge-fixture.mjs';
import {internshipNativeFixtureForCase} from './internship-native-cases.mjs';

const cases=internshipRunnerCases().filter(internshipCaseHasProtectedBinding);
const caseById=new Map(cases.map(row=>[row.id,row]));
const db='https://xiftudmvxphxcjtmfmib.supabase.co';
const columns={title:'title',status:'status',startsOn:'starts_on',endsOn:'ends_on',notes:'notes'};
const joinedReview='site_review:affairs_service_requests!affairs_service_records_review_request_id_fkey(id,user_id,status)';
const provenance={source:'saved_local',officialUniversityData:false,institutionalReviewVerified:false,internshipEnrollmentVerified:false,publicEnterpriseDirectory:false};
const tool='internshipRecords';

export function internshipHostedCases(caseIds=cases.map(row=>row.id)){
  if(!Array.isArray(caseIds)||caseIds.length===0||new Set(caseIds).size!==caseIds.length||caseIds.some(id=>!caseById.has(id)))
    throw new Error('Invalid protected Internship case selection.');
  return caseIds.map(id=>structuredClone(caseById.get(id)));
}

export function internshipFixtureKindForCase(testCase){
  const read=testCase.observationExpectation.read;
  return read?.state==='empty'?read.recordType:'normal';
}

export function expectedInternshipRead(plan,testCase){
  const {sourceRead}=internshipNativeFixtureForCase(testCase);
  if(!sourceRead)return null;
  const {fields,recordType,view,state,count,records}=sourceRead;
  const review=fields.includes('reviewStatus');
  const selected=['id','user_id','service_key','record_type',...fields.filter(field=>field!=='reviewStatus').map(field=>columns[field])];
  const select=[...selected,...(review?['review_request_id',joinedReview]:[])].join(',');
  const ownerId=plan.owners.A;
  const url=new URL('/rest/v1/affairs_service_records',db);
  url.search=new URLSearchParams({select,service_key:'eq.internship',record_type:'eq.'+recordType,
    user_id:'eq.'+ownerId,order:'id.asc',limit:'25'});
  const rows=plan.records.filter(row=>row.user_id===ownerId&&row.record_type===recordType).map(row=>{
    const base=Object.fromEntries(selected.map(column=>[column,row[column]]));
    if(!review)return base;
    const linked=plan.requests.find(request=>request.id===row.review_request_id);
    return {...base,review_request_id:row.review_request_id,site_review:linked?{id:linked.id,user_id:linked.user_id,status:linked.status}:null};
  });
  if(rows.length!==count)throw new Error('Internship row count differs from the frozen evidence oracle.');
  const projection={collection:tool,readState:state,reason:null,complete:true,provenance,
    selection:{view,recordType,route:testCase.route,recordId:null,fields},
    counts:{available:count,included:count,returned:count,omitted:0},records};
  return {reads:[internshipObservationDigest({method:'GET',url:url.href,ownerId,available:count,rows})],
    evidenceDigest:internshipObservationDigest(projection)};
}

export async function requestInternshipHostedCase({testCase,plan,chargePlan,origin,sourceRevision,runId,token,key,signal,fetchImpl,readResponse,privateMarkers,correlations}){
  const source=testCase.observationExpectation.read,guest=testCase.auth==='anonymous',companion=testCase.observationExpectation.companion;
  if(companion&&(!chargePlan||companion!=='charges'||chargePlan.runId!==runId||!isDeepStrictEqual(chargePlan.owners,plan.owners)))
    throw new Error('The approved Internship charge fixture is missing.');
  const request={question:testCase.question,route:testCase.route,history:testCase.history,stream:false,consentedResearchUse:false};
  const probe=guest?null:createInternshipProbe({ownerId:plan.owners.A,runId,origin,sourceRevision,nonce:randomUUID(),companion},request,key);
  const endpoint=new URL(guest?'/api/research-assistant':'/api/affairs-assistant',origin);
  const response=await fetchImpl(endpoint,{method:'POST',signal,headers:{'Content-Type':'application/json',Accept:'application/json',
    ...(guest?{}:{Authorization:'Bearer '+token})},body:JSON.stringify(probe?.body??request)});
  const receipt=response.headers.get(internshipObservationHeader),correlationId=response.headers.get('x-assistant-request-id');
  const body=await readResponse(response,endpoint,128000);
  const failures=[];
  const output=JSON.stringify(body);
  const activity=Array.isArray(body.activity)?body.activity:[];
  if(privateMarkers.some(marker=>marker&&output.includes(marker)))failures.push('observation.private_marker');
  let observation=null,reads=0,reviews=0,operations=0,completedNativeCheck=false;
  if(guest){
    if(receipt)failures.push('observation.guest_receipt');
  }else{
    observation=verifyInternshipObservation({receipt,binding:probe.binding,correlationId,body},key);
    if(!observation||correlations.has(correlationId))failures.push('observation.missing_or_mismatched');
    else{
      correlations.add(correlationId);
      const expected=expectedInternshipRead(plan,testCase);
      reads=observation.attempts.reduce((total,attempt)=>total+attempt.reads.length,0);
      reviews=observation.modelOperations.filter(name=>name==='answer_evidence_review').length;
      operations=observation.modelOperations.length;
      if(expected){
        if(!observation.attempts.length||observation.attempts.some(attempt=>!isDeepStrictEqual(attempt,expected)))failures.push('observation.read_or_projection');
        if(companion==='charges'){
          const expectedCharge=expectedInternshipChargeRead(chargePlan);
          if(observation.chargeAttempts.length!==observation.attempts.length
            ||observation.chargeAttempts.some(attempt=>!isDeepStrictEqual(attempt,expectedCharge)))failures.push('observation.charge_read_or_projection');
        }else if(observation.chargeAttempts.length)failures.push('observation.unexpected_companion');
        const checks=body.verification?.attempts;
        // Account verification refreshes scoped rows once. Its deeper review
        // may then use that same evidence without authorizing a third read.
        const expectedPhysicalReads=Math.min(checks,2);
        const exactReadChecks=body.verification?.status==='verified'&&Number.isInteger(checks)
          &&checks>=1&&checks<=maxAnswerVerificationChecks&&reads===expectedPhysicalReads&&observation.attempts.length===expectedPhysicalReads;
        if(observation.verificationMethod==='native-exact'){
          const nativeChecks=activity.filter(step=>step.kind==='internship-evidence-check'&&step.status==='complete');
          completedNativeCheck=exactReadChecks&&operations===0&&nativeChecks.length===1;
          if(!completedNativeCheck)failures.push('observation.native_check');
        }else{
          // Transport/provider failures may lack a completion receipt. They are
          // diagnostic rather than a complete hosted model acceptance.
          if(observation.verificationMethod!=='model'||!exactReadChecks||reviews!==checks)
            failures.push('observation.model_review');
        }
      }else if(observation.verificationMethod!=='none'||reads||observation.attempts.length||operations)
        failures.push('observation.unexpected_lookup');
    }
  }
  const allowedRead=companion==='charges'?/^account-read:(?:internshipRecords|charges):[12]$/u:/^account-read:internshipRecords:[12]$/u;
  if(activity.some(step=>String(step.kind).startsWith('account-read:')&&(!source||!allowedRead.test(step.kind))))
    failures.push('observation.unrelated_activity');
  if(body.grounding?.webSearched!==false)failures.push('observation.public_research');
  const execution=guest||completedNativeCheck||observation?.verificationMethod==='none'?'live-native'
    :observation?.verificationMethod==='model'&&reviews?'live-model':'unverified';
  const outcome=gradeCase({...testCase,executionContract:'live-native'},{statusCode:response.status,fixtureKey:testCase.fixtureKey,
    body,events:activity,execution});
  failures.push(...outcome.failures.map(failure=>failure.id));
  return {caseId:testCase.id,passed:failures.length===0,execution,readCount:observation?reads:null,
    verificationChecks:body.verification?.attempts??null,completedEvidenceReviews:observation?reviews:null,completedModelCalls:observation?operations:null,
    completedNativeCheck,verificationMethod:observation?.verificationMethod??null,observed:observation!==null,...(observation?{correlationId,responseDigest:observation.responseDigest,
      receiptDigest:internshipObservationDigest(receipt),readDigests:observation.attempts.flatMap(attempt=>attempt.reads),
      projectionDigests:observation.attempts.map(attempt=>attempt.evidenceDigest),
      ...(companion==='charges'?{companionReadDigests:observation.chargeAttempts.flatMap(attempt=>attempt.reads),
        companionProjectionDigests:observation.chargeAttempts.map(attempt=>attempt.evidenceDigest)}:{})}:{}),failures};
}

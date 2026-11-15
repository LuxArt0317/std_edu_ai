import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {
  createStudentLeaveBoundaryProbe,createStudentLeaveProbe,leaveObservationHeader,studentLeaveObservationDigest,studentLeaveRowsDigest,verifyStudentLeaveObservation,
} from '../../server/studentLeaveObservation.js';
import {gradeCase} from './grading.mjs';
import {bindStudentLeaveFixtureCase,studentLeaveFixtureManifest} from './student-leave-fixture-plan.mjs';
import {expectedAttempt} from './student-leave-offline-adapter.mjs';
import {studentLeaveRunnerCases} from './student-leave-runner.mjs';

const prefix='account:student-leave-native-';
const readScopes=new Map(studentLeaveFixtureManifest.cases.filter(scope=>scope.availability==='leave_state_available')
  .map(scope=>[scope.caseId,scope.family]));
const boundaryScopes=new Map(studentLeaveFixtureManifest.cases.filter(scope=>scope.availability==='boundary_setup_available')
  .map(scope=>[scope.caseId,scope.family]));
const boundaryExpectations=new Map(Object.entries({
  'explicit-foreign':'foreign_request',
  'chinese-foreign':'foreign_request',
  'foreign-record-no-expansion':'foreign_request',
  'route-tamper':'invalid_route',
  'unsupported-date':'ambiguous_selector',
  'malformed-id':'ambiguous_selector',
  'unsupported-detail':'unsupported_field',
  attendance:'requires_attendance_source',
  write:'unsupported_operation',
  excluded:'excluded',
  'excluded-foreign':'excluded',
  navigation:'navigation',
  'index-navigation':'navigation',
  'approval-count-unavailable':'unsupported_field',
}).map(([id,disposition])=>[prefix+id,disposition]));
const cases=new Map(studentLeaveRunnerCases().filter(row=>readScopes.has(row.id)||boundaryScopes.has(row.id)).map(row=>[row.id,row]));
for(const [id] of boundaryScopes){
  const row=cases.get(id);
  if(!boundaryExpectations.has(id)||row?.nativeLeaveContract.requiresScopedRecordRead!==false
    ||row.expected.allowedTools.length||row.expected.requiredAttemptedTools.length
    ||row.expected.requiredTools.length||row.expected.maxDistinctAttemptedTools!==0
    ||row.expected.noAction!==true||row.expected.forbidPublicResearch!==true)
    throw new Error('The hosted Student Leave boundary no longer matches the frozen zero-read contract.');
}
if(boundaryScopes.size!==boundaryExpectations.size)
  throw new Error('The hosted Student Leave boundary roster changed.');
const privateMarkers=/STUDENT_PRIVATE_(?:REASON|PHONE)|FOREIGN PRIVATE SENTINEL|000-000-0000/u;
const maxBodyBytes=128000;

export const studentLeaveHostedBoundaryCaseIds=()=>[...boundaryScopes.keys()];

export function studentLeaveHostedSelection(caseIds=[...readScopes.keys()]){
  if(!Array.isArray(caseIds)||!caseIds.length||new Set(caseIds).size!==caseIds.length)
    throw new Error('Invalid Student Leave hosted case selection.');
  // One disposable caller remains below the private per-minute endpoint limit.
  const scopes=boundaryScopes.has(caseIds[0])?boundaryScopes:readScopes;
  if(caseIds.some(id=>!scopes.has(id)))throw new Error('Invalid Student Leave hosted case selection.');
  return caseIds.map(id=>({testCase:cases.get(id),family:scopes.get(id)}));
}

async function boundedResponse(response){
  const stream=response.body?.getReader();
  if(!stream)return null;
  const chunks=[];
  let size=0;
  try{
    while(true){
      const {value,done}=await stream.read();
      if(done)break;
      size+=value.byteLength;
      if(size>maxBodyBytes||chunks.length>=1024)return null;
      chunks.push(value);
    }
    const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
    const body=JSON.parse(text);
    return body&&typeof body==='object'&&!Array.isArray(body)&&!privateMarkers.test(JSON.stringify(body))?body:null;
  }catch{return null;}
  finally{void stream.cancel().catch(()=>{});stream.releaseLock();}
}

/** Acceptance uses the frozen fixture oracle and a separately signed server
 * receipt. A terminal verification badge cannot populate either input. */
export async function requestObservedStudentLeave({plan,testCase,key,token,fetchImpl,signal,seenCorrelations}){
  const bound=bindStudentLeaveFixtureCase(plan,testCase);
  const boundary=boundaryExpectations.get(bound.caseId);
  const expected=boundary?null:expectedAttempt(plan,bound,studentLeaveRowsDigest);
  const request={question:bound.question,route:bound.route,history:bound.history,stream:false,consentedResearchUse:false};
  const makeProbe=boundary?createStudentLeaveBoundaryProbe:createStudentLeaveProbe;
  const {binding,body}=makeProbe({ownerId:bound.ownerId,runId:bound.runId,origin:bound.origin,
    sourceRevision:bound.sourceRevision,nonce:randomUUID()},request,key);
  const response=await fetchImpl(bound.origin+'/api/affairs-assistant',{method:'POST',signal,
    headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  const reply=await boundedResponse(response);
  const correlationId=response.headers.get('x-assistant-request-id');
  const receipt=response.headers.get(leaveObservationHeader);
  const observation=reply&&response.status===200&&/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type')??'')
    &&verifyStudentLeaveObservation({receipt,binding,correlationId,body:reply},key);
  const absent={caseId:bound.caseId,passed:false,observed:false,completedModelCalls:0,completedNativeCheck:false};
  if(!observation||seenCorrelations.has(correlationId))return {...absent,failures:['observation.missing_or_invalid']};
  seenCorrelations.add(correlationId);
  if(boundary){
    const outcome=gradeCase({...testCase,expected:bound.expected,executionContract:'live-native'},{
      statusCode:response.status,execution:'live-native',fixtureKey:bound.fixtureKey,body:reply,toolCalls:[],
    });
    const failures=outcome.failures.map(row=>row.id);
    if(observation.boundaryDisposition!==boundary||observation.verificationMethod!=='none')
      failures.push('observation.boundary_disposition_mismatch');
    const activity=Array.isArray(reply.activity)?reply.activity:[];
    if(reply.verification!==undefined||activity.some(step=>String(step?.kind??'').startsWith('account-read:')))
      failures.push('observation.unexpected_reader_activity');
    return {caseId:bound.caseId,passed:failures.length===0,observed:true,attempts:0,reads:0,
      execution:'live-native',completedModelCalls:0,completedReview:false,completedNativeCheck:false,
      completedBoundaryCheck:failures.length===0,boundaryDisposition:observation.boundaryDisposition,failures,
      receiptDigest:studentLeaveObservationDigest(receipt),responseDigest:observation.responseDigest};
  }
  const wanted={reads:expected.reads.map(studentLeaveObservationDigest),evidenceDigest:studentLeaveObservationDigest(expected.evidence)};
  if(!observation.attempts.every(attempt=>isDeepStrictEqual(attempt,wanted)))
    return {...absent,failures:['observation.read_or_evidence_mismatch']};
  const activity=Array.isArray(reply.activity)?reply.activity:[];
  const unrelatedReader=activity.some(step=>typeof step?.kind==='string'
    &&step.kind.startsWith('account-read:')&&!/^account-read:leaveRecords:[1-3]$/u.test(step.kind));
  const completedReview=observation.completedModelOperations.includes('answer_evidence_review');
  const completedNativeCheck=observation.verificationMethod==='native-exact'
    &&observation.completedModelOperations.length===0
    &&reply.verification?.status==='verified'
    &&reply.verification.attempts===observation.attempts.length
    &&activity.filter(step=>step?.kind==='student-leave-evidence-check'&&step.status==='complete').length===1;
  const execution=completedNativeCheck?'live-native':completedReview?'live-model':'unverified';
  // The exact read proof supplies grading's execution input independently.
  // Keep non-read activity for other grading checks.
  const outcome=gradeCase({...testCase,expected:bound.expected,executionContract:'live-native'},{
    statusCode:response.status,execution,fixtureKey:bound.fixtureKey,
    body:{...reply,activity:activity.filter(step=>!String(step?.kind??'').startsWith('account-read:'))},
    toolCalls:[{name:'leaveRecords',status:'complete'}],
  });
  const failures=outcome.failures.map(row=>row.id);
  if(unrelatedReader)failures.push('observation.unexpected_reader_activity');
  if(!completedNativeCheck)failures.push('observation.native_check_not_completed');
  return {caseId:bound.caseId,passed:failures.length===0,observed:true,attempts:observation.attempts.length,
    reads:observation.attempts.reduce((count,row)=>count+row.reads.length,0),
    execution,completedModelCalls:observation.completedModelOperations.length,
    completedReview,completedNativeCheck,failures,
    receiptDigest:studentLeaveObservationDigest(receipt),responseDigest:observation.responseDigest};
}

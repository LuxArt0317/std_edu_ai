import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {
  createStudentLeaveProbe,leaveObservationHeader,studentLeaveObservationDigest,studentLeaveRowsDigest,verifyStudentLeaveObservation,
} from '../../server/studentLeaveObservation.js';
import {gradeCase} from './grading.mjs';
import {bindStudentLeaveFixtureCase,studentLeaveFixtureManifest} from './student-leave-fixture-plan.mjs';
import {expectedAttempt} from './student-leave-offline-adapter.mjs';
import {studentLeaveRunnerCases} from './student-leave-runner.mjs';

const scopes=new Map(studentLeaveFixtureManifest.cases.filter(scope=>scope.availability==='leave_state_available')
  .map(scope=>[scope.caseId,scope.family]));
const cases=new Map(studentLeaveRunnerCases().filter(row=>scopes.has(row.id)).map(row=>[row.id,row]));
const privateMarkers=/STUDENT_PRIVATE_(?:REASON|PHONE)|FOREIGN PRIVATE SENTINEL|000-000-0000/u;
const maxBodyBytes=128000;

export function studentLeaveHostedSelection(caseIds=[...cases.keys()]){
  if(!Array.isArray(caseIds)||!caseIds.length||caseIds.length>cases.size
    ||new Set(caseIds).size!==caseIds.length||caseIds.some(id=>!cases.has(id)))
    throw new Error('Invalid Student Leave hosted case selection.');
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
  const expected=expectedAttempt(plan,bound,studentLeaveRowsDigest);
  const request={question:bound.question,route:bound.route,history:bound.history,stream:false,consentedResearchUse:false};
  const {binding,body}=createStudentLeaveProbe({ownerId:bound.ownerId,runId:bound.runId,origin:bound.origin,
    sourceRevision:bound.sourceRevision,nonce:randomUUID()},request,key);
  const response=await fetchImpl(bound.origin+'/api/affairs-assistant',{method:'POST',signal,
    headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  const reply=await boundedResponse(response);
  const correlationId=response.headers.get('x-assistant-request-id');
  const receipt=response.headers.get(leaveObservationHeader);
  const observation=reply&&response.status===200&&/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type')??'')
    &&verifyStudentLeaveObservation({receipt,binding,correlationId,body:reply},key);
  const absent={caseId:bound.caseId,passed:false,observed:false,completedModelCalls:0};
  if(!observation||seenCorrelations.has(correlationId))return {...absent,failures:['observation.missing_or_invalid']};
  seenCorrelations.add(correlationId);
  const wanted={reads:expected.reads.map(studentLeaveObservationDigest),evidenceDigest:studentLeaveObservationDigest(expected.evidence)};
  if(!observation.attempts.every(attempt=>isDeepStrictEqual(attempt,wanted)))
    return {...absent,failures:['observation.read_or_evidence_mismatch']};
  const activity=Array.isArray(reply.activity)?reply.activity:[];
  const unrelatedReader=activity.some(step=>typeof step?.kind==='string'
    &&step.kind.startsWith('account-read:')&&!/^account-read:leaveRecords:[1-3]$/u.test(step.kind));
  const completedReview=observation.completedModelOperations.includes('answer_evidence_review');
  // The exact read proof supplies grading's execution input independently.
  // Keep non-read activity for other grading checks.
  const outcome=gradeCase({...testCase,expected:bound.expected},{
    statusCode:response.status,execution:'live-model',fixtureKey:bound.fixtureKey,
    body:{...reply,activity:activity.filter(step=>!String(step?.kind??'').startsWith('account-read:'))},
    toolCalls:[{name:'leaveRecords',status:'complete'}],
  });
  const failures=outcome.failures.map(row=>row.id);
  if(unrelatedReader)failures.push('observation.unexpected_reader_activity');
  if(!completedReview)failures.push('observation.review_not_completed');
  return {caseId:bound.caseId,passed:failures.length===0,observed:true,attempts:observation.attempts.length,
    reads:observation.attempts.reduce((count,row)=>count+row.reads.length,0),
    completedModelCalls:observation.completedModelOperations.length,completedReview,failures,
    receiptDigest:studentLeaveObservationDigest(receipt),responseDigest:observation.responseDigest};
}

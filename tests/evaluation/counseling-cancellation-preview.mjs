import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {counselingAppointmentsPath as route} from '../../server/counselingContract.js';
import {assertCounselingCancellationCommand,redactCounselingReply} from './counseling-appointment-hosted.mjs';
import {counselingAppointmentCancellationTarget} from './counseling-appointment-fixture-plan.mjs';
import {readReply} from './run.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=stage=>{throw new Error('Counseling cancellation did not match the expected '+stage+'.');};
const cases=Object.freeze(['guest','other-owner-proposal','owner-proposal','crossed-before','stale-before','confirmed',
  'replayed','changed-replay','crossed-after'].map(name=>'counseling-cancel-'+name));
export const counselingCancellationCaseIds=()=>[...cases];

export async function verifyCounselingCancellation({plan,observe,markCancellation,request,onResult}){
  const target=counselingAppointmentCancellationTarget(plan);
  const question='Cancel my counseling appointment with ID '+target.id+'.';
  const results=[];
  async function attempt(name,command,check){
    const caseId='counseling-cancel-'+name,beforeState=command.before??'initial',afterState=command.after??'initial';
    if(caseId!==cases[results.length])fail('case order');
    const before=await observe(beforeState);
    const observed=await request({caseId,...command});
    const after=await observe(afterState);
    const changed=afterState!==beforeState;
    if(changed===isDeepStrictEqual(before,after)||changed===(before.rowsDigest===after.rowsDigest)
      ||!isDeepStrictEqual(before.counts,[3,1])||!isDeepStrictEqual(after.counts,[3,1])
      ||!check(observed.body,observed.activity))fail(caseId);
    const result={caseId,passed:true,requestIndex:observed.requestIndex,requestDigest:hash(command.query??command.action),
      ...(observed.correlationId?{correlationId:observed.correlationId}:{}),
      beforeDigest:before.rowsDigest,afterDigest:after.rowsDigest};
    result.beforeOperationsDigest=before.operationsDigest;
    result.afterOperationsDigest=after.operationsDigest;
    results.push(result);
    await onResult?.(result);
    return observed.body;
  }
  await attempt('guest',{actor:'guest',query:'Cancel my counseling appointment.',status:200},(body,activity)=>
    body?.status==='handoff'&&!body.proposedAction&&body.citations?.some(row=>row.url==='/school-affairs/login?next='+encodeURIComponent(route))
    &&activity.every(step=>!String(step.kind).startsWith('account-read:')));
  await attempt('other-owner-proposal',{actor:'B',query:question,status:200},body=>body?.status==='clarification'&&!body.proposedAction);
  const answer=await attempt('owner-proposal',{actor:'A',query:question,status:200,proposalSelector:target.id},(body,activity)=>{
    const action=body?.proposedAction;
    return body?.status==='answered'&&body.grounding?.source==='account'&&body.grounding.webSearched===false
      &&isDeepStrictEqual(body.verification,{status:'verified',attempts:1})
      &&uuid.test(action?.requestId??'')&&isDeepStrictEqual(action,{
        kind:'counseling_cancel',label:'Cancel Counseling · Scheduled date '+target.scheduled_at.slice(0,10)+' · Scheduled',
        payload:{id:target.id,expected_version:String(target.version)},requestId:action.requestId,url:route,
      })&&activity.some(step=>step.kind==='account-read:counselingAppointments:1'&&step.status==='complete');
  });
  const payload={request_id:answer.proposedAction.requestId,id:target.id,expected_version:target.version};
  assertCounselingCancellationCommand(plan,payload);
  const action={kind:'counseling_cancel',payload};
  const stale={...action,payload:{...payload,expected_version:target.version-1}};
  const different={...action,payload:{...payload,expected_version:target.version+1}};
  const receipt={id:target.id,status:'cancelled',version:target.version+1};
  const denied=body=>typeof body?.error==='string'&&body.error.length<=500&&Object.keys(body).length===1;
  const accepted=body=>isDeepStrictEqual(body,receipt);
  await markCancellation(payload);
  await attempt('crossed-before',{actor:'B',action,status:404},denied);
  await attempt('stale-before',{actor:'A',action:stale,status:409},denied);
  await attempt('confirmed',{actor:'A',action,status:200,after:'cancelled'},accepted);
  await attempt('replayed',{actor:'A',action,status:200,before:'cancelled',after:'cancelled'},accepted);
  await attempt('changed-replay',{actor:'A',action:different,status:409,before:'cancelled',after:'cancelled'},denied);
  await attempt('crossed-after',{actor:'B',action,status:404,before:'cancelled',after:'cancelled'},denied);
  return results;
}

export function hasCounselingCancellationProof(results){
  const sha=/^[0-9a-f]{64}$/u,emptyOperations=hash([]),correlations=new Set();
  return results.length===cases.length&&results.every((row,index)=>{
    const previous=results[index-1],confirmation=row?.caseId==='counseling-cancel-confirmed';
    if(row?.caseId!==cases[index]||![row.beforeDigest,row.afterDigest,row.beforeOperationsDigest,row.afterOperationsDigest,row.requestDigest]
      .every(value=>sha.test(value??'')))return false;
    if(confirmation===(row.beforeDigest===row.afterDigest)||confirmation===(row.beforeOperationsDigest===row.afterOperationsDigest)
      ||(previous?row.beforeDigest!==previous.afterDigest||row.beforeOperationsDigest!==previous.afterOperationsDigest
        :row.beforeOperationsDigest!==emptyOperations))return false;
    if(index===0||index>=3)return row.correlationId===undefined;
    if(!uuid.test(row.correlationId??'')||correlations.has(row.correlationId))return false;
    correlations.add(row.correlationId);return true;
  });
}

export async function requestCounselingCancellation({origin,command,token,signal,previewFetch,actionFetch,readResponse,privateMarkers,correlationIds}){
  const endpoint=new URL(command.action?'/api/affairs-action':token?'/api/affairs-assistant':'/api/research-assistant',origin);
  const input=command.action??{question:command.query,route,stream:true,consentedResearchUse:false};
  const headers={'Content-Type':'application/json',Accept:command.action?'application/json':'text/event-stream'};
  if(token)headers.Authorization='Bearer '+token;
  const response=await (command.action?actionFetch:previewFetch)(endpoint,{method:'POST',body:JSON.stringify(input),headers,signal});
  if(command.action){
    const body=await readResponse(response,endpoint,4096,command.status);
    if(command.status!==200&&redactCounselingReply({body},privateMarkers))fail('private-field boundary');
    return {body,activity:[]};
  }
  const correlationId=token?response.headers.get('X-Assistant-Request-Id'):null;
  if(response.status!==command.status||response.redirected||response.url&&response.url!==endpoint.href
    ||response.headers.get('content-type')?.split(';')[0]!=='text/event-stream'
    ||token&&(!uuid.test(correlationId??'')||correlationIds.has(correlationId))){
    await response.body?.cancel();fail('stream identity');
  }
  if(correlationId)correlationIds.add(correlationId);
  const envelope=await readReply(response);
  // The owner proposal's typed executable selector must be present in the raw envelope.
  // Check it independently and mask only that field during leak detection.
  const checked=structuredClone(envelope);
  if(command.proposalSelector&&checked.body?.proposedAction?.payload?.id===command.proposalSelector){
    checked.body.proposedAction.payload.id='[appointment selector]';
  }
  if(redactCounselingReply(checked,privateMarkers))fail('private-field boundary');
  return {body:envelope.body,activity:envelope.events,correlationId};
}

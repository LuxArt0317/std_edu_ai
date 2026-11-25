import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {clubEquipmentPath as route} from '../../server/clubEquipmentIntent.js';
import {readReply} from './run.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=stage=>{throw new Error('Club cancellation did not match the expected '+stage+'.');};

export async function verifyClubEquipmentCancellation({plan,observe,markCancellation,request}){
  const target=plan.rows[2];
  if(!target||target.user_id!==plan.owners.B.id||target.status!=='submitted'||target.version<2)fail('fixture');
  const question='Cancel my club equipment request for "'+target.items[0].label+'".';
  const results=new Map();
  async function attempt(caseId,command,check){
    const before=await observe(command.before??'initial');
    const observed=await request({caseId,...command});
    const after=await observe(command.after??'initial');
    const changed=(command.after??'initial')!==(command.before??'initial');
    if(changed===isDeepStrictEqual(before,after)||!check(observed.body,observed.activity))fail(caseId);
    results.set(caseId,{caseId,passed:true,requestIndex:observed.requestIndex,requestDigest:hash(command.query??command.action),
      beforeDigest:before.rowsDigest,afterDigest:after.rowsDigest});
    return observed.body;
  }
  await attempt('equipment-cancel-other-proposal',{actor:'A',query:question,status:200},body=>
    body?.status==='clarification'&&!body.proposedAction&&!JSON.stringify(body).includes(target.id));
  const answer=await attempt('equipment-cancel-owner-proposal',{actor:'B',query:question,status:200},(body,activity)=>{
    const action=body?.proposedAction;
    return body?.status==='answered'&&body.grounding?.source==='account'&&body.grounding.webSearched===false
      &&isDeepStrictEqual(body.verification,{status:'verified',attempts:1})
      &&uuid.test(action?.requestId??'')&&isDeepStrictEqual(action,{
        kind:'cancel_club_equipment',label:'Cancel '+target.club_name+' · Pickup '+target.pickup_on+' · '+target.items[0].label,
        payload:{id:target.id,expected_version:String(target.version)},requestId:action.requestId,url:route,
      })&&activity.some(step=>step.kind==='account-read:clubEquipment:1'&&step.status==='complete');
  });
  const payload={request_id:answer.proposedAction.requestId,id:target.id,expected_version:target.version};
  const action={kind:'cancel_club_equipment',payload};
  const stale={...action,payload:{...payload,expected_version:target.version-1}};
  const receipt={id:target.id,status:'cancelled',version:target.version+1};
  const denied=body=>typeof body?.error==='string'&&body.error.length<=500&&Object.keys(body).length===1;
  const accepted=body=>isDeepStrictEqual(body,receipt);
  await markCancellation(payload);
  await attempt('equipment-cancel-crossed-before',{actor:'A',action,status:404},denied);
  await attempt('equipment-cancel-stale-before',{actor:'B',action:stale,status:409},denied);
  await attempt('equipment-cancel-confirmed',{actor:'B',action,status:200,after:'cancelled'},accepted);
  await attempt('equipment-cancel-replayed',{actor:'B',action,status:200,before:'cancelled',after:'cancelled'},accepted);
  await attempt('equipment-cancel-changed-replay',{actor:'B',action:stale,status:409,before:'cancelled',after:'cancelled'},denied);
  await attempt('equipment-cancel-crossed-after',{actor:'A',action,status:404,before:'cancelled',after:'cancelled'},denied);
  await attempt('equipment-cancel-status-after',{actor:'B',
    query:'What is the status of my club equipment request '+target.id+'?',status:200,before:'cancelled',after:'cancelled'},
    body=>body?.status==='answered'&&body.verification?.status==='verified'&&body.grounding?.source==='account'
      &&body.answer.includes('Saved status: Cancelled')&&!body.proposedAction);
  return [...results.values()];
}

export async function requestClubEquipmentCancellation({origin,command,token,signal,previewFetch,actionFetch,readResponse,privateMarkers,correlationIds}){
  const endpoint=new URL(command.action?'/api/affairs-action':'/api/affairs-assistant',origin);
  const input=command.action??{question:command.query,route,stream:true,consentedResearchUse:false};
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:command.action?'application/json':'text/event-stream'};
  const response=await (command.action?actionFetch:previewFetch)(endpoint,{method:'POST',body:JSON.stringify(input),headers,signal});
  if(command.action)return {body:await readResponse(response,endpoint,4096,command.status),activity:[]};
  const correlation=response.headers.get('X-Assistant-Request-Id');
  if(response.status!==command.status||response.redirected||response.url&&response.url!==endpoint.href
    ||response.headers.get('content-type')?.split(';')[0]!=='text/event-stream'
    ||!uuid.test(correlation??'')||correlationIds.has(correlation)){
    await response.body?.cancel();fail('stream identity');
  }
  correlationIds.add(correlation);
  const envelope=await readReply(response);
  if(privateMarkers.some(marker=>marker&&JSON.stringify(envelope).includes(marker)))fail('private-field boundary');
  return {body:envelope.body,activity:envelope.events};
}

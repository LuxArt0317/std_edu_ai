import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {repairPaths} from '../../src/features/public/affairs/facilityRepair.js';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';
import {readReply} from './run.mjs';

export const facilityRepairCancellationMode='facility-repair-confirmed-cancellation';
const kind='cancel_facility_repair';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const initialAt='2024-01-24T20:00:00+00:00',reviewAt='2024-01-25T05:00:00+00:00';
const shape=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys.slice().sort().join();
const sorted=(rows,key)=>rows.slice().sort((a,b)=>key(a).localeCompare(key(b)));
const eventKey=row=>row.repair_id+':'+row.version;
const digest=value=>createHash('sha256').update(JSON.stringify(value,(_key,item)=>
  item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort()):item)).digest('hex');
const deny=body=>shape(body,['error'])&&typeof body.error==='string'&&body.error.length>0&&body.error.length<=280;

export class FacilityRepairCancellationAssertion extends Error{
  constructor(stage){super('Facility repair cancellation failed at '+stage+'.');this.stage=stage;}
}
const check=(condition,stage)=>{if(!condition)throw new FacilityRepairCancellationAssertion(stage);};
const levels=['guest','unselected','other-owner-proposal','owner-proposal','crossed-before','unrelated','ineligible',
  'wrong-version','confirmed','replayed','changed-replay','stale-after','crossed-after'];
const prefix='facility-repair-cancel-';
export const facilityRepairCancellationCaseIds=()=>levels.map(level=>prefix+level);

export function buildFacilityRepairCancellationPlan(runId,owners){
  ({owners}=validateAidPaymentFixtureOwners({runId,owners}));
  const makeReport=(role,slot,status,version)=>({
    id:randomUUID(),user_id:owners[role].id,status,version,
    created_at:initialAt,updated_at:version===1?initialAt:reviewAt,
    building:'QA repair '+slot+' building '+runId,location:'QA repair '+slot+' location '+runId,
    item:'QA repair '+slot+' item '+runId,description:'QA repair '+slot+' description '+runId,
    area_code:null,equipment_code:null,contact_phone:'',room:'',floor_label:'',bed:'',location_remark:'',other_item:'',
  });
  const reports=[makeReport('A','target','submitted',1),makeReport('A','ineligible','in_progress',2),makeReport('B','foreign','submitted',1)];
  const initial=report=>({repair_id:report.id,actor:null,request_id:randomUUID(),version:1,action:'submit',payload:{},
    status:'submitted',note:'',occurred_at:initialAt});
  const events=reports.flatMap(report=>report.version===1?[initial(report)]:[initial(report),{
    repair_id:report.id,actor:null,request_id:randomUUID(),version:2,action:'review',payload:{},status:report.status,
    note:'QA repair private note '+runId,occurred_at:reviewAt,
  }]);
  return {runId,owners,reports,events,missingId:randomUUID(),staleRequestId:randomUUID()};
}

async function verifyRepairOwners(sql,plan){
  const ids=Object.values(plan.owners).map(row=>row.id);
  const rows=await sql`select u.id,u.email,u.raw_user_meta_data->>'assistant_evaluation_run' as marker,
    u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google') as google
    from auth.users u where u.id in ${sql(ids)} limit 3`;
  check(rows.length===2&&Object.values(plan.owners).every(owner=>rows.some(row=>row.id===owner.id&&row.email===owner.email
    &&row.marker===plan.runId&&row.google===true)),'disposable-owner-binding');
}

async function readRows(sql,plan,command){
  const owners=Object.values(plan.owners).map(row=>row.id);
  const reportIds=[...plan.reports.map(row=>row.id),plan.missingId];
  const requestIds=[...plan.events.map(row=>row.request_id),plan.staleRequestId,...(command?[command.request_id]:[])];
  const [value]=await sql`select
    coalesce((select jsonb_agg(to_jsonb(r) order by r.id)
      from (select * from public.affairs_facility_repairs where id in ${sql(reportIds)} or user_id in ${sql(owners)} limit 4) r),'[]'::jsonb) as reports,
    coalesce((select jsonb_agg(to_jsonb(e) order by e.repair_id,e.version)
      from (select * from private.affairs_facility_repair_events
        where repair_id in ${sql(reportIds)} or actor in ${sql(owners)} or request_id in ${sql(requestIds)} limit 6) e),'[]'::jsonb) as events,
    exists(select 1 from public.affairs_agent_audit where user_id in ${sql(owners)}) as audit`;
  check(value?.audit===false,'no-unrelated-audit-writes');
  return {reports:value.reports,events:value.events};
}

function expectedRows(plan,command,observed,expectedState){
  if(expectedState==='initial')return {reports:plan.reports,events:plan.events};
  check(expectedState==='cancelled'&&shape(command,['request_id','id','version'])&&uuid.test(command.request_id)
    &&command.id===plan.reports[0].id&&command.version===1,'journaled-cancellation-binding');
  const target=plan.reports[0],timestamp=observed.reports.find(row=>row.id===target.id)?.updated_at;
  check(typeof timestamp==='string'&&Number.isFinite(Date.parse(timestamp))&&Date.parse(timestamp)>Date.parse(initialAt),'native-cancellation-instant');
  return {reports:[{...target,status:'cancelled',version:2,updated_at:timestamp},...plan.reports.slice(1)],
    events:[...plan.events,{repair_id:target.id,actor:target.user_id,request_id:command.request_id,version:2,action:kind,
      payload:command,status:'cancelled',note:'',occurred_at:timestamp}]};
}

function assertRows(plan,command,observed,expectedState){
  const expected=expectedRows(plan,command,observed,expectedState);
  check(isDeepStrictEqual(sorted(observed.reports,row=>row.id),sorted(expected.reports,row=>row.id))
    &&isDeepStrictEqual(sorted(observed.events,eventKey),sorted(expected.events,eventKey)),
  'exact-'+expectedState+'-reports-and-event');
  return {owners:Object.values(plan.owners).map(owner=>owner.id),reports:observed.reports,events:observed.events};
}

export async function seedFacilityRepairCancellation(sql,plan){
  await verifyRepairOwners(sql,plan);
  const existing=await readRows(sql,plan);
  check(!existing.reports.length&&!existing.events.length,'empty-reserved-repair-scope');
  await sql`insert into public.affairs_facility_repairs ${sql(plan.reports)}`;
  await sql`insert into private.affairs_facility_repair_events ${sql(plan.events.map(row=>({...row,payload:sql.json(row.payload)})))}`;
  assertRows(plan,null,await readRows(sql,plan),'initial');
}

export async function observeFacilityRepairCancellation(sql,plan,{command=null,expectedState,readScopes}){
  await verifyRepairOwners(sql,plan);
  const expected=assertRows(plan,command,await readRows(sql,plan,command),expectedState);
  const wire=await readScopes({...expected,missingId:plan.missingId});
  return {rowsDigest:digest(expected.reports),eventsDigest:digest(expected.events),wireDigest:digest(wire),
    counts:expected.owners.map(id=>wire[id].list.total)};
}

// The surrounding transaction holds both native actor locks until all reserved
// reports and their exact event histories have been verified and deleted.
export async function deleteFacilityRepairCancellation(sql,plan,command){
  await verifyRepairOwners(sql,plan);
  for(const id of Object.values(plan.owners).map(owner=>owner.id).sort())
    await sql`select pg_advisory_xact_lock(hashtextextended('facility-repair:'||${id},0))`;
  await sql`select id from public.affairs_facility_repairs where id in ${sql(plan.reports.map(row=>row.id))} order by id for update`;
  const observed=await readRows(sql,plan,command);
  if(!observed.reports.length&&!observed.events.length)return true;
  const cancelled=observed.reports.some(row=>row.id===plan.reports[0].id&&row.status==='cancelled');
  assertRows(plan,command,observed,cancelled?'cancelled':'initial');
  for(const row of plan.reports){
    const removed=await sql`delete from public.affairs_facility_repairs where id=${row.id} and user_id=${row.user_id} returning id`;
    check(removed.length===1&&removed[0].id===row.id,'exact-report-deletion');
  }
  const after=await readRows(sql,plan,command);
  check(!after.reports.length&&!after.events.length,'report-and-event-cleanup');
  return true;
}

export async function verifyFacilityRepairCancellationAbsent(sql,plan,command){
  const ids=Object.values(plan.owners).map(owner=>owner.id);
  const after=await readRows(sql,plan,command);
  const [result]=await sql`select (exists(select 1 from auth.users where id in ${sql(ids)})
    or exists(select 1 from auth.identities where user_id in ${sql(ids)})) as remains`;
  check(result?.remains===false&&!after.reports.length&&!after.events.length,'disposable-identity-and-repair-cleanup');
  return true;
}

export async function verifyFacilityRepairCancellation({plan,observe,markCancellation,request,onResult}){
  const target=plan.reports[0],control=plan.reports[1],history=repairPaths.history,route=history+'/'+target.id;
  const query='Cancel my repair report.';
  const results=[];
  async function attempt(level,command,accept){
    const caseId=prefix+level;
    check(caseId===facilityRepairCancellationCaseIds()[results.length],'case-order');
    const beforeState=command.before??'initial',afterState=command.after??beforeState;
    const before=await observe(beforeState);
    const value=await request({caseId,...command});
    const after=await observe(afterState);
    const changed=beforeState!==afterState;
    check(isDeepStrictEqual(before.counts,[2,1])&&isDeepStrictEqual(after.counts,[2,1])
      &&['rowsDigest','eventsDigest','wireDigest'].every(key=>changed!==(before[key]===after[key]))
      &&accept(value.body,value.activity),caseId);
    const row={caseId,passed:true,requestIndex:value.requestIndex,requestDigest:digest(command.action??{question:command.query,route:command.route}),
      ...(command.action&&command.status===200?{receiptDigest:digest(value.body)}:{}),
      ...(value.correlationId?{correlationId:value.correlationId}:{}),before,after};
    results.push(row);await onResult?.(row);return value.body;
  }
  const noRead=activity=>!activity.some(step=>String(step.kind).startsWith('account-read:'));
  const noProposal=body=>body?.status==='clarification'&&!body.proposedAction;
  await attempt('guest',{actor:'guest',query,route,status:200},(body,activity)=>body?.status==='handoff'&&!body.proposedAction&&noRead(activity)
    &&isDeepStrictEqual(body.citations?.map(row=>row.url),['/school-affairs/login?next='+encodeURIComponent(history)]));
  await attempt('unselected',{actor:'A',query,route:history,status:200},(body,activity)=>noProposal(body)&&noRead(activity));
  await attempt('other-owner-proposal',{actor:'B',query,route,status:200},noProposal);
  const answer=await attempt('owner-proposal',{actor:'A',query,route,status:200,proposalSelector:target.id},(body,activity)=>{
    const action=body?.proposedAction;
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(target.created_at));
    return body?.status==='answered'&&body.grounding?.source==='account'&&body.grounding.webSearched===false
      &&isDeepStrictEqual(body.verification,{status:'verified',attempts:1})&&uuid.test(action?.requestId??'')
      &&isDeepStrictEqual(action,{kind,label:'Cancel repair report '+target.id.slice(0,8).toUpperCase()+' · Submitted '+date,
        payload:{id:target.id,version:'1'},requestId:action.requestId,url:route})
      &&activity.some(step=>step.kind==='account-read:facilityRepairs:1'&&step.status==='complete');
  });
  const command={request_id:answer.proposedAction.requestId,id:target.id,version:1};
  check(![...plan.reports.map(row=>row.id),...plan.events.map(row=>row.request_id),plan.missingId,plan.staleRequestId].includes(command.request_id),
    'unique-cancellation-request-id');
  await markCancellation(command);
  const action={kind,payload:command};
  const variant=fields=>({kind,payload:{...command,...fields}});
  const receipt={id:target.id,status:'cancelled',version:2};
  await attempt('crossed-before',{actor:'B',action,status:404},deny);
  await attempt('unrelated',{actor:'A',action:variant({id:plan.missingId}),status:404},deny);
  await attempt('ineligible',{actor:'A',action:variant({id:control.id,version:2}),status:409},deny);
  await attempt('wrong-version',{actor:'A',action:variant({version:2}),status:409},deny);
  await attempt('confirmed',{actor:'A',action,status:200,after:'cancelled'},body=>isDeepStrictEqual(body,receipt));
  await attempt('replayed',{actor:'A',action,status:200,before:'cancelled'},body=>isDeepStrictEqual(body,receipt));
  await attempt('changed-replay',{actor:'A',action:variant({version:2}),status:409,before:'cancelled'},deny);
  await attempt('stale-after',{actor:'A',action:variant({request_id:plan.staleRequestId}),status:409,before:'cancelled'},deny);
  await attempt('crossed-after',{actor:'B',action,status:404,before:'cancelled'},deny);
  return results;
}

export function hasFacilityRepairCancellationProof(results){
  const hashes=/^[a-f0-9]{64}$/u,ids=facilityRepairCancellationCaseIds(),correlations=new Set();
  return Array.isArray(results)&&results.length===ids.length&&results.every((row,index)=>{
    if(row?.caseId!==ids[index]||row.requestIndex!==index+1||row.passed!==true||!hashes.test(row.requestDigest)
      ||index&&!isDeepStrictEqual(row.before,results[index-1].after))return false;
    const changed=row.caseId===prefix+'confirmed';
    const replayed=row.caseId===prefix+'replayed';
    if(![row.before,row.after].every(state=>isDeepStrictEqual(state?.counts,[2,1])
      &&[state.rowsDigest,state.eventsDigest,state.wireDigest].every(value=>hashes.test(value??'')))
      ||!['rowsDigest','eventsDigest','wireDigest'].every(key=>changed!==(row.before[key]===row.after[key])))return false;
    if(changed||replayed){
      if(!hashes.test(row.receiptDigest??''))return false;
      if(replayed&&(row.requestDigest!==results[index-1].requestDigest||row.receiptDigest!==results[index-1].receiptDigest))return false;
    }else if(row.receiptDigest!==undefined)return false;
    if(index<1||index>3)return row.correlationId===undefined;
    if(!uuid.test(row.correlationId??'')||correlations.has(row.correlationId))return false;
    correlations.add(row.correlationId);return true;
  });
}

export async function requestFacilityRepairCancellation({origin,command,token,signal,previewFetch,actionFetch,readResponse,privateMarkers,correlationIds}){
  const endpoint=new URL(command.action?'/api/affairs-action':token?'/api/affairs-assistant':'/api/research-assistant',origin);
  const input=command.action??{question:command.query,route:command.route,stream:true,consentedResearchUse:false};
  const headers={'Content-Type':'application/json',Accept:command.action?'application/json':'text/event-stream'};
  if(token)headers.Authorization='Bearer '+token;
  const response=await (command.action?actionFetch:previewFetch)(endpoint,{method:'POST',body:JSON.stringify(input),headers,signal});
  const safe=fields=>privateMarkers.every(marker=>typeof marker!=='string'||!marker||!JSON.stringify(fields).includes(marker));
  if(command.action){
    const body=await readResponse(response,endpoint,4096,command.status);
    const masked=command.status===200?{...body,id:body?.id===command.action.payload.id?'[receipt selector]':body?.id}:body;
    check(safe(masked),'private-receipt-boundary');
    return {body,activity:[]};
  }
  const correlationId=token?response.headers.get('X-Assistant-Request-Id'):null;
  const safeStream=response.status===command.status&&!response.redirected&&(!response.url||response.url===endpoint.href)
    &&response.headers.get('content-type')?.split(';')[0]==='text/event-stream'
    &&(!token||uuid.test(correlationId??'')&&!correlationIds.has(correlationId));
  if(!safeStream){await response.body?.cancel();check(false,'assistant-stream-identity');}
  if(correlationId)correlationIds.add(correlationId);
  const envelope=await readReply(response),masked=structuredClone(envelope);
  const proposed=masked.body?.proposedAction;
  if(command.proposalSelector&&proposed?.payload?.id===command.proposalSelector){
    proposed.payload.id='[proposal selector]';
    if(proposed.url===command.route)proposed.url='[bound proposal route]';
  }
  check(safe(masked),'private-assistant-boundary');
  return {body:envelope.body,activity:envelope.events,...(correlationId?{correlationId}:{})};
}

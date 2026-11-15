import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {learningSupportPath} from '../../src/features/public/affairs/studentServices.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const kind='withdraw_learning_support',submitKind='submit_learning_support';
const times=['2024-11-18T16:40:00+00:00','2024-11-19T16:41:00+00:00','2024-11-20T16:42:00+00:00'];
const checks=['owner-count','owner-status','foreign-count','foreign-status','guest','ambiguous','held','foreign-proposal',
  'owner-proposal','foreign-confirm','stale-confirm','confirmed','replay','changed-replay','foreign-replay','owner-updated-status','foreign-unchanged',
  'submit-proposal','submit-confirmed','submit-replay','submit-changed-replay','submit-foreign-unchanged'];
export const learningSupportNativeCaseIds=Object.freeze(checks.map(name=>'learning-support:'+name));
const page=learningSupportPath;
const labels={submitted:'Submitted',in_review:'In site review',reviewed:'Site review complete',withdrawn:'Withdrawn'};
const clock=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'short'});
const digest=value=>createHash('sha256').update(JSON.stringify(value,(_name,item)=>
  item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort()):item)).digest('hex');
const ordered=(rows,key)=>[...rows].sort((a,b)=>key(a).localeCompare(key(b)));
export class LearningSupportPacketError extends Error{
  constructor(stage){super('Learning support evaluation failed at '+stage+'.');this.stage=stage;}
}
const check=(condition,stage)=>{if(!condition)throw new LearningSupportPacketError(stage);};
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));

export function learningSupportWithdrawalSnapshot(plan,raw,command){
  const target=plan.target,owner=plan.owners.A,payload=command?.payload;
  check(command?.kind===kind&&Object.keys(command).sort().join()==='kind,payload'
    &&payload&&Object.keys(payload).sort().join()==='expected_version,id,request_id'
    &&payload.id===target.id&&payload.expected_version===target.version&&uuid.test(payload.request_id)
    &&![plan.runId,plan.staleRequestId,...Object.values(plan.owners),...plan.rows.map(row=>row.id)].includes(payload.request_id),
    'journaled-withdrawal-binding');
  const changedRow=raw.rows.find(row=>row.id===target.id);
  const operation=raw.operations.find(row=>row.actor===owner&&row.request_id===payload.request_id);
  check(timestamp(changedRow?.updated_at)&&Date.parse(changedRow.updated_at)>Date.parse(target.updated_at)
    &&timestamp(operation?.occurred_at)&&Date.parse(operation.occurred_at)>Date.parse(target.updated_at)
    &&Date.parse(operation.occurred_at)<=Date.parse(changedRow.updated_at),'confirmed-row-and-operation-time');
  const version=target.version+1,receipt={id:target.id,requestId:payload.request_id,status:'withdrawn',version};
  return {rows:ordered(plan.rows.map(row=>row.id===target.id?{...row,status:'withdrawn',version,updated_at:changedRow.updated_at}:row),row=>row.id),
    operations:[{actor:owner,request_id:payload.request_id,target_id:target.id,kind:'withdraw',payload,result:receipt,occurred_at:operation.occurred_at}]};
}

function submissionFields(plan){
  return {topic:'QA confirmed support topic '+plan.runId,details:'QA request for help planning weekly study time '+plan.runId};
}

export function learningSupportSubmissionSnapshot(plan,raw,command,baseline){
  const owner=plan.owners.A,payload=command?.payload,fields=submissionFields(plan);
  const fixtureIds=[plan.runId,plan.staleRequestId,...Object.values(plan.owners),...plan.rows.map(row=>row.id)];
  const reserved=[...fixtureIds,...baseline.operations.map(row=>row.request_id)];
  check(uuid.test(payload?.request_id??'')&&!reserved.includes(payload.request_id)
    &&isDeepStrictEqual(command,{kind:submitKind,payload:{request_id:payload.request_id,...fields}}),'journaled-submission-binding');
  const created=raw.rows.filter(row=>!baseline.rows.some(original=>original.id===row.id));
  check(created.length===1,'confirmed-submission-cardinality');
  const {id,submitted_at}=created[0];
  const operation=raw.operations.find(row=>row.actor===owner&&row.request_id===payload.request_id);
  check(uuid.test(id)&&!reserved.includes(id)&&id!==payload.request_id&&timestamp(submitted_at)
    &&baseline.rows.every(row=>Date.parse(submitted_at)>=Date.parse(row.updated_at))
    &&operation?.occurred_at===submitted_at,'confirmed-submission-id-and-time');
  const request={id,user_id:owner,...fields,status:'submitted',review_note:'',version:1,submitted_at,updated_at:submitted_at};
  const result={id,requestId:payload.request_id,status:'submitted',version:1};
  const audit={actor:owner,request_id:payload.request_id,target_id:id,kind:'submit',payload,result,occurred_at:submitted_at};
  return {rows:ordered([...baseline.rows,request],row=>row.id),
    operations:ordered([...baseline.operations,audit],row=>row.actor+'/'+row.request_id)};
}

export function learningSupportNativeBaseline(plan){
  return {rows:ordered(plan.rows,row=>row.id),operations:[]};
}


export function buildLearningSupportNativePlan(runId,{A,B}){
  check([runId,A,B].every(value=>uuid.test(value))&&new Set([runId,A,B]).size===3,'fixture-identities');
  const request=(userId,field,status,version,index)=>({
    id:randomUUID(),user_id:userId,topic:'QA learning topic '+field+' '+runId,
    details:'QA notes for scheduling a study session '+field+' '+runId,
    status,review_note:version===1?'':'QA site review note '+field+' '+runId,
    version,submitted_at:times[index],updated_at:version===1?times[index]:'2024-11-20T16:43:00+00:00',
  });
  const target=request(A,'latest','in_review',2,2);
  const older=request(A,'older','submitted',1,0);
  const foreign=request(B,'foreign','submitted',1,1);
  return {runId,owners:{A,B},target,older,foreign,rows:[target,older,foreign],staleRequestId:randomUUID()};
}

/** Direct SQL evidence. This read never uses an assistant response or write receipt. */
export async function readLearningSupportNativeRows(sql,plan){
  const owners=Object.values(plan.owners),ids=plan.rows.map(row=>row.id);
  const [value]=await sql`select
    coalesce((select jsonb_agg(to_jsonb(row) order by row.id)
      from (select * from public.affairs_learning_support_requests
        where user_id in ${sql(owners)} or id in ${sql(ids)} limit 5) row),'[]'::jsonb) as rows,
    coalesce((select jsonb_agg(to_jsonb(operation) order by operation.actor,operation.request_id)
      from (select * from private.affairs_learning_support_operations
        where actor in ${sql(owners)} or target_id in ${sql(ids)}
          or target_id in (select id from public.affairs_learning_support_requests where user_id in ${sql(owners)})
        limit 3) operation),'[]'::jsonb) as operations`;
  check(Array.isArray(value?.rows)&&Array.isArray(value?.operations),'raw-database-shape');
  return value;
}

function verifyNativeRowScope(view,raw,owner){
  const rows=raw.rows.filter(row=>row.user_id===owner).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)||a.id.localeCompare(b.id));
  const dto=rows.map(row=>({id:row.id,ownerId:row.user_id,topic:row.topic,details:row.details,status:row.status,reviewNote:row.review_note,
    version:row.version,submittedAt:row.submitted_at,updatedAt:row.updated_at}));
  check(view?.status===200&&isDeepStrictEqual(view.body,{userId:owner,canReview:false,view:'mine',page:1,total:rows.length,rows:dto}),
    'caller-owned-native-page');
  return rows;
}

const countQuestion='How many saved learning support requests do I have?';
const statusQuestion='What is the status of my learning support request?';
const selectQuestion='Withdraw my learning support request.';
const requestById=id=>'Withdraw my learning support request with ID '+id+'.';

export async function verifyLearningSupportNativePacket({plan,readRaw,readNative,ask,confirm,markWithdrawal,markSubmission,onResult}){
  const owner=plan.owners.A,other=plan.owners.B,target=plan.target;
  const baseline=await readRaw();
  check(isDeepStrictEqual(baseline,learningSupportNativeBaseline(plan)),'independent-owner-fixture-baseline');
  let expected=baseline,command;
  const results=[],correlations=new Set(),fields=submissionFields(plan);
  const privateValues=[owner,other,plan.runId,plan.staleRequestId,...Object.values(fields),...plan.rows.flatMap(row=>[row.id,row.topic,row.details,row.review_note])].filter(Boolean);
  const observe=async stage=>{
    const raw=await readRaw();
    check(isDeepStrictEqual(raw,expected),stage+'-exact-raw-state');
    const nativeA=verifyNativeRowScope(await readNative('A'),raw,owner);
    const nativeB=verifyNativeRowScope(await readNative('B'),raw,other);
    return {raw,nativeA,nativeB};
  };
  async function grade(stage,{actor,query,action,status=200,mutation},verify){
    const caseId='learning-support:'+stage;
    check(caseId===learningSupportNativeCaseIds[results.length],'case-order');
    const before=await observe(stage+'-before');
    const reply=action?await confirm(actor,action):await ask(actor,query,page);
    check(reply?.status===status,stage+'-http-status');
    const {body,correlationId,activity}=reply;
    if(!action&&actor!=='guest'){
      check(uuid.test(correlationId??'')&&!correlations.has(correlationId),stage+'-request-correlation');
      correlations.add(correlationId);
    }
    if(mutation)expected=mutation(await readRaw(),expected);
    check(verify(body,activity??[],before,expected),stage+'-answer-or-receipt');
    const masked=structuredClone({body,activity});
    if(stage==='owner-proposal')masked.body.proposedAction.payload.id='[validated selector]';
    if(stage==='submit-proposal')masked.body.proposedAction.payload='[validated submission fields]';
    if(action&&status===200)masked.body.id='[validated receipt]';
    if(stage==='submit-confirmed')privateValues.push(body.id);
    const serialized=JSON.stringify(masked);
    check(privateValues.every(value=>!serialized.includes(value)),stage+'-privacy');
    const after=await observe(stage+'-after');
    if(stage.startsWith('submit-'))
      check(isDeepStrictEqual(before.nativeB,after.nativeB),stage+'-other-caller-unchanged');
    const row={caseId,passed:true,before:digest(before),after:digest(after),request:digest(action??{query,page}),
      ...(action&&status===200?{receipt:digest(body)}:{})};
    check((row.before!==row.after)===Boolean(mutation),stage+'-change-cardinality');
    results.push(row);await onResult?.(row);return body;
  }

  const checkedRows=activity=>activity.some(step=>step.kind==='account-read:learningSupport:1'&&step.status==='complete');
  const savedAnswer=(side,withStatus)=> (body,activity,before)=>{
    const rows=side==='A'?before.nativeA:before.nativeB;
    const summary='Saved learning support requests: '+rows.length+'.';
    const latest=rows[0];
    const fact=withStatus?'Most recently updated request: '+labels[latest.status]+' · '+clock.format(new Date(latest.updated_at))+' (Taipei).'
      +(rows.length>1?' '+summary:''):summary;
    return body?.status==='answered'&&body.grounding?.source==='account'&&body.grounding.webSearched===false
      &&isDeepStrictEqual(body.verification,{status:'verified',attempts:1})&&!body.proposedAction
      &&body.answer===fact+'\n\n[Open learning support requests]('+page+')'
      &&isDeepStrictEqual(body.citations?.map(citation=>citation.url),[page])
      &&checkedRows(activity);
  };
  const clarify=body=>body?.status==='clarification'&&!body.proposedAction;
  const deny=body=>isDeepStrictEqual(Object.keys(body??{}),['error'])&&typeof body.error==='string'&&body.error.length>0;
  await grade('owner-count',{actor:'A',query:countQuestion},savedAnswer('A',false));
  await grade('owner-status',{actor:'A',query:statusQuestion},savedAnswer('A',true));
  await grade('foreign-count',{actor:'B',query:countQuestion},savedAnswer('B',false));
  await grade('foreign-status',{actor:'B',query:statusQuestion},savedAnswer('B',true));
  await grade('guest',{actor:'guest',query:selectQuestion},(body,activity)=>body?.status==='handoff'&&!body.proposedAction
    &&activity.every(step=>!String(step.kind).startsWith('account-read:'))
    &&isDeepStrictEqual(body.citations?.map(citation=>citation.url),['/school-affairs/login?next='+encodeURIComponent(page)]));
  await grade('ambiguous',{actor:'A',query:selectQuestion},(body,activity)=>clarify(body)&&checkedRows(activity));
  await grade('held',{actor:'A',query:'Do not withdraw my learning support request.'},(body,activity)=>clarify(body)
    &&activity.every(step=>!String(step.kind).startsWith('account-read:')));
  await grade('foreign-proposal',{actor:'B',query:requestById(target.id)},(body,activity)=>clarify(body)&&checkedRows(activity));
  const proposed=await grade('owner-proposal',{actor:'A',query:'Withdraw my latest learning support request.'},(body,activity)=>{
    const action=body?.proposedAction;
    return body?.status==='answered'&&body.grounding?.source==='account'&&body.grounding.webSearched===false
      &&isDeepStrictEqual(body.verification,{status:'verified',attempts:1})&&uuid.test(action?.requestId??'')
      &&!privateValues.includes(action.requestId)&&isDeepStrictEqual(action,{
        kind,label:'Withdraw learning support request '+target.id.slice(0,8).toUpperCase()+' · Submitted 2024-11-21',
        payload:{id:target.id,expected_version:'2'},requestId:action.requestId,url:page,
      })&&checkedRows(activity);
  });
  command={kind,payload:{id:target.id,expected_version:2,request_id:proposed.proposedAction.requestId}};
  await markWithdrawal?.(structuredClone(command));
  const stale={kind,payload:{...command.payload,expected_version:1,request_id:plan.staleRequestId}};
  const receipt={id:target.id,requestId:command.payload.request_id,status:'withdrawn',version:3};
  const exactReceipt=body=>isDeepStrictEqual(body,receipt);
  await grade('foreign-confirm',{actor:'B',action:command,status:404},deny);
  await grade('stale-confirm',{actor:'A',action:stale,status:409},deny);
  await grade('confirmed',{actor:'A',action:command,mutation:raw=>learningSupportWithdrawalSnapshot(plan,raw,command)},exactReceipt);
  await grade('replay',{actor:'A',action:command},exactReceipt);
  await grade('changed-replay',{actor:'A',action:{kind,payload:{...command.payload,expected_version:1}},status:409},deny);
  await grade('foreign-replay',{actor:'B',action:command,status:404},deny);
  await grade('owner-updated-status',{actor:'A',query:statusQuestion},savedAnswer('A',true));
  await grade('foreign-unchanged',{actor:'B',query:statusQuestion},savedAnswer('B',true));
  const submitQuestion='Submit a learning support request titled "'+fields.topic+'" with details "'+fields.details+'".';
  const submission=await grade('submit-proposal',{actor:'A',query:submitQuestion},(body,activity)=>{
    const action=body?.proposedAction;
    return body?.status==='answered'&&body.grounding?.source==='account'&&body.grounding.webSearched===false
      &&isDeepStrictEqual(body.verification,{status:'verified',attempts:1})&&uuid.test(action?.requestId??'')
      &&![command.payload.request_id,...privateValues].includes(action.requestId)
      &&isDeepStrictEqual(action,{kind:submitKind,label:'Submit learning support request',payload:fields,requestId:action.requestId,url:page})
      &&isDeepStrictEqual(body.citations?.map(citation=>citation.url),[page])
      &&activity.some(step=>step.kind==='action-context:1'&&step.status==='complete')
      &&activity.every(step=>!String(step.kind).startsWith('account-read:'));
  });
  const submit={kind:submitKind,payload:{request_id:submission.proposedAction.requestId,...fields}};
  check(typeof markSubmission==='function','submission-journal-required');
  await markSubmission(structuredClone(submit));
  const exactSubmitReceipt=(body,_activity,_before,state)=>isDeepStrictEqual(body,
    state.operations.find(row=>row.actor===owner&&row.request_id===submit.payload.request_id)?.result);
  await grade('submit-confirmed',{actor:'A',action:submit,
    mutation:(raw,state)=>learningSupportSubmissionSnapshot(plan,raw,submit,state)},exactSubmitReceipt);
  await grade('submit-replay',{actor:'A',action:submit},exactSubmitReceipt);
  const changedSubmit={...submit,payload:{...submit.payload,details:fields.details+' revised'}};
  await grade('submit-changed-replay',{actor:'A',action:changedSubmit,status:409},deny);
  await grade('submit-foreign-unchanged',{actor:'B',query:statusQuestion},savedAnswer('B',true));
  return {passed:true,cases:results};
}

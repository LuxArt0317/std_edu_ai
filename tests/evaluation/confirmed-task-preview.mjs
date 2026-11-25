import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {isConversationId} from '../../src/services/assistantConversationId.js';
import {isTaskFixtureTitle} from './vercel-preview-transport.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid=value=>isConversationId(value)&&value[14]==='4';
const verified=body=>body?.verification?.status==='verified'&&body.verification.attempts>=1;
const requireCheck=(condition,step)=>{
  if(!condition)throw new Error('Confirmed task Preview failed at '+step+'.');
};

// Direct SQL readback is independent of both assistant and action API results.
// Restrict every query to the exact disposable owners reserved by the caller.
export async function readConfirmedTaskRows(sql,owners){
  if(!Array.isArray(owners)||owners.length!==2||!owners.every(uuid)||owners[0]===owners[1])
    throw new TypeError('Two distinct disposable task owners are required.');
  const [row]=await sql`select jsonb_build_object(
    'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.affairs_tasks t where user_id in ${sql(owners)}),'[]'::jsonb),
    'audits',coalesce((select jsonb_agg(to_jsonb(a) order by id) from public.affairs_agent_audit a where user_id in ${sql(owners)}),'[]'::jsonb),
    'receipts',coalesce((select jsonb_agg(to_jsonb(r) order by user_id,request_id) from private.affairs_assistant_operations r where user_id in ${sql(owners)}),'[]'::jsonb)
  ) as snapshot`;
  return row?.snapshot;
}

function getProposal(response,kind,payload,step){
  const {body,status,correlationId}=response??{};
  const proposal=body?.proposedAction;
  requireCheck(status===200&&uuid(correlationId)&&body?.status==='answered'&&verified(body)
    &&proposal?.kind===kind&&uuid(proposal.requestId)&&isDeepStrictEqual(proposal.payload,payload),step);
  return {kind,requestId:proposal.requestId,payload};
}

function checkReceipt(response,kind,id,summary,step){
  const {status,body}=response??{};
  requireCheck(status===200&&isDeepStrictEqual(body,{id,kind,summary})&&uuid(id),step);
  return body;
}

function checkRows(snapshot,baseline,owner,task,title,operations,complete,step){
  const {audits,receipts}=snapshot;
  const unchanged=snapshot.tasks.filter(row=>row.id!==task);
  const tasks=snapshot.tasks.filter(row=>row.id===task);
  requireCheck(isDeepStrictEqual(unchanged,baseline.tasks),step);
  requireCheck(tasks.length===1&&audits.length===operations.length&&receipts.length===operations.length,step);
  const row=tasks[0];
  requireCheck(row.id===task&&row.user_id===owner&&row.title===title&&row.source_mode==='site'&&row.due_at===null
    &&(complete?typeof row.completed_at==='string'&&Number.isFinite(Date.parse(row.completed_at)):row.completed_at===null),step);
  for(const [command,receipt] of operations){
    requireCheck(audits.filter(a=>a.user_id===owner&&a.action_kind===command.kind&&a.target_id===task&&a.summary===receipt.summary).length===1,step);
    const saved=receipts.find(r=>r.user_id===owner&&r.request_id===command.requestId);
    requireCheck(saved?.kind===command.kind&&isDeepStrictEqual(saved.payload,command.payload)&&isDeepStrictEqual(saved.result,receipt),step);
  }
}

/** Exercises the deployed API. The operator submits the same command that the
 * controlled browser exercises only after its Confirm action click. */
export async function checkConfirmedTaskRoundTrip({owners,title,read,propose,submit}){
  requireCheck(isTaskFixtureTitle(title)&&!title.endsWith(' revised')&&Array.isArray(owners)&&owners.length===2
    &&owners.every(uuid)&&owners[0]!==owners[1],'fixture identity');
  const readout=[];
  const observe=async step=>{const state=await read();readout.push({step,digest:digest(state)});return state;};
  const unchanged=async (expected,step)=>requireCheck(isDeepStrictEqual(await observe(step),expected),step);
  const initial=await observe('baseline');
  requireCheck(initial?.tasks?.every(row=>owners.includes(row.user_id)&&row.source_mode==='sample'&&row.title!==title)
    &&isDeepStrictEqual(initial.audits,[])&&isDeepStrictEqual(initial.receipts,[]),'disposable baseline');
  const creation=await propose('A',`Create a task titled "${title}".`);
  const create=getProposal(creation,'create_task',{title},'verified creation proposal');
  await unchanged(initial,'creation proposal produced no write');
  const created=await submit('A',create,'confirm creation');
  const task=created?.body?.id;
  const creationReceipt=checkReceipt(created,'create_task',task,`Created task: ${title}`,'creation receipt');
  const opened=await observe('saved open task');
  checkRows(opened,initial,owners[0],task,title,[[create,creationReceipt]],false,'one open task with one audit and receipt');
  requireCheck(isDeepStrictEqual(await submit('A',create,'replay creation'),created),'identical creation replay');
  await unchanged(opened,'creation replay produced no duplicate');
  const changed=await submit('A',{...create,payload:{title:title+' revised'}},'reject changed replay');
  requireCheck(changed.status===409,'changed replay conflict');
  await unchanged(opened,'changed replay produced no write');

  const question=`Complete my task "${title}".`;
  const crossed=await propose('B',question);
  requireCheck(crossed.status===200&&uuid(crossed.correlationId)&&crossed.correlationId!==creation.correlationId
    &&crossed.body?.status==='clarification'&&verified(crossed.body)&&!crossed.body.proposedAction,'other account proposal denied');
  const completion=await propose('A',question);
  const complete=getProposal(completion,'complete_task',{task_id:task},'verified completion proposal');
  requireCheck(create.requestId!==complete.requestId&&![creation.correlationId,crossed.correlationId].includes(completion.correlationId),
    'separate proposals');
  await unchanged(opened,'completion proposals produced no write');
  const denied=await submit('B',complete,'deny completion by other owner');
  requireCheck(denied.status===400&&!denied.body?.id,'open task owner boundary');
  await unchanged(opened,'other owner produced no write');
  const completed=await submit('A',complete,'confirm completion');
  const completionReceipt=checkReceipt(completed,'complete_task',task,`Completed task: ${title}`,'completion receipt');
  const closed=await observe('saved completed task');
  checkRows(closed,initial,owners[0],task,title,[[create,creationReceipt],[complete,completionReceipt]],true,'one completion with its own audit and receipt');
  requireCheck(isDeepStrictEqual(await submit('A',complete,'replay completion'),completed),'identical completion replay');
  await unchanged(closed,'completion replay preserved the original timestamp');
  const privateReceipt=await submit('B',complete,'deny other owner receipt replay');
  requireCheck(privateReceipt.status===400&&!privateReceipt.body?.id,'completed receipt owner boundary');
  await unchanged(closed,'other owner replay produced no write');
  return {passed:true,proposalsChecked:3,actionRequestsChecked:7,readout};
}

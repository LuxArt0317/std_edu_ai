import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {internshipObservationDigest as digest} from '../../server/internshipObservation.js';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {gradeCase} from './grading.mjs';

export const confirmedAssignmentTrackerMode='confirmed-assignment-tracker';
const canonicalProposal=buildAccountCases().find(row=>row.id==='account:action-tracker');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
const kind='set_assignment_status',title='Index plan',stamp='2026-11-14T08:00:00.000Z';
const stages={confirm:'confirm personal tracker',replay:'replay exact tracker receipt'};
export class ConfirmedAssignmentTrackerAssertion extends Error{
  constructor(step){
    super('Confirmed assignment tracker failed at '+step+'.');
    this.step=step;
  }
}
const verify=(condition,step)=>{if(!condition)throw new ConfirmedAssignmentTrackerAssertion(step);};
const sorted=rows=>rows.slice().sort((a,b)=>a.id.localeCompare(b.id));

export function confirmedAssignmentTrackerPlan(runId,owners,students){
  const binding=validateAidPaymentFixtureOwners({runId,owners});
  verify(students&&Object.keys(students).sort().join(',')==='A,B'&&Object.values(students).every(uuid)
    &&new Set([runId,owners.A.id,owners.B.id,students.A,students.B]).size===5,'fixture owners');
  const id=label=>{
    const hash=digest(['confirmed-assignment-tracker-v1',runId,label]);
    return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  };
  const course=(key,role,source_mode)=>({id:id(key),user_id:owners[role].id,code:'QA-'+key,title:'QA tracker '+key,
    term:'115-1',role:'student',source_mode,created_at:stamp});
  const own=course('own-course','A','personal'),sample=course('sample-course','A','sample'),other=course('other-course','B','personal');
  const assignment=(key,course,role,name,status)=>({id:id(key),student_id:students[role],enrollment_id:null,dtm_course_id:course.id,
    title:name,details:'Synthetic personal tracker fixture',meeting_id:null,import_key:null,due_at:'2026-11-30T08:00:00.000Z',status,
    submitted_at:status==='open'?null:stamp,source_mode:course.source_mode,updated_at:stamp});
  const assignments=[assignment('target',own,'A',title,'open'),assignment('sample',sample,'A','Sample worksheet','open'),
    assignment('graded',own,'A','Graded worksheet','graded'),assignment('other',other,'B','Other saved worksheet','submitted')];
  const courses=[own,sample,other],ids=[...courses,...assignments].map(row=>row.id);
  verify(new Set([...ids,runId,owners.A.id,owners.B.id,students.A,students.B]).size===12,'reserved record identifiers');
  return {...binding,students:{...students},courses:sorted(courses),assignments:sorted(assignments),targets:{own:assignments[0].id,
    sample:assignments[1].id,graded:assignments[2].id,other:assignments[3].id}};
}

function checkPlan(plan){
  verify(same(plan,confirmedAssignmentTrackerPlan(plan.runId,plan.owners,plan.students)),'immutable fixture plan');
}

export async function assertConfirmedAssignmentTrackerSchema(sql){
  const [row]=await sql`select exists(select 1 from supabase_migrations.schema_migrations where version='20261112120000')
    and coalesce(has_function_privilege('authenticated',to_regprocedure('public.affairs_reviewed_action(uuid,text,jsonb)'),'EXECUTE'),false)
    and not exists(select 1 from unnest(array['public.dtm_grade_reports','public.dtm_grade_items','public.dtm_assignment_submissions',
      'public.dtm_submission_reviews','private.dtm_submission_uploads','private.dtm_submission_operations','private.dtm_submission_cleanup',
      'storage.objects']) required(name) where to_regclass(name) is null) as ready`;
  verify(row?.ready===true,'applied reviewed action and Moodle scopes');
}

const normalize=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value!==null&&/^(?:due|submitted|created|updated)_at$/u.test(key)?new Date(value).toISOString():value]));
function idsFor(plan){return {owners:Object.values(plan.owners).map(owner=>owner.id),students:Object.values(plan.students),
  courses:plan.courses.map(row=>row.id),assignments:plan.assignments.map(row=>row.id)};}

export async function readConfirmedAssignmentTrackerRows(sql,plan,{lock=false}={}){
  checkPlan(plan);
  const ids=idsFor(plan);
  if(lock){
    await sql`select id from public.affairs_students where id in ${sql(ids.students)} order by id for update`;
    await sql`select id from public.dtm_courses where id in ${sql(ids.courses)} or user_id in ${sql(ids.owners)} order by id for update`;
    await sql`select id from public.affairs_assignments where id in ${sql(ids.assignments)} or (student_id in ${sql(ids.students)} and dtm_course_id is not null) order by id for update`;
  }
  const assignments=await sql`select id,student_id,enrollment_id,dtm_course_id,title,details,meeting_id,import_key,due_at,status,submitted_at,source_mode,updated_at
    from public.affairs_assignments where id in ${sql(ids.assignments)} or (student_id in ${sql(ids.students)} and dtm_course_id is not null) order by id limit 5`;
  const courses=await sql`select id,user_id,code,title,term,role,source_mode,created_at from public.dtm_courses
    where id in ${sql(ids.courses)} or user_id in ${sql(ids.owners)} order by id limit 4`;
  const audits=await sql`select id,user_id,action_kind,target_id,summary,created_at from public.affairs_agent_audit
    where user_id in ${sql(ids.owners)} or target_id in ${sql(ids.assignments)} order by id limit 2`;
  const receipts=await sql`select user_id,request_id,kind,payload,result,created_at from private.affairs_assistant_operations
    where user_id in ${sql(ids.owners)} or payload->>'id' in ${sql(ids.assignments)} order by request_id limit 2`;
  const [guard]=await sql`select
    exists(select 1 from public.dtm_assignment_submissions where user_id in ${sql(ids.owners)} or assignment_id in ${sql(ids.assignments)}) as files,
    exists(select 1 from public.dtm_submission_reviews where user_id in ${sql(ids.owners)}) as reviews,
    exists(select 1 from private.dtm_submission_uploads where user_id in ${sql(ids.owners)}) as uploads,
    exists(select 1 from private.dtm_submission_operations where user_id in ${sql(ids.owners)}) as submission_operations,
    exists(select 1 from private.dtm_submission_cleanup where user_id in ${sql(ids.owners)}) as submission_cleanup,
    exists(select 1 from public.dtm_grade_reports where user_id in ${sql(ids.owners)} or course_id in ${sql(ids.courses)}) as reports,
    exists(select 1 from public.dtm_grade_items where course_id in ${sql(ids.courses)}) as grade_items,
    exists(select 1 from storage.objects where bucket_id='dtm-submissions' and split_part(name,'/',1) in ${sql(ids.owners)}) as storage_objects`;
  verify(guard&&Object.values(guard).every(value=>value===false),'isolated tracker without files or grades');
  return {assignments:assignments.map(normalize),courses:courses.map(normalize),audits:audits.map(normalize),receipts:receipts.map(normalize)};
}

const empty={assignments:[],courses:[],audits:[],receipts:[]};
const baseline=plan=>({...empty,assignments:plan.assignments,courses:plan.courses});
const originalPayload=plan=>({id:plan.targets.own,status:'submitted',expected_status:'open'});
const expectedReceipt=plan=>({id:plan.targets.own,kind,
  summary:'Updated your personal DTM assignment tracker to submitted; no university submission was made'});
const proposalQuestion=name=>`Mark my personal assignment ${name} as submitted.`;

async function verifyOwnerBindings(sql,plan){
  const ids=idsFor(plan);
  const users=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as "runMarker",
    email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google') as google
    from auth.users u where id in ${sql(ids.owners)} limit 3`;
  const students=await sql`select id,user_id from public.affairs_students
    where id in ${sql(ids.students)} or user_id in ${sql(ids.owners)} limit 3`;
  verify(users.length===2&&students.length===2&&['A','B'].every(role=>{
    const owner=plan.owners[role];
    return users.some(({google,...row})=>google===true&&same(row,owner))
      &&students.some(row=>row.id===plan.students[role]&&row.user_id===owner.id);
  }),'two reserved Google callers');
}

export async function seedConfirmedAssignmentTrackerRows(sql,plan){
  await verifyOwnerBindings(sql,plan);
  verify(same(await readConfirmedAssignmentTrackerRows(sql,plan,{lock:true}),empty),'empty fixture targets');
  await sql`insert into public.dtm_courses ${sql(plan.courses)}`;
  await sql`insert into public.affairs_assignments ${sql(plan.assignments)}`;
  verify(same(await readConfirmedAssignmentTrackerRows(sql,plan),baseline(plan)),'exact committed seed');
}

function assertMutation(state,plan,requestId){
  const fixture=baseline(plan),owns=plan.owners.A.id,target=state.assignments.find(row=>row.id===plan.targets.own);
  const {submitted_at,updated_at,...unchanged}=target??{},old=fixture.assignments.find(row=>row.id===plan.targets.own);
  verify(target&&same({...unchanged,submitted_at:null,updated_at:old.updated_at,status:'open'},old)&&target.status==='submitted'
    &&typeof submitted_at==='string'&&Number.isFinite(Date.parse(submitted_at))&&submitted_at===updated_at
    &&same(state.assignments.filter(row=>row.id!==target.id),fixture.assignments.filter(row=>row.id!==target.id))
    &&same(state.courses,fixture.courses),'one owned tracker status and timestamp');
  verify(state.audits.length===1&&state.receipts.length===1,'single audit and receipt');
  const [audit]=state.audits,[receipt]=state.receipts,expected=expectedReceipt(plan);
  verify(audit.user_id===owns&&audit.action_kind===kind&&audit.target_id===target.id&&audit.summary===expected.summary
    &&audit.created_at===submitted_at&&receipt.created_at===submitted_at
    &&receipt.user_id===owns&&receipt.request_id===requestId&&receipt.kind===kind&&same(receipt.payload,originalPayload(plan))
    &&same(receipt.result,expected),'exact owner receipt and audit');
}

export async function deleteConfirmedAssignmentTrackerRows(sql,plan,journal){
  await verifyOwnerBindings(sql,plan);
  const state=await readConfirmedAssignmentTrackerRows(sql,plan,{lock:true});
  if(same(state,empty))return;
  if(!same(state,baseline(plan))){
    const allowed=journal.find(row=>row.stage===stages.confirm&&row.userId===plan.owners.A.id&&row.kind===kind
      &&row.payloadDigest===digest(originalPayload(plan))&&uuid(row.requestId));
    verify(allowed,'journaled confirmation required for altered rows');
    assertMutation(state,plan,allowed.requestId);
    await sql`delete from private.affairs_assistant_operations where user_id=${allowed.userId} and request_id=${allowed.requestId} and kind=${kind}`;
    await sql`delete from public.affairs_agent_audit where id=${state.audits[0].id} and user_id=${allowed.userId} and target_id=${plan.targets.own}`;
  }
  const ids=idsFor(plan);
  await sql`delete from public.affairs_assignments where id in ${sql(ids.assignments)} and student_id in ${sql(ids.students)}`;
  await sql`delete from public.dtm_courses where id in ${sql(ids.courses)} and user_id in ${sql(ids.owners)}`;
  verify(same(await readConfirmedAssignmentTrackerRows(sql,plan),empty),'exact owned tracker disposal');
}

export async function verifyConfirmedAssignmentTrackerAbsent(sql,plan){
  verify(same(await readConfirmedAssignmentTrackerRows(sql,plan),empty),'tracker cleanup remained empty');
  const ids=idsFor(plan);
  const [identities]=await sql`select exists(select 1 from auth.users where id in ${sql(ids.owners)})
    or exists(select 1 from auth.identities where user_id in ${sql(ids.owners)})
    or exists(select 1 from auth.sessions where user_id in ${sql(ids.owners)}) as remains`;
  verify(identities?.remains===false,'exact disposable tracker identity cleanup');
}

export async function observeConfirmedAssignmentTrackerCallers(plan,users,state,{origin,publishable,fetchImpl,readResponse,signal}){
  const ids=idsFor(plan);
  verify(users.length===2&&new Set(users.map(user=>user.token)).size===2,'independent paired caller sessions');
  const reads=[];
  for(const role of ['A','B']){
    const owner=plan.owners[role].id,student=plan.students[role],token=users.find(user=>user.id===owner)?.token;
    verify(token,'paired caller JWT');
    const headers={apikey:publishable,Authorization:'Bearer '+token};
    const expected={dtm_courses:state.courses.filter(row=>row.user_id===owner),affairs_assignments:state.assignments.filter(row=>row.student_id===student)};
    for(const [table,filter,allowed] of [['dtm_courses',{user_id:`in.(${ids.owners.join(',')})`},plan.courses],
      ['affairs_assignments',{student_id:`in.(${ids.students.join(',')})`,dtm_course_id:'not.is.null'},plan.assignments]]){
      const url=new URL('/rest/v1/'+table,origin);
      url.search=new URLSearchParams({select:Object.keys(allowed[0]).join(','),...filter,order:'id.asc',limit:'5'});
      const response=await readResponse(await fetchImpl(url,{method:'GET',headers,signal,credentials:'omit',redirect:'error'}),url,8192,200);
      verify(Array.isArray(response)&&same(response.map(normalize),expected[table]),'paired owned and crossed tracker readbacks');
      reads.push({role,table,digest:digest(response.map(normalize))});
    }
  }
  return reads;
}

export async function checkConfirmedAssignmentTrackerRoundTrip({plan,read,propose,submit,newRequestId=randomUUID}){
  checkPlan(plan);
  const readout=[],correlations=new Set();
  let proposalsChecked=0,actionRequestsChecked=0;
  const observe=async step=>{
    const {state,callers}=await read();
    verify(Array.isArray(callers)&&callers.length===4,'independent paired callers');
    readout.push({step,digest:digest(state),callers});return state;
  };
  const unchanged=async(state,step)=>verify(same(await observe(step),state),step);
  const ask=async(role,question,step)=>{
    const {status,body,correlationId}=await propose(role,question);proposalsChecked++;
    verify(status===200&&uuid(correlationId)&&!correlations.has(correlationId)&&body?.verification?.status==='verified'
      &&body.grounding?.source==='account'&&body.grounding.webSearched===false&&!body.views?.length,step);
    correlations.add(correlationId);
    return body;
  };
  const perform=async(role,body,step)=>{actionRequestsChecked++;return submit(role,body,step);};
  const deny=async(role,body,status,state,step)=>{
    const result=await perform(role,body,step);
    verify(result.status===status&&!result.body?.id&&typeof result.body?.error==='string',step);
    await unchanged(state,step);
  };
  const initial=await observe('baseline');
  verify(same(initial,baseline(plan)),'exact initial tracker rows');
  const question=confirmedAssignmentTrackerContract.question,body=await ask('A',question,'verified personal tracker proposal'),proposal=body.proposedAction;
  const ownCourse=plan.assignments.find(row=>row.id===plan.targets.own).dtm_course_id;
  verify(body.status==='answered'&&proposal?.kind===kind&&uuid(proposal.requestId)&&same(proposal.payload,originalPayload(plan))
    &&proposal.url===`/dtm/course/${ownCourse}/assignments`&&/personal tracker/u.test(body.answer)&&/submit coursework separately/u.test(body.answer),
  'proposal remains a personal tracker change');
  const afterProposal=await observe('proposal produced no write');
  const proposalCase={...canonicalProposal,executionContract:'live-native',
    expected:{...canonicalProposal.expected,action:{...canonicalProposal.expected.action,payload:originalPayload(plan)}}};
  const proposalGrade=gradeCase(proposalCase,{body,statusCode:200,fixtureKey:proposalCase.fixtureKey,execution:'live-native',
    events:body.activity,stateBefore:initial,stateAfterProposal:afterProposal});
  verify(proposalGrade.passed,'frozen proposal grade '+proposalGrade.failures.map(row=>row.id).join(', '));
  const editable='I can change the tracker status of your own editable DTM assignments.';
  for(const [role,prompt,expected,step] of [
    ['B',question,'Which personal assignment tracker in stu.best should I update? Please give its exact title.','crossed tracker'],
    ['A',proposalQuestion('Sample worksheet'),editable,'sample tracker'],
    ['A',proposalQuestion('Graded worksheet'),editable,'graded tracker'],
    ['B',proposalQuestion('Other saved worksheet'),'Your stu.best assignment tracker already has that status.','already submitted tracker'],
  ]){
    const response=await ask(role,prompt,step);
    verify(response.status==='clarification'&&!response.proposedAction&&response.answer===expected&&response.citations?.length===0,step);
    await unchanged(initial,step+' clarification produced no write');
  }
  const command={kind,requestId:proposal.requestId,payload:proposal.payload};
  await deny('B',command,403,initial,'crossed confirmation denied');
  await deny('A',{...command,requestId:newRequestId(),payload:{...command.payload,id:plan.targets.sample}},403,initial,'sample confirmation denied');
  await deny('A',{...command,requestId:newRequestId(),payload:{id:plan.targets.graded,status:'submitted',expected_status:'graded'}},409,initial,'graded confirmation denied');
  const confirmed=await perform('A',command,stages.confirm);
  verify(confirmed.status===200&&same(confirmed.body,expectedReceipt(plan)),'exact confirmation receipt');
  const changed=await observe('one confirmed tracker change');
  assertMutation(changed,plan,command.requestId);
  verify(same(await perform('A',command,stages.replay),confirmed),'exact receipt replay');
  await unchanged(changed,'replay preserves the timestamp, audit and receipt');
  await deny('A',{...command,payload:{id:plan.targets.own,status:'open',expected_status:'submitted'}},409,changed,'changed payload on same receipt denied');
  await deny('A',{...command,requestId:newRequestId()},409,changed,'fresh stale confirmation denied');
  await deny('B',command,403,changed,'crossed receipt replay denied');
  return {passed:true,proposalsChecked,actionRequestsChecked,proposalChecks:proposalGrade.checks,correlationIds:[...correlations],readout};
}

export const confirmedAssignmentTrackerDigest=digest;
export const confirmedAssignmentTrackerContract=Object.freeze({
  caseId:canonicalProposal.id,route:canonicalProposal.route,question:canonicalProposal.question,
  proposals:5,confirmationRequests:8,changes:'one personal tracker status and timestamp, one audit, one receipt',
  independentScopes:'two isolated Google callers, with file submission, storage and grades checked separately',
});

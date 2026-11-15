import {isDeepStrictEqual} from 'node:util';
import {internshipObservationDigest} from '../../server/internshipObservation.js';
import {buildInternshipNativeCases,internshipNativeFixtureForCase} from './internship-native-cases.mjs';

const tuitionCase=buildInternshipNativeCases().find(row=>row.id==='account:internship-native-fees');
const [tuition]=internshipNativeFixtureForCase(tuitionCase).companion.records;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles=['A','B'];
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const chargeFields=['id','student_id','label','amount_due','amount_paid','currency','due_on','source_mode','occurrence_on',
  'category','contact_unit','contact_extension','payment_unit'];
const fail=stage=>{throw new Error('Internship charge fixture: '+stage+'.');};
const order=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
const date=value=>value instanceof Date?value.toISOString().slice(0,10):value;
const normalizeCharge=row=>({...row,amount_due:Number(row.amount_due),amount_paid:Number(row.amount_paid),
  due_on:date(row.due_on),occurrence_on:date(row.occurrence_on)});
const digest=internshipObservationDigest;

export function buildInternshipChargeFixture({runId,owners,programId}){
  if(![runId,owners?.A,owners?.B,programId].every(value=>uuid.test(value??''))
    ||new Set([runId,owners.A,owners.B,programId]).size!==4)fail('invalid identities or sample program');
  const id=suffix=>runId.slice(0,24)+'000000000'+suffix;
  const students=roles.map((role,index)=>({
    id:id(611+index),user_id:owners[role],student_number:'EVAL-'+id(611+index),full_name:'Evaluation Internship Student '+role,
    program_id:programId,year_level:1,status:'active',source_mode:'sample',
  }));
  const charges=students.map((student,index)=>({
    id:id(621+index),student_id:student.id,label:index?'QA foreign Internship Tuition control':tuition.label,
    amount_due:index?11850:tuition.remaining+5000,amount_paid:index?1850:5000,currency:tuition.currency,
    due_on:null,source_mode:'sample',occurrence_on:null,category:null,contact_unit:null,contact_extension:null,payment_unit:null,
  }));
  const recordIds=[...students,...charges].map(row=>row.id);
  if(recordIds.some(value=>[runId,owners.A,owners.B,programId].includes(value)))fail('reserved identity collision');
  return {runId,owners:{...owners},programId,students,charges,recordIds};
}

function checked(plan){
  const rebuilt=buildInternshipChargeFixture(plan);
  if(!isDeepStrictEqual(plan,rebuilt))fail('invalid fixture plan');
  return rebuilt;
}
async function readState(sql,plan){
  const studentIds=plan.students.map(row=>row.id),chargeIds=plan.charges.map(row=>row.id);
  const students=await sql`select id,user_id,student_number,full_name,program_id,year_level,status,source_mode
    from public.affairs_students where id in ${sql(studentIds)} or user_id in ${sql(Object.values(plan.owners))} order by id limit 3`;
  const linked=[...new Set([...studentIds,...students.map(row=>row.id)])];
  const charges=await sql`select ${sql(chargeFields)} from public.affairs_charges
    where id in ${sql(chargeIds)} or student_id in ${sql(linked)} order by id limit 3`;
  return {students:Array.from(students),charges:Array.from(charges,normalizeCharge)};
}
const empty=state=>!state.students.length&&!state.charges.length;
const matches=(state,plan)=>isDeepStrictEqual(state,{students:order(plan.students),charges:order(plan.charges)});

/** Run in the caller's disposable fixture transaction. A trigger-created sample
 * charge is removed only after matching its exact published seed fields. */
export async function stageInternshipCharges(sql,plan){
  plan=checked(plan);
  if(!empty(await readState(sql,plan)))fail('scope is not empty');
  await sql`insert into public.affairs_students ${sql(plan.students)}`;
  for(const student of plan.students){
    const [charge,...extra]=await sql`select ${sql(chargeFields)} from public.affairs_charges where student_id=${student.id} limit 2`;
    if(!charge||extra.length||!uuid.test(charge.id)||!isDeepStrictEqual(normalizeCharge(charge),{...plan.charges[0],id:charge.id,
      student_id:student.id,label:'Sample Fall 2026 tuition',due_on:'2026-12-15'}))fail('unrecognized sample charge');
    const deleted=await sql`delete from public.affairs_charges where id=${charge.id} and student_id=${student.id} returning id`;
    if(deleted.length!==1||deleted[0].id!==charge.id)fail('sample charge deletion was not exact');
  }
  await sql`insert into public.affairs_charges ${sql(plan.charges)}`;
  await observeInternshipChargeRows(sql,plan);
}
export async function observeInternshipChargeRows(sql,plan){
  plan=checked(plan);
  const state=await readState(sql,plan);
  if(!matches(state,plan))fail('persisted charge or student rows differ');
  return digest(state);
}
export async function cleanupInternshipCharges(sql,plan){
  plan=checked(plan);
  const state=await readState(sql,plan);
  if(empty(state))return;
  if(!matches(state,plan))fail('cleanup encountered unrecognized charge or student rows');
  for(const row of plan.charges){
    const removed=await sql`delete from public.affairs_charges where id=${row.id} and student_id=${row.student_id} returning id`;
    if(removed.length!==1||removed[0].id!==row.id)fail('charge deletion was not exact');
  }
  for(const row of plan.students){
    const removed=await sql`delete from public.affairs_students where id=${row.id} and user_id=${row.user_id} returning id`;
    if(removed.length!==1||removed[0].id!==row.id)fail('student deletion was not exact');
  }
  await verifyInternshipChargesAbsent(sql,plan);
}
export async function verifyInternshipChargesAbsent(sql,plan){
  if(!empty(await readState(sql,checked(plan))))fail('reserved rows remain after cleanup');
}

function selector(target,charge){
  const studentUrl=new URL('/rest/v1/affairs_students',origin);
  studentUrl.search=new URLSearchParams({select:'id,user_id',user_id:'eq.'+target.user_id,limit:'1'});
  const chargeUrl=new URL('/rest/v1/affairs_charges',origin);
  chargeUrl.search=new URLSearchParams({select:chargeFields.join(','),student_id:'eq.'+target.id,
    order:'occurrence_on.desc.nullslast,id.asc',limit:'500',offset:'0'});
  return [[studentUrl,[{id:target.id,user_id:target.user_id}]],[chargeUrl,[charge]]];
}

export function expectedInternshipChargeRead(plan){
  plan=checked(plan);
  const [student]=plan.students,[charge]=plan.charges;
  const {id,label,amount_due,amount_paid,currency,due_on,source_mode,occurrence_on,category,contact_unit,contact_extension,payment_unit}=charge;
  const projection={studentRecordFound:true,charges:[{id,label,amountDue:amount_due,amountPaid:amount_paid,currency,
    dueOn:due_on,sourceMode:source_mode,occurrenceOn:occurrence_on,category,contactUnit:contact_unit,
    contactExtension:contact_extension,paymentUnit:payment_unit}]};
  return {reads:selector(student,charge).map(([url,rows])=>digest({method:'GET',url:url.href,ownerId:student.user_id,rows})),
    evidenceDigest:digest(projection)};
}

export async function observeInternshipChargeCallers(plan,{callers,publishableKey,fetchImpl,readResponse,signal}){
  plan=checked(plan);
  if(!Array.isArray(callers)||callers.length!==2||callers.some((user,index)=>user.id!==plan.students[index].user_id
    ||typeof user.token!=='string'||!user.token)||callers[0].token===callers[1].token||typeof publishableKey!=='string'||!publishableKey)
    fail('independent caller binding is invalid');
  const proof=await Promise.all(callers.flatMap(caller=>plan.students.flatMap((target,index)=>
    selector(target,plan.charges[index]).map(async ([url,expected])=>{
      const owned=caller.id===target.user_id;
      const response=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',signal,
        headers:{apikey:publishableKey,Authorization:'Bearer '+caller.token}});
      const rows=await readResponse(response,url,16000);
      if(!isDeepStrictEqual(rows,owned?expected:[]))fail('own or crossed caller rows differ');
      return digest({url:url.href,caller:caller.id,owned,rows});
    }))));
  return {checks:proof.length,digest:digest(proof)};
}

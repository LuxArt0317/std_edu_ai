import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {bindPublishedSampleEnrollments} from './published-sample-enrollments.mjs';
import {assertPublishedNextClassClock} from './published-next-class.mjs';
import {serviceNoteFixtureForRunnerCase,serviceNoteForeignChargeLabel} from './service-note-runner.mjs';
import {loadOwnAffairsTimetable} from '../../server/ownAffairsTimetable.js';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const chargeFields='id,student_id,label,amount_due,amount_paid,currency,due_on,source_mode,occurrence_on,category,contact_unit,contact_extension,payment_unit';
const enrollmentFields='id,student_id,section_id,status,source_mode';
const requireProof=(condition,message)=>{if(!condition)throw new Error(message);};
const ordered=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
const courseOrder=rows=>[...rows].sort((a,b)=>a.enrollmentId.localeCompare(b.enrollmentId));
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields=(row,select)=>Object.fromEntries(select.split(',').map(key=>[key,row[key]]));
const money=row=>({...fields(row,chargeFields),amount_due:Number(row.amount_due),amount_paid:Number(row.amount_paid)});
const sampleCharge={
  label:'Sample Fall 2026 tuition',amount_due:28000,amount_paid:5000,currency:'TWD',due_on:'2026-12-15',
  source_mode:'sample',occurrence_on:null,category:null,contact_unit:null,contact_extension:null,payment_unit:null,
};

export function serviceNoteCompanionPlan(testCase,users,{makeId=randomUUID}={}){
  const kind=testCase.serviceNoteCompanion;
  if(!kind)return null;
  const students=users.map(user=>({id:user.studentId,user_id:user.id}));
  const identities=students.flatMap(row=>[row.id,row.user_id]);
  requireProof(students.length===2&&identities.every(id=>uuid.test(id))&&new Set(identities).size===4,
    'The companion requires two distinct disposable student links.');
  if(kind==='courses')return {kind,students,clock:structuredClone(testCase.publishedNextClass),rows:[]};
  requireProof(kind==='charges','Unknown service-note companion.');
  const expected=serviceNoteFixtureForRunnerCase(testCase).snapshot.charges[0];
  const rows=students.map(({id},index)=>({...sampleCharge,id:makeId(),student_id:id,
    label:index===0?expected.label:serviceNoteForeignChargeLabel,
    amount_due:index===0?expected.amountDue:96321,amount_paid:index===0?expected.amountPaid:420,
    currency:expected.currency,due_on:expected.dueOn,occurrence_on:expected.occurrenceOn}));
  requireProof(rows.every(row=>uuid.test(row.id)&&!identities.includes(row.id))&&rows[0].id!==rows[1].id,
    'The companion charge IDs must be uniquely reserved for these owners.');
  return {kind,students,rows:ordered(rows)};
}

async function assertStudents(sql,plan){
  const actual=await sql`select id,user_id from public.affairs_students where user_id in ${sql(plan.students.map(row=>row.user_id))}
    order by id limit 3`;
  requireProof(isDeepStrictEqual(actual.map(row=>({...row})),ordered(plan.students)),
    'The verified note fixture student links changed.');
}
async function readCharges(sql,plan){
  const rows=await sql`select id,student_id,label,amount_due,amount_paid,currency,due_on::text,source_mode,occurrence_on::text,
    category,contact_unit,contact_extension,payment_unit from public.affairs_charges
    where student_id in ${sql(plan.students.map(row=>row.id))} order by id limit 7`;
  const charges=rows.map(money);
  const initial=charges.filter(row=>row.label===sampleCharge.label);
  requireProof(charges.length<7&&plan.students.every(({id})=>{
    const own=initial.filter(row=>row.student_id===id);
    return own.length===1&&uuid.test(own[0].id)&&isDeepStrictEqual(own[0],{id:own[0].id,student_id:id,...sampleCharge});
  }),'The initializer charge or bounded disposable billing scope changed.');
  return {all:charges,recorded:charges.filter(row=>row.label!==sampleCharge.label)};
}

/** Invoked inside the exact owner-checked note fixture transaction. The
 * initializer charge is read and preserved, and cleanup accepts only one of
 * the two exact reserved row states. */
export async function changeNoteCompanionRows(sql,{previous,next,recovering}){
  const before=previous?.kind==='charges'?previous:null,after=next?.kind==='charges'?next:null;
  if(!before&&!after)return;
  const plan=before??after;
  for(const chargePlan of [before,after].filter(Boolean)){
    const ids=chargePlan.rows.map(row=>row.id);
    requireProof(ids.length===2&&ids.every(id=>uuid.test(id))&&new Set(ids).size===2
      &&chargePlan.students.every(student=>chargePlan.rows.filter(row=>row.student_id===student.id).length===1),
    'Companion charge rows must remain within both disposable student links.');
  }
  requireProof(!before||!after||isDeepStrictEqual(before.students,after.students),'The billing companion changed its owners.');
  await assertStudents(sql,plan);
  const current=(await readCharges(sql,plan)).recorded;
  requireProof(isDeepStrictEqual(current,before?.rows??[])||recovering&&isDeepStrictEqual(current,after?.rows??[]),
    'Saved disposable charges differ from the reserved fixture transition.');
  if(current.length){
    const removed=await sql`delete from public.affairs_charges where student_id in ${sql(plan.students.map(row=>row.id))}
      and id in ${sql(current.map(row=>row.id))} returning id`;
    requireProof(isDeepStrictEqual(removed.map(row=>row.id).sort(),current.map(row=>row.id).sort()),'Exact companion charge cleanup failed.');
  }
  if(!recovering&&after)await sql`insert into public.affairs_charges ${sql(after.rows)}`;
  requireProof(isDeepStrictEqual((await readCharges(sql,plan)).recorded,recovering?[]:after?.rows??[]),
    'The owned companion charge change did not settle.');
}

async function readOwnScope(user,studentId,table,select,context){
  const {publishable,signal,fetchImpl,readResponse}=context;
  const url=new URL('/rest/v1/'+table,origin);
  for(const [key,value] of Object.entries({select,student_id:'eq.'+studentId,order:'id.asc',limit:'6'}))url.searchParams.set(key,value);
  let response,body;
  try{
    response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
      headers:{Authorization:'Bearer '+user.token,apikey:publishable,Prefer:'count=exact'},signal});
    body=await readResponse(response,url,16384);
  }catch{throw new Error('Authenticated companion source readback failed.');}
  requireProof(Array.isArray(body)&&body.length<6&&response.headers.get('content-range')===(body.length?'0-'+(body.length-1)+'/'+body.length:'*/0')
    &&body.every(row=>row?.student_id===studentId&&uuid.test(row.id)
      &&isDeepStrictEqual(Object.keys(row).sort(),select.split(',').sort())),
  'Companion owner scope or exact row count could not be established.');
  return body;
}

async function readTimetableProjection({sql,plan,users,publishable,fetchImpl,readInitializer,clock=()=>new Date().toISOString()}){
  const checkedAt=clock();
  assertPublishedNextClassClock(plan.clock,{now:checkedAt});
  const shared=await readInitializer();
  const enrollments=await sql`select id,student_id,section_id,status,source_mode from public.affairs_enrollments
    where student_id in ${sql(plan.students.map(row=>row.id))} order by id limit 11`;
  requireProof(enrollments.length===10,'Both disposable timetables must contain the complete published enrollment fixture.');
  const projections=[];
  for(const [index,user] of users.entries()){
    const {id:studentId}=plan.students[index];
    const sqlRows=enrollments.filter(row=>row.student_id===studentId).map(row=>fields(row,enrollmentFields));
    const idBySection=new Map(sqlRows.map(row=>[row.section_id,row.id]));
    const enrollmentIdsByCode=Object.fromEntries(shared.rows.map(row=>[row.code,idBySection.get(row.sectionId)]));
    const expected=bindPublishedSampleEnrollments(shared,{userId:user.id,studentId,enrollmentIdsByCode,now:checkedAt});
    requireProof(isDeepStrictEqual(sqlRows,ordered(expected.enrollments)),'Persisted enrollments differ from the independently authored published timetable.');
    const scoped=await loadOwnAffairsTimetable({url:origin,key:publishable,token:user.token,user:{id:user.id}},
      {expectedStudentId:studentId},{fetchImpl});
    const courses=expected.expectedCourses.filter(row=>row.status==='enrolled').map(({credits:_credits,instructor:_instructor,...row})=>({
      ...row,startsAt:row.startsAt.slice(0,5),endsAt:row.endsAt.slice(0,5),
    }));
    requireProof(scoped.profile.userId===user.id&&scoped.studentRecordFound&&scoped.completeness.courses.complete
      &&isDeepStrictEqual(scoped.courses,courseOrder(courses)),'The authenticated timetable does not match the independent published terms and meetings.');
    projections.push({shared:expected.binding.sharedDigest,rows:sqlRows,courses:scoped.courses});
  }
  assertPublishedNextClassClock(plan.clock,{now:clock()});
  return projections;
}

export async function observeNoteCompanion(context){
  const {sql,plan,users}=context;
  if(!plan)return null;
  requireProof(users.length===2&&users.every((user,index)=>user.id===plan.students[index].user_id&&user.studentId===plan.students[index].id),
    'The companion projection is outside the selected client accounts.');
  await assertStudents(sql,plan);
  if(plan.kind==='charges'){
    const {all,recorded}=await readCharges(sql,plan);
    requireProof(isDeepStrictEqual(recorded,plan.rows),'Persisted charges differ from the independent tuition fixture.');
    for(const [index,user] of users.entries()){
      const own=plan.students[index].id,cross=plan.students[1-index].id;
      const ownRows=await readOwnScope(user,own,'affairs_charges',chargeFields,context);
      const crossRows=await readOwnScope(user,cross,'affairs_charges',chargeFields,context);
      requireProof(isDeepStrictEqual(ownRows.map(money),all.filter(row=>row.student_id===own))&&crossRows.length===0,
        'Caller charge rows or cross-account denial did not match the exact persisted billing fixture.');
    }
    return sha(all);
  }
  requireProof(plan.kind==='courses','Unknown service-note companion readback.');
  const timetable=await readTimetableProjection(context);
  for(const [index,user] of users.entries()){
    const crossRows=await readOwnScope(user,plan.students[1-index].id,'affairs_enrollments',enrollmentFields,context);
    requireProof(crossRows.length===0,'The timetable caller could read another account’s enrollments.');
  }
  assertPublishedNextClassClock(plan.clock,{now:(context.clock??(()=>new Date().toISOString()))()});
  return sha(timetable);
}

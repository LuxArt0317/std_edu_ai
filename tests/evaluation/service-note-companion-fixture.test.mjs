import assert from 'node:assert/strict';
import {test} from 'node:test';
import {serviceNoteRunnerCases} from './service-note-runner.mjs';
import {changeNoteCompanionRows,observeNoteCompanion,serviceNoteCompanionPlan} from './service-note-companion-fixture.mjs';
import {sampleEnrollmentManifest} from './published-sample-enrollments.mjs';

const now='2026-11-16T03:30:00.000Z';
const id=n=>'6b000000-0000-4000-8000-'+String(n).padStart(12,'0');
const users=[{id:id(1),studentId:id(11),token:'LOCAL_ONLY_A'},{id:id(2),studentId:id(12),token:'LOCAL_ONLY_B'}];
const cases=serviceNoteRunnerCases({now});
const courseCase=cases.find(row=>row.serviceNoteCompanion==='courses');
const feeCase=cases.find(row=>row.serviceNoteCompanion==='charges');
const sorted=rows=>[...rows].sort((left,right)=>left.id.localeCompare(right.id));
const sampleCharges=users.map((user,index)=>({id:id(100+index),student_id:user.studentId,label:'Sample Fall 2026 tuition',
  amount_due:28000,amount_paid:5000,currency:'TWD',due_on:'2026-12-15',source_mode:'sample',occurrence_on:null,
  category:null,contact_unit:null,contact_extension:null,payment_unit:null}));
const manifest=sampleEnrollmentManifest;
const sharedRead=()=>({scope:structuredClone(manifest.scope),complete:true,rows:manifest.courses.map((course,index)=>{
  const term=manifest.terms.find(item=>item.code===course.termCode);
  return {sectionId:id(200+index),courseId:id(210+index),termId:id(220+manifest.terms.indexOf(term)),programId:id(230),
    code:course.code,title:course.title,credits:course.credits,courseSourceMode:'sample',
    programCode:manifest.program.code,programName:manifest.program.name,department:manifest.program.department,programSourceMode:'sample',
    termCode:term.code,termLabel:term.label,termStartsOn:term.startsOn,termEndsOn:term.endsOn,termSourceMode:'sample',
    sectionCode:course.sectionCode,instructor:course.instructor,weekday:course.weekday,startsAt:course.startsAt,endsAt:course.endsAt,
    room:course.room,sectionSourceMode:'sample'};
})});
const enrollmentRows=shared=>users.flatMap((user,owner)=>shared.rows.map((row,course)=>({
  id:id(300+owner*10+course),student_id:user.studentId,section_id:row.sectionId,
  status:manifest.courses[course].status,source_mode:'sample',
})));
const students=users.map(user=>({id:user.studentId,user_id:user.id}));
const seedIds=[...students.map(row=>row.id)];
function store({charges=sampleCharges,shared=sharedRead()}={}){
  let billing=structuredClone(charges);
  const enrollments=enrollmentRows(shared);
  const writes=[];
  const sql=(scope,...values)=>{
    if(!scope.raw)return scope;
    const statement=scope.join(' ');
    if(statement.startsWith('select')){
      if(statement.includes('public.affairs_students')){
        assert.deepEqual(values,[users.map(user=>user.id)]);
        return sorted(students);
      }
      assert.deepEqual(values,[seedIds]);
      return statement.includes('public.affairs_charges')?sorted(billing):sorted(enrollments);
    }
    assert.match(statement,/public\.affairs_charges/u);
    writes.push({statement,values});
    if(statement.startsWith('delete')){
      assert.deepEqual(values[0],seedIds);
      assert.ok(billing.filter(row=>values[1].includes(row.id)).every(row=>row.label!==sampleCharges[0].label));
      const removed=billing.filter(row=>values[1].includes(row.id));
      billing=billing.filter(row=>!values[1].includes(row.id));
      return removed.map(({id})=>({id}));
    }
    assert.match(statement,/^insert into/u);
    billing.push(...values[0]);
    return [];
  };
  return {sql,writes,charges:()=>sorted(billing),enrollments,shared};
}
function transport(database,{leak=false,alterCourse=false}={}){
  const calls=[];
  const fetchImpl=async (input,init)=>{
    const url=new URL(input),header=new Headers(init.headers);
    assert.equal(url.origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
    assert.equal(init.method,'GET');
    assert.equal(init.redirect,'error');
    assert.equal(header.get('apikey'),'LOCAL_TEST_PUBLISHABLE');
    const active=users.find(user=>'Bearer '+user.token===header.get('authorization'));
    assert.ok(active);
    let rows;
    const table=url.pathname.split('/').at(-1);
    if(table==='affairs_students'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+active.id);
      rows=students.filter(student=>student.user_id===active.id);
    }else{
      const student=url.searchParams.get('student_id')?.slice(3);
      const crossed=student!==active.studentId;
      assert.ok(seedIds.includes(student));
      if(table==='affairs_charges')rows=crossed&&!leak?[]:database.charges().filter(row=>row.student_id===student);
      else{
        assert.equal(table,'affairs_enrollments');
        rows=crossed&&!leak?[]:database.enrollments.filter(row=>row.student_id===student);
        if(url.searchParams.get('status')==='eq.enrolled'){
          rows=rows.filter(row=>row.status==='enrolled').map(row=>{
            const shared=database.shared.rows.find(item=>item.sectionId===row.section_id);
            return {...row,student:{id:student,user_id:active.id},section:{
              id:row.section_id,course_id:shared.courseId,term_id:shared.termId,weekday:shared.weekday,
              starts_at:shared.startsAt,ends_at:shared.endsAt,room:alterCourse?'Changed room':shared.room,
              course:{id:shared.courseId,code:shared.code,title:shared.title},
              term:{id:shared.termId,label:shared.termLabel,starts_on:shared.termStartsOn,ends_on:shared.termEndsOn},
            }};
          });
        }
      }
      calls.push([active.id,table,crossed]);
    }
    return Response.json(rows,{headers:{'content-range':rows.length?`0-${rows.length-1}/${rows.length}`:'*/0'}});
  };
  return {calls,fetchImpl,readResponse:async response=>response.json()};
}
const fixtureContext=(database,plan,transportOptions={})=>({sql:database.sql,plan,users,publishable:'LOCAL_TEST_PUBLISHABLE',
  readInitializer:async()=>database.shared,clock:()=>now,...transport(database,transportOptions)});

test('billing transition, paired scopes and ambiguous-commit recovery preserve both initializer rows',async()=>{
  let number=400;
  const plan=serviceNoteCompanionPlan(feeCase,users,{makeId:()=>id(number++)});
  const database=store();
  await changeNoteCompanionRows(database.sql,{previous:null,next:plan});
  assert.deepEqual(database.charges(),sorted([...sampleCharges,...plan.rows]));
  const context=fixtureContext(database,plan);
  const before=await observeNoteCompanion(context);
  assert.match(before,/^[a-f0-9]{64}$/u);
  assert.equal(await observeNoteCompanion(context),before);
  assert.deepEqual(context.calls.slice(0,4),[[users[0].id,'affairs_charges',false],[users[0].id,'affairs_charges',true],
    [users[1].id,'affairs_charges',false],[users[1].id,'affairs_charges',true]]);
  await assert.rejects(()=>observeNoteCompanion(fixtureContext(database,plan,{leak:true})),/cross-account denial/u);
  const wrong=store({charges:[...sampleCharges,...plan.rows.map(row=>({...row,amount_paid:0}))]});
  await assert.rejects(()=>changeNoteCompanionRows(wrong.sql,{previous:plan,next:null,recovering:true}),/reserved fixture transition/u);
  assert.equal(wrong.writes.length,0);
  await changeNoteCompanionRows(database.sql,{previous:null,next:plan,recovering:true});
  assert.deepEqual(database.charges(),sampleCharges);
});

test('timetable checks exact persisted records, caller scope, independent source drift and the full clock window',async()=>{
  const plan=serviceNoteCompanionPlan(courseCase,users);
  const database=store();
  const safe=fixtureContext(database,plan);
  assert.match(await observeNoteCompanion(safe),/^[a-f0-9]{64}$/u);
  assert.deepEqual(safe.calls.filter(row=>row[2]),[[users[0].id,'affairs_enrollments',true],[users[1].id,'affairs_enrollments',true]]);
  assert.equal(database.writes.length,0);
  // Retired sample courses stay excluded even if their display title changes.
  assert.match(await observeNoteCompanion(fixtureContext(database,plan,{alterCourse:true})),/^[a-f0-9]{64}$/u);
  await assert.rejects(()=>observeNoteCompanion(fixtureContext(database,plan,{leak:true})),/another account/u);
  const altered=sharedRead();altered.rows[0].title='Drifted catalog';
  await assert.rejects(()=>observeNoteCompanion(fixtureContext(store({shared:altered}),plan)),/differs from the reviewed migration/u);
  let reads=0;
  await assert.rejects(()=>observeNoteCompanion({...safe,clock:()=>reads++===0?now:plan.clock.validUntil}),/next class changed/u);
});

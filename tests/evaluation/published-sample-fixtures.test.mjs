import {nativeInternshipSetupRequired} from './internship-native-runner.mjs';
import {nativeStudentLeaveSetupRequired} from './student-leave-runner.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {planPublishedSampleFixture,readPublishedSampleInitializerRows,verifyPublishedSampleFixtureBinding,verifyNativeFixtureReadback,planNativeFixture,LiveFixtureError} from './live-fixtures.mjs';
import {buildAccountFixture,fixtureForCase,EVAL_USER_ID,EVAL_OTHER_USER_ID,evalId} from './fixtures.mjs';

const now='2026-11-13T02:00:00Z',studentId=evalId(10);
const id=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');

test('published sample setup preserves both nullable Moodle material links for exact readback',async()=>{
  const code=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
  const start=code.indexOf('function recordsToInsert(');
  const end=code.indexOf('\nasync function',start);
  const buildRows=vm.runInNewContext(code.slice(start,end)+'\nrecordsToInsert',{state:{now},
    pick:(row,keys)=>Object.fromEntries(keys.map(key=>[key,row[key]])),hash:()=> 'synthetic-import-key',
    UUID:/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,fail:assert.fail});
  const snapshot=fixtureForCase('published-sample:records',{now});
  const [course]=snapshot.dtm.courses,[material]=course.materials;
  assert.equal(material.sourceUrl,null);
  assert.equal(material.targetUrl,null);
  snapshot.serviceRecords=[];
  const write=()=>buildRows(snapshot,{id:EVAL_USER_ID,studentId}).dtm_materials[0];
  assert.equal(write().source_url,null);
  assert.equal(write().target_url,null);
  material.sourceUrl='https://example.invalid/material';
  material.targetUrl='https://example.invalid/reading';
  const persisted=write();
  assert.equal(persisted.source_url,material.sourceUrl);
  assert.equal(persisted.target_url,material.targetUrl);
});
const terms={
  'SAMPLE-2026-FALL':{termId:id(901),termLabel:'Sample Fall 2026',termStartsOn:'2026-09-07',termEndsOn:'2027-01-15'},
  'SAMPLE-2026-SPRING':{termId:id(902),termLabel:'Sample Spring 2026',termStartsOn:'2026-02-16',termEndsOn:'2026-06-26'},
  'SAMPLE-2027-SPRING':{termId:id(903),termLabel:'Sample Spring 2027',termStartsOn:'2027-02-15',termEndsOn:'2027-06-25'},
};
const literals=[
  ['SAMP101','Campus Orientation',2,'SAMPLE-2026-FALL',1,'09:00:00','10:30:00','Sample Room 101'],
  ['SAMP102','Digital Learning Basics',3,'SAMPLE-2026-FALL',3,'13:00:00','14:30:00','Sample Room 203'],
  ['SAMP103','Student Services Practice',2,'SAMPLE-2026-FALL',5,'10:00:00','11:30:00','Sample Room 305'],
  ['SAMP090','Study Skills Foundations',2,'SAMPLE-2026-SPRING',2,'09:00:00','10:30:00','Sample Room 104'],
  ['SAMP201','Applied Digital Projects',3,'SAMPLE-2027-SPRING',2,'14:00:00','15:30:00','Sample Lab 202'],
];
function sharedRead(){return {scope:{id:'sample-enrollment-initializer-union-v1',fallTermCode:'SAMPLE-2026-FALL',academicSeedCourseCodes:['SAMP090','SAMP103','SAMP201']},complete:true,
  rows:literals.map(([code,title,credits,termCode,weekday,startsAt,endsAt,room],index)=>({sectionId:id(100+index),courseId:id(200+index),programId:id(900),code,title,credits,courseSourceMode:'sample',
    programCode:'SAMPLE-GEN',programName:'Sample General Studies',department:'Sample Academic Office',programSourceMode:'sample',termCode,...terms[termCode],termSourceMode:'sample',
    sectionCode:'A',instructor:'Sample instructor',weekday,startsAt,endsAt,room,sectionSourceMode:'sample'}))};}
function fixture(){const value=buildAccountFixture({now});value.student.program='Sample General Studies';
  value.courses=literals.map(([code,title,credits,termCode,weekday,startsAt,endsAt,room],index)=>({enrollmentId:evalId(471+index),status:code==='SAMP090'?'completed':'enrolled',sourceMode:'sample',
    code,title,credits,term:terms[termCode].termLabel,termStartsOn:terms[termCode].termStartsOn,termEndsOn:terms[termCode].termEndsOn,instructor:'Sample instructor',weekday,startsAt,endsAt,room,
    grades:code==='SAMP101'?[{label:'Sample practice quiz',score:8,maximum:10,sourceMode:'sample'}]:[],attendance:[]}));return value;}
const options=()=>({userId:EVAL_USER_ID,studentId,otherUserId:EVAL_OTHER_USER_ID,now,read:sharedRead(),domains:['courses']});
const errorCode=code=>error=>error instanceof LiveFixtureError&&error.code===code;
function actualReadback(plan){return {...structuredClone(plan.expected),profile:{userId:EVAL_USER_ID},student:{id:studentId,program:'Sample General Studies'}};}
const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
const section=(start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(from>=0&&to>from);return source.slice(from,to).replaceAll('export async function ','async function ').replaceAll('export function ','function ');};
const rawRows=()=>sharedRead().rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/[A-Z]/g,char=>'_'+char.toLowerCase()),value])));

test('published sample plan preserves independently authored rows and only writes disposable enrollments and the unavoidable seeded grade',async()=>{
  const golden=fixture(),before=structuredClone(golden),plan=await planPublishedSampleFixture(golden,options());
  assert.deepEqual(golden,before);assert.deepEqual(plan.domains,['courses']);assert.deepEqual(plan.expected.courses,golden.courses);
  assert.deepEqual(Object.keys(plan.rows).sort(),['affairs_attendance','affairs_enrollments','affairs_grade_items']);
  assert.equal(plan.rows.affairs_enrollments.length,5);assert.ok(plan.rows.affairs_enrollments.every(row=>row.student_id===studentId&&row.source_mode==='sample'));
  assert.deepEqual(plan.rows.affairs_enrollments.map(row=>[row.id,row.section_id,row.status]),[
    [evalId(471),id(100),'enrolled'],[evalId(472),id(101),'enrolled'],[evalId(473),id(102),'enrolled'],[evalId(474),id(103),'completed'],[evalId(475),id(104),'enrolled'],
  ]);
  const grade=plan.rows.affairs_grade_items[0];assert.deepEqual({...grade,id:undefined},{id:undefined,enrollment_id:evalId(471),label:'Sample practice quiz',score:8,maximum:10,released_at:golden.checkedAt,source_mode:'sample'});
  assert.deepEqual(plan.rows.affairs_attendance,[]);assert.equal(plan.publishedSampleBinding.sections[0].programId,id(900));
  assert.equal(verifyNativeFixtureReadback(actualReadback(plan),plan),true);
});

test('required seeded quiz is independently anchored in the actual initializer migration',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261105010000_school_affairs_workspace.sql',import.meta.url),'utf8');
  assert.match(sql,/insert into public\.affairs_grade_items\(enrollment_id,label,score,maximum,released_at\)[\s\S]*?select e\.id,'Sample practice quiz',8,10,now\(\)/);
  assert.match(sql,/where e\.student_id=v_student_id and c\.code='SAMP101'[\s\S]*?g\.label='Sample practice quiz'/);
  assert.match(sql,/source_mode text not null default 'sample'/);
  const missing=fixture();missing.courses[0].grades=[];
  await assert.rejects(planPublishedSampleFixture(missing,options()),errorCode('fixture-mapping'));
  const changed=fixture();changed.courses[0].grades[0].score=7;
  await assert.rejects(planPublishedSampleFixture(changed,options()),errorCode('fixture-mapping'));
});

test('golden drift, extra fields and shared clones fail without rebinding legacy DB301',async()=>{
  for(const mutate of [value=>{value.courses[0].title='Different';},value=>{value.courses[0].sourceMode='verified';},value=>{value.courses[0].status='completed';},
    value=>{value.courses[0].attendance=[{date:'2026-11-01',status:'present',sourceMode:'sample'}];},value=>{value.courses[0].unproven='extra';}]){
    const value=fixture();mutate(value);await assert.rejects(planPublishedSampleFixture(value,options()),errorCode('fixture-mapping'));
  }
  const wrongOwner={...options(),userId:EVAL_OTHER_USER_ID};await assert.rejects(planPublishedSampleFixture(fixture(),wrongOwner),errorCode('fixture-schema'));
  const wrongProgram=fixture();wrongProgram.student.program='Information Studies';await assert.rejects(planPublishedSampleFixture(wrongProgram,options()),errorCode('fixture-schema'));
  const wrongStamp=fixture();wrongStamp.checkedAt='invalid';await assert.rejects(planPublishedSampleFixture(wrongStamp,options()),errorCode('fixture-schema'));
  for(const mutate of [read=>{read.rows[0].instructor='Another instructor';},read=>{read.rows[0].courseSourceMode='verified';},read=>{read.rows[0].programCode='CLONE';},
    read=>{read.rows.push({...read.rows[0],sectionId:id(999),sectionCode:'B'});},read=>{read.complete=false;},read=>{read.rows.pop();}]){
    const input=options();mutate(input.read);await assert.rejects(planPublishedSampleFixture(fixture(),input),errorCode('fixture-unsupported'));
  }
  await assert.rejects(planPublishedSampleFixture(fixture(),{...options(),now:'2027-01-15T16:00:00Z'}),errorCode('fixture-unsupported'));
  await assert.rejects(planNativeFixture(buildAccountFixture({now}),{...options(),domains:['courses'],shared:{courses:sharedRead().rows}}),errorCode('fixture-unsupported'));
});

test('actual API readback must match owner, student, program and every course, grade and attendance cell',async()=>{
  const plan=await planPublishedSampleFixture(fixture(),options());
  for(const mutate of [value=>{value.profile.userId=EVAL_OTHER_USER_ID;},value=>{value.student.id=evalId(99);},value=>{value.student.program='Cloned program';},
    value=>{value.courses.pop();},value=>{value.courses.push({...value.courses[0],enrollmentId:evalId(99)});},value=>{value.courses[0].grades=[];},
    value=>{value.courses[0].termStartsOn='2026-09-08';},value=>{value.courses[0].attendance=[{date:'2026-11-13',status:'absent',sourceMode:'sample'}];}]){
    const actual=actualReadback(plan);mutate(actual);assert.throws(()=>verifyNativeFixtureReadback(actual,plan),errorCode('fixture-mapping'));
  }
});

test('shared read uses the full Fall OR seed-course union with provenance and no mutation',async()=>{
  let reads=0,runs=0;const read=await readPublishedSampleInitializerRows(async(strings,...values)=>{
    reads++;const sql=strings.join('?');assert.equal(values.length,0);assert.match(sql,/where t\.code='SAMPLE-2026-FALL' or c\.code in \('SAMP090','SAMP103','SAMP201'\)/);
    assert.match(sql,/left join public\.affairs_programs/);assert.match(sql,/order by s\.id limit 501/);
    for(const field of ['course_source_mode','program_source_mode','term_source_mode','section_source_mode'])assert.ok(sql.includes(field));
    assert.doesNotMatch(sql,/\b(?:insert|update|delete|alter)\b/i);return rawRows();
  },{runQuery:async task=>{runs++;return task();}});
  assert.equal(reads,1);assert.equal(runs,1);assert.deepEqual(read,sharedRead());
  await assert.rejects(readPublishedSampleInitializerRows(async()=>Array.from({length:501},()=>rawRows()[0])),errorCode('fixture-unsupported'));
});

test('shared identity or field drift fails before and after a model rather than silently updating the binding',async()=>{
  const plan=await planPublishedSampleFixture(fixture(),options());let reads=0;
  assert.equal(await verifyPublishedSampleFixtureBinding(plan,{now,read:async()=>{reads++;return sharedRead();}}),plan.publishedSampleBinding.sharedDigest);assert.equal(reads,1);
  const ids=sharedRead();ids.rows[0].sectionId=id(999);
  await assert.rejects(verifyPublishedSampleFixtureBinding(plan,{now,read:async()=>ids}),errorCode('fixture-mapping'));
  const fields=sharedRead();fields.rows[0].title='Different';
  await assert.rejects(verifyPublishedSampleFixtureBinding(plan,{now,read:async()=>fields}),errorCode('fixture-unsupported'));
});

test('published family selects all five enrollments even for a charges-only question; legacy path remains separate',async()=>{
  const call=vm.runInNewContext(section('async function readNativeBindings(','function recordsToInsert(')+'\nreadNativeBindings;',{
    state:{now,users:[{id:EVAL_USER_ID,studentId},{id:EVAL_OTHER_USER_ID}],sql:async()=>rawRows()},
    PRIVATE_NATIVE_DOMAINS:[],CONDITIONAL_NATIVE_DOMAINS:['courses','scholarship','housing'],readPublishedSampleInitializerRows,planPublishedSampleFixture,planNativeFixture,
    query:task=>task(),fail:(code,message)=>{throw new LiveFixtureError(code,message);},
  });
  const plan=await call(fixture(),{fixtureKey:'published-sample:records',expected:{requiredTools:['charges']}});
  assert.equal(plan.expected.courses.length,5);assert.equal(plan.rows.affairs_enrollments.length,5);
  const legacy=await call(buildAccountFixture({now}),{fixtureKey:'charges',expected:{requiredTools:['charges']}});
  assert.deepEqual(Array.from(legacy.domains),[]);assert.equal(legacy.publishedSampleBinding,undefined);
});

test('real persistence function records all owned IDs before SQL and updates only disposable student/enrollment tables',async()=>{
  const golden=fixture(),plan=await planPublishedSampleFixture(golden,options()),events=[];
  const sql=(strings,...values)=>{
    if(!strings?.raw)return {identifier:strings};
    events.push({kind:'sql',sql:strings.join('?'),values});return Promise.resolve([]);
  };sql.unsafe=async statement=>events.push({kind:'sql',sql:statement,values:[]});sql.json=value=>value;
  const state={users:[{id:EVAL_USER_ID,studentId},{id:EVAL_OTHER_USER_ID}],recordIds:new Set(),supplementalTables:new Set(),sql};
  const persist=vm.runInNewContext(section('async function persistSnapshot(','function canonical(')+'\npersistSnapshot;',{
    state,ownTables:[],SUPPLEMENTAL_TABLES:{},query:task=>task(),saveLedger:async()=>events.push({kind:'ledger',ids:[...state.recordIds]}),
    fail:(code,message)=>{throw new LiveFixtureError(code,message);},
  });
  await persist(golden,plan.rows,{fixtureKey:'published-sample:records',expected:{}},plan,{domains:[]});
  assert.equal(events[0].kind,'ledger');assert.deepEqual(new Set(events[0].ids),new Set(Object.values(plan.rows).flat().map(row=>row.id)));
  const program=events.find(event=>event.sql?.includes('set program_id='));assert.deepEqual(program.values,[id(900),studentId,EVAL_USER_ID]);
  assert.ok(events.some(event=>event.sql==='commit'));
  for(const event of events.filter(event=>event.sql?.startsWith('insert into'))){assert.ok(['public.affairs_enrollments','public.affairs_grade_items'].includes(event.values[0].identifier));}
  assert.ok(events.some(event=>event.sql==='delete from public.affairs_enrollments where student_id=?'&&event.values[0]===studentId));
  assert.ok(!events.some(event=>event.sql?.includes('auth.users')||/update public\.affairs_(?:programs|courses|sections|terms)/.test(event.sql||'')));
});

test('actual forCase/afterCase pipeline rechecks auth data and shared source, retaining unchanged-state proof',async()=>{
  const golden=fixture(),plan=await planPublishedSampleFixture(golden,options()),actual={...golden,...actualReadback(plan)};
  const caseRecord={id:'account:published-sample-current',fixtureKey:'published-sample:records',expected:{requiredTools:['courses']}};
  const state={now,users:[{id:EVAL_USER_ID,studentId,token:'SYNTHETIC'},{id:EVAL_OTHER_USER_ID,token:'SYNTHETIC'}],supplementalTables:new Set(),sql:async()=>rawRows()};
  let sourceReads=0,privateReads=0,ledger=0;
  const context={nativeInternshipSetupRequired,nativeStudentLeaveSetupRequired,state,ready:()=>state,fixtureForCase:()=>structuredClone(golden),assertSupported:()=>{},readNativeBindings:async()=>plan,
    recordsToInsert:()=>({}),planSupplementalFixture:()=>({rows:{},domains:[]}),persistSnapshot:async()=>{},
    readSnapshot:async()=>{privateReads++;return structuredClone(actual);},verifyReadback:()=>{},verifyNativeFixtureReadback,
    verifyPublishedSampleFixtureBinding,readPublishedSampleInitializerRows:async(...args)=>{sourceReads++;return readPublishedSampleInitializerRows(...args);},query:task=>task(),
    SUPPLEMENTAL_SCOPES:{},SUPPLEMENTAL_TABLES:{},readSupplementalFixtureScopes:async()=>({}),verifySupplementalFixtureReadback:()=>{},
    ownState:value=>value,hash:value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),saveLedger:async()=>{ledger++;},PROJECT:'synthetic',
    fail:(code,message)=>{throw new LiveFixtureError(code,message);},
  };
  const methods=vm.runInNewContext(section('export async function forCase(','/** Deliberately never confirms')+section('export async function afterCase(','/** Removes only')+'\n({forCase,afterCase});',context);
  const auth=await methods.forCase(caseRecord);assert.equal(auth.token,'SYNTHETIC');assert.equal(state.current.publishedSamplePlan,plan);
  const envelope={};await methods.afterCase(caseRecord,envelope);
  assert.equal(privateReads,2);assert.equal(sourceReads,2);assert.equal(ledger,2);assert.equal(state.current,null);
  assert.equal(envelope.stateBefore.ownedRecordsDigest,envelope.stateAfterProposal.ownedRecordsDigest);assert.equal(envelope.fixtureReadback.verified,true);
});

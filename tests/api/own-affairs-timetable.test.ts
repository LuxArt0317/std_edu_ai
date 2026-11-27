import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOwnAffairsTimetable as load,ownAffairsTimetableLimits} from '../../server/ownAffairsTimetable.js';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
import {studyCalendar} from '../../server/affairsSchedule.js';

const owner='49000000-0000-4000-8000-000000000001',student='49000000-0000-4000-8000-000000000002',foreign='49000000-0000-4000-8000-000000000003',termId='49000000-0000-4000-8000-000000000004';
const account={user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_CALLER'};
const id=(family:number,index:number)=>'49000000-0000-4000-'+family+'-'+String(index).padStart(12,'0');
const row=(index=1)=>({id:id(8100,index),student_id:student,section_id:id(8200,index),status:'enrolled',source_mode:'verified',student:{id:student,user_id:owner},
  section:{id:id(8200,index),course_id:id(8300,index),term_id:termId,weekday:1,starts_at:'09:00:00',ends_at:'10:30:00',room:'A101',
    course:{id:id(8300,index),code:'QA'+index,title:'QA owned course '+index},term:{id:termId,label:'QA Fall',starts_on:'2026-09-07',ends_on:'2027-01-15'}}});
type Row=ReturnType<typeof row>;
type Mutate=(value:Row)=>void;
type ResponseHook=(url:URL,rows:Row[],calls:number)=>Response|undefined;
function transport(rows:Row[]=[row()],students:unknown=[{id:student,user_id:owner}],hook?:ResponseHook){
  const calls:URL[]=[],signals:AbortSignal[]=[];
  const fetchImpl:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));calls.push(url);if(init?.signal)signals.push(init.signal);
    assert.equal(url.origin,account.url);assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(init?.body,undefined);
    const headers=new Headers(init?.headers);assert.equal(headers.get('authorization'),'Bearer OFFLINE_CALLER');assert.equal(headers.get('apikey'),'OFFLINE_KEY');
    if(url.pathname.endsWith('/affairs_students')){assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.equal(url.searchParams.get('select'),'id,user_id');assert.equal(url.searchParams.get('limit'),'2');return Response.json(students);}
    assert.equal(url.pathname,'/rest/v1/affairs_enrollments');assert.equal(headers.get('prefer'),'count=exact');assert.equal(url.searchParams.get('student_id'),'eq.'+student);
    assert.equal(url.searchParams.get('status'),'eq.enrolled');assert.equal(url.searchParams.get('order'),'id.asc');
    const offset=Number(url.searchParams.get('offset')),limit=Number(url.searchParams.get('limit')),page=rows.slice(offset,offset+limit);
    return hook?.(url,page,calls.length)??Response.json(page,{headers:{'content-range':page.length?`${offset}-${offset+page.length-1}/${rows.length}`:`*/${rows.length}`}});
  };
  return {calls,signals,fetchImpl};
}
const run=(io:ReturnType<typeof transport>,options:{deadline?:number}={})=>load(account,options,{fetchImpl:io.fetchImpl});
const rejected=(promise:Promise<unknown>,status=503)=>assert.rejects(promise,(error:unknown)=>error instanceof AffairsWorkspaceError&&error.status===status&&!/OFFLINE_|PRIVATE_|FOREIGN_/u.test(error.message));

test('actual scoped transport projects only owned timetable fields and remains compatible with next-class selection',async()=>{
  const io=transport(),out=await run(io),select=io.calls[1].searchParams.get('select')!;
  assert.match(select,/student:affairs_students!affairs_enrollments_student_id_fkey\(id,user_id\)/u);
  assert.match(select,/section:affairs_sections!affairs_enrollments_section_id_fkey/u);assert.match(select,/course:affairs_courses!affairs_sections_course_id_fkey\(id,code,title\)/u);
  assert.match(select,/term:affairs_terms!affairs_sections_term_id_fkey\(id,label,starts_on,ends_on\)/u);
  assert.doesNotMatch(select,/!inner|\*|grades|attendance|instructor|credits|profiles|dtm/iu);
  assert.deepEqual(Object.keys(out.profile),['userId']);assert.equal(out.studentRecordFound,true);assert.equal(out.officialUniversityData,false);
  assert.deepEqual(out.courses,[{enrollmentId:id(8100,1),status:'enrolled',sourceMode:'verified',code:'QA1',title:'QA owned course 1',term:'QA Fall',termStartsOn:'2026-09-07',termEndsOn:'2027-01-15',weekday:1,startsAt:'09:00',endsAt:'10:30',room:'A101'}]);
  const calendar=studyCalendar(out.courses,'2026-11-15T00:00:00Z');assert.equal(calendar.next?.day,'2026-11-16');assert.equal(calendar.next?.course.code,'QA1');
  assert.equal(out.completeness.courses.complete,true);assert.match(out.completeness.courses.meaning,/No atomic multi-request snapshot/u);
  assert.doesNotMatch(JSON.stringify(out),/OFFLINE_|student_id|course_id|term_id|section_id|"total"|"count"/u);assert.equal(io.calls.length,2);
});

test('missing caller student and successful empty enrollment read have different completeness',async()=>{
  const missing=transport([],[]),empty=transport([]);const a=await run(missing),b=await run(empty);
  assert.equal(a.studentRecordFound,false);assert.equal(a.completeness.courses.complete,false);assert.equal(a.completeness.courses.reason,'student_unlinked');assert.equal(missing.calls.length,1);
  assert.equal(b.studentRecordFound,true);assert.equal(b.completeness.courses.complete,true);assert.equal(b.completeness.courses.reason,null);assert.equal(empty.calls.length,2);assert.deepEqual(b.courses,[]);
});

test('private expected-student assertion catches same-owner replacement before enrollments and stays out of output',async()=>{
  for(const [expectedStudentId,students]of [[student,[{id:foreign,user_id:owner}]],[student,[]],[null,[{id:student,user_id:owner}]]] as const){
    const io=transport([],students);await rejected(load(account,{expectedStudentId},{fetchImpl:io.fetchImpl}));assert.equal(io.calls.length,1);
  }
  const io=transport(),options:{expectedStudentId:string|null}={expectedStudentId:student};
  const out=await load(account,options,{fetchImpl:async(input,init)=>{const response=await io.fetchImpl(input,init);options.expectedStudentId=foreign;return response;}});
  assert.equal(out.courses.length,1);assert.doesNotMatch(JSON.stringify(out),new RegExp(student));
  assert.equal((await load(account,{expectedStudentId:null},{fetchImpl:transport([],[]).fetchImpl})).studentRecordFound,false);
  let reads=0;await rejected(load(account,{expectedStudentId:'invalid'},{fetchImpl:async()=>{reads++;throw Error('Must not read');}}));assert.equal(reads,0);
});

test('invalid caller/selector/deadline and expired inherited budget fail before transport',async()=>{
  let calls=0;const fetchImpl:typeof fetch=async()=>{calls++;throw new Error('no transport expected');};
  for(const invalid of [{...account,user:{id:foreign+'x'}},{...account,url:'https://foreign.invalid'},{...account,token:''},{...account,user:null}])await rejected(load(invalid as typeof account,{}, {fetchImpl}),403);
  for(const options of [{studentId:foreign},{userId:foreign},{deadline:NaN},{deadline:Infinity},null])await rejected(load(account,options as {deadline:number},{fetchImpl}));
  await rejected(load({...account,requestDeadline:Date.now()-1},{},{fetchImpl}));await rejected(load(account,{deadline:Date.now()-1},{fetchImpl}));
  await rejected(load(account,{}, {fetchImpl:null} as unknown as {fetchImpl:typeof fetch}));assert.equal(calls,0);
  const accessor=Object.defineProperty({},'user',{get(){throw new Error('PRIVATE_ACCESSOR');}});await rejected(load(accessor as typeof account,{}, {fetchImpl}),403);assert.equal(calls,0);
});

test('captured owner, token and key remain immutable after first awaited request',async()=>{
  const mutable=structuredClone(account),io=transport();let count=0;
  const fetchImpl:typeof fetch=async(input,init)=>{count++;const response=await io.fetchImpl(input,init);if(count===1){mutable.user.id=foreign;mutable.token='FOREIGN_TOKEN';mutable.key='FOREIGN_KEY';mutable.url='https://foreign.invalid';}return response;};
  const out=await load(mutable,{}, {fetchImpl});assert.equal(out.profile.userId,owner);assert.equal(io.calls.length,2);
});

test('missing, foreign, extra, mismatched or non-enrolled relationships never return partial facts',async()=>{
  for(const students of [[{id:student,user_id:foreign}],[{id:student,user_id:owner,email:'PRIVATE_EMAIL'}],[{id:student,user_id:owner},{id:foreign,user_id:owner}],null])await rejected(run(transport([],students)));
  const mutations:Mutate[]=[r=>{r.student_id=foreign;},r=>{r.student.user_id=foreign;},r=>{r.student.id=foreign;},r=>{r.section.id=foreign;},r=>{r.section.course.id=foreign;},r=>{r.section.term.id=foreign;},r=>{r.status='withdrawn';},r=>{r.status='completed';},r=>{r.source_mode='official';},r=>{Object.assign(r.section,{instructor:'PRIVATE_NAME'});},r=>{Object.assign(r,{grades:[99]});},r=>{Object.assign(r,{section:null});},r=>{Object.assign(r.section,{course:[]});}];
  for(const mutate of mutations){const bad=row();mutate(bad);await rejected(run(transport([row(0),bad])));}
});

test('literal blank room and zero-second time forms work; invalid or sub-minute schedules fail rather than rounding',async()=>{
  const valid=row();valid.section.room='';valid.section.starts_at='09:00:00.000000';assert.equal((await run(transport([valid]))).courses[0].room,'');
  const mutations:Mutate[]=[r=>{r.section.starts_at='09:00:01';},r=>{r.section.starts_at='09:00:00.000001';},r=>{r.section.starts_at='24:00';},r=>{r.section.ends_at='08:00';},r=>{r.section.weekday=0;},r=>{r.section.weekday=1.2;},r=>{r.section.term.starts_on='2026-02-30';},r=>{r.section.term.starts_on='0000-01-01';},r=>{r.section.term.ends_on='2025-01-01';},r=>{r.section.course.title='PRIVATE_\u0000';}];
  for(const mutate of mutations){const bad=row();mutate(bad);await rejected(run(transport([bad])));}
});

test('200 exact rows require a final empty sentinel, while over-cap totals reject before accepting rows',async()=>{
  const io=transport(Array.from({length:200},(_,i)=>row(i))),out=await run(io);
  assert.equal(out.courses.length,200);assert.deepEqual(io.calls.slice(1).map(url=>[url.searchParams.get('offset'),url.searchParams.get('limit')]),[['0','100'],['100','100'],['200','1']]);
  const hundred=transport(Array.from({length:100},(_,i)=>row(i)));assert.equal((await run(hundred)).courses.length,100);assert.equal(hundred.calls.length,3);
  const overflow=transport(Array.from({length:201},(_,i)=>row(i)));await rejected(run(overflow));assert.equal(overflow.calls.length,2);
});

test('duplicate/out-of-order enrollments, repeated sections and changed child facts fail; key order alone is harmless',async()=>{
  await rejected(run(transport([row(1),row(1)])));await rejected(run(transport([row(2),row(1)])));
  const duplicateSection=row(2);duplicateSection.section_id=row(1).section_id;duplicateSection.section=row(1).section;await rejected(run(transport([row(1),duplicateSection])));
  const changedTerm=row(2);changedTerm.section.term.label='CHANGED';await rejected(run(transport([row(1),changedTerm])));
  const rows=Array.from({length:101},(_,i)=>row(i));rows[100]=row(99);await rejected(run(transport(rows)));
  const reordered=row(2);reordered.section.term={ends_on:'2027-01-15',starts_on:'2026-09-07',label:'QA Fall',id:termId};assert.equal((await run(transport([row(1),reordered]))).courses.length,2);
});

test('exact count/range proof prevents silently truncated pages and changing totals',async()=>{
  for(const range of [null,'*/?','1-1/1','0-1/1','0-0/0','0-0/9007199254740992'])await rejected(run(transport([row()],undefined,(_url,rows)=>Response.json(rows,{headers:range?{'content-range':range}:{}}))));
  await rejected(run(transport([row()],undefined,(_url,rows)=>Response.json(rows,{headers:{'content-range':'0-0/2'}}))));
  await rejected(run(transport(Array.from({length:101},(_,i)=>row(i)),undefined,(url,rows)=>url.searchParams.get('offset')==='100'?Response.json(rows,{headers:{'content-range':'100-100/102'}}):undefined)));
  await rejected(run(transport([],undefined,()=>Response.json([],{headers:{'content-range':'*/1'}}))));
});

test('HTTP, malformed/oversized/invalid-UTF8 bodies and later-page failures throw safe errors',async()=>{
  for(const status of [403,500])await rejected(run(transport([row()],undefined,()=>new Response('PRIVATE_RESPONSE',{status}))),status===403?403:503);
  for(const response of [()=>new Response('{PRIVATE_INVALID'),()=>Response.json(null),()=>new Response('[]',{headers:{'content-length':String(ownAffairsTimetableLimits.responseBytes+1)}}),()=>new Response(' '.repeat(ownAffairsTimetableLimits.responseBytes+1)),()=>new Response(new Uint8Array([0xff]))])await rejected(run(transport([row()],undefined,response)));
  await rejected(run(transport(Array.from({length:101},(_,i)=>row(i)),undefined,(url)=>url.searchParams.get('offset')==='100'?new Response('PRIVATE_LATER',{status:500}):undefined)));
});

test('shared deadlines abort uncooperative transport and cancel a stalled response stream',async()=>{
  let signal:AbortSignal|undefined;
  const fetchImpl:typeof fetch=async(_input,init)=>{signal=init?.signal??undefined;return new Promise(()=>{});};
  await rejected(load(account,{deadline:Date.now()+30},{fetchImpl}));assert.equal(signal?.aborted,true);
  let cancelled=false;
  const stalled:typeof fetch=async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}));
  await rejected(load(account,{deadline:Date.now()+30},{fetchImpl:stalled}));assert.equal(cancelled,true);
});
test('temporary sample enrollments cannot enter direct timetable answers while real owned rows remain',async()=>{const seed=row(1);seed.source_mode='sample';const io=transport([seed,row(2)]),out=await run(io);assert.deepEqual(out.courses.map(c=>c.code),['QA2']);assert.equal(out.completeness.courses.returned,1);assert.equal(out.completeness.courses.complete,true);});

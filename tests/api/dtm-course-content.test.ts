import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {DtmCourseContentError,dtmCourseContentKinds,dtmCourseContentMaxPayloadBytes,dtmCourseContentMaxResponseBytes,dtmCourseContentPayloadBytes,
  validateDtmCourseContent,validateDtmCourseContentPayload,parseDtmCourseContentData,parseDtmCourseContentCoursesData,parseDtmCourseContentAssignmentData,parseDtmCourseContentReceipt,
  loadDtmCourseContent,loadDtmCourseContentAdmin,loadDtmCourseContentCoursesAdmin,loadDtmCourseContentAssignment,manageDtmCourseContent,
  type DtmCourseContentAccount,type DtmCourseContentReference,type DtmCourseContentTarget,type DtmCourseContentActivity,type DtmCourseContentPageOptions} from '../../server/dtmCourseContent.js';
const userId='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',admin='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',courseId='30000000-0000-4000-8000-000000000001',otherCourse='30000000-0000-4000-8000-000000000002',requestId='40000000-0000-4000-8000-000000000001';
const stamp='2030-01-02T03:04:05.123456+08:00',saving='save_dtm_course_content',deleting='delete_dtm_course_content';
const uuid=(n=1)=>'50000000-0000-4000-8000-'+String(n).padStart(12,'0');
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-key',token:'synthetic-owner-token',user:{id:userId}} as DtmCourseContentAccount;
const manager={...account,token:'synthetic-manager-token',user:{id:admin}} as DtmCourseContentAccount;
const reference=(n=1):DtmCourseContentReference=>({kind:'assignment',id:uuid(n),section:'quizzes'});
const content=()=>({references:[reference(),{...reference(2),kind:'material' as const,section:'materials' as const}]});
const record=()=>({id,userId,courseId,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,...content()});
const course=()=>({id:courseId,userId,title:'Synthetic course',code:'QA',term:'Synthetic term'});
const assignment=(n=1):DtmCourseContentActivity=>({kind:'assignment',id:uuid(n),title:'Synthetic activity '+n,details:'',dueAt:null});
const material=():DtmCourseContentActivity=>({kind:'material',id:uuid(2),title:'Synthetic material',materialKind:'assignment',summary:'',position:1,sourceMode:'sample',sourceUrl:null});
const page=()=>({course:course(),content:record(),activities:[assignment(),material()],total:2,limit:100,nextCursor:null,revision:'a'.repeat(64),unavailableReferenceCount:0});
const target:DtmCourseContentTarget={id,user_id:userId,course_id:courseId,request_id:requestId,expected_version:0};
const payload=()=>({...target,content:content()});
const receipt=(kind:string=saving,version=1)=>({id,userId,courseId,kind,version,summary:'Saved local activity placement.'});
const detail=()=>({assignment:{id:uuid(),userId,courseId,title:'Synthetic activity',details:'literal\ntext',dueAt:null,status:'open',submittedAt:null,sourceMode:'personal',meetingId:null,origin:'manual'}});
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const statusIs=(status:number)=>(error:unknown)=>error instanceof DtmCourseContentError&&error.status===status;
type Call={url:URL;headers:Headers;body:Record<string,unknown>;method:string|undefined;redirect:RequestRedirect|undefined;signal:AbortSignal|null|undefined};
async function mock(handler:(call:Call)=>Response|Promise<Response>,run:()=>void|Promise<void>){const saved=globalThis.fetch;
  globalThis.fetch=(input,init)=>Promise.resolve(handler({url:new URL(String(input)),headers:new Headers(init?.headers),body:JSON.parse(String(init?.body)),method:init?.method,redirect:init?.redirect,signal:init?.signal}));
  try{await run();}finally{globalThis.fetch=saved;}}

test('ordered placement uses backing-table kind, permits an assignment in quizzes, preserves order and does not mutate',()=>{
  const p=payload(),before=structuredClone(p);assert.equal(validateDtmCourseContentPayload(saving,p),null);assert.deepEqual(p,before);
  assert.equal(validateDtmCourseContent({references:[reference(),{...reference(),kind:'material'}]}),null);
  assert.equal(validateDtmCourseContent({references:[]}),null);
  assert.equal(validateDtmCourseContent({references:Array.from({length:1000},(_,i)=>reference(i+1))}),null);
  assert.notEqual(validateDtmCourseContent({references:Array.from({length:1001},(_,i)=>reference(i+1))}),null);
  assert.equal(dtmCourseContentMaxPayloadBytes,131072);assert.ok(dtmCourseContentPayloadBytes(p)<131072);
  const parsed=parseDtmCourseContentData(page(),userId,courseId);parsed.content!.references.reverse();assert.deepEqual(p,before);
  assert.equal(parseDtmCourseContentData(page(),userId,courseId).activities[1].kind,'material');
});

test('strict JSON shape, enums, UUIDs, duplicate refs and mutation bounds are shared with SQL',()=>{
  for(const value of [null,[],{}, {references:[reference(),reference()]},{references:[{...reference(),kind:'quiz'}]},
    {references:[{...reference(),section:'exams'}]},{references:[{...reference(),id:'bad'}]},{references:[{...reference(),position:0}]},
    {references:[{kind:'assignment',id:uuid()}]},{references:[undefined]},{references:[],extra:true}])assert.notEqual(validateDtmCourseContent(value),null);
  for(const patch of [{expected_version:-1},{expected_version:0.1},{expected_version:'0'},{expected_version:999999999},{user_id:'ABCDEF00-0000-4000-8000-000000000001'},
    {id:null},{request_id:'BAD'},{extra:null}])assert.notEqual(validateDtmCourseContentPayload(saving,{...payload(),...patch}),null);
  assert.equal(validateDtmCourseContentPayload(saving,{...payload(),expected_version:999999998}),null);
  for(const key of Object.keys(payload())){const p:Record<string,unknown>={...payload()};delete p[key];assert.notEqual(validateDtmCourseContentPayload(saving,p),null);}
  assert.equal(validateDtmCourseContentPayload(deleting,{...target,expected_version:1}),null);
  assert.notEqual(validateDtmCourseContentPayload(deleting,target),null);assert.notEqual(validateDtmCourseContentPayload(deleting,{...payload(),expected_version:1}),null);
  for(const kind of ['save_dtm_grade_report','constructor',null])assert.notEqual(validateDtmCourseContentPayload(kind,payload()),null);
  assert.equal(dtmCourseContentPayloadBytes({a:'😀',b:null}),24);assert.equal(dtmCourseContentPayloadBytes({a:'\ud800'}),Infinity);
  const circular:Record<string,unknown>={};circular.self=circular;assert.equal(dtmCourseContentPayloadBytes(circular),Infinity);
});

test('strict response preserves literal legacy text but rejects foreign, malformed and oversized data',()=>{
  const value=page();value.course.title='';value.course.code='😀'.repeat(1000);value.activities[0].title='';assert.deepEqual(parseDtmCourseContentData(value,userId,courseId),value);
  assert.deepEqual(parseDtmCourseContentData({...page(),content:null,activities:[],total:0,unavailableReferenceCount:0},userId,courseId).content,null);
  for(const patch of [{course:{...course(),userId:other}},{course:{...course(),id:otherCourse}},{content:{...record(),userId:other}},
    {content:{...record(),version:0}},{content:{...record(),createdAt:'2030-02-30T00:00:00Z'}},{content:{...record(),extra:'secret'}},
    {total:-1},{total:1},{total:Number.MAX_SAFE_INTEGER+1},{revision:'a'.repeat(32)},{limit:99},{unavailableReferenceCount:3},
    {activities:[{...assignment(),downloadUrl:'https://private.invalid'}]},{activities:[{...material(),sourceUrl:'https://outside.invalid'}]},{secret:true}])
    assert.throws(()=>parseDtmCourseContentData({...page(),...patch},userId,courseId),statusIs(503));
  assert.throws(()=>parseDtmCourseContentData({...page(),content:null,unavailableReferenceCount:1},userId,courseId),statusIs(503));
  assert.throws(()=>parseDtmCourseContentData({...page(),course:{...course(),title:'x'.repeat(dtmCourseContentMaxResponseBytes)}},userId,courseId),statusIs(503));
});

test('page cursor is backing-kind plus ID, never a partial or duplicate first page',()=>{
  const activities=Array.from({length:100},(_,i)=>assignment(i+1)),cursor={kind:'assignment' as const,id:uuid(100)};
  const first={...page(),activities,total:101,nextCursor:cursor};assert.deepEqual(parseDtmCourseContentData(first,userId,courseId),first);
  const second={...first,activities:[material()],nextCursor:null};assert.deepEqual(parseDtmCourseContentData(second,userId,courseId,cursor),second);
  for(const patch of [{activities:activities.slice(0,99)},{nextCursor:{...cursor,id:uuid(99)}},{nextCursor:null},{activities:[...activities,assignment(101)]},
    {activities:[activities[1],activities[0]]},{activities:[assignment(),assignment()]},{total:100}])assert.throws(()=>parseDtmCourseContentData({...first,...patch},userId,courseId),statusIs(503));
  assert.throws(()=>parseDtmCourseContentData({...page(),activities:[assignment(100)],total:101},userId,courseId,cursor),statusIs(503));
});

test('own read invokes only caller-bound RPC and propagates exact cursor with JWT',async()=>{
  const calls:Call[]=[];await mock(call=>{calls.push(call);return json(page());},async()=>assert.deepEqual(await loadDtmCourseContent(account,{courseId}),page()));
  assert.equal(calls.length,1);assert.equal(calls[0].url.pathname,'/rest/v1/rpc/dtm_course_content_read');assert.deepEqual(calls[0].body,{p_course_id:courseId});
  assert.equal(calls[0].headers.get('authorization'),'Bearer synthetic-owner-token');assert.equal(calls[0].headers.get('apikey'),'synthetic-key');assert.equal(calls[0].method,'POST');assert.equal(calls[0].redirect,'error');assert.ok(calls[0].signal);
  await mock(call=>{assert.deepEqual(call.body,{p_course_id:courseId,p_after_kind:'assignment',p_after_id:uuid()});return json({...page(),activities:[material()]});},
    async()=>assert.equal((await loadDtmCourseContent(account,{courseId,afterKind:'assignment',afterId:uuid()})).activities.length,1));
});

test('admin loads are exact selected-owner RPCs and never broaden legacy reads',async()=>{
  const calls:Call[]=[];await mock(call=>{calls.push(call);return json(call.url.pathname.endsWith('/dtm_course_content_access')?{userId:admin,canManage:true}:page());},
    async()=>assert.deepEqual(await loadDtmCourseContentAdmin(manager,{userId,courseId}),page()));
  assert.deepEqual(calls.map(c=>c.url.pathname),['/rest/v1/rpc/dtm_course_content_access','/rest/v1/rpc/dtm_course_content_admin']);assert.deepEqual(calls[1].body,{p_user_id:userId,p_course_id:courseId});
  for(const access of [{userId:admin,canManage:false},{userId:other,canManage:true},{userId:admin,canManage:true,extra:0}]){let count=0;
    await mock(()=>{count++;return json(access);},async()=>assert.rejects(loadDtmCourseContentAdmin(manager,{userId,courseId}),statusIs(403)));assert.equal(count,1);}
});

test('admin course picker preserves blank/long legacy metadata and requires ascending complete page cursor',async()=>{
  const courses=Array.from({length:100},(_,i)=>({...course(),id:uuid(i+1)})),data={courses,limit:100,nextCursor:uuid(100)};
  assert.deepEqual(parseDtmCourseContentCoursesData(data,userId),data);
  for(const patch of [{nextCursor:uuid(99)},{courses:courses.slice(1)},{courses:[{...course(),userId:other}]},{courses:[{...course(),term:null}]},{limit:101}])assert.throws(()=>parseDtmCourseContentCoursesData({...data,...patch},userId),statusIs(503));
  assert.throws(()=>parseDtmCourseContentCoursesData({courses:[course()],limit:100,nextCursor:null},userId,courseId),statusIs(503));
  const result={courses:[{...course(),id:uuid(101),title:'',term:'😀'.repeat(1000)}],limit:100,nextCursor:null};
  await mock(call=>{if(call.url.pathname.endsWith('/dtm_course_content_access'))return json({userId:admin,canManage:true});assert.equal(call.url.pathname,'/rest/v1/rpc/dtm_grade_report_courses_admin');assert.deepEqual(call.body,{p_user_id:userId,p_after_id:uuid(100)});return json(result);},
    async()=>assert.deepEqual(await loadDtmCourseContentCoursesAdmin(manager,{userId,afterId:uuid(100)}),result));
});

test('assignment lookup binds caller and course; null is explicit and tracker status is not a submission record',async()=>{
  const data=detail();assert.deepEqual(parseDtmCourseContentAssignmentData(data,userId,courseId,uuid()),data);
  for(const patch of [{userId:other},{courseId:otherCourse},{id:uuid(2)},{submittedAt:stamp},{sourceMode:'sample'},{origin:'unknown'},{grade:100},{meetingId:'bad'}])
    assert.throws(()=>parseDtmCourseContentAssignmentData({assignment:{...data.assignment,...patch}},userId,courseId,uuid()),statusIs(503));
  await mock(call=>{assert.deepEqual(call.body,{p_course_id:courseId,p_assignment_id:uuid()});assert.equal(call.url.pathname,'/rest/v1/rpc/dtm_course_content_assignment');return json(data);},
    async()=>assert.deepEqual(await loadDtmCourseContentAssignment(account,{courseId,assignmentId:uuid()}),data));
  await mock(()=>json({assignment:null}),async()=>assert.deepEqual(await loadDtmCourseContentAssignment(account,{courseId,assignmentId:uuid()}),{assignment:null}));
});

test('invalid options, half cursors and invalid credentials fail before any transport',async()=>{let count=0;await mock(()=>{count++;return json({});},async()=>{
  for(const options of [null,{},[],{courseId,userId:other},{courseId,afterKind:'assignment'},{courseId,afterId:uuid()},{courseId,afterKind:'quiz',afterId:uuid()},{courseId,afterKind:undefined,afterId:undefined}])
    await assert.rejects(loadDtmCourseContent(account,options as DtmCourseContentPageOptions),statusIs(400));
  await assert.rejects(loadDtmCourseContentAdmin(manager,{courseId,userId,afterId:uuid()}),statusIs(400));
  await assert.rejects(loadDtmCourseContentCoursesAdmin(manager,{userId,afterId:undefined}),statusIs(400));
  await assert.rejects(loadDtmCourseContentAssignment(account,{courseId,assignmentId:'bad'}),statusIs(400));
  for(const patch of [{user:{id:''}},{url:'https://other.invalid'},{token:''},{key:''}])await assert.rejects(loadDtmCourseContent({...account,...patch} as DtmCourseContentAccount,{courseId}),statusIs(401));
  await assert.rejects(loadDtmCourseContent({...account,requestDeadline:NaN},{courseId}),statusIs(503));
  await assert.rejects(manageDtmCourseContent(manager,saving,{...payload(),extra:true}),statusIs(400));
});assert.equal(count,0);});

test('caller and selected target/payload are immutable across authorization waits',async()=>{
  const changing={...manager,user:{...manager.user}},p=payload(),original=structuredClone(p),calls:Call[]=[];
  await mock(call=>{calls.push(call);return json(call.url.pathname.endsWith('/dtm_course_content_access')?{userId:admin,canManage:true}:receipt());},async()=>{
    const pending=manageDtmCourseContent(changing,saving,p);changing.user.id=other;changing.token='foreign-token';changing.url='https://other.invalid';p.user_id=other;p.content.references.reverse();
    assert.deepEqual(await pending,receipt());
  });assert.deepEqual(calls[1].body,{p_kind:saving,p_payload:original});assert.ok(calls.every(c=>c.headers.get('authorization')==='Bearer synthetic-manager-token'));
  const options={userId,courseId};await mock(call=>json(call.url.pathname.endsWith('/dtm_course_content_access')?{userId:admin,canManage:true}:page()),async()=>{
    const pending=loadDtmCourseContentAdmin(manager,options);options.userId=other;options.courseId=otherCourse;assert.equal((await pending).course.userId,userId);
  });
});

test('save/delete/replay preserves exact IDs and rejects mismatched receipts',async()=>{
  for(const kind of dtmCourseContentKinds){const p=kind===saving?payload():{...target,expected_version:1},expected=receipt(kind,p.expected_version+1),bodies:unknown[]=[];
    await mock(call=>{if(call.url.pathname.endsWith('/dtm_course_content_access'))return json({userId:admin,canManage:true});bodies.push(call.body);return json(expected);},async()=>{
      assert.deepEqual(await manageDtmCourseContent(manager,kind,p),expected);assert.deepEqual(await manageDtmCourseContent(manager,kind,p),expected);
    });assert.deepEqual(bodies,[{p_kind:kind,p_payload:p},{p_kind:kind,p_payload:p}]);
  }
  for(const patch of [{id:other},{userId:other},{courseId:otherCourse},{kind:deleting},{version:2},{summary:''},{extra:0}])assert.throws(()=>parseDtmCourseContentReceipt({...receipt(),...patch},saving,target),statusIs(503));
});

test('provider failures map to safe statuses without response body leakage or fallback writes',async()=>{
  for(const [input,output] of [[400,400],[401,401],[403,403],[409,409],[413,400],[500,503],[302,503]]){let calls=0;
    await mock(()=>{calls++;return json({secret:'private provider message'},input);},async()=>assert.rejects(loadDtmCourseContent(account,{courseId}),(error:unknown)=>statusIs(output)(error)&&error instanceof Error&&!error.message.includes('private provider')));assert.equal(calls,1);
  }
  await mock(()=>{throw Error('private provider message');},async()=>assert.rejects(loadDtmCourseContent(account,{courseId}),statusIs(503)));
});

test('bounded UTF8 stream rejects oversize, malformed JSON/Unicode and timeout without waiting forever',async()=>{
  for(const response of [new Response('x'.repeat(dtmCourseContentMaxResponseBytes+1)),new Response('{'),new Response(new Uint8Array([0xff])),new Response(null),
    new Response('{}',{headers:{'content-length':String(dtmCourseContentMaxResponseBytes+1)}})])
    await mock(()=>response,async()=>assert.rejects(loadDtmCourseContent(account,{courseId}),statusIs(503)));
  const text=JSON.stringify({...page(),course:{...course(),title:'😀'}}),bytes=new TextEncoder().encode(text);let at=0;
  await mock(()=>new Response(new ReadableStream({pull(controller){if(at<bytes.length)controller.enqueue(bytes.slice(at,++at));else controller.close();}})),async()=>assert.equal((await loadDtmCourseContent(account,{courseId})).course.title,'😀'));
  let cancelled=false;const keepAlive=setTimeout(()=>{},1000);try{
    await mock(()=>new Response(new ReadableStream({cancel(){cancelled=true;}})),async()=>assert.rejects(loadDtmCourseContent({...account,requestDeadline:Date.now()+25},{courseId}),statusIs(503)));
    assert.equal(cancelled,true);
  }finally{clearTimeout(keepAlive);}
});

test('migration uses isolated own RLS, exact-owner read RPCs, full catalog revision, target locks, receipts and tombstones',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261114010000_dtm_course_content.sql',import.meta.url),'utf8');
  assert.match(sql,/foreign key\(course_id,user_id\) references public\.dtm_courses\(id,user_id\) on delete cascade/);
  assert.match(sql,/create policy dtm_course_contents_own_read[\s\S]*?user_id=\(select auth.uid\(\)\)/);
  assert.doesNotMatch(sql,/alter (?:table|policy) (?:public\.)?(?:dtm_courses|dtm_materials|affairs_assignments|dtm_grade)/i);
  assert.match(sql,/eligible as materialized/);assert.match(sql,/summary as\(select count\(\*\).*from eligible\)/);
  assert.match(sql,/sha256\(convert_to\(jsonb_build_object\('course',to_jsonb\(c\),'content',layout.value,'activities',summary.fingerprint\)/);
  assert.match(sql,/for share of a,s/);assert.match(sql,/for share of m/);
  assert.match(sql,/order by value->>'kind',value->>'id'/);assert.match(sql,/receipt.payload<>p_payload/);
  assert.match(sql,/Deleted course content IDs cannot be reused/);assert.match(sql,/insert into public.affairs_agent_audit/);
  assert.match(sql,/source_mode=c.source_mode/);assert.match(sql,/p_after_kind is null\)<>\(p_after_id is null/);
});

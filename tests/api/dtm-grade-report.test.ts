import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {DtmGradeReportError,dtmGradeReportKinds,dtmGradeReportMaxPayloadBytes,dtmGradeReportMaxResponseBytes,dtmGradeReportPayloadBytes,dtmGradeReportReadSource,
  validateDtmGradeReportContent,validateDtmGradeReportPayload,parseDtmGradeReportData,parseDtmGradeReportReceipt,parseDtmGradeReportCoursesData,parseDtmGradeReportOverviewData,
  loadDtmGradeReport,loadDtmGradeReportAdmin,loadDtmGradeReportCoursesAdmin,loadDtmGradeReportOverview,manageDtmGradeReport,
  type DtmGradeReportAccount,type DtmGradeCells,type DtmGradeReportItem,type DtmGradeReportContent,type DtmGradeReportTarget} from '../../server/dtmGradeReport.js';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',admin='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',courseId='30000000-0000-4000-8000-000000000001',otherCourse='30000000-0000-4000-8000-000000000002',requestId='40000000-0000-4000-8000-000000000001';
const stamp='2030-01-02T03:04:05.123456+08:00',saving='save_dtm_grade_report',deleting='delete_dtm_grade_report';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-public-key',token:'synthetic-owner-token',user:{id:owner}} as DtmGradeReportAccount;
const manager={...account,token:'synthetic-admin-token',user:{id:admin}} as DtmGradeReportAccount;
const cells=():DtmGradeCells=>({score:null,maximum:null,gradeText:null,rangeText:null,percentageText:null,weightText:null,weightNote:null,rankText:null,feedbackText:null,contributionText:null});
const item=(index=1):DtmGradeReportItem=>({...cells(),id:'50000000-0000-4000-8000-'+String(index).padStart(12,'0'),label:'Synthetic assessment '+index,activityKind:'assignment'});
const content=():DtmGradeReportContent=>({items:[{...item(),score:0,maximum:100,gradeText:'',rangeText:'0–100',weightText:'0.00 %',weightNote:'(empty)',contributionText:'0.00 %'}],total:{...cells(),gradeText:'A (literal)',rangeText:'0–100',feedbackText:' '}});
const target:DtmGradeReportTarget={id,user_id:owner,course_id:courseId,request_id:requestId,expected_version:0};
const payload=()=>({...target,report:content()});
const record=()=>({id,userId:owner,courseId,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,...content()});
const row=()=>({id,user_id:owner,course_id:courseId,source_mode:'local_demo',version:1,created_at:stamp,updated_at:stamp,deleted_at:null,report:content()});
const course=(index=1)=>({id:'30000000-0000-4000-8000-'+String(index).padStart(12,'0'),userId:owner,title:'Synthetic course '+index,code:'SYN'+index,term:'Local term'});
const receipt=(kind=saving,version=1)=>({id,userId:owner,courseId,kind,version,summary:'Saved explicit local cells.'});
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const statusIs=(status:number)=>(error:unknown)=>error instanceof DtmGradeReportError&&error.status===status;
type Call={url:URL;headers:Headers;method:string;body:Record<string,unknown>|undefined;signal:AbortSignal|null|undefined;redirect:RequestRedirect|undefined};
async function mockFetch(handler:(call:Call)=>Response|Promise<Response>,run:()=>void|Promise<void>){
  const saved=globalThis.fetch;globalThis.fetch=(input,init)=>Promise.resolve(handler({url:new URL(String(input)),headers:new Headers(init?.headers),method:init?.method??'GET',
    body:init?.body?JSON.parse(String(init.body)):undefined,signal:init?.signal,redirect:init?.redirect}));
  try{await run();}finally{globalThis.fetch=saved;}
}

test('literal cells preserve null, blank, zero, totals and order without inference or legacy links',()=>{
  const p=payload();p.report.items.push({...item(2),score:82,maximum:100,gradeText:null,percentageText:'not numerically derived'});
  assert.equal(validateDtmGradeReportContent({items:[],total:null}),null);assert.equal(validateDtmGradeReportPayload(saving,p),null);
  assert.equal(validateDtmGradeReportContent(p.report),null);const before=JSON.stringify(p);
  const data=parseDtmGradeReportData({report:{...record(),...p.report}},owner,courseId);
  assert.equal(data.report?.items[0].score,0);assert.equal(data.report?.items[0].gradeText,'');assert.equal(data.report?.items[1].gradeText,null);
  assert.equal(data.report?.items[1].percentageText,'not numerically derived');assert.equal(data.report?.total?.gradeText,'A (literal)');
  assert.deepEqual(data.report?.items.map(r=>r.id),p.report.items.map(r=>r.id));assert.equal(JSON.stringify(p),before);
  data.report!.items[0].label='changed copy';assert.equal(p.report.items[0].label,'Synthetic assessment 1');
  for(const patch of [{categoryId:'invented'},{legacyGradeItemId:id},{assignmentId:id},{official:true},{fileUrl:'/secret'}])
    assert.ok(validateDtmGradeReportContent({...p.report,items:[{...item(),...patch}]}));
});

test('exact action/field validation rejects missing, unknown, duplicate, malformed and unsafe data',()=>{
  const p=payload();for(const key of Object.keys(p)){const missing:Record<string,unknown>={...p};delete missing[key];assert.ok(validateDtmGradeReportPayload(saving,missing),key);}
  for(const key of Object.keys(item())){const missing:Record<string,unknown>={...item()};delete missing[key];assert.ok(validateDtmGradeReportContent({items:[missing],total:null}),key);}
  for(const kind of [null,undefined,{},[],'','constructor','__proto__','save_dtm_grade'])assert.ok(validateDtmGradeReportPayload(kind,p));
  for(const patch of [{id:'bad'},{user_id:null},{course_id:otherCourse.toUpperCase().replace('3000','ABCD')},{expected_version:'0'},
    {expected_version:0.5},{expected_version:-1},{expected_version:999999999},{extra:null},{report:undefined}])assert.ok(validateDtmGradeReportPayload(saving,{...p,...patch}));
  assert.equal(validateDtmGradeReportPayload(deleting,{...target,expected_version:1}),null);
  assert.ok(validateDtmGradeReportPayload(deleting,target));assert.ok(validateDtmGradeReportPayload(deleting,{...p,expected_version:1}));
  assert.equal(validateDtmGradeReportPayload(saving,{...p,expected_version:999999998}),null);
  for(const report of [null,[],{},Object.create(content()),{...content(),extra:0},{items:[item(),item()],total:null},
    {items:Array(2),total:null},{items:Array.from({length:501},(_,i)=>item(i+1)),total:null}])assert.ok(validateDtmGradeReportContent(report));
  for(const patch of [{id:'bad'},{activityKind:'quiz'},{activityKind:undefined},{label:''},{label:'\t\n\u00a0\u3000\ufeff'},{label:'x'.repeat(161)},
    {feedbackText:'x'.repeat(2001)},{gradeText:'x'.repeat(81)},{label:'\ud800'},{feedbackText:'\u0000'},
    {score:'0'},{score:NaN},{score:Infinity},{score:-1},{score:1.001},{maximum:0},{maximum:1000001},{score:2,maximum:1}])
    assert.ok(validateDtmGradeReportContent({items:[{...item(),...patch}],total:null}),JSON.stringify(patch));
  for(const patch of [{label:'😀'.repeat(160)},{score:1000000,maximum:1000000},{score:0,maximum:null},{score:null,maximum:0.01},
    {feedbackText:'\n literal\t'},{activityKind:null}])assert.equal(validateDtmGradeReportContent({items:[{...item(),...patch}],total:null}),null);
});

test('JSONB budgets count Unicode, escaping and full envelopes; count and byte bounds are independent',()=>{
  assert.equal(dtmGradeReportPayloadBytes({text:'😀\u0001'}),new TextEncoder().encode('{"text": "😀\\u0001"}').byteLength);
  assert.equal(dtmGradeReportPayloadBytes({text:'x'.repeat(131060)}),131072);
  const invalid:Record<string,unknown>={};invalid.self=invalid;
  for(const value of [invalid,{a:undefined},{a:NaN},{a:new Date()},{a:'\ud800'},{a:'\0'}])assert.equal(dtmGradeReportPayloadBytes(value),Infinity);
  const p=payload();p.report={items:Array.from({length:100},(_,i)=>({...item(i+1),feedbackText:''})),total:null};
  for(const row of p.report.items){const remaining=dtmGradeReportMaxPayloadBytes-dtmGradeReportPayloadBytes(p);row.feedbackText='x'.repeat(Math.min(2000,remaining));if(remaining<=2000)break;}
  assert.equal(dtmGradeReportPayloadBytes(p),131072);assert.equal(validateDtmGradeReportPayload(saving,p),null);
  const blank=p.report.items.find(row=>row.feedbackText==='');assert.ok(blank);blank.feedbackText='x';
  assert.equal(dtmGradeReportPayloadBytes(p),131073);assert.ok(validateDtmGradeReportPayload(saving,p));
  assert.equal(validateDtmGradeReportContent(p.report),null,'report alone fits, complete envelope does not');
  assert.ok(validateDtmGradeReportContent({items:Array.from({length:500},(_,i)=>item(i+1)),total:null}),'500 rows still must fit the byte bound');
});

test('strict report parser denies foreign/null ownership, added capabilities, bad timestamps and numeric coercion',()=>{
  assert.deepEqual(parseDtmGradeReportData({report:null},owner,courseId),{report:null});
  assert.deepEqual(parseDtmGradeReportData({report:record()},owner,courseId),{report:record()});
  for(const patch of [{userId:other},{userId:null},{courseId:otherCourse},{sourceMode:'official'},{version:0},{version:'1'},{version:1000000000},
    {createdAt:'2030-02-30T00:00:00Z'},{updatedAt:'2030-01-01T24:00:00Z'},{updatedAt:null},{downloadUrl:'/secret'},{total:undefined}])
    assert.throws(()=>parseDtmGradeReportData({report:{...record(),...patch}},owner,courseId),statusIs(503));
  for(const value of [null,[],{report:undefined},{report:null,extra:0}])assert.throws(()=>parseDtmGradeReportData(value,owner,courseId),statusIs(503));
  assert.throws(()=>parseDtmGradeReportData({report:null},'',courseId),statusIs(503));
  assert.throws(()=>parseDtmGradeReportData({report:null},owner,''),statusIs(503));
});

test('owner load checks course ownership before reading one active report with exact caller JWT',async()=>{
  const calls:Call[]=[];
  await mockFetch(call=>{calls.push(call);return json(call.url.pathname.endsWith('/dtm_courses')?[{id:courseId,user_id:owner}]:[row()]);},async()=>{
    assert.deepEqual(await loadDtmGradeReport(account,{courseId}),{report:record()});
  });
  assert.equal(calls.length,2);assert.deepEqual(Object.fromEntries(calls[0].url.searchParams),{select:'id,user_id',id:'eq.'+courseId,user_id:'eq.'+owner,limit:'2'});
  assert.deepEqual(Object.fromEntries(calls[1].url.searchParams),{select:dtmGradeReportReadSource.select,order:'id.asc',limit:'2',deleted_at:'is.null',user_id:'eq.'+owner,course_id:'eq.'+courseId});
  for(const call of calls){assert.equal(call.headers.get('authorization'),'Bearer synthetic-owner-token');assert.equal(call.headers.get('apikey'),'synthetic-public-key');assert.equal(call.redirect,'error');assert.ok(call.signal);}
  await mockFetch(call=>json(call.url.pathname.endsWith('/dtm_courses')?[{id:courseId,user_id:owner}]:[]),async()=>assert.deepEqual(await loadDtmGradeReport(account,{courseId}),{report:null}));
  for(const courses of [[],[{id:courseId,user_id:other}],[{id:otherCourse,user_id:owner}],[{id:courseId,user_id:owner,extra:0}],[{id:courseId,user_id:owner},{id:courseId,user_id:owner}]]){
    let count=0;await mockFetch(()=>{count++;return json(courses);},async()=>assert.rejects(loadDtmGradeReport(account,{courseId}),statusIs(courses.length?503:403)));assert.equal(count,1);
  }
});

test('duplicate, foreign and deleted report rows are unavailable, never silently absent',async()=>{
  for(const rows of [[row(),row()],[{...row(),user_id:other}],[{...row(),course_id:otherCourse}],[{...row(),deleted_at:stamp}],
    [{...row(),private_url:'/secret'}],[{...row(),report:{...content(),userId:owner}}],null,{}])
    await mockFetch(call=>json(call.url.pathname.endsWith('/dtm_courses')?[{id:courseId,user_id:owner}]:rows),async()=>assert.rejects(loadDtmGradeReport(account,{courseId}),statusIs(503)));
});

test('admin exact-target read uses narrow metadata RPC, not a broadened legacy course table read',async()=>{
  const calls:Call[]=[];await mockFetch(call=>{calls.push(call);if(call.url.pathname.endsWith('/dtm_grade_report_access'))return json({userId:admin,canManage:true});
    if(call.url.pathname.endsWith('/dtm_grade_report_courses_admin'))return json({courses:[course()],limit:100,nextCursor:null});return json([row()]);
  },async()=>assert.deepEqual(await loadDtmGradeReportAdmin(manager,{userId:owner,courseId}),{report:record()}));
  assert.equal(calls.length,3);assert.deepEqual(calls[1].body,{p_user_id:owner,p_course_id:courseId});
  assert.equal(calls.some(c=>c.url.pathname.endsWith('/dtm_courses')),false);
  for(const access of [{userId:admin,canManage:false},{userId:other,canManage:true},{userId:admin,canManage:true,extra:0}]){
    let count=0;await mockFetch(()=>{count++;return json(access);},async()=>assert.rejects(loadDtmGradeReportAdmin(manager,{userId:owner,courseId}),statusIs(403)));assert.equal(count,1);
  }
  await mockFetch(call=>json(call.url.pathname.endsWith('/dtm_grade_report_access')?{userId:admin,canManage:true}:{courses:[],limit:100,nextCursor:null}),async()=>assert.rejects(loadDtmGradeReportAdmin(manager,{userId:owner,courseId}),statusIs(403)));
});

test('100-row course pages require exact owner, ascending IDs and truthful next cursor',async()=>{
  const courses=Array.from({length:100},(_,i)=>course(i+1)),page={courses,limit:100,nextCursor:courses[99].id};
  assert.deepEqual(parseDtmGradeReportCoursesData(page,owner),page);
  assert.deepEqual(parseDtmGradeReportCoursesData({courses:[course(101)],limit:100,nextCursor:null},owner,courses[99].id).courses,[course(101)]);
  for(const changed of [{...page,limit:101},{...page,nextCursor:course(101).id},{...page,courses:courses.slice(1)},
    {...page,courses:[...courses,course(101)]},{...page,courses:[courses[1],courses[0]]},{courses:[{...course(),userId:other}],limit:100,nextCursor:null},
    {courses:[{...course(),gradeText:null}],limit:100,nextCursor:null},{courses:[{...course(),title:null}],limit:100,nextCursor:null}])
    assert.throws(()=>parseDtmGradeReportCoursesData(changed,owner),statusIs(503));
  assert.throws(()=>parseDtmGradeReportCoursesData({courses:[course()],limit:100,nextCursor:null},owner,courseId),statusIs(503));
  const calls:Call[]=[];await mockFetch(call=>{calls.push(call);return json(call.url.pathname.endsWith('/dtm_grade_report_access')?{userId:admin,canManage:true}:{courses:[course(101)],limit:100,nextCursor:null});},
    async()=>assert.equal((await loadDtmGradeReportCoursesAdmin(manager,{userId:owner,afterId:courses[99].id})).courses[0].id,course(101).id));
  assert.deepEqual(calls[1].body,{p_user_id:owner,p_after_id:courses[99].id});
});

test('overview reads only caller RPC and literal total grade, preserving blank/null/zero independently',async()=>{
  const courses=[{...course(1),gradeText:null},{...course(2),gradeText:''},{...course(3),gradeText:'0'}],page={courses,limit:100,nextCursor:null};
  assert.deepEqual(parseDtmGradeReportOverviewData(page,owner),page);
  const calls:Call[]=[];await mockFetch(call=>{calls.push(call);return json(page);},async()=>assert.deepEqual(await loadDtmGradeReportOverview(account),page));
  assert.equal(calls.length,1);assert.equal(calls[0].url.pathname,'/rest/v1/rpc/dtm_grade_report_overview');assert.deepEqual(calls[0].body,{});
  for(const gradeText of [undefined,0,{},'x'.repeat(81)])assert.throws(()=>parseDtmGradeReportOverviewData({...page,courses:[{...course(),gradeText}]},owner),statusIs(503));
  assert.throws(()=>parseDtmGradeReportOverviewData({...page,courses:[{...courses[0],userId:other}]},owner),statusIs(503));
  await mockFetch(call=>{assert.deepEqual(call.body,{p_after_id:courseId});return json({courses:[{...course(2),gradeText:null}],limit:100,nextCursor:null});},
    async()=>assert.equal((await loadDtmGradeReportOverview(account,{afterId:courseId})).courses[0].id,otherCourse));
});

test('invalid query/account scopes fail before transport; no caller-controlled admin or owner override',async()=>{
  let calls=0;await mockFetch(()=>{calls++;return json({});},async()=>{
    for(const options of [null,{},[],{courseId,userId:other},{courseId:'bad'}])await assert.rejects(loadDtmGradeReport(account,options as {courseId:string}),statusIs(400));
    for(const options of [null,{},[],{courseId,userId:owner,admin:true},{courseId,userId:'bad'}])await assert.rejects(loadDtmGradeReportAdmin(manager,options as {courseId:string;userId:string}),statusIs(400));
    for(const options of [null,{userId:owner,afterId:undefined},{userId:owner,courseId},{userId:owner,afterId:'bad'}])await assert.rejects(loadDtmGradeReportCoursesAdmin(manager,options as {userId:string}),statusIs(400));
    for(const options of [null,{userId:other},{afterId:undefined},{afterId:'bad'},{admin:true}])await assert.rejects(loadDtmGradeReportOverview(account,options as {afterId:string}),statusIs(400));
    for(const patch of [{user:{id:''}},{url:'https://other.invalid'},{token:''},{key:''}])await assert.rejects(loadDtmGradeReport({...account,...patch} as DtmGradeReportAccount,{courseId}),statusIs(401));
    await assert.rejects(loadDtmGradeReport({...account,requestDeadline:NaN},{courseId}),statusIs(503));
    await assert.rejects(manageDtmGradeReport(manager,saving,{...payload(),extra:true}),statusIs(400));
  });assert.equal(calls,0);
});

test('caller, selected owner/course and nested report are captured synchronously before authorization awaits',async()=>{
  const changing={...manager,user:{...manager.user}},p=payload(),original=structuredClone(p),calls:Call[]=[];
  await mockFetch(call=>{calls.push(call);return json(call.url.pathname.endsWith('/dtm_grade_report_access')?{userId:admin,canManage:true}:receipt());},async()=>{
    const pending=manageDtmGradeReport(changing,saving,p);
    changing.user.id=other;changing.token='changed-token';changing.url='https://other.invalid';p.user_id=other;p.course_id=otherCourse;p.report.items[0].gradeText='mutated';
    assert.deepEqual(await pending,receipt());
  });
  assert.deepEqual(calls[1].body,{p_kind:saving,p_payload:original});for(const call of calls){assert.equal(call.headers.get('authorization'),'Bearer synthetic-admin-token');assert.equal(call.url.hostname,'xiftudmvxphxcjtmfmib.supabase.co');}
  const options={userId:owner,courseId};await mockFetch(call=>json(call.url.pathname.endsWith('/dtm_grade_report_access')?{userId:admin,canManage:true}:call.url.pathname.endsWith('/dtm_grade_report_courses_admin')?{courses:[course()],limit:100,nextCursor:null}:[row()]),async()=>{
    const pending=loadDtmGradeReportAdmin(manager,options);options.userId=other;options.courseId=otherCourse;assert.equal((await pending).report?.userId,owner);
  });
});

test('save/delete/replay transport preserves exact request and validates receipt identity/kind/version',async()=>{
  for(const kind of dtmGradeReportKinds){const p=kind===saving?payload():{...target,expected_version:1};const expected=receipt(kind,p.expected_version+1),bodies:unknown[]=[];
    await mockFetch(call=>{if(call.url.pathname.endsWith('/dtm_grade_report_access'))return json({userId:admin,canManage:true});bodies.push(call.body);return json(expected);},async()=>{
      assert.deepEqual(await manageDtmGradeReport(manager,kind,p),expected);assert.deepEqual(await manageDtmGradeReport(manager,kind,p),expected);
    });assert.deepEqual(bodies,[{p_kind:kind,p_payload:p},{p_kind:kind,p_payload:p}]);
  }
  for(const patch of [{id:other},{userId:other},{courseId:otherCourse},{version:2},{kind:deleting},{summary:''},{summary:'x'.repeat(201)},{secret:'no'}])
    assert.throws(()=>parseDtmGradeReportReceipt({...receipt(),...patch},saving,target),statusIs(503));
  await mockFetch(call=>json(call.url.pathname.endsWith('/dtm_grade_report_access')?{userId:admin,canManage:true}:{...receipt(),version:2}),async()=>assert.rejects(manageDtmGradeReport(manager,saving,payload()),statusIs(503)));
});

test('provider errors map to safe statuses without exposing bodies or issuing fallback calls',async()=>{
  for(const [input,output] of [[400,400],[401,401],[403,403],[409,409],[413,400],[422,400],[500,503],[302,503]]){
    let calls=0;await mockFetch(()=>{calls++;return json({message:'PRIVATE PROVIDER DETAILS'},input);},async()=>{
      await assert.rejects(loadDtmGradeReportOverview(account),(error:unknown)=>statusIs(output)(error)&&error instanceof Error&&!error.message.includes('PRIVATE'));
    });assert.equal(calls,1);
  }
  await mockFetch(()=>{throw Error('PRIVATE NETWORK');},async()=>assert.rejects(loadDtmGradeReportOverview(account),statusIs(503)));
});

test('bounded decoding rejects oversized/malformed UTF8 and aborts stalled streams under one request deadline',async()=>{
  let calls=0;await mockFetch(()=>{calls++;return json({});},async()=>assert.rejects(loadDtmGradeReportOverview({...account,requestDeadline:Date.now()-1}),statusIs(503)));assert.equal(calls,0);
  for(const response of [new Response('x'.repeat(dtmGradeReportMaxResponseBytes+1)),new Response('{}',{headers:{'content-length':String(dtmGradeReportMaxResponseBytes+1)}}),
    new Response(new Uint8Array([0xff])),new Response('{invalid')])await mockFetch(()=>response,async()=>assert.rejects(loadDtmGradeReportOverview(account),statusIs(503)));
  const savedTimeout=AbortSignal.timeout,controller=new AbortController();let cancelled=false;AbortSignal.timeout=()=>controller.signal;
  try{await mockFetch(()=>new Response(new ReadableStream({cancel(){cancelled=true;}})),async()=>{
    const pending=loadDtmGradeReportOverview(account);const timer=setTimeout(()=>controller.abort(),1);
    try{await assert.rejects(pending,statusIs(503));assert.equal(cancelled,true);}finally{clearTimeout(timer);}
  });}finally{AbortSignal.timeout=savedTimeout;}
});

test('shared deadline covers access+metadata+report, and a full write-bounded overview page fits response cap',async()=>{
  const savedNow=Date.now;let clock=1000,calls=0;Date.now=()=>clock;
  try{await mockFetch(()=>{calls++;clock+=8000;return json({userId:admin,canManage:true});},async()=>assert.rejects(loadDtmGradeReportAdmin({...manager,requestDeadline:2000},{userId:owner,courseId}),statusIs(503)));assert.equal(calls,1);}finally{Date.now=savedNow;}
  const courses=Array.from({length:100},(_,i)=>({...course(i+1),title:'😀'.repeat(160),code:'😀'.repeat(32),term:'😀'.repeat(80),gradeText:'😀'.repeat(80)}));
  const page={courses,limit:100,nextCursor:courses[99].id};assert.ok(new TextEncoder().encode(JSON.stringify(page)).length<dtmGradeReportMaxResponseBytes);
  assert.equal(parseDtmGradeReportOverviewData(page,owner).courses.length,100);
});

test('legacy course metadata remains literal instead of applying current write limits; whole DTO remains bounded',()=>{
  const rows=[{...course(),title:'😀'.repeat(600),code:'',term:'\u00a0\u3000\ufeff'}, {...course(2),title:'',code:'x'.repeat(600),term:' '}];
  const page={courses:rows,limit:100,nextCursor:null};assert.deepEqual(parseDtmGradeReportCoursesData(page,owner),page);
  const overview={...page,courses:rows.map(row=>({...row,gradeText:null}))};assert.deepEqual(parseDtmGradeReportOverviewData(overview,owner),overview);
  for(const field of ['title','code','term'])for(const invalid of [null,0,'\ud800','\u0000'])
    assert.throws(()=>parseDtmGradeReportCoursesData({...page,courses:[{...course(),[field]:invalid}]},owner),statusIs(503));
  for(const parse of [parseDtmGradeReportCoursesData,parseDtmGradeReportOverviewData]){
    const large={courses:[{...course(),title:'',...(parse===parseDtmGradeReportOverviewData?{gradeText:null}:{})}],limit:100,nextCursor:null};
    large.courses[0].title='x'.repeat(dtmGradeReportMaxResponseBytes-new TextEncoder().encode(JSON.stringify(large)).byteLength);
    assert.equal(new TextEncoder().encode(JSON.stringify(large)).byteLength,dtmGradeReportMaxResponseBytes);assert.deepEqual(parse(large,owner),large);
    large.courses[0].title+='x';assert.throws(()=>parse(large,owner),statusIs(503));
  }
});

test('draft SQL enforces scoped RLS, immutable linkage, explicit cells, versioned receipts and tombstones without altering legacy grades',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261114000000_dtm_grade_reports.sql',import.meta.url),'utf8');
  assert.match(sql,/foreign key\(course_id,user_id\) references public\.dtm_courses\(id,user_id\) on delete cascade/);
  assert.match(sql,/create unique index dtm_grade_reports_active_course_idx[^;]+where deleted_at is null/);
  assert.match(sql,/grant select on public\.dtm_grade_reports to authenticated/);assert.doesNotMatch(sql,/grant (?:insert|update|delete|all) on public\.dtm_grade_reports/i);
  assert.match(sql,/deleted_at is null and \(select private\.affairs_google_identity\(\)\)/);assert.match(sql,/user_id=\(select auth\.uid\(\)\) or \(select private\.affairs_is_admin\(\)\)/);
  assert.match(sql,/primary key\(actor_id,request_id\)/);assert.match(sql,/receipt\.kind<>p_kind or receipt\.payload<>p_payload/);
  assert.match(sql,/new\.course_id<>old\.course_id/);assert.match(sql,/Deleted grade report IDs cannot be reused/);assert.match(sql,/coalesce\(before_row\.version,0\)<>expected/);
  assert.match(sql,/from public\.dtm_courses where id=course_id_value and user_id=owner_id for update/);
  assert.match(sql,/insert into public\.affairs_agent_audit/);assert.match(sql,/set deleted_at=now\(\),updated_at=now\(\),version=version\+1,report='\{"items":\[\],"total":null\}'/);
  assert.match(sql,/jsonb_array_length\(value->'items'\)>500/);assert.match(sql,/octet_length\(value::text\)>131072/);
  assert.match(sql,/char_length\(value->>field\)>\(case when field='feedbackText' then 2000 else 80 end\)/);
  assert.match(sql,/n<\(case when p_kind='delete_dtm_grade_report' then 1 else 0 end\)/);
  assert.match(sql,/expected:=\(\(p_payload->>'expected_version'\)::numeric\)::integer/);assert.match(sql,/g\.report->'total'->>'gradeText'/);
  assert.match(sql,/p_course_id is not null and p_after_id is not null/);assert.match(sql,/order by c\.id limit 101/g);
  assert.doesNotMatch(sql,/(?:alter table|insert into|update|delete from) public\.dtm_grade_items|(?:create|alter|drop) policy dtm_courses|grant select on public\.dtm_courses/i);
});

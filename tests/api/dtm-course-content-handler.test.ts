import assert from 'node:assert/strict';
import test from 'node:test';
import dataHandler from '../../api/affairs-data.ts';
import manageHandler from '../../api/affairs-manage.ts';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const owner='10000000-0000-4000-8000-000000000001',course='20000000-0000-4000-8000-000000000001';
const assignment='30000000-0000-4000-8000-000000000001',token='synthetic-course-content-token-'.repeat(3);
type Query=Record<string,string|string[]|undefined>;
async function invoke(handler:typeof dataHandler|typeof manageHandler,options:{method?:string;query?:Query;body?:unknown;token?:string|null}={}){
 const result={status:200,body:null as unknown,headers:{} as Record<string,string>};
 const response={status(code:number){result.status=code;return response;},json(body:unknown){result.body=body;},setHeader(name:string,value:string){result.headers[name]=value;}};
 await handler({method:options.method??(handler===dataHandler?'GET':'POST'),query:options.query,body:options.body,
  headers:options.token===null?{}:{authorization:'Bearer '+(options.token??token)}},response);
 return result;
}
async function authOnly(run:(calls:URL[])=>Promise<void>,google=true){
 const fetcher=globalThis.fetch,url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,calls:URL[]=[];
 process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='synthetic-public-key';
 globalThis.fetch=async(input,init)=>{
  const target=new URL(String(input));calls.push(target);assert.equal(target.origin,origin);
  assert.equal(target.pathname,'/auth/v1/user','Malformed request must not reach a record or conversation adapter.');
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+token);
  assert.ok(init?.signal instanceof AbortSignal);
  return Response.json({id:owner,identities:[{provider:google?'google':'email'}]});
 };
 try{await run(calls);}finally{globalThis.fetch=fetcher;if(url===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=url;if(key===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;}
}
function failure(result:Awaited<ReturnType<typeof invoke>>,status:number){
 assert.equal(result.status,status);assert.deepEqual(Object.keys(result.body as object),['error']);
 assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');
 assert.doesNotMatch(JSON.stringify(result.body),/synthetic-course|PRIVATE/);
}
const payload={id:'40000000-0000-4000-8000-000000000001',user_id:owner,course_id:course,
 request_id:'50000000-0000-4000-8000-000000000001',expected_version:0,content:{references:[]}};

test('course content methods and Google identity fail closed before any record access',async()=>{
 await authOnly(async calls=>{
  failure(await invoke(dataHandler,{method:'POST',query:{scope:'dtm-course-content',course_id:course}}),405);
  failure(await invoke(manageHandler,{method:'GET'}),405);
  failure(await invoke(dataHandler,{token:null,query:{scope:'dtm-course-content',course_id:course}}),401);
  failure(await invoke(manageHandler,{token:'short',body:{kind:'save_dtm_course_content',payload}}),401);
  assert.equal(calls.length,0);
 });
 await authOnly(async calls=>{
  failure(await invoke(dataHandler,{query:{scope:'dtm-course-content',course_id:course}}),401);
  failure(await invoke(manageHandler,{body:{kind:'save_dtm_course_content',payload}}),401);
  assert.equal(calls.length,2);
 },false);
});

test('course content rejects cross-scope selectors, repeated fields and incomplete cursors',async()=>{
 const queries:Query[]=[
  {scope:['dtm-course-content']},{scope:['other','dtm-course-content'],resource:'conversations'},
  {scope:'dtm-course-content',course_id:course,resource:'conversations'},
  {scope:'dtm-course-content',course_id:[course]},{scope:'dtm-course-content'},
  {scope:'dtm-course-content',course_id:course,user_id:owner},
  ...[{after_id:assignment},{after_kind:'assignment'},{after_kind:'quiz',after_id:assignment},
   {after_kind:['assignment'],after_id:assignment},{after_kind:'assignment',after_id:[assignment]},
   {after_kind:'assignment',after_id:'bad'}].map(cursor=>({scope:'dtm-course-content',course_id:course,...cursor})),
  {scope:'dtm-course-content-admin',course_id:course},{scope:'dtm-course-content-admin',user_id:[owner],course_id:course},
  {scope:'dtm-course-content-admin',user_id:owner,course_id:course,after_id:assignment},
  {scope:'dtm-course-content-courses-admin',user_id:owner,course_id:course},
  {scope:'dtm-course-content-courses-admin',user_id:owner,after_kind:'assignment',after_id:course},
  {scope:'dtm-course-content-assignment',course_id:course},{scope:'dtm-course-content-assignment',course_id:course,assignment_id:[assignment]},
  {scope:'dtm-course-content-assignment',course_id:course,assignment_id:assignment,user_id:owner},
  {scope:'dtm-course-content-extra',resource:'conversations'},
 ];
 await authOnly(async calls=>{for(const query of queries)failure(await invoke(dataHandler,{query}),400);assert.equal(calls.length,queries.length);});
});

test('course content write envelopes and reference shape reject ambiguity before persistence',async()=>{
 await authOnly(async calls=>{
  for(const body of [
   {kind:'save_dtm_course_content',payload,extra:true},
   {kind:'save_dtm_course_content',payload:{...payload,user_id:undefined}},
   {kind:'save_dtm_course_content',payload:{...payload,content:{references:[{kind:'quiz',id:assignment,section:'quizzes'}]}}},
   {kind:'save_dtm_course_content',payload:{...payload,content:{references:[],inferred:true}}},
   {kind:'save_dtm_course_content',payload:{...payload,padding:'x'.repeat(140000)}},
   {kind:'delete_dtm_course_content',payload},
  ])failure(await invoke(manageHandler,{body}),400);
  assert.ok(calls.every(call=>call.pathname==='/auth/v1/user'));
 });
});

async function recordAdapter(run:(path:string,body:Record<string,unknown>)=>Response|Promise<Response>,check:()=>Promise<void>){
 const original=globalThis.fetch,oldUrl=process.env.VITE_SUPABASE_URL,oldKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='synthetic-public-key';
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,origin);assert.ok(init?.signal instanceof AbortSignal);
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+token);
  if(url.pathname==='/auth/v1/user')return Response.json({id:owner,identities:[{provider:'google'}]});
  assert.equal(init?.redirect,'error');assert.equal(init?.method,'POST');
  return run(url.pathname,JSON.parse(String(init?.body)));
 };
 try{await check();}finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=oldKey;}
}
const emptyPage={course:{id:course,userId:owner,title:'Synthetic course',code:'SYN',term:'Synthetic term'},content:null,
 activities:[],total:0,limit:100,nextCursor:null,revision:'a'.repeat(64),unavailableReferenceCount:0};

test('content reads dispatch exact own-course and assignment RPC selectors',async()=>{
 await recordAdapter((path,body)=>{
  if(path==='/rest/v1/rpc/dtm_course_content_read'){
   assert.deepEqual(body,{p_course_id:course});return Response.json(emptyPage);
  }
  assert.equal(path,'/rest/v1/rpc/dtm_course_content_assignment');assert.deepEqual(body,{p_course_id:course,p_assignment_id:assignment});
  return Response.json({assignment:null});
 },async()=>{
  const page=await invoke(dataHandler,{query:{scope:'dtm-course-content',course_id:course}});assert.equal(page.status,200);assert.deepEqual(page.body,emptyPage);
  const item=await invoke(dataHandler,{query:{scope:'dtm-course-content-assignment',course_id:course,assignment_id:assignment}});assert.equal(item.status,200);assert.deepEqual(item.body,{assignment:null});
 });
});

test('administrator content reads require explicit authority and preserve paired pagination',async()=>{
 let allowed=true,accesses=0,recordReads=0;
 await recordAdapter((path,body)=>{
  if(path==='/rest/v1/rpc/dtm_course_content_access'){accesses++;assert.deepEqual(body,{});return Response.json({userId:owner,canManage:allowed});}
  recordReads++;
  if(path==='/rest/v1/rpc/dtm_grade_report_courses_admin'){
   assert.deepEqual(body,{p_user_id:owner,p_after_id:course});return Response.json({courses:[],limit:100,nextCursor:null});
  }
  assert.equal(path,'/rest/v1/rpc/dtm_course_content_admin');assert.deepEqual(body,{p_user_id:owner,p_course_id:course,p_after_kind:'material',p_after_id:assignment});
  return Response.json(emptyPage);
 },async()=>{
  assert.equal((await invoke(dataHandler,{query:{scope:'dtm-course-content-admin',user_id:owner,course_id:course,after_kind:'material',after_id:assignment}})).status,200);
  assert.equal((await invoke(dataHandler,{query:{scope:'dtm-course-content-courses-admin',user_id:owner,after_id:course}})).status,200);
  allowed=false;failure(await invoke(dataHandler,{query:{scope:'dtm-course-content-admin',user_id:owner,course_id:course}}),403);
  assert.equal(accesses,3);assert.equal(recordReads,2);
 });
});

test('content writes retain exact request IDs across unknown outcomes and verify receipt scope',async()=>{
 let writes=0;
 const receipt={id:payload.id,userId:owner,courseId:course,kind:'save_dtm_course_content',version:1,summary:'Course content saved.'};
 await recordAdapter((path,body)=>{
  if(path==='/rest/v1/rpc/dtm_course_content_access')return Response.json({userId:owner,canManage:true});
  assert.equal(path,'/rest/v1/rpc/dtm_manage_course_content');assert.deepEqual(body,{p_kind:'save_dtm_course_content',p_payload:payload});
  writes++;if(writes===1)throw Error('PRIVATE lost response');
  return Response.json(writes===3?{...receipt,courseId:assignment}:receipt);
 },async()=>{
  const body={kind:'save_dtm_course_content',payload};
  failure(await invoke(manageHandler,{body}),503);
  const saved=await invoke(manageHandler,{body:JSON.stringify(body)});assert.equal(saved.status,200);assert.deepEqual(saved.body,receipt);
  failure(await invoke(manageHandler,{body}),503);assert.equal(writes,3);
 });
});

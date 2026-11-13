import assert from 'node:assert/strict';
import test from 'node:test';
import dataHandler from '../../api/affairs-data.ts';
import manageHandler from '../../api/affairs-manage.ts';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-public-key';
const owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002';
const course='20000000-0000-4000-8000-000000000001',id='30000000-0000-4000-8000-000000000001';
const requestId='40000000-0000-4000-8000-000000000001',studentToken='synthetic-grade-student-token-'.repeat(3),managerToken='synthetic-grade-manager-token-'.repeat(3);
type Query=Record<string,string|string[]|undefined>;
type Result={status:number;body:unknown;headers:Record<string,string>};
type Call={url:URL;headers:Headers;body:Record<string,unknown>|undefined;method:string};
async function invoke(handler:typeof dataHandler|typeof manageHandler,options:{method?:string;query?:Query;body?:unknown;token?:string|null}={}):Promise<Result>{
 const result:Result={status:200,body:null,headers:{}};
 const response={status(code:number){result.status=code;return response;},json(body:unknown){result.body=body;},setHeader(name:string,value:string){result.headers[name]=value;}};
 await handler({method:options.method??(handler===dataHandler?'GET':'POST'),query:options.query,body:options.body,
  headers:options.token===null?{}:{authorization:'Bearer '+(options.token??studentToken)}},response);return result;
}
async function mocked(run:(call:Call)=>Response|Promise<Response>,body:(calls:Call[])=>Promise<void>,google=true){
 const original=globalThis.fetch,oldUrl=process.env.VITE_SUPABASE_URL,oldKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,calls:Call[]=[];
 process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
 globalThis.fetch=async(input,init)=>{
  const call:Call={url:new URL(String(input)),headers:new Headers(init?.headers),body:init?.body?JSON.parse(String(init.body)):undefined,method:init?.method??'GET'};calls.push(call);
  assert.equal(call.url.origin,origin);assert.equal(call.headers.get('apikey'),key);assert.ok(init?.signal instanceof AbortSignal);
  const token=call.headers.get('authorization');assert.ok(token==='Bearer '+studentToken||token==='Bearer '+managerToken);
  if(call.url.pathname==='/auth/v1/user')return Response.json({id:token==='Bearer '+managerToken?manager:owner,identities:[{provider:google?'google':'email'}]});
  assert.equal(init?.redirect,'error');return run(call);
 };
 try{await body(calls);}finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=oldKey;}
}
const unexpected=()=>{throw Error('Invalid grade request reached a record adapter.');};
function failure(result:Result,status:number){assert.equal(result.status,status);assert.deepEqual(Object.keys(result.body as object),['error']);assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE|synthetic-grade-|foreign-secret/);assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');}
const payload={id,user_id:owner,course_id:course,request_id:requestId,expected_version:0,report:{items:[],total:null}};

test('grade handlers require correct methods and verified Google identity',async()=>{
 await mocked(unexpected,async calls=>{
  failure(await invoke(dataHandler,{method:'POST',query:{scope:'dtm-grade-report',course_id:course}}),405);
  failure(await invoke(manageHandler,{method:'GET'}),405);
  failure(await invoke(dataHandler,{token:null,query:{scope:'dtm-grade-report',course_id:course}}),401);
  failure(await invoke(manageHandler,{token:'short',body:{kind:'save_dtm_grade_report',payload}}),401);assert.equal(calls.length,0);
 });
 await mocked(unexpected,async calls=>{
  failure(await invoke(dataHandler,{query:{scope:'dtm-grade-report-overview'}}),401);
  failure(await invoke(manageHandler,{body:{kind:'save_dtm_grade_report',payload}}),401);assert.equal(calls.length,2);
 },false);
});

test('grade scopes reject ambiguity, foreign selectors and conversation fallthrough',async()=>{
 const queries:Query[]=[{scope:['dtm-grade-report']},{scope:['other','dtm-grade-report'],resource:'conversations'},
  {scope:'dtm-grade-report',course_id:course,resource:'conversations'},{scope:'dtm-grade-report',course_id:[course]},
  {scope:'dtm-grade-report',course_id:course,user_id:owner},{scope:'dtm-grade-report'},
  {scope:'dtm-grade-report-admin',course_id:course},{scope:'dtm-grade-report-admin',course_id:course,user_id:[owner]},
  {scope:'dtm-grade-report-admin',course_id:course,user_id:owner,extra:'true'},
  {scope:'dtm-grade-report-overview',user_id:owner},{scope:'dtm-grade-report-overview',after_id:['bad']},
  {scope:'dtm-grade-report-courses-admin',user_id:owner,course_id:course},
  {scope:'dtm-grade-report-courses-admin',user_id:owner,after_id:'bad'},
  {scope:'dtm-grade-report-extra',resource:'conversations'}];
 await mocked(unexpected,async calls=>{for(const query of queries)failure(await invoke(dataHandler,{token:managerToken,query}),400);assert.equal(calls.length,queries.length);assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));});
});

test('own report and overview stay caller-bound even for an administrator',async()=>{
 for(const token of [studentToken,managerToken]){
  const user=token===studentToken?owner:manager;
  await mocked(call=>{
   if(call.url.pathname==='/rest/v1/dtm_courses'){assert.equal(call.url.searchParams.get('user_id'),'eq.'+user);assert.equal(call.url.searchParams.get('id'),'eq.'+course);return Response.json([{id:course,user_id:user}]);}
   if(call.url.pathname==='/rest/v1/dtm_grade_reports'){assert.equal(call.url.searchParams.get('user_id'),'eq.'+user);assert.equal(call.url.searchParams.get('course_id'),'eq.'+course);return Response.json([]);}
   assert.equal(call.url.pathname,'/rest/v1/rpc/dtm_grade_report_overview');assert.deepEqual(call.body,{p_after_id:course});return Response.json({courses:[],limit:100,nextCursor:null});
  },async()=>{
   const read=await invoke(dataHandler,{token,query:{scope:'dtm-grade-report',course_id:course}});assert.equal(read.status,200);assert.deepEqual(read.body,{report:null});
   const overview=await invoke(dataHandler,{token,query:{scope:'dtm-grade-report-overview',after_id:course}});assert.equal(overview.status,200);assert.deepEqual(overview.body,{courses:[],limit:100,nextCursor:null});
  });
 }
});

test('selected-student admin scope uses narrow course metadata RPC and rechecks permission',async()=>{
 let allowed=true;
 await mocked(call=>{
  if(call.url.pathname==='/rest/v1/rpc/dtm_grade_report_access')return Response.json({userId:manager,canManage:allowed});
  if(call.url.pathname==='/rest/v1/rpc/dtm_grade_report_courses_admin'){
   assert.equal(call.body?.p_user_id,owner);
   return Response.json({courses:[{id:course,userId:owner,title:'Synthetic course',code:'LOCAL-1',term:'Saved term'}],limit:100,nextCursor:null});
  }
  assert.equal(call.url.pathname,'/rest/v1/dtm_grade_reports');assert.equal(call.url.searchParams.get('user_id'),'eq.'+owner);return Response.json([]);
 },async calls=>{
  const list=await invoke(dataHandler,{token:managerToken,query:{scope:'dtm-grade-report-courses-admin',user_id:owner}});assert.equal(list.status,200);
  const read=await invoke(dataHandler,{token:managerToken,query:{scope:'dtm-grade-report-admin',user_id:owner,course_id:course}});assert.equal(read.status,200);assert.deepEqual(read.body,{report:null});
  allowed=false;failure(await invoke(dataHandler,{token:managerToken,query:{scope:'dtm-grade-report-admin',user_id:owner,course_id:course}}),403);
  assert.equal(calls.filter(call=>call.url.pathname==='/rest/v1/dtm_courses').length,0);
 });
});

test('report writes preserve operation IDs and reject malformed envelopes before accessing records',async()=>{
 const receipt={id,userId:owner,courseId:course,kind:'save_dtm_grade_report',version:1,summary:'Grade report saved.'};let writes=0;
 await mocked(call=>{
  if(call.url.pathname==='/rest/v1/rpc/dtm_grade_report_access')return Response.json({userId:manager,canManage:true});
  assert.equal(call.url.pathname,'/rest/v1/rpc/dtm_manage_grade_report');assert.deepEqual(call.body,{p_kind:'save_dtm_grade_report',p_payload:payload});
  if(++writes===1)throw Error('PRIVATE uncertain write');return Response.json(receipt);
 },async()=>{
  const body={kind:'save_dtm_grade_report',payload};
  failure(await invoke(manageHandler,{token:managerToken,body}),503);
  const retry=await invoke(manageHandler,{token:managerToken,body:JSON.stringify(body)});assert.equal(retry.status,200);assert.deepEqual(retry.body,receipt);
 });assert.equal(writes,2);
 await mocked(unexpected,async calls=>{
  for(const body of [{kind:'save_dtm_grade_report',payload,extra:true},{kind:'save_dtm_grade_report',payload:{...payload,user_id:undefined}},
   {kind:'save_dtm_grade_report',payload:{...payload,report:{items:[],total:'inferred'}}},{kind:'save_dtm_grade_report',payload:{...payload,report:{items:[],total:null},padding:'x'.repeat(140000)}}])failure(await invoke(manageHandler,{token:managerToken,body}),400);
  assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
 });
});

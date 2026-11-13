import assert from 'node:assert/strict';
import test from 'node:test';
import dataHandler from '../../api/affairs-data.ts';
import manageHandler from '../../api/affairs-manage.ts';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';

// Real endpoint/helper dispatch; only outbound Auth/RPC HTTP is mocked.
const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-public-key';
const user='10000000-0000-4000-8000-000000000001',admin='10000000-0000-4000-8000-000000000002';
const id='20000000-0000-4000-8000-000000000001',requestId='30000000-0000-4000-8000-000000000001';
const studentToken='synthetic-student-token-'.repeat(3),adminToken='synthetic-admin-token-'.repeat(3);
const options={terms:[{value:'local-term',label:'Explicit local term'}],departments:[{value:'local-unit',label:'Local unit'}]};
const row={id,sequence:1,course_code:'QA001',course_name:'Synthetic syllabus',admission_name:'Local program',instructor:'Synthetic instructor',academicYearText:null,semesterText:'0'};
const page={scope:'historical',total:1,rows:[row],page:0,pageSize:100,hasMore:false,sort:{key:'course_code',direction:'asc'},revision:'0'.repeat(32)};
const metadata={id,request_id:requestId,expected_version:3,syllabus_is_current:true,academic_year_text:'😀'.repeat(30),semester_text:null};
const receipt={id,kind:'save_syllabus_search_metadata',version:4,summary:'Saved local syllabus search metadata.'};
const detail={...newCourseOffering(),id,version:3,published:true,course_code:'QA001',course_name:'Synthetic syllabus',instructor:'Synthetic instructor',
  term_code:'local-term',term_label:'Explicit local term',department_code:'local-unit',department_name:'Local unit',classification_code:'QA',admission_code:'QA',syllabus:{}};
type Call={url:URL;headers:Headers;body:Record<string,unknown>|undefined;method:string|undefined;signal:AbortSignal|null|undefined};
type Result={status:number;body:unknown;headers:Record<string,string>};
type Handler=typeof dataHandler|typeof manageHandler;
const json=(body:unknown,status=200)=>Response.json(body,{status});
async function invoke(handler:Handler,{method=handler===dataHandler?'GET':'POST',body,query,token=studentToken}:{method?:string;body?:unknown;query?:Record<string,string|string[]|undefined>;token?:string|null}={}):Promise<Result>{
  const result:Result={status:200,body:null,headers:{}};
  const response={status(code:number){result.status=code;return response;},json(value:unknown){result.body=value;},setHeader(name:string,value:string){result.headers[name]=value;}};
  await handler({method,body,query,headers:token?{authorization:'Bearer '+token}:{}},response);return result;
}
async function mocked(run:(call:Call)=>Response|Promise<Response>,callback:(calls:Call[])=>Promise<void>,google=true){
  const original=globalThis.fetch,oldUrl=process.env.VITE_SUPABASE_URL,oldKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,calls:Call[]=[];
  process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  globalThis.fetch=async(input,init)=>{
    const call:Call={url:new URL(String(input)),headers:new Headers(init?.headers),body:init?.body?JSON.parse(String(init.body)):undefined,method:init?.method,signal:init?.signal};calls.push(call);
    assert.equal(call.url.origin,origin);assert.equal(call.headers.get('apikey'),key);assert.ok(call.signal instanceof AbortSignal);
    const token=call.headers.get('authorization');assert.ok(token==='Bearer '+studentToken||token==='Bearer '+adminToken);
    if(call.url.pathname==='/auth/v1/user')return json({id:token==='Bearer '+adminToken?admin:user,identities:[{provider:google?'google':'email'}]});
    return run(call);
  };
  try{await callback(calls);}finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=oldKey;}
}
function failure(result:Result,status:number){assert.equal(result.status,status);assert.ok(result.body&&typeof result.body==='object'&&'error' in result.body);assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE_PROVIDER/);assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');assert.equal(result.headers['X-Content-Type-Options'],'nosniff');}

test('syllabus routes require correct methods and a verified caller before any catalog read/write',async()=>{
  await mocked(()=>{throw new Error('No RPC expected.');},async calls=>{
    failure(await invoke(dataHandler,{method:'POST'}),405);failure(await invoke(manageHandler,{method:'GET'}),405);
    for(const token of [null,'short']){
      for(const scope of ['syllabus-options','syllabus-search','syllabus-detail'])failure(await invoke(dataHandler,{token,query:{scope,id}}),401);
      failure(await invoke(manageHandler,{token,body:{kind:'syllabus-metadata',payload:metadata}}),401);
    }assert.equal(calls.length,0);
  });
  await mocked(()=>{throw new Error('Non-Google caller must not reach RPC.');},async calls=>{
    failure(await invoke(dataHandler,{query:{scope:'syllabus-options'}}),401);
    failure(await invoke(manageHandler,{body:{kind:'syllabus-metadata',payload:metadata}}),401);assert.equal(calls.length,2);
  },false);
});

test('options and search use their exact RPCs with caller JWT and no student/workspace queries',async()=>{
  await mocked(call=>{
    assert.equal(call.method,'POST');
    if(call.url.pathname.endsWith('/affairs_syllabus_options')){assert.deepEqual(call.body,{});return json(options);}
    assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_syllabus_search');
    assert.deepEqual(call.body,{p_filters:{scope:'historical',keyword:'SQL_%',term:'local-term',department:'local-unit',themes:[1,11]},p_page:0,p_page_size:100,p_sort:'course_code',p_direction:'asc'});return json(page);
  },async calls=>{
    assert.deepEqual((await invoke(dataHandler,{query:{scope:'syllabus-options'}})).body,options);
    const result=await invoke(dataHandler,{query:{scope:'syllabus-search',search_scope:'historical',keyword:'SQL_%',term:'local-term',department:'local-unit',themes:'11,1,11'}});
    assert.equal(result.status,200);assert.deepEqual(result.body,page);assert.equal(calls.length,4);
    assert.ok(calls.every(call=>call.headers.get('authorization')==='Bearer '+studentToken));
  });
});

test('repeated/unknown fields, invalid identifiers and oversized pages fail before syllabus RPC',async()=>{
  const queries:Record<string,string|string[]|undefined>[]=[
    {scope:['syllabus-search','syllabus-options']},{scope:'syllabus-options',term:'local-term'},
    {scope:'syllabus-options',user_id:user},{scope:'syllabus-search',keyword:['one','two']},
    {scope:'syllabus-search',search_scope:['current','historical']},{scope:'syllabus-search',themes:['1','11']},
    {scope:'syllabus-search',page_size:'101'},{scope:'syllabus-search',user_id:user},{scope:'syllabus-search',published:'false'},
    {scope:'syllabus-search',search_scope:'past'},{scope:'syllabus-detail'},{scope:'syllabus-detail',id:[id,id]},
    {scope:'syllabus-detail',id:'../private'},{scope:'syllabus-detail',id,include_drafts:'true'},
    {scope:'syllabus-detail',id,user_id:user},{scope:'syllabus-unknown'},
  ];
  await mocked(()=>{throw new Error('Invalid scope must not fall through to workspace/catalog reads.');},async calls=>{
    for(const query of queries)failure(await invoke(dataHandler,{query}),400);
    assert.equal(calls.length,queries.length);assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  });
});

test('published-only detail dispatch is identical for students/admins and preserves null for unavailable rows',async()=>{
  await mocked(call=>{assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_syllabus_detail');assert.deepEqual(call.body,{p_id:id});return json({row:detail});},async calls=>{
    for(const token of [studentToken,adminToken]){const result=await invoke(dataHandler,{token,query:{scope:'syllabus-detail',id}});assert.equal(result.status,200);assert.deepEqual(result.body,{row:detail});assert.equal(calls.at(-1)?.headers.get('authorization'),'Bearer '+token);}
  });
  await mocked(()=>json({row:null}),async()=>{assert.deepEqual((await invoke(dataHandler,{query:{scope:'syllabus-detail',id}})).body,{row:null});});
  await mocked(()=>json({row:{...detail,published:false}}),async()=>{failure(await invoke(dataHandler,{token:adminToken,query:{scope:'syllabus-detail',id}}),503);});
});

test('manager alias forwards exact request/version payload, preserving stable retry and SQL administrator denial',async()=>{
  await mocked(call=>{assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_syllabus_metadata_manage');assert.deepEqual(call.body,{p_payload:metadata});return call.headers.get('authorization')==='Bearer '+adminToken?json(receipt):json({message:'PRIVATE_PROVIDER'},403);},async calls=>{
    failure(await invoke(manageHandler,{body:{kind:'syllabus-metadata',payload:metadata}}),403);
    for(const body of [{kind:'syllabus-metadata',payload:metadata},JSON.stringify({kind:'syllabus-metadata',payload:metadata})]){
      const result=await invoke(manageHandler,{token:adminToken,body});assert.equal(result.status,200);assert.deepEqual(result.body,receipt);
    }
    assert.equal(calls.length,6);assert.deepEqual(calls.filter(call=>call.body).map(call=>call.body),Array(3).fill({p_payload:metadata}));
  });
});

test('metadata branch rejects extra envelope fields, ownership selectors and malformed payloads',async()=>{
  await mocked(()=>{throw new Error('Invalid metadata must not reach a mutation.');},async calls=>{
    for(const body of [null,'{',[],{kind:'syllabus-metadata',payload:[]},{kind:'syllabus-metadata',payload:metadata,user_id:user},
      {kind:'syllabus-metadata',payload:metadata,requestId},{kind:'syllabus-metadata',payload:{...metadata,academic_year_text:'x'.repeat(3000)}}])failure(await invoke(manageHandler,{body}),400);
    assert.equal(calls.length,0);
    for(const patch of [{expected_version:0},{expected_version:'3'},{request_id:'bad'},{id:null},{user_id:user},{published:true},{syllabus_is_current:'true'},
      {academic_year_text:'😀'.repeat(31)}])failure(await invoke(manageHandler,{body:{kind:'syllabus-metadata',payload:{...metadata,...patch}}}),400);
    assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  });
});

test('provider conflict, denial, outage and malformed responses retain safe status semantics',async()=>{
  for(const status of [400,401,403,409,500])await mocked(()=>json({message:'PRIVATE_PROVIDER'},status),async()=>{
    failure(await invoke(manageHandler,{token:adminToken,body:{kind:'syllabus-metadata',payload:metadata}}),status===500?503:status);
    failure(await invoke(dataHandler,{query:{scope:'syllabus-search'}}),status===500?503:status);
  });
  await mocked(()=>json({...page,scope:'current',rows:[]}),async()=>{failure(await invoke(dataHandler,{query:{scope:'syllabus-search'}}),503);});
  await mocked(()=>json({...receipt,version:3}),async()=>{failure(await invoke(manageHandler,{token:adminToken,body:{kind:'syllabus-metadata',payload:metadata}}),503);});
});

test('legacy catalog detail and editor retain existing dispatch and cannot overwrite syllabus metadata',async()=>{
  const stored={...detail,syllabus_is_current:true,academic_year_text:'😀'.repeat(30),semester_text:'𠀀'.repeat(30)};
  await mocked(call=>{
    assert.ok(call.body);
    if(call.url.pathname.endsWith('/affairs_catalog_search')){assert.equal((call.body.p_filters as {id:string}).id,id);return json({rows:[stored],total:1,can_manage:true,terms:options.terms});}
    assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_catalog_manage');assert.equal(call.body.p_kind,'save_course_offering');
    const payload=call.body.p_payload as {id:string;expected_version:number;request_id:string;record:Record<string,unknown>};
    assert.equal(payload.id,id);assert.equal(payload.expected_version,3);assert.equal(payload.request_id,requestId);
    for(const field of ['syllabus_is_current','academic_year_text','semester_text'])assert.equal(Object.hasOwn(payload.record,field),false);
    return json({id,version:4});
  },async calls=>{
    const result=await invoke(dataHandler,{token:adminToken,query:{scope:'catalog',id}});assert.equal(result.status,200);assert.deepEqual((result.body as {rows:unknown[]}).rows,[stored]);
    assert.equal((await invoke(manageHandler,{token:adminToken,body:{kind:'save_course_offering',payload:{id,expected_version:3,request_id:requestId,record:stored}}})).status,200);
    assert.equal(calls.length,4);
  });
});

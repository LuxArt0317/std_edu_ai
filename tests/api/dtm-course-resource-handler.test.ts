import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../../api/affairs-data.ts';
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const user='10000000-0000-4000-8000-000000000001',course='20000000-0000-4000-8000-000000000001',material='30000000-0000-4000-8000-000000000001';
const token='synthetic-resource-token-'.repeat(4);
type Query=Record<string,string|string[]|undefined>;
async function invoke(query:Query,method='GET',authorization:string|undefined='Bearer '+token){
 const result={status:200,body:null as unknown,headers:{} as Record<string,string>};
 const response={status(code:number){result.status=code;return response;},json(body:unknown){result.body=body;},setHeader(name:string,value:string){result.headers[name]=value;}};
 await handler({method,query,headers:{authorization}},response);return result;
}
const valid={scope:'dtm-course-resource',course_id:course,material_id:material};
function failure(result:Awaited<ReturnType<typeof invoke>>,status:number){assert.equal(result.status,status);assert.deepEqual(Object.keys(result.body as object),['error']);assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');assert.doesNotMatch(JSON.stringify(result.body),/synthetic-resource-token|PRIVATE/);}
async function adapter(run:(calls:URL[])=>Promise<void>,record?:(url:URL)=>Response,google=true){
 const previous=globalThis.fetch,url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,calls:URL[]=[];
 process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='synthetic-key';
 globalThis.fetch=async(input,init)=>{
  const target=new URL(String(input));calls.push(target);assert.equal(target.origin,origin);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+token);
  if(target.pathname==='/auth/v1/user')return Response.json({id:user,identities:[{provider:google?'google':'email'}]});
  assert.ok(init?.signal instanceof AbortSignal);assert.equal(init?.redirect,'error');
  if(!record)assert.fail('Invalid request reached a record or conversation adapter.');
  if(target.pathname==='/rest/v1/rpc/dtm_course_content_access')return Response.json({userId:user,canManage:false});
  assert.equal(target.pathname,'/rest/v1/dtm_courses');assert.equal(init?.method,'GET');
  assert.equal(target.searchParams.get('user_id'),'eq.'+user);assert.equal(target.searchParams.get('id'),'eq.'+course);
  assert.equal(target.searchParams.get('dtm_materials.id'),'eq.'+material);assert.equal(target.searchParams.get('dtm_materials.course_id'),'eq.'+course);
  assert.equal(target.searchParams.get('limit'),'2');assert.equal(target.searchParams.get('dtm_materials.limit'),'2');
  return record(target);
 };
 try{await run(calls);}finally{globalThis.fetch=previous;if(url===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=url;if(key===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;}
}
const row={id:course,user_id:user,title:'Synthetic course',code:'SYN',term:'Synthetic term',source_mode:'personal',dtm_materials:[{id:material,course_id:course,title:'Synthetic resource',kind:'page',summary:'Literal description',position:1001,source_mode:'personal',source_url:'https://dtm.stu.edu.tw/mod/url/view.php?id=990001',target_url:'https://example.com/material?unit=1#chapter'}]};
test('resource handler rejects method, missing identity and non-Google identity before record reads',async()=>{
 await adapter(async calls=>{failure(await invoke(valid,'POST'),405);failure(await invoke(valid,'GET',''),401);assert.equal(calls.length,0);});
 await adapter(async calls=>{failure(await invoke(valid),401);assert.equal(calls.length,1);},undefined,false);
});
test('resource handler rejects repeated, unknown, cross-account and conversation selectors',async()=>{
 const queries:Query[]=[{scope:['dtm-course-resource']},{scope:['other','dtm-course-resource'],resource:'conversations'},
 {...valid,resource:'conversations'},{...valid,user_id:user},{...valid,course_id:[course]},{...valid,material_id:[material]},
 {...valid,course_id:'bad'},{...valid,material_id:'bad'},{scope:'dtm-course-resource',course_id:course},
 {...valid,scope:'dtm-course-resource-extra'},{...valid,after_id:material}];
 await adapter(async calls=>{for(const query of queries)failure(await invoke(query),400);assert.equal(calls.length,queries.length);});
});
test('resource handler returns the exact owned material and literal destination independently of snapshot size',async()=>{
 await adapter(async calls=>{const result=await invoke(valid);assert.equal(result.status,200);assert.deepEqual(result.body,{course:{id:course,userId:user,title:'Synthetic course',code:'SYN',term:'Synthetic term',sourceMode:'personal'},material:{id:material,userId:user,courseId:course,title:'Synthetic resource',kind:'page',summary:'Literal description',position:1001,sourceMode:'personal',sourceUrl:row.dtm_materials[0].source_url,targetUrl:row.dtm_materials[0].target_url}});assert.equal(calls.length,3);},()=>Response.json([row]));
});
test('resource handler separates missing material from unavailable course and never exposes malformed provider data',async()=>{
 await adapter(async()=>{const result=await invoke(valid);assert.equal(result.status,200);assert.equal((result.body as {material:null}).material,null);},()=>Response.json([{...row,dtm_materials:[]}]));
 await adapter(async()=>failure(await invoke(valid),403),()=>Response.json([]));
 for(const bad of [{...row,user_id:material},{...row,dtm_materials:[{...row.dtm_materials[0],course_id:material}]},{...row,dtm_materials:[{...row.dtm_materials[0],target_url:'javascript:PRIVATE'}]}]){
  await adapter(async()=>failure(await invoke(valid),503),()=>Response.json([bad]));
 }
 await adapter(async()=>failure(await invoke(valid),503),()=>new Response('PRIVATE provider failure',{status:500}));
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDtmCourseResourceClient,DtmCourseResourceClientError,type DtmCourseResourceData} from '../../src/services/dtmCourseResource';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',courseId='20000000-0000-4000-8000-000000000001',materialId='30000000-0000-4000-8000-000000000001';
const data=():DtmCourseResourceData=>({course:{id:courseId,userId:owner,title:'Synthetic course',code:'QA',term:'Synthetic term',sourceMode:'personal'},material:{id:materialId,userId:owner,courseId,title:'Synthetic resource',kind:'page',summary:'https://ignored.example.com',position:1,sourceMode:'personal',sourceUrl:'https://dtm.stu.edu.tw/mod/url/view.php?id=123',targetUrl:'https://example.com/resource?unit=1#details'}});
const session=(userId=owner)=>({userId,token:'synthetic-token'});
const json=(value:unknown)=>Response.json(value);
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
test('exact own reader sends only the local scoped GET and preserves the literal target independently of provenance',async()=>{
 const calls:Array<{path:string;init:RequestInit}>=[];
 const client=createDtmCourseResourceClient(async()=>session(),async(path,init)=>{calls.push({path:String(path),init:init!});return json(data());});
 const result=await client.load(owner,courseId,materialId);assert.deepEqual(result,data());assert.equal(calls.length,1);
 assert.equal(calls[0].path,'/api/affairs-data?scope=dtm-course-resource&course_id='+courseId+'&material_id='+materialId);
 assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.credentials,'omit');assert.equal(calls[0].init.cache,'no-store');assert.equal(new Headers(calls[0].init.headers).get('Authorization'),'Bearer synthetic-token');
 result.material!.title='Changed caller copy';assert.equal(data().material!.title,'Synthetic resource');
});
test('invalid target IDs, queued-session abort and foreign caller stop before any request',async()=>{
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;return json(data());};
 const invalid=createDtmCourseResourceClient(async()=>session(),fetcher);
 for(const args of [[owner,'bad',materialId],['bad',courseId,materialId],[owner,courseId,'bad']])await assert.rejects(()=>invalid.load(args[0],args[1],args[2]),(e)=>e instanceof DtmCourseResourceClientError&&e.status===400);
 const pending=deferred<ReturnType<typeof session>>(),controller=new AbortController();const client=createDtmCourseResourceClient(()=>pending.promise,fetcher);
 const promise=client.load(owner,courseId,materialId,controller.signal);controller.abort();await assert.rejects(promise);pending.resolve(session());await Promise.resolve();
 const foreign=createDtmCourseResourceClient(async()=>session(other),fetcher);await assert.rejects(()=>foreign.load(owner,courseId,materialId),(e)=>e instanceof DtmCourseResourceClientError&&e.status===401);assert.equal(calls,0);
});
test('post-response session changes and foreign/wrong-course/malformed records fail closed',async()=>{
 let reads=0;const switched=createDtmCourseResourceClient(async()=>session(++reads===1?owner:other),async()=>json(data()));
 await assert.rejects(()=>switched.load(owner,courseId,materialId),(e)=>e instanceof DtmCourseResourceClientError&&e.status===401);
 const row=data();for(const value of [{...row,extra:true},{...row,course:{...row.course,userId:other}},{...row,material:{...row.material,userId:other}},{...row,material:{...row.material,courseId:other}},{...row,material:{...row.material,id:other}},{...row,material:{...row.material,targetUrl:'javascript:alert(1)'}},{...row,material:{...row.material,targetUrl:''}}]){
  const client=createDtmCourseResourceClient(async()=>session(),async()=>json(value));await assert.rejects(()=>client.load(owner,courseId,materialId),DtmCourseResourceClientError);
 }
});
test('missing material succeeds as null while HTTP errors retain known status and never expose provider text',async()=>{
 const value={...data(),material:null};const missing=createDtmCourseResourceClient(async()=>session(),async()=>json(value));assert.deepEqual(await missing.load(owner,courseId,materialId),value);
 for(const status of [400,401,403,500,503]){const client=createDtmCourseResourceClient(async()=>session(),async()=>new Response('PRIVATE provider detail',{status}));await assert.rejects(()=>client.load(owner,courseId,materialId),(e)=>e instanceof DtmCourseResourceClientError&&e.status===(status<=403?status:503)&&!e.message.includes('PRIVATE'));}
});
test('response size/UTF8/JSON and one total deadline bound session, fetch and streamed body',async()=>{
 for(const response of [new Response('x'.repeat(196609)),new Response('{}',{headers:{'Content-Length':'196609'}}),new Response(new Uint8Array([0xc3,0x28])),new Response('{')]){
  const client=createDtmCourseResourceClient(async()=>session(),async()=>response);await assert.rejects(()=>client.load(owner,courseId,materialId),DtmCourseResourceClientError);
 }
 for(const [readSession,fetcher] of [[()=>new Promise<ReturnType<typeof session>>(()=>{}),async()=>json(data())],[async()=>session(),()=>new Promise<Response>(()=>{})],[async()=>session(),async()=>new Response(new ReadableStream({start(){}}))]] as const){
  const client=createDtmCourseResourceClient(readSession,fetcher,15);await assert.rejects(()=>client.load(owner,courseId,materialId),(e)=>e instanceof DtmCourseResourceClientError&&e.status===504);
 }
});

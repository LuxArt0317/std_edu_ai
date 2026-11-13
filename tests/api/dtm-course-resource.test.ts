import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {DtmCourseResourceError,dtmMaterialTargetUrlMaxLength,dtmCourseResourceMaxResponseBytes,validateDtmMaterialTargetUrl,parseDtmCourseResourceData,loadDtmCourseResource,type DtmCourseResourceAccount} from '../../server/dtmCourseResource.js';
const userId='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',courseId='20000000-0000-4000-8000-000000000001',materialId='30000000-0000-4000-8000-000000000001';
const account=():DtmCourseResourceAccount=>({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-public-key',token:'synthetic-caller-token',user:{id:userId}} as DtmCourseResourceAccount);
const course=()=>({id:courseId,userId,title:'Synthetic course',code:'QA',term:'Local term',sourceMode:'personal'});
const material=()=>({id:materialId,userId,courseId,title:'Synthetic URL resource',kind:'page',summary:'Literal summary',position:1,sourceMode:'personal',sourceUrl:'https://dtm.stu.edu.tw/mod/url/view.php?id=123',targetUrl:'https://example.org/resource?part=1#section'});
const data=()=>({course:course(),material:material()});
const raw=()=>[{id:courseId,user_id:userId,title:'Synthetic course',code:'QA',term:'Local term',source_mode:'personal',dtm_materials:[{id:materialId,course_id:courseId,title:'Synthetic URL resource',kind:'page',summary:'Literal summary',position:1,source_mode:'personal',source_url:material().sourceUrl,target_url:material().targetUrl}]}];
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const statusIs=(status:number)=>(reason:unknown)=>reason instanceof DtmCourseResourceError&&reason.status===status;
type Call={url:URL;headers:Headers;body:unknown;method:string|undefined;redirect:RequestRedirect|undefined;signal:AbortSignal|null|undefined};
async function mock(handler:(call:Call)=>Response|Promise<Response>,run:()=>void|Promise<void>){const saved=globalThis.fetch;globalThis.fetch=(url,init)=>Promise.resolve(handler({url:new URL(String(url)),headers:new Headers(init?.headers),body:init?.body?JSON.parse(String(init.body)):undefined,method:init?.method,redirect:init?.redirect,signal:init?.signal}));try{await run();}finally{globalThis.fetch=saved;}}
const access=()=>({userId,canManage:false});

test('destination validation accepts explicit null/blank and literal public HTTPS only',()=>{
  assert.equal(dtmMaterialTargetUrlMaxLength,2048);assert.equal(dtmCourseResourceMaxResponseBytes,196608);
  for(const value of [null,'','https://example.org','https://EXAMPLE.ORG:443/path?q=one&second=%E4%B8%AD#part','https://sub-domain.example.org/a(b)?x=1+2','https://example.org/'+'a'.repeat(2028)])assert.equal(validateDtmMaterialTargetUrl(value),null,String(value));
  for(const value of [undefined,0,{},[],false,' ',' https://example.org','https://example.org ','https://example.org/'+'a'.repeat(2029),'http://example.org','HTTPS://example.org','javascript:alert(1)','data:text/plain,x',
    'https://user:password@example.org','https://user@example.org','https://example.org:80','https://example.org:0443','https://example.org:65536','//example.org','https:///example.org',
    'https://example.org\\path','https://example.org/\u0000','https://example.org/\n','https://example.org/\u007f','https://example.org/中文','https://example.org/\ud800','https://example.org/<x>',
    'https://example.org/%','https://example.org/%0','https://example.org/%gg','https://example.org/%00','https://example.org/%1F','https://example.org/%7f','https://example.org/%5C'])assert.notEqual(validateDtmMaterialTargetUrl(value),null,String(value));
});
test('host grammar rejects credential/parser ambiguities, IP forms and reserved/local DNS',()=>{
  for(const host of ['localhost','sub.localhost','sub.local','sub.internal','sub.localdomain','sub.intranet','sub.lan','sub.home','sub.corp','sub.test','sub.invalid','sub.example','sub.onion','home.arpa',
    '127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','0.0.0.0','8.8.8.8','2130706433','127.1','0x7f000001','0177.0.0.1','[::1]','[2001:4860:4860::8888]',
    '%31%32%37.0.0.1','example.org.','example..org','-example.org','example-.org','example.o','example.123','xn--bcher-kva.org','example.xn--p1ai','a'.repeat(64)+'.org',('a'.repeat(63)+'.').repeat(4)+'org'])assert.notEqual(validateDtmMaterialTargetUrl('https://'+host),null,host);
  assert.equal(validateDtmMaterialTargetUrl('https://example.org/path@localhost?next=http://127.0.0.1'),null,'Path/query text is not authority and is never fetched by the server.');
});
test('strict DTO keeps null, blank literal metadata and legacy long text without inventing a destination',()=>{
  const d=data();d.course.title='';d.course.code='😀'.repeat(900);d.material.summary='';assert.deepEqual(parseDtmCourseResourceData(d,userId,courseId,materialId),d);
  const noTarget={...data(),material:{...material(),sourceUrl:null,targetUrl:null}};assert.deepEqual(parseDtmCourseResourceData(noTarget,userId,courseId,materialId),noTarget);
  assert.deepEqual(parseDtmCourseResourceData({course:course(),material:null},userId,courseId,materialId),{course:course(),material:null});
  const parsed=parseDtmCourseResourceData(data(),userId,courseId,materialId);parsed.course.title='Changed';assert.equal(data().course.title,'Synthetic course');
});
test('DTO rejects wrong scope, unsafe target, missing fields and oversized content',()=>{
  for(const value of [null,{}, {...data(),course:null},{...data(),course:{...course(),userId:other}},{...data(),course:{...course(),id:materialId}},
    {...data(),material:{...material(),userId:other}},{...data(),material:{...material(),courseId:materialId}},{...data(),material:{...material(),id:courseId}},
    {...data(),material:{...material(),targetUrl:''}},{...data(),material:{...material(),targetUrl:'https://localhost'}},{...data(),material:{...material(),sourceUrl:'https://example.org'}},
    {...data(),material:{...material(),position:0}},{...data(),material:{...material(),position:1.1}},{...data(),material:{...material(),kind:'url'}},{...data(),material:{...material(),sourceMode:'official'}},
    {...data(),material:{...material(),summary:'\ud800'}},{...data(),material:{...material(),summary:'\0'}},{...data(),secret:'PRIVATE'},
    {...data(),course:{...course(),title:'x'.repeat(dtmCourseResourceMaxResponseBytes)}}])assert.throws(()=>parseDtmCourseResourceData(value,userId,courseId,materialId),statusIs(503));
  for(const key of Object.keys(material())){const row:Record<string,unknown>={...material()};delete row[key];assert.throws(()=>parseDtmCourseResourceData({...data(),material:row},userId,courseId,materialId),statusIs(503));}
});
test('exact read captures verified caller and uses one owner-filtered embedded query; never fetches destination',async()=>{
  const calls:Call[]=[];await mock(call=>{calls.push(call);return json(call.method==='POST'?access():raw());},async()=>assert.deepEqual(await loadDtmCourseResource(account(),{courseId,materialId}),data()));
  assert.equal(calls.length,2);assert.equal(calls[0].url.pathname,'/rest/v1/rpc/dtm_course_content_access');assert.deepEqual(calls[0].body,{});
  assert.equal(calls[1].url.pathname,'/rest/v1/dtm_courses');assert.equal(calls[1].url.searchParams.get('user_id'),'eq.'+userId);assert.equal(calls[1].url.searchParams.get('id'),'eq.'+courseId);
  assert.equal(calls[1].url.searchParams.get('dtm_materials.id'),'eq.'+materialId);assert.equal(calls[1].url.searchParams.get('dtm_materials.course_id'),'eq.'+courseId);assert.equal(calls[1].url.searchParams.get('limit'),'2');
  for(const call of calls){assert.equal(call.url.origin,'https://xiftudmvxphxcjtmfmib.supabase.co');assert.equal(call.headers.get('authorization'),'Bearer synthetic-caller-token');assert.equal(call.redirect,'error');assert.ok(call.signal);}
});
test('absence is distinct from unowned course, provider failure and malformed joined material',async()=>{
  await mock(call=>json(call.method==='POST'?access():[{...raw()[0],dtm_materials:[]}]),async()=>assert.equal((await loadDtmCourseResource(account(),{courseId,materialId})).material,null));
  await mock(call=>json(call.method==='POST'?access():[]),async()=>assert.rejects(()=>loadDtmCourseResource(account(),{courseId,materialId}),statusIs(403)));
  for(const result of [[raw()[0],raw()[0]],[{...raw()[0],user_id:other}],[{...raw()[0],dtm_materials:[null]}],[{...raw()[0],dtm_materials:[raw()[0].dtm_materials[0],raw()[0].dtm_materials[0]]}],
    [{...raw()[0],dtm_materials:[{...raw()[0].dtm_materials[0],course_id:materialId}]}],[{...raw()[0],dtm_materials:[{...raw()[0].dtm_materials[0],target_url:'https://private.local'}]}]])
    await mock(call=>json(call.method==='POST'?access():result),async()=>assert.rejects(()=>loadDtmCourseResource(account(),{courseId,materialId}),statusIs(503)));
  for(const status of [400,401,403,409,429,500])await mock(()=>json({private:'DO NOT EXPOSE'},status),async()=>assert.rejects(()=>loadDtmCourseResource(account(),{courseId,materialId}),statusIs(status<410?status:503)));
});
test('strict options and unverified/malformed account are rejected before dispatch',async()=>{
  let calls=0;await mock(()=>{calls++;return json(access());},async()=>{
    for(const options of [{courseId},{courseId,materialId,userId:other},{courseId,materialId:'bad'},{courseId:[courseId],materialId},null])await assert.rejects(()=>loadDtmCourseResource(account(),options as never),statusIs(400));
    for(const change of [{user:{id:'ABCDEF00-0000-4000-8000-000000000002'}},{token:''},{url:'https://foreign.supabase.co'},{requestDeadline:NaN}])await assert.rejects(()=>loadDtmCourseResource({...account(),...change} as never,{courseId,materialId}));
  });assert.equal(calls,0);
  for(const value of [null,{userId:other,canManage:false},{userId,canManage:1},{...access(),secret:true}])await mock(()=>json(value),async()=>assert.rejects(()=>loadDtmCourseResource(account(),{courseId,materialId}),statusIs(503)));
});
test('mutating caller/options during the access await cannot change the downstream target/token',async()=>{
  const a=account(),options={courseId,materialId};let calls=0;
  await mock(call=>{calls++;if(calls===1){a.user.id=other;a.token='OTHER';a.key='OTHER';a.url='https://other.invalid';options.courseId=materialId;options.materialId=courseId;return json(access());}
    assert.equal(call.headers.get('authorization'),'Bearer synthetic-caller-token');assert.equal(call.url.searchParams.get('user_id'),'eq.'+userId);assert.equal(call.url.searchParams.get('id'),'eq.'+courseId);return json(raw());},
  async()=>assert.deepEqual(await loadDtmCourseResource(a,options),data()));
});
test('stream response is bounded, rejects malformed UTF8 and enforces an earlier deadline',async()=>{
  for(const response of [()=>new Response('x',{headers:{'content-length':String(dtmCourseResourceMaxResponseBytes+1)}}),()=>new Response('x'.repeat(dtmCourseResourceMaxResponseBytes+1)),()=>new Response(new Uint8Array([0xc3,0x28])),()=>new Response('not json')])
    await mock(()=>response(),async()=>assert.rejects(()=>loadDtmCourseResource(account(),{courseId,materialId}),statusIs(503)));
  const keepAlive=setInterval(()=>{},100);try{await mock(()=>new Promise(()=>{}),async()=>assert.rejects(()=>loadDtmCourseResource({...account(),requestDeadline:Date.now()+20},{courseId,materialId}),statusIs(503)));}finally{clearInterval(keepAlive);}
  let calls=0;await mock(()=>{calls++;return json(access());},async()=>assert.rejects(()=>loadDtmCourseResource({...account(),requestDeadline:Date.now()-1},{courseId,materialId}),statusIs(503)));assert.equal(calls,0);
});
test('additive migration preserves every existing operation outside the material destination branch',async()=>{
  const before=await readFile('supabase/migrations/20261112010000_student_workspace.sql','utf8'),after=await readFile('supabase/migrations/20261114020000_dtm_material_targets.sql','utf8');
  const extract=(text:string)=>{const start=text.indexOf('function public.dtm_manage_record(');return text.slice(start,text.indexOf('\n$$;',start)+4);};
  const oldBody=extract(before),newBody=extract(after),begin="      when 'save_dtm_material' then",end="      when 'delete_dtm_material' then";
  assert.equal(oldBody.slice(0,oldBody.indexOf(begin)),newBody.slice(0,newBody.indexOf(begin)));assert.equal(oldBody.slice(oldBody.indexOf(end)),newBody.slice(newBody.indexOf(end)));
  assert.match(after,/target_url=case when p_payload \? 'target_url' then excluded.target_url else dtm_materials.target_url end/);
  assert.match(after,/nullif\(p_payload->>'target_url',''\)/);assert.match(after,/add column target_url text/);assert.doesNotMatch(after,/create (?:or replace )?policy|alter policy|grant .* to|disable trigger/i);
  assert.match(after,/values \(v_uid, p_kind, v_id, 'Changed a private DTM record\.'\)/);
  const workspace=await readFile('server/affairsWorkspace.js','utf8');assert.match(workspace,/targetUrl:item.target_url \?\? null/);
});

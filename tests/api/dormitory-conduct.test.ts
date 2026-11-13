import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {DormitoryConductError,dormitoryConductFields,dormitoryConductKinds,dormitoryConductMaxPayloadBytes,dormitoryConductPayloadBytes,
  dormitoryConductReadSource,loadDormitoryConduct,loadDormitoryConductAdmin,manageDormitoryConductRecord,parseDormitoryConductData,
  parseDormitoryConductAdminData,validateDormitoryConductPayload,type DormitoryConductAccount,type DormitoryConductKind} from '../../server/dormitoryConduct.js';
import {ownDormitoryConductSnapshot} from '../../src/services/dormitoryConduct.ts';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const id='20000000-0000-4000-8000-000000000001',requestId='30000000-0000-4000-8000-000000000001',stamp='2030-01-02T03:04:05.123456+08:00';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-public-key',token:'synthetic-caller-token',user:{id:owner}} as DormitoryConductAccount;
const saveKind='save_dormitory_conduct',deleteKind='delete_dormitory_conduct';
const payload={id,user_id:owner,request_id:requestId,expected_version:0,result:'unknown'},deletion={id,user_id:owner,request_id:requestId,expected_version:1};
const snapshot={userId:owner,sourceMode:'local_demo',version:1,result:'unknown'};
const record={...snapshot,id,createdAt:stamp,updatedAt:stamp};
const row={id,user_id:owner,source_mode:'local_demo',version:1,result:'unknown',created_at:stamp,updated_at:stamp,deleted_at:null};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const statusIs=(status:number)=>(error:unknown)=>error instanceof DormitoryConductError&&error.status===status;
type Call={url:URL;headers:Headers;method:string;body:unknown;signal:AbortSignal|null|undefined;redirect:RequestRedirect|undefined};
async function mockFetch(handler:(call:Call)=>Response|Promise<Response>,run:()=>void|Promise<void>){
  const saved=globalThis.fetch;globalThis.fetch=(input,init)=>Promise.resolve(handler({url:new URL(String(input)),headers:new Headers(init?.headers),
    method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):undefined,signal:init?.signal,redirect:init?.redirect}));
  try{await run();}finally{globalThis.fetch=saved;}
}

test('only explicit empty/unknown is valid; omission, rows, eligibility and source capabilities are rejected',async()=>{
  for(const result of ['empty','unknown'])assert.equal(validateDormitoryConductPayload(saveKind,{...payload,result}),null);
  for(const result of [undefined,null,'',' ','EMPTY','recorded','populated',0,false,[],{}])assert.ok(validateDormitoryConductPayload(saveKind,{...payload,result}));
  for(const [kind,fixture] of [[saveKind,payload],[deleteKind,deletion]] as [DormitoryConductKind,Record<string,unknown>][]){
    assert.equal(validateDormitoryConductPayload(kind,fixture),null);assert.equal(validateDormitoryConductPayload(kind,Object.assign(Object.create(null),fixture)),null);
    assert.equal(validateDormitoryConductPayload(kind,{...fixture,expected_version:999999998}),null);
    for(const key of Object.keys(fixture)){const missing={...fixture};delete missing[key];assert.ok(validateDormitoryConductPayload(kind,missing),key);}
    for(const patch of [{extra:null},{rows:[]},{eligible:false},{source_mode:'official'},{document_url:'/private'},{user_id:null},{id:'bad'},
      {request_id:'ABCDEF00-0000-4000-8000-000000000001'},{expected_version:-1},{expected_version:'1'},{expected_version:0.5},{expected_version:999999999}])
      assert.ok(validateDormitoryConductPayload(kind,{...fixture,...patch}));
    for(const value of [null,[],Object.create(fixture)])assert.ok(validateDormitoryConductPayload(kind,value));
  }
  assert.ok(validateDormitoryConductPayload(deleteKind,{...deletion,expected_version:0}));assert.ok(validateDormitoryConductPayload(deleteKind,{...deletion,result:'empty'}));
  for(const kind of [null,undefined,{},[],'constructor','__proto__','toString','save_conduct',''])assert.ok(validateDormitoryConductPayload(kind,payload));
  let calls=0;await mockFetch(()=>{calls++;return json({});},async()=>assert.rejects(manageDormitoryConductRecord(account,saveKind,{...payload,rows:[]}),statusIs(400)));assert.equal(calls,0);
});

test('fixed scalar payloads fit the bounded budget and UTF8/escaping accounting does not coerce nested values',()=>{
  const maximum={...payload,expected_version:999999998,result:'unknown'};
  assert.ok(dormitoryConductPayloadBytes(maximum)<256);assert.ok(dormitoryConductPayloadBytes(maximum)<dormitoryConductMaxPayloadBytes);
  assert.equal(dormitoryConductPayloadBytes({text:'😀\u0001'}),new TextEncoder().encode('{"text": "😀\\u0001"}').byteLength);
  assert.equal(dormitoryConductPayloadBytes({text:'x'.repeat(1012)}),1024);assert.equal(dormitoryConductPayloadBytes({text:'x'.repeat(1013)}),1025);
  for(const value of [{nested:{}},{value:NaN},{value:Infinity},{value:undefined},{value:true},[]])assert.equal(dormitoryConductPayloadBytes(value),Infinity);
});

test('personal and admin parsers retain absent/unknown/empty distinctions and strict owner/projection boundaries',()=>{
  assert.deepEqual(parseDormitoryConductData({snapshot:null},owner),{snapshot:null});assert.equal(ownDormitoryConductSnapshot(null,owner),null);
  assert.deepEqual(parseDormitoryConductAdminData({record:null},owner),{record:null});
  for(const result of ['empty','unknown']){
    const own={...snapshot,result};assert.deepEqual(parseDormitoryConductData({snapshot:own},owner),{snapshot:own});assert.deepEqual(ownDormitoryConductSnapshot(own,owner),own);
  }
  assert.deepEqual(parseDormitoryConductAdminData({record},owner),{record});
  for(const patch of [{userId:other},{sourceMode:'official'},{version:0},{version:1000000000},{version:'1'},{result:null},{result:'populated'},{rows:[]},{id}]){
    assert.throws(()=>parseDormitoryConductData({snapshot:{...snapshot,...patch}},owner),statusIs(503));assert.equal(ownDormitoryConductSnapshot({...snapshot,...patch},owner),null);
  }
  assert.equal(ownDormitoryConductSnapshot({...snapshot,result:{toString(){throw new Error('No coercion');}}},owner),null);
  for(const patch of [{id:'bad'},{userId:other},{createdAt:'2030-02-30T00:00:00Z'},{updatedAt:'2030-01-01T24:00:00Z'},{updatedAt:undefined},{downloadUrl:'/private'}])
    assert.throws(()=>parseDormitoryConductAdminData({record:{...record,...patch}},owner),statusIs(503));
  for(const data of [null,[],{snapshot:undefined},{snapshot:null,extra:true},{record:null}])assert.throws(()=>parseDormitoryConductData(data,owner),statusIs(503));
  assert.throws(()=>parseDormitoryConductData({snapshot:null},'invalid'),statusIs(503));assert.throws(()=>parseDormitoryConductAdminData({record},'invalid'),statusIs(503));
});

test('personal read filters active caller singleton and exposes only the four source-state fields',async()=>{
  const calls:Call[]=[];await mockFetch(call=>{calls.push(call);return json([row]);},async()=>assert.deepEqual(await loadDormitoryConduct(account),{snapshot}));
  assert.equal(calls.length,1);const call=calls[0];assert.equal(call.url.pathname,'/rest/v1/affairs_dormitory_conduct');assert.equal(call.method,'GET');
  assert.deepEqual(Object.fromEntries(call.url.searchParams),{select:dormitoryConductReadSource.select,order:'id.asc',limit:'2',deleted_at:'is.null',user_id:'eq.'+owner});
  assert.equal(call.headers.get('authorization'),'Bearer synthetic-caller-token');assert.equal(call.headers.get('apikey'),'synthetic-public-key');assert.equal(call.redirect,'error');assert.ok(call.signal);
  await mockFetch(()=>json([]),async()=>assert.deepEqual(await loadDormitoryConduct(account),{snapshot:null}));
  for(const result of ['empty','unknown'])await mockFetch(()=>json([{...row,result}]),async()=>assert.equal((await loadDormitoryConduct(account)).snapshot?.result,result));
});

test('duplicate, foreign, deleted or malformed rows fail closed instead of claiming an empty record',async()=>{
  for(const patch of [{user_id:other},{source_mode:'official'},{version:0},{result:null},{result:'populated'},{updated_at:'bad'},
    {deleted_at:stamp},{created_at:undefined},{signed_url:'private'}])await mockFetch(()=>json([{...row,...patch}]),async()=>assert.rejects(loadDormitoryConduct(account),statusIs(503)));
  for(const body of [[row,row],[row,{...row,id:other}],{snapshot},null])await mockFetch(()=>json(body),async()=>assert.rejects(loadDormitoryConduct(account),statusIs(503)));
});

test('admin reads require exact selected target, live authorization and synchronously captured caller/owner',async()=>{
  let calls=0;await mockFetch(()=>{calls++;return json({});},async()=>{
    for(const options of [undefined,null,{},Object.create({userId:owner}),{userId:'bad'},{userId:owner,all:true}])
      await assert.rejects(loadDormitoryConductAdmin(account,options as {userId:string}),statusIs(400));
  });assert.equal(calls,0);
  const selected={userId:other},caller={...account,user:{id:owner}};
  await mockFetch(call=>{
    if(call.url.pathname.endsWith('/affairs_dormitory_conduct_access')){selected.userId=owner;caller.user.id=other;caller.token='mutated';return json({userId:owner,canManage:true});}
    assert.equal(call.url.searchParams.get('user_id'),'eq.'+other);assert.equal(call.headers.get('authorization'),'Bearer synthetic-caller-token');return json([{...row,user_id:other}]);
  },async()=>assert.deepEqual(await loadDormitoryConductAdmin(caller,selected),{record:{...record,userId:other}}));
  for(const access of [null,[],{userId:owner,canManage:false},{userId:other,canManage:true},{userId:owner,canManage:true,extra:true}]){
    calls=0;await mockFetch(()=>{calls++;return json(access);},async()=>assert.rejects(loadDormitoryConductAdmin(account,{userId:other}),statusIs(403)));assert.equal(calls,1);
  }
});

test('writes capture exact payload and actor before authorization, rejecting receipt mismatch',async()=>{
  const input={...payload},caller={...account,user:{id:owner}};let calls=0;
  await mockFetch(call=>{
    calls++;if(call.url.pathname.endsWith('/affairs_dormitory_conduct_access')){input.result='empty';input.user_id=other;caller.user.id=other;caller.token='mutated';return json({userId:owner,canManage:true});}
    assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_manage_dormitory_conduct');assert.deepEqual(call.body,{p_kind:saveKind,p_payload:payload});assert.equal(call.headers.get('authorization'),'Bearer synthetic-caller-token');
    return json({id,kind:saveKind,version:1,summary:'Saved explicit local notice'});
  },async()=>assert.equal((await manageDormitoryConductRecord(caller,saveKind,input)).version,1));assert.equal(calls,2);
  for(const receipt of [{id:other,kind:saveKind,version:1,summary:'bad'},{id,kind:deleteKind,version:1,summary:'bad'},{id,kind:saveKind,version:2,summary:'bad'},
    {id,kind:saveKind,version:1,summary:'x'.repeat(201)},{id,kind:saveKind,version:1,summary:'bad',extra:true},{id,kind:saveKind,version:1,summary:'\0'}])
    await mockFetch(call=>json(call.url.pathname.endsWith('/affairs_dormitory_conduct_access')?{userId:owner,canManage:true}:receipt),async()=>assert.rejects(manageDormitoryConductRecord(account,saveKind,payload),statusIs(503)));
});

test('uncertain save/delete retries preserve exact request identity and only return a verified durable receipt',async()=>{
  for(const [kind,fixture] of [[saveKind,payload],[deleteKind,deletion]] as const){
    const calls:unknown[]=[];await mockFetch(call=>{
      if(call.url.pathname.endsWith('/affairs_dormitory_conduct_access'))return json({userId:owner,canManage:true});calls.push(call.body);
      if(calls.length===1)throw new Error('Synthetic lost response');return json({id,kind,version:fixture.expected_version+1,summary:'Durable receipt'});
    },async()=>{
      await assert.rejects(manageDormitoryConductRecord(account,kind,fixture),statusIs(503));
      assert.deepEqual(await manageDormitoryConductRecord(account,kind,fixture),await manageDormitoryConductRecord(account,kind,fixture));
    });assert.equal(calls.length,3);assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[1],calls[2]);
  }
});

test('transport bounds errors/bodies and one deadline across authorization plus read/write',async()=>{
  for(const status of [400,401,403,409,413,422,500,503])await mockFetch(()=>json({error:'PRIVATE provider details'},status),async()=>assert.rejects(loadDormitoryConduct(account),
    error=>error instanceof DormitoryConductError&&error.status===([413,422].includes(status)?400:[500,503].includes(status)?503:status)&&!error.message.includes('PRIVATE')));
  for(const patch of [{url:'https://wrong.supabase.co'},{token:''},{key:''},{user:{id:'invalid'}},{requestDeadline:NaN}])await mockFetch(()=>{throw new Error('Never fetch');},async()=>assert.rejects(loadDormitoryConduct({...account,...patch} as DormitoryConductAccount)));
  for(const response of [new Response('PRIVATE invalid JSON'),new Response('[]',{headers:{'content-length':'4097'}}),new Response(new Uint8Array([0xff])),new Response('x'.repeat(4097))])
    await mockFetch(()=>response,async()=>assert.rejects(loadDormitoryConduct(account),statusIs(503)));
  const savedNow=Date.now;let now=1000,calls=0;Date.now=()=>now;
  try{
    await mockFetch(()=>{calls++;now=5000;return json({userId:owner,canManage:true});},async()=>assert.rejects(loadDormitoryConductAdmin({...account,requestDeadline:5000},{userId:owner}),statusIs(503)));assert.equal(calls,1);
    now=1000;calls=0;await mockFetch(()=>{calls++;now=13000;return json({userId:owner,canManage:true});},async()=>assert.rejects(manageDormitoryConductRecord(account,saveKind,payload),statusIs(503)));assert.equal(calls,1);
  }finally{Date.now=savedNow;}
  const savedTimeout=AbortSignal.timeout,controller=new AbortController();let cancelled=false;AbortSignal.timeout=()=>controller.signal;
  try{await mockFetch(()=>new Response(new ReadableStream({cancel(){cancelled=true;}})),async()=>{
    const pending=loadDormitoryConduct(account),timer=setTimeout(()=>controller.abort(),1);
    try{await assert.rejects(pending,statusIs(503));assert.equal(cancelled,true);}finally{clearTimeout(timer);}
  });}finally{AbortSignal.timeout=savedTimeout;}
});

test('unapplied SQL statically constrains independent explicit states, own RLS and audited singleton lifecycle',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261112220000_dormitory_conduct.sql',import.meta.url),'utf8');
  assert.ok(sql.includes('create table public.'+dormitoryConductReadSource.table));
  assert.match(sql,/result text not null check\(result in \('empty','unknown'\)\)/);assert.doesNotMatch(sql,/result text[^\n]*default/);
  for(const kind of dormitoryConductKinds){assert.ok(sql.includes("'"+kind+"'"));assert.ok(Object.hasOwn(dormitoryConductFields,kind));}
  assert.match(sql,/octet_length\(value::text\)>1024/);assert.match(sql,/not\(value \?& fields\) or value-fields<>'\{\}'::jsonb/);
  assert.match(sql,/version between 1 and 999999999/);assert.match(sql,/expected:=\(\(p_payload->>'expected_version'\)::numeric\)::integer/);
  assert.match(sql,/create unique index affairs_dormitory_conduct_active_owner_idx on public\.affairs_dormitory_conduct\(user_id\) where deleted_at is null/);
  assert.match(sql,/deleted_at is null and \(select private\.affairs_google_identity\(\)\)/);assert.match(sql,/user_id=\(select auth\.uid\(\)\) or \(select private\.affairs_is_admin\(\)\)/);
  assert.match(sql,/grant select on public\.affairs_dormitory_conduct to authenticated/);assert.match(sql,/alter table private\.affairs_dormitory_conduct_operations enable row level security/);
  assert.match(sql,/new\.user_id<>old\.user_id/);assert.match(sql,/new\.source_mode<>old\.source_mode/);assert.match(sql,/Deleted dormitory conduct IDs cannot be reused/);
  assert.ok(sql.indexOf('select * into receipt')<sql.indexOf('if not exists(select 1 from public.affairs_profiles'));assert.match(sql,/receipt\.payload<>p_payload/);
  assert.ok(sql.indexOf("'dorm-conduct:actor:'")<sql.indexOf("'dorm-conduct:owner:'"));assert.ok(sql.indexOf("'dorm-conduct:owner:'")<sql.indexOf("'dorm-conduct:record:'"));
  assert.match(sql,/target\.user_id=owner_id and target\.version=expected and target\.deleted_at is null/);
  assert.match(sql,/insert into public\.affairs_agent_audit/);assert.match(sql,/insert into private\.affairs_dormitory_conduct_operations/);
  assert.doesNotMatch(sql,/(?:insert into|update|delete from)\s+(?:auth\.|storage\.|public\.affairs_profiles)/i);
  assert.doesNotMatch(sql,/grant (?:all|insert|update|delete).*authenticated/i);assert.doesNotMatch(sql,/\b(?:download_url|signed_url|storage_path|eligibility|conduct_code|housing_period_id)\s+(?:text|uuid|boolean)/i);
});

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {DtmDashboardLayoutError,dtmDashboardLayoutDefaults,dtmDashboardLayoutKinds,dtmDashboardLayoutMaxPayloadBytes,
  dtmDashboardLayoutPayloadBytes,dtmDashboardLayoutReadSource,executeDtmDashboardLayoutAction,loadDtmDashboardLayout,
  parseDtmDashboardLayout,validateDtmDashboardLayoutPayload,type DtmDashboardLayoutAccount,type DtmDashboardLayoutKind,
  type DtmDashboardLayoutSnapshot,type DtmDashboardLayoutBlock} from '../../server/dtmDashboardLayout.js';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const requestId='20000000-0000-4000-8000-000000000001',nextId='20000000-0000-4000-8000-000000000002';
const stamp='2030-01-02T03:04:05.123456+08:00',origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const account={url:origin,key:'synthetic-public-key',token:'synthetic-caller-token',user:{id:owner}} as DtmDashboardLayoutAccount;
const defaults=()=>dtmDashboardLayoutDefaults().blocks;
const customized=()=>[...defaults()].reverse().map((block,index)=>({...block,visible:index!==1,region:'content' as const,weight:0}));
const payload=()=>({request_id:requestId,expected_version:0,blocks:customized()});
const snapshot=(version=1,blocks:DtmDashboardLayoutBlock[]=customized()):DtmDashboardLayoutSnapshot=>({version,blocks,updatedAt:stamp});
const row=()=>({user_id:owner,version:1,blocks:customized(),updated_at:stamp});
const statusIs=(status:number)=>(error:unknown)=>error instanceof DtmDashboardLayoutError&&error.status===status;
type Call={url:URL;headers:Headers;body:Record<string,unknown>|undefined;method:string;signal:AbortSignal|null|undefined;redirect:RequestRedirect|undefined};
async function mocked(handler:(call:Call)=>Response|Promise<Response>,run:()=>Promise<void>){
  const original=globalThis.fetch;globalThis.fetch=(input,init)=>Promise.resolve(handler({url:new URL(String(input)),headers:new Headers(init?.headers),
    body:init?.body?JSON.parse(String(init.body)):undefined,method:init?.method??'GET',signal:init?.signal,redirect:init?.redirect}));
  try{await run();}finally{globalThis.fetch=original;}
}

test('strict source block schema accepts false, zero, ties and input order without adding controls',()=>{
  assert.deepEqual(dtmDashboardLayoutKinds,['save_dtm_dashboard_layout','reset_dtm_dashboard_layout']);
  assert.deepEqual(dtmDashboardLayoutDefaults(),{version:0,blocks:[
    {id:'important',visible:true,region:'side-pre',weight:-1},{id:'navigation',visible:true,region:'side-pre',weight:0},{id:'contacts',visible:true,region:'side-pre',weight:1},
  ],updatedAt:null});
  const copy=dtmDashboardLayoutDefaults();copy.blocks[0].visible=false;assert.equal(dtmDashboardLayoutDefaults().blocks[0].visible,true);
  for(const region of ['side-pre','side-post','content'])for(const weight of [-10,0,10])assert.equal(validateDtmDashboardLayoutPayload('save_dtm_dashboard_layout',{
    ...payload(),blocks:customized().map(block=>({...block,region,weight})),
  }),null);
  for(const kind of dtmDashboardLayoutKinds){
    const value={request_id:requestId,expected_version:999999998,...(kind==='save_dtm_dashboard_layout'?{blocks:customized()}:{})};
    assert.equal(validateDtmDashboardLayoutPayload(kind,value),null);assert.equal(validateDtmDashboardLayoutPayload(kind,Object.assign(Object.create(null),value)),null);
    for(const key of Object.keys(value)){const missing={...value} as Record<string,unknown>;delete missing[key];assert.ok(validateDtmDashboardLayoutPayload(kind,missing),key);}
    for(const extra of [{user_id:other},{title:'Injected'},{html:'<script>bad()</script>'},{style:'display:none'},{request_id:'ABCDEF00-0000-4000-8000-000000000001'},
      {expected_version:-1},{expected_version:0.5},{expected_version:'0'},{expected_version:999999999},{expected_version:NaN},{expected_version:Infinity}])assert.ok(validateDtmDashboardLayoutPayload(kind,{...value,...extra}));
    assert.ok(validateDtmDashboardLayoutPayload(kind,Object.create(value)));
  }
  for(const kind of ['constructor','toString','__proto__',null,undefined,{},[]])assert.ok(validateDtmDashboardLayoutPayload(kind,payload()));
  assert.ok(validateDtmDashboardLayoutPayload('reset_dtm_dashboard_layout',payload()));
  for(const patch of [{id:'html'},{visible:0},{visible:null},{region:'left'},{weight:11},{weight:-11},{weight:0.1},{weight:'0'},{content:'unobserved'},{id:undefined}])
    assert.ok(validateDtmDashboardLayoutPayload('save_dtm_dashboard_layout',{...payload(),blocks:defaults().map((block,index)=>index?block:{...block,...patch})}));
  for(const blocks of [[],defaults().slice(0,2),[...defaults(),defaults()[0]],[defaults()[0],defaults()[0],defaults()[2]],new Array(3)])
    assert.ok(validateDtmDashboardLayoutPayload('save_dtm_dashboard_layout',{...payload(),blocks}));
});

test('JSONB byte accounting is bounded and does not silently discard unknown values',()=>{
  assert.equal(dtmDashboardLayoutMaxPayloadBytes,2048);
  assert.ok(dtmDashboardLayoutPayloadBytes(payload())<512);
  assert.equal(dtmDashboardLayoutPayloadBytes({value:['😀',false,0]}),Buffer.byteLength('{"value": ["😀", false, 0]}'));
  assert.equal(dtmDashboardLayoutPayloadBytes({text:'x'.repeat(2036)}),2048);
  assert.equal(dtmDashboardLayoutPayloadBytes({text:'x'.repeat(2037)}),2049);
  const cyclic:Record<string,unknown>={};cyclic.self=cyclic;
  for(const value of [{x:undefined},{x:NaN},{x:Infinity},cyclic,new Array(3),{[Symbol('hidden')]:1}])assert.equal(dtmDashboardLayoutPayloadBytes(value),Infinity);
});

test('snapshot parsing distinguishes canonical absent defaults from persisted data and preserves timestamps',()=>{
  assert.deepEqual(parseDtmDashboardLayout(dtmDashboardLayoutDefaults()),dtmDashboardLayoutDefaults());
  const saved=snapshot();assert.deepEqual(parseDtmDashboardLayout(saved),saved);
  const copy=parseDtmDashboardLayout(saved);copy.blocks[0].visible=!copy.blocks[0].visible;assert.notDeepEqual(copy,saved);
  for(const patch of [{version:0},{version:-1},{version:'1'},{version:1000000000},{updatedAt:null},{updatedAt:'2030-02-30T12:00:00Z'},
    {updatedAt:'2030-01-02'},{updatedAt:'2030-01-02T03:04:05.1234567Z'},{blocks:[]},{userId:owner},{html:'x'}])assert.throws(()=>parseDtmDashboardLayout({...saved,...patch}),statusIs(503));
  assert.throws(()=>parseDtmDashboardLayout({...dtmDashboardLayoutDefaults(),blocks:customized()}),statusIs(503));
  assert.throws(()=>parseDtmDashboardLayout({...dtmDashboardLayoutDefaults(),updatedAt:stamp}),statusIs(503));
  assert.throws(()=>parseDtmDashboardLayout(Object.create(saved)),statusIs(503));
});

test('successful own reads alone produce defaults; saved rows are minimal and no admin branch exists',async()=>{
  for(const present of [false,true])await mocked(call=>{
    assert.equal(call.url.origin,origin);assert.equal(call.url.pathname,'/rest/v1/dtm_dashboard_layouts');assert.equal(call.method,'GET');
    assert.equal(call.url.searchParams.get('user_id'),'eq.'+owner);assert.equal(call.url.searchParams.get('limit'),'2');
    assert.equal(call.url.searchParams.get('select'),dtmDashboardLayoutReadSource.select);assert.equal(call.url.searchParams.get('order'),'user_id.asc');
    assert.equal(call.headers.get('Authorization'),'Bearer '+account.token);assert.equal(call.headers.get('apikey'),account.key);assert.equal(call.redirect,'error');
    assert.ok(call.signal instanceof AbortSignal);return Response.json(present?[row()]:[]);
  },async()=>{const admin={...account,user:{...account.user,app_metadata:{role:'admin'}}};assert.deepEqual(await loadDtmDashboardLayout(admin),present?snapshot():dtmDashboardLayoutDefaults());});
});

test('failed, foreign, duplicated and malformed rows never become defaults',async()=>{
  for(const rows of [null,{},[row(),row()],[{...row(),user_id:other}],[{...row(),version:0}],[{...row(),blocks:null}],[{...row(),updated_at:null}],[{...row(),secret:'unapproved'}]])
    await mocked(()=>Response.json(rows),async()=>assert.rejects(loadDtmDashboardLayout(account),statusIs(503)));
  for(const status of [400,401,403,409,413,422,500,302])await mocked(()=>new Response('PRIVATE_PROVIDER_DETAIL',{status}),async()=>{
    await assert.rejects(loadDtmDashboardLayout(account),(error:unknown)=>{assert.ok(error instanceof DtmDashboardLayoutError);assert.equal(error.status,[413,422].includes(status)?400:[400,401,403,409].includes(status)?status:503);assert.doesNotMatch(error.message,/PRIVATE_PROVIDER_DETAIL/);return true;});
  });
  let requests=0;await mocked(()=>{requests++;return Response.json([]);},async()=>{
    for(const patch of [{url:'https://foreign.invalid'},{token:''},{user:{id:other.toUpperCase().replace('10000000','ABCDEF00')}},{requestDeadline:NaN}])
      await assert.rejects(loadDtmDashboardLayout({...account,...patch} as DtmDashboardLayoutAccount));
  });assert.equal(requests,0);
});

test('save and reset are exact caller-JWT RPCs with no student identifier or generic cleanup',async()=>{
  for(const kind of dtmDashboardLayoutKinds){const value={request_id:requestId,expected_version:0,...(kind==='save_dtm_dashboard_layout'?{blocks:customized()}:{})};
    const result=snapshot(1,kind==='save_dtm_dashboard_layout'?customized():defaults());let calls=0;
    await mocked(call=>{calls++;assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_save_dtm_dashboard_layout');assert.equal(call.method,'POST');assert.equal(call.redirect,'error');
      assert.equal(call.headers.get('Authorization'),'Bearer '+account.token);assert.deepEqual(call.body,{p_kind:kind,p_payload:value});assert.equal(call.url.search,'');return Response.json(result);
    },async()=>assert.deepEqual(await executeDtmDashboardLayoutAction(account,kind,value),result));assert.equal(calls,1);
  }
  let calls=0;await mocked(()=>{calls++;return Response.json({});},async()=>{
    await assert.rejects(executeDtmDashboardLayoutAction(account,'save_dtm_dashboard_layout',{...payload(),user_id:other}),statusIs(400));
  });assert.equal(calls,0);
});

test('caller and nested command are captured synchronously before asynchronous dispatch',async()=>{
  const caller={...account,user:{id:owner}},value=payload(),expected=structuredClone(value);let calls=0;
  await mocked(call=>{calls++;assert.equal(call.headers.get('Authorization'),'Bearer '+account.token);assert.deepEqual(call.body,{p_kind:'save_dtm_dashboard_layout',p_payload:expected});return Response.json(snapshot());},async()=>{
    const pending=executeDtmDashboardLayoutAction(caller,'save_dtm_dashboard_layout',value);
    caller.user.id=other;caller.token='OTHER_TOKEN';caller.url='https://foreign.invalid';value.blocks[0].visible=true;value.blocks.reverse();value.request_id=nextId;
    assert.deepEqual(await pending,snapshot());
  });assert.equal(calls,1);
});

test('receipts must match command version, all block fields and reset defaults',async()=>{
  for(const kind of dtmDashboardLayoutKinds){const value={request_id:requestId,expected_version:0,...(kind==='save_dtm_dashboard_layout'?{blocks:customized()}:{})};
    const correct=snapshot(1,kind==='save_dtm_dashboard_layout'?customized():defaults());
    for(const wrong of [{...correct,version:2},{...correct,version:0,updatedAt:null},{...correct,updatedAt:null},{...correct,userId:owner},
      {...correct,blocks:correct.blocks.map((block,index)=>index?block:{...block,visible:!block.visible})},{...correct,blocks:[...correct.blocks].reverse()}])
      await mocked(()=>Response.json(wrong),async()=>assert.rejects(executeDtmDashboardLayoutAction(account,kind,value),statusIs(503)));
  }
});

test('transport preserves replay commands and original receipts across intervening save/reset',async()=>{
  // This injected RPC models durable server responses; actual SQL concurrency is a separate preflight.
  let current:DtmDashboardLayoutSnapshot=dtmDashboardLayoutDefaults();const receipts=new Map<string,{command:string;result:DtmDashboardLayoutSnapshot}>();
  await mocked(call=>{
    const {p_kind:kind,p_payload:input}=call.body as {p_kind:DtmDashboardLayoutKind;p_payload:ReturnType<typeof payload>};
    const command=JSON.stringify(call.body),prior=receipts.get(input.request_id);
    if(prior)return prior.command===command?Response.json(prior.result):Response.json({}, {status:409});
    if(input.expected_version!==current.version)return Response.json({}, {status:409});
    current=snapshot(current.version+1,kind==='save_dtm_dashboard_layout'?input.blocks:defaults());receipts.set(input.request_id,{command,result:structuredClone(current)});return Response.json(current);
  },async()=>{
    const first=await executeDtmDashboardLayoutAction(account,'save_dtm_dashboard_layout',payload());
    const reset={request_id:nextId,expected_version:1};assert.equal((await executeDtmDashboardLayoutAction(account,'reset_dtm_dashboard_layout',reset)).version,2);
    assert.deepEqual(await executeDtmDashboardLayoutAction(account,'save_dtm_dashboard_layout',payload()),first);
    await assert.rejects(executeDtmDashboardLayoutAction(account,'reset_dtm_dashboard_layout',{request_id:requestId,expected_version:0}),statusIs(409));
    await assert.rejects(executeDtmDashboardLayoutAction(account,'save_dtm_dashboard_layout',{...payload(),request_id:'20000000-0000-4000-8000-000000000003'}),statusIs(409));
  });assert.equal(receipts.size,2);
});

test('deadlines and bounded JSON decoding fail closed rather than producing defaults or exposing provider data',async()=>{
  let calls=0;await mocked(()=>{calls++;return Response.json([]);},async()=>assert.rejects(loadDtmDashboardLayout({...account,requestDeadline:Date.now()-1}),statusIs(503)));assert.equal(calls,0);
  for(const response of [new Response('not json'),new Response('[]',{headers:{'content-length':'4097'}}),new Response(' '.repeat(4097)),new Response(new Uint8Array([0xff]))])
    await mocked(()=>response,async()=>assert.rejects(loadDtmDashboardLayout(account),statusIs(503)));
  const keepAlive=setTimeout(()=>{},1000);
  try{
    await mocked(()=>new Promise<Response>(()=>{}),async()=>assert.rejects(loadDtmDashboardLayout({...account,requestDeadline:Date.now()+15}),statusIs(503)));
    await mocked(()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('['));}})),async()=>assert.rejects(loadDtmDashboardLayout({...account,requestDeadline:Date.now()+15}),statusIs(503)));
  }finally{clearTimeout(keepAlive);}
});

test('draft SQL declares own-only access, immutable ownership and replay before versioned reset',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261113230000_dtm_dashboard_layout.sql',import.meta.url),'utf8');
  assert.match(sql,/create policy dtm_dashboard_layout_owner_read[\s\S]+user_id=\(select auth\.uid\(\)\) and \(select private\.affairs_google_identity\(\)\)/);
  assert.doesNotMatch(sql,/affairs_is_admin|insert into (?:auth\.|public\.affairs_profiles)|grant (?:insert|update|delete)|delete from public\.dtm_dashboard_layouts/);
  assert.match(sql,/revoke all on public\.dtm_dashboard_layouts from public,anon,authenticated/);assert.match(sql,/grant select on public\.dtm_dashboard_layouts to authenticated/);
  assert.match(sql,/pg_advisory_xact_lock/);assert.ok(sql.indexOf('return receipt.result')<sql.indexOf('coalesce(prior.version,0)<>expected'));
  assert.match(sql,/version=version\+1/);assert.match(sql,/new\.user_id is distinct from old\.user_id/);
  assert.match(sql,/primary key\(user_id,request_id\)/);assert.match(sql,/receipt\.kind<>p_kind or receipt\.payload<>p_payload/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import dataHandler from '../../api/affairs-data.ts';
import actionHandler from '../../api/affairs-action.ts';
import {dtmDashboardLayoutDefaults,dtmDashboardLayoutReadSource} from '../../server/dtmDashboardLayout.js';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-public-key';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const requestId='20000000-0000-4000-8000-000000000001',stamp='2030-01-02T03:04:05.123456+08:00';
const token='synthetic-dashboard-token-'.repeat(3),adminToken='synthetic-dashboard-admin-'.repeat(3);
const scope='dtm-dashboard-layout',table='/rest/v1/dtm_dashboard_layouts',rpc='/rest/v1/rpc/affairs_save_dtm_dashboard_layout';
const blocks=()=>dtmDashboardLayoutDefaults().blocks;
const save=()=>({kind:'save_dtm_dashboard_layout',payload:{request_id:requestId,expected_version:0,blocks:blocks()}});
const reset=()=>({kind:'reset_dtm_dashboard_layout',payload:{request_id:requestId,expected_version:1}});
const saved=(version=1)=>({version,blocks:blocks(),updatedAt:stamp});
type Result={status:number;body:unknown;headers:Record<string,string>};
type Call={url:URL;headers:Headers;body:Record<string,unknown>|undefined;method:string};
type Query=Record<string,string|string[]|undefined>;
async function invoke(handler:typeof dataHandler|typeof actionHandler,{method=handler===dataHandler?'GET':'POST',body,query,auth=token}:{method?:string;body?:unknown;query?:Query;auth?:string|null}={}):Promise<Result>{
  const result:Result={status:200,body:null,headers:{}};
  const response={status(code:number){result.status=code;return response;},json(value:unknown){result.body=value;},setHeader(name:string,value:string){result.headers[name]=value;}};
  await handler({method,headers:auth?{authorization:'Bearer '+auth}:{},body,query},response);return result;
}
async function mocked(run:(call:Call)=>Response|Promise<Response>,body:(calls:Call[])=>Promise<void>,options:{google?:boolean;authStatus?:number;onAuth?:()=>void}={}){
  const original=globalThis.fetch,oldUrl=process.env.VITE_SUPABASE_URL,oldKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,calls:Call[]=[];
  process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  globalThis.fetch=async(input,init)=>{
    const call:Call={url:new URL(String(input)),headers:new Headers(init?.headers),body:init?.body?JSON.parse(String(init.body)):undefined,method:init?.method??'GET'};calls.push(call);
    assert.equal(call.url.origin,origin);assert.equal(call.headers.get('apikey'),key);assert.ok(init?.signal instanceof AbortSignal);
    const authorization=call.headers.get('authorization');assert.ok(authorization==='Bearer '+token||authorization==='Bearer '+adminToken);
    if(call.url.pathname==='/auth/v1/user'){
      options.onAuth?.();return options.authStatus?Response.json({error:'PRIVATE_PROVIDER_AUTH'},{status:options.authStatus}):Response.json({id:authorization==='Bearer '+adminToken?other:owner,identities:[{provider:options.google===false?'email':'google'}],app_metadata:{role:authorization==='Bearer '+adminToken?'admin':'student'}});
    }
    assert.equal(init?.redirect,'error');return run(call);
  };
  try{await body(calls);}finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=oldKey;}
}
const unexpected=()=>{throw new Error('Unexpected record dispatch.');};
function failure(result:Result,status:number){
  assert.equal(result.status,status);assert.deepEqual(Object.keys(result.body as object),['error']);
  assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE_PROVIDER|synthetic-dashboard|foreign-secret|user_id|html/i);
  assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');assert.equal(result.headers['X-Content-Type-Options'],'nosniff');
}

test('dedicated layout endpoints require supported methods and a verified Google caller',async()=>{
  await mocked(unexpected,async calls=>{
    const read=await invoke(dataHandler,{method:'POST',query:{scope}}),write=await invoke(actionHandler,{method:'GET'});failure(read,405);failure(write,405);
    assert.equal(read.headers.Allow,'GET');assert.equal(write.headers.Allow,'POST');
    for(const auth of [null,'short','x'.repeat(4097)]){failure(await invoke(dataHandler,{auth,query:{scope}}),401);failure(await invoke(actionHandler,{auth,body:save()}),401);}assert.equal(calls.length,0);
  });
  for(const options of [{google:false},{authStatus:401}])await mocked(unexpected,async calls=>{
    failure(await invoke(dataHandler,{query:{scope}}),401);failure(await invoke(actionHandler,{body:save()}),401);assert.equal(calls.length,2);
  },options);
});

test('own layout scope is minimal for students and admins; absent rows produce only canonical defaults',async()=>{
  for(const auth of [token,adminToken])for(const exists of [false,true])await mocked(call=>{
    assert.equal(call.url.pathname,table);assert.equal(call.url.searchParams.get('user_id'),'eq.'+(auth===token?owner:other));assert.equal(call.url.searchParams.get('select'),dtmDashboardLayoutReadSource.select);
    return Response.json(exists?[{user_id:auth===token?owner:other,version:1,blocks:blocks(),updated_at:stamp}]:[]);
  },async calls=>{
    const result=await invoke(dataHandler,{query:{scope},auth});assert.equal(result.status,200);assert.deepEqual(result.body,exists?saved():dtmDashboardLayoutDefaults());assert.equal(calls.length,2);
    assert.deepEqual(Object.keys(result.body as object).sort(),['blocks','updatedAt','version']);assert.doesNotMatch(JSON.stringify(result.body),/userId|user_id|role|course|title|contentHtml/);
  });
});

test('unknown, repeated and ambiguous layout scopes cannot fall through to conversations or generic snapshots',async()=>{
  const invalid:Query[]=[{scope,user_id:other},{scope,resource:'conversations'},{scope,id:'x'},{scope:'dtm-dashboard-layout-admin',user_id:other},{scope:'dtm-dashboard-layout-extra'},
    {scope:[scope,scope]},{scope:['admin',scope],resource:'conversations'},{scope:[scope,'admin']},{scope,user_id:[owner,other]}];
  await mocked(unexpected,async calls=>{for(const query of invalid)failure(await invoke(dataHandler,{query}),400);assert.equal(calls.length,invalid.length);assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));});
});

test('malformed or foreign loaded layouts fail closed instead of replacing the saved layout with defaults',async()=>{
  for(const rows of [[{user_id:other,version:1,blocks:blocks(),updated_at:stamp}],null,[{user_id:owner,version:0,blocks:blocks(),updated_at:null}],
    [{user_id:owner,version:1,blocks:blocks(),updated_at:stamp,secret:'foreign-secret'}]])await mocked(()=>Response.json(rows),async()=>failure(await invoke(dataHandler,{query:{scope}}),503));
});

test('save and reset dispatch only the exact owner RPC; replay keeps command and response unchanged',async()=>{
  for(const command of [save(),reset()]){
    const bodies:unknown[]=[];await mocked(call=>{
      assert.equal(call.url.pathname,rpc);assert.equal(call.method,'POST');assert.equal(call.headers.get('authorization'),'Bearer '+token);
      assert.deepEqual(call.body,{p_kind:command.kind,p_payload:command.payload});bodies.push(call.body);return Response.json(saved(command.payload.expected_version+1));
    },async calls=>{
      for(let attempt=0;attempt<2;attempt++){const result=await invoke(actionHandler,{body:command});assert.equal(result.status,200);assert.deepEqual(result.body,saved(command.payload.expected_version+1));assert.equal(result.headers['X-DTM-Cleanup'],undefined);}
      assert.equal(calls.length,4);assert.deepEqual(bodies[0],bodies[1]);
    });
  }
});

test('action envelope and schema reject extra fields and bound UTF8 before authorization',async()=>{
  await mocked(unexpected,async calls=>{
    for(const body of [{...save(),user_id:other},{...save(),requestId},{kind:'save_dtm_dashboard_layout',payload:[]},'{bad',null])failure(await invoke(actionHandler,{body}),400);
    assert.equal(calls.length,0);
    for(const payload of [{...save().payload,user_id:other},{...save().payload,blocks:[]},{...reset().payload,blocks:blocks()},{...save().payload,expected_version:'0'}])
      failure(await invoke(actionHandler,{body:{kind:Object.hasOwn(payload,'blocks')&&payload.expected_version===1?'reset_dtm_dashboard_layout':'save_dtm_dashboard_layout',payload}}),400);
    assert.equal(calls.length,4);
    const padded={...save(),payload:{...save().payload,padding:''}};const room=3072-Buffer.byteLength(JSON.stringify(padded));padded.payload.padding='界'.repeat(Math.floor(room/3))+'x'.repeat(room%3);
    assert.equal(Buffer.byteLength(JSON.stringify(padded)),3072);failure(await invoke(actionHandler,{body:padded}),400);assert.equal(calls.length,5);
    padded.payload.padding+='x';failure(await invoke(actionHandler,{body:padded}),400);assert.equal(calls.length,5);
  });
});

test('layout conflicts and failures preserve safe HTTP status without exposing provider data',async()=>{
  for(const status of [400,401,403,409,413,422,500])await mocked(()=>new Response('PRIVATE_PROVIDER_DATABASE',{status}),async()=>{
    const expected=[413,422].includes(status)?400:status===500?503:status;
    failure(await invoke(actionHandler,{body:save()}),expected);failure(await invoke(dataHandler,{query:{scope}}),expected);
  });
  await mocked(()=>Response.json({...saved(),version:2}),async()=>failure(await invoke(actionHandler,{body:save()}),503));
});

test('the action and read deadlines include prior token verification time',async()=>{
  const realNow=Date.now;let now=realNow();Date.now=()=>now;
  try{await mocked(unexpected,async calls=>{
    failure(await invoke(actionHandler,{body:save()}),503);failure(await invoke(dataHandler,{query:{scope}}),503);assert.equal(calls.length,2);
  },{onAuth:()=>{now+=18000;}});}finally{Date.now=realNow;}
});

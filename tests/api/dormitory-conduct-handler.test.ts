import assert from 'node:assert/strict';
import test from 'node:test';
import dataHandler from '../../api/affairs-data.ts';
import manageHandler from '../../api/affairs-manage.ts';
import {dormitoryConductMaxPayloadBytes,dormitoryConductPayloadBytes,dormitoryConductReadSource,type DormitoryConductKind} from '../../server/dormitoryConduct.js';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-public-key';
const owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',requestId='30000000-0000-4000-8000-000000000001',stamp='2030-01-02T03:04:05.123456+08:00';
const studentToken='synthetic-dorm-student-token-'.repeat(3),managerToken='synthetic-dorm-manager-token-'.repeat(3);
const ownScope='dormitory-conduct',adminScope='dormitory-conduct-admin';
const table='/rest/v1/affairs_dormitory_conduct',accessPath='/rest/v1/rpc/affairs_dormitory_conduct_access',writePath='/rest/v1/rpc/affairs_manage_dormitory_conduct';
const row={id,user_id:owner,source_mode:'local_demo',version:2,created_at:stamp,updated_at:stamp,deleted_at:null,result:'unknown'};
const payload=(kind:DormitoryConductKind)=>({id,user_id:owner,request_id:requestId,expected_version:2,...(kind==='save_dormitory_conduct'?{result:'unknown'}:{})});
const receipt=(kind:DormitoryConductKind)=>({id,kind,version:3,summary:'Maintained local dormitory metadata'});
type Result={status:number;body:unknown;headers:Record<string,string>};
type Call={url:URL;headers:Headers;body:Record<string,unknown>|undefined;method:string};
type Query=Record<string,string|string[]|undefined>;
async function invoke(handler:typeof dataHandler|typeof manageHandler,{method=handler===dataHandler?'GET':'POST',body,query,token=studentToken}:{method?:string;body?:unknown;query?:Query;token?:string|null}={}):Promise<Result>{
  const result:Result={status:200,body:null,headers:{}};
  const response={status(code:number){result.status=code;return response;},json(value:unknown){result.body=value;},setHeader(name:string,value:string){result.headers[name]=value;}};
  await handler({method,headers:token?{authorization:'Bearer '+token}:{},body,query},response);return result;
}
async function mocked(run:(call:Call)=>Response|Promise<Response>,body:(calls:Call[])=>Promise<void>,options:{google?:boolean;authStatus?:number;onAuth?:()=>void}={}){
  const original=globalThis.fetch,oldUrl=process.env.VITE_SUPABASE_URL,oldKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,calls:Call[]=[];
  process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  globalThis.fetch=async(input,init)=>{
    const call:Call={url:new URL(String(input)),headers:new Headers(init?.headers),body:init?.body?JSON.parse(String(init.body)):undefined,method:init?.method??'GET'};calls.push(call);
    assert.equal(call.url.origin,origin);assert.equal(call.headers.get('apikey'),key);assert.ok(init?.signal instanceof AbortSignal);
    const token=call.headers.get('authorization');assert.ok(token==='Bearer '+studentToken||token==='Bearer '+managerToken);
    if(call.url.pathname==='/auth/v1/user'){
      options.onAuth?.();return options.authStatus?Response.json({error:'PRIVATE_PROVIDER_AUTH'},{status:options.authStatus}):Response.json({id:token==='Bearer '+managerToken?manager:owner,identities:[{provider:options.google===false?'email':'google'}]});
    }
    assert.equal(init?.redirect,'error');return run(call);
  };
  try{await body(calls);}finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=oldKey;}
}
const access=(call:Call)=>Response.json({userId:call.headers.get('authorization')==='Bearer '+managerToken?manager:owner,canManage:call.headers.get('authorization')==='Bearer '+managerToken});
function failure(result:Result,status:number){
  assert.equal(result.status,status);assert.ok(result.body&&typeof result.body==='object');assert.deepEqual(Object.keys(result.body),['error']);
  assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE_PROVIDER|synthetic-dorm-|foreign-secret|downloadUrl|source_mode/);
  assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');assert.equal(result.headers['X-Content-Type-Options'],'nosniff');
}
const unexpected=()=>{throw new Error('An invalid handler request reached a record adapter.');};

test('Dorm handlers require the correct method and verified Google caller before private access',async()=>{
  await mocked(unexpected,async calls=>{
    const read=await invoke(dataHandler,{method:'POST',query:{scope:ownScope}}),write=await invoke(manageHandler,{method:'GET'});
    failure(read,405);assert.equal(read.headers.Allow,'GET');failure(write,405);assert.equal(write.headers.Allow,'POST');
    for(const token of [null,'short','x'.repeat(4097)]){
      failure(await invoke(dataHandler,{token,query:{scope:ownScope}}),401);
      failure(await invoke(manageHandler,{token,body:{kind:'save_dormitory_conduct',payload:payload('save_dormitory_conduct')}}),401);
    }assert.equal(calls.length,0);
  });
  for(const options of [{google:false},{authStatus:401}])await mocked(unexpected,async calls=>{
    failure(await invoke(dataHandler,{query:{scope:ownScope}}),401);
    failure(await invoke(manageHandler,{token:managerToken,body:{kind:'delete_dormitory_conduct',payload:payload('delete_dormitory_conduct')}}),401);
    assert.equal(calls.length,2);assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  },options);
});

test('personal Dorm reads use the caller even for administrators and expose only explicit minimal notice metadata',async()=>{
  for(const token of [studentToken,managerToken])for(const result of ['unknown','empty'])await mocked(call=>{
    assert.equal(call.url.pathname,table);assert.equal(call.method,'GET');assert.equal(call.url.searchParams.get('select'),dormitoryConductReadSource.select);
    assert.equal(call.url.searchParams.get('user_id'),'eq.'+(token===managerToken?manager:owner));assert.equal(call.url.searchParams.get('deleted_at'),'is.null');
    assert.equal(call.url.searchParams.get('limit'),'2');assert.equal(call.url.searchParams.get('order'),'id.asc');
    return Response.json([{...row,user_id:token===managerToken?manager:owner,result}]);
  },async calls=>{
    const response=await invoke(dataHandler,{token,query:{scope:ownScope}});assert.equal(response.status,200);assert.equal(calls.length,2);
    assert.deepEqual(response.body,{snapshot:{userId:token===managerToken?manager:owner,sourceMode:'local_demo',version:2,result}});
    assert.equal(response.headers['Cache-Control'],'no-store, max-age=0');assert.equal(response.headers['X-Content-Type-Options'],'nosniff');
    assert.doesNotMatch(JSON.stringify(response.body),/createdAt|updatedAt|"id"|records|rows|quantity|eligibility|download|document/);
  });
  await mocked(call=>{assert.equal(call.url.pathname,table);return Response.json([]);},async()=>{
    const result=await invoke(dataHandler,{query:{scope:ownScope}});assert.equal(result.status,200);assert.deepEqual(result.body,{snapshot:null});
  });
});

test('foreign, malformed, tombstoned and duplicate Dorm rows fail closed instead of becoming empty notices',async()=>{
  const missing={...row} as Record<string,unknown>;delete missing.result;
  for(const rows of [[{...row,user_id:other}],[row,{...row,id:requestId}],[{...row,deleted_at:stamp}],
    [{...row,result:'populated'}],[{...row,result:null}],[missing],[{...row,source_mode:'official'}],
    [{...row,version:0}],[{...row,updated_at:'2030-02-30T00:00:00Z'}],[{...row,documentUrl:'foreign-secret'}],{snapshot:null}]){
    await mocked(()=>Response.json(rows),async()=>failure(await invoke(dataHandler,{query:{scope:ownScope}}),503));
  }
});

test('admin Dorm reads require current caller-bound permission on every request and preserve editing fields',async()=>{
  let allowed=true;
  await mocked(call=>{
    if(call.url.pathname===accessPath){assert.deepEqual(call.body,{});return allowed?access(call):Response.json({userId:manager,canManage:false});}
    assert.equal(call.url.pathname,table);assert.equal(call.url.searchParams.get('user_id'),'eq.'+owner);return Response.json([row]);
  },async calls=>{
    failure(await invoke(dataHandler,{query:{scope:adminScope,user_id:owner}}),403);
    const result=await invoke(dataHandler,{token:managerToken,query:{scope:adminScope,user_id:owner}});assert.equal(result.status,200);
    assert.deepEqual(result.body,{record:{id,userId:owner,sourceMode:'local_demo',version:2,result:'unknown',createdAt:stamp,updatedAt:stamp}});
    allowed=false;failure(await invoke(dataHandler,{token:managerToken,query:{scope:adminScope,user_id:owner}}),403);
    assert.equal(calls.filter(call=>call.url.pathname===accessPath).length,3);assert.equal(calls.filter(call=>call.url.pathname===table).length,1);
  });
  for(const accessResult of [{userId:other,canManage:true},{userId:manager,canManage:'true'},{userId:manager,canManage:true,extra:null}])await mocked(call=>{
    assert.equal(call.url.pathname,accessPath);return Response.json(accessResult);
  },async()=>failure(await invoke(dataHandler,{token:managerToken,query:{scope:adminScope,user_id:owner}}),403));
  await mocked(call=>call.url.pathname===accessPath?access(call):Response.json([]),async()=>{
    const result=await invoke(dataHandler,{token:managerToken,query:{scope:adminScope,user_id:owner}});assert.equal(result.status,200);assert.deepEqual(result.body,{record:null});
  });
});

test('Dorm scopes reject repeated, unknown and account selectors without conversation or generic snapshot fallthrough',async()=>{
  const queries:Query[]=[{scope:[ownScope]},{scope:[ownScope,ownScope]},{scope:['other',ownScope],resource:'conversations'},
    {scope:[ownScope,'other'],resource:'conversations'},{scope:ownScope,resource:'conversations'},{scope:ownScope,resource:['conversations']},
    {scope:ownScope,user_id:owner},{scope:ownScope,user_id:undefined},{scope:ownScope,limit:'2'},{scope:ownScope,admin:'true'},
    {scope:adminScope},{scope:adminScope,user_id:[owner]},{scope:adminScope,user_id:[owner,other]},
    {scope:adminScope,user_id:'invalid'},{scope:adminScope,user_id:owner.toUpperCase().replace('10000000','ABCDEF00')},
    {scope:adminScope,user_id:owner,extra:'yes'},{scope:adminScope,user_id:owner,resource:'conversations'},
    {scope:'dormitory-conduct-file'},{scope:'dormitory-conduct-extra',resource:'conversations'},
    {scope:['other','dormitory-conduct-file'],resource:'conversations'}];
  await mocked(unexpected,async calls=>{
    for(const query of queries)failure(await invoke(dataHandler,{token:managerToken,query}),400);
    assert.equal(calls.length,queries.length);assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  });
});

test('save and delete use the dedicated RPC and replay exact caller request IDs after an uncertain response',async()=>{
  for(const kind of ['save_dormitory_conduct','delete_dormitory_conduct'] as const){const writes:unknown[]=[];let allowed=true;
    await mocked(call=>{
      if(call.url.pathname===accessPath)return allowed?access(call):Response.json({userId:manager,canManage:false});
      assert.equal(call.url.pathname,writePath);assert.equal(call.method,'POST');writes.push(call.body);
      assert.deepEqual(call.body,{p_kind:kind,p_payload:payload(kind)});
      if(writes.length===1)throw new Error('PRIVATE_PROVIDER uncertain outcome');return Response.json(receipt(kind));
    },async calls=>{
      const body={kind,payload:payload(kind)},original=structuredClone(body);
      failure(await invoke(manageHandler,{body}),403);failure(await invoke(manageHandler,{token:managerToken,body}),503);
      const retry=await invoke(manageHandler,{token:managerToken,body:JSON.stringify(body)});assert.equal(retry.status,200);assert.deepEqual(retry.body,receipt(kind));
      assert.deepEqual((await invoke(manageHandler,{token:managerToken,body})).body,retry.body);assert.deepEqual(body,original);
      allowed=false;failure(await invoke(manageHandler,{token:managerToken,body}),403);
      assert.equal(calls.filter(call=>call.url.pathname===accessPath).length,5);
    });assert.equal(writes.length,3);assert.deepEqual(writes[0],writes[1]);assert.deepEqual(writes[1],writes[2]);
  }
});

test('Dorm manager schema never accepts inferred population, document capabilities or malformed version envelopes',async()=>{
  await mocked(unexpected,async calls=>{
    const kind='save_dormitory_conduct',body={kind,payload:payload(kind)};
    const invalid:unknown[]=[null,[],{kind},'{not json', {...body,extra:true},{...body,payload:null},{...body,payload:[]},
      {kind:'save_dormitory_conduct_document',payload:body.payload},{kind:'constructor',payload:body.payload},
      ...[null,'',' ','EMPTY','populated',0,false,[],{}].map(result=>({...body,payload:{...body.payload,result}})),
      ...[{rows:[]},{eligible:true},{source_mode:'official'},{download_url:'foreign-secret'},{expected_version:null},{expected_version:'2'},
        {expected_version:-1},{expected_version:0.5},{expected_version:999999999},{id:'bad'},{user_id:null}].map(patch=>({...body,payload:{...body.payload,...patch}})),
      {kind:'delete_dormitory_conduct',payload:{...payload('delete_dormitory_conduct'),result:'empty'}},
      {kind:'delete_dormitory_conduct',payload:{...payload('delete_dormitory_conduct'),expected_version:0}}];
    for(const field of Object.keys(body.payload)){const missing={...body.payload} as Record<string,unknown>;delete missing[field];invalid.push({...body,payload:missing});}
    for(const request of invalid)failure(await invoke(manageHandler,{token:managerToken,body:request}),400);
    assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  });
});

test('Dorm fixed 1024-byte scalar payload budget and exact 2048-byte UTF8 envelope gate stay separate',async()=>{
  assert.equal(dormitoryConductMaxPayloadBytes,1024);
  assert.ok(dormitoryConductPayloadBytes({...payload('save_dormitory_conduct'),expected_version:999999998})<256,'The closed enum schema cannot legitimately fill its entire payload allowance.');
  const atBytes=(bytes:number)=>{const body={kind:'save_dormitory_conduct',payload:{...payload('save_dormitory_conduct'),result:'界'}};
    body.payload.result+='x'.repeat(bytes-Buffer.byteLength(JSON.stringify(body),'utf8'));assert.equal(Buffer.byteLength(JSON.stringify(body),'utf8'),bytes);return body;};
  await mocked(unexpected,async calls=>{
    // These payloads are intentionally schema-invalid. At the transport boundary,
    // exactly 2048 bytes reaches authenticated validation; 2049 must stop before Auth.
    failure(await invoke(manageHandler,{token:managerToken,body:atBytes(2048)}),400);assert.equal(calls.length,1);
    failure(await invoke(manageHandler,{token:managerToken,body:atBytes(2049)}),400);assert.equal(calls.length,1);
    failure(await invoke(manageHandler,{token:managerToken,body:JSON.stringify(atBytes(2049))}),400);assert.equal(calls.length,1);
  });
});

test('upstream conflict and authorization statuses remain sanitized and malformed receipts never succeed',async()=>{
  for(const status of [400,401,403,409,413,422,500,502])await mocked(call=>call.url.pathname===accessPath?access(call):Response.json({error:'PRIVATE_PROVIDER',foreign:'foreign-secret'},{status}),async()=>{
    const expected=[413,422].includes(status)?400:status>=500?503:status;
    failure(await invoke(dataHandler,{query:{scope:ownScope}}),expected);
    failure(await invoke(manageHandler,{token:managerToken,body:{kind:'save_dormitory_conduct',payload:payload('save_dormitory_conduct')}}),expected);
  });
  for(const value of [null,{...receipt('save_dormitory_conduct'),id:other},{...receipt('save_dormitory_conduct'),kind:'delete_dormitory_conduct'},
    {...receipt('save_dormitory_conduct'),version:4},{...receipt('save_dormitory_conduct'),summary:null},
    {...receipt('save_dormitory_conduct'),summary:'x'.repeat(201)},{...receipt('save_dormitory_conduct'),record:row}])await mocked(call=>call.url.pathname===accessPath?access(call):Response.json(value),async()=>{
    failure(await invoke(manageHandler,{token:managerToken,body:{kind:'save_dormitory_conduct',payload:payload('save_dormitory_conduct')}}),503);
  });
});

test('the handler deadline includes Auth and live admin access rather than resetting for reads or writes',async()=>{
  const originalNow=Date.now;let now=1000;Date.now=()=>now;
  try{
    for(const write of [false,true]){now=1000;await mocked(unexpected,async calls=>{
      const result=write?await invoke(manageHandler,{token:managerToken,body:{kind:'save_dormitory_conduct',payload:payload('save_dormitory_conduct')}})
        :await invoke(dataHandler,{query:{scope:ownScope}});
      failure(result,503);assert.equal(calls.length,1);
    },{onAuth:()=>{now=18001;}});}
    for(const write of [false,true]){now=1000;await mocked(call=>{
      assert.equal(call.url.pathname,accessPath);now=18001;return access(call);
    },async calls=>{
      const result=write?await invoke(manageHandler,{token:managerToken,body:{kind:'delete_dormitory_conduct',payload:payload('delete_dormitory_conduct')}})
        :await invoke(dataHandler,{token:managerToken,query:{scope:adminScope,user_id:owner}});
      failure(result,503);assert.equal(calls.length,2);
    },{onAuth:()=>{now=9000;}});}
  }finally{Date.now=originalNow;}
});

import assert from 'node:assert/strict';
import test from 'node:test';
import dataHandler from '../../api/affairs-data.ts';
import manageHandler from '../../api/affairs-manage.ts';
import {tuitionDocumentKinds,type TuitionDocumentKind} from '../../server/tuitionDocuments.js';

// Actual handlers and helpers; only outbound Auth/PostgREST HTTP is mocked.
const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-public-key';
const owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',requestId='30000000-0000-4000-8000-000000000001',date='2026-01-01T00:00:00Z';
const studentToken='synthetic-student-token-'.repeat(3),managerToken='synthetic-manager-token-'.repeat(3);
const row={id,user_id:owner,source_mode:'local_demo',version:2,created_at:date,updated_at:date,deleted_at:null,period_label:'Literal period',statement_text:null,row_order:0};
const doc={id,user_id:owner,source_mode:'local_demo',version:1,created_at:date,updated_at:date,deleted_at:null,kind:'summer',period_label:'',note_text:null,status:'metadata_only',issuer:'stu.best'};
const payload=(kind:TuitionDocumentKind)=>({id,user_id:owner,request_id:requestId,expected_version:2,...(kind==='save_tuition_settlement'?{period_label:'Literal period',statement_text:null,row_order:0}:kind==='save_tuition_document_metadata'?{kind:'summer',period_label:'',note_text:null,status:'metadata_only',issuer:'stu.best'}:{})});
type Result={status:number;body:unknown;headers:Record<string,string>};
type Call={url:URL;headers:Headers;body:Record<string,unknown>|undefined;method:string|undefined;signal:AbortSignal|null|undefined};
async function invoke(handler:typeof dataHandler|typeof manageHandler,{method=handler===dataHandler?'GET':'POST',body,query,token=studentToken}:{method?:string;body?:unknown;query?:Record<string,string|string[]|undefined>;token?:string|null}={}):Promise<Result>{
  const result:Result={status:200,body:null,headers:{}};const response={status(code:number){result.status=code;return response;},json(value:unknown){result.body=value;},setHeader(name:string,value:string){result.headers[name]=value;}};
  await handler({method,headers:token?{authorization:'Bearer '+token}:{},body,query},response);return result;
}
async function mocked(run:(call:Call)=>Response|Promise<Response>,body:(calls:Call[])=>Promise<void>,google=true){
  const original=globalThis.fetch,oldUrl=process.env.VITE_SUPABASE_URL,oldKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,calls:Call[]=[];
  process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  globalThis.fetch=async(input,init)=>{
    const call:Call={url:new URL(String(input)),headers:new Headers(init?.headers),body:init?.body?JSON.parse(String(init.body)):undefined,method:init?.method,signal:init?.signal};calls.push(call);
    assert.equal(call.url.origin,origin);assert.equal(call.headers.get('apikey'),key);assert.ok(call.signal instanceof AbortSignal);
    const token=call.headers.get('authorization');assert.ok(token==='Bearer '+studentToken||token==='Bearer '+managerToken);
    if(call.url.pathname==='/auth/v1/user')return Response.json({id:token==='Bearer '+managerToken?manager:owner,identities:[{provider:google?'google':'email'}]});
    return run(call);
  };
  try{await body(calls);}finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=oldKey;}
}
const access=(call:Call)=>Response.json({userId:call.headers.get('authorization')==='Bearer '+managerToken?manager:owner,canManage:call.headers.get('authorization')==='Bearer '+managerToken});
function failure(result:Result,status:number){assert.equal(result.status,status);assert.ok(result.body&&typeof result.body==='object'&&'error' in result.body);assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE_PROVIDER/);assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');assert.equal(result.headers['X-Content-Type-Options'],'nosniff');}

test('tuition handlers require methods and verified Google authentication before reads or writes',async()=>{
  await mocked(()=>{throw new Error('No database calls');},async calls=>{
    failure(await invoke(dataHandler,{method:'POST'}),405);failure(await invoke(manageHandler,{method:'GET'}),405);
    for(const token of [null,'short']){
      failure(await invoke(dataHandler,{token,query:{scope:'tuition-documents'}}),401);
      failure(await invoke(dataHandler,{token,query:{scope:'tuition-documents-admin',user_id:owner}}),401);
      failure(await invoke(manageHandler,{token,body:{kind:'save_tuition_settlement',payload:payload('save_tuition_settlement')}}),401);
    }assert.equal(calls.length,0);
  });
  await mocked(()=>{throw new Error('Non-Google database call');},async calls=>{
    failure(await invoke(dataHandler,{query:{scope:'tuition-documents'}}),401);assert.equal(calls.length,1);
  },false);
});

test('personal tuition reads use the caller JWT and exact own predicate, never initialize a snapshot or expose metadata',async()=>{
  await mocked(call=>{
    assert.equal(call.url.pathname,'/rest/v1/affairs_tuition_settlements');assert.equal(call.method,'GET');assert.equal(call.url.searchParams.get('user_id'),'eq.'+owner);assert.equal(call.url.searchParams.get('deleted_at'),'is.null');assert.equal(call.url.searchParams.get('order'),'id.asc');assert.equal(call.url.searchParams.get('limit'),'200');return Response.json([row]);
  },async calls=>{
    const result=await invoke(dataHandler,{query:{scope:'tuition-documents'}});assert.equal(result.status,200);
    assert.deepEqual(result.body,{periods:[{id,userId:owner,label:'Literal period'}],settlements:[{id,userId:owner,sourceMode:'local_demo',version:2,createdAt:date,updatedAt:date,periodId:id,periodLabel:'Literal period',text:null,rowOrder:0}],documents:[]});
    assert.equal(calls.length,2);assert.ok(calls.every(call=>call.headers.get('authorization')==='Bearer '+studentToken));
  });
  await mocked(()=>Response.json([{...row,user_id:other}]),async()=>failure(await invoke(dataHandler,{query:{scope:'tuition-documents'}}),503));
});

test('admin tuition reads authorize the manager and retain the selected account on both complete sources',async()=>{
  await mocked(call=>{
    if(call.url.pathname.endsWith('/affairs_tuition_access'))return access(call);
    assert.equal(call.headers.get('authorization'),'Bearer '+managerToken);assert.equal(call.url.searchParams.get('user_id'),'eq.'+owner);
    if(call.url.pathname.endsWith('/affairs_tuition_settlements'))return Response.json([row]);
    assert.ok(call.url.pathname.endsWith('/affairs_tuition_document_metadata'));return Response.json([doc]);
  },async calls=>{
    failure(await invoke(dataHandler,{query:{scope:'tuition-documents-admin',user_id:owner}}),403);
    const result=await invoke(dataHandler,{token:managerToken,query:{scope:'tuition-documents-admin',user_id:owner}});assert.equal(result.status,200);
    const records=result.body as {documents:unknown[];documentMetadata:Record<string,unknown>[]};assert.deepEqual(records.documents,[]);assert.equal(records.documentMetadata[0].status,'metadata_only');assert.equal(records.documentMetadata[0].periodLabel,'');assert.equal(records.documentMetadata[0].noteText,null);
    assert.equal(calls.filter(call=>call.url.pathname.endsWith('/affairs_tuition_settlements')).length,1);
  });
});

test('unknown, repeated and extra tuition selectors cannot fall through to broader workspace data',async()=>{
  await mocked(()=>{throw new Error('Invalid query reached database');},async calls=>{
    for(const query of [{scope:['tuition-documents','tuition-documents-admin']},{scope:'tuition-documents',user_id:owner},{scope:'tuition-documents',download:'true'},
      {scope:'tuition-documents-admin'},{scope:'tuition-documents-admin',user_id:[owner,other]},{scope:'tuition-documents-admin',user_id:'bad'},
      {scope:'tuition-documents-admin',user_id:owner,limit:'10'},{scope:'tuition-download'},{scope:'tuition-unknown'}])failure(await invoke(dataHandler,{query}),400);
    assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  });
});

test('all four tuition mutations preserve exact kind/version/request payload and require admin before SQL dispatch',async()=>{
  await mocked(call=>{
    if(call.url.pathname.endsWith('/affairs_tuition_access'))return access(call);
    assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_manage_tuition_documents');assert.equal(call.headers.get('authorization'),'Bearer '+managerToken);
    const body=call.body as {p_kind:TuitionDocumentKind;p_payload:Record<string,unknown>};assert.deepEqual(body.p_payload,payload(body.p_kind));
    return Response.json({id,kind:body.p_kind,version:3,summary:'Saved local record'});
  },async calls=>{
    for(const kind of tuitionDocumentKinds){failure(await invoke(manageHandler,{body:{kind,payload:payload(kind)}}),403);
      const result=await invoke(manageHandler,{token:managerToken,body:{kind,payload:payload(kind)}});assert.equal(result.status,200);assert.deepEqual(result.body,{id,kind,version:3,summary:'Saved local record'});
    }
    assert.equal(calls.filter(call=>call.url.pathname.endsWith('/affairs_manage_tuition_documents')).length,4);
  });
});

test('tuition API allows valid escaped payload plus envelope while rejecting extra keys and oversized input',async()=>{
  const kind='save_tuition_settlement',large={...payload(kind),statement_text:'\u0001'.repeat(4000),period_label:'L'.repeat(160)};
  assert.ok(Buffer.byteLength(JSON.stringify({kind,payload:large}))>24000);
  await mocked(call=>{
    if(call.url.pathname.endsWith('/affairs_tuition_access'))return access(call);
    assert.deepEqual(call.body,{p_kind:kind,p_payload:large});return Response.json({id,kind,version:3,summary:'Saved'});
  },async()=>{assert.equal((await invoke(manageHandler,{token:managerToken,body:JSON.stringify({kind,payload:large})})).status,200);});
  await mocked(()=>{throw new Error('Malformed payload reached database');},async calls=>{
    for(const body of [{kind,payload:large,caller:manager},{kind,payload:{...large,statement_text:'x'.repeat(30000)}},{kind,payload:[]},'{'])failure(await invoke(manageHandler,{body}),400);
    assert.equal(calls.length,0);
    for(const patch of [{user_id:undefined},{request_id:'bad'},{expected_version:'2'},{period_label:null},{statement_text:'\0'},{row_order:-1},{url:'https://private.invalid'}])failure(await invoke(manageHandler,{body:{kind,payload:{...payload(kind),...patch}}}),400);
    failure(await invoke(manageHandler,{body:{kind:'save_tuition_document_metadata',payload:{...payload('save_tuition_document_metadata'),status:'available'}}}),400);
    assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  });
});

test('provider denial/conflict/outage and malformed tuition receipts preserve safe statuses without capabilities',async()=>{
  for(const status of [400,401,403,409,500])await mocked(call=>call.url.pathname.endsWith('/affairs_tuition_access')?access(call):Response.json({error:'PRIVATE_PROVIDER'}, {status}),async()=>{
    failure(await invoke(dataHandler,{query:{scope:'tuition-documents'}}),status===500?503:status);
    failure(await invoke(manageHandler,{token:managerToken,body:{kind:'save_tuition_settlement',payload:payload('save_tuition_settlement')}}),status===500?503:status);
  });
  await mocked(call=>call.url.pathname.endsWith('/affairs_tuition_access')?access(call):Response.json({id,kind:'save_tuition_settlement',version:9,summary:'Wrong revision'}),async()=>failure(await invoke(manageHandler,{token:managerToken,body:{kind:'save_tuition_settlement',payload:payload('save_tuition_settlement')}}),503));
});

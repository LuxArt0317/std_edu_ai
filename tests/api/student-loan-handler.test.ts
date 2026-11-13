import assert from 'node:assert/strict';
import test from 'node:test';
import dataHandler from '../../api/affairs-data.ts';
import manageHandler from '../../api/affairs-manage.ts';
import {studentLoanTextLimits,type StudentLoanKind} from '../../server/studentLoan.js';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-public-key';
const owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',requestId='30000000-0000-4000-8000-000000000001',date='2030-01-01T00:00:00.123456+08:00';
const studentToken='synthetic-student-token-'.repeat(3),managerToken='synthetic-manager-token-'.repeat(3);
const fields={current_term_label:' literal term ',current_application_state:'unknown',current_application_text:null,progress_text:'',history_count:0,history_text:' Original local history '};
const row={id,user_id:owner,source_mode:'local_demo',version:2,created_at:date,updated_at:date,deleted_at:null,...fields};
const payload=(kind:StudentLoanKind)=>({id,user_id:owner,request_id:requestId,expected_version:2,...(kind==='save_student_loan'?fields:{})});
type Result={status:number;body:unknown;headers:Record<string,string>};
type Call={url:URL;headers:Headers;body:Record<string,unknown>|undefined;method:string|undefined};
async function invoke(handler:typeof dataHandler|typeof manageHandler,{method=handler===dataHandler?'GET':'POST',body,query,token=studentToken}:{method?:string;body?:unknown;query?:Record<string,string|string[]|undefined>;token?:string|null}={}):Promise<Result>{
  const result:Result={status:200,body:null,headers:{}};
  const response={status(code:number){result.status=code;return response;},json(value:unknown){result.body=value;},setHeader(name:string,value:string){result.headers[name]=value;}};
  await handler({method,headers:token?{authorization:'Bearer '+token}:{},body,query},response);return result;
}
async function mocked(run:(call:Call)=>Response|Promise<Response>,body:(calls:Call[])=>Promise<void>,options:{google?:boolean;onAuth?:()=>void}={}){
  const original=globalThis.fetch,oldUrl=process.env.VITE_SUPABASE_URL,oldKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,calls:Call[]=[];
  process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  globalThis.fetch=async(input,init)=>{
    const call:Call={url:new URL(String(input)),headers:new Headers(init?.headers),body:init?.body?JSON.parse(String(init.body)):undefined,method:init?.method};calls.push(call);
    assert.equal(call.url.origin,origin);assert.equal(call.headers.get('apikey'),key);assert.ok(init?.signal instanceof AbortSignal);
    const token=call.headers.get('authorization');assert.ok(token==='Bearer '+studentToken||token==='Bearer '+managerToken);
    if(call.url.pathname==='/auth/v1/user'){options.onAuth?.();return Response.json({id:token==='Bearer '+managerToken?manager:owner,identities:[{provider:options.google===false?'email':'google'}]});}
    assert.equal(init?.redirect,'error');return run(call);
  };
  try{await body(calls);}finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=oldKey;}
}
const access=(call:Call)=>Response.json({userId:call.headers.get('authorization')==='Bearer '+managerToken?manager:owner,canManage:call.headers.get('authorization')==='Bearer '+managerToken});
function failure(result:Result,status:number){assert.equal(result.status,status);assert.ok(result.body&&typeof result.body==='object'&&'error' in result.body);
  assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE_PROVIDER/);assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');assert.equal(result.headers['X-Content-Type-Options'],'nosniff');}

test('loan handlers require Google auth and correct methods before accessing private records',async()=>{
  await mocked(()=>{throw new Error('Unexpected data call');},async calls=>{
    failure(await invoke(dataHandler,{method:'POST'}),405);failure(await invoke(manageHandler,{method:'GET'}),405);
    for(const token of [null,'short']){
      failure(await invoke(dataHandler,{token,query:{scope:'student-loan'}}),401);
      failure(await invoke(manageHandler,{token,body:{kind:'save_student_loan',payload:payload('save_student_loan')}}),401);
    }assert.equal(calls.length,0);
  });
  await mocked(()=>{throw new Error('Non-Google data call');},async()=>failure(await invoke(dataHandler,{query:{scope:'student-loan'}}),401),{google:false});
});

test('personal loan reads are caller-scoped, preserve null blank zero, and absence remains unknown',async()=>{
  for(const token of [studentToken,managerToken])await mocked(call=>{
    assert.equal(call.url.pathname,'/rest/v1/affairs_student_loan');assert.equal(call.method,'GET');
    assert.equal(call.url.searchParams.get('user_id'),'eq.'+(token===managerToken?manager:owner));assert.equal(call.url.searchParams.get('deleted_at'),'is.null');
    return Response.json([{...row,user_id:token===managerToken?manager:owner}]);
  },async calls=>{
    const result=await invoke(dataHandler,{token,query:{scope:'student-loan'}});assert.equal(result.status,200);assert.equal(calls.length,2);
    const data=result.body as {status:string;record:Record<string,unknown>};assert.equal(data.status,'loaded');
    assert.equal(data.record.currentTermLabel,' literal term ');assert.equal(data.record.currentApplicationText,null);assert.equal(data.record.progressText,'');assert.equal(data.record.historyCount,0);
    assert.doesNotMatch(JSON.stringify(data),/downloadUrl|amountDue|approvalDate/);
  });
  await mocked(()=>Response.json([]),async()=>assert.deepEqual((await invoke(dataHandler,{query:{scope:'student-loan'}})).body,{status:'loaded',record:null}));
  for(const rows of [[{...row,user_id:other}],[row,{...row,id:requestId}],[{...row,downloadUrl:'PRIVATE_PROVIDER'}]])await mocked(()=>Response.json(rows),async()=>failure(await invoke(dataHandler,{query:{scope:'student-loan'}}),503));
});

test('admin loan reads require live authorization and never accept ambiguous selectors or conversation fallthrough',async()=>{
  await mocked(call=>{
    if(call.url.pathname.endsWith('/affairs_student_loan_access'))return access(call);
    assert.equal(call.url.searchParams.get('user_id'),'eq.'+owner);return Response.json([row]);
  },async calls=>{
    failure(await invoke(dataHandler,{query:{scope:'student-loan-admin',user_id:owner}}),403);
    assert.equal((await invoke(dataHandler,{token:managerToken,query:{scope:'student-loan-admin',user_id:owner}})).status,200);
    assert.equal(calls.filter(call=>call.url.pathname==='/rest/v1/affairs_student_loan').length,1);
  });
  await mocked(()=>{throw new Error('Invalid selector reached records');},async()=>{
    for(const query of [{scope:['student-loan']},{scope:['other','student-loan'],resource:'conversations'},{scope:'student-loan',resource:'conversations'},
      {scope:'student-loan',user_id:owner},{scope:'student-loan',limit:'2'},{scope:'student-loan-admin'},{scope:'student-loan-admin',user_id:[owner]},
      {scope:'student-loan-admin',user_id:'invalid'},{scope:'student-loan-admin',user_id:owner,extra:'yes'},{scope:'student-loan-file'},
      {scope:'student-loan-extra',resource:'conversations'}])failure(await invoke(dataHandler,{query}),400);
  });
});

test('loan writes route both strict operations to the dedicated RPC and preserve retry payloads',async()=>{
  for(const kind of ['save_student_loan','delete_student_loan'] as const){const writes:unknown[]=[];
    await mocked(call=>{
      if(call.url.pathname.endsWith('/affairs_student_loan_access'))return access(call);
      assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_manage_student_loan');writes.push(call.body);
      if(writes.length===1)throw new Error('PRIVATE_PROVIDER uncertain response');return Response.json({id,kind,version:3,summary:'Saved local snapshot'});
    },async()=>{
      const body={kind,payload:payload(kind)};failure(await invoke(manageHandler,{body}),403);
      failure(await invoke(manageHandler,{token:managerToken,body}),503);
      const retry=await invoke(manageHandler,{token:managerToken,body});assert.equal(retry.status,200);
      assert.deepEqual((await invoke(manageHandler,{token:managerToken,body})).body,retry.body);
    });assert.equal(writes.length,3);assert.deepEqual(writes[0],writes[1]);assert.deepEqual(writes[1],writes[2]);
  }
});

test('loan handlers reject extra fields, invented actions and excessive payloads before RPC writes',async()=>{
  await mocked(()=>{throw new Error('Rejected data reached RPC');},async()=>{
    const body={kind:'save_student_loan',payload:payload('save_student_loan')};
    for(const invalid of [{...body,unknown:true},{...body,payload:{...body.payload,fileUrl:'PRIVATE_PROVIDER'}},
      {...body,payload:{...body.payload,current_application_state:'approved'}},{...body,payload:{...body.payload,history_count:'0'}},
      {...body,payload:{...body.payload,...Object.fromEntries(Object.entries(studentLoanTextLimits).map(([field,limit])=>[field,'\u0001'.repeat(limit)]))}}])failure(await invoke(manageHandler,{token:managerToken,body:invalid}),400);
  });
});

test('loan safe errors preserve statuses and total request deadlines include Auth time',async()=>{
  for(const status of [400,401,403,409,500])await mocked(call=>call.url.pathname.endsWith('/affairs_student_loan_access')?access(call):Response.json({error:'PRIVATE_PROVIDER'},{status}),async()=>{
    failure(await invoke(dataHandler,{query:{scope:'student-loan'}}),status===500?503:status);
    failure(await invoke(manageHandler,{token:managerToken,body:{kind:'save_student_loan',payload:payload('save_student_loan')}}),status===500?503:status);
  });
  const originalNow=Date.now;let now=1000;Date.now=()=>now;
  try{await mocked(()=>{throw new Error('Expired Auth reached records');},async calls=>{
    failure(await invoke(dataHandler,{query:{scope:'student-loan'}}),503);assert.equal(calls.length,1);
  },{onAuth:()=>{now=19000;}});}finally{Date.now=originalNow;}
});

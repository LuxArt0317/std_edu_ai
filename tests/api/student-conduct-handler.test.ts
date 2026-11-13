import assert from 'node:assert/strict';
import test from 'node:test';
import dataHandler from '../../api/affairs-data.ts';
import manageHandler from '../../api/affairs-manage.ts';
import {studentConductKinds,studentConductPayloadBytes,studentConductTextLimits,type StudentConductKind} from '../../server/studentConduct.js';

// Exercise actual handlers/helpers; all outbound Auth/PostgREST HTTP is mocked.
const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-public-key';
const owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',requestId='30000000-0000-4000-8000-000000000001',date='2030-01-01T00:00:00.123456+08:00';
const studentToken='synthetic-student-token-'.repeat(3),managerToken='synthetic-manager-token-'.repeat(3);
const fields={occurred_on_text:' literal date ',student_number:null,student_name:'',academic_year_text:'001',semester_text:'local term',year_level_text:null,
  reason_text:'Synthetic reason',conduct_code:'LOCAL-QA',conduct_name:'Literal category',quantity_text:'0',void_status_text:null,row_order:0};
const row={id,user_id:owner,source_mode:'local_demo',version:2,created_at:date,updated_at:date,deleted_at:null,...fields};
const payload=(kind:StudentConductKind)=>({id,user_id:owner,request_id:requestId,expected_version:2,...(kind==='save_student_conduct'?fields:{})});
type Result={status:number;body:unknown;headers:Record<string,string>};
type Call={url:URL;headers:Headers;body:Record<string,unknown>|undefined;method:string|undefined;signal:AbortSignal|null|undefined;redirect:RequestRedirect|undefined};
async function invoke(handler:typeof dataHandler|typeof manageHandler,{method=handler===dataHandler?'GET':'POST',body,query,token=studentToken}:{method?:string;body?:unknown;query?:Record<string,string|string[]|undefined>;token?:string|null}={}):Promise<Result>{
  const result:Result={status:200,body:null,headers:{}};
  const response={status(code:number){result.status=code;return response;},json(value:unknown){result.body=value;},setHeader(name:string,value:string){result.headers[name]=value;}};
  await handler({method,headers:token?{authorization:'Bearer '+token}:{},body,query},response);return result;
}
async function mocked(run:(call:Call)=>Response|Promise<Response>,body:(calls:Call[])=>Promise<void>,options:{google?:boolean;onAuth?:()=>void}={}){
  const original=globalThis.fetch,oldUrl=process.env.VITE_SUPABASE_URL,oldKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,calls:Call[]=[];
  process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  globalThis.fetch=async(input,init)=>{
    const call:Call={url:new URL(String(input)),headers:new Headers(init?.headers),body:init?.body?JSON.parse(String(init.body)):undefined,method:init?.method,signal:init?.signal,redirect:init?.redirect};calls.push(call);
    assert.equal(call.url.origin,origin);assert.equal(call.headers.get('apikey'),key);assert.ok(call.signal instanceof AbortSignal);
    const token=call.headers.get('authorization');assert.ok(token==='Bearer '+studentToken||token==='Bearer '+managerToken);
    if(call.url.pathname==='/auth/v1/user'){options.onAuth?.();return Response.json({id:token==='Bearer '+managerToken?manager:owner,identities:[{provider:options.google===false?'email':'google'}]});}
    assert.equal(call.redirect,'error');return run(call);
  };
  try{await body(calls);}finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=oldKey;}
}
const access=(call:Call)=>Response.json({userId:call.headers.get('authorization')==='Bearer '+managerToken?manager:owner,canManage:call.headers.get('authorization')==='Bearer '+managerToken});
function failure(result:Result,status:number){assert.equal(result.status,status);assert.ok(result.body&&typeof result.body==='object'&&'error' in result.body);
  assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE_PROVIDER/);assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');assert.equal(result.headers['X-Content-Type-Options'],'nosniff');}

test('conduct endpoints enforce methods and verified Google sign-in before data access',async()=>{
  await mocked(()=>{throw new Error('No database calls expected');},async calls=>{
    failure(await invoke(dataHandler,{method:'POST'}),405);failure(await invoke(manageHandler,{method:'GET'}),405);
    for(const token of [null,'short']){
      failure(await invoke(dataHandler,{token,query:{scope:'student-conduct'}}),401);
      failure(await invoke(dataHandler,{token,query:{scope:'student-conduct-admin',user_id:owner}}),401);
      failure(await invoke(manageHandler,{token,body:{kind:'save_student_conduct',payload:payload('save_student_conduct')}}),401);
    }assert.equal(calls.length,0);
  });
  await mocked(()=>{throw new Error('Non-Google database access');},async calls=>{
    failure(await invoke(dataHandler,{query:{scope:'student-conduct'}}),401);
    failure(await invoke(manageHandler,{body:{kind:'save_student_conduct',payload:payload('save_student_conduct')}}),401);assert.equal(calls.length,2);
  },{google:false});
});

test('personal conduct scope is strictly caller owned even for administrators, with literal fields and no snapshot initialization',async()=>{
  for(const token of [studentToken,managerToken])await mocked(call=>{
    assert.equal(call.url.pathname,'/rest/v1/affairs_student_conduct');assert.equal(call.method,'GET');assert.equal(call.url.searchParams.get('user_id'),'eq.'+(token===managerToken?manager:owner));
    assert.equal(call.url.searchParams.get('deleted_at'),'is.null');return Response.json([{...row,user_id:token===managerToken?manager:owner}]);
  },async calls=>{
    const result=await invoke(dataHandler,{token,query:{scope:'student-conduct'}});assert.equal(result.status,200);assert.equal(calls.length,2);
    const data=result.body as {records:Record<string,unknown>[]};assert.deepEqual(Object.keys(data),['records']);assert.equal(data.records.length,1);
    assert.equal(data.records[0].occurredOnText,' literal date ');assert.equal(data.records[0].studentNumber,null);assert.equal(data.records[0].studentName,'');
    assert.equal(data.records[0].quantityText,'0');assert.equal(data.records[0].voidStatusText,null);assert.equal(data.records[0].updatedAt,date);
    assert.equal(data.records[0].sourceMode,'local_demo');assert.doesNotMatch(JSON.stringify(data),/download|certificate|detailUrl/);
    assert.ok(calls.every(call=>call.headers.get('authorization')==='Bearer '+token));
  });
  await mocked(()=>Response.json([{...row,user_id:other}]),async()=>failure(await invoke(dataHandler,{query:{scope:'student-conduct'}}),503));
});

test('conduct admin scope requires live authorization and a single selected account',async()=>{
  await mocked(call=>{
    if(call.url.pathname.endsWith('/affairs_student_conduct_access'))return access(call);
    assert.equal(call.url.pathname,'/rest/v1/affairs_student_conduct');assert.equal(call.headers.get('authorization'),'Bearer '+managerToken);
    assert.equal(call.url.searchParams.get('user_id'),'eq.'+owner);return Response.json([row]);
  },async calls=>{
    failure(await invoke(dataHandler,{query:{scope:'student-conduct-admin',user_id:owner}}),403);
    const result=await invoke(dataHandler,{token:managerToken,query:{scope:'student-conduct-admin',user_id:owner}});assert.equal(result.status,200);
    assert.equal((result.body as {records:{userId:string}[]}).records[0].userId,owner);
    assert.equal(calls.filter(call=>call.url.pathname==='/rest/v1/affairs_student_conduct').length,1);
  });
});

test('unknown prefixes, repeated selectors and mixed conversation resources cannot fall through to broader private data',async()=>{
  await mocked(()=>{throw new Error('Invalid selector reached a database reader');},async calls=>{
    for(const query of [{scope:['student-conduct','student-conduct-admin']},{scope:['student-conduct']},{scope:'student-conduct',user_id:owner},
      {scope:'student-conduct',limit:'10'},{scope:'student-conduct',resource:'conversations'},{scope:'student-conduct-admin',user_id:owner,resource:'conversations'},
      {scope:['other','student-conduct'],resource:'conversations'},{scope:'student-conduct-admin'},{scope:'student-conduct-admin',user_id:[owner,other]},
      {scope:'student-conduct-admin',user_id:[owner]},{scope:'student-conduct-admin',user_id:'bad'},{scope:'student-conduct-admin',user_id:owner,include_deleted:'true'},
      {scope:'student-conduct-unknown'},{scope:'student-conduct-download'},{scope:'student-conduct-extra',resource:'conversations'}])failure(await invoke(dataHandler,{query}),400);
    assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  });
});

test('complete conduct pages retain exact predicates and never return malformed partial records',async()=>{
  const identifier=(index:number)=>'70000000-0000-4000-8000-'+String(index).padStart(12,'0');
  await mocked(call=>{
    assert.equal(call.url.pathname,'/rest/v1/affairs_student_conduct');assert.equal(call.url.searchParams.get('user_id'),'eq.'+owner);
    assert.equal(call.url.searchParams.get('order'),'id.asc');assert.equal(call.url.searchParams.get('limit'),'200');
    const cursor=call.url.searchParams.get('id');assert.ok(cursor===null||cursor==='gt.'+identifier(200));
    return Response.json(cursor?[{...row,id:identifier(201)}]:Array.from({length:200},(_,i)=>({...row,id:identifier(i+1)})));
  },async calls=>{const result=await invoke(dataHandler,{query:{scope:'student-conduct'}});assert.equal(result.status,200);assert.equal((result.body as {records:unknown[]}).records.length,201);assert.equal(calls.length,3);});
  for(const data of [[row,row],[{...row,quantity_text:0}],[{...row,deleted_at:date}],[{...row,download_url:'PRIVATE_PROVIDER'}]])
    await mocked(()=>Response.json(data),async()=>failure(await invoke(dataHandler,{query:{scope:'student-conduct'}}),503));
});

test('both conduct manager operations retain exact payload, owner, version and request ID behind live admin checks',async()=>{
  await mocked(call=>{
    if(call.url.pathname.endsWith('/affairs_student_conduct_access'))return access(call);
    assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_manage_student_conduct');assert.equal(call.headers.get('authorization'),'Bearer '+managerToken);
    const body=call.body as {p_kind:StudentConductKind;p_payload:Record<string,unknown>};assert.deepEqual(body.p_payload,payload(body.p_kind));
    return Response.json({id,kind:body.p_kind,version:3,summary:'Saved local record'});
  },async calls=>{
    for(const kind of studentConductKinds){failure(await invoke(manageHandler,{body:{kind,payload:payload(kind)}}),403);
      const result=await invoke(manageHandler,{token:managerToken,body:{kind,payload:payload(kind)}});assert.equal(result.status,200);assert.deepEqual(result.body,{id,kind,version:3,summary:'Saved local record'});}
    assert.equal(calls.filter(call=>call.url.pathname.endsWith('/affairs_manage_student_conduct')).length,2);
  });
});

test('conduct manager accepts the16000-byte JSONB boundary but rejects extras, excessive bodies and unapproved capabilities',async()=>{
  const kind='save_student_conduct',large:Record<string,unknown>={...payload(kind)};
  for(const [field,limit] of Object.entries(studentConductTextLimits))large[field]='\u0001'.repeat(limit);
  let text=String(large.reason_text),replaced=0;while(studentConductPayloadBytes(large)>16000){text='x'.repeat(++replaced)+'\u0001'.repeat(2000-replaced);large.reason_text=text;}
  const remaining=16000-studentConductPayloadBytes(large);large.reason_text=['','é','界','😀','é😀'][remaining]+text.slice(remaining===4?2:remaining?1:0);
  assert.equal(studentConductPayloadBytes(large),16000);assert.ok(Buffer.byteLength(JSON.stringify({kind,payload:large}))>12000);
  await mocked(call=>{
    if(call.url.pathname.endsWith('/affairs_student_conduct_access'))return access(call);
    assert.deepEqual(call.body,{p_kind:kind,p_payload:large});return Response.json({id,kind,version:3,summary:'Saved'});
  },async()=>assert.equal((await invoke(manageHandler,{token:managerToken,body:JSON.stringify({kind,payload:large})})).status,200));
  await mocked(()=>{throw new Error('Invalid conduct input reached RPC');},async calls=>{
    for(const body of [{kind,payload:large,caller:manager},{kind,payload:{...large,reason_text:'x'.repeat(18000)}},{kind,payload:[]},'{',Object.assign(Object.create({kind}),{payload:payload(kind)})])failure(await invoke(manageHandler,{body}),400);
    assert.equal(calls.length,0);
    for(const patch of [{user_id:undefined},{request_id:'bad'},{expected_version:'2'},{reason_text:'\0'},{row_order:-1},{quantity_text:0},{certificate_status:'issued'},{download_url:'https://private.invalid'}])failure(await invoke(manageHandler,{body:{kind,payload:{...payload(kind),...patch}}}),400);
    failure(await invoke(manageHandler,{body:{kind,payload:{...large,reason_text:String(large.reason_text).replace('x','é')}}}),400);
    failure(await invoke(manageHandler,{body:{kind:'save_student_conduct_certificate',payload:payload(kind)}}),400);
    assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  });
});

test('lost responses allow exact caller-driven save/delete retry without inventing success or replacing the request ID',async()=>{
  for(const kind of studentConductKinds){
    const writes:unknown[]=[];await mocked(call=>{
      if(call.url.pathname.endsWith('/affairs_student_conduct_access'))return access(call);
      assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_manage_student_conduct');writes.push(call.body);
      if(writes.length===1)throw new Error('PRIVATE_PROVIDER lost response');return Response.json({id,kind,version:3,summary:'Durable receipt'});
    },async()=>{
      const body={kind,payload:payload(kind)};failure(await invoke(manageHandler,{token:managerToken,body}),503);
      const retry=await invoke(manageHandler,{token:managerToken,body}),replay=await invoke(manageHandler,{token:managerToken,body});assert.equal(retry.status,200);assert.deepEqual(retry.body,replay.body);
    });assert.equal(writes.length,3);assert.deepEqual(writes[0],writes[1]);assert.deepEqual(writes[1],writes[2]);
  }
});

test('conduct provider errors and malformed receipts keep safe HTTP statuses without exposing upstream details',async()=>{
  for(const status of [400,401,403,409,500])await mocked(call=>call.url.pathname.endsWith('/affairs_student_conduct_access')?access(call):Response.json({error:'PRIVATE_PROVIDER'}, {status}),async()=>{
    failure(await invoke(dataHandler,{query:{scope:'student-conduct'}}),status===500?503:status);
    failure(await invoke(manageHandler,{token:managerToken,body:{kind:'save_student_conduct',payload:payload('save_student_conduct')}}),status===500?503:status);
  });
  await mocked(call=>call.url.pathname.endsWith('/affairs_student_conduct_access')?access(call):Response.json({id,kind:'save_student_conduct',version:9,summary:'Wrong revision'}),async()=>failure(await invoke(manageHandler,{token:managerToken,body:{kind:'save_student_conduct',payload:payload('save_student_conduct')}}),503));
});

test('the handler deadline is retained after Auth and administrative access, preventing late record reads or writes',async()=>{
  const savedNow=Date.now;let now=1000;Date.now=()=>now;
  try{
    await mocked(()=>{throw new Error('Expired Auth budget reached records');},async calls=>{
      failure(await invoke(dataHandler,{query:{scope:'student-conduct'}}),503);assert.equal(calls.length,1);
    },{onAuth:()=>{now=19000;}});
    now=1000;await mocked(call=>{assert.ok(call.url.pathname.endsWith('/affairs_student_conduct_access'));now=19000;return access(call);},async calls=>{
      failure(await invoke(manageHandler,{token:managerToken,body:{kind:'save_student_conduct',payload:payload('save_student_conduct')}}),503);assert.equal(calls.length,2);
    });
  }finally{Date.now=savedNow;}
});

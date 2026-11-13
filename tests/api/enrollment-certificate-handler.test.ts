import assert from 'node:assert/strict';
import test from 'node:test';
import dataHandler from '../../api/affairs-data.ts';
import manageHandler from '../../api/affairs-manage.ts';

// Actual handler/helper dispatch; every outbound HTTP call is mocked. No
// credentials, database connection, file activation or document download.
const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-publishable-key';
const student='10000000-0000-4000-8000-000000000001',administrator='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',documentId='30000000-0000-4000-8000-000000000001',requestId='40000000-0000-4000-8000-000000000001';
const studentToken='synthetic-student-token-'.repeat(3),adminToken='synthetic-admin-token-'.repeat(3),stamp='2030-01-01T00:00:00.123456+08:00';
const assessmentKind='save_enrollment_certificate_assessment',documentKind='save_enrollment_certificate_document';
const assessmentTable='/rest/v1/affairs_enrollment_certificate_assessments',documentTable='/rest/v1/affairs_enrollment_certificate_documents';
const accessRpc='/rest/v1/rpc/affairs_enrollment_certificate_access',saveRpc='/rest/v1/rpc/affairs_manage_enrollment_certificate';
const payload={id,user_id:student,request_id:requestId,expected_version:0,academic_year:130,semester:1,has_pending_fees:'N',status:'blocked',
  result_text:'Synthetic local assessment',assessed_at:stamp,student_number:'LOCAL-CERT-QA',student_name:'Synthetic Student',department_name:null,year_text:'',class_label:null};
const document={id:documentId,user_id:student,request_id:requestId,expected_version:0,assessment_id:id,assessment_version:1,
  issuer:'stu.best',purpose:'local_enrollment_reference',status:'metadata_only',verified_at:null,expires_at:null};
function stored(value:Record<string,unknown>){const row={...value,source_mode:'local_demo',version:1,created_at:stamp,updated_at:stamp};
  const result:Record<string,unknown>={...row};delete result.request_id;delete result.expected_version;return result;}
const row=stored(payload),documentRow=stored(document);
const receipt=(kind:string,value:Record<string,unknown>)=>({id:value.id,kind,version:Number(value.expected_version)+1,summary:'Saved explicit local certificate record.'});
type Call={url:URL;method:string;headers:Headers;body:Record<string,unknown>|undefined;signal:AbortSignal|null|undefined;redirect:RequestRedirect|undefined};
type Result={status:number;body:unknown;headers:Record<string,string>};
type Handler=typeof dataHandler|typeof manageHandler;
const json=(value:unknown,status=200)=>Response.json(value,{status});
async function invoke(handler:Handler,{method=handler===dataHandler?'GET':'POST',query,body,token=studentToken}:{method?:string;query?:Record<string,string|string[]|undefined>;body?:unknown;token?:string|null}={}):Promise<Result>{
  const result:Result={status:200,body:null,headers:{}};
  const response={status(code:number){result.status=code;return response;},json(value:unknown){result.body=value;},setHeader(name:string,value:string){result.headers[name]=value;}};
  await handler({method,query,body,headers:token?{authorization:'Bearer '+token}:{}},response);return result;
}
async function mocked(run:(call:Call)=>Response|Promise<Response>,callback:(calls:Call[])=>Promise<void>,options:{google?:boolean;auth?:(call:Call)=>Response}={}){
  const savedFetch=globalThis.fetch,savedUrl=process.env.VITE_SUPABASE_URL,savedKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,calls:Call[]=[];
  process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  globalThis.fetch=async(input,init)=>{
    const call:Call={url:new URL(String(input)),method:init?.method??'GET',headers:new Headers(init?.headers),body:init?.body?JSON.parse(String(init.body)):undefined,signal:init?.signal,redirect:init?.redirect};
    calls.push(call);assert.equal(call.url.origin,origin);assert.equal(call.headers.get('apikey'),key);assert.ok(call.signal instanceof AbortSignal);
    assert.ok([studentToken,adminToken].some(token=>call.headers.get('authorization')==='Bearer '+token));
    if(call.url.pathname==='/auth/v1/user')return options.auth?.(call)??json({id:call.headers.get('authorization')==='Bearer '+adminToken?administrator:student,
      identities:[{provider:options.google===false?'email':'google'}]});
    assert.equal(call.redirect,'error');return run(call);
  };
  try{await callback(calls);}finally{
    globalThis.fetch=savedFetch;
    if(savedUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=savedUrl;
    if(savedKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=savedKey;
  }
}
function failure(result:Result,status:number){
  assert.equal(result.status,status);assert.ok(result.body&&typeof result.body==='object'&&'error'in result.body);
  assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE_PROVIDER|synthetic-student-token|synthetic-admin-token/);
  assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');assert.equal(result.headers['X-Content-Type-Options'],'nosniff');
}

test('certificate handlers enforce methods, bearer authentication and Google identity before private access',async()=>{
  await mocked(()=>{throw new Error('No request expected.');},async calls=>{
    failure(await invoke(dataHandler,{method:'POST'}),405);failure(await invoke(manageHandler,{method:'GET'}),405);
    for(const token of [null,'short']){
      failure(await invoke(dataHandler,{query:{scope:'enrollment-certificate'},token}),401);
      failure(await invoke(manageHandler,{body:{kind:assessmentKind,payload},token}),401);
    }assert.equal(calls.length,0);
  });
  await mocked(()=>{throw new Error('Non-Google sessions must not read records.');},async calls=>{
    failure(await invoke(dataHandler,{query:{scope:'enrollment-certificate'}}),401);
    failure(await invoke(manageHandler,{body:{kind:assessmentKind,payload}}),401);
    assert.equal(calls.length,2);
  },{google:false});
});

test('personal scope stays caller-only even for an administrator and returns the direct literal bundle without initialization',async()=>{
  await mocked(call=>{
    assert.equal(call.url.pathname,assessmentTable);assert.equal(call.method,'GET');
    const userId=call.headers.get('authorization')==='Bearer '+adminToken?administrator:student;
    assert.equal(call.url.searchParams.get('user_id'),'eq.'+userId);
    return json([{...row,user_id:userId,academic_year:null,semester:null,has_pending_fees:null,result_text:'',student_name:null}]);
  },async calls=>{
    for(const token of [studentToken,adminToken]){
      const result=await invoke(dataHandler,{query:{scope:'enrollment-certificate'},token});assert.equal(result.status,200);
      const bundle=result.body as {assessments:Array<Record<string,unknown>>;documents:unknown[]};
      assert.deepEqual(Object.keys(bundle).sort(),['assessments','documents']);assert.deepEqual(bundle.documents,[]);
      assert.equal(bundle.assessments.length,1);assert.equal(bundle.assessments[0].userId,token===adminToken?administrator:student);
      assert.equal(bundle.assessments[0].academicYear,null);assert.equal(bundle.assessments[0].semester,null);
      assert.equal(bundle.assessments[0].hasPendingFees,null);assert.equal(bundle.assessments[0].resultText,'');assert.equal(bundle.assessments[0].assessedAt,stamp);
      assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');assert.equal(result.headers['X-Content-Type-Options'],'nosniff');
    }
    assert.deepEqual(calls.map(call=>call.url.pathname),['/auth/v1/user',assessmentTable,'/auth/v1/user',assessmentTable]);
  });
});

test('administrator scope requires protected access and preserves explicit account filtering and metadata-only documents',async()=>{
  await mocked(call=>{
    assert.equal(call.headers.get('authorization'),'Bearer '+adminToken);
    if(call.url.pathname===accessRpc)return json({userId:administrator,canManage:true});
    assert.equal(call.url.searchParams.get('user_id'),'eq.'+other);
    assert.ok([assessmentTable,documentTable].includes(call.url.pathname));
    return json(call.url.pathname===assessmentTable?[{...row,user_id:other}]:[{...documentRow,user_id:other}]);
  },async calls=>{
    const result=await invoke(dataHandler,{query:{scope:'enrollment-certificate-admin',user_id:other},token:adminToken});assert.equal(result.status,200);
    const bundle=result.body as {assessments:Array<{userId:string}>;documents:unknown[];documentMetadata:Array<{userId:string;status:string;verifiedAt:null}>};
    assert.equal(bundle.assessments[0].userId,other);assert.deepEqual(bundle.documents,[]);
    assert.equal(bundle.documentMetadata[0].userId,other);assert.equal(bundle.documentMetadata[0].status,'metadata_only');assert.equal(bundle.documentMetadata[0].verifiedAt,null);
    assert.equal(calls.length,4);assert.doesNotMatch(JSON.stringify(bundle),/signedUrl|storagePath|downloadUrl/);
  });
  await mocked(call=>{
    assert.equal(call.url.pathname,accessRpc);return json({userId:student,canManage:false});
  },async calls=>{
    failure(await invoke(dataHandler,{query:{scope:'enrollment-certificate-admin'}}),403);
    failure(await invoke(dataHandler,{query:{scope:'enrollment-certificate-admin',user_id:other}}),403);
    failure(await invoke(manageHandler,{body:{kind:assessmentKind,payload}}),403);
    assert.equal(calls.length,6,'Denied callers reach only Auth and the protected permission RPC.');
  });
});

test('certificate scopes reject repeated or unexpected filters instead of broadening an account read',async()=>{
  const queries:Record<string,string|string[]>[]=[
    {scope:['enrollment-certificate','enrollment-certificate-admin']},
    {scope:'enrollment-certificate',user_id:student},{scope:'enrollment-certificate',user_id:other},
    {scope:'enrollment-certificate-admin',user_id:[student,other]},
    {scope:'enrollment-certificate-admin',user_id:''},{scope:'enrollment-certificate-admin',user_id:'not-a-uuid'},
    {scope:'enrollment-certificate-admin',user_id:'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'},
    {scope:'enrollment-certificate-admin',owner:other},{scope:'enrollment-certificate',download:'true'},
  ];
  await mocked(()=>{throw new Error('Invalid filters must not reach a private read.');},async calls=>{
    for(const query of queries)failure(await invoke(dataHandler,{query}),400);
    assert.equal(calls.length,queries.length);assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  });
});

test('foreign or malformed personal rows and filtered administrator rows fail closed',async()=>{
  for(const patch of [{user_id:other},{source_mode:'official'},{status:'available'},{download_url:'PRIVATE_PROVIDER_CAPABILITY'},{assessed_at:'2026-02-29T00:00:00Z'}]){
    await mocked(()=>json([{...row,...patch}]),async()=>{failure(await invoke(dataHandler,{query:{scope:'enrollment-certificate'}}),503);});
  }
  await mocked(call=>call.url.pathname===accessRpc?json({userId:administrator,canManage:true}):json(call.url.pathname===assessmentTable?[row]:[]),async()=>{
    failure(await invoke(dataHandler,{query:{scope:'enrollment-certificate-admin',user_id:other},token:adminToken}),503);
  });
  await mocked(()=>json([]),async()=>{assert.deepEqual((await invoke(dataHandler,{query:{scope:'enrollment-certificate'}})).body,{assessments:[],documents:[]});});
});

test('both manager kinds retain exact fields, nested request IDs, literal clearing and stable receipts',async()=>{
  await mocked(call=>{
    assert.equal(call.headers.get('authorization'),'Bearer '+adminToken);
    if(call.url.pathname===accessRpc)return json({userId:administrator,canManage:true});
    assert.equal(call.url.pathname,saveRpc);assert.equal(call.method,'POST');
    assert.deepEqual(Object.keys(call.body!).sort(),['p_kind','p_payload']);
    return json(receipt(call.body!.p_kind as string,call.body!.p_payload as Record<string,unknown>));
  },async calls=>{
    for(const [kind,value] of [[assessmentKind,{...payload,academic_year:null,semester:null,has_pending_fees:null,result_text:'',assessed_at:null}],
      [documentKind,document],[documentKind,{...document,status:'revoked',expected_version:1}]] as const){
      const first=await invoke(manageHandler,{token:adminToken,body:JSON.stringify({kind,payload:value})});assert.equal(first.status,200);
      assert.deepEqual(first.body,receipt(kind,value));assert.deepEqual(calls.at(-1)?.body,{p_kind:kind,p_payload:value});
      const replay=await invoke(manageHandler,{token:adminToken,body:{kind,payload:value}});assert.deepEqual(replay.body,first.body);
      assert.deepEqual(calls.at(-1)?.body,{p_kind:kind,p_payload:value});
    }
    assert.equal(calls.length,18);assert.ok(calls.every(call=>['/auth/v1/user',accessRpc,saveRpc].includes(call.url.pathname)));
  });
});

test('strict certificate envelopes and UTF-8 bounds reject extra authorization/capability fields before dispatch',async()=>{
  await mocked(()=>{throw new Error('Invalid fields must never reach permission or write RPCs.');},async calls=>{
    for(const body of ['{',null,[],{kind:assessmentKind,payload:[]},{kind:assessmentKind,payload,requestId},
      {kind:assessmentKind,payload,user_id:other},{kind:documentKind,payload:document,download:true},
      {kind:assessmentKind,payload:{...payload,result_text:'界'.repeat(4000)}}])failure(await invoke(manageHandler,{body}),400);
    assert.equal(calls.length,0,'Oversize and extra envelope fields reject before Auth.');
    for(const [kind,value] of [[assessmentKind,{...payload,storage_path:'PRIVATE_PROVIDER_PATH'}],[assessmentKind,{...payload,expected_version:'0'}],
      [documentKind,{...document,status:'available'}],[documentKind,{...document,verified_at:stamp}],[documentKind,{...document,assessment_version:0}]] as const)
      failure(await invoke(manageHandler,{body:{kind,payload:value}}),400);
    assert.equal(calls.length,5);assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  });
});

test('provider denials/conflicts and malformed receipts preserve HTTP status without private diagnostics',async()=>{
  for(const [provider,status] of [[400,400],[401,401],[403,403],[409,409],[413,400],[422,400],[500,503]])await mocked(call=>{
    if(call.url.pathname===accessRpc)return json({userId:administrator,canManage:true});
    return json({message:'PRIVATE_PROVIDER_DETAIL'},provider);
  },async()=>{
    failure(await invoke(dataHandler,{query:{scope:'enrollment-certificate'}}),status);
    failure(await invoke(manageHandler,{token:adminToken,body:{kind:assessmentKind,payload}}),status);
  });
  for(const changed of [{...receipt(assessmentKind,payload),version:9},{...receipt(assessmentKind,payload),id:other},
    {...receipt(assessmentKind,payload),url:'PRIVATE_PROVIDER_CAPABILITY'}])await mocked(call=>json(call.url.pathname===accessRpc?{userId:administrator,canManage:true}:changed),async()=>{
    failure(await invoke(manageHandler,{token:adminToken,body:{kind:assessmentKind,payload}}),503);
  });
});

test('certificate permission, reads and writes retain the request deadline consumed by authentication',async()=>{
  const savedNow=Date.now,savedTimeout=AbortSignal.timeout;let now=1000;const timeouts:number[]=[];
  Date.now=()=>now;AbortSignal.timeout=delay=>{timeouts.push(delay);return new AbortController().signal;};
  try{
    await mocked(call=>{
      if(call.url.pathname===accessRpc){now+=9000;return json({userId:administrator,canManage:true});}
      assert.equal(call.url.pathname,saveRpc);return json(receipt(assessmentKind,payload));
    },async calls=>{
      const result=await invoke(manageHandler,{token:adminToken,body:{kind:assessmentKind,payload}});assert.equal(result.status,200);
      assert.equal(calls.length,3);assert.deepEqual(timeouts,[8000,10000,1000]);
    },{auth:()=>{now+=7000;return json({id:administrator,identities:[{provider:'google'}]});}});
    now=1000;timeouts.length=0;
    await mocked(()=>{throw new Error('Expired authorization budget must prevent records or RPCs.');},async calls=>{
      failure(await invoke(dataHandler,{query:{scope:'enrollment-certificate'}}),503);assert.equal(calls.length,1);
      now=1000;failure(await invoke(manageHandler,{token:adminToken,body:{kind:assessmentKind,payload}}),503);assert.equal(calls.length,2);
    },{auth:()=>{now+=17000;return json({id:administrator,identities:[{provider:'google'}]});}});
  }finally{Date.now=savedNow;AbortSignal.timeout=savedTimeout;}
});

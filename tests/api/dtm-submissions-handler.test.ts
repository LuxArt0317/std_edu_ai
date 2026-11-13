import assert from 'node:assert/strict';
import test from 'node:test';
import dataHandler from '../../api/affairs-data.ts';
import actionHandler from '../../api/affairs-action.ts';
import manageHandler from '../../api/affairs-manage.ts';

// Exercise real handlers and helpers. Only outbound HTTP is mocked; this suite
// never authenticates against a provider, reads credentials, or uploads bytes.
const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-publishable-key';
const student='10000000-0000-4000-8000-000000000001',admin='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const assignment='20000000-0000-4000-8000-000000000001',course='20000000-0000-4000-8000-000000000002',submission='30000000-0000-4000-8000-000000000001';
const upload='40000000-0000-4000-8000-000000000001',requestId='50000000-0000-4000-8000-000000000001',objectId='60000000-0000-4000-8000-000000000001';
const studentToken='synthetic-student-token-'.repeat(3),adminToken='synthetic-admin-token-'.repeat(3),stamp='2030-01-01T00:00:00Z';
const path=`${student}/${submission}/${upload}`;
const begin={assignment_id:assignment,request_id:requestId,expected_version:0,filename:'synthetic.txt',size_bytes:9,content_type:'text/plain'};
const change={assignment_id:assignment,request_id:requestId,expected_version:0,upload_id:upload};
const review={...change,status:'graded',grade_text:'0',feedback:null};
const reservation={kind:'begin_dtm_submission_upload',assignmentId:assignment,submissionId:submission,uploadId:upload,version:0,bucket:'dtm-submissions',path,expiresAt:stamp,maxBytes:10485760};
const receipt={kind:'commit_dtm_submission_upload',assignmentId:assignment,submissionId:submission,uploadId:upload,version:1,submittedAt:stamp,contentModifiedAt:stamp};
const cancellation={kind:'cancel_dtm_submission_upload',assignmentId:assignment,submissionId:submission,uploadId:upload,version:0,cancelled:true};
const reviewReceipt={kind:'save_dtm_submission_review',assignmentId:assignment,submissionId:submission,uploadId:upload,version:1,reviewId:requestId};
const prepared={upload:{id:upload,userId:student,submissionId:submission,path,sizeBytes:9,contentType:'text/plain'}};
const info={id:objectId,bucket_id:'dtm-submissions',name:path,size:9,content_type:'text/plain',etag:'synthetic-etag'};
const workspace=()=>({assignmentId:assignment,userId:student,courseId:course,dueAt:null,maxBytes:10485760,
  submission:{id:submission,assignment_id:assignment,user_id:student,course_id:course,current_upload_id:upload,version:1,submitted_at:stamp,content_modified_at:stamp,due_at_at_submission:null,source_mode:'local_submission'},
  files:[{id:upload,filename:'synthetic.txt',sizeBytes:9,contentType:'text/plain',path,state:'current',expiresAt:stamp,committedAt:stamp}],reviews:[]});
type Call={url:URL;method:string;headers:Headers;body:Record<string,unknown>|undefined;signal:AbortSignal|null|undefined};
type Result={status:number;body:unknown;headers:Record<string,string>};
type Handler=typeof dataHandler|typeof actionHandler|typeof manageHandler;
const json=(body:unknown,status=200)=>Response.json(body,{status});
async function invoke(handler:Handler,{method=handler===dataHandler?'GET':'POST',body,query,token=studentToken}:{method?:string;body?:unknown;query?:Record<string,string|string[]|undefined>;token?:string|null}={}):Promise<Result>{
  const result:Result={status:200,body:null,headers:{}};
  const response={status(code:number){result.status=code;return response;},json(value:unknown){result.body=value;},setHeader(name:string,value:string){result.headers[name]=value;}};
  await handler({method,body,query,headers:token?{authorization:'Bearer '+token}:{}},response);return result;
}
async function mocked(run:(call:Call)=>Response|Promise<Response>,callback:(calls:Call[])=>Promise<void>,options:{auth?:boolean;google?:boolean;cleanup?:boolean}={}){
  const original=globalThis.fetch,savedUrl=process.env.VITE_SUPABASE_URL,savedKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,calls:Call[]=[];
  process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  globalThis.fetch=async(input,init)=>{
    const call:Call={url:new URL(String(input)),method:init?.method??'GET',headers:new Headers(init?.headers),body:init?.body?JSON.parse(String(init.body)) as Record<string,unknown>:undefined,signal:init?.signal};
    calls.push(call);assert.equal(call.url.origin,origin);assert.equal(call.headers.get('apikey'),key);assert.ok(call.signal instanceof AbortSignal);
    if(call.url.pathname==='/auth/v1/user'&&options.auth!==false){
      assert.equal(call.method,'GET');assert.equal(call.body,undefined);
      assert.ok([studentToken,adminToken].some(token=>call.headers.get('authorization')==='Bearer '+token));
      return json({id:call.headers.get('authorization')==='Bearer '+adminToken?admin:student,
        identities:[{provider:options.google===false?'email':'google'}]});
    }
    if(options.cleanup!==false&&call.url.pathname==='/rest/v1/rpc/dtm_submission_cleanup_batch'){assert.deepEqual(call.body,{p_limit:5});return json([]);}
    return run(call);
  };
  try{await callback(calls);}finally{
    globalThis.fetch=original;
    if(savedUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=savedUrl;
    if(savedKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=savedKey;
  }
}
function safeFailure(result:Result,status:number){assert.equal(result.status,status);assert.ok(typeof result.body==='object'&&result.body!==null&&'error'in result.body);assert.ok(!JSON.stringify(result.body).includes('PRIVATE_PROVIDER'));
  assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');assert.equal(result.headers['X-Content-Type-Options'],'nosniff');}

test('all DTM handlers reject wrong methods, missing/short tokens and non-Google Auth before private RPCs',async()=>{
  await mocked(()=>{throw new Error('No provider call expected.');},async calls=>{
    for(const handler of [dataHandler,actionHandler,manageHandler]){
      safeFailure(await invoke(handler,{method:handler===dataHandler?'POST':'GET'}),405);
      for(const token of [null,'short'])safeFailure(await invoke(handler,{token,query:{scope:'dtm-submission',assignment_id:assignment},body:{kind:'begin_dtm_submission_upload',payload:begin}}),401);
    }assert.equal(calls.length,0);
  });
  await mocked(()=>{throw new Error('Non-Google identity must not reach private records.');},async calls=>{
    safeFailure(await invoke(dataHandler,{query:{scope:'dtm-submission',assignment_id:assignment}}),401);assert.equal(calls.length,1);
  },{google:false});
});

test('dedicated own/admin workspace scopes call only the authorized RPC with the original caller JWT',async()=>{
  await mocked(call=>{assert.equal(call.url.pathname,'/rest/v1/rpc/dtm_submission_workspace');assert.deepEqual(call.body,{p_assignment_id:assignment});return json(workspace());},async calls=>{
    for(const [scope,token] of [['dtm-submission',studentToken],['dtm-submission-admin',adminToken]]){
      const result=await invoke(dataHandler,{token,query:{scope,assignment_id:assignment}});assert.equal(result.status,200);assert.deepEqual(result.body,workspace());
      assert.equal(calls.at(-1)?.headers.get('authorization'),'Bearer '+token);assert.equal(result.headers['Cache-Control'],'no-store, max-age=0');
    }
    assert.deepEqual(calls.map(call=>call.url.pathname),['/auth/v1/user','/rest/v1/rpc/dtm_submission_workspace','/auth/v1/user','/rest/v1/rpc/dtm_submission_workspace']);
  });
});

test('student admin-scope requests and cross-account assignment requests preserve SQL denial without returning file metadata',async()=>{
  await mocked(call=>{assert.equal(call.url.pathname,'/rest/v1/rpc/dtm_submission_workspace');assert.equal(call.headers.get('authorization'),'Bearer '+studentToken);return json({message:'PRIVATE_PROVIDER_FILENAME'},403);},async()=>{
    for(const scope of ['dtm-submission','dtm-submission-admin','dtm-submission-download'])safeFailure(await invoke(dataHandler,{query:{scope,assignment_id:assignment,upload_id:upload}}),403);
  });
  await mocked(()=>json({...workspace(),userId:other}),async()=>{
    const result=await invoke(dataHandler,{query:{scope:'dtm-submission',assignment_id:assignment}});safeFailure(result,503);assert.ok(!JSON.stringify(result.body).includes('synthetic.txt'));
  });
});

test('repeated scope/IDs, missing identifiers and invalid UUIDs fail without a private read or Storage signing',async()=>{
  const queries:Record<string,string|string[]|undefined>[]=[
    {scope:['dtm-submission','dtm-submission-admin'],assignment_id:assignment},
    {scope:'dtm-submission',assignment_id:[assignment,assignment]},
    {scope:'dtm-submission-admin',assignment_id:[assignment,assignment]},
    {scope:'dtm-submission-download',assignment_id:assignment,upload_id:[upload,upload]},
    {scope:'dtm-submission-download',assignment_id:[assignment,assignment],upload_id:upload},
    {scope:'dtm-submission'},{scope:'dtm-submission-download',assignment_id:assignment},
    {scope:'dtm-submission',assignment_id:'not-a-uuid'},
    {scope:'dtm-submission-download',assignment_id:assignment,upload_id:'../private'},
    {scope:'dtm-submission-download',assignment_id:'not-a-uuid',upload_id:upload},
  ];
  await mocked(()=>{throw new Error('Invalid input must not reach private RPCs.');},async calls=>{
    for(const query of queries)safeFailure(await invoke(dataHandler,{query}),400);
    assert.equal(calls.length,queries.length);assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  });
});

test('own and authorized admin downloads use caller-JWT workspace and Storage signing with a 60-second attachment',async()=>{
  await mocked(call=>{
    if(call.url.pathname==='/rest/v1/rpc/dtm_submission_workspace')return json(workspace());
    assert.equal(call.url.pathname,'/storage/v1/object/sign/dtm-submissions/'+path);assert.deepEqual(call.body,{expiresIn:60});
    return json({signedURL:'/object/sign/dtm-submissions/'+path+'?token=synthetic-capability'});
  },async calls=>{
    for(const token of [studentToken,adminToken]){
      const result=await invoke(dataHandler,{token,query:{scope:'dtm-submission-download',assignment_id:assignment,upload_id:upload}});assert.equal(result.status,200);
      const value=result.body as {uploadId:string;expiresIn:number;signedUrl:string};assert.equal(value.uploadId,upload);assert.equal(value.expiresIn,60);
      const destination=new URL(value.signedUrl);assert.equal(destination.origin,origin);assert.equal(destination.searchParams.get('download'),'synthetic.txt');
      assert.ok(calls.slice(-3).every(call=>call.headers.get('authorization')==='Bearer '+token));
    }
    assert.equal(calls.filter(call=>call.url.pathname.includes('/object/sign/')).length,2);
    assert.ok(calls.every(call=>call.method!=='DELETE'&&!call.url.pathname.includes('/object/authenticated/')));
  });
});

test('download does not sign pending/unknown uploads or accept malformed Storage capabilities',async()=>{
  for(const missing of [true,false])await mocked(call=>{
    assert.equal(call.url.pathname,'/rest/v1/rpc/dtm_submission_workspace');
    const data=workspace();return json({...data,files:missing?[]:[{...data.files[0],state:'pending',committedAt:null}],
      submission:{...data.submission,current_upload_id:null,version:0,submitted_at:null,content_modified_at:null}});
  },async calls=>{
    safeFailure(await invoke(dataHandler,{query:{scope:'dtm-submission-download',assignment_id:assignment,upload_id:upload}}),404);assert.equal(calls.length,2);
  });
  await mocked(call=>call.url.pathname.endsWith('/dtm_submission_workspace')?json(workspace()):json({signedURL:'https://unrelated.invalid/PRIVATE_PROVIDER'}),async()=>{
    safeFailure(await invoke(dataHandler,{query:{scope:'dtm-submission-download',assignment_id:assignment,upload_id:upload}}),503);
  });
});

test('begin/cancel use exact student action kinds and nested request IDs without generic reviewed-action dispatch',async()=>{
  await mocked(call=>{
    assert.equal(call.url.pathname,'/rest/v1/rpc/dtm_submission_action');assert.equal(call.headers.get('authorization'),'Bearer '+studentToken);
    if(call.body?.p_kind==='begin_dtm_submission_upload'){assert.deepEqual(call.body,{p_kind:'begin_dtm_submission_upload',p_payload:begin});return json(reservation);}
    assert.deepEqual(call.body,{p_kind:'cancel_dtm_submission_upload',p_payload:change});return json(cancellation);
  },async calls=>{
    assert.deepEqual((await invoke(actionHandler,{body:JSON.stringify({kind:'begin_dtm_submission_upload',payload:begin,requestId})})).body,reservation);
    assert.deepEqual((await invoke(actionHandler,{body:{kind:'cancel_dtm_submission_upload',payload:change}})).body,cancellation);
    assert.ok(calls.every(call=>!call.url.pathname.includes('reviewed_action')));assert.equal(calls.length,6);
  });
});

test('commit reads actual Storage object info before atomic RPC and cannot trust caller-supplied metadata',async()=>{
  await mocked(call=>{
    if(call.url.pathname.endsWith('/dtm_submission_prepare')){assert.deepEqual(call.body,{p_kind:'commit_dtm_submission_upload',p_payload:change});return json(prepared);}
    if(call.url.pathname.includes('/object/info/')){assert.equal(call.method,'GET');assert.equal(call.url.pathname,'/storage/v1/object/info/dtm-submissions/'+path);return json(info);}
    assert.deepEqual(call.body,{p_kind:'commit_dtm_submission_upload',p_payload:change,p_verified_object:{id:objectId,size_bytes:9,content_type:'text/plain',etag:'synthetic-etag'}});return json(receipt);
  },async calls=>{
    const result=await invoke(actionHandler,{body:{kind:'commit_dtm_submission_upload',payload:change}});assert.equal(result.status,200);assert.deepEqual(result.body,receipt);
    assert.equal(calls.length,5);assert.ok(calls.every(call=>call.headers.get('authorization')==='Bearer '+studentToken));
    safeFailure(await invoke(actionHandler,{body:{kind:'commit_dtm_submission_upload',payload:{...change,p_verified_object:info}}}),400);assert.equal(calls.length,6);
  });
});

test('durable commit replay bypasses missing old bytes and mismatched object metadata never commits',async()=>{
  await mocked(call=>{assert.equal(call.url.pathname,'/rest/v1/rpc/dtm_submission_prepare');return json({receipt});},async calls=>{
    assert.deepEqual((await invoke(actionHandler,{body:{kind:'commit_dtm_submission_upload',payload:change}})).body,receipt);assert.equal(calls.length,3);
  });
  await mocked(call=>{
    if(call.url.pathname.endsWith('/dtm_submission_prepare'))return json(prepared);
    assert.ok(call.url.pathname.includes('/object/info/'));return json({...info,size:10});
  },async calls=>{
    safeFailure(await invoke(actionHandler,{body:{kind:'commit_dtm_submission_upload',payload:change}}),400);assert.equal(calls.length,3);
  });
});

test('review goes through manager only, preserves explicit grade zero and clearing, and maps student denial',async()=>{
  await mocked(call=>{
    assert.equal(call.url.pathname,'/rest/v1/rpc/dtm_submission_action');assert.equal(call.body?.p_kind,'save_dtm_submission_review');
    if(call.headers.get('authorization')==='Bearer '+studentToken)return json({message:'PRIVATE_PROVIDER_ADMIN_REQUIRED'},403);
    return json(reviewReceipt);
  },async calls=>{
    safeFailure(await invoke(manageHandler,{body:{kind:'save_dtm_submission_review',payload:review}}),403);
    for(const payload of [review,{...review,status:'not_graded',grade_text:null,feedback:''}]){
      const result=await invoke(manageHandler,{token:adminToken,body:{kind:'save_dtm_submission_review',payload}});assert.equal(result.status,200);assert.deepEqual(result.body,reviewReceipt);
      assert.deepEqual(calls.at(-1)?.body,{p_kind:'save_dtm_submission_review',p_payload:payload});
    }
    const before=calls.length;safeFailure(await invoke(actionHandler,{body:{kind:'save_dtm_submission_review',payload:review}}),400);
    assert.equal(calls.length,before+1);
  });
});

test('invalid bodies, omitted upload suffixes, unknown fields and byte limits fail before mutation',async()=>{
  await mocked(()=>{throw new Error('No mutation expected.');},async calls=>{
    for(const handler of [actionHandler,manageHandler])for(const body of ['{',null,[],{kind:'begin_dtm_submission_upload',payload:[]},{kind:'begin_dtm_submission_upload',payload:{filename:'界'.repeat(5000)}}])
      safeFailure(await invoke(handler,{body}),400);
    assert.equal(calls.length,0);
    for(const body of [{kind:'begin_dtm_submission',payload:begin},{kind:'begin_dtm_submission_upload',payload:{...begin,user_id:other}},
      {kind:'begin_dtm_submission_upload',payload:{...begin,size_bytes:10485761}},{kind:'commit_dtm_submission_upload',payload:{...change,expected_version:'0'}}])
      safeFailure(await invoke(actionHandler,{body}),400);
    safeFailure(await invoke(manageHandler,{body:{kind:'save_dtm_submission_review',payload:{...review,feedback:'\u0001'.repeat(2000)}}}),400);
    assert.ok(calls.every(call=>call.url.pathname==='/auth/v1/user'));
  });
});

test('DTM provider status and network failures retain intended HTTP statuses and never expose provider messages',async()=>{
  for(const [provider,expected] of [[400,400],[401,401],[403,403],[404,409],[409,409],[429,503],[500,503]])await mocked(()=>json({message:'PRIVATE_PROVIDER_DETAIL'},provider),async()=>{
    safeFailure(await invoke(actionHandler,{body:{kind:'begin_dtm_submission_upload',payload:begin}}),expected);
    safeFailure(await invoke(manageHandler,{body:{kind:'save_dtm_submission_review',payload:review}}),expected);
    safeFailure(await invoke(dataHandler,{query:{scope:'dtm-submission',assignment_id:assignment}}),expected);
  });
  await mocked(()=>{throw new Error('PRIVATE_PROVIDER_NETWORK');},async()=>{
    safeFailure(await invoke(actionHandler,{body:{kind:'begin_dtm_submission_upload',payload:begin}}),503);
  });
  await mocked(()=>{throw new Error('PRIVATE_PROVIDER_AUTH_NETWORK');},async calls=>{
    safeFailure(await invoke(dataHandler,{query:{scope:'dtm-submission',assignment_id:assignment}}),503);assert.equal(calls.length,1);
  },{auth:false});
});

test('ordinary task/tracker actions and existing reviewed-action envelopes retain their original dispatch',async()=>{
  const operations=[
    {kind:'create_task',payload:{title:'Synthetic task'},rpc:'affairs_execute_action'},
    {kind:'save_dtm_assignment',payload:{id:assignment,title:'Synthetic tracker'},rpc:'dtm_manage_record'},
    {kind:'create_task',payload:{title:'Synthetic reviewed task'},requestId,rpc:'affairs_reviewed_action'},
  ];
  await mocked(call=>{assert.ok(call.url.pathname.startsWith('/rest/v1/rpc/'));return json({ok:true});},async calls=>{
    for(const operation of operations){
      const {rpc,...body}=operation;const result=await invoke(actionHandler,{body});assert.equal(result.status,200);assert.deepEqual(result.body,{ok:true});
      const call=calls.at(-1)!;assert.equal(call.url.pathname,'/rest/v1/rpc/'+rpc);
      assert.deepEqual(call.body,{p_kind:body.kind,p_payload:body.payload,...('requestId'in body?{p_request_id:body.requestId}:{})});
    }
    assert.equal(calls.length,6);assert.ok(calls.every(call=>!call.url.pathname.includes('dtm_submission')));
  });
});


test('successful receipts survive cleanup outages; explicit cleanup retries use only caller-authorized queue paths',async()=>{
  await mocked(call=>{
    if(call.url.pathname.endsWith('/dtm_submission_prepare'))return json({receipt});
    assert.ok(call.url.pathname.endsWith('/dtm_submission_cleanup_batch'));return json({message:'PRIVATE_PROVIDER_CLEANUP'},503);
  },async()=>{
    const result=await invoke(actionHandler,{body:{kind:'commit_dtm_submission_upload',payload:change}});
    assert.equal(result.status,200);assert.deepEqual(result.body,receipt);assert.equal(result.headers['X-DTM-Cleanup'],'deferred');
  },{cleanup:false});
  await mocked(call=>{
    if(call.url.pathname.endsWith('/dtm_submission_cleanup_batch')){assert.deepEqual(call.body,{p_limit:5});return json([{path}]);}
    if(call.method==='DELETE'){assert.equal(call.url.pathname,'/storage/v1/object/dtm-submissions');assert.deepEqual(call.body,{prefixes:[path]});return json([]);}
    assert.ok(call.url.pathname.endsWith('/dtm_submission_cleanup_ack'));assert.deepEqual(call.body,{p_path:path});return new Response(null,{status:204});
  },async calls=>{
    const result=await invoke(actionHandler,{body:{kind:'cleanup_dtm_submission_uploads',payload:{}}});
    assert.equal(result.status,200);assert.deepEqual(result.body,{removed:1,remaining:0});assert.equal(calls.length,4);
    assert.ok(calls.every(call=>call.headers.get('authorization')==='Bearer '+studentToken));
    safeFailure(await invoke(actionHandler,{body:{kind:'cleanup_dtm_submission_uploads',payload:{path:'untrusted'}}}),400);
    assert.equal(calls.length,5,'Untrusted paths never reach cleanup RPC.');
  },{cleanup:false});
});

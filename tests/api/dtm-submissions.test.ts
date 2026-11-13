import assert from 'node:assert/strict';
import test from 'node:test';
import {DtmSubmissionError,dtmSubmissionMaxBytes,validateDtmSubmissionPayload,executeDtmSubmissionAction,manageDtmSubmissionReview,loadDtmSubmissionWorkspace,createDtmSubmissionDownload,cleanupDtmSubmissionUploads} from '../../server/dtmSubmissions.js';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const assignment='20000000-0000-4000-8000-000000000001',submission='30000000-0000-4000-8000-000000000001';
const upload='40000000-0000-4000-8000-000000000001',requestId='50000000-0000-4000-8000-000000000001',objectId='60000000-0000-4000-8000-000000000001';
const account={user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',token:'synthetic-token',key:'synthetic-public-key'};
const path=`${owner}/${submission}/${upload}`,begin={assignment_id:assignment,request_id:requestId,expected_version:0,filename:'合成 homework.txt',size_bytes:12,content_type:'text/plain'};
const commit={assignment_id:assignment,request_id:requestId,expected_version:0,upload_id:upload};
const review={...commit,status:'graded',grade_text:'P / literal',feedback:null};
const prepared={upload:{id:upload,userId:owner,submissionId:submission,path,sizeBytes:12,contentType:'text/plain'}};
const info={id:objectId,bucket_id:'dtm-submissions',name:path,size:12,content_type:'text/plain',etag:'synthetic-etag'};
const stamp='2030-01-01T00:00:00Z';
const receipt={kind:'commit_dtm_submission_upload',assignmentId:assignment,submissionId:submission,uploadId:upload,version:1,submittedAt:stamp,contentModifiedAt:stamp};
type Call={url:URL;method:string;body:Record<string,unknown>|undefined;headers:Headers;signal:AbortSignal|null|undefined};
async function mockFetch(run:(call:Call)=>Response|Promise<Response>,callback:()=>Promise<void>){
  const prior=globalThis.fetch;
  globalThis.fetch=async(input,init)=>run({url:new URL(String(input)),method:init?.method||'GET',body:init?.body?JSON.parse(String(init.body)):undefined,headers:new Headers(init?.headers),signal:init?.signal});
  try{await callback();}finally{globalThis.fetch=prior;}
}
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const statusIs=(status:number)=>(error:unknown)=>error instanceof DtmSubmissionError&&error.status===status;

test('submission payload boundaries distinguish zero bytes, unknown keys, Unicode bytes and literal reviews',()=>{
  for(const size_bytes of [0,dtmSubmissionMaxBytes])assert.equal(validateDtmSubmissionPayload('begin_dtm_submission_upload',{...begin,size_bytes}),null);
  for(const patch of [{size_bytes:-1},{size_bytes:dtmSubmissionMaxBytes+1},{size_bytes:0.5},{size_bytes:'12'},{size_bytes:NaN},{size_bytes:Infinity},
    {filename:''},{filename:'  '},{filename:'.'},{filename:'..'},{filename:'a/b'},{filename:'a\\b'},{filename:'bad\nname'},{filename:'a'.repeat(256)},{filename:'界'.repeat(86)},
    {filename:'\ud800'},{content_type:'text/html\r\nInjected:true'},{content_type:'text/plain; charset=utf-8'},{expected_version:'0'},{expected_version:-1},
    {expected_version:999999999},{assignment_id:other.toUpperCase()+'/'},{user_id:other},{path:'arbitrary/path'},{content:'base64 bytes'}])
    assert.ok(validateDtmSubmissionPayload('begin_dtm_submission_upload',{...begin,...patch}),JSON.stringify(patch));
  assert.equal(validateDtmSubmissionPayload('begin_dtm_submission_upload',{...begin,filename:'界'.repeat(85)}),null);
  assert.equal(validateDtmSubmissionPayload('commit_dtm_submission_upload',commit),null);
  assert.ok(validateDtmSubmissionPayload('commit_dtm_submission_upload',{...commit,p_verified_object:info}));
  assert.equal(validateDtmSubmissionPayload('save_dtm_submission_review',review),null);
  assert.equal(validateDtmSubmissionPayload('save_dtm_submission_review',{...review,status:'not_graded',grade_text:null,feedback:''}),null);
  assert.ok(validateDtmSubmissionPayload('save_dtm_submission_review',{...review,status:'not_graded'}));
  assert.ok(validateDtmSubmissionPayload('save_dtm_submission_review',{...review,grade_text:0}));
  assert.ok(validateDtmSubmissionPayload('save_dtm_submission_review',{...review,feedback:'界'.repeat(2001)}));
  assert.ok(validateDtmSubmissionPayload('save_dtm_submission_review',{...review,feedback:'\u0001'.repeat(2000)}),'JSON escaping respects the 12KB boundary');
  assert.ok(validateDtmSubmissionPayload('set_assignment_status',commit));
});

test('filename validation rejects Unicode-whitespace-only input before transport and preserves surrounding literal whitespace',async()=>{
  const whitespace=[0x9,0xa,0xb,0xc,0xd,0x20,0xa0,0x1680,...Array.from({length:11},(_,index)=>0x2000+index),0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff].map(code=>String.fromCodePoint(code));
  const invalid=[...whitespace,whitespace.join(''),'\u00a0\u3000',' \u00a0 \ufeff\u3000 '];
  let calls=0;
  await mockFetch(()=>{calls++;throw new Error('Whitespace-only names must not reach transport.');},async()=>{
    for(const filename of invalid){assert.equal(filename.trim(),'');await assert.rejects(executeDtmSubmissionAction(account,'begin_dtm_submission_upload',{...begin,filename}),statusIs(400));}
  });assert.equal(calls,0);
  for(const filename of ['\u00a0Synthetic homework.txt\u3000','\ufeffSynthetic.txt','合成\u3000作業.txt']){
    const payload={...begin,filename};assert.equal(validateDtmSubmissionPayload('begin_dtm_submission_upload',payload),null);assert.equal(payload.filename,filename);
  }
});

test('begin and cancel use caller JWT, exact RPC bodies and no file upload or tracker mutation',async()=>{
  const calls:Call[]=[];
  await mockFetch(call=>{calls.push(call);assert.equal(call.headers.get('authorization'),'Bearer synthetic-token');assert.equal(call.headers.get('apikey'),'synthetic-public-key');return json({kind:call.body?.p_kind,assignmentId:assignment,submissionId:submission,uploadId:upload,version:0,...(call.body?.p_kind==='begin_dtm_submission_upload'?{bucket:'dtm-submissions',path,expiresAt:stamp,maxBytes:dtmSubmissionMaxBytes}:{cancelled:true})});},async()=>{
    await executeDtmSubmissionAction(account,'begin_dtm_submission_upload',begin);
    await executeDtmSubmissionAction(account,'cancel_dtm_submission_upload',commit);
  });
  assert.deepEqual(calls.map(call=>[call.url.pathname,call.body]),[
    ['/rest/v1/rpc/dtm_submission_action',{p_kind:'begin_dtm_submission_upload',p_payload:begin}],
    ['/rest/v1/rpc/dtm_submission_action',{p_kind:'cancel_dtm_submission_upload',p_payload:commit}],
  ]);
});

test('commit inspects the actual stored object then passes only verified metadata to the atomic RPC',async()=>{
  const calls:Call[]=[];
  await mockFetch(call=>{calls.push(call);if(call.url.pathname.endsWith('/dtm_submission_prepare'))return json(prepared);if(call.method==='GET')return json(info);return json(receipt);},async()=>{
    assert.deepEqual(await executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit),receipt);
  });
  assert.equal(calls.length,3);assert.equal(calls[1].method,'GET');assert.equal(calls[1].body,undefined);
  assert.equal(calls[1].url.pathname,'/storage/v1/object/info/dtm-submissions/'+path);
  assert.deepEqual(calls[2].body,{p_kind:'commit_dtm_submission_upload',p_payload:commit,p_verified_object:{id:objectId,size_bytes:12,content_type:'text/plain',etag:'synthetic-etag'}});
  assert.ok(calls[2].body);assert.equal('filename'in (calls[2].body.p_verified_object as object),false);
});

test('legacy Storage info shape is verified without trusting browser metadata or coercing strings',async()=>{
  const oldInfo={id:objectId,bucket_id:'dtm-submissions',name:path,metadata:{size:12,mimetype:'text/plain',eTag:'old-etag'}};
  await mockFetch(call=>call.url.pathname.endsWith('/dtm_submission_prepare')?json(prepared):call.method==='GET'?json(oldInfo):json(receipt),async()=>{
    assert.equal((await executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit)).version,1);
  });
  for(const patch of [{size:'12'},{size:13},{size:-1},{size:dtmSubmissionMaxBytes+1},{content_type:'image/png'},{name:other+'/'+submission+'/'+upload},
    {bucket_id:'public-files'},{bucket_id:undefined,bucketId:'dtm-submissions'},{content_type:undefined,contentType:'text/plain'},
    {id:'not-an-object'},{etag:''},{is_delete_marker:true},{metadata:{size:13}},{metadata:{mimetype:'image/png'}},{metadata:{eTag:'different'}}]){
    let commits=0;
    await mockFetch(call=>{if(call.url.pathname.endsWith('/dtm_submission_prepare'))return json(prepared);if(call.method==='GET')return json({...info,...patch});commits++;return json(receipt);},async()=>{
      await assert.rejects(executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit),error=>error instanceof DtmSubmissionError);
    });assert.equal(commits,0,JSON.stringify(patch));
  }
});

test('durable replay is returned before reading a file replaced or removed by a later operation',async()=>{
  let calls=0;
  await mockFetch(call=>{calls++;assert.ok(call.url.pathname.endsWith('/dtm_submission_prepare'));return json({receipt});},async()=>{
    assert.deepEqual(await executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit),receipt);
  });assert.equal(calls,1);
  let prepareCount=0,storageCount=0;
  await mockFetch(call=>{if(call.url.pathname.endsWith('/dtm_submission_prepare'))return json(++prepareCount===1?prepared:{receipt});storageCount++;return json({error:'missing'},404);},async()=>{
    assert.deepEqual(await executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit),receipt);
  });assert.equal(prepareCount,2);assert.equal(storageCount,1);
});

test('a commit finishing between prepare receipt and state reads is recovered once from its matching durable receipt',async()=>{
  const calls:Call[]=[];
  await mockFetch(call=>{
    calls.push(call);
    // First prepare saw no receipt, then the identical concurrent commit
    // changed the upload to current before prepare checked its state.
    return calls.length===1?json({error:'Upload changed or expired'},409):json({receipt});
  },async()=>{
    assert.deepEqual(await executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit),receipt);
  });
  assert.equal(calls.length,2);
  for(const call of calls){
    assert.equal(call.url.pathname,'/rest/v1/rpc/dtm_submission_prepare');
    assert.deepEqual(call.body,{p_kind:'commit_dtm_submission_upload',p_payload:commit});
    assert.equal(call.headers.get('authorization'),'Bearer synthetic-token');
    assert.equal(call.headers.get('apikey'),'synthetic-public-key');
  }
});

test('prepare conflict recovery never commits again or accepts an unrelated receipt',async()=>{
  for(const recovery of [()=>json({error:'Cancelled or stale upload'},409),()=>json(prepared)]){
    let calls=0;
    await mockFetch(call=>{
      calls++;assert.ok(call.url.pathname.endsWith('/dtm_submission_prepare'));
      return calls===1?json({error:'Upload changed or expired'},409):recovery();
    },async()=>{await assert.rejects(executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit),statusIs(409));});
    assert.equal(calls,2,'Actual conflicts stop after one recheck.');
  }
  for(const changed of [{...receipt,assignmentId:other},{...receipt,uploadId:other},{...receipt,version:2},{...receipt,submittedAt:null}]){
    let calls=0;
    await mockFetch(()=>++calls===1?json({error:'concurrent change'},409):json({receipt:changed}),async()=>{
      await assert.rejects(executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit),statusIs(503));
    });assert.equal(calls,2);
  }
  for(const status of [400,401,403,500]){
    let calls=0;
    await mockFetch(()=>{calls++;return json({error:'prepare rejected'},status);},async()=>{
      await assert.rejects(executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit),statusIs(status===500?503:status));
    });assert.equal(calls,1,'Only an initial conflict permits the recovery recheck.');
  }
});

test('prepare conflict recovery retains the original deadline without starting an expired recheck',async()=>{
  const originalNow=Date.now,originalTimeout=AbortSignal.timeout,timeouts:number[]=[];let now=1000,calls=0;
  Date.now=()=>now;AbortSignal.timeout=delay=>{timeouts.push(delay);return new AbortController().signal;};
  try{
    await mockFetch(()=>{calls++;now+=60;return calls===1?json({error:'concurrent change'},409):json({receipt});},async()=>{
      assert.deepEqual(await executeDtmSubmissionAction({...account,requestDeadline:1100},'commit_dtm_submission_upload',commit),receipt);
    });assert.equal(calls,2);assert.deepEqual(timeouts,[100,40]);
    now=1000;calls=0;timeouts.length=0;
    await mockFetch(()=>{calls++;now=1100;return json({error:'concurrent change'},409);},async()=>{
      await assert.rejects(executeDtmSubmissionAction({...account,requestDeadline:1100},'commit_dtm_submission_upload',commit),statusIs(503));
    });assert.equal(calls,1);assert.deepEqual(timeouts,[100]);
  }finally{Date.now=originalNow;AbortSignal.timeout=originalTimeout;}
});

test('missing objects, stale commits and malformed preparation never become successful submissions',async()=>{
  for(const patch of [{upload:{...prepared.upload,userId:other}},{upload:{...prepared.upload,path:'../private'}},{upload:{...prepared.upload,id:other}},
    {upload:{...prepared.upload,sizeBytes:'12'}},{receipt:{...receipt,kind:'cancel_dtm_submission_upload'}},null]){
    let calls=0;await mockFetch(()=>{calls++;return json(patch);},async()=>{await assert.rejects(executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit),statusIs(503));});assert.equal(calls,1);
  }
  for(const status of [400,401,403,404,409,500])await mockFetch(call=>call.url.pathname.endsWith('/dtm_submission_prepare')?json(prepared):json({private:'do not expose this provider error'},status),async()=>{
    await assert.rejects(executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit),error=>error instanceof DtmSubmissionError&&!error.message.includes('private')&&error.status===(status===500?503:status===404?409:status));
  });
  await mockFetch(call=>call.url.pathname.endsWith('/dtm_submission_prepare')?json(prepared):call.method==='GET'?json(info):json({error:'stale'},409),async()=>{
    await assert.rejects(executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit),statusIs(409));
  });
});

test('review transport stays separate and preserves database authorization failures without changing trackers',async()=>{
  let calls=0;await mockFetch(call=>{calls++;assert.deepEqual(call.body,{p_kind:'save_dtm_submission_review',p_payload:review});return json({error:'admin required'},403);},async()=>{
    await assert.rejects(manageDtmSubmissionReview(account,'save_dtm_submission_review',review),statusIs(403));
    await assert.rejects(executeDtmSubmissionAction(account,'save_dtm_submission_review',review),statusIs(400));
    await assert.rejects(manageDtmSubmissionReview(account,'set_assignment_status',review),statusIs(400));
  });assert.equal(calls,1);
});

test('admin review edits retain literal grades, explicit clearing and optimistic versions without changing submission fields',async()=>{
  const operations=[{...review,grade_text:'0',feedback:' Revised literal feedback ',expected_version:1},
    {...review,status:'not_graded',grade_text:null,feedback:'',expected_version:2}];
  for(const payload of operations){
    await mockFetch(call=>{assert.deepEqual(call.body,{p_kind:'save_dtm_submission_review',p_payload:payload});return json({kind:'save_dtm_submission_review',assignmentId:assignment,submissionId:submission,uploadId:upload,reviewId:requestId,version:payload.expected_version+1});},async()=>{
      const result=await manageDtmSubmissionReview(account,'save_dtm_submission_review',payload);assert.equal(result.version,payload.expected_version+1);
      assert.equal('submittedAt'in result,false);assert.equal('contentModifiedAt'in result,false);
    });
    await mockFetch(()=>json({error:'stale review'},409),async()=>{await assert.rejects(manageDtmSubmissionReview(account,'save_dtm_submission_review',payload),statusIs(409));});
  }
});

const workspace=()=>({assignmentId:assignment,userId:owner,courseId:assignment,dueAt:null,maxBytes:dtmSubmissionMaxBytes,
  submission:{id:submission,user_id:owner,assignment_id:assignment,current_upload_id:upload,version:1},
  files:[{id:upload,filename:'Private synthetic name.txt',sizeBytes:0,contentType:'text/plain',path,state:'current',expiresAt:'2030-01-01T00:00:00Z',committedAt:'2030-01-01T00:00:00Z'}],reviews:[]});
test('dedicated workspace validates caller scope, singleton current files and null versus zero',async()=>{
  const value=workspace();await mockFetch(()=>json(value),async()=>{
    const data=await loadDtmSubmissionWorkspace(account,assignment);assert.deepEqual(data,value);assert.equal(data.files[0].sizeBytes,0);
  });
  for(const value of [{...workspace(),userId:other},{...workspace(),maxBytes:2*1024**3},{...workspace(),files:[...workspace().files,...workspace().files]},
    {...workspace(),files:[]},{...workspace(),files:[{...workspace().files[0],path:'https://example.invalid/private'}]},
    {...workspace(),reviews:[{user_id:other,submission_id:submission,upload_id:upload,status:'graded',grade_text:'P',feedback:null,version:1}]}])
    await mockFetch(()=>json(value),async()=>{await assert.rejects(loadDtmSubmissionWorkspace(account,assignment),statusIs(503));});
});

test('cleanup deletes only queued opaque paths through Storage, acknowledges successes, and retains failures',async()=>{
  const second=path.replace(upload,other),calls:Call[]=[];
  await mockFetch(call=>{calls.push(call);if(call.url.pathname.endsWith('cleanup_batch'))return json([{path},{path:second}]);if(call.method==='DELETE'){assert.ok(call.body);return (call.body.prefixes as string[])[0]===path?json([]):json({error:'temporary'},500);}return new Response(null,{status:204});},async()=>{
    assert.deepEqual(await cleanupDtmSubmissionUploads(account),{removed:1,remaining:1});
  });
  assert.deepEqual(calls.filter(call=>call.url.pathname.endsWith('cleanup_ack')).map(call=>call.body),[{p_path:path}]);
  assert.equal(calls.filter(call=>call.method==='DELETE').length,2);assert.ok(calls.every(call=>call.url.hostname==='xiftudmvxphxcjtmfmib.supabase.co'));
  for(const rows of [[{path:'../other'}],[{path},{path}],[{path,extra:true}],Array.from({length:6},()=>({path}))])
    await mockFetch(()=>json(rows),async()=>{await assert.rejects(cleanupDtmSubmissionUploads(account),statusIs(503));});
});

test('operation calls share one deadline and propagate the caller remaining time to AbortSignal',async()=>{
  const originalNow=Date.now,originalTimeout=AbortSignal.timeout,timeouts:number[]=[];let now=1000;
  Date.now=()=>now;AbortSignal.timeout=delay=>{timeouts.push(delay);return new AbortController().signal;};
  try{
    let calls=0;
    await mockFetch(call=>{calls++;if(call.url.pathname.endsWith('/dtm_submission_prepare')){now+=60;return json(prepared);}now+=50;return json(info);},async()=>{
      await assert.rejects(executeDtmSubmissionAction({...account,requestDeadline:1100},'commit_dtm_submission_upload',commit),statusIs(503));
    });assert.equal(calls,2,'Expired budget prevents the commit RPC.');assert.deepEqual(timeouts,[100,40]);
    calls=0;now=1000;timeouts.length=0;
    await mockFetch(call=>{calls++;if(call.url.pathname.endsWith('/dtm_submission_prepare')){now+=11000;return json(prepared);}now+=1001;return json(info);},async()=>{
      await assert.rejects(executeDtmSubmissionAction(account,'commit_dtm_submission_upload',commit),statusIs(503));
    });assert.equal(calls,2);assert.deepEqual(timeouts,[12000,1000],'Default budget is total, not12s per call.');
    await mockFetch(()=>{throw new Error('No request should start.');},async()=>{
      for(const requestDeadline of [now,now-1,NaN,Infinity])await assert.rejects(loadDtmSubmissionWorkspace({...account,requestDeadline},assignment),statusIs(503));
    });
  }finally{Date.now=originalNow;AbortSignal.timeout=originalTimeout;}
});

test('real abort signal bounds a stalled provider request without retrying after the deadline',async()=>{
  let calls=0;
  // Keep the event loop alive: AbortSignal.timeout deliberately uses an unref timer.
  const keepAlive=setTimeout(()=>{},1000);
  try{await mockFetch(call=>new Promise((_resolve,reject)=>{
    calls++;assert.ok(call.signal);call.signal.addEventListener('abort',()=>reject(new Error('aborted synthetic request')),{once:true});
  }),async()=>{
    await assert.rejects(loadDtmSubmissionWorkspace({...account,requestDeadline:Date.now()+30},assignment),statusIs(503));
  });assert.equal(calls,1);}finally{clearTimeout(keepAlive);}
});

test('cleanup has a5-path/8s total ceiling and leaves deleted-but-unacknowledged paths queued for retry',async()=>{
  const originalNow=Date.now,originalTimeout=AbortSignal.timeout,timeouts:number[]=[];let now=1000;
  const second=path.replace(upload,other),calls:Call[]=[];
  Date.now=()=>now;AbortSignal.timeout=delay=>{timeouts.push(delay);return new AbortController().signal;};
  try{
    await mockFetch(call=>{
      calls.push(call);if(call.url.pathname.endsWith('cleanup_batch')){assert.deepEqual(call.body,{p_limit:5});now+=5000;return json([{path},{path:second}]);}
      assert.equal(call.method,'DELETE');now+=4000;return json([]);
    },async()=>{assert.deepEqual(await cleanupDtmSubmissionUploads(account),{removed:0,remaining:2});});
    assert.equal(calls.length,2,'No ACK or second DELETE after the deadline.');assert.deepEqual(timeouts,[8000,3000]);
    now=1000;calls.length=0;timeouts.length=0;
    await mockFetch(call=>{calls.push(call);if(call.url.pathname.endsWith('cleanup_batch'))return json([{path},{path:second}]);return call.method==='DELETE'?json([]):new Response(null,{status:204});},async()=>{
      assert.deepEqual(await cleanupDtmSubmissionUploads({...account,requestDeadline:1500}),{removed:2,remaining:0});
    });assert.ok(timeouts.every(value=>value===500));assert.equal(calls.filter(call=>call.url.pathname.endsWith('cleanup_ack')).length,2);
  }finally{Date.now=originalNow;AbortSignal.timeout=originalTimeout;}
});

const signedPath='/object/sign/dtm-submissions/'+path+'?token=synthetic-download-capability';
test('saved-file download signs a60s attachment with the authorized caller JWT, using raw signedURL',async()=>{
  for(const actor of [account,{...account,user:{id:other},token:'synthetic-admin-token'}]){
    const calls:Call[]=[];
    await mockFetch(call=>{calls.push(call);return call.url.pathname.endsWith('/dtm_submission_workspace')?json(workspace()):json({signedURL:signedPath});},async()=>{
      const result=await createDtmSubmissionDownload(actor,assignment,upload),url=new URL(result.signedUrl);
      assert.equal(result.uploadId,upload);assert.equal(result.expiresIn,60);assert.deepEqual(Object.keys(result).sort(),['expiresIn','signedUrl','uploadId']);
      assert.equal(url.origin,account.url);assert.equal(url.pathname,'/storage/v1/object/sign/dtm-submissions/'+path);
      assert.equal(url.searchParams.get('download'),'Private synthetic name.txt');assert.equal(url.searchParams.get('token'),'synthetic-download-capability');
    });assert.equal(calls.length,2);assert.deepEqual(calls[0].body,{p_assignment_id:assignment});assert.deepEqual(calls[1].body,{expiresIn:60});
    assert.ok(calls.every(call=>call.headers.get('authorization')==='Bearer '+actor.token));
  }
  const retiredPath=`${owner}/${submission}/${other}`,archived=workspace();
  const archivedWorkspace={...archived,files:[...archived.files,{...archived.files[0],id:other,path:retiredPath,state:'retired'}],
    reviews:[{id:requestId,user_id:owner,submission_id:submission,upload_id:other,reviewed_by:owner,reviewed_at:stamp,status:'graded',grade_text:'P',feedback:null,version:1}]};
  await mockFetch(call=>call.url.pathname.endsWith('/dtm_submission_workspace')?json(archivedWorkspace):json({signedURL:`/object/sign/dtm-submissions/${retiredPath}?token=synthetic-archive`}),async()=>{
    const result=await createDtmSubmissionDownload(account,assignment,other);assert.equal(result.uploadId,other);assert.equal(result.expiresIn,60);
  });
});

test('download denies cross-account RPC failures, pending or unknown files and malformed signed capabilities',async()=>{
  let calls=0;await mockFetch(()=>{calls++;return json({error:'not authorized'},403);},async()=>{
    await assert.rejects(createDtmSubmissionDownload({...account,user:{id:other}},assignment,upload),statusIs(403));
  });assert.equal(calls,1,'Unauthorized workspace never reaches signing.');
  const pending={...workspace(),submission:{...workspace().submission,current_upload_id:null,version:0},files:[{...workspace().files[0],state:'pending',committedAt:null}]};
  for(const [value,id]of [[pending,upload],[workspace(),other]] as const){calls=0;await mockFetch(()=>{calls++;return json(value);},async()=>{
    await assert.rejects(createDtmSubmissionDownload(account,assignment,id),statusIs(404));
  });assert.equal(calls,1);}
  for(const response of [{signedUrl:signedPath},{signedURL:'https://example.invalid/private'},{signedURL:signedPath.replace(upload,other)},
    {signedURL:signedPath+'#unexpected'},{signedURL:signedPath+'&token=duplicate'},{signedURL:signedPath.replace('synthetic-download-capability','')}])
    await mockFetch(call=>call.url.pathname.endsWith('/dtm_submission_workspace')?json(workspace()):json(response),async()=>{
      await assert.rejects(createDtmSubmissionDownload(account,assignment,upload),statusIs(503));
    });
});

test('download and workspace authorization share a total caller deadline',async()=>{
  const originalNow=Date.now;let now=1000,calls=0;Date.now=()=>now;
  try{await mockFetch(()=>{calls++;now=1501;return json(workspace());},async()=>{
    await assert.rejects(createDtmSubmissionDownload({...account,requestDeadline:1500},assignment,upload),statusIs(503));
  });assert.equal(calls,1,'No signing request starts after the workspace lookup exhausted the caller deadline.');}
  finally{Date.now=originalNow;}
});

test('invalid payloads, configuration and provider bodies fail closed without remote requests or leaked response content',async()=>{
  let calls=0;await mockFetch(()=>{calls++;return json({});},async()=>{
    await assert.rejects(executeDtmSubmissionAction(account,'begin_dtm_submission_upload',{...begin,user_id:other}),statusIs(400));
    await assert.rejects(executeDtmSubmissionAction({...account,url:'https://unrelated.supabase.co'},'begin_dtm_submission_upload',begin),statusIs(401));
  });assert.equal(calls,0);
  await mockFetch(()=>new Response('<private provider response>',{status:200}),async()=>{
    await assert.rejects(executeDtmSubmissionAction(account,'begin_dtm_submission_upload',begin),error=>error instanceof DtmSubmissionError&&error.status===503&&!error.message.includes('private provider'));
  });
  await mockFetch(()=>{throw new Error('private network credential');},async()=>{
    await assert.rejects(executeDtmSubmissionAction(account,'begin_dtm_submission_upload',begin),error=>error instanceof DtmSubmissionError&&error.status===503&&!error.message.includes('credential'));
  });
});

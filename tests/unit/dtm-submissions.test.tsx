import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDtmSubmissionsClient,DtmSubmissionClientError,DtmSubmissionSession,dtmSubmissionDetailReport,parseDtmSubmissionWorkspace,
  type DtmSubmissionAssignment,type DtmSubmissionBegin,type DtmSubmissionChange,type DtmSubmissionFile,type DtmSubmissionReceipt,
  type DtmSubmissionReservation,type DtmSubmissionsClient,type DtmSubmissionWorkspaceData} from '../../src/services/dtmSubmissions';
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const aid='33333333-3333-4333-8333-333333333333',cid='44444444-4444-4444-8444-444444444444',sid='55555555-5555-4555-8555-555555555555';
const now='2026-11-13T00:00:00Z',later='2026-11-14T00:00:00Z',origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const assignment:DtmSubmissionAssignment={id:aid,userId:uid,courseId:cid,title:'Synthetic assignment'};
const newFile=()=>new File(['synthetic'],'synthetic.txt',{type:'text/plain'});
const empty=():DtmSubmissionWorkspaceData=>({assignmentId:aid,userId:uid,courseId:cid,dueAt:null,maxBytes:10485760,submission:null,files:[],reviews:[]});
const conflict=()=>new DtmSubmissionClientError('Synthetic conflict',409);
const uncertain=()=>new DtmSubmissionClientError('Synthetic uncertain response',503,true);
function model(){
  let data=empty(),serial=0;
  const calls:{kind:string;payload:unknown}[]=[],begins=new Map<string,DtmSubmissionReservation>(),receipts=new Map<string,DtmSubmissionReceipt>(),uploaded=new Set<string>();
  const controls={beginAfter:false,uploadAfter:false,uploadBefore:false,commitAfter:false,cancelAfter:false,loadFailures:0,abortUpload:null as (()=>void)|null};
  const clone=()=>structuredClone(data);
  const client:DtmSubmissionsClient={
    async load(_assignment,signal){signal.throwIfAborted();if(controls.loadFailures){controls.loadFailures--;throw uncertain();}return clone();},
    async begin(payload,signal){signal.throwIfAborted();calls.push({kind:'begin',payload:{...payload}});
      const prior=begins.get(payload.request_id);if(prior)return prior;
      if(payload.expected_version!==(data.submission?.version??0)||data.files.some(row=>row.state==='pending'))throw conflict();
      const uploadId='66666666-6666-4666-8666-'+String(++serial).padStart(12,'0');
      const result:DtmSubmissionReservation={kind:'begin_dtm_submission_upload',assignmentId:aid,submissionId:sid,uploadId,version:payload.expected_version,bucket:'dtm-submissions',path:`${uid}/${sid}/${uploadId}`,expiresAt:later,maxBytes:10485760};
      data.submission??={id:sid,currentUploadId:null,version:0,submittedAt:null,modifiedAt:null,dueAtAtSubmission:null};
      data.files.push({id:uploadId,filename:payload.filename,sizeBytes:payload.size_bytes,contentType:payload.content_type,path:result.path,state:'pending',expiresAt:later,committedAt:null});
      begins.set(payload.request_id,result);if(controls.beginAfter){controls.beginAfter=false;throw uncertain();}return result;
    },
    async upload(reservation,_file,signal){signal.throwIfAborted();calls.push({kind:'upload',payload:reservation.uploadId});
      if(controls.abortUpload){controls.abortUpload();return;}
      if(controls.uploadBefore){controls.uploadBefore=false;throw uncertain();}
      uploaded.add(reservation.uploadId);if(controls.uploadAfter){controls.uploadAfter=false;throw uncertain();}
    },
    async commit(payload,signal){signal.throwIfAborted();calls.push({kind:'commit',payload:{...payload}});
      const prior=receipts.get(payload.request_id);if(prior)return prior;
      const pending=data.files.find(row=>row.id===payload.upload_id&&row.state==='pending');
      if(!pending||!uploaded.has(payload.upload_id)||payload.expected_version!==data.submission?.version)throw conflict();
      pending.state='current';pending.committedAt=now;data.files=[pending];data.submission={id:sid,currentUploadId:pending.id,version:payload.expected_version+1,submittedAt:now,modifiedAt:now,dueAtAtSubmission:null};
      const receipt={kind:'commit_dtm_submission_upload',assignmentId:aid,submissionId:sid,uploadId:pending.id,version:payload.expected_version+1,submittedAt:now,contentModifiedAt:now};
      receipts.set(payload.request_id,receipt);if(controls.commitAfter){controls.commitAfter=false;controls.loadFailures=2;throw uncertain();}return receipt;
    },
    async cancel(payload,signal){signal.throwIfAborted();calls.push({kind:'cancel',payload:{...payload}});
      const prior=receipts.get(payload.request_id);if(prior)return prior;
      if(!data.files.some(row=>row.id===payload.upload_id&&row.state==='pending')||payload.expected_version!==data.submission?.version)throw conflict();
      data.files=data.files.filter(row=>row.id!==payload.upload_id);
      const receipt={kind:'cancel_dtm_submission_upload',assignmentId:aid,submissionId:sid,uploadId:payload.upload_id,version:payload.expected_version,cancelled:true};
      receipts.set(payload.request_id,receipt);if(controls.cancelAfter){controls.cancelAfter=false;throw uncertain();}return receipt;
    },
    async download(_assignment,_file,signal){signal.throwIfAborted();return new Blob(['synthetic']);},
    async review(){throw new Error('Review is not part of the student controller.');},
  };
  return {client,calls,controls,state:clone,replace:(next:DtmSubmissionWorkspaceData)=>{data=structuredClone(next);}};
}
function raw(data:DtmSubmissionWorkspaceData){return {...data,submission:data.submission&&{id:data.submission.id,user_id:uid,assignment_id:aid,course_id:cid,current_upload_id:data.submission.currentUploadId,
  version:data.submission.version,submitted_at:data.submission.submittedAt,content_modified_at:data.submission.modifiedAt,due_at_at_submission:data.submission.dueAtAtSubmission,source_mode:'local_submission'},reviews:[]};}

test('transport uses exact existing endpoints and caller JWT, immutable direct bytes, and scoped transient downloads',async()=>{
  const requests:{url:string;init:RequestInit}[]=[],m=model(),signal=new AbortController().signal;
  const payload:DtmSubmissionBegin={assignment_id:aid,request_id:crypto.randomUUID(),expected_version:0,filename:'synthetic.txt',size_bytes:9,content_type:'text/plain'};
  const reservation=await m.client.begin(payload,signal);await m.client.upload(reservation,newFile(),signal);await m.client.commit({assignment_id:aid,request_id:crypto.randomUUID(),expected_version:0,upload_id:reservation.uploadId},signal);
  const client=createDtmSubmissionsClient(uid,{storageUrl:origin,publishableKey:'synthetic-publishable-key',getSession:async()=>({userId:uid,accessToken:'synthetic-token'}),fetch:async(input,init)=>{
    const url=String(input);requests.push({url,init:init!});
    if(url.includes('scope=dtm-submission-download'))return Response.json({uploadId:reservation.uploadId,expiresIn:60,signedUrl:origin+'/storage/v1/object/sign/dtm-submissions/'+reservation.path+'?token=synthetic&download=synthetic.txt'});
    if(url.includes('/object/sign/'))return new Response('synthetic');
    if(url.includes('/object/dtm-submissions/'))return Response.json({ok:true});
    if(url==='/api/affairs-action')return Response.json(reservation);
    if(url==='/api/affairs-manage'){const body=JSON.parse(init!.body as string);assert.equal(body.kind,'save_dtm_submission_review');return Response.json({kind:body.kind,assignmentId:aid,submissionId:sid,uploadId:reservation.uploadId,version:1,reviewId:crypto.randomUUID()});}
    return Response.json(raw(m.state()));
  }});
  const loaded=await client.load(assignment,signal);assert.equal(loaded.files[0].filename,'synthetic.txt');
  assert.deepEqual(await client.begin(payload,signal),reservation);await client.upload(reservation,newFile(),signal);
  const bytes=await client.download(assignment,loaded.files[0],signal);assert.equal(await bytes.text(),'synthetic');
  await client.review({assignment_id:aid,request_id:crypto.randomUUID(),expected_version:0,upload_id:reservation.uploadId,status:'graded',grade_text:'0',feedback:null},signal);
  assert.ok(requests.some(row=>row.url==='/api/affairs-data?scope=dtm-submission&assignment_id='+aid));
  const upload=requests.find(row=>row.url.includes('/object/dtm-submissions/'))!;assert.equal((upload.init.headers as Record<string,string>)['x-upsert'],'false');assert.equal(upload.init.body instanceof File,true);
  for(const request of requests.filter(row=>!row.url.includes('/object/sign/')))assert.equal((request.init.headers as Record<string,string>).Authorization,'Bearer synthetic-token');
  assert.equal(requests.find(row=>row.url.includes('/object/sign/'))!.init.headers,undefined);assert.ok(requests.every(row=>!row.url.includes('cleanup')));
});

test('transport rejects account changes, foreign records, malformed revisions and arbitrary signed URLs before fetching private bytes',async()=>{
  const signal=new AbortController().signal;let calls=0;
  const client=createDtmSubmissionsClient(uid,{getSession:async()=>({userId:other,accessToken:'secret'}),fetch:async()=>{calls++;return Response.json({});}});
  await assert.rejects(()=>client.load(assignment,signal),error=>error instanceof DtmSubmissionClientError&&error.status===401);assert.equal(calls,0);
  assert.throws(()=>parseDtmSubmissionWorkspace({...raw(empty()),userId:other},assignment));
  assert.throws(()=>parseDtmSubmissionWorkspace({...raw(empty()),files:[{id:crypto.randomUUID(),filename:'PRIVATE.txt'}]},assignment));
  const file:DtmSubmissionFile={id:crypto.randomUUID(),filename:'synthetic.txt',sizeBytes:9,contentType:'text/plain',path:'',state:'current',expiresAt:later,committedAt:now};file.path=`${uid}/${sid}/${file.id}`;
  const bad=createDtmSubmissionsClient(uid,{storageUrl:origin,publishableKey:'synthetic-publishable-key',getSession:async()=>({userId:uid,accessToken:'secret'}),fetch:async()=>{calls++;return Response.json({uploadId:file.id,expiresIn:60,signedUrl:'https://unrelated.invalid/private?token=SECRET'});}});
  await assert.rejects(()=>bad.download(assignment,file,signal));assert.equal(calls,1);
});

test('empty/null and explicit zero review values remain separate from tracker status, due-date and previous revisions',()=>{
  const data=empty();assert.equal(dtmSubmissionDetailReport(assignment,data).timingText,null);
  const file:DtmSubmissionFile={id:crypto.randomUUID(),filename:'synthetic.txt',sizeBytes:0,contentType:'text/plain',path:'',state:'current',expiresAt:later,committedAt:now};file.path=`${uid}/${sid}/${file.id}`;
  data.files=[file];data.submission={id:sid,currentUploadId:file.id,version:1,submittedAt:now,modifiedAt:now,dueAtAtSubmission:null};
  const source={...raw(data),reviews:[{id:crypto.randomUUID(),user_id:uid,submission_id:sid,upload_id:file.id,status:'graded',grade_text:'0',feedback:null,version:1,reviewed_at:now}]};
  const parsed=parseDtmSubmissionWorkspace(source,assignment);assert.equal(parsed.files[0].sizeBytes,0);assert.equal(parsed.reviews[0].gradeText,'0');
  const report=dtmSubmissionDetailReport(assignment,parsed);assert.equal(report.modifiedAt,now);assert.equal(report.timingText,null);assert.equal(report.excellentWorkText,null);assert.equal(report.gradingAppearance,null);
});

test('successful save and download operate on the explicit current revision, without mutating a tracker',async()=>{
  const m=model(),session=new DtmSubmissionSession(assignment,m.client);await session.refresh();await session.choose(newFile());
  assert.equal(await session.save(),true);assert.equal(session.getSnapshot().file,null);assert.equal(session.getSnapshot().workspace?.submission?.version,1);
  const result=await session.download(m.state().files[0].id);assert.equal(await result?.blob.text(),'synthetic');
  assert.deepEqual(m.calls.map(row=>row.kind),['begin','upload','commit']);session.dispose();
});

for(const received of [true,false])test('uncertain upload '+(received?'with':'without')+' stored bytes probes the same commit before immutable retry',async()=>{
  const m=model(),session=new DtmSubmissionSession(assignment,m.client),file=newFile();await session.refresh();await session.choose(file);
  if(received)m.controls.uploadAfter=true;else m.controls.uploadBefore=true;
  assert.equal(await session.save(),undefined);assert.equal(session.getSnapshot().file,file);
  assert.equal(await session.save(),true);assert.equal(m.calls.filter(row=>row.kind==='begin').length,1);
  assert.equal(m.calls.filter(row=>row.kind==='upload').length,received?1:2);
  const commits=m.calls.filter(row=>row.kind==='commit').map(row=>row.payload as DtmSubmissionChange);assert.ok(commits.every(row=>row.request_id===commits[0].request_id));
  session.dispose();
});

test('lost commit response plus failed reconciliation retains file and IDs for durable replay',async()=>{
  const m=model(),session=new DtmSubmissionSession(assignment,m.client),file=newFile();await session.refresh();await session.choose(file);m.controls.commitAfter=true;
  assert.equal(await session.save(),undefined);assert.equal(session.getSnapshot().file,file);assert.equal(await session.save(),true);
  const commits=m.calls.filter(row=>row.kind==='commit').map(row=>row.payload as DtmSubmissionChange);assert.equal(commits.length,2);assert.equal(commits[0].request_id,commits[1].request_id);
  assert.equal(m.calls.filter(row=>row.kind==='upload').length,1);session.dispose();
});

test('409 preserves selection and blocks automatic rebase until explicit reload',async()=>{
  const m=model(),session=new DtmSubmissionSession(assignment,m.client),file=newFile();await session.refresh();await session.choose(file);m.controls.uploadBefore=true;await session.save();
  const different=m.state(),replacementId=crypto.randomUUID();different.submission={id:sid,version:1,currentUploadId:replacementId,submittedAt:now,modifiedAt:now,dueAtAtSubmission:null};
  different.files=[{...different.files[0],id:replacementId,path:`${uid}/${sid}/${replacementId}`,state:'current',committedAt:now}];m.replace(different);
  await session.save();assert.equal(session.getSnapshot().requiresReload,true);assert.equal(session.getSnapshot().file,file);
  await session.save();assert.equal(m.calls.filter(row=>row.kind==='begin').length,1);
  await session.refresh();assert.equal(session.getSnapshot().file,file);assert.equal(await session.save(),true);
  const begins=m.calls.filter(row=>row.kind==='begin').map(row=>row.payload as DtmSubmissionBegin);assert.equal(begins[1].expected_version,1);assert.notEqual(begins[0].request_id,begins[1].request_id);session.dispose();
});

test('cancel and unchanged cancellation retry remove only pending selection and preserve the saved revision',async()=>{
  const m=model(),session=new DtmSubmissionSession(assignment,m.client);await session.refresh();await session.choose(newFile());await session.save();const saved=m.state().submission!.currentUploadId;
  await session.choose(newFile());m.controls.uploadBefore=true;await session.save();m.controls.cancelAfter=true;
  assert.equal(await session.cancel(),undefined);assert.ok(session.getSnapshot().file);assert.equal(await session.cancel(),true);
  const cancels=m.calls.filter(row=>row.kind==='cancel').map(row=>row.payload as DtmSubmissionChange);assert.equal(cancels[0].request_id,cancels[1].request_id);
  assert.equal(m.state().submission!.currentUploadId,saved);assert.equal(session.getSnapshot().file,null);session.dispose();
});

for(const action of ['cancel','choose'] as const)test(action+' reconciles a terminal pending reservation without changing the saved current revision',async()=>{
  const m=model(),session=new DtmSubmissionSession(assignment,m.client);await session.refresh();await session.choose(newFile());await session.save();
  const saved=structuredClone(m.state().submission);await session.choose(newFile());m.controls.uploadBefore=true;await session.save();
  const expired=m.state();expired.files=expired.files.filter(row=>row.state!=='pending');m.replace(expired);
  // Applied SQL omits expired/cancelled reservations from workspace and returns
  // 409 for attempts to cancel them; there is no cancellation receipt to replay.
  const replacement=new File(['replacement'],'replacement.txt',{type:'text/plain'});
  if(action==='cancel')assert.equal(await session.cancel(),true);else await session.choose(replacement);
  assert.deepEqual(m.state().submission,saved);assert.deepEqual(session.getSnapshot().workspace?.submission,saved);
  assert.equal(session.getSnapshot().file,action==='cancel'?null:replacement);assert.equal(session.getSnapshot().error,'');
  assert.equal(m.calls.filter(row=>row.kind==='cancel').length,1);assert.equal(m.calls.filter(row=>row.kind==='begin').length,2);
  if(action==='choose'){assert.equal(await session.save(),true);assert.equal(m.calls.filter(row=>row.kind==='begin').length,3);}
  session.dispose();
});

test('a restored pending reservation that expires after reload can be cancelled without a File or saved-file deletion',async()=>{
  const m=model(),old=new DtmSubmissionSession(assignment,m.client);await old.refresh();await old.choose(newFile());m.controls.uploadBefore=true;await old.save();old.dispose();
  const session=new DtmSubmissionSession(assignment,m.client);await session.refresh();const prior=structuredClone(m.state().submission);
  const expired=m.state();expired.files=[];m.replace(expired);
  assert.equal(await session.cancel(),true);assert.equal(session.getSnapshot().file,null);assert.equal(session.getSnapshot().error,'');assert.deepEqual(m.state().submission,prior);
  assert.equal(m.calls.filter(row=>row.kind==='cancel').length,1);session.dispose();
});

test('failed or cross-account cancellation reconciliation retains selected file and the same retry ID',async()=>{
  for(const failure of ['failed','cross-account'] as const){
    const m=model(),session=new DtmSubmissionSession(assignment,m.client),file=newFile();await session.refresh();await session.choose(file);m.controls.uploadBefore=true;await session.save();
    const expired=m.state();expired.files=[];m.replace(failure==='cross-account'?{...expired,userId:other}:expired);
    if(failure==='failed')m.controls.loadFailures=1;
    assert.equal(await session.cancel(),undefined);assert.equal(session.getSnapshot().file,file);
    assert.equal(session.getSnapshot().workspace?.userId,uid);m.replace(expired);
    assert.equal(await session.cancel(),true);const cancels=m.calls.filter(row=>row.kind==='cancel').map(row=>row.payload as DtmSubmissionChange);
    assert.equal(cancels.length,2);assert.equal(cancels[0].request_id,cancels[1].request_id);assert.equal(session.getSnapshot().file,null);session.dispose();
  }
});

test('reload does not pretend a pending filename restores its File; replacement first cancels the previous reservation',async()=>{
  const m=model(),old=new DtmSubmissionSession(assignment,m.client);await old.refresh();await old.choose(newFile());m.controls.uploadBefore=true;await old.save();old.dispose();
  const session=new DtmSubmissionSession(assignment,m.client);await session.refresh();assert.equal(session.getSnapshot().file,null);assert.match(session.getSnapshot().error,/重新選擇/);
  await session.save();assert.equal(m.calls.filter(row=>row.kind==='commit').length,0);
  const replacement=newFile();await session.choose(replacement);assert.equal(session.getSnapshot().file,replacement);assert.equal(m.calls.at(-1)?.kind,'cancel');
  await session.save();assert.equal(m.calls.filter(row=>row.kind==='begin').length,2);session.dispose();
});

test('account disposal aborts in-flight transport and prevents commit, state restoration and downloads',async()=>{
  const m=model(),session=new DtmSubmissionSession(assignment,m.client);await session.refresh();await session.choose(newFile());m.controls.abortUpload=()=>session.dispose();
  assert.equal(await session.save(),undefined);assert.equal(session.active,false);assert.equal(session.getSnapshot().workspace,null);assert.equal(session.getSnapshot().file,null);
  assert.equal(m.calls.filter(row=>row.kind==='commit').length,0);assert.equal(await session.download(crypto.randomUUID()),undefined);
});

test('uncertain begin recovers the same reservation and cancelling after a concurrent commit shows the saved revision',async()=>{
  const m=model(),session=new DtmSubmissionSession(assignment,m.client),file=newFile();await session.refresh();await session.choose(file);m.controls.beginAfter=true;
  await session.save();assert.equal(session.getSnapshot().file,file);assert.equal(m.calls.filter(row=>row.kind==='upload').length,0);
  m.controls.uploadAfter=true;await session.save();
  const begins=m.calls.filter(row=>row.kind==='begin').map(row=>row.payload as DtmSubmissionBegin);assert.equal(begins.length,2);assert.equal(begins[0].request_id,begins[1].request_id);
  const pending=m.state().files.find(row=>row.state==='pending')!;
  await m.client.commit({assignment_id:aid,request_id:crypto.randomUUID(),expected_version:0,upload_id:pending.id},new AbortController().signal);
  assert.equal(await session.cancel(),true);assert.equal(m.state().submission?.currentUploadId,pending.id);assert.equal(session.getSnapshot().file,null);session.dispose();
});

test('a second save or choose cannot start another mutation while upload is in flight',async()=>{
  const m=model(),session=new DtmSubmissionSession(assignment,m.client),file=newFile();await session.refresh();await session.choose(file);
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),upload=m.client.upload;
  m.client.upload=async(...args)=>{await gate;return upload(...args);};
  const saving=session.save();await Promise.resolve();await Promise.resolve();
  assert.equal(session.getSnapshot().busy,true);assert.equal(await session.save(),undefined);await session.choose(new File(['other'],'other.txt',{type:'text/plain'}));
  assert.equal(session.getSnapshot().file,file);release();assert.equal(await saving,true);assert.equal(m.calls.filter(row=>row.kind==='begin').length,1);session.dispose();
});

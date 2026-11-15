import assert from 'node:assert/strict';
import test from 'node:test';
import {isSubmissionEvidenceQuestion,readSubmissionEvidence,type SubmissionEvidencePayload} from '../../server/accountSubmissionEvidence.js';

const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),foreign=id(2),courseId=id(10),assignmentId=id(20),submissionId=id(30),currentId=id(40),oldId=id(41),pendingId=id(42);
const stamp='2026-11-10T03:00:00.123456+00:00',earlier='2026-11-09T03:00:00Z',later='2026-11-11T03:00:00Z';
const account={user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',token:'synthetic-owner-token',key:'synthetic-public-key'};
const endpoint=account.url+'/rest/v1/rpc/dtm_submission_workspace';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const course=(n=10)=>({id:id(n),title:'Course '+n,code:'DB'+n,sourceMode:'personal',userId:owner});
const assignment=(n=20,parent=10,title='Reading response')=>({id:id(n),title,dtmCourseId:id(parent),sourceMode:'personal',userId:owner,status:'submitted',submittedAt:stamp});
const snapshot=()=>({profile:{userId:owner,role:'student'},officialUniversityData:false,assignments:[assignment()],dtm:{courses:[course()]}});
const file=(upload=currentId,state='current',committedAt:string|null=stamp)=>({id:upload,filename:upload===currentId?'current.txt':'old.txt',sizeBytes:0,contentType:'text/plain',path:`${owner}/${submissionId}/${upload}`,state,expiresAt:later,committedAt});
const review=(upload=currentId,n=50)=>({id:id(n),user_id:owner,submission_id:submissionId,upload_id:upload,status:'graded',grade_text:'0' as string|null,feedback:'Literal review' as string|null,reviewed_by:id(99),reviewed_at:later,version:1});
function workspace(){return {assignmentId,userId:owner,courseId,dueAt:later,maxBytes:10485760,
  submission:{id:submissionId,user_id:owner,assignment_id:assignmentId,course_id:courseId,current_upload_id:currentId as string|null,version:2,submitted_at:stamp as string|null,content_modified_at:stamp as string|null,due_at_at_submission:earlier as string|null,created_at:earlier,source_mode:'local_submission'},
  files:[file()],reviews:[review()]};}
const payload=(result:Awaited<ReturnType<typeof readSubmissionEvidence>>)=>JSON.parse(result.evidence.content) as SubmissionEvidencePayload;
const run=(value:unknown=workspace(),options:Partial<Parameters<typeof readSubmissionEvidence>[1]>={})=>readSubmissionEvidence(account,{snapshot:snapshot(),question:'Was my file uploaded for Reading response?',...options},{fetchImpl:async()=>json(value)});

test('all submission worker identities and selected row metadata are captured before any worker starts',async()=>{
  const caller={...account,user:{id:owner},requestDeadline:Date.now()+5000};
  const snap=snapshot();snap.dtm.courses.push(course(11),course(12));
  snap.assignments.push(assignment(21,11,'Second response'),assignment(22,12,'Third response'));
  const expected=snap.assignments.map(item=>({id:item.id,title:item.title,courseId:item.dtmCourseId,courseTitle:snap.dtm.courses.find(row=>row.id===item.dtmCourseId)!.title}));
  const calls:{id:string;token:string|null;key:string|null;url:string}[]=[];
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const dependencies:{fetchImpl:typeof fetch}={fetchImpl:async(url,init)=>{
    const selectedId=JSON.parse(String(init?.body)).p_assignment_id as string,headers=new Headers(init?.headers);
    calls.push({id:selectedId,token:headers.get('authorization'),key:headers.get('apikey'),url:String(url)});
    if(calls.length===1){
      // Mutation happens inside worker one, before worker two has even started.
      caller.user.id=foreign;caller.token='FOREIGN TOKEN';caller.key='FOREIGN KEY';caller.url='https://foreign.invalid';caller.requestDeadline=0;
      snap.profile.userId=foreign;
      for(const item of snap.assignments){item.id=id(800);item.title='MUTATED ASSIGNMENT';item.dtmCourseId=id(801);item.userId=foreign;item.sourceMode='sample';}
      for(const item of snap.dtm.courses){item.id=id(801);item.title='MUTATED COURSE';item.code='MUTATED CODE';item.userId=foreign;item.sourceMode='sample';}
      snap.assignments.length=0;snap.dtm.courses.length=0;
      dependencies.fetchImpl=async()=>{throw new Error('A later dependency must not replace this invocation\'s reader.');};
    }
    await gate;
    const selected=expected.find(row=>row.id===selectedId);
    return json({assignmentId:selectedId,userId:owner,courseId:selected?.courseId,dueAt:later,maxBytes:10485760,submission:null,files:[],reviews:[]});
  }};
  const pending=readSubmissionEvidence(caller,{snapshot:snap,question:'Show all my submission files.'},dependencies);
  release();
  const result=await pending,data=payload(result);
  assert.equal(result.readState,'ok');assert.equal(data.complete,true);
  assert.deepEqual(calls,expected.map(row=>({id:row.id,token:'Bearer '+account.token,key:account.key,url:endpoint})));
  assert.deepEqual(data.records.map(row=>({title:row.assignmentTitle,course:row.courseTitle,source:row.assignmentSourceMode,url:row.url})),expected.map(row=>({title:row.title,course:row.courseTitle,source:'personal',url:`/dtm/course/${row.courseId}/assignment/${row.id}`})));
  assert.equal(data.counts.available,3);assert.equal(data.counts.loaded,3);assert.doesNotMatch(result.evidence.content,/MUTATED|FOREIGN/);
});

test('mutating a caller during a submission response cannot authorize foreign workspace lineage',async()=>{
  const caller={...account,user:{id:owner}};
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const pending=readSubmissionEvidence(caller,{snapshot:snapshot(),question:'Was Reading response submitted?'},{fetchImpl:async()=>{
    await gate;
    const value=workspace();
    return json({...value,userId:foreign,submission:{...value.submission,user_id:foreign},files:value.files.map(row=>({...row,path:row.path.replace(owner,foreign)})),reviews:value.reviews.map(row=>({...row,user_id:foreign}))});
  }});
  caller.user.id=foreign;release();
  const result=await pending;
  assert.equal(result.readState,'unavailable');assert.equal(result.reason,'invalid_metadata');
  assert.equal(payload(result).records.length,0);assert.equal(payload(result).counts.unavailable,1);
  assert.doesNotMatch(result.evidence.content,/Literal review|current\.txt/);
});

test('submission intent covers English/Chinese and user followups without hijacking other service submissions',()=>{
  for(const [question,route] of [['Was my file uploaded?','/'],['Which revision was graded for my assignment?','/'],['我的作業繳交了嗎？','/'],['評語呢？',`/dtm/course/${courseId}/assignment/${assignmentId}`],['Is it submitted?','/dtm']])assert.equal(isSubmissionEvidenceQuestion(question,route),true,question);
  assert.equal(isSubmissionEvidenceQuestion('What about its feedback?','/',[{role:'user',content:'My Reading response assignment file'}]),true);
  assert.equal(isSubmissionEvidenceQuestion('Did I submit it?','/',[{role:'user',content:'My Reading response assignment file'}]),true);
  assert.equal(isSubmissionEvidenceQuestion('What about its feedback?','/',[{role:'assistant',content:'My assignment file'}]),false);
  for(const question of ['Was my scholarship application submitted?','Show my transcript grades','Write code for a file uploader','What is my next class?'])assert.equal(isSubmissionEvidenceQuestion(question,'/school-affairs'),false,question);
});

test('gradebook feedback does not mandate saved-file evidence from a Moodle or course location alone',()=>{
  for(const route of ['/dtm','/dtm/',`/dtm/course/${courseId}`]){
    for(const question of ['What feedback did I get on Quiz 1?','Show my Moodle grades.','What feedback did I receive?','Was it graded?','評語呢？','我的測驗評語是什麼？'])
      assert.equal(isSubmissionEvidenceQuestion(question,route),false,`${route}: ${question}`);
  }
  const history=[{role:'user',content:'Was my Reading response assignment file uploaded?'}];
  for(const question of ['What feedback did I get on Quiz 1?','What grade did I get on the final exam?','測驗一的評語是什麼？'])
    assert.equal(isSubmissionEvidenceQuestion(question,`/dtm/course/${courseId}/assignment/${assignmentId}`,history),false,question);
});

test('explicit files and submissions retain mandatory routing, with assignment-specific review context',()=>{
  for(const [question,route] of [
    ['Show my saved files.','/'],['Was my Quiz 1 file uploaded?','/dtm'],['Which revision of Quiz 1 was graded?','/dtm'],
    ['What feedback is saved for my assignment?','/'],['Show my homework grade.','/'],['我的作业评语是什么？','/'],
    ['What feedback did I receive?',`/dtm/course/${courseId}/assignment/${assignmentId}`],
    ['Was it graded?',`/dtm/course/${courseId}/assignment/${assignmentId}/edit?tab=review`],
    ['我的提交版本批改了嗎？','/dtm'],['Compare my Moodle tracker with its actual file review.','/dtm'],
  ])assert.equal(isSubmissionEvidenceQuestion(question,route),true,question);
  assert.equal(isSubmissionEvidenceQuestion('What about its feedback?','/dtm',[{role:'user',content:'My Reading response assignment'}]),true);
  assert.equal(isSubmissionEvidenceQuestion('評語呢？','/dtm',[{role:'user',content:'我的作業檔案'}]),true);
  assert.equal(isSubmissionEvidenceQuestion('What about its feedback?','/dtm',[{role:'user',content:'What is my Quiz 1 grade?'}]),false);
  assert.equal(isSubmissionEvidenceQuestion('What feedback did I receive?',`/dtm/course/${courseId}/assignment/not-an-id`),false);
});

test('explicit other-service submissions override DTM route and assignment history, while mixed requests retain DTM',()=>{
  const history=[{role:'user',content:'Was my Reading response assignment uploaded?'}];
  for(const question of ['Was my scholarship application submitted?','Was my leave application submitted?','Did my housing application file upload?','我的獎學金申請提交了嗎？'])
    assert.equal(isSubmissionEvidenceQuestion(question,'/dtm',history),false,question);
  assert.equal(isSubmissionEvidenceQuestion('Was my scholarship application submitted, and was my homework file uploaded?','/dtm',history),true);
});

test('one fixed read-only caller-JWT RPC produces local links and exact zero/null/provenance facts',async()=>{
  const calls:{url:string;body:unknown}[]=[];
  const result=await readSubmissionEvidence(account,{snapshot:snapshot(),question:'Was Reading response uploaded?'},{fetchImpl:async(url,init)=>{
    calls.push({url:String(url),body:JSON.parse(String(init?.body))});
    assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');
    const headers=new Headers(init?.headers);assert.equal(headers.get('authorization'),'Bearer synthetic-owner-token');assert.equal(headers.get('apikey'),'synthetic-public-key');
    return json(workspace());
  }});
  assert.deepEqual(calls,[{url:endpoint,body:{p_assignment_id:assignmentId}}]);
  assert.equal(result.readState,'ok');assert.equal(result.reason,null);assert.equal(result.evidence.id,'account:dtmSubmissions');
  const data=payload(result),record=data.records[0];
  assert.equal(record.url,`/dtm/course/${courseId}/assignment/${assignmentId}`);assert.equal(result.evidence.url,record.url);
  assert.equal(record.submission?.currentFile.sizeBytes,0);assert.equal(record.submission?.currentReview?.gradeText,'0');
  assert.equal(record.assignmentSourceMode,'personal');assert.equal(record.submission?.sourceMode,'local_submission');assert.equal(data.officialUniversityData,false);
  assert.equal(record.dueAt,later);assert.equal(record.submission?.dueAtAtSubmission,earlier);
  assert.deepEqual(data.counts,{available:1,selected:1,requested:1,loaded:1,included:1,omitted:0,unavailable:0});
});

test('current review is joined by current upload rather than array ordering or newest review',async()=>{
  const value=workspace();value.files.push(file(oldId,'retired',earlier));value.reviews=[{...review(oldId,51),grade_text:'OLD A+'},review()];value.reviews.reverse();
  const data=payload(await run(value));
  assert.equal(data.records[0].submission?.currentReview?.gradeText,'0');
  assert.equal(data.records[0].reviewedRetiredFiles[0].review.gradeText,'OLD A+');
  value.reviews=value.reviews.filter(row=>row.upload_id===oldId);
  const replacement=payload(await run(value));
  assert.equal(replacement.records[0].submission?.currentReview,null);assert.equal(replacement.records[0].reviewedRetiredFiles.length,1);
});

test('cleared reviews preserve null, empty feedback and independent submission version',async()=>{
  const value=workspace();value.reviews=[{...review(),status:'not_graded',grade_text:null,feedback:'',version:5}];
  const record=payload(await run(value)).records[0];
  assert.deepEqual(record.submission?.currentReview,{status:'not_graded',gradeText:null,feedback:'',reviewedAt:later});
  assert.equal(record.submission?.version,2);assert.equal(record.submission?.contentModifiedAt,stamp);
});

test('pending reservation never replaces saved file and does not establish committed bytes',async()=>{
  const value=workspace();value.files.push({...file(pendingId,'pending',null),filename:'next.txt'});
  const record=payload(await run(value)).records[0];
  assert.equal(record.submission?.currentFile.filename,'current.txt');assert.equal(record.pendingReservation?.state,'reserved_not_committed');
  const pendingOnly=workspace();pendingOnly.submission={...pendingOnly.submission,version:0,current_upload_id:null,submitted_at:null,content_modified_at:null,due_at_at_submission:null};
  pendingOnly.files=[file(pendingId,'pending',null)];pendingOnly.reviews=[];
  const pendingRecord=payload(await run(pendingOnly)).records[0];assert.equal(pendingRecord.submission,null);assert.ok(pendingRecord.pendingReservation);
});

test('null workspace submission is local absence even when tracker says submitted',async()=>{
  const value={...workspace(),submission:null,files:[],reviews:[]};
  const result=await run(value),data=payload(result);
  assert.equal(result.readState,'ok');assert.equal(data.records[0].submission,null);
  assert.match(data.rules,/Tracker submission status.*separate/);assert.match(data.rules,/no action or official university submission occurred/);
});

test('projection omits private paths, metadata IDs, reviewer identity, unknown fields and download capabilities',async()=>{
  const value={...workspace(),secret:'UNKNOWN_PRIVATE_SENTINEL',signedUrl:'https://private.invalid/capability'};
  const result=await run(value),wire=result.evidence.content;
  for(const secret of [owner,submissionId,currentId,id(99),'UNKNOWN_PRIVATE_SENTINEL','private.invalid','reviewed_by','upload_id','current_upload_id','path','synthetic-owner-token'])assert.equal(wire.includes(secret),false,secret);
  assert.equal(wire.includes(assignmentId),true);assert.equal(wire.includes(courseId),true);
});

test('malformed caller, mismatched snapshot and unowned explicit IDs reject before any request',async()=>{
  let calls=0;const fetchImpl:typeof fetch=async()=>{calls++;return json(workspace());};
  for(const caller of [{...account,url:'https://other.invalid'},{...account,token:''},{...account,user:{id:'not-a-uuid'}}])await assert.rejects(readSubmissionEvidence(caller,{snapshot:snapshot()},{fetchImpl}),TypeError);
  await assert.rejects(readSubmissionEvidence(account,{snapshot:{...snapshot(),profile:{userId:foreign}}},{fetchImpl}),TypeError);
  await assert.rejects(readSubmissionEvidence(account,{snapshot:snapshot(),assignmentIds:[id(500)]},{fetchImpl}),TypeError);
  await assert.rejects(readSubmissionEvidence(account,{snapshot:snapshot(),deadline:NaN},{fetchImpl}),TypeError);
  assert.equal(calls,0);
});

test('even an admin reads only owned snapshot assignments, never admin collections or mixed foreign rows',async()=>{
  const snap={...snapshot(),profile:{userId:owner,role:'admin'},admin:{assignments:[assignment(200,10,'PRIVATE ADMIN SENTINEL')]}};
  snap.assignments.push({...assignment(201,10,'FOREIGN PRIVATE SENTINEL'),userId:foreign});
  snap.dtm.courses.push({...course(99),userId:foreign});snap.assignments.push({...assignment(202,99,'UNOWNED COURSE SENTINEL'),userId:owner});
  const result=await run(workspace(),{snapshot:snap,question:'Show all my submissions.'});
  assert.equal(payload(result).counts.available,1);assert.doesNotMatch(result.evidence.content,/SENTINEL/);
});

test('strict workspace lineage, provenance, states and timestamps fail unknown instead of empty',async()=>{
  const variants=[
    {...workspace(),userId:foreign},{...workspace(),courseId:id(90)},
    {...workspace(),submission:{...workspace().submission,course_id:id(90)}},
    {...workspace(),submission:{...workspace().submission,source_mode:'official'}},
    {...workspace(),submission:{...workspace().submission,version:0}},
    {...workspace(),submission:{...workspace().submission,submitted_at:'2026-02-30T00:00:00Z'}},
    {...workspace(),submission:{...workspace().submission,content_modified_at:null}},
    {...workspace(),files:[{...file(),path:'foreign/path'}]},
    {...workspace(),files:[{...file(),sizeBytes:'0'}]},
    {...workspace(),files:[{...file(),committedAt:earlier}]},
    {...workspace(),files:[file(),file()]},
    {...workspace(),files:[file(),file(oldId,'retired',earlier)]},
    {...workspace(),reviews:[{...review(),user_id:foreign}]},
    {...workspace(),reviews:[{...review(),status:'not_graded',grade_text:'0'}]},
    {...workspace(),reviews:[{...review(),reviewed_at:'2020-01-01T00:00:00Z'}]},
    {...workspace(),files:[file(),file(pendingId,'pending',null)],reviews:[review(),review(pendingId,52)]},
    {...workspace(),submission:null},
  ];
  for(const value of variants){const result=await run(value);assert.equal(result.readState,'unavailable');assert.equal(result.reason,'invalid_metadata');const data=payload(result);assert.equal(data.counts.unavailable,1);assert.equal(data.complete,false);assert.equal(data.records.length,0);}
});

test('submission dates reject year zero and out-of-range offsets while preserving legitimate zoned instants',async()=>{
  for(const invalid of ['0000-01-01T00:00:00Z','2026-11-10T00:00:00+23:59','2026-11-10T00:00:00-23:59','2026-11-10T00:00:00+16:00']){
    const result=await run({...workspace(),dueAt:invalid});assert.equal(result.readState,'unavailable',invalid);assert.equal(result.reason,'invalid_metadata');
  }
  const result=await run({...workspace(),dueAt:'2026-11-10T11:00:00.123456+08:00'});
  assert.equal(result.readState,'ok');assert.equal(payload(result).records[0].dueAt,'2026-11-10T11:00:00.123456+08:00');
});

test('duplicate titles clarify; current exact assignment can disambiguate; named choice overrides an unrelated route',async()=>{
  const snap=snapshot();snap.dtm.courses.push(course(11));snap.assignments.push(assignment(21,11));
  let calls=0;
  const result=await readSubmissionEvidence(account,{snapshot:snap,question:'Was Reading response submitted?'},{fetchImpl:async()=>{calls++;return json(workspace());}});
  assert.equal(result.reason,'ambiguous_assignment');assert.equal(payload(result).selection.choices.length,2);assert.equal(calls,0);
  const chosen=await run(workspace(),{snapshot:snap,question:'Was Reading response submitted?',route:`/dtm/course/${courseId}/assignment/${assignmentId}`});assert.equal(chosen.readState,'ok');
  snap.assignments[1].title='Other response';
  const named=await run(workspace(),{snapshot:snap,question:'Was Reading response submitted?',route:`/dtm/course/${id(11)}/assignment/${id(21)}`});assert.equal(named.readState,'ok');assert.equal(payload(named).records[0].assignmentTitle,'Reading response');
});

test('unknown route or named UUID never triggers probing; explicit IDs select only their intended assignment',async()=>{
  let calls=0;
  for(const options of [{question:'Check file '+id(90)},{question:'Was it uploaded?',route:`/dtm/course/${courseId}/assignment/${id(90)}`}]){
    const result=await readSubmissionEvidence(account,{snapshot:snapshot(),...options},{fetchImpl:async()=>{calls++;return json(workspace());}});
    assert.equal(result.reason,'unknown_reference');assert.equal(result.readState,'unavailable');
  }
  assert.equal(calls,0);
  const result=await run(workspace(),{assignmentIds:[assignmentId,assignmentId],question:'an irrelevant title'});assert.equal(payload(result).counts.requested,1);
});

test('user followups retain the exact assignment and course code boundaries avoid prefix matches',async()=>{
  const snap=snapshot();snap.assignments.push(assignment(21,11,'Other response'));snap.dtm.courses.push(course(11));
  const followed=await run(workspace(),{snapshot:snap,question:'Did I submit it?',history:[{role:'user',content:'My Reading response assignment'},{role:'assistant',content:'Other response'}]});
  assert.equal(payload(followed).counts.selected,1);assert.equal(payload(followed).records[0].assignmentTitle,'Reading response');
  const matched=await run(workspace(),{snapshot:snap,question:'Check all assignments in DB10 for uploaded files.'});
  assert.equal(payload(matched).counts.selected,1);
  const changed=await run(workspace(),{snapshot:snap,question:'What about Reading response, is it submitted?',history:[{role:'user',content:'Other response assignment'}]});
  assert.equal(payload(changed).counts.selected,1);assert.equal(payload(changed).records[0].assignmentTitle,'Reading response');
});

test('all assignments overrides route and has max5 requests, concurrency2 and truthful cap/failure counts',async()=>{
  const snap=snapshot();snap.assignments=Array.from({length:8},(_,index)=>assignment(20+index,10,'Assignment '+index));
  let active=0,maxActive=0,calls=0;
  const result=await readSubmissionEvidence(account,{snapshot:snap,question:'What about all my assignments for saved files?',history:[{role:'user',content:'Was Assignment 0 submitted?'}],route:`/dtm/course/${courseId}/assignment/${assignmentId}`},{fetchImpl:async(_url,init)=>{
    const selected=JSON.parse(String(init?.body)).p_assignment_id;calls++;active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
    if(selected===id(22))return json({secret:'DO NOT EXPOSE'},503);
    return json({...workspace(),assignmentId:selected,submission:{...workspace().submission,assignment_id:selected}});
  }});
  assert.equal(result.readState,'partial');assert.equal(calls,5);assert.equal(maxActive,2);
  assert.deepEqual(payload(result).counts,{available:8,selected:8,requested:5,loaded:4,included:4,omitted:3,unavailable:1});
  assert.equal(payload(result).complete,false);assert.doesNotMatch(result.evidence.content,/DO NOT EXPOSE/);
});

test('an explicit all request is not narrowed by an included assignment or course example',async()=>{
  const snap=snapshot();snap.assignments.push(assignment(21,11,'Other response'));snap.dtm.courses.push(course(11));
  for(const question of ['Show all my submissions, including Reading response.','Show all my courses and their submissions, including DB10.']){
    let calls=0;
    const result=await readSubmissionEvidence(account,{snapshot:snap,question},{fetchImpl:async(_url,init)=>{
      calls++;const selected=JSON.parse(String(init?.body)).p_assignment_id,parent=selected===assignmentId?courseId:id(11);
      return json({...workspace(),assignmentId:selected,courseId:parent,submission:{...workspace().submission,assignment_id:selected,course_id:parent}});
    }});
    assert.equal(calls,2,question);assert.equal(payload(result).counts.selected,2);assert.equal(payload(result).selection.scope,'all_owned_assignments');
  }
});

test('empty owned selection is distinct from forbidden/provider failure and malformed data',async()=>{
  const snap=snapshot();snap.assignments=[];let calls=0;
  const empty=await readSubmissionEvidence(account,{snapshot:snap},{fetchImpl:async()=>{calls++;return json(workspace());}});
  assert.equal(empty.readState,'empty');assert.equal(calls,0);
  for(const status of [401,403,404,429,500]){const result=await readSubmissionEvidence(account,{snapshot:snapshot()},{fetchImpl:async()=>json({error:'PRIVATE ERROR'},status)});assert.equal(result.readState,'unavailable');assert.equal(payload(result).counts.loaded,0);assert.equal(payload(result).counts.unavailable,1);assert.doesNotMatch(result.evidence.content,/PRIVATE ERROR/);}
});

test('transport rejects redirected, nonJSON, invalidUTF8 and oversized declared/streamed JSON',async()=>{
  const redirects=json(workspace());Object.defineProperty(redirects,'redirected',{value:true});
  const target=json(workspace());Object.defineProperty(target,'url',{value:'https://other.invalid'});
  const variants=[redirects,target,new Response('<html>login</html>',{headers:{'Content-Type':'text/html'}}),
    new Response(new Uint8Array([0xff]),{headers:{'Content-Type':'application/json'}}),
    new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':String(128*1024+1)}}),
    new Response(' '.repeat(128*1024)+'{}',{headers:{'Content-Type':'application/json'}})];
  for(const response of variants){const result=await readSubmissionEvidence(account,{snapshot:snapshot()},{fetchImpl:async()=>response});assert.equal(result.readState,'unavailable');assert.equal(payload(result).records.length,0);}
});

test('past and stalled deadlines do not retry or start further provider requests',async()=>{
  let calls=0;
  const expired=await readSubmissionEvidence(account,{snapshot:snapshot(),deadline:Date.now()-1},{fetchImpl:async()=>{calls++;return json(workspace());}});
  assert.equal(expired.reason,'deadline_exceeded');assert.equal(calls,0);
  const start=Date.now();let signal:AbortSignal|null|undefined;
  const stalled=await readSubmissionEvidence(account,{snapshot:snapshot(),deadline:Date.now()+25},{fetchImpl:async(_url,init)=>{calls++;signal=init?.signal;return new Promise<Response>(()=>{});}});
  assert.equal(stalled.reason,'deadline_exceeded');assert.ok(Date.now()-start<1000);assert.equal(signal?.aborted,true);assert.equal(calls,1);
});

test('a submission timeout stops both workers from starting queued assignment reads',async t=>{
  const started=Date.now();
  t.mock.method(Date,'now',()=>started);
  t.mock.timers.enable({apis:['setTimeout']});
  const snap=snapshot();
  snap.assignments.push(assignment(21,10,'Second response'),assignment(22,10,'Third response'));
  const calls:string[]=[];
  const pending=readSubmissionEvidence(account,{snapshot:snap,deadline:started+30},{fetchImpl:async(_url,init)=>{
    calls.push(JSON.parse(String(init?.body)).p_assignment_id);
    return new Promise<Response>(()=>{});
  }});
  assert.deepEqual(calls,[assignmentId,id(21)]);
  t.mock.timers.tick(30);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[assignmentId,id(21)]);
  const result=await pending;
  assert.equal(result.reason,'deadline_exceeded');
  assert.deepEqual(payload(result).unavailable.map(row=>row.reason),Array(3).fill('deadline_exceeded'));
});

test('the inherited account deadline is honored before transport and wins over a later option deadline',async()=>{
  let calls=0;
  const fetchImpl:typeof fetch=async()=>{calls++;return json(workspace());};
  const expired=await readSubmissionEvidence({...account,requestDeadline:Date.now()-10},{snapshot:snapshot(),deadline:Date.now()+5000},{fetchImpl});
  assert.equal(expired.readState,'unavailable');assert.equal(expired.reason,'deadline_exceeded');assert.equal(calls,0);
  for(const requestDeadline of [NaN,Infinity,-Infinity])await assert.rejects(readSubmissionEvidence({...account,requestDeadline},{snapshot:snapshot()},{fetchImpl}),TypeError);
  assert.equal(calls,0);
  const started=Date.now();
  const stalled=await readSubmissionEvidence({...account,requestDeadline:Date.now()+25},{snapshot:snapshot(),deadline:Date.now()+5000},{fetchImpl:async()=>new Promise<Response>(()=>{})});
  assert.equal(stalled.reason,'deadline_exceeded');assert.ok(Date.now()-started<1000);
});

test('a stalled response body is bounded by the same overall deadline',async()=>{
  let cancelled=false;
  const result=await readSubmissionEvidence(account,{snapshot:snapshot(),deadline:Date.now()+25},{fetchImpl:async()=>new Response(new ReadableStream<Uint8Array>({pull(){return new Promise<void>(()=>{});},cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/json'}})});
  assert.equal(result.reason,'deadline_exceeded');assert.equal(cancelled,true);
});

test('retained history is bounded by whole joined file/review rows and records expose omitted counts',async()=>{
  const value=workspace();
  for(let n=0;n<9;n++){const upload=id(100+n);value.files.push(file(upload,'retired',earlier));value.reviews.push({...review(upload,200+n),feedback:'評'.repeat(2000)});}
  const result=await run(value),data=payload(result),record=data.records[0];
  assert.equal(result.readState,'partial');assert.ok(Buffer.byteLength(JSON.stringify(result))<=24000);
  assert.equal(record.reviewHistory.available,9);assert.equal(record.reviewHistory.included,record.reviewedRetiredFiles.length);assert.equal(record.reviewHistory.omitted,9-record.reviewHistory.included);
  for(const revision of record.reviewedRetiredFiles){assert.equal(revision.review.feedback,'評'.repeat(2000));assert.equal(revision.file.filename,'old.txt');}
  assert.equal(record.submission?.currentReview?.feedback,'Literal review');assert.equal(data.complete,false);
});

test('oversized combined current metadata drops whole assignments and reports evidence omissions',async()=>{
  const snap=snapshot();snap.assignments=Array.from({length:5},(_,index)=>assignment(20+index,10,'Assignment '+index));
  const result=await readSubmissionEvidence(account,{snapshot:snap,question:'Show all my assignments and uploaded file reviews.'},{fetchImpl:async(_url,init)=>{
    const selected=JSON.parse(String(init?.body)).p_assignment_id;
    return json({...workspace(),assignmentId:selected,submission:{...workspace().submission,assignment_id:selected},reviews:[{...review(),feedback:'\u0001'.repeat(2000)}]});
  }});
  const data=payload(result);assert.equal(result.readState,'partial');assert.equal(data.counts.loaded,5);assert.equal(data.counts.unavailable,0);assert.ok(data.counts.included<5);assert.equal(data.counts.omitted,5-data.counts.included);assert.ok(Buffer.byteLength(JSON.stringify(result))<=24000);
  for(const record of data.records)assert.equal(record.submission?.currentReview?.feedback,'\u0001'.repeat(2000));
});

test('the full envelope including double-escaped1700-character feedback stays within24KB',async()=>{
  const snap=snapshot();snap.assignments=Array.from({length:5},(_,index)=>assignment(20+index,10,'Assignment '+index));
  const result=await readSubmissionEvidence(account,{snapshot:snap,question:'Show all my submissions.'},{fetchImpl:async(_url,init)=>{
    const selected=JSON.parse(String(init?.body)).p_assignment_id;
    return json({...workspace(),assignmentId:selected,submission:{...workspace().submission,assignment_id:selected},reviews:[{...review(),feedback:'\u0001'.repeat(1700)}]});
  }});
  const data=payload(result);assert.ok(Buffer.byteLength(JSON.stringify(result))<=24000);assert.equal(result.readState,'partial');
  assert.equal(data.counts.loaded,5);assert.equal(data.counts.omitted,5-data.counts.included);assert.equal(data.counts.unavailable,0);
  for(const record of data.records)assert.equal(record.submission?.currentReview?.feedback,'\u0001'.repeat(1700));
});

import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';
import {clubAttendancePath} from '../../server/clubAttendanceIntent.js';
import {readAssistantReply} from '../../src/services/assistantStreamReader.js';
import {verifyProtectedNativeBrowserEgress} from './certificate-browser-turn.mjs';
import {discoverClientDispatchSurfaces} from './client-dispatch-inventory.mjs';
import {buildClubAttendancePlan,expectedClubAttendancePage} from './club-attendance-fixtures.mjs';
import {findClubAttendanceBrowserCase,verifiedClubAttendanceBrowserObservation} from './club-attendance-browser-preview.mjs';
import {certificateAwardPreviewHash} from './certificate-award-preview.mjs';
import {clubAttendanceBrowserBootstrap,clubAttendanceBrowserMark,clubAttendanceBrowserProfile,
  createProtectedClubAttendanceBrowserTurn} from './club-attendance-browser-turn.mjs';
import {createProtectedConversationBrowserRelay} from './vercel-preview-browser-transport.mjs';
import {previewTrustedHeader} from './vercel-preview-transport.mjs';

const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const origin='https://stdedu-abcd12345-v1-d286.vercel.app';
const sourceRevision='a'.repeat(40);
const key='synthetic-one-time-observation-test-key-not-a-credential';
const token='fixture-bearer';
const cases=(await discoverClientDispatchSurfaces()).questions.filter(row=>row.domain==='club-activity-attendance');
assert.deepEqual(cases.map(row=>row.mode),['record','multipart','empty','foreign','read-failure']);

function owner(label,empty=false){
  const ownerId=randomUUID(),studentId=randomUUID();
  const attendance={userId:ownerId,view:'my-attendance',page:1,eligible:false,hasMore:false,rows:empty?[]:[{
    id:randomUUID(),title:label+' Workshop',club_name:label+' Robotics Club',starts_at:'2026-11-13T10:10:00Z',
    location:label+' Laboratory',academic_year:115,term:1,recorded_at:'2026-11-14T08:22:00Z',
  }]};
  const read=(table,query,rows)=>({ownerId,method:'GET',url:project+'/rest/v1/'+table+'?'+new URLSearchParams(query),rows});
  const tuitionReads=[
    read('affairs_students',{select:'id,user_id',user_id:'eq.'+ownerId,limit:'1'},[{id:studentId,user_id:ownerId}]),
    read('affairs_charges',{
      select:'id,student_id,label,amount_due,amount_paid,currency,due_on,source_mode,occurrence_on,category,contact_unit,contact_extension,payment_unit',
      student_id:'eq.'+studentId,order:'occurrence_on.desc.nullslast,id.asc',limit:'500',offset:'0',
    },[{id:randomUUID(),student_id:studentId,label:label+' Tuition',category:'tuition',amount_due:'28000.00',amount_paid:'5000.00',
      currency:'TWD',source_mode:'verified',due_on:'2027-01-04',occurrence_on:'2026-11-13',contact_unit:null,contact_extension:null,payment_unit:null}]),
  ];
  return {ownerId,attendance,tuitionReads};
}

function setup(t,testCase){
  const readbacks={A:owner('Owner Studio'),B:owner('Crossed Sentinel',testCase.mode==='empty')};
  const caller=testCase.mode==='empty'?readbacks.B:readbacks.A;
  const scope={origin,sourceRevision,mode:testCase.mode,ownerId:caller.ownerId,runId:randomUUID()};
  const initial={question:testCase.question,route:testCase.route,history:[],images:[],stream:true};
  const create=(options={})=>createProtectedClubAttendanceBrowserTurn({testCase,scope,key,readbacks,...options});
  const reserve=(turn=create())=>turn.request({payload:initial,frameUrl:origin+testCase.route,ownerId:scope.ownerId});
  for(const [name,value] of Object.entries({VERCEL_ENV:'preview',VERCEL_URL:new URL(origin).host,
    VERCEL_GIT_COMMIT_SHA:sourceRevision,SUPABASE_SERVICE_ROLE_KEY:key})){
    const previous=process.env[name];
    process.env[name]=value;
    t.after(()=>{if(previous===undefined)delete process.env[name];else process.env[name]=previous;});
  }
  const reads=[];
  let wrongOwner=false,invalidTransport=false;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+token);
    assert.equal(init.redirect,'error');
    const url=new URL(input);
    assert.equal(url.origin,project);
    reads.push(url.pathname);
    if(url.pathname==='/rest/v1/rpc/affairs_read_club_student'){
      assert.equal(init.method,'POST');
      assert.deepEqual(JSON.parse(init.body),{p_view:'my-attendance',p_search:'',p_page:1});
      if(testCase.mode==='read-failure')
        return invalidTransport?Response.json({bad:true}):new Response(null,{status:503});
      return Response.json(caller.attendance);
    }
    const row=caller.tuitionReads.find(item=>item.url===url.href);
    assert.ok(row,'An unscoped or unrequested read reached PostgREST.');
    assert.equal(init.method,'GET');
    return Response.json(row.rows);
  });
  const unneeded=()=>assert.fail('Unexpected broad account data, model, or web search.');
  const handler=createAffairsAssistantHandler({verifyToken:async supplied=>{
    assert.equal(supplied,token);
    return {user:{id:wrongOwner?readbacks.B.ownerId:caller.ownerId,
      email:caller===readbacks.A?'evaluation.student@example.invalid':`evaluation.other.${scope.runId}@example.invalid`,
      user_metadata:{assistant_evaluation_run:scope.runId}},url:project,token,key:'publishable-test-key'};
  },loadSnapshot:unneeded,answerAccount:unneeded,publicResearch:unneeded});
  async function ask(body,host=new URL(origin).host){
    let status,output='',json;
    const headers=new Map();
    const sink={setHeader(name,value){headers.set(name.toLowerCase(),value);},status(code){status=code;return sink;},
      write(chunk){output+=chunk;},end(){},json(value){json=value;}};
    await handler({method:'POST',body,headers:{host,authorization:'Bearer '+token}},sink);
    return {status,bytes:Buffer.from(output),correlationId:headers.get('x-assistant-request-id'),json};
  }
  return {create,reserve,initial,readbacks,scope,ask,reads,caller,rejectOwner:()=>{wrongOwner=true;},
    invalidateTransport:()=>{invalidTransport=true;}};
}

function autosave(reply,question){
  const id='u-'+randomUUID();
  return {id:'12345678-1234-7123-8123-123456789012',title:question,version:0,
    messages:sanitizeStoredConversation([{id,role:'user',content:question,images:[]},{id:'a'+id.slice(1),
      role:'assistant',phase:'complete',content:reply.answer,result:reply,activity:reply.activity}])};
}

for(const testCase of cases)test('protected attendance SSE binds the independently observed read and save for '+testCase.mode,async t=>{
  const fixture=setup(t,testCase),turn=fixture.create();
  const response=await fixture.ask(fixture.reserve(turn));
  assert.equal(response.status,200);
  const forwarded=turn.receive(response);
  assert.match(forwarded.proofDigest,/^[a-f0-9]{64}$/u);
  assert.doesNotMatch(forwarded.body.toString(),/evaluation-club-attendance|fixture-bearer|synthetic-one-time/u);
  const activity=[];
  const reply=await readAssistantReply(new Response(forwarded.body,{headers:{'content-type':'text/event-stream'}}),step=>activity.push(step));
  assert.equal(activity.length>0,testCase.mode!=='foreign');
  const payload=autosave(reply,testCase.question);
  const saved=turn.save({payload,requestSequence:12});
  assert.equal(saved.answer,reply.answer);
  assert.throws(()=>turn.save({payload,requestSequence:12}),{code:'save-answer-mismatch'});
  const {version,...contents}=payload,updated_at='2026-11-16T07:10:05Z';
  const row={...contents,version:version+1,updated_at},savedRow={...row,created_at:updated_at};
  assert.throws(()=>turn.receiveRestore(row),{code:'save-receipt-mismatch'});
  assert.throws(()=>turn.receiveSave({...savedRow,version:2}),{code:'save-certificate-receipt-mismatch'});
  assert.equal(turn.receiveSave(savedRow).version,1);
  assert.throws(()=>turn.receiveRestore({...row,updated_at:'2026-11-16T07:10:07Z'}),{code:'save-certificate-receipt-mismatch'});
  assert.equal(turn.receiveRestore(row).id,payload.id);
  const matched=turn.confirmUnchanged(structuredClone(fixture.readbacks));
  assert.equal(matched.correlationId,response.correlationId);
  assert.equal(matched.caseId,testCase.id);
  assert.throws(()=>turn.confirmUnchanged({...fixture.readbacks,A:{...fixture.readbacks.A,
    attendance:{...fixture.readbacks.A.attendance,rows:[]}}}),{code:'save-answer-mismatch'});
  assert.equal(fixture.reads.filter(path=>path.endsWith('/affairs_read_club_student')).length,
    testCase.mode==='foreign'?0:testCase.mode==='read-failure'?2:1);
  assert.equal(fixture.reads.filter(path=>path.endsWith('/affairs_charges')).length,testCase.mode==='multipart'?1:0);
});

test('rejects a wrong preview, old request, wrong owner and widened ask before any graph reads',async t=>{
  const fixture=setup(t,cases[0]);
  const signed=fixture.reserve();
  for(const response of [await fixture.ask(signed,'stu.best'),
    await fixture.ask({...signed,question:signed.question+' Please.'}),await fixture.ask({...signed,history:[{role:'user',content:'foo'}]}),
    await fixture.ask(fixture.reserve(fixture.create({now:()=>Date.now()-121000}))),
    await fixture.ask({...signed,evaluationVenueProbe:'second probe'})]){
    assert.equal(response.status,404);assert.equal(response.bytes.length,0);
  }
  fixture.rejectOwner();
  assert.equal((await fixture.ask(signed)).status,404);
  assert.deepEqual(fixture.reads,[]);
});

test('rejects altered, repeated, and owner-mismatched receipts and transcripts',async t=>{
  const testCase=cases[1],fixture=setup(t,testCase),turn=fixture.create();
  const response=await fixture.ask(fixture.reserve(turn));
  const receipt=response.bytes.toString().match(/event: evaluation-club-attendance\ndata: [^\n]+\n\n/u)[0];
  for(const [bytes,correlationId] of [[Buffer.from(response.bytes.toString().replace('Owner Studio Workshop','Injected Workshop')),response.correlationId],
    [Buffer.from(response.bytes.toString().replace(receipt,'')),response.correlationId],
    [Buffer.from(response.bytes.toString().replace(receipt,receipt+receipt)),response.correlationId],
    [response.bytes,randomUUID()]]){
    assert.throws(()=>turn.receive({bytes,correlationId}),{code:'invalid-assistant-stream-result'});
  }
  const incorrect=structuredClone(fixture.readbacks);
  incorrect.A.attendance.rows[0].location='Unexpected Laboratory';
  const mismatched=fixture.create({readbacks:incorrect});
  assert.throws(()=>fixture.create({readbacks:{A:fixture.readbacks.B,B:fixture.readbacks.A}}),{code:'wrong-fixture-caller'});
  assert.throws(()=>turn.confirmUnchanged(fixture.readbacks),{code:'save-answer-mismatch'});
  assert.throws(()=>mismatched.receive(response),{code:'unexpected-application-response'});
  const observed=await fixture.ask(fixture.reserve(mismatched));
  assert.throws(()=>mismatched.receive(observed),{code:'save-answer-mismatch'});
  const forwarded=turn.receive(response);
  const reply=await readAssistantReply(new Response(forwarded.body,{headers:{'content-type':'text/event-stream'}}));
  const payload=autosave(reply,testCase.question);
  payload.messages[1].activity.pop();
  assert.throws(()=>turn.save({payload,requestSequence:12}),{code:'save-activity-mismatch'});
});

test('ordinary callers get no proof and malformed rows do not attest an unavailable transport',async t=>{
  const fixture=setup(t,cases.at(-1));
  fixture.invalidateTransport();
  const turn=fixture.create();
  const normal=await fixture.ask(fixture.initial),observed=await fixture.ask(fixture.reserve(turn));
  assert.equal(normal.status,200);assert.equal(observed.status,200);
  assert.doesNotMatch(normal.bytes.toString(),/evaluation-club-attendance/u);
  assert.doesNotMatch(observed.bytes.toString(),/evaluation-club-attendance/u);
  assert.throws(()=>turn.receive(observed),{code:'invalid-assistant-stream-result'});
});

test('browser SQL plans make empty B distinct from failure, retain owned A and keep every event private',()=>{
  const owners=[randomUUID(),randomUUID()],runId=randomUUID();
  for(const {mode} of cases){
    const plan=buildClubAttendancePlan({runId,owners,browserMode:mode});
    assert.equal(plan.browserMode,mode);
    assert.deepEqual(buildClubAttendancePlan(plan),plan);
    assert.equal(expectedClubAttendancePage(plan,owners[0],1).rows.length,25);
    assert.equal(expectedClubAttendancePage(plan,owners[1],1).rows.length,mode==='empty'?0:1);
    assert.ok(plan.clubs.every(club=>!club.active));
    assert.ok(plan.applications.every(application=>application.calendar_activity_id===null));
  }
  assert.throws(()=>buildClubAttendancePlan({runId,owners,browserMode:'staff'}),/could not be verified/u);
});

test('protected graph relay runs the real signed handler, journals one turn, and opens only its reserved transcript',async t=>{
  const testCase=cases[1],fixture=setup(t,testCase),turn=fixture.create(),ownerId=fixture.scope.ownerId;
  const epoch=Math.floor(Date.now()/1000),encode=claims=>['synthetic',Buffer.from(JSON.stringify(claims)).toString('base64url'),'signature'].join('.');
  const previewToken=encode({iss:'https://oidc.vercel.com/v1-d286',sub:'owner:v1-d286:project:std_edu_ai:environment:development',
    aud:'https://vercel.com/v1-d286',owner:'v1-d286',project:'std_edu_ai',environment:'development',nbf:epoch-2,exp:epoch+100});
  const auth=encode({sub:ownerId,iss:project+'/auth/v1',aud:'authenticated',role:'authenticated',exp:epoch+100});
  const id='12345678-1234-7123-8123-123456789012',updated_at='2026-11-16T07:10:05Z';
  const api='/api/affairs-assistant',conversations='/api/affairs-conversations';
  const trace=[];
  let stored,expectedSave;
  const relay=()=>createProtectedConversationBrowserRelay({origin,revision:sourceRevision,token:previewToken,
    ownerId,getCallerToken:()=>auth,profile:clubAttendanceBrowserProfile,graphTurn:turn,assets:[clubAttendanceBrowserMark],
    verifyPin:async()=>({origin,sourceRevision,manifest:{revision:sourceRevision,environment:'preview',source:'vercel-git'}}),
    async authorizeSave(input){trace.push('journal');assert.ok(input.expected);expectedSave=input.expected;return true;},
    async fetchImpl(url,init){
      assert.equal(new Headers(init.headers).get(previewTrustedHeader),previewToken);
      trace.push(url.pathname);
      const path=url.pathname+url.search;
      if(path===clubAttendancePath)return new Response('<html/>',{headers:{'content-type':'text/html'}});
      assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+auth);
      if(path===clubAttendanceBrowserBootstrap)return Response.json(fixture.caller.attendance);
      if(path===api){
        const signed=JSON.parse(init.body);
        assert.ok(signed.evaluationClubAttendanceProbe);
        const actual=await fixture.ask(signed);
        return new Response(actual.bytes,{status:actual.status,headers:{'content-type':'text/event-stream','x-assistant-request-id':actual.correlationId}});
      }
      if(path===conversations&&init.method==='POST'){
        assert.equal(trace.at(-2),'journal');
        stored={...JSON.parse(init.body),version:1,updated_at};
        return Response.json({...stored,created_at:updated_at});
      }
      if(path===conversations)return Response.json({conversations:stored?[{id,title:stored.title,version:1,updated_at}]:[]});
      assert.equal(path,conversations+'?id='+id);
      return Response.json(stored);
    },
  });
  const call=(dispatch,path,method='GET',body)=>dispatch({url:origin+path,method,frameUrl:origin+clubAttendancePath,
    headers:{...(path===clubAttendancePath?{}:{Authorization:'Bearer '+auth}),...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  const boot=async({dispatch})=>{
    await call(dispatch,clubAttendancePath);
    await call(dispatch,clubAttendanceBrowserBootstrap);
    await call(dispatch,conversations);
  };
  const live=relay();await boot(live);
  live.reserve({id,mode:'turn',route:testCase.route,question:testCase.question});
  const reply=await call(live.dispatch,api,'POST',fixture.initial);
  assert.doesNotMatch(reply.body.toString(),/evaluation-club-attendance/u);
  const terminal=await readAssistantReply(new Response(reply.body,{headers:{'content-type':'text/event-stream'}}));
  const save=await call(live.dispatch,conversations,'POST',autosave(terminal,testCase.question));
  assert.equal(save.clubAttendanceReceipt.id,id);
  assert.equal(verifyProtectedNativeBrowserEgress({evidence:live.egress(),mode:'turn',requestSequence:expectedSave.requestSequence,
    scope:clubAttendanceBrowserProfile,answerMethod:'POST'}).saveRequests,1);
  const fresh=relay();
  fresh.reserve({id,mode:'read',expected:{...expectedSave,updatedAt:updated_at}});
  await boot(fresh);
  const restored=await call(fresh.dispatch,conversations+'?id='+id);
  assert.equal(restored.clubAttendanceReceipt.version,1);
  assert.equal(verifyProtectedNativeBrowserEgress({evidence:fresh.egress(),mode:'restore',
    scope:clubAttendanceBrowserProfile,answerMethod:'POST'}).restoreRequests,1);
  assert.equal(turn.confirmUnchanged(fixture.readbacks).caseId,testCase.id);
  await assert.rejects(call(fresh.dispatch,api,'POST',fixture.initial),{code:'unreserved-assistant-turn-or-frame'});
  assert.equal(trace.filter(path=>path===api).length,1);
});

test('coverage requires pinned browser egress, unchanged records and verified absence after cleanup',async()=>{
  const question=await findClubAttendanceBrowserCase(cases[1].id),sha='c'.repeat(64);
  const report={origin,sourceRevision,execution:'live-browser',terminal:true,caseIds:[question.id],suiteDigest:certificateAwardPreviewHash([question]),
    liveAcceptance:true,browserDispatchAcceptance:true,modelAcceptance:false,
    browserDiagnostics:[{observations:[{request:clubAttendanceBrowserProfile+'-answer',method:'POST',forwarded:true}]}],
    deployment:{status:'finished',origin,sourceRevision,issued:6,completed:6},
    cleanup:{verified:true,createdUsers:2,protectedOwnerUnchanged:true,clubAttendanceBrowserCleanup:true,
      conversationCleanup:{verified:true,conversationRows:0}},
    results:[{caseId:question.id,passed:true,native:{passed:true,requestDigest:sha,responseDigest:sha},
      proofDigest:sha,scopeDigest:sha,requestDigest:sha,responseDigest:sha,before:sha,after:sha,
      browserTurn:{answerRequests:1,saveRequests:1},browserRestore:{restoreRequests:1},readback:{own:true,crossed:true,version:1,messageDigest:sha}}]};
  const assess=result=>verifiedClubAttendanceBrowserObservation({result,question,origin,sourceRevision});
  assert.equal(assess(report).passed,true);
  for(const mutate of [
    result=>{result.cleanup.conversationCleanup.conversationRows=1;},
    result=>{result.results[0].readback.crossed=false;},
    result=>{result.results[0].after='d'.repeat(64);},
    result=>{result.results[0].proofDigest=null;},
    result=>{result.deployment.completed=5;},
    result=>{result.browserDiagnostics[0].observations[0].method='GET';},
  ]){
    const changed=structuredClone(report);mutate(changed);
    assert.equal(assess(changed).passed,false);
  }
});

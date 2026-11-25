import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import confirm from '../../api/affairs-action.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {parseExplicitAccountAction} from '../../server/accountActionIntent.js';
import {answerDirectTuitionPayment} from '../../server/pendingFeesAnswer.js';

const owner='a9510000-0000-4000-8000-000000000001';
const foreign='a9510000-0000-4000-8000-000000000002';
const task='a9510000-0000-4000-8000-000000000011';
const student='a9510000-0000-4000-8000-000000000021';
const course='a9510000-0000-4000-8000-000000000031';
const assignment='a9510000-0000-4000-8000-000000000041';
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const token='synthetic-google-user-for-action-test';
const key='synthetic-publishable-action-test';
const routed=createAffairsAssistantHandler({
  verifyToken:async value=>{assert.equal(value,token);return {user:{id:owner},key,token,url:origin};},
  loadSnapshot:async()=>assert.fail('An action never loads the broad account snapshot.'),
  publicResearch:async()=>assert.fail('An action is not sent to public research.'),
  answerAccount:async()=>assert.fail('A requested action does not use the model planner.'),
});

async function invoke(handler:any,body:unknown){
  let statusCode=0,result:any;
  const response={status(status:number){statusCode=status;return response;},json(value:unknown){result=value;},setHeader(){}};
  await handler({method:'POST',headers:{authorization:'Bearer '+token,'x-forwarded-for':'192.0.2.187'},body},response);
  assert.equal(statusCode,200,JSON.stringify(result));
  return result;
}
function transport(t:TestContext,postgrest:(path:URL,request:RequestInit)=>Response){
  const calls:{url:URL;method:string;body:BodyInit|null|undefined}[]=[];
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{
    const url=new URL(String(input));
    assert.equal(url.origin,origin);
    const headers=new Headers(init.headers);
    assert.equal(headers.get('apikey'),key);
    assert.equal(headers.get('authorization'),'Bearer '+token);
    calls.push({url,method:init.method??'GET',body:init.body});
    return postgrest(url,init);
  });
  return calls;
}
const ask=(question:string)=>invoke(routed,{question,route:'/school-affairs/records'});

test('guidance, negation and another person’s display name never authorize a proposal',()=>{
  for(const text of [
    "Don't change my display name.",'Show me how to change my display name.','Change Alex’s display name to Alex.',
    'What if I create a task tomorrow?','Do not create a task titled Revised.',
    'How do I post an announcement?','Complete enrollment before midnight.','Call me when my next class begins.','Call me about my course tomorrow.','Mark A as submitted.',
  ])assert.equal(parseExplicitAccountAction(text),null,text);
  const mixed=parseExplicitAccountAction('Create a task titled Read chapter and delete my records');
  assert.equal(mixed?.ambiguous,true);
  for(const question of [
    'Change my display name to Casey, but don’t.',
    'Create a task titled Read notes, do not create it.',
    'Publish an announcement titled Reminder with body Practice starts at two. Do not publish this.',
    'Publish an announcement titled Reminder with body Practice starts at two and delete my records.',
    'Publish an announcement titled Reminder with body Practice starts at two. What are my grades?',
    'Publish an announcement titled Event reminder with body Practice starts at two if I approve it.',
    '請把我的暱稱改成Kelly等我同意再說',
  ])assert.equal(parseExplicitAccountAction(question)?.ambiguous,true,question);
  assert.equal(parseExplicitAccountAction('Publish an announcement titled Reminder with body “Practice starts at two. Do not publish your passwords.”')?.ambiguous,false);
  assert.deepEqual(parseExplicitAccountAction('Create a task titled “Do not forget the reading”'),{kind:'create_task',title:'Do not forget the reading',ambiguous:false});
});

test('task and nickname proposals preserve exact current input and do not write',async t=>{
  const calls=transport(t,url=>{
    assert.equal(url.pathname,'/rest/v1/affairs_profiles');
    assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
    if(url.searchParams.get('select')==='user_id')return Response.json([{user_id:owner}]);
    assert.equal(url.searchParams.get('select'),'user_id,preferred_name,display_name');
    return Response.json([{user_id:owner,preferred_name:'Saved nickname',display_name:'Provider name'}]);
  });
  const proposal=await ask('Create a task titled Review notes.');
  assert.equal(proposal.verification.status,'verified');
  assert.deepEqual(proposal.activity.filter((event:any)=>event.kind.startsWith('account-read:')).map((event:any)=>event.kind),['account-read:profile:1']);
  assert.deepEqual(proposal.proposedAction.payload,{title:'Review notes'});
  assert.equal(proposal.proposedAction.kind,'create_task');
  assert.match(proposal.proposedAction.requestId,/^[0-9a-f-]{36}$/u);
  assert.match(proposal.answer,/after you confirm/);
  const rename=await ask('請把我的暱稱改成小文');
  assert.deepEqual(rename.proposedAction.payload,{display_name:'小文',expected_name:'Saved nickname'});
  assert.equal(rename.verification.status,'verified');
  assert.ok(calls.every(row=>row.method==='GET'));
  assert.equal(calls.length,2);
});

test('a mixed action request asks for one change without reads',async t=>{
  const calls=transport(t,()=>assert.fail('Ambiguous action must not read records'));
  const reply=await ask('Create a task titled Review notes and then change my display name to Casey.');
  assert.equal(reply.status,'clarification');
  assert.match(reply.answer,/one change at a time/);
  assert.equal(reply.proposedAction,undefined);
  assert.equal(calls.length,0);
});

test('completing a task requires its exact open title in the caller account',async t=>{
  let mode='own';
  const calls=transport(t,url=>{
    if(url.pathname.endsWith('/affairs_profiles'))return Response.json([{user_id:owner}]);
    assert.equal(url.pathname,'/rest/v1/affairs_tasks');
    assert.equal(url.searchParams.get('title'),'eq.Read chapter');
    assert.equal(url.searchParams.get('completed_at'),'is.null');
    assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
    return Response.json(mode==='foreign'?[{id:task,user_id:foreign,title:'Read chapter',completed_at:null}]
      :mode==='duplicate'?[{id:task,user_id:owner,title:'Read chapter',completed_at:null},{id:student,user_id:owner,title:'Read chapter',completed_at:null}]
      :[{id:task,user_id:owner,title:'Read chapter',completed_at:null}]);
  });
  assert.deepEqual((await ask('Complete my task Read chapter.')).proposedAction.payload,{task_id:task});
  mode='duplicate';
  const ambiguous=await ask('Complete my task Read chapter.');
  assert.match(ambiguous.answer,/Which open stu.best task/);
  assert.equal(ambiguous.proposedAction,undefined);
  mode='foreign';
  const denied=await ask('Complete my task Read chapter.');
  assert.equal(denied.verification.attempts,2);
  assert.equal(denied.verification.status,'unverified');
  assert.equal(denied.proposedAction,undefined);
  assert.ok(calls.every(row=>row.method==='GET'));
});

test('the assignment tracker reads the caller’s student and personal course and binds its saved status',async t=>{
  let source='personal',status='open';
  const calls=transport(t,url=>{
    const table=url.pathname.split('/').at(-1);
    if(table==='affairs_profiles')return Response.json([{user_id:owner}]);
    if(table==='affairs_students')return Response.json([{id:student,user_id:owner}]);
    if(table==='affairs_assignments'){
      assert.equal(url.searchParams.get('student_id'),'eq.'+student);
      assert.equal(url.searchParams.get('title'),'eq.Lab reflection');
      return Response.json([{id:assignment,student_id:student,dtm_course_id:course,title:'Lab reflection',status,source_mode:'personal'}]);
    }
    assert.equal(table,'dtm_courses');
    assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
    assert.equal(url.searchParams.get('id'),'eq.'+course);
    return Response.json([{id:course,user_id:owner,source_mode:source}]);
  });
  const result=await ask('Mark my personal assignment Lab reflection as submitted.');
  assert.deepEqual(result.proposedAction.payload,{id:assignment,status:'submitted',expected_status:'open'});
  assert.equal(result.proposedAction.url,'/dtm/course/'+course+'/assignments');
  assert.match(result.answer,/personal tracker/);
  assert.equal(result.verification.status,'verified');
  status='submitted';
  const already=await ask('Mark my personal assignment Lab reflection as submitted.');
  assert.match(already.answer,/already has that status/);
  assert.equal(already.proposedAction,undefined);
  source='sample';
  const denied=await ask('Mark my personal assignment Lab reflection as submitted.');
  assert.equal(denied.proposedAction,undefined);
  assert.equal(calls.length,12);
  assert.ok(calls.every(row=>row.method==='GET'));
});

test('service requests keep supplied text, and announcement proposals require the saved admin role',async t=>{
  let role='student',canManage=false;
  const calls=transport(t,url=>{
    if(url.pathname==='/rest/v1/rpc/dtm_course_content_access')return Response.json({userId:owner,canManage});
    assert.equal(url.pathname,'/rest/v1/affairs_profiles');
    return Response.json([{user_id:owner,role}]);
  });
  const request=await ask('Create a general service request titled Library assistance with details Please restore access to my local library practice workspace.');
  assert.deepEqual(request.proposedAction.payload,{title:'Library assistance',details:'Please restore access to my local library practice workspace.',request_type:'general'});
  const publish='Publish an announcement titled Local event with body Our local student event starts at 14:00.';
  const denied=await ask(publish);
  assert.match(denied.answer,/administrator/);
  assert.equal(denied.proposedAction,undefined);
  role='admin';
  assert.equal((await ask(publish)).proposedAction,undefined);
  canManage=true;
  assert.deepEqual((await ask(publish)).proposedAction.payload,{title:'Local event',body:'Our local student event starts at 14:00.'});
  assert.equal(calls.length,6);
});

test('the graph retries the same read once and the confirmed endpoint sends the same operation ID on replay',async t=>{
  const before={url:process.env.VITE_SUPABASE_URL,key:process.env.VITE_SUPABASE_PUBLISHABLE_KEY};
  process.env.VITE_SUPABASE_URL=origin;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  t.after(()=>{
    if(before.url===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=before.url;
    if(before.key===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=before.key;
  });
  let reads=0;
  const writes:unknown[]=[];
  transport(t,(url,init)=>{
    if(url.pathname==='/rest/v1/affairs_profiles')return ++reads===1?new Response(null,{status:503}):Response.json([{user_id:owner}]);
    if(url.pathname==='/auth/v1/user')return Response.json({id:owner,identities:[{provider:'google'}]});
    assert.equal(url.pathname,'/rest/v1/rpc/affairs_reviewed_action');
    assert.equal(init.method,'POST');
    writes.push(JSON.parse(String(init.body)));
    return Response.json({kind:'create_task',id:task,summary:'Created task: Review notes'});
  });
  const checked=await ask('Create a task titled Review notes.');
  assert.deepEqual(checked.verification,{status:'verified',attempts:2});
  assert.deepEqual(writes,[]);
  const {kind,payload,requestId}=checked.proposedAction;
  for(let i=0;i<2;i++)assert.equal((await invoke(confirm,{kind,payload,requestId})).id,task);
  assert.deepEqual(writes,Array(2).fill({p_kind:kind,p_payload:payload,p_request_id:requestId}));
  assert.equal(reads,2);
});

test('a guest receives the local sign-in destination without an action or private account read',async t=>{
  const calls=transport(t,()=>assert.fail('Guest guidance uses no account reader'));
  const response=await invoke(createResearchAssistantHandler(),{question:'Create a task titled Review notes.',route:'/'});
  assert.equal(response.status,'handoff');
  assert.equal(response.proposedAction,undefined);
  assert.equal(response.citations[0].url,'/school-affairs/login?next=%2Fschool-affairs%2Frecords');
  assert.equal(calls.length,0);
});

test('the registered action oracles grade real staged replies without granting mutation credit',async t=>{
  const load=async(file:string)=>import(new URL('../evaluation/'+file+'.mjs',import.meta.url).href);
  const [{buildAccountCases},{fixtureForCase},{gradeCase}]=await Promise.all([load('account-cases'),load('fixtures'),load('grading')]);
  const ids=['create-task','complete-task','name','tracker','duplicate-title','service-request','announcement-denied','announcement-admin'];
  const cases=buildAccountCases().filter((row:{id:string})=>ids.some(id=>row.id==='account:action-'+id));
  assert.equal(cases.length,ids.length);
  const now=Date.now;
  t.mock.method(Date,'now',()=>now()+70_000);
  let fixture:any;
  const calls=transport(t,(url,request)=>{
    const table=url.pathname.split('/').at(-1);
    assert.notEqual(table,'affairs_reviewed_action');
    if(table==='dtm_course_content_access')return Response.json({userId:owner,canManage:fixture.profile.role==='admin'});
    assert.equal(request.method,'GET');
    if(table==='affairs_profiles')return Response.json([{user_id:owner,role:fixture.profile.role,display_name:fixture.profile.displayName,preferred_name:null}]);
    if(table==='affairs_students')return Response.json([{id:student,user_id:owner}]);
    const title=url.searchParams.get('title')?.slice(3);
    if(table==='affairs_tasks')return Response.json(fixture.tasks.filter((entry:any)=>entry.title===title&&!entry.completedAt)
      .map((entry:any)=>({id:entry.id,user_id:owner,title:entry.title,completed_at:null})));
    if(table==='affairs_assignments')return Response.json(fixture.assignments.filter((entry:any)=>entry.title===title)
      .map((entry:any)=>({id:entry.id,student_id:student,dtm_course_id:entry.dtmCourseId,title:entry.title,status:entry.status,source_mode:entry.sourceMode})));
    assert.equal(table,'dtm_courses');
    return Response.json(fixture.dtm.courses.filter((entry:any)=>'eq.'+entry.id===url.searchParams.get('id'))
      .map((entry:any)=>({id:entry.id,user_id:owner,source_mode:entry.sourceMode})));
  });
  for(const testCase of cases){
    fixture=fixtureForCase(testCase,{userId:owner});
    const body=await invoke(routed,{question:testCase.question,route:testCase.route});
    const graded=gradeCase(testCase,{statusCode:200,execution:'deterministic',body,fixtureKey:testCase.fixtureKey});
    assert.deepEqual(graded.failures,[],testCase.id);
  }
  assert.ok(calls.some(call=>call.url.pathname.endsWith('/dtm_courses')));
});


test('a direct tuition payment request uses the authenticated capability response without data or model calls',async t=>{
  const load=async(file:string)=>import(new URL('../evaluation/'+file+'.mjs',import.meta.url).href);
  const [{buildAccountCases},{fixtureForCase},{gradeCase}]=await Promise.all([load('account-cases'),load('fixtures'),load('grading')]);
  const testCase=buildAccountCases().find((row:{id:string})=>row.id==='account:action-payment-denied');
  assert.ok(testCase);
  assert.equal(testCase.fixtureKey,'charges');
  assert.equal(fixtureForCase(testCase,{userId:owner}).profile.userId,owner);
  assert.equal(testCase.executionContract,'live-native');
  const calls=transport(t,()=>assert.fail('An unsupported payment never enters PostgREST'));
  const reply=await invoke(routed,{question:testCase.question,route:testCase.route});
  const graded=gradeCase(testCase,{statusCode:200,execution:'live-native',body:reply,fixtureKey:testCase.fixtureKey,events:[]});
  assert.deepEqual(graded.failures,[]);
  assert.equal(reply.status,'handoff');
  assert.deepEqual(reply.citations,[]);
  assert.equal(reply.proposedAction,undefined);
  assert.equal(reply.verification,undefined);
  assert.equal(reply.grounding.webSearched,false);
  assert.deepEqual(graded.toolEvidence.attempted,[]);
  assert.deepEqual(graded.toolEvidence.observed,[]);
  assert.match(reply.answer,/Tuition balance\]\(\/school-affairs\/services\/39-1\)/u);
  for(const question of ['請幫我立即繳交剩餘學費。','请帮我缴纳学费。']){
    const chinese=await ask(question);
    assert.equal(chinese.status,'handoff');
    assert.match(chinese.answer,/無法代你繳交學費.*\(\/school-affairs\/services\/39-1\)/u);
    assert.equal(chinese.proposedAction,undefined);
  }
  assert.deepEqual(calls,[]);
});

test('payment handoff only matches a standalone direct payment request',()=>{
  for(const question of ['Please pay my tuition bill now.','Could you please pay my tuition for me?',
    'Settle my outstanding tuition today.','請替我繳清未繳學雜費。'])
    assert.equal(answerDirectTuitionPayment(question)?.status,'handoff',question);
  for(const question of ['Where can I pay my tuition?','How should I pay my remaining tuition?',
    'What is my remaining tuition balance?','Show me how to pay my tuition.',
    'Pay my remaining tuition and show my next class.',
    'Pay my remaining tuition; what is my balance?','Pay my remaining tuition. What is my next class?',
    'Pay my remaining tuition only if I confirm.','Do not pay my tuition.',
    '我可以在哪裡繳交學費？','我的待繳學費金額是多少？','請幫我繳學費，然後查我的課表。',
    'Pay tuition to an account I give you.','Pay Alex’s tuition.'])
    assert.equal(answerDirectTuitionPayment(question),null,question);
});

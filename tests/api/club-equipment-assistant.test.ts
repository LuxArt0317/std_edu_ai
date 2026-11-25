import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test,{type TestContext} from 'node:test';
import {runAssistantClientInNewContext as runInNewContext} from '../evaluation/client-vm.mjs';
import ts from 'typescript';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import * as intent from '../../server/clubEquipmentIntent.js';
import {readAssistantReply} from '../../src/services/assistantStreamReader.js';
import {boundedAssistantText} from '../../src/services/assistantActivityBudget.js';

const route=intent.clubEquipmentPath;
const host='https://xiftudmvxphxcjtmfmib.supabase.co';
const token='fixture-club-credential',key='fixture-publishable-key';
const prompt='What is the status of my club equipment request, and when do I return the items?';
const id=(number:number)=>'b1461225-0000-4000-8000-'+String(number).padStart(12,'0');
const owner=id(1),foreign=id(2);
let session=0;
const saved={id:id(20),club_id:id(4),club_name:'Robotics Team',phone:'+886 98 765 4321',student_number:'PRIVATE_STUDENT_NUMBER',
  student_name:'PRIVATE_STUDENT_NAME',pickup_on:'2026-11-23',return_on:'2026-11-24',status:'approved',version:2,
  purpose:'other',other_purpose:'PRIVATE_PURPOSE',collateral:'PRIVATE_COLLATERAL',updated_at:'2026-11-15T10:45:00.123456+00:00',
  items:[{id:id(30),label:'Projector'}]};
const workspace=(userId=owner,rows:object[]=[saved],extra={})=>({userId,view:'equipment',manager:false,today:'2026-11-15',
  student:{student_number:'PRIVATE_STUDENT_NUMBER',student_name:'PRIVATE_STUDENT_NAME'},clubs:[],equipment:[],rows,...extra});
const forbidden=/PRIVATE_|fixture-club-credential|fixture-publishable-key|b1461225|98 765 4321/u;
type Transport=(attempt:number,userId:string)=>Response|Promise<Response>;

async function dispatch(handler:any,body:object,headers:Record<string,string>={authorization:'Bearer '+token}){
  const response={statusCode:0,body:null as any,setHeader(){},status(code:number){this.statusCode=code;return this;},json(value:unknown){this.body=value;}};
  await handler({method:'POST',body,headers},response);
  return response;
}

function fixture(t:TestContext,respond:Transport,feeTransport?:(url:URL,caller:string)=>Response){
  const caller=id(1000+(++session));
  const reads:URL[]=[],unrelated:string[]=[];
  t.mock.method(globalThis,'fetch',async (input:URL,init:RequestInit)=>{
    assert.equal(input.origin,host);assert.equal(init.redirect,'error');
    const headers=new Headers(init.headers);
    assert.equal(headers.get('authorization'),'Bearer '+token);assert.equal(headers.get('apikey'),key);
    reads.push(input);
    if(input.pathname==='/rest/v1/rpc/affairs_read_club_services'){
      assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(String(init.body)),{p_view:'equipment',p_month:null});
      return respond(reads.filter(url=>url.pathname===input.pathname).length,caller);
    }
    assert.equal(init.method,'GET');assert.ok(feeTransport);
    assert.ok(['/rest/v1/affairs_students','/rest/v1/affairs_charges'].includes(input.pathname));
    if(input.pathname.endsWith('/affairs_students'))assert.equal(input.searchParams.get('user_id'),'eq.'+caller);
    return feeTransport(input,caller);
  });
  const reject=(key:string)=>async()=>{unrelated.push(key);throw new Error('Unexpected '+key);};
  const handler=createAffairsAssistantHandler({
    verifyToken:async received=>{assert.equal(received,token);return {user:{id:caller},url:host,token,key};},
    loadSnapshot:reject('unscoped account read'),answerAccount:reject('model provider'),publicResearch:reject('public research'),
  });
  return {reads,unrelated,ask:(question=prompt,options:Record<string,unknown>={})=>dispatch(handler,{question,route,...options})};
}

function verified(body:any,attempts=1){
  assert.equal(body.status,'answered');assert.deepEqual(body.verification,{status:'verified',attempts});
  assert.equal(body.grounding.source,'account');assert.equal(body.grounding.webSearched,false);assert.equal(body.proposedAction,undefined);
  assert.doesNotMatch(JSON.stringify(body),forbidden);
}

test('the live handler binds a status and scheduled return date to saved equipment evidence',async t=>{
  const h=fixture(t,(_attempt,caller)=>Response.json(workspace(caller)));
  const {statusCode,body}=await h.ask();
  assert.equal(statusCode,200);verified(body);
  assert.match(body.answer,/Saved status: Approved · Scheduled return date: 2026-11-24/u);
  assert.doesNotMatch(body.answer,/2026-11-23|Projector|physical return/u);
  assert.equal(body.citations[0].chunkId,'account:clubEquipment');assert.equal(body.citations[0].url,route);
  assert.ok(body.activity.some((step:{kind:string;status:string})=>step.kind==='account-read:clubEquipment:1'&&step.status==='complete'));
  assert.equal(h.reads.length,1);assert.deepEqual(h.unrelated,[]);
});

test('latest, explicit request and follow-up choose the relevant rows before projecting fields',async t=>{
  const older={...saved,id:id(21),return_on:'2026-11-27',status:'submitted',items:[{id:id(31),label:'Wireless microphone'}],updated_at:'2026-11-15T10:45:00.123455+00:00'};
  const h=fixture(t,(_attempt,caller)=>Response.json(workspace(caller,[saved,older])));
  const latest=await h.ask('Show my latest club equipment request.');
  verified(latest.body);assert.match(latest.body.answer,/Projector/u);assert.doesNotMatch(latest.body.answer,/Wireless microphone/u);
  const picked=await h.ask('What equipment is on my saved request?',{route:route+'/new?edit='+older.id});
  verified(picked.body);assert.match(picked.body.answer,/Wireless microphone/u);assert.doesNotMatch(picked.body.answer,/Projector/u);
  const followup=await h.ask('When is it due back?',{history:[{role:'user',content:'Show my club equipment request '+older.id+'.'}]});
  verified(followup.body);assert.match(followup.body.answer,/2026-11-27/u);assert.doesNotMatch(followup.body.answer,/2026-11-24/u);
  const all=await h.ask('列出我的社團器材借用紀錄。');
  verified(all.body);assert.deepEqual(all.body.views[0].rows,[['Robotics Team','已核准','2026-11-23','2026-11-24','Projector'],
    ['Robotics Team','待審核','2026-11-23','2026-11-27','Wireless microphone']]);
});

test('count only carries no row data and a capped result qualifies its coverage',async t=>{
  const rows=Array.from({length:100},(_,index)=>({...saved,id:id(100+index),status:index===0?'approved':'declined'}));
  const h=fixture(t,(_attempt,caller)=>Response.json(workspace(caller,rows)));
  const {body}=await h.ask('How many approved club equipment requests have I saved?');
  verified(body);assert.match(body.answer,/requests: 1/u);assert.match(body.answer,/100 most recently updated/u);
  assert.doesNotMatch(body.answer,/Robotics Team|Projector/u);assert.equal(body.views,undefined);
});

test('temporary source failure rereads the same view and a verified empty result stays distinct',async t=>{
  const h=fixture(t,(attempt,caller)=>attempt===1?new Response(null,{status:503}):Response.json(workspace(caller,[])));
  const {body}=await h.ask();
  verified(body,2);assert.match(body.answer,/No saved club equipment requests matched/u);assert.equal(h.reads.length,2);
  assert.deepEqual(body.activity.filter((step:{kind:string})=>step.kind.startsWith('account-read:clubEquipment:'))
    .map((step:{status:string})=>step.status),['unavailable','complete']);
});

test('a foreign envelope and an unexpected row owner fail closed without leaking either draft',async t=>{
  const h=fixture(t,(attempt,caller)=>Response.json(attempt===1?workspace(foreign,[{...saved,club_name:'FOREIGN ENVELOPE SENTINEL'}])
    :workspace(caller,[{...saved,user_id:foreign,club_name:'FOREIGN ROW SENTINEL'}])));
  const {body}=await h.ask();
  assert.equal(body.status,'abstained');assert.equal(body.verification.status,'unverified');assert.equal(h.reads.length,2);
  assert.deepEqual(body.citations,[]);assert.equal(body.views,undefined);
  assert.doesNotMatch(JSON.stringify(body),/SENTINEL|No saved club equipment/u);
});

test('non-calendar source dates are unavailable rather than normalized',async t=>{
  const h=fixture(t,(_attempt,caller)=>Response.json(workspace(caller,[{...saved,pickup_on:'2026-02-30'}])));
  const {body}=await h.ask();
  assert.equal(body.status,'abstained');assert.equal(body.verification.status,'unverified');assert.equal(h.reads.length,2);
  assert.doesNotMatch(JSON.stringify(body),/2026-02-30|2026-11-24/u);
});

test('foreign, write, review, excluded, ambiguous and detail questions cannot read the equipment RPC',async t=>{
  const h=fixture(t,()=>assert.fail('Unexpected equipment read.'));
  const questions=[
    ['Show Alice’s club equipment request.','handoff'],['Show their club equipment requests.','handoff'],['Show another student’s club equipment request.','handoff'],
    ['As an admin, show all students’ club equipment requests.','handoff'],['Cancel Alice’s club equipment request.','handoff'],
    ['Show my equipment borrowing request and delete it.','handoff'],['Do not show my club equipment requests.','answered'],
    ['Show my club equipment pickup location.','clarification'],['When did I return my club equipment?','clarification'],
    ['Show my club equipment request for the projector.','clarification'],['Show my overdue club equipment requests.','clarification'],['Which phone number is on my club equipment request?','clarification'],
    ['Please show my club equipment requests from this semester.','clarification'],['Where can I find my club equipment requests?','answered'],
  ];
  for(const [question,status] of questions){
    const {body}=await h.ask(question);
    assert.equal(body.status,status,question);assert.equal(body.verification,undefined);assert.equal(body.proposedAction,undefined);
  }
  const {body}=await h.ask(prompt,{route:route+'?owner=other'});
  assert.equal(body.status,'clarification');assert.equal(body.verification,undefined);
  assert.equal(h.reads.length,0);assert.deepEqual(h.unrelated,[]);
  for(const question of ['Show my Student Health equipment approval.','查詢物品借用是否核准','Show my equipment borrowing status.'])
    assert.equal(intent.clubEquipmentPlan(question,'/school-affairs/services/30-2'),null);
  assert.equal(intent.clubEquipmentPlan('What is my leave status?',route,[{role:'user',content:prompt}]),null);
});

test('guest receives sign-in for the equipment page without account evidence',async t=>{
  t.mock.method(globalThis,'fetch',async()=>assert.fail('Guest made a provider call.'));
  const handler=createResearchAssistantHandler();
  const {body}=await dispatch(handler,{question:'What is its status?',route},{'x-forwarded-for':'192.0.2.73'});
  assert.equal(body.status,'handoff');assert.equal(body.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(route));
  assert.equal(body.views,undefined);
  const cancellation=await dispatch(handler,{question:'Cancel my club equipment request.',route},{'x-forwarded-for':'192.0.2.75'});
  assert.equal(cancellation.body.status,'handoff');assert.equal(cancellation.body.proposedAction,undefined);
  const foreignReply=await dispatch(handler,{question:'Show Alice’s club equipment request.',route},{'x-forwarded-for':'192.0.2.74'});
  assert.deepEqual(foreignReply.body.citations,[]);assert.match(foreignReply.body.answer,/your own account/u);
});

test('browser dispatcher chooses authenticated verification instead of the navigation shortcut',async()=>{
  const source=await readFile(new URL('../../src/services/schoolAffairsAssistant.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:Record<string,any>={},calls:unknown[]=[];
  runInNewContext(code,{exports,require:(specifier:string)=>{
    if(specifier.endsWith('clubEquipmentIntent.js'))return intent;
    if(specifier.endsWith('assistantActivityBudget.js'))return {boundedAssistantText};
    if(specifier.endsWith('assistantStreamReader.js'))return {readAssistantReply};
    if(specifier.endsWith('/authClient'))return {affairsClient:{auth:{getSession:async()=>({data:{session:{user:{id:owner},access_token:token}},error:null})}}};
    return new Proxy({},{get:()=>()=>false});
  },fetch:async(url:string,init:RequestInit)=>{
    calls.push([url,new Headers(init.headers).get('authorization'),JSON.parse(String(init.body))]);
    return Response.json({status:'answered',answer:'Equipment evidence verified.',citations:[]});
  }});
  await exports.askSchoolAffairsAssistant(owner,prompt,[],undefined,[],route);
  assert.deepEqual(calls,[['/api/affairs-assistant','Bearer '+token,{question:prompt,history:[],images:[],route,stream:false}]]);
});

const feePath='/school-affairs/services/39-1';
function fees(url:URL,caller:string){
  const student=id(40);
  if(url.pathname.endsWith('/affairs_students'))return Response.json([{id:student,user_id:caller}]);
  assert.equal(url.searchParams.get('student_id'),'eq.'+student);
  return Response.json([{id:id(41),student_id:student,label:'Recorded school charge',amount_due:30000,amount_paid:7000,
    currency:'TWD',source_mode:'sample',due_on:'2026-11-23',occurrence_on:'2026-10-02',category:'tuition'}]);
}

test('a mixed balance question reads two distinct sources and preserves requested order',async t=>{
  const h=fixture(t,(_attempt,caller)=>Response.json(workspace(caller)),fees);
  for(const [question,pages] of [
    ['Show my club equipment requests. Also tell me my tuition balance.',[route,feePath]],
    ['How much tuition do I still owe? Also show my club equipment requests.',[feePath,route]],
  ] as const){
    const {body}=await h.ask(question);
    verified(body);assert.deepEqual(body.citations.map((citation:{url:string})=>citation.url),pages);
    assert.match(body.answer,/23,000/u);assert.match(body.answer,/Projector/u);
  }
  assert.equal(h.reads.length,6);assert.deepEqual(h.unrelated,[]);
});

test('a failed equipment source never promotes a verified fee section into full verification',async t=>{
  const h=fixture(t,()=>new Response(null,{status:503}),fees);
  const {body}=await h.ask('Show my club equipment requests. Also tell me my tuition balance.');
  assert.equal(body.status,'answered');assert.equal(body.grounding.degraded,true);
  assert.deepEqual(body.verification,{status:'unverified',attempts:2,reason:'club_equipment_evidence_unavailable'});
  assert.match(body.answer,/23,000/u);assert.match(body.answer,/couldn’t verify your saved club equipment/u);
  assert.deepEqual(body.citations.map((citation:{url:string})=>citation.url),[feePath]);
  assert.equal(h.reads.filter(url=>url.pathname.endsWith('affairs_read_club_services')).length,2);
  assert.equal(h.reads.filter(url=>url.pathname.endsWith('affairs_charges')).length,1);
});

test('a verified club cancellation proposes only the exact owned revision without performing a write',async t=>{
  const west={...saved,id:id(22),status:'submitted',pickup_on:'2026-11-20',items:[{id:id(32),label:'Tripod'}]};
  const east={...saved,id:id(23),status:'submitted',updated_at:'2026-11-15T10:44:00Z'};
  const h=fixture(t,(_attempt,caller)=>Response.json(workspace(caller,[west,east])));
  for(const [question,context] of [
    ['Please cancel my club equipment request for "Tripod" on 2026-11-20.',{}],
    ['請取消我的社團器材借用申請 器材「Tripod」領取日期 2026-11-20。',{}],
    ['Cancel my club equipment request.',{route:route+'/new?edit='+west.id}],
  ] as const){
    const {statusCode,body}=await h.ask(question,context);
    assert.equal(statusCode,200,JSON.stringify(body));
    assert.deepEqual(body.verification,{status:'verified',attempts:1});
    assert.match(body.answer,/Review|確認/u);
    assert.deepEqual(body.proposedAction.payload,{id:west.id,expected_version:'2'});
    assert.equal(body.proposedAction.kind,'cancel_club_equipment');
    assert.equal(body.proposedAction.url,route);
    assert.match(body.proposedAction.requestId,/^[\da-f-]{36}$/u);
    assert.match(body.proposedAction.label,/Robotics Team.*2026-11-20.*Tripod/u);
    assert.doesNotMatch(JSON.stringify(body),/PRIVATE_|98 765 4321|fixture-club/u);
  }
  const inaccurate=await h.ask('Cancel my club equipment request for "Tripod".',{route:route+'/new?edit='+east.id});
  assert.equal(inaccurate.body.status,'clarification');assert.equal(inaccurate.body.proposedAction,undefined);
  const wrongId=await h.ask('Cancel my club equipment request.',{route:route+'/new?edit='+id(99)});
  assert.equal(wrongId.body.status,'clarification');assert.equal(wrongId.body.proposedAction,undefined);
  const wrongRoute=await h.ask('Cancel my club equipment request.',{route:route+'?owner=other'});
  assert.equal(wrongRoute.body.status,'clarification');assert.equal(wrongRoute.body.proposedAction,undefined);
  assert.equal(h.reads.length,5);assert.deepEqual(h.unrelated,[]);
});

test('multiple, missing, foreign, expired, capped and ineligible club requests never produce a proposal',async t=>{
  const pending={...saved,id:id(24),status:'submitted',updated_at:'2026-11-15T10:44:00Z',pickup_on:'2026-11-14'};
  let mode:'normal'|'capped'|'failed'='normal';
  const h=fixture(t,(_attempt,caller)=>mode==='failed'?Response.json(workspace(foreign)):Response.json(workspace(caller,mode==='capped'
    ?Array.from({length:100},(_,index)=>({...pending,id:id(100+index)})):[saved,pending])));
  for(const question of ['Cancel my club equipment request.','Cancel my club equipment request on 2026-02-30.',
    'Cancel my club equipment request on 2026-11-23.','Cancel my club equipment request on 2026-11-14.']){
    const {body}=await h.ask(question);
    assert.equal(body.status,'clarification',question);assert.equal(body.proposedAction,undefined,question);
  }
  for(const [question,context,status] of [
    ['Cancel my club equipment requests.',{},'clarification'],
    ['Cancel my club equipment request and show my grades.',{},'clarification'],
    ['Cancel my club equipment request only if I confirm.',{},'clarification'],
    ['Cancel my club equipment request.',{images:[{name:'notes.png',dataUrl:'data:image/png;base64,eA=='}]},undefined],
  ] as const){
    const {statusCode,body}=await h.ask(question,context);
    assert.equal(statusCode,status?200:400);
    assert.equal(body.status,status);assert.equal(body.proposedAction,undefined);
  }
  assert.equal(h.reads.length,4);
  mode='capped';
  const capped=await h.ask('Cancel my club equipment request on 2026-11-14.');
  assert.equal(capped.body.status,'clarification');assert.equal(capped.body.proposedAction,undefined);
  mode='failed';
  const failed=await h.ask('Cancel my club equipment request.');
  assert.equal(failed.body.status,'abstained');assert.equal(failed.body.proposedAction,undefined);
  assert.equal(h.reads.length,7);assert.deepEqual(h.unrelated,[]);
});

import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import confirm from '../../api/affairs-action.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {parseExplicitAccountAction} from '../../server/accountActionIntent.js';
import {counselingAppointmentsPath as route} from '../../server/counselingContract.js';

const id=(n:number)=>'f4409025-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),other=id(2),appointment=id(10),closedId=id(11);
const origin='https://xiftudmvxphxcjtmfmib.supabase.co',token='controlled-counseling-caller-for-native-action',key='controlled-counseling-key';
const prompt='Cancel my counseling appointment.';
const saved={id:appointment,kind:'counseling',status:'scheduled',preferred_on:'2026-11-18',preferred_period:'morning',
  scheduled_at:'2026-11-19T16:12:00.000001Z',updated_at:'2026-11-15T10:45:00.123456+00:00',version:2};
const past={...saved,id:closedId,status:'closed',scheduled_at:'2026-11-11T19:32:00Z'};
const own=(rows:object[]=[saved,past],userId=owner)=>({userId,available:false,canCoordinate:false,rows});
const forbidden=/controlled-counseling|f4409025-0000-4000-8000-000000000001|2026-11-15T10|2026-11-18|2026-11-19T16:12|morning|PRIVATE_MARKER/u;

async function dispatch(handler:any,body:object,headers:Record<string,string>={authorization:'Bearer '+token}){
  const response={statusCode:0,body:null as any,setHeader(){},status(status:number){this.statusCode=status;return this;},json(value:unknown){this.body=value;}};
  await handler({method:'POST',headers,body},response);return response;
}
let requestCounter=0;
function harness(t:TestContext,responses:(attempt:number,caller:string)=>Response,
  mutate?:(args:{p_operation:string;p_payload:Record<string,unknown>})=>Response){
  let caller=owner;
  if(++requestCounter>1)caller=id(100+requestCounter);
  const paths:string[]=[],writes:unknown[]=[],unrelated:string[]=[];
  t.mock.method(globalThis,'fetch',async (input:RequestInfo|URL,init:RequestInit)=>{
    const url=new URL(String(input));assert.equal(url.origin,origin);
    const headers=new Headers(init?.headers);assert.equal(headers.get('apikey'),key);assert.equal(headers.get('authorization'),'Bearer '+token);
    paths.push(url.pathname);
    if(url.pathname==='/auth/v1/user')return Response.json({id:caller,identities:[{provider:'google'}]});
    assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
    const body=JSON.parse(String(init.body));
    if(url.pathname==='/rest/v1/rpc/affairs_read_counseling'){
      assert.deepEqual(body,{p_view:'mine'});return responses(paths.filter(path=>path.endsWith('affairs_read_counseling')).length,caller);
    }
    assert.equal(url.pathname,'/rest/v1/rpc/affairs_change_counseling');assert.ok(mutate,'Unexpected write');
    writes.push(body);return mutate(body);
  });
  const reject=(scope:string)=>async()=>{unrelated.push(scope);throw Error(scope);};
  const handler=createAffairsAssistantHandler({verifyToken:async bearer=>{
    assert.equal(bearer,token);return {user:{id:caller},token,key,url:origin};
  },loadSnapshot:reject('broad snapshot'),answerAccount:reject('model request'),publicResearch:reject('public research')});
  return {paths,writes,unrelated,ask:(question=prompt,options:Record<string,unknown>={})=>dispatch(handler,{question,route,...options})};
}

test('one verified scheduled appointment produces an exact version proposal without booking or cancellation writes',async t=>{
  const h=harness(t,(_attempt,caller)=>Response.json(own([saved,past],caller)));
  const {statusCode,body}=await h.ask('Please cancel my counseling appointment on 2026-11-20 now.');
  assert.equal(statusCode,200);assert.deepEqual(body.verification,{status:'verified',attempts:1});
  assert.match(body.answer,/Confirm to cancel/u);
  assert.deepEqual(body.proposedAction.payload,{id:appointment,expected_version:'2'});
  assert.equal(body.proposedAction.kind,'counseling_cancel');assert.equal(body.proposedAction.url,route);
  assert.match(body.proposedAction.label,/Scheduled date 2026-11-20 · Scheduled/u);
  assert.match(body.proposedAction.requestId,/^[a-f0-9-]{36}$/u);
  assert.doesNotMatch(JSON.stringify(body),forbidden);
  assert.deepEqual(h.paths,['/rest/v1/rpc/affairs_read_counseling']);assert.deepEqual(h.writes,[]);assert.deepEqual(h.unrelated,[]);
});

test('pending assessments use the requested date and Traditional Chinese confirmation stays local',async t=>{
  const entry={...saved,kind:'assessment',status:'requested',scheduled_at:null,preferred_on:'2026-11-23'};
  const h=harness(t,(_attempt,caller)=>Response.json(own([entry,past],caller)));
  const exact=await h.ask('請幫我取消我的心理測驗預約日期：2026-11-23');
  assert.deepEqual(exact.body.proposedAction?.payload,{id:appointment,expected_version:'2'});
  assert.match(exact.body.proposedAction.label,/心理測驗.*希望日期 2026-11-23.*待安排/u);
  const pastResult=await h.ask('Cancel my counseling appointment with ID '+closedId);
  assert.match(pastResult.body.answer,/no longer eligible/u);assert.equal(pastResult.body.proposedAction,undefined);
  const wrong=await h.ask('Cancel my counseling appointment with ID '+id(99));
  assert.equal(wrong.body.status,'clarification');assert.equal(wrong.body.proposedAction,undefined);
  assert.equal(h.paths.length,3);assert.deepEqual(h.writes,[]);
});

test('hold, compound, plural, invalid date, foreign and restricted route never run a proposal reader',async t=>{
  const h=harness(t,()=>assert.fail('Private records were read'));
  for(const [question,options,status] of [
    ['Cancel my counseling appointment only if I confirm.',{},'clarification'],
    ['Cancel my counseling appointment and book another one.',{},'clarification'],
    ['Cancel my counseling appointments.',{},'clarification'],
    ['Cancel my counseling appointment for 2026-02-30.',{},'clarification'],
    ['Cancel my counseling appointment for another student.',{},'clarification'],
    [prompt,{route:'/school-affairs/services/29-1/queue'},'clarification'],
    [prompt,{route:route+'?user_id='+other},'clarification'],
    [prompt,{images:[{name:'private.png',dataUrl:'data:image/png;base64,dGVzdA=='}]},null],
  ] as const){
    const {statusCode,body}=await h.ask(question,options);
    assert.equal(statusCode,status?200:400,question);assert.equal(body.proposedAction,undefined);if(status)assert.equal(body.status,status);
  }
  const foreign=await h.ask('Cancel another student’s counseling appointment.');
  assert.equal(foreign.body.proposedAction,undefined);assert.match(foreign.body.answer,/another student/u);
  assert.equal(parseExplicitAccountAction('Book me a counseling appointment tomorrow.'),null);
  assert.equal(parseExplicitAccountAction('Cancel it.'),null);
  assert.deepEqual(h.paths,[]);assert.deepEqual(h.unrelated,[]);
});

test('capped, invalid ownership, competing open rows and capped versions never receive a cancellation proposal',async t=>{
  let mode:'capped'|'crossed'|'double'|'version'|'qualified'='capped';
  const h=harness(t,(_attempt,caller)=>Response.json(mode==='crossed'?own([{...saved,preferred_on:'2026-11-18'}],other)
    :mode==='double'?own([saved,{...saved,id:id(12)}],caller)
    :mode==='version'?own([{...saved,version:1_000_000}],caller)
    :mode==='qualified'?own([saved,{...past,scheduled_at:saved.scheduled_at}],caller)
    :own([saved,...Array.from({length:49},(_,index)=>({...past,id:id(index+20)}))],caller)));
  for(const [setting,question,status] of [
    ['capped',prompt,'clarification'],['crossed',prompt,'abstained'],['double',prompt,'abstained'],
    ['version',prompt,'clarification'],['qualified','Cancel my counseling appointment on 2026-11-20.','clarification'],
  ] as const){
    mode=setting;
    const {body}=await h.ask(question);
    assert.equal(body.status,status,setting);assert.equal(body.proposedAction,undefined);assert.doesNotMatch(JSON.stringify(body),forbidden);
  }
  assert.equal(h.paths.length,7);assert.deepEqual(h.writes,[]);assert.deepEqual(h.unrelated,[]);
});

test('guests get the private appointment return path without any account read or proposal',async t=>{
  t.mock.method(globalThis,'fetch',async()=>assert.fail('Guest private operation used a provider'));
  const {statusCode,body}=await dispatch(createResearchAssistantHandler(),{question:prompt,route:'/'},{'x-forwarded-for':'192.0.2.168'});
  assert.equal(statusCode,200);assert.equal(body.status,'handoff');assert.equal(body.proposedAction,undefined);
  assert.equal(body.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(route));
});

test('the dedicated confirmation endpoint binds ID, version and replay key to the native operation',async t=>{
  const configuration={VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:key};
  const before=Object.fromEntries(Object.keys(configuration).map(name=>[name,process.env[name]]));
  Object.assign(process.env,configuration);
  t.after(()=>{for(const [name,value] of Object.entries(before))if(value===undefined)delete process.env[name];else process.env[name]=value;});
  let committed=0;let recordedRequest:string|undefined;
  const h=harness(t,(_attempt,caller)=>Response.json(own([saved],caller)),({p_operation,p_payload})=>{
    assert.equal(p_operation,'cancel');assert.equal(p_payload.id,appointment);assert.equal(p_payload.expected_version,2);
    assert.match(String(p_payload.request_id),/^[a-f0-9-]{36}$/u);
    if(recordedRequest===undefined){recordedRequest=String(p_payload.request_id);committed++;}
    assert.equal(p_payload.request_id,recordedRequest);
    return Response.json({id:appointment,status:'cancelled',version:3});
  });
  const proposal=await h.ask();assert.deepEqual(h.writes,[]);
  const {kind,payload,requestId}=proposal.body.proposedAction;
  const request={kind,payload:{id:payload.id,expected_version:Number(payload.expected_version),request_id:requestId}};
  for(let i=0;i<2;i++){
    const confirmed=await dispatch(confirm,request);
    assert.equal(confirmed.statusCode,200);assert.deepEqual(confirmed.body,{id:appointment,status:'cancelled',version:3});
  }
  assert.equal(h.writes.length,2);assert.deepEqual(h.writes[0],h.writes[1]);assert.equal(committed,1);
});

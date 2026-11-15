import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import confirm from '../../api/affairs-action.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {parseExplicitAccountAction} from '../../server/accountActionIntent.js';
import {repairPaths} from '../../src/features/public/affairs/facilityRepair.js';

const id=(n:number)=>'f5409025-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),other=id(2),report='a4158115-0000-4000-8000-000000000003',elsewhere=id(4);
const exactRoute=repairPaths.history+'/'+report;
const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='controlled-repair-key';
const ownerToken='controlled-repair-own-caller-token',otherToken='controlled-repair-crossed-caller-token';
const prompt='Cancel my repair report.';
const saved={id:report,user_id:owner,building:'PRIVATE_BUILDING',location:'PRIVATE_ROOM',item:'PRIVATE_ITEM',
  description:'PRIVATE_DESCRIPTION',contact_phone:'555-0100',status:'submitted',version:1,
  created_at:'2026-11-19T20:00:00.000Z',updated_at:'2026-11-19T20:00:00.000Z'};
const own=(detail:object=saved,userId=owner)=>({userId,detail,events:[]});
const leaked=/PRIVATE_|555-0100|controlled-repair|f5409025-0000-4000-8000-00000000000[12]/u;
type RepairWrite={p_action:string;p_payload:{request_id:string;id:string;version:number}};

async function dispatch(handler:any,body:object,token=ownerToken){
  const headers=token?{authorization:'Bearer '+token}:{'x-forwarded-for':'192.0.2.189'};
  const response={statusCode:0,body:null as any,setHeader(){},status(status:number){this.statusCode=status;return this;},json(value:unknown){this.body=value;}};
  await handler({method:'POST',headers,body},response);return response;
}

const now=Date.now.bind(Date);
let requestWindow=0;
function harness(t:TestContext,read:(target:string,caller:string,attempt:number)=>Response,
  change?:(request:RepairWrite,caller:string)=>Response){
  const offset=++requestWindow*65_000;
  t.mock.method(Date,'now',()=>now()+offset);
  const configuration={VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:key};
  const before=Object.fromEntries(Object.keys(configuration).map(name=>[name,process.env[name]]));
  Object.assign(process.env,configuration);
  t.after(()=>{for(const [name,value] of Object.entries(before))if(value===undefined)delete process.env[name];else process.env[name]=value;});
  const reads:{target:string;caller:string}[]=[],writes:{request:RepairWrite;caller:string}[]=[],unexpected:string[]=[];
  t.mock.method(globalThis,'fetch',async (input:RequestInfo|URL,init:RequestInit)=>{
    const url=new URL(String(input)),headers=new Headers(init?.headers);
    assert.equal(url.origin,origin);assert.equal(headers.get('apikey'),key);
    const token=headers.get('authorization');
    assert.ok(token==='Bearer '+ownerToken||token==='Bearer '+otherToken);
    const caller=token==='Bearer '+ownerToken?owner:other;
    if(url.pathname==='/auth/v1/user')return Response.json({id:caller,identities:[{provider:'google'}]});
    assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
    const body=JSON.parse(String(init.body));
    if(url.pathname==='/rest/v1/rpc/affairs_read_facility_repairs'){
      reads.push({caller,target:body.p_id});
      assert.deepEqual(body,{p_manage:false,p_id:body.p_id,p_page:0,p_status:''});
      return read(body.p_id,caller,reads.length);
    }
    if(url.pathname==='/rest/v1/rpc/affairs_change_facility_repair'&&change){
      writes.push({caller,request:body});return change(body,caller);
    }
    unexpected.push(url.pathname);
    throw Error('Unexpected private transport.');
  });
  const fail=(scope:string)=>async()=>{unexpected.push(scope);throw Error(scope);};
  const handler=createAffairsAssistantHandler({loadSnapshot:fail('broad snapshot'),answerAccount:fail('model'),publicResearch:fail('public research')});
  return {reads,writes,unexpected,ask:(question=prompt,options:Record<string,unknown>={},token=ownerToken)=>
    dispatch(handler,{question,route:exactRoute,...options},token)};
}

test('a signed-in repair cancellation uses one exact read and sends no mutation until confirmation',async t=>{
  const h=harness(t,()=>Response.json(own()));
  for(const [question,route,locale] of [
    [prompt,exactRoute,'en'],
    ['Cancel my facilities repair report with ID '+report+'.','/dtm','en'],
    ['取消我的報修申請。',exactRoute,'zh'],
  ]){
    const {statusCode,body}=await h.ask(question,{route});
    assert.equal(statusCode,200);assert.deepEqual(body.verification,{status:'verified',attempts:1});
    assert.match(body.answer,locale==='en'?/Confirm to cancel/u:/確認後即可取消/u);
    assert.deepEqual(body.proposedAction.payload,{id:report,version:'1'});
    assert.equal(body.proposedAction.kind,'cancel_facility_repair');assert.equal(body.proposedAction.url,exactRoute);
    assert.match(body.proposedAction.label,/A4158115.*2026-11-20/u);
    assert.match(body.proposedAction.requestId,/^[a-f0-9-]{36}$/u);
    assert.doesNotMatch(JSON.stringify(body),leaked);
    assert.ok(body.activity.some((step:{kind:string;status:string})=>step.kind==='account-read:facilityRepairs:1'&&step.status==='complete'));
  }
  assert.deepEqual(h.reads,Array.from({length:3},()=>({caller:owner,target:report})));
  assert.deepEqual(h.writes,[]);assert.deepEqual(h.unexpected,[]);
});

test('foreign, hold, compound, ambiguous and management requests cannot reach the repair detail reader',async t=>{
  const h=harness(t,()=>assert.fail('Repair record read without a unique authorized command'));
  for(const [question,route] of [
    [prompt,repairPaths.history],
    [prompt,repairPaths.manage+'/'+report],
    [prompt,exactRoute+'?user_id='+other],
    [prompt,repairPaths.history+'/further/'+report],
    ['Cancel my repair report with ID '+elsewhere,exactRoute],
    ['Cancel my repair report '+report+' and '+elsewhere,exactRoute],
    ['Cancel all my repair reports.',exactRoute],
    ['Cancel my repair report only if I tell you to.',exactRoute],
    ['Do not cancel my repair report.',exactRoute],
    ['Hold off on cancelling my repair report.',exactRoute],
    ['Cancel another student’s repair report.',exactRoute],
    ['取消阿明的報修。',exactRoute],
    ['先不要取消我的報修。',exactRoute],
    ['Cancel my repair report and submit a new request.',exactRoute],
  ]){
    const {statusCode,body}=await h.ask(question,{route});
    assert.equal(statusCode,200,question);assert.equal(body.status,'clarification',question);
    assert.equal(body.proposedAction,undefined,question);assert.doesNotMatch(JSON.stringify(body),leaked);
  }
  const image=await h.ask(prompt,{images:[{name:'repair.png',dataUrl:'data:image/png;base64,dGVzdA=='}]});
  assert.equal(image.statusCode,400);assert.equal(image.body.proposedAction,undefined);
  assert.equal(parseExplicitAccountAction('Can I cancel my repair report?'),null);
  assert.equal(parseExplicitAccountAction('Cancel it.'),null);
  assert.deepEqual(h.reads,[]);assert.deepEqual(h.writes,[]);assert.deepEqual(h.unexpected,[]);
});

test('unowned, missing, ineligible and malformed exact repair records do not yield a proposal',async t=>{
  let snapshot=()=>Response.json(own());
  const h=harness(t,()=>snapshot());
  for(const [factory,status] of [
    [()=>new Response(null,{status:404}),'clarification'],
    [()=>Response.json(own({...saved,status:'in_progress',version:2})),'clarification'],
    [()=>Response.json(own({...saved,status:'resolved',version:3})),'clarification'],
    [()=>Response.json(own({...saved,version:10000})),'clarification'],
    [()=>Response.json(own({...saved,user_id:other})),'abstained'],
    [()=>Response.json(own(saved,other)),'abstained'],
    [()=>Response.json(own({...saved,id:elsewhere})),'abstained'],
    [()=>Response.json(own({...saved,version:'1'})),'abstained'],
    [()=>Response.json({...own(),events:[{version:1,status:'cancelled',note:'',occurred_at:saved.created_at}]}),'abstained'],
  ] as const){
    snapshot=factory;
    const {body}=await h.ask();
    assert.equal(body.status,status);assert.equal(body.proposedAction,undefined);assert.doesNotMatch(JSON.stringify(body),leaked);
  }
  assert.ok(h.reads.every(read=>read.target===report&&read.caller===owner));
  assert.deepEqual(h.writes,[]);assert.deepEqual(h.unexpected,[]);
});

test('a failed exact read can recover using the same caller and report without any broader lookup',async t=>{
  const h=harness(t,(_id,_owner,attempt)=>attempt===1?new Response(null,{status:503}):Response.json(own()));
  const {body}=await h.ask();
  assert.deepEqual(body.verification,{status:'verified',attempts:2});
  assert.deepEqual(body.proposedAction.payload,{id:report,version:'1'});
  assert.deepEqual(h.reads,[{caller:owner,target:report},{caller:owner,target:report}]);
  assert.deepEqual(h.writes,[]);assert.deepEqual(h.unexpected,[]);
});

test('guest cancellation uses the repair history sign-in continuation with no report read',async t=>{
  t.mock.method(globalThis,'fetch',async()=>assert.fail('Guest cancellation touched a provider'));
  const {statusCode,body}=await dispatch(createResearchAssistantHandler(),{question:prompt,route:exactRoute},'');
  assert.equal(statusCode,200);assert.equal(body.status,'handoff');assert.equal(body.proposedAction,undefined);
  assert.deepEqual(body.citations.map((item:{url:string})=>item.url),['/school-affairs/login?next='+encodeURIComponent(repairPaths.history)]);
});

test('the real action endpoint verifies the receipt and preserves the exact native request on replay',async t=>{
  let persistedVersion=1,commits=0,simulateLostReceipt=true;
  let consumed:RepairWrite|undefined;
  const h=harness(t,()=>Response.json(own()),(request,caller)=>{
    const {p_action,p_payload}=request;
    assert.equal(p_action,'cancel_facility_repair');
    assert.deepEqual(Object.keys(p_payload).sort(),['id','request_id','version']);
    if(caller!==owner||p_payload.id!==report)return new Response(null,{status:404});
    if(consumed&&p_payload.request_id===consumed.p_payload.request_id){
      if(JSON.stringify(request)!==JSON.stringify(consumed))return new Response(null,{status:409});
      return Response.json({id:report,status:'cancelled',version:persistedVersion});
    }
    if(p_payload.version!==persistedVersion||commits)return new Response(null,{status:409});
    consumed=structuredClone(request);persistedVersion++;commits++;
    const returnedVersion=simulateLostReceipt?persistedVersion+1:persistedVersion;
    simulateLostReceipt=false;
    return Response.json({id:report,status:'cancelled',version:returnedVersion});
  });
  const {body}=await h.ask();
  assert.deepEqual(h.writes,[]);
  const {kind,payload,requestId}=body.proposedAction;
  const request={kind,payload:{id:payload.id,version:Number(payload.version),request_id:requestId}};
  const denied=await dispatch(confirm,request,otherToken);
  assert.equal(denied.statusCode,404);assert.equal(commits,0);
  const stale=await dispatch(confirm,{...request,payload:{...request.payload,version:2}});
  assert.equal(stale.statusCode,409);assert.equal(commits,0);
  const invalidReceipt=await dispatch(confirm,request);
  assert.equal(invalidReceipt.statusCode,503);assert.equal(commits,1);
  assert.equal(invalidReceipt.body.id,undefined);
  for(let i=0;i<2;i++){
    const confirmed=await dispatch(confirm,request);
    assert.equal(confirmed.statusCode,200);assert.deepEqual(confirmed.body,{id:report,status:'cancelled',version:2});
  }
  assert.equal(commits,1);
  assert.deepEqual(h.writes.slice(2,5).map(call=>call.request),Array.from({length:3},()=>consumed));
  const changed=await dispatch(confirm,{...request,payload:{...request.payload,version:2}});
  assert.equal(changed.statusCode,409);assert.equal(commits,1);
  assert.deepEqual(h.unexpected,[]);
});

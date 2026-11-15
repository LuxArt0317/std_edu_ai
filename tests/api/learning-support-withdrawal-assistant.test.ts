import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import confirm from '../../api/affairs-action.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {parseExplicitAccountAction} from '../../server/accountActionIntent.js';
import {learningSupportPath} from '../../src/features/public/affairs/studentServices.js';

const owner='71000000-0000-4000-8000-000000000001',other='71000000-0000-4000-8000-000000000002';
const target='70908e50-0000-4000-8000-000000000001',older='70801e50-0000-4000-8000-000000000002';
const row={id:target,user_id:owner,status:'submitted',version:1,submitted_at:'2026-11-15T18:30:00.809346+00:00'};
const olderRow={...row,id:older,submitted_at:'2026-11-13T18:30:00+00:00'};
const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='controlled-learning-support-key';
const ownerToken='controlled-learning-withdraw-71-own-token',otherToken='controlled-learning-withdraw-71-other-token';
const prompt='Withdraw my learning support request.';
const exact='Withdraw my learning support request with ID '+target;
const privateContent=/PRIVATE_DETAILS|controlled-learning-|71000000-0000-4000-8000-00000000000[12]/u;
type Mutation={p_kind:string;p_payload:{id:string;expected_version:number;request_id:string}};

async function dispatch(handler:any,body:object,token=ownerToken){
  const headers=token?{authorization:'Bearer '+token}:{'x-forwarded-for':'192.0.2.217'};
  const response={statusCode:0,body:null as any,setHeader(){},status(code:number){this.statusCode=code;return this;},json(value:unknown){this.body=value;}};
  await handler({method:'POST',headers,body},response);
  return response;
}

function harness(t:TestContext,read:(params:URLSearchParams,caller:string)=>Response,write?:(mutation:Mutation,caller:string)=>Response){
  const priorUrl=process.env.VITE_SUPABASE_URL,priorKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  t.after(()=>{
    if(priorUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=priorUrl;
    if(priorKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=priorKey;
  });
  const reads:Record<string,string>[]=[],writes:{mutation:Mutation;caller:string}[]=[],unexpected:string[]=[];
  const now=Date.now.bind(Date);
  let requestTime=now()+1_000_000;
  t.mock.method(Date,'now',()=>Math.max(now(),requestTime));
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init:RequestInit)=>{
    const url=new URL(String(input)),headers=new Headers(init.headers);
    assert.equal(url.origin,origin);assert.equal(headers.get('apikey'),key);
    const token=headers.get('authorization');
    assert.ok(token==='Bearer '+ownerToken||token==='Bearer '+otherToken);
    const caller=token==='Bearer '+ownerToken?owner:other;
    if(url.pathname==='/auth/v1/user')return Response.json({id:caller,identities:[{provider:'google'}]});
    assert.equal(init.redirect,'error');
    if(url.pathname==='/rest/v1/affairs_learning_support_requests'){
      assert.equal(init.method,'GET');assert.equal(init.body,undefined);
      assert.equal(url.searchParams.get('select'),'id,user_id,status,version,submitted_at');
      assert.equal(url.searchParams.get('user_id'),'eq.'+caller);
      reads.push(Object.fromEntries(url.searchParams));
      return read(url.searchParams,caller);
    }
    if(url.pathname==='/rest/v1/rpc/affairs_change_learning_support'&&write){
      assert.equal(init.method,'POST');
      const mutation=JSON.parse(String(init.body));writes.push({caller,mutation});
      return write(mutation,caller);
    }
    unexpected.push(url.pathname);throw new Error('Unexpected transport');
  });
  const fail=(name:string)=>async()=>{unexpected.push(name);throw Error(name);};
  const handler=createAffairsAssistantHandler({loadSnapshot:fail('broad snapshot'),answerAccount:fail('model'),publicResearch:fail('public research')});
  return {reads,writes,unexpected,async ask(question=prompt,options:Record<string,unknown>={},token=ownerToken){
    requestTime+=65_000;
    return dispatch(handler,{question,route:learningSupportPath,...options},token);
  }};
}

test('the actual signed-in handler selects exact ID, sole active or an unambiguous latest owned request without writing',async t=>{
  const h=harness(t,query=>Response.json(query.has('order')&&!query.has('status')?[row,olderRow]:[row]));
  const cases=[
    [exact,'/dtm','exact'],
    [prompt,learningSupportPath,'unique'],
    ['Withdraw my latest learning-support request.',learningSupportPath,'latest'],
    ['請幫我取消我的學習輔導申請 編號 '+target+'。',learningSupportPath,'exact'],
    ['請撤回我最新的學習輔導申請。',learningSupportPath,'latest'],
  ] as const;
  for(const [question,route,mode] of cases){
    const {statusCode,body}=await h.ask(question,{route});
    assert.equal(statusCode,200,question);
    assert.deepEqual(body.verification,{status:'verified',attempts:1},question);
    assert.deepEqual(body.proposedAction.payload,{id:target,expected_version:'1'});
    assert.equal(body.proposedAction.kind,'withdraw_learning_support');
    assert.equal(body.proposedAction.url,learningSupportPath);
    assert.match(body.proposedAction.requestId,/^[a-f0-9-]{36}$/u);
    assert.match(body.proposedAction.label,/70908E50.*2026-11-16/u);
    assert.doesNotMatch(JSON.stringify(body),privateContent);
    assert.ok(body.activity.some((step:{kind:string;status:string})=>step.kind==='account-read:learningSupport:1'&&step.status==='complete'));
    assert.deepEqual(h.reads.at(-1),{select:'id,user_id,status,version,submitted_at',user_id:'eq.'+owner,limit:mode==='exact'?'1':'2',
      ...(mode==='exact'?{id:'eq.'+target}:{order:'submitted_at.desc,id.asc'}),
      ...(mode==='unique'?{status:'in.(submitted,in_review)'}:{})});
  }
  assert.equal(h.reads.length,cases.length);assert.deepEqual(h.writes,[]);assert.deepEqual(h.unexpected,[]);
});

test('guest handoff, held, compound, staff and tampered route requests cannot propose or read a withdrawal',async t=>{
  const h=harness(t,()=>assert.fail('Unsafe command reached private reader'));
  for(const [question,route] of [
    ['Withdraw all my learning support requests.',learningSupportPath],
    ['Withdraw another student’s learning support request.',learningSupportPath],
    ['Do not withdraw my learning support request.',learningSupportPath],
    ['Withdraw my learning support request and show my grades.',learningSupportPath],
    ['Withdraw my latest learning support request '+target,learningSupportPath],
    ['Withdraw my learning support request only if I say yes.',learningSupportPath],
    ['先不要撤回我的學習輔導申請。',learningSupportPath],
    [exact,learningSupportPath+'/review'],
    [exact,learningSupportPath+'?user_id='+other],
  ]){
    const {statusCode,body}=await h.ask(question,{route});
    assert.equal(statusCode,200,question);assert.equal(body.status,'clarification',question);
    assert.equal(body.proposedAction,undefined);assert.doesNotMatch(JSON.stringify(body),privateContent);
  }
  const image=await h.ask(prompt,{images:[{name:'request.png',dataUrl:'data:image/png;base64,dGVzdA=='}]});
  assert.equal(image.statusCode,400);assert.equal(image.body.proposedAction,undefined);
  assert.equal(parseExplicitAccountAction('How do I withdraw my learning support request?'),null);
  const guest=await dispatch(createResearchAssistantHandler(),{question:prompt,route:learningSupportPath},'');
  assert.equal(guest.statusCode,200);assert.equal(guest.body.status,'handoff');
  assert.equal(guest.body.proposedAction,undefined);
  assert.deepEqual(guest.body.citations.map((citation:{url:string})=>citation.url),['/school-affairs/login?next='+encodeURIComponent(learningSupportPath)]);
  assert.deepEqual(h.reads,[]);assert.deepEqual(h.writes,[]);assert.deepEqual(h.unexpected,[]);
});

test('multiple active requests, tied latest, missing, terminal, crossed and malformed records do not propose a change',async t=>{
  let rows:object[]=[];
  const h=harness(t,()=>Response.json(rows));
  for(const [records,question,status] of [
    [[row,olderRow],prompt,'clarification'],
    [[row,{...olderRow,submitted_at:row.submitted_at}],'Withdraw my latest learning support request.','clarification'],
    [[],exact,'clarification'],
    [[{...row,status:'withdrawn',version:2}],exact,'clarification'],
    [[{...row,status:'reviewed',version:3},olderRow],'Withdraw my latest learning support request.','clarification'],
    [[{...row,user_id:other}],exact,'abstained'],
    [[{...row,id:older}],exact,'abstained'],
    [[{...row,version:2}],exact,'abstained'],
    [[{...row,details:'PRIVATE_DETAILS'}],exact,'abstained'],
  ] as const){
    rows=[...records];
    const {statusCode,body}=await h.ask(question);
    assert.equal(statusCode,200,question);assert.equal(body.status,status,question);
    assert.equal(body.proposedAction,undefined);assert.doesNotMatch(JSON.stringify(body),privateContent);
  }
  assert.ok(h.reads.every(read=>read.user_id==='eq.'+owner));
  assert.deepEqual(h.writes,[]);assert.deepEqual(h.unexpected,[]);
});

test('the native action endpoint rejects crossed or stale selection and returns one durable receipt on replay',async t=>{
  let consumed:Mutation|undefined,commits=0;
  const h=harness(t,()=>Response.json([{...row,status:'in_review',version:2}]),(mutation,caller)=>{
    assert.equal(mutation.p_kind,'withdraw');
    assert.deepEqual(Object.keys(mutation.p_payload).sort(),['expected_version','id','request_id']);
    const {id,expected_version,request_id}=mutation.p_payload;
    if(caller!==owner||id!==target)return new Response(null,{status:404});
    if(consumed?.p_payload.request_id===request_id)return JSON.stringify(mutation)===JSON.stringify(consumed)
      ?Response.json({id,requestId:request_id,status:'withdrawn',version:3}):new Response(null,{status:409});
    if(consumed||expected_version!==2)return new Response(null,{status:409});
    consumed=structuredClone(mutation);commits++;
    return Response.json({id,requestId:request_id,status:'withdrawn',version:20});
  });
  const {body}=await h.ask(exact);
  assert.equal(h.writes.length,0);
  const {kind,payload,requestId}=body.proposedAction;
  const request={kind,payload:{id:payload.id,expected_version:Number(payload.expected_version),request_id:requestId}};
  assert.equal((await dispatch(confirm,request,otherToken)).statusCode,404);
  assert.equal((await dispatch(confirm,{...request,payload:{...request.payload,expected_version:1}})).statusCode,409);
  assert.equal(commits,0);
  assert.equal((await dispatch(confirm,request)).statusCode,503);
  assert.equal(commits,1);
  for(let replay=0;replay<2;replay++){
    const checked=await dispatch(confirm,request);
    assert.equal(checked.statusCode,200);
    assert.deepEqual(checked.body,{id:target,requestId,status:'withdrawn',version:3});
  }
  assert.deepEqual(h.writes.slice(2).map(write=>write.mutation),Array.from({length:3},()=>consumed));
  assert.equal(commits,1);assert.deepEqual(h.unexpected,[]);
});

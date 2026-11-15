import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOwnAffairsStudyYear as load,ownAffairsStudyYearLimits} from '../../server/ownAffairsStudyYear.js';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';

const owner='49100000-0000-4000-8000-000000000001',foreign='49100000-0000-4000-8000-000000000002';
const account={user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN'};
const row=()=>({user_id:owner,year_level:3,source_mode:'sample'});
const response=(rows:unknown=[row()],range='0-0/1')=>Response.json(rows,{headers:{'content-range':range}});
function transport(makeResponse:()=>Response|Promise<Response>=response){
  const calls:{url:URL;init:RequestInit|undefined}[]=[];
  const fetchImpl:typeof fetch=async(input,init)=>{calls.push({url:new URL(String(input)),init});return makeResponse();};
  return {calls,fetchImpl};
}
const read=(value:Parameters<typeof load>[0],options:Parameters<typeof load>[1]={},io:ReturnType<typeof transport>=transport())=>load(value,options,{fetchImpl:io.fetchImpl});
const denied=(promise:Promise<unknown>,status=503)=>assert.rejects(promise,(error:unknown)=>error instanceof AffairsWorkspaceError&&error.status===status&&!/OFFLINE_|PRIVATE_|FOREIGN_/u.test(error.message));

test('one exact caller GET exposes literal year and provenance only, without profile/catalog or initializer work',async()=>{
  const io=transport(),out=await read(account,{},io);
  assert.equal(io.calls.length,1);const {url,init}=io.calls[0];
  assert.equal(url.origin,account.url);assert.equal(url.pathname,'/rest/v1/affairs_students');
  assert.deepEqual([...url.searchParams],[['select','user_id,year_level,source_mode'],['user_id','eq.'+owner],['limit','1']]);
  assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(init?.body,undefined);
  const headers=new Headers(init?.headers);assert.deepEqual([...headers],[['apikey','OFFLINE_KEY'],['authorization','Bearer OFFLINE_TOKEN'],['prefer','count=exact']]);
  assert.deepEqual({...out,checkedAt:'TIME'},{profile:{userId:owner},checkedAt:'TIME',source:'stu.best School Affairs',officialUniversityData:false,
    studentRecordFound:true,student:{yearLevel:3,sourceMode:'sample'}});
  assert.equal(new Date(out.checkedAt).toISOString(),out.checkedAt);
  assert.doesNotMatch(JSON.stringify(out),/OFFLINE_|student_number|full_name|email|program|courses|grades|attendance|token|key/u);
});

test('all schema years and both provenance modes are literal, with no inference of official synchronization',async()=>{
  for(const year_level of [1,2,3,4,5,6,7,8])for(const source_mode of ['sample','verified']){
    const io=transport(()=>response([{user_id:owner,year_level,source_mode}]));
    const out=await read(account,{},io);assert.deepEqual(out.student,{yearLevel:year_level,sourceMode:source_mode});assert.equal(out.officialUniversityData,false);
  }
});

test('successful zero-row receipt is explicitly unlinked, while unavailable responses never return missing data',async()=>{
  const out=await read(account,{},transport(()=>response([],'*/0')));
  assert.equal(out.studentRecordFound,false);assert.equal(out.student,null);
  for(const status of [401,403,404,429,500])await denied(read(account,{},transport(()=>new Response('PRIVATE_RESPONSE',{status}))),[401,403].includes(status)?403:503);
  await denied(read(account,{},transport(()=>new Response(null,{status:204}))));
});

test('exact range and total proof rejects duplicate/truncated/contradictory receipts',async()=>{
  for(const range of ['', '*/1','0-0/*','0-0/2','1-1/1','0-1/1','0-0/0','0-0/9007199254740992']){
    await denied(read(account,{},transport(()=>response([row()],range))));
  }
  await denied(read(account,{},transport(()=>Response.json([row()]))));
  for(const rows of [[row(),row()],[],null,{}])await denied(read(account,{},transport(()=>response(rows))));
  await denied(read(account,{},transport(()=>response([row()],'*/0'))));
});

test('wrong caller, impossible/null years, changed provenance and extra private fields are rejected',async()=>{
  for(const bad of [null,0,false,'row',[],{...row(),user_id:foreign},{...row(),user_id:null},{year_level:3,source_mode:'sample'},
    {...row(),year_level:0},{...row(),year_level:9},{...row(),year_level:3.5},{...row(),year_level:'3'},{...row(),year_level:null},
    {...row(),source_mode:'official'},{...row(),source_mode:null},{...row(),full_name:'PRIVATE_NAME'},{...row(),student_number:'PRIVATE_NUMBER'}]){
    await denied(read(account,{},transport(()=>response([bad]))));
  }
});

test('malformed JSON, UTF8, oversized receipt and streamed multibyte body all fail safely',async()=>{
  for(const make of [()=>new Response('{PRIVATE_BAD'),()=>new Response(new Uint8Array([0xff])),
    ()=>new Response('[]',{headers:{'content-range':'*/0','content-length':String(ownAffairsStudyYearLimits.responseBytes+1)}}),
    ()=>new Response(' '.repeat(ownAffairsStudyYearLimits.responseBytes+1)),()=>Response.json([{...row(),extra:'界'.repeat(1500)}])])await denied(read(account,{},transport(make)));
  let cancelled=false;
  const streamed=()=>new Response(new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode(' '.repeat(4097)));},cancel(){cancelled=true;}}));
  await denied(read(account,{},transport(streamed)));assert.equal(cancelled,true);
});

test('verified account, options, dependency and primitive owner checks fail before transport or coercion',async()=>{
  const io=transport();let accessed=0;
  const getter=Object.defineProperty({},'id',{get(){accessed++;return owner;}});
  const coercible={toString(){accessed++;return owner;}};
  for(const value of [null,[],{...account,url:'https://other.example'},{...account,url:account.url+'/'},{...account,token:''},{...account,key:'OFFLINE_\nKEY'},
    {...account,user:{id:coercible}},{...account,user:getter},{...account,user:{id:'49100000-0000-4000-8000-NOT_UUID____'}}]){
    await denied(read(value as Parameters<typeof load>[0],{},io),403);
  }
  for(const options of [null,[],{userId:foreign},{deadline:NaN},{deadline:Infinity},{deadline:'today'}])await denied(read(account,options as Parameters<typeof load>[1],io));
  for(const dependencies of [null,[],{fetchImpl:1},{fetchImpl:io.fetchImpl,userId:foreign}])await denied(load(account,{},dependencies as Parameters<typeof load>[2]));
  assert.equal(io.calls.length,0);assert.equal(accessed,0);
});

test('credentials, caller, deadline and injected transport are captured synchronously',async()=>{
  const original=structuredClone(account),io=transport(),dependencies={fetchImpl:io.fetchImpl},options={deadline:Date.now()+1000};
  const pending=load(original,options,dependencies);
  original.user.id=foreign;original.key='FOREIGN_KEY';original.token='FOREIGN_TOKEN';original.url='https://foreign.example';options.deadline=0;
  dependencies.fetchImpl=async()=>{throw new Error('PRIVATE_WRONG_TRANSPORT');};
  const out=await pending;assert.equal(out.profile.userId,owner);assert.equal(io.calls.length,1);
  assert.equal(io.calls[0].url.searchParams.get('user_id'),'eq.'+owner);assert.equal(io.calls[0].url.origin,account.url);
  assert.equal(new Headers(io.calls[0].init?.headers).get('authorization'),'Bearer OFFLINE_TOKEN');
});

test('inherited/request deadlines expire before transport, including attempted deadline extension',async()=>{
  const io=transport();
  await denied(read(account,{deadline:Date.now()-1},io));
  await denied(read({...account,requestDeadline:Date.now()-1},{deadline:Date.now()+100000},io));
  await denied(read({...account,requestDeadline:NaN},{},io));assert.equal(io.calls.length,0);
});

test('deadline bounds uncooperative fetch and stalled streams; a late response is cancelled',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
  const processPending=()=>new Promise<void>(resolve=>setImmediate(resolve));
  const expire=async(pending:ReturnType<typeof load>)=>{
    const rejected=denied(pending);
    await processPending();
    t.mock.timers.tick(30);
    await rejected;
  };
  let signal:AbortSignal|undefined;
  const never:typeof fetch=async(_input,init)=>{signal=init?.signal??undefined;return new Promise(()=>{});};
  await expire(load(account,{deadline:Date.now()+30},{fetchImpl:never}));assert.equal(signal?.aborted,true);
  let cancelled=false;
  await expire(read(account,{deadline:Date.now()+30},transport(()=>new Response(new ReadableStream({cancel(){cancelled=true;}})))));assert.equal(cancelled,true);
  let settle:(value:Response)=>void=()=>{};let lateCancelled=false;
  const pending=load(account,{deadline:Date.now()+30},{fetchImpl:async()=>new Promise(resolve=>{settle=resolve;})});
  await expire(pending);
  settle(new Response(new ReadableStream({cancel(){lateCancelled=true;}})));
  await processPending();assert.equal(lateCancelled,true);
});

test('transport exceptions and redirects cannot disclose internal errors or credential text',async()=>{
  await denied(read(account,{},transport(()=>{throw new Error('PRIVATE_FAILURE OFFLINE_TOKEN');})));
  await denied(read(account,{},transport(()=>new Response(null,{status:302,headers:{location:'https://foreign.example/PRIVATE'}}))));
});

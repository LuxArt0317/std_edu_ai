import assert from 'node:assert/strict';
import {after, beforeEach, test} from 'node:test';
import affairsHandler, {createAffairsAssistantHandler, dispatchPublicResearch} from '../../api/affairs-assistant.ts';
import {createAssistantStream} from '../../server/assistantStream.js';

type PublicHandler=NonNullable<NonNullable<Parameters<typeof createAffairsAssistantHandler>[0]>['publicResearch']>;
const originalFetch=globalThis.fetch;
const names=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','OPENAI_API_KEY'] as const;
const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
const token='Bearer '+'x'.repeat(40);
let sequence=0;
beforeEach(()=>{
  process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY='synthetic-publishable';
  process.env.OPENAI_API_KEY='synthetic-model-key';
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),'https://xiftudmvxphxcjtmfmib.supabase.co/auth/v1/user','No public HTTP hop or private database read is allowed in these fixtures.');
    assert.equal((init?.headers as Record<string,string>).Authorization,token);
    return Response.json({id:`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,identities:[{provider:'google'}]});
  };
});
after(()=>{globalThis.fetch=originalFetch;for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}});

async function invoke(handler:typeof affairsHandler,body:Record<string,unknown>,options:{authorization?:string;headers?:Record<string,string>;method?:string}={}) {
  const result:{status:number;body:unknown;headers:Record<string,string>;chunks:string[];ends:number}={status:200,body:null,headers:{},chunks:[],ends:0};
  const response={
    status(code:number){result.status=code;return response;},
    json(value:unknown){result.body=value;},
    setHeader(name:string,value:string){result.headers[name.toLowerCase()]=value;},
    write(chunk:string){result.chunks.push(chunk);},
    end(){result.ends++;},
  };
  await handler({method:options.method??'POST',body,headers:{authorization:options.authorization??token,'x-forwarded-for':`qa-public-dispatch-${++sequence}`,...options.headers}},response);
  return result;
}
function frames(chunks:string[]) {
  return chunks.join('').trim().split('\n\n').map(frame=>({event:frame.match(/^event: (.+)$/m)?.[1],data:JSON.parse(frame.match(/^data: (.+)$/m)?.[1]??'null') as Record<string,unknown>}));
}
const generic={question:'Explain campus facilities.',route:'/'};
const answer={status:'answered',answer:'Candidate public answer.',citations:[],grounding:{source:'candidate-public'}};

test('default signed-in public lookup runs the actual local directory handler without a production request',async()=>{
  for(const stream of [false,true]) {
    const result=await invoke(affairsHandler,{question:'What is on this page?',route:'/school-affairs/menu/swd/input',stream});
    assert.equal(result.status,200);
    const payload=stream?frames(result.chunks).at(-1)?.data:result.body as Record<string,unknown>;
    assert.equal((payload?.grounding as Record<string,unknown>).source,'directory');
    assert.equal((payload?.citations as unknown[]).length,3);
    assert.match(String(payload?.answer),/場地借用/);
    assert.equal(result.ends,stream?1:0);
  }
});

test('candidate dispatcher forwards only public fields and an allowlisted rate-limit address',async()=>{
  const requests:Array<Parameters<PublicHandler>[0]>=[];
  const handler=createAffairsAssistantHandler({publicResearch:async(request,response)=>{
    requests.push(structuredClone(request));
    response.setHeader('Cache-Control','public, max-age=86400');
    response.setHeader('Set-Cookie','ignored=1');
    response.status(200).json(answer);
  }});
  const result=await invoke(handler,{...generic,history:[{role:'assistant',content:'private-course'}],account:{private:'private-note'},sessionToken:'private-session',consentedResearchUse:true,
    images:[{name:'campus.png',dataUrl:'data:image/png;base64,synthetic',privateNote:'private-note'}]},
    {headers:{'x-forwarded-for':'203.0.113.9',host:'attacker.invalid',origin:'https://attacker.invalid','x-forwarded-host':'attacker.invalid',cookie:'secret-cookie'}});
  // Assert outside the bridge: a fixture assertion thrown inside the handler
  // becomes its safe503 response and hides the actual public-contract mismatch.
  assert.equal(requests.length,1);
  const request=requests[0];
  assert.equal(request.method,'POST');
  assert.deepEqual(request.headers,{'content-type':'application/json','x-forwarded-for':'203.0.113.9'});
  // The validated root route remains '/', retaining the public page context.
  assert.deepEqual(request.body,{...generic,history:[],images:[{name:'campus.png',dataUrl:'data:image/png;base64,synthetic'}],consentedResearchUse:false,stream:false});
  assert.doesNotMatch(JSON.stringify(request),/private-course|private-session|secret-cookie|attacker|Bearer|private-note/);
  assert.deepEqual(result.body,answer);
  assert.equal(result.headers['cache-control'],'no-store, max-age=0');
  assert.equal(result.headers['set-cookie'],undefined);
});

test('method, input and authentication checks happen before public dispatch',async()=>{
  let calls=0;
  const handler=createAffairsAssistantHandler({publicResearch:async()=>{calls++;}});
  assert.equal((await invoke(handler,generic,{method:'GET'})).status,405);
  assert.equal((await invoke(handler,{question:'x'})).status,400);
  assert.equal((await invoke(handler,generic,{authorization:''})).status,401);
  assert.equal(calls,0);
});

test('private record questions and personal follow-ups cannot enter public research',async()=>{
  let calls=0;
  const handler=createAffairsAssistantHandler({publicResearch:async()=>{calls++;}});
  for(const input of [
    {question:'What are my grades?',route:'/dtm'},
    {question:'How much is my tuition?',route:'/school-affairs'},
    {question:'Show graduation status and academic attendance statistics',route:'/school-affairs'},
    {question:'And tomorrow?',route:'/',history:[{role:'user',content:'What classes do I have today?'}]},
  ]) {
    const result=await invoke(handler,{...input,images:[{name:'private.png',dataUrl:'synthetic'}]});
    assert.equal(result.status,400,String(result.body));
    assert.match(String((result.body as Record<string,unknown>).error),/private account questions/);
  }
  assert.equal(calls,0);
});

test('SSE public progress and final payload survive split UTF-8 frames inside the outer stream',async()=>{
  const progress={kind:'knowledge',label:'搜尋學校資訊',detail:'Local candidate evidence',status:'complete'};
  const payload={...answer,activity:[progress],verification:{status:'verified',attempts:1}};
  const handler=createAffairsAssistantHandler({publicResearch:async(_request,response)=>{
    response.status(200);response.setHeader('Content-Type','text/event-stream; charset=utf-8');response.flushHeaders?.();
    const data=`event: progress\ndata: ${JSON.stringify(progress)}\n\nevent: result\ndata: ${JSON.stringify(payload)}\n\n`;
    const boundary=data.indexOf('學');response.write?.(data.slice(0,boundary));response.write?.(data.slice(boundary));response.end?.();
  }});
  const result=await invoke(handler,{...generic,stream:true});
  assert.equal(result.ends,1);assert.match(result.headers['content-type'],/text\/event-stream/);
  const events=frames(result.chunks);
  assert.deepEqual(events.map(event=>event.event),['progress','progress','progress','result']);
  assert.deepEqual(events[1].data,progress);assert.deepEqual(events.at(-1)?.data,payload);
});

test('public JSON error status remains intact, and existing SSE errors stay safe and terminal',async()=>{
  for(const code of [400,429,503]) {
    const handler=createAffairsAssistantHandler({publicResearch:async(_request,response)=>{response.status(code).json({error:'Public validation or rate limit.'});}});
    const result=await invoke(handler,generic);assert.equal(result.status,code);assert.deepEqual(result.body,{error:'Public validation or rate limit.'});
  }
  const handler=createAffairsAssistantHandler({publicResearch:async(_request,response)=>{createAssistantStream(true,response).send(502,{error:'Internal provider detail must not escape.'});}});
  const result=await invoke(handler,{...generic,stream:true});
  assert.equal(result.ends,1);const terminal=frames(result.chunks).at(-1)!;
  assert.equal(terminal.event,'error');assert.deepEqual(terminal.data,{error:'School research is temporarily unavailable. Please try again.'});
});

test('invalid public response shapes and unsuccessful responses without an error cannot become success',async()=>{
  for(const [code,payload] of [[200,null],[200,[]],[200,'text'],[502,{answer:'Pretend success'}]] as const) {
    const handler=createAffairsAssistantHandler({publicResearch:async(_request,response)=>{response.status(code).json(payload);}});
    const result=await invoke(handler,generic);assert.equal(result.status,502);assert.deepEqual(result.body,{error:'School research returned an invalid response.'});
  }
});

test('throwing, incomplete and oversized handlers fail rather than hanging or forwarding unbounded output',async()=>{
  const handlers:PublicHandler[]=[
    async()=>{throw new Error('private internal exception');},
    async()=>{},
    async(_request,response)=>{response.json({answer:'中'.repeat(100_001)});},
    async(_request,response)=>{response.setHeader('Content-Type','text/event-stream');response.write?.('x'.repeat(300_001));},
  ];
  for(const publicResearch of handlers) {
    const result=await invoke(createAffairsAssistantHandler({publicResearch}),generic);
    assert.equal(result.status,503);assert.deepEqual(result.body,{error:'School research is temporarily unavailable. Please try again.'});
  }
});

test('in-process deadline closes the bridge and ignores late public progress and completion',async()=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const progress:unknown[]=[];
  const handler:PublicHandler=async(_request,response)=>{
    const stream=createAssistantStream(true,response);
    stream.progress('knowledge','Started','A synthetic delayed source.');
    await gate;
    stream.progress('knowledge','Late','Must not reach the closed outer response.','complete');stream.send(200,answer);
  };
  await assert.rejects(dispatchPublicResearch(handler,{method:'POST',body:{},headers:{}},Date.now()+15,step=>progress.push(step)),/deadline exceeded/);
  assert.equal(progress.length,1);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(progress.length,1);
});

test('expired deadlines do not invoke the public handler',async()=>{
  let calls=0;await assert.rejects(dispatchPublicResearch(async()=>{calls++;},{headers:{}},Date.now()-1,()=>{}),/deadline exceeded/);assert.equal(calls,0);
});

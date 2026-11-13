import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import type {AssistantMessage} from '../../src/services/assistantConversation';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLButtonElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','sessionStorage'])
  Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const owner='10000000-0000-4000-8000-000000000001',scope='account:'+owner;
Object.defineProperty(globalThis,'__assistantHookSession',{configurable:true,value:{data:{session:{user:{id:owner},access_token:'synthetic-token'}},error:null}});
const loader=registerHooks({load(url,context,next){
  return /\/affairs\/authClient\.ts$/.test(url)
    ? {format:'module',source:'export const affairsClient={auth:{getSession:async()=>globalThis.__assistantHookSession}};',shortCircuit:true}
    : next(url,context);
}});
const {useAssistantSessions}=await import('../../src/features/public/useAssistantSessions');
loader.deregister();
const {render,cleanup,waitFor,act,fireEvent}=await import('@testing-library/react');
const originalFetch=globalThis.fetch;
afterEach(()=>{cleanup();sessionStorage.clear();globalThis.fetch=originalFetch;});

let state:ReturnType<typeof useAssistantSessions>;
function Harness(){
  state=useAssistantSessions(scope);
  return <div>
    <output data-testid="message-ids">{state.messages.map(message=>message.id).join(',')}</output>
    {state.messages.map(message=><article key={message.id} data-message={message.id}>{message.content}</article>)}
    {state.syncError?<p role="alert">{state.syncError}</p>:null}
    <button onClick={state.retrySync}>Retry save</button>
  </div>;
}
function transport(){
  const writes:Array<{id:string;title:string;version:number;messages:AssistantMessage[]}>=[];
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),'/api/affairs-conversations');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-token');
    if(init?.method==='POST'){
      const body=JSON.parse(String(init.body));writes.push(body);
      return Response.json({...body,version:body.version+1,updated_at:'2026-11-13T00:00:00Z'});
    }
    assert.equal(init?.method,'GET');return Response.json({conversations:[]});
  };
  return writes;
}
async function mount(){const view=render(<Harness/>);await waitFor(()=>assert.ok(state.active));return view;}
const alternating=(count:number):AssistantMessage[]=>Array.from({length:count},(_,index)=>({id:String(index),role:index%2?'assistant':'user',content:'Message '+index}));

test('live hook prunes25messages at a user boundary and preserves the next full turn',async()=>{
  transport();const view=await mount(),input=alternating(25);
  await act(async()=>state.setMessages(input));
  assert.equal(state.messages.length,23);assert.equal(state.messages[0].id,'2');assert.equal(state.messages[0].role,'user');
  assert.equal(view.container.querySelector('[data-message="1"]'),null);assert.ok(view.container.querySelector('[data-message="2"]'));
  assert.equal(input.length,25);
  await act(async()=>state.setMessages(previous=>[...previous,{id:'25',role:'assistant',content:'New answer'}]));
  assert.equal(state.messages.length,24);assert.equal(state.messages[0].id,'2');assert.equal(state.messages.at(-1)?.id,'25');
});

test('live action payloads and image bytes survive pruning while the saved copy excludes both',async()=>{
  const writes=transport(),view=await mount(),input=alternating(26);
  const action={kind:'create_task' as const,label:'Create reminder',payload:{title:'Synthetic reminder'},requestId:'synthetic-action'};
  const image={name:'synthetic.png',dataUrl:'data:image/png;base64,U1lOVEhFVElD'};
  input[24].images=[image];input[25].result={answer:'New answer',status:'answered',citations:[],suggestedQuestions:[],proposedAction:action};
  await act(async()=>state.setMessages(input));
  assert.equal(state.messages[0].id,'2');assert.equal(state.messages.at(-1)?.result?.proposedAction,action);
  assert.equal(state.messages.find(message=>message.id==='24')?.images?.[0],image);
  await waitFor(()=>assert.equal(writes.length,1));
  assert.doesNotMatch(JSON.stringify(writes[0]),/dataUrl|proposedAction|synthetic-action/);
  assert.equal(writes[0].messages.at(-1)?.actionExpired,true);
  assert.equal(state.messages.at(-1)?.result?.proposedAction,action);assert.equal(state.messages.find(message=>message.id==='24')?.images?.[0].dataUrl,image.dataUrl);
  assert.equal(view.queryByRole('alert'),null);
});

test('oversized valid response metadata reports an unsaved error without crashing or losing its8000-character answer',async()=>{
  const writes=transport(),view=await mount(),answer='課'.repeat(8000);
  const views=Array.from({length:3},()=>({id:'v',title:'View',url:'/dtm',columns:['a','b','c','d','e'],rows:Array.from({length:12},()=>Array<string>(5).fill('課'.repeat(200))),total:12,checkedAt:'2026-11-13',note:''}));
  const citations=Array.from({length:12},()=>({url:'/dtm',chunkId:'c',title:'課'.repeat(200),claim:'課'.repeat(300),sourceName:'課'.repeat(160),locator:'課'.repeat(500),effectiveAt:null,reviewedAt:null}));
  const result={answer,status:'answered' as const,citations,views,suggestedQuestions:[]};
  await act(async()=>state.setMessages([{id:'u',role:'user',content:'Show my records'},{id:'a',role:'assistant',content:answer,result}]));
  assert.match(view.getByRole('alert').textContent??'',/too large to save.*answer remains visible/);
  assert.equal(view.container.querySelector('[data-message="a"]')?.textContent,answer);assert.equal(state.messages[1].result,result);assert.equal(writes.length,0);assert.equal(state.syncing,false);
  fireEvent.click(view.getByRole('button',{name:'Retry save'}));
  await waitFor(()=>assert.match(view.getByRole('alert').textContent??'',/too large to save/));
  assert.equal(state.messages[1].content,answer);assert.equal(writes.length,0);
  await act(async()=>state.setMessages([{id:'u2',role:'user',content:'A smaller question'},{id:'a2',role:'assistant',content:'A smaller answer'}]));
  fireEvent.click(view.getByRole('button',{name:'Retry save'}));
  await waitFor(()=>assert.equal(writes.length,1));assert.equal(view.queryByRole('alert'),null);assert.equal(writes[0].messages[1].content,'A smaller answer');
});

test('one oversized live turn remains complete and surfaces storage limits instead of dropping its user',async()=>{
  const writes=transport(),view=await mount();
  const messages:AssistantMessage[]=[{id:'u',role:'user',content:'Keep this question'},...Array.from({length:25},(_,index)=>({id:'a'+index,role:'assistant' as const,content:'Continuation '+index}))];
  await act(async()=>state.setMessages(messages));
  assert.equal(state.messages.length,26);assert.equal(state.messages[0].id,'u');assert.equal(state.messages.at(-1)?.id,'a24');
  assert.match(view.getByRole('alert').textContent??'',/too large to save/);assert.ok(view.getByText('Keep this question'));assert.equal(writes.length,0);
});

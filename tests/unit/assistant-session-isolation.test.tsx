import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
import type {AssistantMessage} from '../../src/services/assistantConversation';
import type {AssistantSession} from '../../src/services/assistantSessions';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLButtonElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','sessionStorage'])
  Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const owner='10000000-0000-4000-8000-000000000001',accountScope='account:'+owner;
Object.defineProperty(globalThis,'__assistantIsolationSession',{configurable:true,value:{data:{session:{user:{id:owner},access_token:'synthetic-token'}},error:null}});
const loader=registerHooks({load(url,context,next){return /\/affairs\/authClient\.ts$/.test(url)
  ? {format:'module',source:'export const affairsClient={auth:{getSession:async()=>globalThis.__assistantIsolationSession}};',shortCircuit:true}:next(url,context);}});
const {useAssistantSessions}=await import('../../src/features/public/useAssistantSessions');
const {readAssistantSessions,saveAssistantSessions}=await import('../../src/services/assistantSessions');
loader.deregister();
const {render,cleanup,waitFor,act}=await import('@testing-library/react');
const originalFetch=globalThis.fetch;
afterEach(()=>{cleanup();sessionStorage.clear();globalThis.fetch=originalFetch;});

let state:ReturnType<typeof useAssistantSessions>;
const localChat=(id:string)=>state.conversations.find(chat=>chat.id===id) as AssistantSession|undefined;
function Harness({scope}:{scope:string}){
  state=useAssistantSessions(scope);
  return <div><p role="status">{state.persistenceStatus}</p>{state.syncError?<p role="alert">{state.syncError}</p>:null}
    {state.messages.map(message=><article key={message.id}>{message.content}</article>)}</div>;
}
const simple=(label:string):AssistantMessage[]=>[{id:'u-'+label,role:'user',content:label},{id:'a-'+label,role:'assistant',content:'Answer '+label}];
const oversized=():AssistantMessage[]=>[
  {id:'oversized-user',role:'user',content:'Keep my complete conversation'},
  ...Array.from({length:25},(_,index)=>({id:'oversized-'+index,role:'assistant' as const,content:'Unsaved continuation '+index})),
];
function transport(failedIds=new Set<string>()){
  const writes:Array<{id:string;title:string;version:number;messages:AssistantMessage[]}>=[];
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),'/api/affairs-conversations');
    if(init?.method==='POST'){
      const body=JSON.parse(String(init.body));writes.push(body);
      if(failedIds.has(body.id))return Response.json({error:'Synthetic account save failed.'},{status:503});
      return Response.json({...body,version:body.version+1,updated_at:'2026-11-13T00:00:00Z'});
    }
    assert.equal(init?.method,'GET');return Response.json({conversations:[]});
  };
  return writes;
}
async function mount(scope=accountScope){const view=render(<Harness scope={scope}/>);await waitFor(()=>assert.ok(state.active));return view;}

test('an oversized account chat cannot block a new valid chat; editing the invalid chat recovers automatically',async()=>{
  const writes=transport(),view=await mount();
  const oldId=state.active!.id,big=oversized();
  const image={name:'Synthetic attachment',dataUrl:'data:image/png;base64,U1lOVEhFVElD'};
  const action={kind:'create_task' as const,label:'Save reminder',payload:{title:'Keep live action'},requestId:'synthetic-action'};
  big[0].images=[image];big[25].result={status:'answered',answer:'Unsaved continuation 24',citations:[],suggestedQuestions:[],proposedAction:action};
  await act(async()=>state.setMessages(big));
  assert.match(view.getByRole('alert').textContent??'',/too large to save/);
  assert.match(view.getByRole('status').textContent??'',/only in memory.*lost on reload/);
  await act(async()=>state.newChat());
  const newId=state.active!.id;assert.notEqual(newId,oldId);
  await act(async()=>state.setMessages(simple('New valid question')));
  await waitFor(()=>assert.equal(writes.length,1));
  await waitFor(()=>assert.match(state.persistenceStatus,/saved to your private account/));
  assert.equal(writes[0].id,newId);assert.equal(view.queryByRole('alert'),null);
  assert.deepEqual(localChat(oldId)?.messages,big);
  assert.equal(localChat(oldId)?.messages[0].images?.[0],image);
  assert.equal(localChat(oldId)?.messages[25].result?.proposedAction,action);
  assert.ok(state.unsavedConversationIds.includes(oldId));
  assert.ok(readAssistantSessions(accountScope).chats.some(chat=>chat.id===newId));
  await act(async()=>state.chooseChat(oldId));
  assert.equal(state.messages.length,26);assert.match(view.getByRole('alert').textContent??'',/too large to save/);
  await act(async()=>state.setMessages(simple('Edited smaller question')));
  await waitFor(()=>assert.equal(writes.length,2));
  assert.equal(writes[1].id,oldId);assert.equal(writes[1].messages[1].content,'Answer Edited smaller question');
  await waitFor(()=>assert.equal(view.queryByRole('alert'),null));
  assert.ok(!state.unsavedConversationIds.includes(oldId));
});

test('public uncached chats get a truthful warning while another chat remains cacheable',async()=>{
  globalThis.fetch=async()=>{throw new Error('Public chats must never use account storage.');};
  const view=await mount('public'),oldId=state.active!.id;
  await act(async()=>state.setMessages(oversized()));
  assert.match(view.getByRole('status').textContent??'',/only in memory.*lost on reload/);
  assert.match(view.getByRole('alert').textContent??'',/answer remains visible/);
  await act(async()=>state.newChat());
  const validId=state.active!.id;
  await act(async()=>state.setMessages(simple('Public valid question')));
  assert.match(view.getByRole('status').textContent??'',/saved in this browser tab/);assert.equal(view.queryByRole('alert'),null);
  const saved=readAssistantSessions('public');assert.ok(saved.chats.some(chat=>chat.id===validId));assert.ok(!saved.chats.some(chat=>chat.id===oldId));
  await act(async()=>state.chooseChat(oldId));
  assert.equal(state.messages.length,26);assert.match(view.getByRole('status').textContent??'',/only in memory/);
  await act(async()=>state.setMessages(simple('Public recovered question')));
  assert.equal(view.queryByRole('alert'),null);assert.match(state.persistenceStatus,/saved in this browser tab/);
  assert.equal(readAssistantSessions('public').chats.find(chat=>chat.id===oldId)?.messages[1].content,'Answer Public recovered question');
});

test('an invalid edit preserves that chat’s earlier cached copy without blocking another chat',async()=>{
  transport();const view=await mount('public'),id=state.active!.id;
  await act(async()=>state.setMessages(simple('Earlier valid copy')));
  await act(async()=>state.setMessages(oversized()));
  assert.match(view.getByRole('status').textContent??'',/Latest changes are not cached.*earlier copy/);
  assert.equal(readAssistantSessions('public').chats.find(chat=>chat.id===id)?.messages[1].content,'Answer Earlier valid copy');
  assert.equal(state.messages.length,26);
  await act(async()=>state.newChat());
  await act(async()=>state.setMessages(simple('Other cached copy')));
  const stored=readAssistantSessions('public');
  assert.equal(stored.chats.find(chat=>chat.id===id)?.messages[1].content,'Answer Earlier valid copy');
  assert.equal(stored.chats.find(chat=>chat.id===state.active!.id)?.messages[1].content,'Answer Other cached copy');
  assert.equal(localChat(id)?.messages.length,26);
});

test('one failed account POST does not block other chats or repeatedly retry; editing retries only that chat',async()=>{
  const failures=new Set<string>(),writes=transport(failures),view=await mount(),oldId=state.active!.id;
  failures.add(oldId);
  await act(async()=>state.setMessages(simple('First account question')));
  await waitFor(()=>assert.match(state.syncError,/Synthetic account save failed/));assert.equal(writes.length,1);
  await act(async()=>state.newChat());
  await act(async()=>state.setMessages(simple('Second account question')));
  await waitFor(()=>assert.equal(writes.length,2));
  await waitFor(()=>assert.equal(state.syncing,false));
  assert.notEqual(writes[1].id,oldId);assert.equal(view.queryByRole('alert'),null);
  await act(async()=>state.chooseChat(oldId));assert.match(state.syncError,/Synthetic account save failed/);
  failures.delete(oldId);
  await act(async()=>state.setMessages(simple('Edited account question')));
  await waitFor(()=>assert.equal(writes.length,3));
  await waitFor(()=>assert.equal(view.queryByRole('alert'),null));
  assert.equal(writes[2].id,oldId);assert.equal(state.conversations.length,2);
});

test('twenty live conversations are never silently evicted to create a new one',async()=>{
  transport();await mount('public');
  for(let i=0;i<20;i++){
    if(i)await act(async()=>state.newChat());
    await act(async()=>state.setMessages(i===0?oversized():simple('Question '+i)));
  }
  const before=state.conversations.map(chat=>chat.id),activeId=state.active!.id;
  await act(async()=>state.newChat());
  assert.equal(state.active!.id,activeId);assert.deepEqual(state.conversations.map(chat=>chat.id),before);
  assert.match(state.syncError,/20 conversations/);assert.ok(state.conversations.some(chat=>localChat(chat.id)?.messages.length===26));
});

test('storage isolates malformed cached rows and a blocked write reports actual old copies',()=>{
  const key='stu-campus-assistant-sessions-v2';
  const old={id:'old',title:'Old',version:1,updatedAt:'2026-11-13',messages:simple('Old saved question')};
  sessionStorage.setItem(key,JSON.stringify({scope:'public',activeId:'bad',chats:[{...old,id:'bad',messages:oversized()},old]}));
  assert.deepEqual(readAssistantSessions('public').chats.map(chat=>chat.id),['old']);
  sessionStorage.setItem(key,JSON.stringify({scope:'public',activeId:'old',chats:[old]}));
  const prototype=Object.getPrototypeOf(sessionStorage),original=prototype.setItem;
  prototype.setItem=()=>{throw new DOMException('Synthetic quota limit','QuotaExceededError');};
  try{
    const report=saveAssistantSessions('public',{activeId:'new',chats:[{...old,messages:simple('Unsaved edit')},{...old,id:'new'}]});
    assert.equal(report.chats.old.status,'previous');assert.equal(report.chats.new.status,'uncached');
    assert.match(report.chats.new.error,/could not be saved/);
    assert.equal(readAssistantSessions('public').chats[0].messages[1].content,'Answer Old saved question');
  }finally{prototype.setItem=original;}
});

test('the actual assistant renders persistence status and retains final activity snapshot reconciliation',async()=>{
  const source=await readFile(new URL('../../src/features/public/PublicAssistant.tsx',import.meta.url),'utf8');
  assert.match(source,/sessions\.persistenceStatus/);assert.match(source,/sessions\.unsavedConversationIds\.includes\(chat\.id\)/);
  assert.doesNotMatch(source,/Saved in this tab; account sync needs attention/);
  assert.match(source,/finishAssistantActivity\(mergeFinalAssistantActivity\(item\.activity,result\.activity\)\)/);
});

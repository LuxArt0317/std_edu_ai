import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';
import {mergeAssistantActivity,mergeFinalAssistantActivity,finishAssistantActivity,sanitizeAssistantMessages,saveAssistantConversation,readAssistantConversation} from '../../src/services/assistantConversation.ts';

const steps=Array.from({length:40},(_,index)=>({kind:`account-read:record${index}:2`,label:`Checked record ${index}`,detail:'Read the owned record; checked its source.',status:'complete' as const}));
const messages=()=>[{id:'u',role:'user' as const,content:'What is in my records?'},
  {id:'a',role:'assistant' as const,content:'Your checked answer.',phase:'complete' as const,activity:steps,
    result:{answer:'Your checked answer.',status:'answered' as const,citations:[],suggestedQuestions:[],activity:steps,verification:{status:'verified' as const,attempts:2}}}];

test('forty operation entries survive browser sanitation, server storage and restored conversation',()=>{
  const client=sanitizeAssistantMessages(messages());
  const stored=sanitizeStoredConversation(client);
  const restored=sanitizeAssistantMessages(JSON.parse(JSON.stringify(stored)),true);
  assert.deepEqual(restored[1].activity,steps);assert.deepEqual(restored[1].result?.activity,steps);
  assert.equal(restored[1].result?.verification?.attempts,2);assert.equal(restored[1].content,'Your checked answer.');
});
test('final response replay preserves canonical activity order through persisted restoration',()=>{
  const complete=Array.from({length:80},(_,index)=>({...steps[0],kind:'read:'+index,label:'Checked '+index}));
  let current:ReturnType<typeof mergeAssistantActivity>=[];
  for(const step of complete)current=mergeAssistantActivity(current,[step]);
  const final=finishAssistantActivity(mergeFinalAssistantActivity(current,complete));
  const restored=sanitizeAssistantMessages(sanitizeStoredConversation([{id:'a',role:'assistant',content:'Checked answer',phase:'complete',activity:final}]),true);
  assert.deepEqual(restored[0].activity?.slice(1).map(step=>step.kind),complete.slice(17).map(step=>step.kind));
  assert.equal(restored[0].activity?.length,64);
  assert.deepEqual(mergeFinalAssistantActivity(final,complete),final);
  assert.doesNotMatch(final[0].detail,/34 earlier/);
});
test('session storage keeps the same full trace and isolates account scopes',()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'window'),data=new Map<string,string>();
  Object.defineProperty(globalThis,'window',{configurable:true,value:{sessionStorage:{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)}}});
  try{
    saveAssistantConversation('own-account',messages());
    assert.equal(data.size,1);assert.deepEqual(readAssistantConversation('own-account')[1].activity,steps);
    assert.deepEqual(readAssistantConversation('other-account'),[]);assert.equal(data.size,0);
  }finally{if(old)Object.defineProperty(globalThis,'window',old);else Reflect.deleteProperty(globalThis,'window');}
});
test('the legitimate maximum correction length is preserved and execution payloads remain excluded',()=>{
  const input=messages(),answer='a'.repeat(8000);
  input[1].content=answer;input[1].result!.answer=answer;
  Object.assign(input[1].result!,{proposedAction:{payload:{secret:'PRIVATE'}},reasoning:'PRIVATE'});
  const stored=sanitizeStoredConversation(sanitizeAssistantMessages(input));
  assert.equal(stored[1].content,answer);assert.equal(stored[1].result.answer,answer);
  assert.equal(stored[1].actionExpired,true);assert.doesNotMatch(JSON.stringify(stored),/PRIVATE|proposedAction|reasoning/);
});
test('Unicode conversations fit the database byte limit while retaining complete recent turns',()=>{
  const input=Array.from({length:24},(_,index)=>({id:String(index),role:index%2?'assistant':'user',content:'課'.repeat(7000),...(index%2?{activity:steps}: {})}));
  const client=sanitizeAssistantMessages(input),server=sanitizeStoredConversation(client);
  assert.ok(Buffer.byteLength(JSON.stringify(server),'utf8')<=170000);
  assert.equal(server[0].role,'user');assert.equal(server.at(-1)?.id,'23');assert.deepEqual(server.at(-1)?.activity,steps);
});
test('server and client use the same complete-turn count limit',()=>{
  const input=Array.from({length:25},(_,index)=>({id:String(index),role:index%2?'assistant':'user',content:'small'}));
  assert.equal(sanitizeAssistantMessages(input)[0].id,'2');assert.equal(sanitizeStoredConversation(input)[0].id,'2');
  const observed=mergeAssistantActivity(steps,[{...steps[5],status:'running'}]);
  assert.equal(observed.length,40);assert.equal(observed[5].status,'running');
});

test('long emoji answers remain valid for PostgreSQL through browser, server and restoration',()=>{
  const input=messages(),answer='x'.repeat(7999)+'🙂';
  input[1].content=answer;input[1].result!.answer=answer;
  for(const sanitized of [sanitizeAssistantMessages(input),sanitizeStoredConversation(input)]){
    assert.equal(sanitized[1].content,'x'.repeat(7999));
    assert.equal(sanitized[1].result!.answer,'x'.repeat(7999));
    assert.equal(/[\ud800-\udfff]/u.test(sanitized[1].content),false);
  }
  const restored=sanitizeAssistantMessages(JSON.parse(JSON.stringify(sanitizeStoredConversation(sanitizeAssistantMessages(input)))),true);
  assert.equal(restored[1].content,'x'.repeat(7999));assert.equal(restored[1].result!.answer,'x'.repeat(7999));
});

test('all persisted free-text fields remove database-invalid Unicode while dropping executable and image data',()=>{
  const unsafe='a\u0000\ud800b\udc00🙂',safe='a\uFFFDb\uFFFD🙂';
  const input=[{id:unsafe,role:'user',content:unsafe,images:[{name:unsafe,dataUrl:'PRIVATE_IMAGE'}]},
    {id:unsafe,role:'assistant',content:unsafe,activity:[{kind:'read',label:'a\u0000b',detail:'c\u0000d',status:'complete'}],
      result:{answer:unsafe,status:'answered',citations:[{chunkId:unsafe,claim:unsafe,title:unsafe,sourceName:unsafe,url:'/'+unsafe,locator:unsafe,effectiveAt:unsafe,reviewedAt:unsafe}],
        suggestedQuestions:[unsafe],activity:[{kind:'read',label:'a\u0000b',detail:'c\u0000d',status:'complete'}],
        grounding:{source:unsafe,checkedAt:unsafe},verification:{status:'verified',attempts:1,reason:'PRIVATE_REASON'},
        views:[{id:unsafe,title:unsafe,url:'/'+unsafe,columns:[unsafe],rows:[[unsafe]],total:1,checkedAt:unsafe,note:unsafe}],
        proposedAction:{kind:'create_task',payload:{title:'PRIVATE_ACTION'}},reasoning:'PRIVATE_REASON'}}];
  const assertStoredStrings=(value:unknown):void=>{
    if(typeof value==='string'){
      assert.equal(value.includes('\u0000'),false);assert.equal(/[\ud800-\udfff]/u.test(value),false);
    }else if(Array.isArray(value))value.forEach(assertStoredStrings);
    else if(value&&typeof value==='object')Object.values(value).forEach(assertStoredStrings);
  };
  for(const sanitized of [sanitizeAssistantMessages(input),sanitizeStoredConversation(input),sanitizeStoredConversation(sanitizeAssistantMessages(input))]){
    assertStoredStrings(sanitized);assert.doesNotMatch(JSON.stringify(sanitized),/PRIVATE_|proposedAction|reasoning|dataUrl/);
    assert.equal(sanitized[0].id,safe);assert.equal(sanitized[0].content,safe);assert.equal(sanitized[0].images![0].name,safe);
    assert.equal(sanitized[1].result!.citations[0].url,'/'+safe);assert.equal(sanitized[1].result!.views![0].rows[0][0],safe);
    assert.equal(sanitized[1].activity![0].label,'ab');assert.equal(sanitized[1].activity![0].detail,'cd');
    assert.equal(sanitized[1].actionExpired,true);
  }
});

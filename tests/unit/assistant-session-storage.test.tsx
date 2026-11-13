import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
const loader=registerHooks({load(url,context,next){return /\/affairs\/authClient\.ts$/.test(url)
  ? {format:'module',source:'export const affairsClient=null;',shortCircuit:true}:next(url,context);}});
const {saveAssistantSessions,readAssistantSessions,remoteSession}=await import('../../src/services/assistantSessions');
loader.deregister();

test('multi-session storage budgets real UTF-8 bytes while preserving the active conversation',()=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),data=new Map<string,string>();
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)}});
  try{
    const chats=Array.from({length:20},(_,index)=>({id:String(index),title:'課程紀錄',version:1,updatedAt:'2026-11-13T00:00:00Z',
      messages:Array.from({length:6},(_,row)=>({id:String(row),role:row%2?'assistant' as const:'user' as const,content:'課'.repeat(7999)}))}));
    saveAssistantSessions('account:synthetic',{activeId:'19',chats});
    const stored=[...data.values()][0];assert.ok(Buffer.byteLength(stored,'utf8')<=900000);
    const restored=readAssistantSessions('account:synthetic');
    assert.equal(restored.activeId,'19');assert.ok(restored.chats.length<20);assert.ok(restored.chats.some(chat=>chat.id==='19'));
    assert.equal(restored.chats.find(chat=>chat.id==='19')?.messages.length,6);
    assert.equal(chats.length,20);assert.ok(readAssistantSessions('account:other').chats.every(chat=>chat.messages.length===0));
  }finally{if(prior)Object.defineProperty(globalThis,'sessionStorage',prior);else Reflect.deleteProperty(globalThis,'sessionStorage');}
});

test('restored conversation titles cannot contain database-invalid Unicode or split emoji',()=>{
  const row={id:'synthetic',title:'x'.repeat(99)+'🙂',messages:[],version:1,updated_at:'2026-11-13T00:00:00Z'};
  assert.equal(remoteSession(row).title,'x'.repeat(99));
  assert.equal(remoteSession({...row,title:'a\u0000\ud800b'}).title,'a\uFFFDb');
  assert.equal(remoteSession({...row,title:'\u0000'}).title,'New conversation');
  assert.equal(remoteSession(row).version,1);assert.equal(row.title.length,101);
});
